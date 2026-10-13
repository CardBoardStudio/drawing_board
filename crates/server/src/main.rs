mod accounts;
mod arena;
mod config;
mod invites;
mod nido;
mod nido_chain;
#[cfg(test)]
mod platform_tests;
mod store;
mod tables;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use game::*;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use store::{Record, Store};
use subtle::ConstantTimeEq;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
struct App {
    store: Arc<Store>,
    dev_auth: bool,
    preview_code_hash: Option<[u8; 32]>,
    registration_code_hash: Option<[u8; 32]>,
    origin: String,
    nido: Arc<nido::Config>,
}
#[derive(Debug)]
struct ApiError(StatusCode, String);
type ApiResult<T> = Result<T, ApiError>;
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
fn bad(e: impl ToString) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, e.to_string())
}
fn internal(e: impl ToString) -> ApiError {
    tracing::error!(error=%e.to_string(),"storage failure");
    ApiError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Unable to save this change. Please retry.".into(),
    )
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock")
        .as_secs()
}
fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|s| {
            s.trim()
                .strip_prefix(&format!("{name}="))
                .map(str::to_string)
        })
}
#[derive(Clone, Serialize)]
struct User {
    id: String,
    name: String,
    development: bool,
}
fn user(app: &App, headers: &HeaderMap) -> ApiResult<User> {
    let token = cookie(headers, "drawing_board_long_reach_v6_session").ok_or(ApiError(
        StatusCode::UNAUTHORIZED,
        "Sign in to join the table.".into(),
    ))?;
    let db = app.store.0.lock().map_err(internal)?;
    db.query_row(
        "SELECT s.user_id,a.name,s.development FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND a.kind='human'",
        rusqlite::params![digest(&token), now()],
        |r| {
            Ok(User {
                id: r.get(0)?,
                name: r.get(1)?,
                development: r.get(2)?,
            })
        },
    )
    .map_err(|_| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "Your session expired. Please sign in again.".into(),
        )
    })
}
fn clean(value: &str, max: usize) -> ApiResult<String> {
    let v = value.trim();
    if v.is_empty() || v.chars().count() > max || v.chars().any(char::is_control) {
        return Err(bad(format!(
            "Use between 1 and {max} printable characters."
        )));
    }
    Ok(v.into())
}
async fn protect(State(app): State<App>, request: axum::extract::Request, next: Next) -> Response {
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) {
        if request
            .headers()
            .get("x-drawing-board")
            .and_then(|h| h.to_str().ok())
            != Some("1")
        {
            return ApiError(
                StatusCode::FORBIDDEN,
                "Missing request protection header.".into(),
            )
            .into_response();
        }
        if let Some(origin) = request.headers().get(header::ORIGIN)
            && origin.to_str().ok() != Some(&app.origin)
        {
            return ApiError(StatusCode::FORBIDDEN, "Origin not allowed.".into()).into_response();
        }
    }
    let check = if request.uri().path().starts_with("/api/")
        && !request.uri().path().starts_with("/api/auth/")
    {
        nido::check_session(&app, request.headers()).await
    } else {
        Ok(())
    };
    let mut response = match check {
        Ok(()) => next.run(request).await,
        Err(e) => e.into_response(),
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "same-origin".parse().unwrap());
    response
        .headers_mut()
        .insert("x-frame-options", "DENY".parse().unwrap());
    response.headers_mut().insert(
        "content-security-policy",
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            .parse()
            .unwrap(),
    );
    response
}
async fn session(State(app): State<App>, headers: HeaderMap) -> Json<SessionInfo> {
    Json(SessionInfo {
        user: user(&app, &headers).ok().map(|u| Identity {
            name: u.name,
            development: u.development,
        }),
        dev_auth: app.dev_auth,
        preview_auth: app.preview_code_hash.is_some(),
        nido_available: app.nido.enabled,
        registration_available: app.dev_auth
            || app.registration_code_hash.is_some()
            || app.preview_code_hash.is_some(),
    })
}
#[derive(Deserialize)]
struct Login {
    name: String,
}
async fn dev_login(
    State(app): State<App>,
    headers: HeaderMap,
    Json(login): Json<Login>,
) -> ApiResult<Response> {
    if !app.dev_auth {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "Development sign-in is disabled.".into(),
        ));
    }
    create_test_session(&app, &headers, &login.name, "dev")
}
#[derive(Deserialize)]
struct PreviewLogin {
    name: String,
    code: String,
}
async fn preview_login(
    State(app): State<App>,
    headers: HeaderMap,
    Json(login): Json<PreviewLogin>,
) -> ApiResult<Response> {
    let expected = app.preview_code_hash.ok_or(ApiError(
        StatusCode::NOT_FOUND,
        "Preview sign-in is disabled.".into(),
    ))?;
    let supplied: [u8; 32] = Sha256::digest(login.code.as_bytes()).into();
    if !bool::from(expected.ct_eq(&supplied)) {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "The preview access code is incorrect.".into(),
        ));
    }
    create_test_session(&app, &headers, &login.name, "preview")
}
fn create_test_session(
    app: &App,
    headers: &HeaderMap,
    name: &str,
    identity_prefix: &str,
) -> ApiResult<Response> {
    let name = clean(name, 32)?;
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    tx.execute("DELETE FROM sessions WHERE expires<=?", [now()])
        .map_err(internal)?;
    if let Some(old) = cookie(headers, "drawing_board_long_reach_v6_session") {
        tx.execute("DELETE FROM sessions WHERE token_hash=?", [digest(&old)])
            .map_err(internal)?;
    }
    let id = format!("{identity_prefix}:{}", uuid::Uuid::new_v4());
    tx.execute(
        "INSERT INTO accounts(id,name,kind,created) VALUES(?,?,'human',?)",
        rusqlite::params![id, name, now()],
    )
    .map_err(internal)?;
    tx.execute(
        "INSERT INTO sessions VALUES(?,?,?,?,?)",
        rusqlite::params![digest(&token), id, name, true, now() + 86400],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    let secure = if app.origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    Ok(([(header::SET_COOKIE,format!("drawing_board_long_reach_v6_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400{secure}"))],Json(json!({"ok":true}))).into_response())
}
async fn logout(State(app): State<App>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(token) = cookie(&headers, "drawing_board_long_reach_v6_session") {
        app.store
            .0
            .lock()
            .map_err(internal)?
            .execute("DELETE FROM sessions WHERE token_hash=?", [digest(&token)])
            .map_err(internal)?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "drawing_board_long_reach_v6_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        )],
        Json(json!({"ok":true})),
    )
        .into_response())
}
async fn list_games(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<GameSummary>>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut query = db
        .prepare("SELECT state FROM games ORDER BY rowid DESC")
        .map_err(internal)?;
    let rows = query
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(internal)?;
    let mut games = vec![];
    for row in rows {
        let g: Game = serde_json::from_str(&row.map_err(internal)?).map_err(internal)?;
        if g.players.iter().any(|p| p.id == u.id) {
            games.push(GameSummary {
                id: g.id,
                name: g.name,
                status: g.status,
                players: g.players.len(),
                round: (g.players.iter().map(|p| p.turns).min().unwrap_or(0) + 1)
                    .min(g.round_limit),
            });
        }
    }
    Ok(Json(games))
}
async fn create_game(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<CreateGame>,
) -> ApiResult<Json<GameView>> {
    let u = user(&app, &headers)?;
    let mut seed = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    let id = uuid::Uuid::new_v4().simple().to_string();
    let mut g = Game::new(
        id,
        clean(&input.name, 60)?,
        u.id.clone(),
        u.name,
        seed,
        input.round_limit,
    )
    .map_err(bad)?;
    let mut records = vec![Record {
        revision: g.revision,
        actor: u.id.clone(),
        action: json!({"type":"create","initial":g}),
    }];
    if input.practice {
        let (bot_id, bot_name) = if let Some(id) = input.opponent_id {
            let db = app.store.0.lock().map_err(internal)?;
            let name = db
                .query_row(
                    "SELECT name FROM accounts WHERE id=? AND owner_id=? AND kind='ai' AND policy IN ('explorer/1','merchant/1','kepler/1')",
                    rusqlite::params![id, u.id],
                    |r| r.get::<_, String>(0),
                )
                .map_err(|_| {
                    ApiError(
                        StatusCode::FORBIDDEN,
                        "Choose an AI player from your own lab.".into(),
                    )
                })?;
            (id, name)
        } else {
            ("bot:kepler".into(), "KEPLER / 01".into())
        };
        g.join(bot_id, bot_name, true).map_err(bad)?;
        records.push(Record {
            revision: g.revision,
            actor: u.id.clone(),
            action: json!({"type":"join_bot","id":g.players[1].id,"name":g.players[1].name}),
        });
        g.apply(&u.id, Command::Start).map_err(bad)?;
        records.push(Record {
            revision: g.revision,
            actor: u.id.clone(),
            action: serde_json::to_value(Command::Start).unwrap(),
        });
    }
    Store::save(&mut *app.store.0.lock().map_err(internal)?, &g, &records).map_err(internal)?;
    Ok(Json(g.view(&u.id).unwrap()))
}
async fn get_game(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<GameView>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let g = Store::load(&db, &id).map_err(|e| ApiError(StatusCode::NOT_FOUND, e))?;
    g.view(&u.id).map(Json).ok_or(ApiError(
        StatusCode::FORBIDDEN,
        "Join this playtest to view its table.".into(),
    ))
}
async fn join_game(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<GameView>> {
    let u = user(&app, &headers)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let mut g = Store::load(&db, &id).map_err(bad)?;
    let before = g.revision;
    g.join(u.id.clone(), u.name.clone(), false).map_err(bad)?;
    if g.revision != before {
        Store::save(
            &mut db,
            &g,
            &[Record {
                revision: g.revision,
                actor: u.id.clone(),
                action: json!({"type":"join","name":u.name}),
            }],
        )
        .map_err(internal)?;
    }
    Ok(Json(g.view(&u.id).unwrap()))
}
async fn command(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<CommandRequest>,
) -> ApiResult<Json<GameView>> {
    let u = user(&app, &headers)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let mut g = Store::load(&db, &id).map_err(bad)?;
    if g.view(&u.id).is_none() {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "You are not at this table.".into(),
        ));
    }
    if g.revision != input.revision {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "The table changed. Your view has been refreshed; try again.".into(),
        ));
    }
    g.apply(&u.id, input.command.clone()).map_err(bad)?;
    let mut records = vec![Record {
        revision: g.revision,
        actor: u.id.clone(),
        action: serde_json::to_value(input.command).unwrap(),
    }];
    let mut steps = 0;
    while g.status == Status::Active && g.players[g.active].bot {
        let strategy = if g.players[g.active].id == "bot:kepler" {
            game::agents::Strategy::Kepler
        } else {
            let policy: String = db
                .query_row(
                    "SELECT policy FROM accounts WHERE id=? AND kind='ai'",
                    [&g.players[g.active].id],
                    |r| r.get(0),
                )
                .map_err(internal)?;
            arena::strategy(&policy)?
        };
        let c = g
            .agent_command(strategy)
            .ok_or_else(|| internal("No legal bot action"))?;
        let actor = g.players[g.active].id.clone();
        g.apply(&actor, c.clone()).map_err(internal)?;
        records.push(Record {
            revision: g.revision,
            actor,
            action: serde_json::to_value(c).unwrap(),
        });
        steps += 1;
        if steps > 300 {
            return Err(internal("Bot exceeded turn budget"));
        }
    }
    Store::save(&mut db, &g, &records).map_err(internal)?;
    Ok(Json(g.view(&u.id).unwrap()))
}
fn router(app: App) -> Router {
    Router::new()
        .route(
            "/api/health",
            get(|| async { Json(json!({"ok":true,"rules":RULES_VERSION,"galactic_reach_rules":galactic_reach::RULES})) }),
        )
        .route("/api/auth/nido", get(nido::begin))
        .route("/api/auth/nido/callback", get(nido::callback))
        .route("/api/session", get(session))
        .route("/api/auth/dev", post(dev_login))
        .route("/api/auth/preview", post(preview_login))
        .route("/api/auth/logout", post(logout))
        .route("/api/accounts/register", post(accounts::register))
        .route("/api/accounts/login", post(accounts::login))
        .route(
            "/api/account",
            get(accounts::profile).post(accounts::rename),
        )
        .route(
            "/api/account/revoke-sessions",
            post(accounts::revoke_other_sessions),
        )
        .route("/api/account/rotate-key", post(accounts::rotate_key))
        .route(
            "/api/admin/invites",
            get(invites::list).post(invites::create),
        )
        .route("/api/admin/invites/{id}/revoke", post(invites::revoke))
        .route("/api/invites/inspect", post(invites::inspect))
        .route("/api/invites/accept", post(invites::accept))
        .route("/api/tables", get(tables::list).post(tables::create))
        .route("/api/tables/{id}", get(tables::get))
        .route(
            "/api/tables/{id}/save",
            post(tables::save).layer(axum::extract::DefaultBodyLimit::max(1024 * 1024 + 16384)),
        )
        .route("/api/catalog", get(arena::catalog))
        .route("/api/arena", get(arena::overview))
        .route("/api/arena/bots", post(arena::create_bot))
        .route("/api/arena/series", post(arena::run_series))
        .route("/api/arena/matches", get(arena::replays::list))
        .route("/api/arena/replays/{id}", post(arena::replays::get))
        .route("/api/games", get(list_games).post(create_game))
        .route("/api/games/{id}", get(get_game))
        .route("/api/games/{id}/join", post(join_game))
        .route("/api/games/{id}/commands", post(command))
        .route(
            "/api/{*path}",
            get(|| async { ApiError(StatusCode::NOT_FOUND, "Endpoint not found.".into()) }),
        )
        .fallback_service(
            ServeDir::new("dist").not_found_service(ServeFile::new("dist/index.html")),
        )
        .layer(axum::extract::DefaultBodyLimit::max(16384))
        .layer(middleware::from_fn_with_state(app.clone(), protect))
        .with_state(app)
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let config = config::Config::from_env(|key| std::env::var(key).ok())?;
    let app = App {
        store: Arc::new(Store::open(
            &std::env::var("DATABASE_PATH").unwrap_or("drawing-board.sqlite".into()),
        )?),
        dev_auth: config.dev_auth,
        preview_code_hash: config.preview_code_hash,
        registration_code_hash: config.registration_code_hash,
        origin: config.origin.clone(),
        nido: Arc::new(nido::load_config()?),
    };
    if std::env::args().nth(1).as_deref() == Some("bootstrap-admin") {
        match invites::bootstrap(&app) {
            Ok(invite) => println!("{}", invite["url"].as_str().unwrap()),
            Err(e) => return Err(e.1.into()),
        }
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("calibrate-ai") {
        let args: Vec<String> = std::env::args().skip(2).collect();
        if args.len() != 3 {
            return Err("Usage: server calibrate-ai OWNER_ID GAMES REQUEST_UUID".into());
        }
        let games: u8 = args[1].parse()?;
        match arena::calibrate(&app, &args[0], games, &args[2]) {
            Ok(result) => println!("{}", serde_json::to_string_pretty(&result)?),
            Err(e) => return Err(e.1.into()),
        }
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("index-replays") {
        let owner = std::env::args()
            .nth(2)
            .ok_or("Usage: server index-replays OWNER_ID")?;
        match arena::replays::index(&app, &owner) {
            Ok(count) => println!("Indexed {count} completed matches."),
            Err(e) => return Err(e.1.into()),
        }
        return Ok(());
    }
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    println!(
        "Drawing Board → {} (development: {}, preview: {})",
        config.origin,
        config.dev_auth,
        config.preview_code_hash.is_some()
    );
    axum::serve(listener, router(app))
        .with_graceful_shutdown(async {
            shutdown_signal().await;
        })
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("register SIGTERM");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    pub(super) fn app(dev: bool) -> App {
        App {
            store: Arc::new(Store::open(":memory:").unwrap()),
            dev_auth: dev,
            preview_code_hash: None,
            registration_code_hash: None,
            origin: "http://127.0.0.1:3000".into(),
            nido: Arc::new(
                nido::Config::new(false, "https://soroban-testnet.stellar.org".into()).unwrap(),
            ),
        }
    }
    pub(super) async fn call(
        app: &App,
        method: &str,
        path: &str,
        cookie: &str,
        body: serde_json::Value,
    ) -> (StatusCode, HeaderMap, serde_json::Value) {
        let req = Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json")
            .header("x-drawing-board", "1")
            .header("cookie", cookie)
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = router(app.clone()).oneshot(req).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            headers,
            serde_json::from_slice(&bytes).unwrap_or_default(),
        )
    }
    async fn login(app: &App, name: &str) -> String {
        let (status, h, _) = call(app, "POST", "/api/auth/dev", "", json!({"name":name})).await;
        assert_eq!(status, StatusCode::OK);
        h[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .into()
    }
    #[tokio::test]
    async fn authentication_and_csrf_are_required() {
        let a = app(false);
        assert_eq!(
            call(&a, "POST", "/api/auth/dev", "", json!({"name":"Ada"}))
                .await
                .0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(&a, "GET", "/api/games", "", json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
        let request = Request::builder()
            .method("POST")
            .uri("/api/games")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            router(a).oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
        let a = app(true);
        let request = Request::builder()
            .method("POST")
            .uri("/api/auth/dev")
            .header("x-drawing-board", "1")
            .header("origin", "https://evil.example")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            router(a).oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
    }
    #[tokio::test]
    async fn multiplayer_enforces_membership_revision_and_turns() {
        let a = app(true);
        let alice = login(&a, "Alice").await;
        let bob = login(&a, "Bob").await;
        let eve = login(&a, "Eve").await;
        let (_, _, g) = call(
            &a,
            "POST",
            "/api/games",
            &alice,
            json!({"name":"Test","practice":false,"round_limit":10}),
        )
        .await;
        let id = g["id"].as_str().unwrap();
        let path = format!("/api/games/{id}");
        assert_eq!(
            call(&a, "GET", &path, &eve, json!({})).await.0,
            StatusCode::FORBIDDEN
        );
        let (_, _, joined) = call(&a, "POST", &format!("{path}/join"), &bob, json!({})).await;
        let commands = format!("{path}/commands");
        assert_eq!(
            call(
                &a,
                "POST",
                &commands,
                &bob,
                json!({"revision":joined["revision"],"command":{"type":"start"}})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        let (status, _, started) = call(
            &a,
            "POST",
            &commands,
            &alice,
            json!({"revision":joined["revision"],"command":{"type":"start"}}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(started["hand"].as_array().unwrap().len(), 5);
        assert!(started.get("seed").is_none());
        assert!(started["players"][1]["hand"].is_number());
        assert_eq!(
            call(
                &a,
                "POST",
                &commands,
                &bob,
                json!({"revision":started["revision"],"command":{"type":"end_turn"}})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &commands,
                &alice,
                json!({"revision":0,"command":{"type":"end_turn"}})
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        let (status, _, next) = call(
            &a,
            "POST",
            &commands,
            &alice,
            json!({"revision":started["revision"],"command":{"type":"end_turn"}}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(next["active"], 1);
        assert_eq!(
            call(&a, "GET", &path, &bob, json!({})).await.2["your_turn"],
            true
        );
    }
    #[tokio::test]
    async fn practice_runs_bot_and_survives_store_reload() {
        let a = app(true);
        let c = login(&a, "Ada").await;
        let (_, _, g) = call(
            &a,
            "POST",
            "/api/games",
            &c,
            json!({"name":"Practice","practice":true,"round_limit":10}),
        )
        .await;
        let id = g["id"].as_str().unwrap();
        let (s, _, g) = call(
            &a,
            "POST",
            &format!("/api/games/{id}/commands"),
            &c,
            json!({"revision":g["revision"],"command":{"type":"end_turn"}}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(g["your_turn"], true);
        assert_eq!(g["round"], 2);
        let db = a.store.0.lock().unwrap();
        let stored = Store::load(&db, id).unwrap();
        assert_eq!(stored.revision, g["revision"].as_u64().unwrap());
        let mut stmt = db
            .prepare(
                "SELECT payload,previous_hash,hash FROM events WHERE game_id=? ORDER BY revision",
            )
            .unwrap();
        let mut previous = String::new();
        for item in stmt
            .query_map([id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .unwrap()
        {
            let (payload, prev, hash) = item.unwrap();
            assert_eq!(prev, previous);
            assert_eq!(
                hash,
                digest(&format!("voidwright-event-v1\n{id}\n{prev}\n{payload}"))
            );
            previous = hash;
        }
    }
    #[tokio::test]
    async fn logout_invalidates_server_session() {
        let a = app(true);
        let c = login(&a, "Ada").await;
        assert_eq!(
            call(&a, "POST", "/api/auth/logout", &c, json!({})).await.0,
            StatusCode::OK
        );
        assert_eq!(
            call(&a, "GET", "/api/games", &c, json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    #[tokio::test]
    async fn preview_login_requires_code_and_issues_isolated_test_identity() {
        let mut a = app(false);
        let payload = json!({"name":"Preview pilot","code":"long-enough-test-code-only"});
        assert_eq!(
            call(&a, "POST", "/api/auth/preview", "", payload.clone())
                .await
                .0,
            StatusCode::NOT_FOUND
        );
        a.preview_code_hash = Some(Sha256::digest(b"long-enough-test-code-only").into());
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/auth/preview",
                "",
                json!({"name":"Pilot","code":"wrong"})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&a, "GET", "/api/session", "", json!({})).await.2["preview_auth"],
            true
        );
        let (status, headers, _) = call(&a, "POST", "/api/auth/preview", "", payload).await;
        assert_eq!(status, StatusCode::OK);
        let cookie = headers[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        let (status, _, game) = call(
            &a,
            "POST",
            "/api/games",
            cookie,
            json!({"name":"Preview match","practice":true,"round_limit":10}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(game["your_turn"], true);
        let db = a.store.0.lock().unwrap();
        let id: String = db
            .query_row("SELECT user_id FROM sessions", [], |r| r.get(0))
            .unwrap();
        assert!(id.starts_with("preview:"));
    }
}
