//! Stable identities are separate from expiring sessions. Recovery keys are random
//! 256-bit bearer credentials; only their SHA-256 digests are stored.
use crate::*;
use rusqlite::{Connection, OptionalExtension, params};

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS accounts(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('human','ai')),
        credential_hash TEXT UNIQUE, owner_id TEXT REFERENCES accounts(id), policy TEXT,
        created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS auth_limits(bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL);
        INSERT OR IGNORE INTO accounts(id,name,kind,created)
        SELECT user_id,name,'human',0 FROM sessions;")
}
fn random_key() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    format!("dbk_{}", hex::encode(bytes))
}
fn rate_limit(db: &Connection) -> ApiResult<()> {
    // A global bound also limits attempts from clients without cookies. No trust
    // is placed in spoofable proxy headers. Random keys resist offline guessing.
    db.execute("INSERT INTO auth_limits VALUES('accounts',?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END, window=excluded.window", [now()/60]).map_err(internal)?;
    let attempts: u32 = db
        .query_row(
            "SELECT attempts FROM auth_limits WHERE bucket='accounts'",
            [],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if attempts > 120 {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many account requests. Try again in a minute.".into(),
        ));
    }
    Ok(())
}
pub fn issue_session(
    db: &Connection,
    headers: &HeaderMap,
    id: &str,
    name: &str,
) -> ApiResult<String> {
    db.execute("DELETE FROM sessions WHERE expires<=?", [now()])
        .map_err(internal)?;
    if let Some(old) = cookie(headers, "drawing_board_session") {
        db.execute("DELETE FROM sessions WHERE token_hash=?", [digest(&old)])
            .map_err(internal)?;
    }
    // Bound active sessions for each account; keep the nine newest plus this one.
    db.execute("DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires DESC,rowid DESC LIMIT 9)", params![id,id]).map_err(internal)?;
    let token = random_key();
    db.execute(
        "INSERT INTO sessions VALUES(?,?,?,?,?)",
        params![digest(&token), id, name, false, now() + 86400],
    )
    .map_err(internal)?;
    Ok(token)
}
pub fn session_response(app: &App, token: &str, body: serde_json::Value) -> Response {
    let secure = if app.origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    ([(header::SET_COOKIE, format!("drawing_board_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400{secure}"))],Json(body)).into_response()
}
#[derive(Deserialize)]
pub struct Register {
    name: String,
    #[serde(default)]
    code: String,
}
pub async fn register(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Register>,
) -> ApiResult<Response> {
    let name = clean(&input.name, 32)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    rate_limit(&db)?;
    if !app.dev_auth {
        let expected = app
            .preview_code_hash
            .or(app.registration_code_hash)
            .ok_or(ApiError(
                StatusCode::FORBIDDEN,
                "Account enrollment is closed. Ask the host for access or use Nido.".into(),
            ))?;
        let supplied: [u8; 32] = Sha256::digest(input.code.as_bytes()).into();
        if !bool::from(expected.ct_eq(&supplied)) {
            return Err(ApiError(
                StatusCode::UNAUTHORIZED,
                "The enrollment code is incorrect.".into(),
            ));
        }
    }
    let key = random_key();
    let id = format!("human:{}", uuid::Uuid::new_v4());
    let tx = db.transaction().map_err(internal)?;
    tx.execute(
        "INSERT INTO accounts(id,name,kind,credential_hash,created) VALUES(?,?,'human',?,?)",
        params![id, name, digest(&key), now()],
    )
    .map_err(internal)?;
    let token = issue_session(&tx, &headers, &id, &name)?;
    tx.commit().map_err(internal)?;
    Ok(session_response(
        &app,
        &token,
        json!({"ok":true,"recovery_key":key}),
    ))
}
#[derive(Deserialize)]
pub struct KeyLogin {
    recovery_key: String,
}
pub async fn login(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<KeyLogin>,
) -> ApiResult<Response> {
    let mut db = app.store.0.lock().map_err(internal)?;
    rate_limit(&db)?;
    let account: Option<(String, String)> = db
        .query_row(
            "SELECT id,name FROM accounts WHERE credential_hash=? AND kind='human'",
            [digest(input.recovery_key.trim())],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(internal)?;
    let (id, name) = account.ok_or(ApiError(
        StatusCode::UNAUTHORIZED,
        "Recovery key not recognized.".into(),
    ))?;
    let tx = db.transaction().map_err(internal)?;
    let token = issue_session(&tx, &headers, &id, &name)?;
    tx.commit().map_err(internal)?;
    Ok(session_response(&app, &token, json!({"ok":true})))
}
pub async fn profile(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let (created, has_key): (u64, bool) = db
        .query_row(
            "SELECT created,credential_hash IS NOT NULL FROM accounts WHERE id=?",
            [&u.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(internal)?;
    let sessions: u64 = db
        .query_row(
            "SELECT count(*) FROM sessions WHERE user_id=? AND expires>?",
            params![u.id, now()],
            |r| r.get(0),
        )
        .map_err(internal)?;
    Ok(Json(
        json!({"id":u.id,"name":u.name,"development":u.development,"created":created,"has_recovery_key":has_key,"sessions":sessions}),
    ))
}
#[derive(Deserialize)]
pub struct Rename {
    name: String,
}
pub async fn rename(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Rename>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let name = clean(&input.name, 32)?;
    app.store
        .0
        .lock()
        .map_err(internal)?
        .execute("UPDATE accounts SET name=? WHERE id=?", params![name, u.id])
        .map_err(internal)?;
    Ok(Json(json!({"ok":true})))
}
pub async fn revoke_other_sessions(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let token = cookie(&headers, "drawing_board_session").unwrap_or_default();
    app.store
        .0
        .lock()
        .map_err(internal)?
        .execute(
            "DELETE FROM sessions WHERE user_id=? AND token_hash!=?",
            params![u.id, digest(&token)],
        )
        .map_err(internal)?;
    Ok(Json(json!({"ok":true})))
}
pub async fn rotate_key(State(app): State<App>, headers: HeaderMap) -> ApiResult<Response> {
    let u = user(&app, &headers)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    let key = random_key();
    let changed = tx.execute("UPDATE accounts SET credential_hash=? WHERE id=? AND credential_hash IS NOT NULL AND kind='human'",params![digest(&key),u.id]).map_err(internal)?;
    if changed != 1 {
        return Err(bad(
            "This account uses an external or temporary sign-in method.",
        ));
    }
    tx.execute("DELETE FROM sessions WHERE user_id=?", [&u.id])
        .map_err(internal)?;
    let token = issue_session(&tx, &headers, &u.id, &u.name)?;
    tx.commit().map_err(internal)?;
    Ok(session_response(
        &app,
        &token,
        json!({"ok":true,"recovery_key":key}),
    ))
}
