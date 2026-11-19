//! Galactic Reach waiting room. A host's table gets a private invite link, seats
//! fill as signed-in friends join, and the host chooses the number of AI rivals
//! and their difficulty before Start.
//!
//! The current rules seat four factions with standard rivals. Start opens a solo
//! browser table for one person, or a shared table (the `shared` table service)
//! when friends have taken seats. Other choices are kept with the table and
//! Start explains what is still missing.
use crate::*;
use axum::extract::Query;
use rusqlite::{Connection, OptionalExtension, params};

const SEATS: u32 = 4;
/// Prestige targets a host may choose for a new table (rules #victory). New games default to 30.
pub const VICTORY_TARGETS: [u32; 5] = [20, 30, 40, 50, 60];
pub const DEFAULT_VICTORY_TARGET: u32 = 30;
/// Difficulty choices, named after the existing Galactic Reach AI policies.
pub const DIFFICULTIES: [(&str, &str, &str); 2] = [
    (
        "standard",
        "Standard",
        "Vanguard, Architect and Pathfinder. With friends seated, the table service plays them with the AI arena's matching policies.",
    ),
    (
        "easy",
        "Easy",
        "Wanderer: seeded random legal play, from the AI arena.",
    ),
];

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS gr_lobbies(
        table_id TEXT PRIMARY KEY REFERENCES solo_tables(id) ON DELETE CASCADE,
        invite TEXT NOT NULL UNIQUE, ai_rivals INTEGER NOT NULL DEFAULT 3,
        difficulty TEXT NOT NULL DEFAULT 'standard', status TEXT NOT NULL DEFAULT 'waiting',
        created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS gr_lobby_seats(
        table_id TEXT NOT NULL REFERENCES gr_lobbies(table_id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES accounts(id), joined INTEGER NOT NULL,
        PRIMARY KEY(table_id,user_id));",
    )?;
    // Additive: rooms created before the Prestige-target setting keep the 31.36 default.
    let has_target = db
        .prepare("PRAGMA table_info(gr_lobbies)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .any(|c| c.as_deref() == Ok("victory_target"));
    if !has_target {
        db.execute_batch(
            "ALTER TABLE gr_lobbies ADD COLUMN victory_target INTEGER NOT NULL DEFAULT 40;",
        )?;
    }
    Ok(())
}

/// Settings a started table hands to the browser engine for its new game.
pub fn table_settings(db: &Connection, table_id: &str) -> ApiResult<Option<serde_json::Value>> {
    db.query_row(
        "SELECT victory_target FROM gr_lobbies WHERE table_id=?",
        [table_id],
        |r| Ok(json!({"victory_target":r.get::<_, u32>(0)?})),
    )
    .optional()
    .map_err(internal)
}

/// Opens a waiting room for a freshly created table and returns its invite token.
pub fn open(db: &Connection, table_id: &str) -> ApiResult<String> {
    let invite =
        uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string();
    db.execute(
        "INSERT INTO gr_lobbies(table_id,invite,created,victory_target) VALUES(?,?,?,?)",
        params![table_id, invite, now(), DEFAULT_VICTORY_TARGET],
    )
    .map_err(internal)?;
    Ok(invite)
}

pub fn url(id: &str) -> String {
    format!("/?game=galactic-reach#lobby/{id}")
}

/// The waiting-room status of a table, if it was created with one.
pub fn status(db: &Connection, table_id: &str) -> ApiResult<Option<String>> {
    db.query_row(
        "SELECT status FROM gr_lobbies WHERE table_id=?",
        [table_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(internal)
}

/// Waiting rooms this account joined as a guest, for the table shelf.
pub fn joined(db: &Connection, user_id: &str) -> ApiResult<Vec<serde_json::Value>> {
    let mut query = db
        .prepare(
            "SELECT t.id,t.name,coalesce(g.status,l.status),(SELECT count(*) FROM gr_lobby_seats s2 WHERE s2.table_id=t.id),g.id IS NOT NULL
             FROM gr_lobby_seats s JOIN gr_lobbies l USING(table_id) JOIN solo_tables t ON t.id=s.table_id
             LEFT JOIN gr_shared_tables g ON g.id=t.id
             WHERE s.user_id=? ORDER BY s.joined DESC",
        )
        .map_err(internal)?;
    let rows = query
        .query_map([user_id], |r| {
            Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"game":"galactic-reach",
                "rules_version":galactic_reach::RULES,"status":r.get::<_,String>(2)?,
                "players":1+r.get::<_,u32>(3)?,"round":1,"guest":true,
                "url":if r.get::<_,bool>(4)? {crate::shared::url(&r.get::<_,String>(0)?)} else {url(&r.get::<_,String>(0)?)}}))
        })
        .map_err(internal)?;
    rows.collect::<Result<_, _>>().map_err(internal)
}

