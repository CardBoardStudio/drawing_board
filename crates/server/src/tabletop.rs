//! Table-scoped device capabilities. These never create ordinary account sessions
//! or change membership. A host delegates only the role named by the capability.
mod phones;
use crate::*;
use axum::response::{
    Html,
    sse::{Event, KeepAlive, Sse},
};
pub use phones::*;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

const LINK_LIFETIME: u64 = 24 * 60 * 60;
const SESSION_LIFETIME: u64 = 30 * 24 * 60 * 60;

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS tabletop_grants(
        token_hash TEXT PRIMARY KEY, table_id TEXT NOT NULL, role TEXT NOT NULL,
        participant TEXT, kind TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS tabletop_grants_table ON tabletop_grants(table_id,role);",
    )?;
    phones::migrate(db)
}

fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
fn cookie_name(id: &str) -> String {
    format!("drawing_board_tabletop_{id}")
}
fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit())
}
fn refused() -> ApiError {
    ApiError(
        StatusCode::UNAUTHORIZED,
        "This device link expired or was revoked. Ask the host to pair it again.".into(),
    )
}
fn host(app: &App, headers: &HeaderMap, id: &str) -> ApiResult<()> {
    let owner = user(app, headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let allowed: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM solo_tables WHERE id=? AND owner_id=?)",
            params![id, owner.id],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if !allowed {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Only the host can pair or revoke devices.".into(),
        ));
    }
    Ok(())
}
fn grant(app: &App, id: &str, role: &str, participant: Option<&str>) -> ApiResult<String> {
    let secret = token();
    app.store.0.lock().map_err(internal)?.execute(
        "INSERT INTO tabletop_grants(token_hash,table_id,role,participant,kind,expires) VALUES(?,?,?,?,'link',?)",
        params![digest(&secret), id, role, participant, now()+LINK_LIFETIME]).map_err(internal)?;
    Ok(secret)
}
fn principal(app: &App, headers: &HeaderMap, id: &str, role: &str) -> ApiResult<Option<String>> {
    if !valid_id(id) {
        return Err(refused());
    }
    let secret = cookie(headers, &cookie_name(id)).ok_or_else(refused)?;
    let row = app.store.0.lock().map_err(internal)?.query_row(
        "SELECT participant FROM tabletop_grants WHERE token_hash=? AND table_id=? AND role=? AND kind='session' AND expires>?",
        params![digest(&secret), id, role, now()], |r| r.get::<_,Option<String>>(0)).optional().map_err(internal)?;
    row.ok_or_else(refused)
}
/// Exact bootstrap assets and capability-authenticated endpoints bypass the
/// ordinary invite gate. Every API here performs its own role/table check.
/// Host operations remain under the ordinary membership gate.
pub fn delegated_path(path: &str) -> bool {
    if matches!(
        path,
        "/tabletop/board.html"
            | "/tabletop/board.js"
            | "/tabletop/board.css"
            | "/tabletop/phone.html"
            | "/tabletop/pairing.js"
    ) {
        return true;
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() < 5 || parts[1] != "api" || parts[2] != "tabletop" || !valid_id(parts[3]) {
        return false;
    }
    (parts.len() == 5
        && matches!(
            parts[4],
            "redeem"
                | "board"
                | "focus"
                | "stream"
                | "join"
                | "seat"
                | "act"
                | "undo"
                | "report"
                | "player-stream"
        ))
        || (parts.len() >= 6 && parts[4] == "client")
}

pub async fn issue_board(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    // Refuse before minting a link if the pinned engine has no public projection.
    app.shared.public_view(&id).await?;
    let secret = grant(&app, &id, "board", None)?;
    Ok(Json(
        json!({"url":format!("/tabletop/board.html?table={id}#pair={secret}"),"expires_in":LINK_LIFETIME}),
    ))
}
pub async fn revoke_board(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    app.store
        .0
        .lock()
        .map_err(internal)?
        .execute(
            "DELETE FROM tabletop_grants WHERE table_id=? AND role='board'",
            [&id],
        )
        .map_err(internal)?;
    Ok(Json(json!({"ok":true})))
}
#[derive(Deserialize)]
pub struct Redeem {
    token: String,
}
pub async fn redeem(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(input): Json<Redeem>,
) -> ApiResult<Response> {
    if !valid_id(&id) || input.token.len() != 64 {
        return Err(refused());
    }
    let secret = token();
    let role = {
        let mut db = app.store.0.lock().map_err(internal)?;
        accounts::rate_limit(&db)?;
        let tx = db.transaction().map_err(internal)?;
        let (role, participant): (String, Option<String>) = tx.query_row(
            "SELECT role,participant FROM tabletop_grants WHERE token_hash=? AND table_id=? AND kind='link' AND expires>?",
            params![digest(&input.token),id,now()], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(internal)?.ok_or_else(refused)?;
        tx.execute(
            "DELETE FROM tabletop_grants WHERE token_hash=?",
            [digest(&input.token)],
        )
        .map_err(internal)?;
        tx.execute("INSERT INTO tabletop_grants(token_hash,table_id,role,participant,kind,expires) VALUES(?,?,?,?,'session',?)",
            params![digest(&secret),id,role,participant,now()+SESSION_LIFETIME]).map_err(internal)?;
        tx.commit().map_err(internal)?;
        role
    };
    let secure = if app.origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    let value = format!(
        "{}={secret}; Path=/api/tabletop/{id}/; HttpOnly; SameSite=Strict; Max-Age={SESSION_LIFETIME}{secure}",
        cookie_name(&id)
    );
    Ok(([(header::SET_COOKIE, value)], Json(json!({"role":role}))).into_response())
}
pub async fn board(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    principal(&app, &headers, &id, "board")?;
    Ok(Json(app.shared.public_view(&id).await?))
}
pub async fn stream(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    principal(&app, &headers, &id, "board")?;
    let changes = app.shared.subscribe();
    let closing = app.shared.shutdown_subscription();
    let first = app.shared.public_view(&id).await?;
    let events = futures_util::stream::unfold(
        (Some(first), app, headers, id, changes, closing),
        |(first, app, headers, id, mut changes, mut closing)| async move {
            let view = if let Some(view) = first {
                view
            } else {
                let deadline = tokio::time::sleep(app.shared.ping_every());
                tokio::pin!(deadline);
                loop {
                    if *closing.borrow() {
                        return None;
                    }
                    tokio::select! {
                        _ = closing.changed() => return None,
                        _ = &mut deadline => break,
                        message = changes.recv() => match message {
                            Ok((table,_)) if table == id => break,
                            Ok(_) => continue,
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => break,
                            Err(_) => return None,
                        }
                    }
                }
                // Revalidate on every refresh, including quiet heartbeats.
                if principal(&app, &headers, &id, "board").is_err() {
                    return None;
                }
                app.shared.public_view(&id).await.ok()?
            };
            let event = Event::default().event("view").data(view.to_string());
            Some((
                Ok::<_, std::convert::Infallible>(event),
                (None, app, headers, id, changes, closing),
            ))
        },
    );
    let mut response = Sse::new(events)
        .keep_alive(KeepAlive::default())
        .into_response();
    response
        .headers_mut()
        .insert("x-accel-buffering", "no".parse().unwrap());
    Ok(response)
}
pub async fn board_page() -> Html<&'static str> {
    Html(include_str!("../../../prototypes/tabletop/board.html"))
}
pub async fn board_script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../../prototypes/tabletop/board.js"),
    )
}
pub async fn board_style() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../../../prototypes/tabletop/board.css"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::call;
    const ID: &str = "11111111111111111111111111111111";
    const OTHER: &str = "22222222222222222222222222222222";

    async fn setup() -> (App, String) {
        let app = crate::tests::app(true);
        let cookie = {
            let db = app.store.0.lock().unwrap();
            for name in ["host", "friend"] {
                db.execute(
                    "INSERT INTO accounts(id,name,kind,created) VALUES(?,?,'human',0)",
                    [name, name],
                )
                .unwrap();
            }
            db.execute("INSERT INTO solo_tables(id,owner_id,name,created,updated) VALUES(?,'host','Table',0,0)",[ID]).unwrap();
            let token = accounts::issue_session(&db, &HeaderMap::new(), "host", "Host").unwrap();
            format!("drawing_board_alien_v11_session={token}")
        };
        app.shared
            .open(shared::log::Table {
                id: ID.into(),
                name: "Table".into(),
                rules: galactic_reach::RULES.into(),
                authority: String::new(),
                status: "active".into(),
                seats: shared::seats(&[
                    ("host".into(), "Host".into()),
                    ("friend".into(), "Friend".into()),
                ]),
                victory_target: 30,
                committed_only: false,
            })
            .await
            .unwrap();
        (app, cookie)
    }
    async fn paired(app: &App, host: &str) -> String {
        let (code, _, data) = call(
            app,
            "POST",
            &format!("/api/tabletop/{ID}/board-grant"),
            host,
            json!({}),
        )
        .await;
        assert_eq!(code, StatusCode::OK, "{data}");
        let secret = data["url"]
            .as_str()
            .unwrap()
            .split("#pair=")
            .nth(1)
            .unwrap();
        let (code, headers, data) = call(
            app,
            "POST",
            &format!("/api/tabletop/{ID}/redeem"),
            "",
            json!({"token":secret}),
        )
        .await;
        assert_eq!(code, StatusCode::OK, "{data}");
        assert_eq!(data["role"], "board");
        let session = headers[header::SET_COOKIE].to_str().unwrap();
        assert!(session.contains("HttpOnly; SameSite=Strict"));
        assert_eq!(
            call(
                app,
                "POST",
                &format!("/api/tabletop/{ID}/redeem"),
                "",
                json!({"token":secret})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED,
            "link is one use"
        );
        session.split(';').next().unwrap().into()
    }
    #[tokio::test]
    async fn board_capability_is_scoped_revocable_and_does_not_grant_membership() {
        let (mut app, host) = setup().await;
        let cookie = paired(&app, &host).await;
        let (code, _, view) = call(
            &app,
            "GET",
            &format!("/api/tabletop/{ID}/board"),
            &cookie,
            json!({}),
        )
        .await;
        assert_eq!(code, StatusCode::OK, "{view}");
        assert_eq!(view["role"], "board");
        assert!(view.get("seat").is_none());
        assert!(
            view["state"]["players"]
                .as_array()
                .unwrap()
                .iter()
                .all(|p| p.get("hand").is_none() && p.get("deck").is_none())
        );
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/tabletop/{OTHER}/board"),
                &cookie,
                json!({})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        for path in [
            format!("/api/shared/{ID}"),
            format!("/api/shared/{ID}/report"),
        ] {
            assert_eq!(
                call(&app, "GET", &path, &cookie, json!({})).await.0,
                StatusCode::UNAUTHORIZED
            );
        }
        assert_eq!(
            call(
                &app,
                "POST",
                &format!("/api/shared/{ID}/act"),
                &cookie,
                json!({"seq":0,"actions":[{"type":"pass"}]})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(
                &app,
                "POST",
                &format!("/api/tabletop/{ID}/board-grant"),
                &cookie,
                json!({})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        // A stale ordinary session cannot block the separate, valid capability.
        app.nido = Arc::new(
            nido::Config::new(true, "https://soroban-testnet.stellar.org".into())
                .unwrap()
                .with_access(access::Policy::new(true, None)),
        );
        let stale = format!("{cookie}; drawing_board_alien_v11_session=expired");
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/tabletop/{ID}/board"),
                &stale,
                json!({})
            )
            .await
            .0,
            StatusCode::OK
        );
        for path in [
            "/api/account",
            "/api/admin/overview",
            "/api/arena",
            "/api/tables",
        ] {
            assert!(
                !call(&app, "GET", path, &cookie, json!({}))
                    .await
                    .0
                    .is_success(),
                "{path} must remain gated"
            );
        }
        assert_eq!(
            call(&app, "GET", "/tabletop/board.html", "", json!({}))
                .await
                .0,
            StatusCode::OK
        );
        app.store
            .0
            .lock()
            .unwrap()
            .execute("UPDATE tabletop_grants SET expires=0", [])
            .unwrap();
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/tabletop/{ID}/board"),
                &cookie,
                json!({})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    #[tokio::test]
    async fn host_revocation_and_public_projection_survive_reload() {
        let (app, host) = setup().await;
        let cookie = paired(&app, &host).await;
        let before = app.shared.public_view(ID).await.unwrap();
        app.shared.snapshot_all().await;
        let resumed = table_service(&app.store, std::time::Duration::ZERO);
        assert_eq!(before, resumed.public_view(ID).await.unwrap());
        assert_eq!(
            call(
                &app,
                "POST",
                &format!("/api/tabletop/{ID}/board-revoke"),
                &host,
                json!({})
            )
            .await
            .0,
            StatusCode::OK
        );
        assert_eq!(
            call(
                &app,
                "GET",
                &format!("/api/tabletop/{ID}/board"),
                &cookie,
                json!({})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
    }
    #[tokio::test]
    async fn older_table_rows_and_saved_deals_keep_their_undo_mode() {
        use shared::log::TableLog;
        let (app, _) = setup().await;
        {
            let db = app.store.0.lock().unwrap();
            db.execute_batch("ALTER TABLE gr_shared_tables DROP COLUMN committed_only;")
                .unwrap();
            shared::log::migrate(&db).unwrap();
        }
        let table = shared::log::SqliteTableLog(app.store.clone())
            .table(ID)
            .unwrap()
            .unwrap();
        assert!(
            !table.committed_only,
            "pre-migration tables preserve their original mode"
        );
        let mut legacy = serde_json::to_value(&table).unwrap();
        legacy.as_object_mut().unwrap().remove("committed_only");
        assert!(
            !serde_json::from_value::<shared::log::Table>(legacy)
                .unwrap()
                .committed_only
        );
    }

    #[tokio::test]
    async fn quiet_board_stream_closes_after_revocation() {
        use axum::{body::Body, http::Request};
        use http_body_util::BodyExt;
        use tower::ServiceExt;
        let (app, host) = setup().await;
        let cookie = paired(&app, &host).await;
        app.shared
            .set_ping_every(std::time::Duration::from_millis(10));
        let response = router(app.clone())
            .oneshot(
                Request::builder()
                    .uri(format!("/api/tabletop/{ID}/stream"))
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let first = body.frame().await.unwrap().unwrap().into_data().unwrap();
        assert!(String::from_utf8_lossy(&first).contains("\"role\":\"board\""));
        app.store
            .0
            .lock()
            .unwrap()
            .execute("DELETE FROM tabletop_grants", [])
            .unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(1), body.frame())
                .await
                .unwrap()
                .is_none()
        );
    }
}

#[cfg(test)]
#[path = "tabletop/pairing_tests.rs"]
mod pairing_tests;

#[derive(Deserialize)]
pub struct Focus {
    seq: u64,
    coord: String,
}
pub async fn focus(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Focus>,
) -> ApiResult<Json<Value>> {
    principal(&app, &headers, &id, "board")?;
    let view = app.shared.public_view(&id).await?;
    if view["seq"].as_u64() != Some(input.seq) {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "The board changed. Tap the sector again.".into(),
        ));
    }
    let radius = view["state"]["boardRadius"]
        .as_i64()
        .ok_or_else(|| bad("The board has no map."))?;
    let coords: Vec<i64> = input
        .coord
        .split(',')
        .map(|n| n.parse())
        .collect::<Result<_, _>>()
        .map_err(|_| bad("Choose a valid sector."))?;
    if input.coord.len() > 8
        || coords.len() != 2
        || coords[0].abs() > radius
        || coords[1].abs() > radius
        || (coords[0] + coords[1]).abs() > radius
    {
        return Err(bad("Choose a sector on this board."));
    }
    app.shared
        .suggest_sector(&id, input.seq, &format!("{},{}", coords[0], coords[1]))?;
    Ok(Json(json!({"ok":true})))
}
