//! Guest pairing reuses the existing host-owned lobby and randomized seat deal.
//! A guest account row has no login credential; only a table-scoped grant can
//! resolve it to a participant for the shared authority.
use super::*;
use shared::log::TableLog;

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS tabletop_rooms(
        table_id TEXT PRIMARY KEY REFERENCES gr_lobbies(table_id), invite_hash TEXT,
        invite_expires INTEGER NOT NULL DEFAULT 0, deal TEXT);
        CREATE TABLE IF NOT EXISTS tabletop_requests(
        table_id TEXT NOT NULL REFERENCES gr_lobbies(table_id), participant TEXT NOT NULL REFERENCES accounts(id),
        status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL,
        PRIMARY KEY(table_id,participant));")
}
fn waiting(db: &Connection, id: &str) -> ApiResult<()> {
    let state: Option<String> = db
        .query_row(
            "SELECT status FROM gr_lobbies WHERE table_id=?",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(internal)?;
    if state.as_deref() != Some("waiting") {
        return Err(bad("This game has started or has no waiting room."));
    }
    Ok(())
}
fn link(app: &App, id: &str, fragment: &str, secret: &str) -> ApiResult<Value> {
    let url = format!(
        "{}/tabletop/phone.html?table={id}#{fragment}={secret}",
        app.origin
    );
    let qr = qrcode::QrCode::new(url.as_bytes())
        .map_err(internal)?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(240, 240)
        .build();
    Ok(json!({"url":url,"qr":qr}))
}
fn session_response(app: &App, id: &str, secret: &str, data: Value) -> Response {
    let secure = if app.origin.starts_with("https://") {
        "; Secure"
    } else {
        ""
    };
    ([(header::SET_COOKIE,format!("{}={secret}; Path=/api/tabletop/{id}/; HttpOnly; SameSite=Strict; Max-Age={SESSION_LIFETIME}{secure}",cookie_name(id)))],Json(data)).into_response()
}
pub async fn invite(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let secret = token();
    {
        let db = app.store.0.lock().map_err(internal)?;
        waiting(&db, &id)?;
        db.execute("INSERT INTO tabletop_rooms(table_id,invite_hash,invite_expires) VALUES(?,?,?) ON CONFLICT(table_id) DO UPDATE SET invite_hash=excluded.invite_hash,invite_expires=excluded.invite_expires",
        params![id,digest(&secret),now()+LINK_LIFETIME]).map_err(internal)?;
    }
    Ok(Json(link(&app, &id, "invite", &secret)?))
}
pub async fn host_phone(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let owner = user(&app, &headers)?;
    {
        let db = app.store.0.lock().map_err(internal)?;
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM gr_lobbies WHERE table_id=?)",
                [&id],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if !exists {
            return Err(bad("Open a waiting room first."));
        }
        db.execute(
            "INSERT OR IGNORE INTO tabletop_rooms(table_id) VALUES(?)",
            [&id],
        )
        .map_err(internal)?;
    }
    repair(
        State(app),
        headers,
        Path(id),
        Json(Repair {
            participant: owner.id,
        }),
    )
    .await
}

