//! Browser-bound Nido message authentication against live testnet ownership.
pub use crate::nido_chain::Config;
use crate::*;
use axum::{extract::Query, response::Redirect};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};
use rusqlite::OptionalExtension;

pub fn load_config() -> Result<Config, Box<dyn std::error::Error>> {
    if std::env::var_os("NIDO_SIGNERS_FILE").is_some() {
        return Err(
            "NIDO_SIGNERS_FILE is retired. Remove it to use live Nido testnet verification.".into(),
        );
    }
    let enabled = match std::env::var("NIDO_AUTH").as_deref() {
        Ok("0") => false,
        Ok("1") | Err(_) => true,
        _ => return Err("NIDO_AUTH must be 0 or 1".into()),
    };
    Config::new(
        enabled,
        std::env::var("NIDO_RPC_URL")
            .unwrap_or_else(|_| "https://soroban-testnet.stellar.org".into()),
    )
}

pub fn migrate(db: &rusqlite::Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS nido_login_context(
        token_hash TEXT PRIMARY KEY REFERENCES login_challenges(token_hash) ON DELETE CASCADE,
        target TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS nido_sessions(
        token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
        public_key TEXT NOT NULL, checked_at INTEGER NOT NULL);",
    )
}

#[derive(Default, Deserialize)]
pub struct Start {
    return_to: Option<String>,
}
fn return_target(value: Option<&str>) -> String {
    let base = url::Url::parse("https://drawing-board.invalid").unwrap();
    if let Some(value) = value
        && let Ok(url) = base.join(value)
        && url.origin() == base.origin()
        && matches!(
            url.path(),
            "/" | "/lab/" | "/voidwright/" | "/galactic-reach/"
        )
    {
        return url[url::Position::BeforePath..].to_string();
    }
    "/#account".into()
}
fn state_cookie(app: &App, value: &str, age: u32) -> String {
    format!(
        "drawing_board_long_reach_nido={value}; HttpOnly; SameSite=Lax; Path=/api/auth/nido; Max-Age={age}{}",
        if app.origin.starts_with("https://") {
            "; Secure"
        } else {
            ""
        }
    )
}
fn url(base: &str, app: &App, pairs: &[(&str, &str)]) -> String {
    let mut url = url::Url::parse(base).expect("constant Nido URL");
    url.query_pairs_mut()
        .append_pair("dapp", &app.origin)
        .append_pair("return", &format!("{}/api/auth/nido/callback", app.origin));
    for (k, v) in pairs {
        url.query_pairs_mut().append_pair(k, v);
    }
    url.to_string()
}
pub async fn begin(
    State(app): State<App>,
    headers: HeaderMap,
    Query(start): Query<Start>,
) -> ApiResult<Response> {
    if !app.nido.enabled {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "Nido sign-in is disabled on this host.".into(),
        ));
    }
    let nonce =
        uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
    let db = app.store.0.lock().map_err(internal)?;
    accounts::rate_limit(&db)?;
    db.execute("DELETE FROM login_challenges WHERE expires<=?", [now()])
        .map_err(internal)?;
    if let Some(old) = cookie(&headers, "drawing_board_long_reach_nido") {
        db.execute(
            "DELETE FROM login_challenges WHERE token_hash=?",
            [digest(&old)],
        )
        .map_err(internal)?;
    }
    db.execute(
        "INSERT INTO login_challenges(token_hash,expires) VALUES(?,?)",
        rusqlite::params![digest(&nonce), now() + 300],
    )
    .map_err(internal)?;
    db.execute(
        "INSERT INTO nido_login_context VALUES(?,?)",
        rusqlite::params![digest(&nonce), return_target(start.return_to.as_deref())],
    )
    .map_err(internal)?;
    Ok((
        [(header::SET_COOKIE, state_cookie(&app, &nonce, 300))],
        Redirect::to(&url("https://nido.fyi/connect/", &app, &[])),
    )
        .into_response())
}
#[derive(Deserialize)]
pub struct Return {
    nido_address: Option<String>,
    nido_signed: Option<String>,
    kind: Option<String>,
    nido_sign: Option<String>,
    nido_connect: Option<String>,
}
async fn complete(
    State(app): State<App>,
    headers: HeaderMap,
    Query(input): Query<Return>,
) -> ApiResult<Response> {
    let nonce = cookie(&headers, "drawing_board_long_reach_nido")
        .ok_or(bad("Login expired. Return to the app and try again."))?;
    let hash = digest(&nonce);
    let (account, message, expires, target): (Option<String>, Option<String>, u64, String) = {
        let db = app.store.0.lock().map_err(internal)?;
        accounts::rate_limit(&db)?;
        db.query_row(
            "SELECT account,message,expires,coalesce(target,'/#account') FROM login_challenges LEFT JOIN nido_login_context USING(token_hash) WHERE token_hash=? AND expires>?",
            rusqlite::params![hash, now()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).map_err(|_| bad("Login expired. Please try signing in again."))?
    };
    if input.nido_sign.is_some() || input.nido_connect.is_some() {
        return Err(bad(
            "Nido sign-in was canceled. You can try again whenever you’re ready.",
        ));
    }
    if account.is_none() {
        let account = input.nido_address.as_deref().unwrap_or("").to_uppercase();
        stellar_strkey::Contract::from_string(&account)
            .map_err(|_| bad("Nido returned an invalid wallet address."))?;
        // Verify eligibility before asking the user for a passkey approval.
        app.nido.keys(&account).await?;
        let message = format!(
            "Sign in to Drawing Board\nOrigin: {}\nNetwork: Test SDF Network ; September 2015\nAccount: {}\nNonce: {}\nExpires: {}\nThis proves your identity only. No transaction or spending permission.",
            app.origin, account, nonce, expires
        );
        let db = app.store.0.lock().map_err(internal)?;
        let changed = db.execute("UPDATE login_challenges SET account=?,message=? WHERE token_hash=? AND account IS NULL AND expires>?",rusqlite::params![account,message,hash,now()]).map_err(internal)?;
        if changed != 1 {
            return Err(bad("Login changed or expired. Please start again."));
        }
        return Ok(Redirect::to(&url(
            &format!("https://{}.nido.fyi/sign/", account.to_lowercase()),
            &app,
            &[("kind", "message"), ("message", &message)],
        ))
        .into_response());
    }
    let account = account.unwrap();
    let message = message.ok_or(bad("Invalid login state."))?;
    if input.kind.as_deref() != Some("message") {
        return Err(bad("Expected a Nido message signature."));
    }
    if input
        .nido_address
        .as_ref()
        .is_some_and(|a| a.to_uppercase() != account)
    {
        return Err(bad(
            "The wallet changed during sign-in. Please start again.",
        ));
    }
    // Do not trust a key supplied by the wallet; re-read current authority after approval.
    let keys = app.nido.keys(&account).await?;
    let public_key = verify(
        &account,
        &message,
        input.nido_signed.as_deref().unwrap_or(""),
        &keys,
    )
    .map_err(|e| ApiError(StatusCode::UNAUTHORIZED, e))?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    // Consumption and session creation are atomic, preventing callback replay.
    let deleted = tx
        .execute(
            "DELETE FROM login_challenges WHERE token_hash=? AND expires>?",
            rusqlite::params![hash, now()],
        )
        .map_err(internal)?;
    if deleted != 1 {
        return Err(bad("Login challenge has already been used."));
    }
    tx.execute(
        "INSERT OR IGNORE INTO accounts(id,name,kind,created) VALUES(?,?,'human',?)",
        rusqlite::params![
            format!("nido:{account}"),
            format!("Pilot {}", &account[account.len().saturating_sub(6)..]),
            now()
        ],
    )
    .map_err(internal)?;
    let id = format!("nido:{account}");
    let name: String = tx
        .query_row("SELECT name FROM accounts WHERE id=?", [&id], |r| r.get(0))
        .map_err(internal)?;
    let token = accounts::issue_session(&tx, &headers, &id, &name)?;
    tx.execute(
        "INSERT INTO nido_sessions VALUES(?,?,?)",
        rusqlite::params![digest(&token), public_key, now()],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    let mut response = Redirect::to(&target).into_response();
    let session = accounts::session_response(&app, &token, json!({}));
    response.headers_mut().append(
        header::SET_COOKIE,
        session.headers()[header::SET_COOKIE].clone(),
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        state_cookie(&app, "", 0).parse().unwrap(),
    );
    Ok(response)
}
/// Always bring failures back to the account UI, never leave an opaque JSON page.
pub async fn callback(
    State(app): State<App>,
    headers: HeaderMap,
    input: Query<Return>,
) -> Response {
    match complete(State(app.clone()), headers.clone(), input).await {
        Ok(response) => response,
        Err(error) => {
            if let Some(nonce) = cookie(&headers, "drawing_board_long_reach_nido")
                && let Ok(db) = app.store.0.lock()
            {
                let _ = db.execute(
                    "DELETE FROM login_challenges WHERE token_hash=?",
                    [digest(&nonce)],
                );
            }
            let mut target = url::Url::parse(&app.origin).unwrap();
            target.set_path("/");
            target.query_pairs_mut().append_pair("nido_error", &error.1);
            target.set_fragment(Some("account"));
            (
                [(header::SET_COOKIE, state_cookie(&app, "", 0))],
                Redirect::to(target.as_str()),
            )
                .into_response()
        }
    }
}

/// Recheck active wallet sessions at most a minute after key revocation/recovery.
/// Network failures deny the request; they never extend a cached authorization.
pub async fn check_session(app: &App, headers: &HeaderMap) -> ApiResult<()> {
    let Some(token) = cookie(headers, "drawing_board_long_reach_session") else {
        return Ok(());
    };
    let hash = digest(&token);
    let row: Option<(String, Option<String>, Option<u64>)> = {
        let db = app.store.0.lock().map_err(internal)?;
        db.query_row("SELECT user_id,public_key,checked_at FROM sessions LEFT JOIN nido_sessions USING(token_hash) WHERE token_hash=? AND expires>? AND user_id LIKE 'nido:%'", rusqlite::params![hash,now()], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(internal)?
    };
    let Some((id, key, checked)) = row else {
        return Ok(());
    };
    if app.nido.enabled && key.is_some() && checked.is_some_and(|t| now().saturating_sub(t) < 60) {
        return Ok(());
    }
    let valid = if let Some(key) = key.filter(|_| app.nido.enabled) {
        match app.nido.keys(id.strip_prefix("nido:").unwrap()).await {
            Ok(keys) => keys.contains(&key),
            Err(e) if e.0 == StatusCode::SERVICE_UNAVAILABLE => return Err(e),
            Err(_) => false,
        }
    } else {
        false
    };
    let db = app.store.0.lock().map_err(internal)?;
    if valid {
        db.execute(
            "UPDATE nido_sessions SET checked_at=? WHERE token_hash=?",
            rusqlite::params![now(), hash],
        )
        .map_err(internal)?;
    } else {
        db.execute("DELETE FROM sessions WHERE token_hash=?", [hash])
            .map_err(internal)?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    r#type: String,
    public_key: String,
    authenticator_data: String,
    client_data: String,
    signature: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientData {
    r#type: String,
    challenge: String,
    origin: String,
    #[serde(default)]
    cross_origin: bool,
}
fn verify(account: &str, message: &str, encoded: &str, keys: &[String]) -> Result<String, String> {
    let fail = || "Nido signature verification failed.".to_string();
    if encoded.len() > 16000 {
        return Err(fail());
    }
    let envelope: Envelope =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(encoded).map_err(|_| fail())?)
            .map_err(|_| fail())?;
    let public = hex::decode(&envelope.public_key).map_err(|_| fail())?;
    if envelope.r#type != "nido-webauthn-assertion"
        || !keys
            .iter()
            .any(|k| hex::decode(k).ok().as_ref() == Some(&public))
    {
        return Err(fail());
    }
    let auth = hex::decode(envelope.authenticator_data).map_err(|_| fail())?;
    let client = hex::decode(envelope.client_data).map_err(|_| fail())?;
    let data: ClientData = serde_json::from_slice(&client).map_err(|_| fail())?;
    let rp = format!("{}.nido.fyi", account.to_lowercase());
    if data.r#type != "webauthn.get"
        || data.origin != format!("https://{rp}")
        || data.cross_origin
        || URL_SAFE_NO_PAD.decode(data.challenge).map_err(|_| fail())?
            != message_challenge(message).as_slice()
    {
        return Err(fail());
    }
    if auth.len() < 37
        || auth[..32] != Sha256::digest(rp).as_slice()[..]
        || auth[32] & 0x05 != 0x05
        || (auth[32] & 0x10 != 0 && auth[32] & 0x08 == 0)
    {
        return Err(fail());
    }
    let mut signed = auth;
    signed.extend_from_slice(&Sha256::digest(&client));
    let key = VerifyingKey::from_sec1_bytes(&public).map_err(|_| fail())?;
    let signature = Signature::from_slice(&hex::decode(envelope.signature).map_err(|_| fail())?)
        .map_err(|_| fail())?;
    key.verify(&signed, &signature).map_err(|_| fail())?;
    Ok(hex::encode(public))
}

fn message_challenge(message: &str) -> Vec<u8> {
    Sha256::digest(
        [
            b"Nido signed message (v1):\n".as_slice(),
            message.as_bytes(),
        ]
        .concat(),
    )
    .to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{SigningKey, signature::Signer};
    pub(super) fn assertion(message: &str, origin: &str, flags: u8) -> (String, String) {
        let key = SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
        let public = hex::encode(key.verifying_key().to_encoded_point(false).as_bytes());
        let client=serde_json::to_vec(&json!({"type":"webauthn.get","origin":origin,"challenge":URL_SAFE_NO_PAD.encode(message_challenge(message)),"crossOrigin":false})).unwrap();
        let mut auth =
            Sha256::digest(url::Url::parse(origin).unwrap().host_str().unwrap()).to_vec();
        auth.extend_from_slice(&[flags, 0, 0, 0, 0]);
        let mut signed = auth.clone();
        signed.extend_from_slice(&Sha256::digest(&client));
        let sig: Signature = key.sign(&signed);
        let envelope = json!({"type":"nido-webauthn-assertion","publicKey":public,"authenticatorData":hex::encode(auth),"clientData":hex::encode(client),"signature":hex::encode(sig.to_bytes())});
        (
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&envelope).unwrap()),
            public,
        )
    }
    #[test]
    fn verifies_trusted_nido_message() {
        let (e, k) = assertion("nonce", "https://ctest.nido.fyi", 5);
        assert!(verify("CTEST", "nonce", &e, &[k]).is_ok());
    }
    #[test]
    fn rejects_self_asserted_key() {
        let (e, _) = assertion("nonce", "https://ctest.nido.fyi", 5);
        assert!(verify("CTEST", "nonce", &e, &[]).is_err());
    }
    #[test]
    fn rejects_wrong_challenge_and_account() {
        let (e, k) = assertion("nonce", "https://ctest.nido.fyi", 5);
        assert!(verify("CTEST", "other", &e, std::slice::from_ref(&k)).is_err());
        assert!(verify("COTHER", "nonce", &e, &[k]).is_err());
    }
    #[test]
    fn requires_user_verification_and_exact_origin() {
        for (origin, flags) in [
            ("https://evil.example", 5),
            ("https://ctest.nido.fyi", 1),
            ("https://ctest.nido.fyi", 0x15),
        ] {
            let (e, k) = assertion("nonce", origin, flags);
            assert!(verify("CTEST", "nonce", &e, &[k]).is_err());
        }
    }
}

#[cfg(test)]
mod flow_tests {
    use super::*;
    use crate::nido_chain::tests::{account, mock};
    fn connect() -> Return {
        Return {
            nido_address: Some(account()),
            nido_signed: None,
            kind: None,
            nido_sign: None,
            nido_connect: None,
        }
    }
    async fn start(app: &App) -> HeaderMap {
        let response = begin(
            State(app.clone()),
            HeaderMap::new(),
            Query(Start {
                return_to: Some("/?game=galactic-reach#arena".into()),
            }),
        )
        .await
        .ok()
        .unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            response.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .split(';')
                .next()
                .unwrap()
                .parse()
                .unwrap(),
        );
        headers
    }
    async fn signed(app: &App, headers: &HeaderMap) -> Return {
        let response = complete(State(app.clone()), headers.clone(), Query(connect()))
            .await
            .ok()
            .unwrap();
        let location =
            url::Url::parse(response.headers()[header::LOCATION].to_str().unwrap()).unwrap();
        let message = location
            .query_pairs()
            .find(|(k, _)| k == "message")
            .unwrap()
            .1
            .to_string();
        assert!(message.contains(crate::nido_chain::NETWORK));
        let (proof, _) = super::tests::assertion(
            &message,
            &format!("https://{}.nido.fyi", account().to_lowercase()),
            5,
        );
        Return {
            nido_address: None,
            nido_signed: Some(proof),
            kind: Some("message".into()),
            nido_sign: None,
            nido_connect: None,
        }
    }
    fn app(config: Config) -> App {
        App {
            store: Arc::new(Store::open(":memory:").unwrap()),
            dev_auth: false,
            preview_code_hash: None,
            registration_code_hash: None,
            origin: "https://play.example".into(),
            nido: Arc::new(config),
        }
    }
    #[test]
    fn return_targets_cannot_leave_game_pages() {
        for url in [
            "https://evil.example/",
            "//evil.example/",
            "/api/auth/logout",
            "javascript:alert(1)",
            "/\\evil.example/",
        ] {
            assert_eq!(return_target(Some(url)), "/#account");
        }
        assert_eq!(
            return_target(Some("/voidwright/#table/123")),
            "/voidwright/#table/123"
        );
    }
    #[tokio::test]
    async fn login_is_browser_bound_single_use_persistent_and_revocable() {
        let (config, state, task) = mock().await;
        let app = app(config);
        let headers = start(&app).await;
        let proof = signed(&app, &headers).await;
        assert!(
            complete(
                State(app.clone()),
                HeaderMap::new(),
                Query(Return {
                    nido_signed: proof.nido_signed.clone(),
                    ..connect()
                })
            )
            .await
            .is_err()
        );
        let response = complete(State(app.clone()), headers.clone(), Query(proof))
            .await
            .ok()
            .unwrap();
        assert_eq!(
            response.headers()[header::LOCATION],
            "/?game=galactic-reach#arena"
        );
        let token_cookie = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .find(|h| {
                h.to_str()
                    .unwrap()
                    .starts_with("drawing_board_long_reach_session=")
            })
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        assert!(token_cookie.contains("Secure"));
        assert!(token_cookie.contains("HttpOnly"));
        let mut session_headers = HeaderMap::new();
        session_headers.insert(
            header::COOKIE,
            token_cookie.split(';').next().unwrap().parse().unwrap(),
        );
        let id = user(&app, &session_headers).ok().unwrap().id;
        assert_eq!(id, format!("nido:{}", account()));
        assert!(
            complete(State(app.clone()), headers, Query(connect()))
                .await
                .is_err()
        );
        app.store
            .0
            .lock()
            .unwrap()
            .execute("UPDATE accounts SET name='Renamed pilot' WHERE id=?", [&id])
            .unwrap();
        let headers = start(&app).await;
        let proof = signed(&app, &headers).await;
        complete(State(app.clone()), headers, Query(proof))
            .await
            .ok()
            .unwrap();
        let count: i32 = app
            .store
            .0
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM accounts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(
            user(&app, &session_headers).ok().unwrap().name,
            "Renamed pilot"
        );
        let calls = state.lock().unwrap().calls;
        check_session(&app, &session_headers).await.ok().unwrap();
        assert_eq!(state.lock().unwrap().calls, calls);
        app.store
            .0
            .lock()
            .unwrap()
            .execute("UPDATE nido_sessions SET checked_at=0", [])
            .unwrap();
        state.lock().unwrap().offline = true;
        assert!(check_session(&app, &session_headers).await.is_err());
        state.lock().unwrap().offline = false;
        state.lock().unwrap().configuration = json!({"latestLedger":100,"error":"revoked"});
        check_session(&app, &session_headers).await.ok().unwrap();
        assert!(user(&app, &session_headers).is_err());
        task.abort();
    }
    #[tokio::test]
    async fn expired_canceled_and_invalid_callbacks_return_to_account() {
        let (config, _state, task) = mock().await;
        let app = app(config);
        for mode in ["missing", "expired", "canceled", "invalid"] {
            let mut headers = start(&app).await;
            let mut input = connect();
            match mode {
                "missing" => headers = HeaderMap::new(),
                "expired" => {
                    app.store
                        .0
                        .lock()
                        .unwrap()
                        .execute("UPDATE login_challenges SET expires=0", [])
                        .unwrap();
                }
                "canceled" => input.nido_connect = Some("cancelled".into()),
                _ => input.nido_address = Some("https://evil.example".into()),
            }
            let response = callback(State(app.clone()), headers, Query(input)).await;
            assert_eq!(response.status(), StatusCode::SEE_OTHER);
            let target = response.headers()[header::LOCATION].to_str().unwrap();
            assert!(target.starts_with("https://play.example/?nido_error="));
            assert!(target.ends_with("#account"));
            assert!(
                response.headers()[header::SET_COOKIE]
                    .to_str()
                    .unwrap()
                    .contains("Max-Age=0")
            );
        }
        task.abort();
    }
}