struct Lobby {
    name: String,
    owner: (String, String),
    invite: String,
    ai_rivals: u32,
    difficulty: String,
    victory_target: u32,
    status: String,
    guests: Vec<(String, String)>,
    /// Started as a shared table (friends seated), not a solo browser table.
    shared: bool,
}
impl Lobby {
    fn humans(&self) -> u32 {
        1 + self.guests.len() as u32
    }
    fn member(&self, id: &str) -> bool {
        self.owner.0 == id || self.guests.iter().any(|g| g.0 == id)
    }
    /// Why Start cannot open this configuration yet, if it cannot.
    fn blocked(&self) -> Option<&'static str> {
        if self.humans() + self.ai_rivals != SEATS {
            Some("The current rules always seat four factions.")
        } else if self.difficulty != "standard" {
            Some("Easy rivals (Wanderer) play in the AI arena but not yet in the browser game.")
        } else {
            None
        }
    }
}

fn load(db: &Connection, id: &str) -> ApiResult<Lobby> {
    let found = db
        .query_row(
            "SELECT t.name,t.owner_id,a.name,l.invite,l.ai_rivals,l.difficulty,l.status,l.victory_target
             FROM gr_lobbies l JOIN solo_tables t ON t.id=l.table_id JOIN accounts a ON a.id=t.owner_id
             WHERE l.table_id=?",
            [id],
            |r| {
                Ok(Lobby {
                    name: r.get(0)?,
                    owner: (r.get(1)?, r.get(2)?),
                    invite: r.get(3)?,
                    ai_rivals: r.get(4)?,
                    difficulty: r.get(5)?,
                    status: r.get(6)?,
                    victory_target: r.get(7)?,
                    guests: vec![],
                    shared: false,
                })
            },
        )
        .optional()
        .map_err(internal)?;
    let mut lobby = found.ok_or(ApiError(
        StatusCode::NOT_FOUND,
        "This waiting room does not exist.".into(),
    ))?;
    let mut query = db
        .prepare("SELECT a.id,a.name FROM gr_lobby_seats s JOIN accounts a ON a.id=s.user_id WHERE s.table_id=? ORDER BY s.joined,a.id")
        .map_err(internal)?;
    lobby.guests = query
        .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(internal)?
        .collect::<Result<_, _>>()
        .map_err(internal)?;
    lobby.shared = crate::shared::status(db, id)?.is_some();
    // Rivals are not a host choice (captain, 2026-11-14): Standard AI rivals fill
    // every seat a person has not taken. Fewer or Easy rivals return once built.
    lobby.ai_rivals = SEATS - lobby.humans();
    lobby.difficulty = "standard".into();
    Ok(lobby)
}

fn view(app: &App, id: &str, lobby: &Lobby, me: &str) -> serde_json::Value {
    let host = lobby.owner.0 == me;
    let mut seats = vec![json!({"kind":"host","name":lobby.owner.1,"you":host})];
    seats.extend(
        lobby
            .guests
            .iter()
            .map(|(gid, name)| json!({"kind":"friend","name":name,"you":gid==me})),
    );
    let open = SEATS - lobby.humans() - lobby.ai_rivals;
    seats.extend((0..lobby.ai_rivals).map(|_| json!({"kind":"ai","difficulty":lobby.difficulty})));
    seats.extend((0..open).map(|_| json!({"kind":"open"})));
    json!({
        "id":id,"name":lobby.name,"status":lobby.status,"host":host,"member":lobby.member(me),
        "rules_version":galactic_reach::RULES,"ai_rivals":lobby.ai_rivals,"difficulty":lobby.difficulty,
        "victory_target":lobby.victory_target,"victory_targets":VICTORY_TARGETS,
        "max_ai_rivals":SEATS-lobby.humans(),"min_ai_rivals":u32::from(lobby.humans()==1),
        "difficulties":DIFFICULTIES.iter().map(|(id,name,about)|json!({"id":id,"name":name,"description":about})).collect::<Vec<_>>(),
        "seats":seats,"blocked":lobby.blocked(),
        "invite_url":host.then(|| format!("{}/?game=galactic-reach#lobby/{id}/{}", app.origin, lobby.invite)),
        "shared": lobby.shared,
        "table_url":(lobby.status=="started").then(|| if lobby.shared { crate::shared::url(id) } else { format!("/galactic-reach/?table={id}") }),
    })
}

#[derive(Deserialize, Default)]
pub struct Invite {
    #[serde(default)]
    invite: Option<String>,
}
fn valid_id(id: &str) -> ApiResult<()> {
    if id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(bad("Invalid table link."))
    }
}
fn invited(lobby: &Lobby, invite: Option<&str>) -> bool {
    invite.is_some_and(|t| t.len() == lobby.invite.len() && t == lobby.invite)
}