#[derive(Deserialize)]
pub struct Join {
    invite: String,
    name: String,
}
pub async fn join(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Join>,
) -> ApiResult<Response> {
    if !valid_id(&id) || input.invite.len() != 64 {
        return Err(refused());
    }
    let name = clean(&input.name, 32)?;
    // A retry by the same paired phone returns its existing request.
    for role in ["pending", "player"] {
        if let Ok(Some(participant)) = principal(&app, &headers, &id, role) {
            return Ok(Json(json!({"status":role,"code":short_code(&participant)})).into_response());
        }
    }
    let participant = format!("tabletop:{id}:{}", uuid::Uuid::new_v4().simple());
    let secret = token();
    {
        let mut db = app.store.0.lock().map_err(internal)?;
        accounts::rate_limit(&db)?;
        let tx = db.transaction().map_err(internal)?;
        waiting(&tx, &id)?;
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM tabletop_rooms WHERE table_id=? AND invite_hash=? AND invite_expires>?)",params![id,digest(&input.invite),now()],|r|r.get(0)).map_err(internal)?;
        if !valid {
            return Err(refused());
        }
        let (approved,pending):(u32,u32)=tx.query_row("SELECT (SELECT count(*) FROM gr_lobby_seats WHERE table_id=?),(SELECT count(*) FROM tabletop_requests WHERE table_id=? AND status='pending')",params![id,id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(internal)?;
        if approved >= 3 {
            return Err(bad("Every player seat is taken."));
        }
        if pending >= 12 {
            return Err(bad(
                "The host must review pending phones before another can join.",
            ));
        }
        tx.execute(
            "INSERT INTO accounts(id,name,kind,created) VALUES(?,?,'human',?)",
            params![participant, name, now()],
        )
        .map_err(internal)?;
        tx.execute(
            "INSERT INTO tabletop_requests(table_id,participant,created) VALUES(?,?,?)",
            params![id, participant, now()],
        )
        .map_err(internal)?;
        tx.execute("INSERT INTO tabletop_grants(token_hash,table_id,role,participant,kind,expires) VALUES(?,?,'pending',?,'session',?)",params![digest(&secret),id,participant,now()+SESSION_LIFETIME]).map_err(internal)?;
        tx.commit().map_err(internal)?;
    }
    Ok(session_response(
        &app,
        &id,
        &secret,
        json!({"status":"pending","code":short_code(&participant)}),
    ))
}
fn short_code(participant: &str) -> &str {
    participant
        .rsplit(':')
        .next()
        .unwrap_or(participant)
        .get(..6)
        .unwrap_or(participant)
}
#[derive(Deserialize)]
pub struct Approval {
    participant: String,
    approve: bool,
}
pub async fn approve(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Approval>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    waiting(&tx, &id)?;
    let status: Option<String> = tx
        .query_row(
            "SELECT status FROM tabletop_requests WHERE table_id=? AND participant=?",
            params![id, input.participant],
            |r| r.get(0),
        )
        .optional()
        .map_err(internal)?;
    if status.as_deref() != Some("pending") {
        return Err(bad("This phone has already been reviewed."));
    }
    if input.approve {
        let count: u32 = tx
            .query_row(
                "SELECT count(*) FROM gr_lobby_seats WHERE table_id=?",
                [&id],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if count >= 3 {
            return Err(bad("Every player seat is taken."));
        }
        tx.execute(
            "INSERT INTO gr_lobby_seats(table_id,user_id,joined) VALUES(?,?,?)",
            params![id, input.participant, now()],
        )
        .map_err(internal)?;
        tx.execute("UPDATE tabletop_grants SET role='player' WHERE table_id=? AND participant=? AND role='pending'",params![id,input.participant]).map_err(internal)?;
    } else {
        tx.execute(
            "DELETE FROM tabletop_grants WHERE table_id=? AND participant=?",
            params![id, input.participant],
        )
        .map_err(internal)?;
    }
    tx.execute(
        "UPDATE tabletop_requests SET status=? WHERE table_id=? AND participant=?",
        params![
            if input.approve {
                "approved"
            } else {
                "rejected"
            },
            id,
            input.participant
        ],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"ok":true})))
}
pub async fn requests(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut q=db.prepare("SELECT r.participant,a.name,r.status FROM tabletop_requests r JOIN accounts a ON a.id=r.participant WHERE table_id=? ORDER BY r.created,r.rowid").map_err(internal)?;
    let rows=q.query_map([id],|r|{let id:String=r.get(0)?;Ok(json!({"participant":id,"code":short_code(&id),"name":r.get::<_,String>(1)?,"status":r.get::<_,String>(2)?}))}).map_err(internal)?.collect::<Result<Vec<_>,_>>().map_err(internal)?;
    Ok(Json(json!({"requests":rows})))
}
/// The existing lobby start endpoint still owns random seating and AI fill.
/// This guard also protects starts made through the older account UI.
pub fn check_start(db: &Connection, id: &str) -> ApiResult<()> {
    let tabletop: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tabletop_rooms WHERE table_id=?)",
            [id],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if tabletop {
        let n: u32 = db
            .query_row(
                "SELECT count(*) FROM gr_lobby_seats WHERE table_id=?",
                [id],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if n == 0 {
            return Err(bad(
                "Pair and approve at least one other player before starting. This mode needs two to four people.",
            ));
        }
    }
    Ok(())
}
async fn player_view(app: &App, headers: &HeaderMap, id: &str) -> ApiResult<Value> {
    if let Ok(Some(participant)) = principal(app, headers, id, "pending") {
        let waiting = {
            let db = app.store.0.lock().map_err(internal)?;
            db.query_row(
                "SELECT status='waiting' FROM gr_lobbies WHERE table_id=?",
                [id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(internal)?
        };
        return Ok(
            json!({"status":if waiting {"pending"} else {"closed"},"code":short_code(&participant)}),
        );
    }
    let participant = principal(app, headers, id, "player")?.ok_or_else(refused)?;
    let lobby = {
        let db = app.store.0.lock().map_err(internal)?;
        db.query_row("SELECT t.name,l.status FROM gr_lobbies l JOIN solo_tables t ON t.id=l.table_id WHERE table_id=?",[id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional().map_err(internal)?.ok_or_else(refused)?
    };
    if lobby.1 == "waiting" {
        return Ok(json!({"status":"waiting","name":lobby.0,"code":short_code(&participant)}));
    }
    let mut view = app.shared.view(id, &participant).await?;
    view["client_path"] = json!(format!("/api/tabletop/{id}/client/"));
    view["tabletop"] = json!(true);
    if view["active"] == view["seat"] {
        view["board_focus"] = app
            .shared
            .sector_suggestion(id, view["seq"].as_u64().unwrap_or_default())
            .unwrap_or(Value::Null);
    }
    Ok(view)
}
pub async fn seat(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    Ok(Json(player_view(&app, &headers, &id).await?))
}
#[derive(Deserialize)]
pub struct Command {
    seq: u64,
    actions: Vec<Value>,
}
pub async fn act(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Command>,
) -> ApiResult<Json<Value>> {
    let participant = principal(&app, &headers, &id, "player")?.ok_or_else(refused)?;
    let mut result = app
        .shared
        .act(&id, &participant, input.seq, input.actions)
        .await?;
    result["view"] = player_view(&app, &headers, &id).await?;
    Ok(Json(result))
}
#[derive(Deserialize)]
pub struct Undo {
    seq: u64,
}
pub async fn undo(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Undo>,
) -> ApiResult<Json<Value>> {
    let participant = principal(&app, &headers, &id, "player")?.ok_or_else(refused)?;
    let mut result = app.shared.undo(&id, &participant, input.seq).await?;
    result["view"] = player_view(&app, &headers, &id).await?;
    Ok(Json(result))
}
pub async fn report(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let participant = principal(&app, &headers, &id, "player")?.ok_or_else(refused)?;
    Ok(Json(app.shared.report(&id, &participant).await?))
}
pub async fn player_stream(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    principal(&app, &headers, &id, "player")?.ok_or_else(refused)?;
    let changes = app.shared.subscribe();
    let closing = app.shared.shutdown_subscription();
    let first = player_view(&app, &headers, &id).await?;
    let events = futures_util::stream::unfold(
        (Some(first), app, headers, id, changes, closing),
        |(first, app, headers, id, mut changes, mut closing)| async move {
            let view = if let Some(v) = first {
                v
            } else {
                let deadline = tokio::time::sleep(app.shared.ping_every());
                tokio::pin!(deadline);
                loop {
                    if *closing.borrow() {
                        return None;
                    }
                    tokio::select! {
                        _=closing.changed()=>return None,_=&mut deadline=>break,
                        change=changes.recv()=>match change{Ok((table,_))if table==id=>break,Ok(_)=>continue,Err(tokio::sync::broadcast::error::RecvError::Lagged(_))=>break,Err(_)=>return None}
                    }
                }
                player_view(&app, &headers, &id).await.ok()?
            };
            Some((
                Ok::<_, std::convert::Infallible>(
                    Event::default().event("view").data(view.to_string()),
                ),
                (None, app, headers, id, changes, closing),
            ))
        },
    );
    Ok((
        [("x-accel-buffering", "no")],
        Sse::new(events).keep_alive(KeepAlive::default()),
    )
        .into_response())
}
/// Player assets stay under the table cookie path and the normal game page
/// remains gated. Only known packaged files are reachable; engines stay pinned.
pub async fn client(
    State(app): State<App>,
    headers: HeaderMap,
    Path((id, file)): Path<(String, String)>,
) -> ApiResult<Response> {
    principal(&app, &headers, &id, "player")?.ok_or_else(refused)?;
    let file = if file.is_empty() {
        "index.html"
    } else {
        file.as_str()
    };
    if file
        .split('/')
        .any(|p| p.is_empty() || p == ".." || p == ".")
        || !file
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/_-.".contains(&b))
    {
        return Err(bad("Invalid asset path."));
    }
    let table = shared::log::SqliteTableLog(app.store.clone())
        .table(&id)
        .map_err(internal)?
        .ok_or_else(refused)?;
    let path = app.shared.channel.client_path(&table.rules);
    let content_type = match file.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "json" => "application/json",
        _ => return Err(bad("Unsupported asset.")),
    };
    let kept = app.shared.channel.kept(&table.rules);
    let bytes = match (file, kept.as_ref()) {
        ("channel.js", _) => app
            .shared
            .channel
            .script(
                &table.rules,
                kept.as_ref()
                    .map_or(&app.shared.channel.commit, |k| &k.commit),
            )
            .into_bytes(),
        ("app.js", Some(k)) => k.app.as_bytes().to_vec(),
        ("adapter.js", Some(k)) => k.adapter.as_bytes().to_vec(),
        _ => {
            let base = if kept.is_some() || file == "shared.js" {
                "/galactic-reach/"
            } else {
                &path
            };
            let bytes = tokio::fs::read(format!("dist{base}{file}"))
                .await
                .map_err(|_| {
                    ApiError(StatusCode::NOT_FOUND, "The game asset is not built.".into())
                })?;
            if file == "index.html" {
                // The independent Testnet demo must not boot alongside a guest seat.
                String::from_utf8(bytes)
                    .map_err(internal)?
                    .lines()
                    .filter(|line| {
                        !line.contains("/galactic-reach/zk/")
                            && !line.contains("type=\"importmap\"")
                            && !line.contains("\"pako\":")
                            && !line.contains("}}</script>")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
                    .into_bytes()
            } else {
                bytes
            }
        }
    };
    Ok(([(header::CONTENT_TYPE, content_type)], bytes).into_response())
}
pub async fn client_index(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    client(State(app), headers, Path((id, String::new()))).await
}
pub async fn phone_page() -> Html<&'static str> {
    Html(include_str!("../../../../prototypes/tabletop/phone.html"))
}
pub async fn host_page() -> Html<&'static str> {
    Html(include_str!("../../../../prototypes/tabletop/host.html"))
}
pub async fn pairing_script() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        include_str!("../../../../prototypes/tabletop/pairing.js"),
    )
}

#[derive(Deserialize)]
pub struct Repair {
    participant: String,
}
pub async fn repair(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Repair>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let secret = token();
    {
        let mut db = app.store.0.lock().map_err(internal)?;
        let tx = db.transaction().map_err(internal)?;
        let seated:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM solo_tables WHERE id=? AND owner_id=? UNION ALL SELECT 1 FROM gr_lobby_seats WHERE table_id=? AND user_id=?)",params![id,input.participant,id,input.participant],|r|r.get(0)).map_err(internal)?;
        if !seated {
            return Err(bad("That person is not a player at this table."));
        }
        tx.execute(
            "DELETE FROM tabletop_grants WHERE table_id=? AND participant=?",
            params![id, input.participant],
        )
        .map_err(internal)?;
        tx.execute("INSERT INTO tabletop_grants(token_hash,table_id,role,participant,kind,expires) VALUES(?,?,'player',?,'link',?)",params![digest(&secret),id,input.participant,now()+LINK_LIFETIME]).map_err(internal)?;
        tx.commit().map_err(internal)?;
    }
    Ok(Json(link(&app, &id, "pair", &secret)?))
}

