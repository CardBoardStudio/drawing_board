//! Host-issued admin bootstrap and administrator-managed enrollment invitations.
use crate::*;
use rusqlite::{Connection, OptionalExtension, params};

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS account_roles(
        account_id TEXT PRIMARY KEY REFERENCES accounts(id), role TEXT NOT NULL CHECK(role='admin'));
        CREATE TABLE IF NOT EXISTS invitations(
        id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('member','admin')), created_by TEXT REFERENCES accounts(id),
        created INTEGER NOT NULL, expires INTEGER NOT NULL, max_uses INTEGER NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS invitation_claims(
        invitation_id TEXT NOT NULL REFERENCES invitations(id), account_id TEXT NOT NULL REFERENCES accounts(id),
        claimed INTEGER NOT NULL, PRIMARY KEY(invitation_id,account_id));")
}
pub fn is_admin(db: &Connection, id: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM account_roles WHERE account_id=? AND role='admin')",
        [id],
        |r| r.get(0),
    )
    .map_err(internal)
}
fn admin(app: &App, headers: &HeaderMap) -> ApiResult<User> {
    let u = user(app, headers)?;
    if u.development || !is_admin(&*app.store.0.lock().map_err(internal)?, &u.id)? {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Administrator access is required.".into(),
        ));
    }
    Ok(u)
}
fn insert(
    db: &Connection,
    origin: &str,
    label: &str,
    role: &str,
    owner: Option<&str>,
    days: u64,
    max_uses: u32,
) -> ApiResult<serde_json::Value> {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    let id = uuid::Uuid::new_v4().simple().to_string();
    let expires = now() + days * 86400;
    db.execute("INSERT INTO invitations(id,token_hash,label,role,created_by,created,expires,max_uses) VALUES(?,?,?,?,?,?,?,?)",params![id,digest(&token),label,role,owner,now(),expires,max_uses]).map_err(internal)?;
    Ok(json!({"id":id,"url":format!("{origin}/#invite/{token}"),"expires":expires}))
}
/// Run only through the host CLI; possession of an enrollment code cannot grant admin.
pub fn bootstrap(app: &App) -> ApiResult<serde_json::Value> {
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    let count: u32 = tx
        .query_row("SELECT count(*) FROM account_roles", [], |r| r.get(0))
        .map_err(internal)?;
    if count != 0 {
        return Err(bad("An administrator already exists. Bootstrap is closed."));
    }
    tx.execute("UPDATE invitations SET revoked=1 WHERE role='admin'", [])
        .map_err(internal)?;
    let result = insert(
        &tx,
        &app.origin,
        "Set up the first administrator",
        "admin",
        None,
        1,
        1,
    )?;
    tx.commit().map_err(internal)?;
    Ok(result)
}
#[derive(Deserialize)]
pub struct Create {
    label: String,
    #[serde(default = "seven")]
    days: u64,
    #[serde(default = "one")]
    max_uses: u32,
}
fn seven() -> u64 {
    7
}
fn one() -> u32 {
    1
}
pub async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Create>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = admin(&app, &headers)?;
    let label = clean(&input.label, 80)?;
    if !(1..=30).contains(&input.days) || !(1..=20).contains(&input.max_uses) {
        return Err(bad("Invites last 1–30 days and allow 1–20 people."));
    }
    let db = app.store.0.lock().map_err(internal)?;
    accounts::rate_limit(&db)?;
    Ok(Json(insert(
        &db,
        &app.origin,
        &label,
        "member",
        Some(&u.id),
        input.days,
        input.max_uses,
    )?))
}
pub async fn list(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    admin(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut query=db.prepare("SELECT i.id,i.label,i.expires,i.max_uses,i.uses,i.revoked,coalesce(a.name,'Host'),i.created FROM invitations i LEFT JOIN accounts a ON a.id=i.created_by WHERE i.role='member' ORDER BY i.created DESC,i.rowid DESC LIMIT 100").map_err(internal)?;
    let entries=query.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"label":r.get::<_,String>(1)?,"expires":r.get::<_,u64>(2)?,"max_uses":r.get::<_,u32>(3)?,"uses":r.get::<_,u32>(4)?,"revoked":r.get::<_,bool>(5)?,"created_by":r.get::<_,String>(6)?,"created":r.get::<_,u64>(7)?}))).map_err(internal)?.collect::<Result<Vec<_>,_>>().map_err(internal)?;
    Ok(Json(json!({"invitations":entries})))
}
pub async fn revoke(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    admin(&app, &headers)?;
    let count = app
        .store
        .0
        .lock()
        .map_err(internal)?
        .execute(
            "UPDATE invitations SET revoked=1 WHERE id=? AND role='member'",
            [id],
        )
        .map_err(internal)?;
    if count != 1 {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Invitation not found.".into(),
        ));
    }
    Ok(Json(json!({"ok":true})))
}
#[derive(Deserialize)]
pub struct Token {
    token: String,
}
fn valid(db: &Connection, token: &str) -> ApiResult<(String, String, String, u64)> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(bad("This invitation is invalid."));
    }
    db.query_row("SELECT id,label,role,expires FROM invitations WHERE token_hash=? AND revoked=0 AND expires>? AND uses<max_uses",params![digest(token),now()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(internal)?.ok_or(bad("This invitation has expired, was revoked, or has already been used. Ask the host for a new link."))
}
pub async fn inspect(
    State(app): State<App>,
    Json(input): Json<Token>,
) -> ApiResult<Json<serde_json::Value>> {
    let db = app.store.0.lock().map_err(internal)?;
    accounts::rate_limit(&db)?;
    let (_, label, role, expires) = valid(&db, &input.token)?;
    Ok(Json(json!({"label":label,"role":role,"expires":expires})))
}
/// Caller must hold a transaction covering both account creation and redemption.
pub fn redeem(db: &Connection, token: &str, id: &str) -> ApiResult<()> {
    // A successful retry by the same identity is harmless, even after last use.
    let claimed:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM invitation_claims c JOIN invitations i ON i.id=c.invitation_id WHERE i.token_hash=? AND c.account_id=?)",params![digest(token),id],|r|r.get(0)).map_err(internal)?;
    if claimed {
        return Ok(());
    }
    let (invitation, _, role, _) = valid(db, token)?;
    if role == "admin" {
        let count: u32 = db
            .query_row("SELECT count(*) FROM account_roles", [], |r| r.get(0))
            .map_err(internal)?;
        if count != 0 {
            return Err(bad("Administrator setup has already been completed."));
        }
        db.execute("INSERT INTO account_roles VALUES(?,'admin')", [id])
            .map_err(internal)?;
    }
    db.execute(
        "UPDATE invitations SET uses=uses+1 WHERE id=?",
        [&invitation],
    )
    .map_err(internal)?;
    db.execute(
        "INSERT INTO invitation_claims VALUES(?,?,?)",
        params![invitation, id, now()],
    )
    .map_err(internal)?;
    Ok(())
}
pub async fn accept(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Token>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    if u.development {
        return Err(bad("Use a persistent account to accept an invitation."));
    }
    let mut db = app.store.0.lock().map_err(internal)?;
    accounts::rate_limit(&db)?;
    let tx = db.transaction().map_err(internal)?;
    redeem(&tx, &input.token, &u.id)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"ok":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{app, call};
    fn cookie(h: &HeaderMap) -> String {
        h[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .into()
    }
    fn token(invite: &serde_json::Value) -> &str {
        invite["url"].as_str().unwrap().rsplit('/').next().unwrap()
    }
    async fn host(a: &App) -> String {
        let invite = bootstrap(a).unwrap();
        let (s, h, _) = call(
            a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"Host","invite_token":token(&invite)}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        cookie(&h)
    }
    #[tokio::test]
    async fn host_bootstrap_and_member_invites_enforce_roles_and_uses() {
        let a = app(false);
        let old = bootstrap(&a).unwrap();
        let host = host(&a).await;
        assert!(bootstrap(&a).is_err());
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/inspect",
                "",
                json!({"token":token(&old)})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call(&a, "GET", "/api/account", &host, json!({})).await.2["is_admin"],
            true
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/accounts/register",
                "",
                json!({"name":"No invite"})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(&a, "GET", "/api/admin/invites", "", json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
        let (s, _, invite) = call(
            &a,
            "POST",
            "/api/admin/invites",
            &host,
            json!({"label":"One player","role":"admin"}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/inspect",
                "",
                json!({"token":token(&invite)})
            )
            .await
            .2["role"],
            "member"
        );
        let (s, h, key) = call(
            &a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"Player","invite_token":token(&invite)}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        let member = cookie(&h);
        assert_eq!(
            call(&a, "GET", "/api/account", &member, json!({})).await.2["is_admin"],
            false
        );
        assert_eq!(
            call(&a, "GET", "/api/admin/invites", &member, json!({}))
                .await
                .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/admin/invites",
                &member,
                json!({"label":"Nope"})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &member,
                json!({"token":token(&invite)})
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/accounts/register",
                "",
                json!({"name":"Too late","invite_token":token(&invite)})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        let (_, _, list) = call(&a, "GET", "/api/admin/invites", &host, json!({})).await;
        assert_eq!(list["invitations"][0]["uses"], 1);
        assert!(!list.to_string().contains(token(&invite)));
        assert_eq!(
            a.store
                .0
                .lock()
                .unwrap()
                .query_row(
                    "SELECT count(*) FROM accounts WHERE kind='human'",
                    [],
                    |r| r.get::<_, u32>(0)
                )
                .unwrap(),
            2
        );
        // Revoking an exhausted invitation does not revoke the member's account.
        let path = format!(
            "/api/admin/invites/{}/revoke",
            invite["id"].as_str().unwrap()
        );
        assert_eq!(
            call(&a, "POST", &path, &member, json!({})).await.0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(&a, "POST", &path, &host, json!({})).await.0,
            StatusCode::OK
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/accounts/login",
                "",
                json!({"recovery_key":key["recovery_key"]})
            )
            .await
            .0,
            StatusCode::OK
        );
    }
    #[tokio::test]
    async fn expired_revoked_and_parallel_invites_cannot_over_enroll() {
        let a = app(false);
        let host = host(&a).await;
        for expired in [false, true] {
            let (_, _, i) = call(
                &a,
                "POST",
                "/api/admin/invites",
                &host,
                json!({"label":"Unavailable"}),
            )
            .await;
            a.store
                .0
                .lock()
                .unwrap()
                .execute(
                    if expired {
                        "UPDATE invitations SET expires=0 WHERE id=?"
                    } else {
                        "UPDATE invitations SET revoked=1 WHERE id=?"
                    },
                    [i["id"].as_str().unwrap()],
                )
                .unwrap();
            assert_eq!(
                call(
                    &a,
                    "POST",
                    "/api/accounts/register",
                    "",
                    json!({"name":"Blocked","invite_token":token(&i)})
                )
                .await
                .0,
                StatusCode::BAD_REQUEST
            );
        }
        let (_, _, i) = call(
            &a,
            "POST",
            "/api/admin/invites",
            &host,
            json!({"label":"Last seat"}),
        )
        .await;
        let body = json!({"name":"Concurrent","invite_token":token(&i)});
        let (left, right) = tokio::join!(
            call(&a, "POST", "/api/accounts/register", "", body.clone()),
            call(&a, "POST", "/api/accounts/register", "", body)
        );
        assert_eq!(
            [left.0, right.0]
                .iter()
                .filter(|s| **s == StatusCode::OK)
                .count(),
            1
        );
        assert_eq!(
            a.store
                .0
                .lock()
                .unwrap()
                .query_row("SELECT count(*) FROM accounts", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            2
        );
    }
    #[tokio::test]
    async fn existing_persistent_account_can_claim_bootstrap_but_temporary_cannot() {
        let a = app(true);
        let setup = bootstrap(&a).unwrap();
        let (_, h, _) = call(&a, "POST", "/api/auth/dev", "", json!({"name":"Temporary"})).await;
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &cookie(&h),
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        let (_, h, key) = call(
            &a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"Persistent"}),
        )
        .await;
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/invites/accept",
                &cookie(&h),
                json!({"token":token(&setup)})
            )
            .await
            .0,
            StatusCode::OK
        );
        let (_, h, _) = call(
            &a,
            "POST",
            "/api/accounts/login",
            "",
            json!({"recovery_key":key["recovery_key"]}),
        )
        .await;
        assert_eq!(
            call(&a, "GET", "/api/account", &cookie(&h), json!({}))
                .await
                .2["is_admin"],
            true
        );
    }
}
