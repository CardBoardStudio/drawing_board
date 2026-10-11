//! Nido's message-signing handoff, with explicit trust anchors for private playtests.
//! A wallet-supplied public key is NEVER an identity authority.
use crate::*;
use axum::{extract::Query, response::Redirect};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};
use std::collections::BTreeMap;

pub type TrustedSigners = BTreeMap<String, Vec<String>>;
pub fn load_config() -> Result<TrustedSigners, Box<dyn std::error::Error>> {
    let Ok(path) = std::env::var("NIDO_SIGNERS_FILE") else {
        return Ok(BTreeMap::new());
    };
    let config: TrustedSigners = serde_json::from_str(&std::fs::read_to_string(path)?)?;
    for (account, keys) in &config {
        stellar_strkey::Contract::from_string(account)
            .map_err(|_| "Invalid Nido contract address in signer configuration")?;
        if keys.is_empty() {
            return Err("A trusted Nido account must have a public key".into());
        }
        for key in keys {
            VerifyingKey::from_sec1_bytes(&hex::decode(key)?)
                .map_err(|_| "Invalid P-256 public key in Nido signer configuration")?;
        }
    }
    Ok(config)
}
fn state_cookie(app: &App, value: &str, age: u32) -> String {
    format!(
        "drawing_board_nido={value}; HttpOnly; SameSite=Lax; Path=/api/auth/nido; Max-Age={age}{}",
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
pub async fn begin(State(app): State<App>, headers: HeaderMap) -> ApiResult<Response> {
    if app.nido.is_empty() {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "Nido sign-in requires the host to configure trusted account keys.".into(),
        ));
    }
    let nonce =
        uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
    let db = app.store.0.lock().map_err(internal)?;
    db.execute("DELETE FROM login_challenges WHERE expires<=?", [now()])
        .map_err(internal)?;
    if let Some(old) = cookie(&headers, "drawing_board_nido") {
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
pub async fn callback(
    State(app): State<App>,
    headers: HeaderMap,
    Query(input): Query<Return>,
) -> ApiResult<Response> {
    let nonce = cookie(&headers, "drawing_board_nido")
        .ok_or(bad("Login expired. Return to the app and try again."))?;
    let hash = digest(&nonce);
    let mut db = app.store.0.lock().map_err(internal)?;
    let (account, message, expires): (Option<String>, Option<String>, u64) = db
        .query_row(
            "SELECT account,message,expires FROM login_challenges WHERE token_hash=? AND expires>?",
            rusqlite::params![hash, now()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| bad("Login expired. Return to the app and try again."))?;
    if input.nido_sign.is_some() || input.nido_connect.is_some() {
        db.execute("DELETE FROM login_challenges WHERE token_hash=?", [&hash])
            .map_err(internal)?;
        return Ok((
            [(header::SET_COOKIE, state_cookie(&app, "", 0))],
            Redirect::to("/"),
        )
            .into_response());
    }
    if account.is_none() {
        let account = input.nido_address.as_deref().unwrap_or("").to_uppercase();
        if !app.nido.contains_key(&account) {
            return Err(ApiError(StatusCode::FORBIDDEN,"This Nido account is not enrolled in this private playtest. Ask the host to enroll its verified public key.".into()));
        }
        let message = format!(
            "Sign in to Drawing Board\nOrigin: {}\nAccount: {}\nNonce: {}\nExpires: {}\nThis proves your identity only. No transaction or spending permission.",
            app.origin, account, nonce, expires
        );
        db.execute("UPDATE login_challenges SET account=?,message=? WHERE token_hash=? AND account IS NULL",rusqlite::params![account,message,hash]).map_err(internal)?;
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
    let keys = app.nido.get(&account).ok_or(ApiError(
        StatusCode::FORBIDDEN,
        "Account enrollment was removed.".into(),
    ))?;
    verify(
        &account,
        &message,
        input.nido_signed.as_deref().unwrap_or(""),
        keys,
    )
    .map_err(|e| ApiError(StatusCode::UNAUTHORIZED, e))?;
    let token =
        uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
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
    if let Some(old) = cookie(&headers, "drawing_board_session") {
        tx.execute("DELETE FROM sessions WHERE token_hash=?", [digest(&old)])
            .map_err(internal)?;
    }
    tx.execute(
        "INSERT INTO sessions VALUES(?,?,?,?,?)",
        rusqlite::params![
            digest(&token),
            format!("nido:{account}"),
            format!("Pilot {}", &account[account.len().saturating_sub(6)..]),
            false,
            now() + 86400
        ],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    let mut response = Redirect::to("/").into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        format!(
            "drawing_board_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400{}",
            if app.origin.starts_with("https://") {
                "; Secure"
            } else {
                ""
            }
        )
        .parse()
        .unwrap(),
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        state_cookie(&app, "", 0).parse().unwrap(),
    );
    Ok(response)
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
fn verify(account: &str, message: &str, encoded: &str, keys: &[String]) -> Result<(), String> {
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
            != Sha256::digest(message).as_slice()
    {
        return Err(fail());
    }
    if auth.len() < 37 || auth[..32] != Sha256::digest(rp).as_slice()[..] || auth[32] & 0x05 != 0x05
    {
        return Err(fail());
    }
    let mut signed = auth;
    signed.extend_from_slice(&Sha256::digest(&client));
    let key = VerifyingKey::from_sec1_bytes(&public).map_err(|_| fail())?;
    let signature = Signature::from_slice(&hex::decode(envelope.signature).map_err(|_| fail())?)
        .map_err(|_| fail())?;
    key.verify(&signed, &signature).map_err(|_| fail())
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{SigningKey, signature::Signer};
    fn assertion(message: &str, origin: &str, flags: u8) -> (String, String) {
        let key = SigningKey::from_bytes((&[7u8; 32]).into()).unwrap();
        let public = hex::encode(key.verifying_key().to_encoded_point(false).as_bytes());
        let client=serde_json::to_vec(&json!({"type":"webauthn.get","origin":origin,"challenge":URL_SAFE_NO_PAD.encode(Sha256::digest(message)),"crossOrigin":false})).unwrap();
        let mut auth = Sha256::digest("ctest.nido.fyi").to_vec();
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
        for (origin, flags) in [("https://evil.example", 5), ("https://ctest.nido.fyi", 1)] {
            let (e, k) = assertion("nonce", origin, flags);
            assert!(verify("CTEST", "nonce", &e, &[k]).is_err());
        }
    }
    #[tokio::test]
    async fn callback_is_browser_bound_and_single_use() {
        let (_, key) = assertion("unused", "https://ctest.nido.fyi", 5);
        let app = App {
            store: Arc::new(Store::open(":memory:").unwrap()),
            dev_auth: false,
            preview_code_hash: None,
            origin: "http://127.0.0.1:3000".into(),
            nido: Arc::new(BTreeMap::from([("CTEST".into(), vec![key])])),
        };
        let started = begin(State(app.clone()), HeaderMap::new())
            .await
            .ok()
            .unwrap();
        let state_cookie = started.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, state_cookie.parse().unwrap());
        let connect = Return {
            nido_address: Some("CTEST".into()),
            nido_signed: None,
            kind: None,
            nido_sign: None,
            nido_connect: None,
        };
        let redirect = callback(State(app.clone()), headers.clone(), Query(connect))
            .await
            .ok()
            .unwrap();
        let location =
            url::Url::parse(redirect.headers()[header::LOCATION].to_str().unwrap()).unwrap();
        assert_eq!(location.host_str(), Some("ctest.nido.fyi"));
        let message = location
            .query_pairs()
            .find(|(k, _)| k == "message")
            .unwrap()
            .1
            .to_string();
        let (envelope, _) = assertion(&message, "https://ctest.nido.fyi", 5);
        let signed = || Return {
            nido_address: None,
            nido_signed: Some(envelope.clone()),
            kind: Some("message".into()),
            nido_sign: None,
            nido_connect: None,
        };
        assert!(
            callback(State(app.clone()), HeaderMap::new(), Query(signed()))
                .await
                .is_err()
        );
        let result = callback(State(app.clone()), headers.clone(), Query(signed()))
            .await
            .ok()
            .unwrap();
        assert_eq!(result.status(), StatusCode::SEE_OTHER);
        assert!(
            result
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .any(|h| h.to_str().unwrap().starts_with("drawing_board_session="))
        );
        assert!(
            callback(State(app.clone()), headers, Query(signed()))
                .await
                .is_err()
        );
        let count: u32 = app
            .store
            .0
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