/// Members see the room; anyone holding the invite link may preview it before joining.
pub async fn get(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<Invite>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = load(&db, &id)?;
    if !lobby.member(&u.id) && !invited(&lobby, q.invite.as_deref()) {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "This waiting room does not exist.".into(),
        ));
    }
    Ok(Json(view(&app, &id, &lobby, &u.id)))
}

pub async fn join(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Invite>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = load(&db, &id)?;
    if !invited(&lobby, input.invite.as_deref()) && !lobby.member(&u.id) {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "This waiting room does not exist.".into(),
        ));
    }
    if !lobby.member(&u.id) {
        if lobby.status != "waiting" {
            return Err(bad("This game has already started."));
        }
        if lobby.humans() >= SEATS {
            return Err(bad("Every seat at this table is taken."));
        }
        db.execute(
            "INSERT INTO gr_lobby_seats(table_id,user_id,joined) VALUES(?,?,?)",
            params![id, u.id, now()],
        )
        .map_err(internal)?;
        // A friend takes an AI seat when the table is full.
        db.execute(
            "UPDATE gr_lobbies SET ai_rivals=min(ai_rivals,?) WHERE table_id=?",
            params![SEATS - lobby.humans() - 1, id],
        )
        .map_err(internal)?;
    }
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

pub async fn leave(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    valid_id(&id)?;
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    db.execute(
        "DELETE FROM gr_lobby_seats WHERE table_id=? AND user_id=?",
        params![id, u.id],
    )
    .map_err(internal)?;
    Ok(Json(json!({"left":true})))
}

#[derive(Deserialize)]
pub struct Settings {
    ai_rivals: u32,
    difficulty: String,
    #[serde(default = "default_victory_target")]
    victory_target: u32,
}
fn default_victory_target() -> u32 {
    DEFAULT_VICTORY_TARGET
}
fn host_lobby(db: &Connection, id: &str, me: &str) -> ApiResult<Lobby> {
    valid_id(id)?;
    let lobby = load(db, id)?;
    if lobby.owner.0 != me {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Only the host can change this table.".into(),
        ));
    }
    if lobby.status != "waiting" {
        return Err(bad("This game has already started."));
    }
    Ok(lobby)
}

pub async fn settings(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Settings>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let lobby = host_lobby(&db, &id, &u.id)?;
    if input.ai_rivals != lobby.ai_rivals || input.difficulty != lobby.difficulty {
        return Err(bad(
            "Rivals are fixed for now: Standard AI rivals fill every seat not taken by a player.",
        ));
    }
    // The Prestige target is the host's one table choice (rules #victory-target).
    if !VICTORY_TARGETS.contains(&input.victory_target) {
        return Err(bad("Choose a listed Prestige target."));
    }
    db.execute(
        "UPDATE gr_lobbies SET victory_target=? WHERE table_id=?",
        params![input.victory_target, id],
    )
    .map_err(internal)?;
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

pub async fn start(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let paired = {
        let db = app.store.0.lock().map_err(internal)?;
        crate::tabletop::enabled(&db, &id)?
    };
    if paired {
        return crate::tabletop::start_paired(State(app), headers, Path(id)).await;
    }
    let lobby = {
        let db = app.store.0.lock().map_err(internal)?;
        host_lobby(&db, &id, &u.id)?
    };
    if let Some(reason) = lobby.blocked() {
        return Err(ApiError(StatusCode::CONFLICT, reason.into()));
    }
    if !lobby.guests.is_empty() {
        // People take random seats (rulebook #shared-tables); AI rivals fill the rest.
        let people: Vec<(String, String)> = std::iter::once(lobby.owner.clone())
            .chain(lobby.guests.iter().cloned())
            .collect();
        let seats = crate::shared::random_seats(&people, &mut rand::thread_rng());
        #[cfg(test)]
        let seats = match app.shared.seed {
            Some(seed) => crate::shared::random_seats(
                &people,
                &mut <rand::rngs::StdRng as rand::SeedableRng>::from_seed(seed),
            ),
            None => seats,
        };
        app.shared
            .open(crate::shared::log::Table {
                id: id.clone(),
                name: lobby.name.clone(),
                rules: app.shared.channel.rules.clone(),
                authority: String::new(),
                status: "active".into(),
                seats,
                victory_target: lobby.victory_target,
                committed_only: false,
            })
            .await?;
    }
    let db = app.store.0.lock().map_err(internal)?;
    db.execute(
        "UPDATE gr_lobbies SET status='started' WHERE table_id=?",
        [&id],
    )
    .map_err(internal)?;
    Ok(Json(view(&app, &id, &load(&db, &id)?, &u.id)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn rulebook_masthead_names_the_current_rules() {
        let book = include_str!("../../../prototypes/galactic-reach/rulebook.html");
        let version = galactic_reach::RULES.rsplit('/').next().unwrap();
        assert!(book.contains(&format!(
            "{} · {version}",
            galactic_reach::EXPERIMENT.to_uppercase()
        )));
    }
}