pub fn enabled(db: &Connection, id: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM tabletop_rooms WHERE table_id=?)",
        [id],
        |r| r.get(0),
    )
    .map_err(internal)
}
/// Freeze the approved roster and random deal atomically before the engine boots.
/// A restart/retry uses the saved deal; it cannot approve an omitted last-moment
/// phone or reroll the seats. Normal account-owned lobbies keep their old path.
pub async fn start_paired(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    host(&app, &headers, &id)?;
    let table: shared::log::Table = {
        let mut db = app.store.0.lock().map_err(internal)?;
        let tx = db.transaction().map_err(internal)?;
        let saved: Option<String> = tx
            .query_row(
                "SELECT deal FROM tabletop_rooms WHERE table_id=?",
                [&id],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if let Some(saved) = saved {
            serde_json::from_str(&saved).map_err(internal)?
        } else {
            waiting(&tx, &id)?;
            check_start(&tx, &id)?;
            let (name,owner,owner_name,target):(String,String,String,u32)=tx.query_row("SELECT t.name,t.owner_id,a.name,l.victory_target FROM solo_tables t JOIN accounts a ON a.id=t.owner_id JOIN gr_lobbies l ON l.table_id=t.id WHERE t.id=?",[&id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(internal)?;
            let mut people = vec![(owner, owner_name)];
            {
                let mut q=tx.prepare("SELECT a.id,a.name FROM gr_lobby_seats s JOIN accounts a ON a.id=s.user_id WHERE table_id=? ORDER BY joined,s.rowid").map_err(internal)?;
                people.extend(
                    q.query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))
                        .map_err(internal)?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(internal)?,
                );
            }
            if people.len() > 4 {
                return Err(bad("Every player seat is taken."));
            }
            let table = shared::log::Table {
                id: id.clone(),
                name,
                rules: app.shared.channel.rules.clone(),
                authority: String::new(),
                status: "active".into(),
                seats: shared::random_seats(&people, &mut rand::thread_rng()),
                victory_target: target,
                committed_only: true,
            };
            tx.execute(
                "UPDATE tabletop_rooms SET deal=?,invite_hash=NULL WHERE table_id=?",
                params![serde_json::to_string(&table).map_err(internal)?, id],
            )
            .map_err(internal)?;
            tx.execute(
                "UPDATE gr_lobbies SET status='starting' WHERE table_id=?",
                [&id],
            )
            .map_err(internal)?;
            tx.commit().map_err(internal)?;
            table
        }
    };
    let log = shared::log::SqliteTableLog(app.store.clone());
    if log.table(&id).map_err(internal)?.is_none()
        && let Err(error) = app.shared.open(table).await
        && log.table(&id).map_err(internal)?.is_none()
    {
        return Err(error.into());
    }
    app.store
        .0
        .lock()
        .map_err(internal)?
        .execute(
            "UPDATE gr_lobbies SET status='started' WHERE table_id=?",
            [&id],
        )
        .map_err(internal)?;
    Ok(Json(
        json!({"table_url":shared::url(&id),"status":"started"}),
    ))
}
