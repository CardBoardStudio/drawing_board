//! Shared table shelf. Voidwright retains its authoritative multiplayer API;
//! Heirs Ad Astra solo tables store private, unrated browser saves with CAS.
use crate::*;
use rusqlite::{Connection, OptionalExtension, params};
pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS solo_tables(
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id),
        name TEXT NOT NULL, state TEXT, revision INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL, updated INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS solo_tables_owner ON solo_tables(owner_id,updated);",
    )?;
    let has_rules: bool = db
        .prepare("PRAGMA table_info(solo_tables)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|c| c == "rules_version");
    if !has_rules {
        db.execute_batch("ALTER TABLE solo_tables ADD COLUMN rules_version TEXT NOT NULL DEFAULT 'galactic-reach/4.9';
        UPDATE solo_tables SET rules_version='galactic-reach/' || json_extract(state,'$.state.version') || '.' || json_extract(state,'$.state.rulesRevision') WHERE state IS NOT NULL;")?;
    }
    // Additive: a game started alone keeps its chosen Prestige target with the table
    // (rules #victory-target). Null means the table never chose one here.
    let has_target = db
        .prepare("PRAGMA table_info(solo_tables)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .any(|c| c.as_deref() == Ok("victory_target"));
    if !has_target {
        db.execute_batch("ALTER TABLE solo_tables ADD COLUMN victory_target INTEGER;")?;
    }
    Ok(())
}
fn table_url(game: &str, id: &str) -> String {
    if game == "voidwright" {
        format!("/voidwright/#table/{id}")
    } else {
        format!("/galactic-reach/?table={id}")
    }
}
pub async fn list(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut result = vec![];
    let mut query=db.prepare("SELECT id,name,state,updated,rules_version FROM solo_tables WHERE owner_id=? ORDER BY updated DESC,rowid DESC").map_err(internal)?;
    let rows = query
        .query_map([&u.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, u64>(3)?,
                r.get::<_, String>(4)?,
            ))
        })
        .map_err(internal)?;
    for row in rows {
        let (id, name, state, updated, rules) = row.map_err(internal)?;
        let save: serde_json::Value = state
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(internal)?
            .unwrap_or_default();
        let status = if save.is_null() {
            "new"
        } else if save["state"]["winner"].is_null() {
            "active"
        } else {
            "finished"
        };
        let waiting =
            save.is_null() && crate::lobby::status(&db, &id)?.as_deref() == Some("waiting");
        let shared = crate::shared::status(&db, &id)?;
        let (status, url) = if let Some(shared) = shared.as_deref() {
            (shared, crate::shared::url(&id))
        } else if waiting && crate::tabletop::enabled(&db, &id)? {
            // Played with others: back to the waiting screen that holds its link.
            ("waiting", format!("/tabletop/host.html?table={id}"))
        } else if waiting {
            ("waiting", crate::lobby::url(&id))
        } else {
            (status, table_url("galactic-reach", &id))
        };
        result.push(json!({"id":id,"name":name,"game":"galactic-reach","rules_version":rules,"status":status,"players":4,"round":save["state"]["round"].as_u64().unwrap_or(1),"url":url,"updated":updated}));
    }
    drop(query);
    result.extend(crate::lobby::joined(&db, &u.id)?);
    let mut query = db
        .prepare("SELECT state FROM games ORDER BY rowid DESC")
        .map_err(internal)?;
    for row in query
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(internal)?
    {
        let g: Game = serde_json::from_str(&row.map_err(internal)?).map_err(internal)?;
        if g.players.iter().any(|p| p.id == u.id) {
            result.push(json!({"id":g.id,"name":g.name,"game":"voidwright","rules_version":RULES_VERSION,"status":g.status,"players":g.players.len(),"round":(g.players.iter().map(|p|p.turns).min().unwrap_or(0)+1).min(g.round_limit),"url":table_url("voidwright",&g.id)}));
        }
    }
    Ok(Json(result))
}
#[derive(Deserialize)]
pub struct Create {
    game: String,
    name: String,
    #[serde(default)]
    practice: bool,
    #[serde(default = "rounds")]
    round_limit: u16,
    /// Heirs Ad Astra: open a waiting room (invite link, seats, rivals) before Start.
    #[serde(default)]
    lobby: bool,
    /// Heirs Ad Astra played alone: the Prestige target for its first game
    /// (rules #victory-target). A waiting room's host chooses it in the room.
    #[serde(default)]
    victory_target: Option<u32>,
}
fn rounds() -> u16 {
    20
}
pub async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Create>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let name = clean(&input.name, 60)?;
    if input.game == "voidwright" {
        let Json(game) = create_game(
            State(app),
            headers,
            Json(CreateGame {
                name,
                practice: input.practice,
                round_limit: input.round_limit,
                opponent_id: None,
                setup: GameSetup::default(),
            }),
        )
        .await?;
        return Ok(Json(
            json!({"id":game.id,"url":table_url("voidwright",&game.id)}),
        ));
    }
    if input.game != "galactic-reach" {
        return Err(bad("Choose a supported game."));
    }
    if let Some(target) = input.victory_target
        && (input.lobby || !crate::lobby::VICTORY_TARGETS.contains(&target))
    {
        return Err(bad(if input.lobby {
            "Choose the Prestige target in the waiting room."
        } else {
            "Choose a listed Prestige target."
        }));
    }
    let db = app.store.0.lock().map_err(internal)?;
    let count: u32 = db
        .query_row(
            "SELECT count(*) FROM solo_tables WHERE owner_id=?",
            [&u.id],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if count >= 100 {
        return Err(bad(
            "This account has reached its 100 Heirs Ad Astra table limit.",
        ));
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    // Played alone, this row is the whole game: no waiting room, invitation or shared table.
    db.execute(
        "INSERT INTO solo_tables(id,owner_id,name,created,updated,rules_version,victory_target) VALUES(?,?,?,?,?,?,?)",
        params![id, u.id, name, now(), now(),galactic_reach::RULES,input.victory_target],
    )
    .map_err(internal)?;
    if input.lobby {
        crate::lobby::open(&db, &id)?;
        return Ok(Json(json!({"id":id,"url":crate::lobby::url(&id)})));
    }
    Ok(Json(json!({"id":id,"url":table_url("galactic-reach",&id)})))
}
fn load(
    db: &Connection,
    id: &str,
    owner: &str,
) -> ApiResult<(String, Option<String>, u64, String)> {
    db.query_row(
        "SELECT name,state,revision,rules_version FROM solo_tables WHERE id=? AND owner_id=?",
        params![id, owner],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
    .optional()
    .map_err(internal)?
    .ok_or(ApiError(
        StatusCode::NOT_FOUND,
        "Table not found in this account.".into(),
    ))
}
pub async fn get(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let (name, state, revision, rules) = load(&db, &id, &u.id)?;
    let lobby = crate::lobby::status(&db, &id)?;
    let settings = crate::lobby::table_settings(&db, &id)?;
    let shared = crate::shared::status(&db, &id)?.map(|_| crate::shared::url(&id));
    drop(db);
    let save: serde_json::Value = state
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(internal)?
        .unwrap_or_default();
    // A save dealt on the dev channel plays only on its own dev revision: name the page
    // that runs it, or null when this server does not keep that engine (table.js).
    let channel = &app.shared.channel;
    let dev_rules = save["state"]["devRules"]
        .as_str()
        .filter(|r| crate::shared::channel::is_dev_rules(r));
    let dev_client = dev_rules
        .filter(|r| channel.engine(r).is_some())
        .map(|r| channel.client_path(r));
    Ok(Json(
        json!({"id":id,"name":name,"owner_id":u.id,"revision":revision,"rules_version":rules,"dev_rules":dev_rules,"dev_client":dev_client,"save":save,"lobby":lobby,"lobby_url":crate::lobby::url(&id),"settings":settings,"shared_url":shared}),
    ))
}
#[derive(Deserialize)]
pub struct Save {
    revision: u64,
    save: serde_json::Value,
}
fn validate(save: &serde_json::Value) -> ApiResult<()> {
    let s = &save["state"];
    if !((s["version"] == 4 && s["rulesRevision"] == 9)
        || (s["version"] == 5 && s["rulesRevision"] == 10)
        || (s["version"] == 6 && s["rulesRevision"] == 11)
        || (s["version"] == 7 && s["rulesRevision"] == 12)
        || (s["version"] == 8 && s["rulesRevision"] == 13)
        || (s["version"] == 9 && s["rulesRevision"] == 14)
        || (s["version"] == 10 && s["rulesRevision"] == 15)
        || (s["version"] == 11 && s["rulesRevision"] == 16)
        || (s["version"] == 12 && s["rulesRevision"] == 17)
        || (s["version"] == 13 && s["rulesRevision"] == 18)
        || (s["version"] == 14 && s["rulesRevision"] == 19)
        || (s["version"] == 15 && s["rulesRevision"] == 20)
        || (s["version"] == 16 && s["rulesRevision"] == 21)
        || (s["version"] == 17 && s["rulesRevision"] == 22)
        || (s["version"] == 18 && s["rulesRevision"] == 23)
        || (s["version"] == 19 && s["rulesRevision"] == 24)
        || (s["version"] == 20 && s["rulesRevision"] == 25)
        || (s["version"] == 21 && s["rulesRevision"] == 26)
        || (s["version"] == 22 && s["rulesRevision"] == 27)
        || (s["version"] == 23 && s["rulesRevision"] == 28)
        || (s["version"] == 24 && s["rulesRevision"] == 29)
        || (s["version"] == 25 && s["rulesRevision"] == 30)
        || (s["version"] == 26 && s["rulesRevision"] == 31)
        || (s["version"] == 27 && s["rulesRevision"] == 32)
        || (s["version"] == 28 && s["rulesRevision"] == 33)
        || (s["version"] == 29 && s["rulesRevision"] == 34)
        || (s["version"] == 30 && s["rulesRevision"] == 35)
        || (s["version"] == 31 && s["rulesRevision"] == 36)
        || (s["version"] == 32 && s["rulesRevision"] == 37)
        || (s["version"] == 33 && s["rulesRevision"] == 38)
        || (s["version"] == 35 && s["rulesRevision"] == 40)
        || (s["version"] == 34 && s["rulesRevision"] == 39)
        || (s["version"] == 36 && s["rulesRevision"] == 41)
        || (s["version"] == 37 && s["rulesRevision"] == 42)
        || (s["version"] == 38 && s["rulesRevision"] == 43)
        || (s["version"] == 39 && s["rulesRevision"] == 44))
        || (s["version"].as_u64().unwrap_or(0) >= 12 && s["phase"] == "directive")
        || (s["version"].as_u64().is_some_and(|v| v >= 9) && s["phase"] == "policy")
        || s["players"].as_array().is_none_or(|p| p.len() != 4)
        || !s["planets"].is_object()
        || !s["fleets"].is_object()
        || !s["clusters"].is_array()
        || !s["round"].as_u64().is_some_and(|r| r > 0 && r < 100000)
        || !s["activePlayer"].as_u64().is_some_and(|r| r < 4)
        || !matches!(
            s["phase"].as_str(),
            Some(
                "production"
                    | "draw"
                    | "operations"
                    | "buy"
                    | "policy"
                    | "directive"
                    | "cleanup"
                    | "finished"
            )
        )
        || !(s["winner"].is_null() || s["winner"].as_u64().is_some_and(|r| r < 4))
    {
        return Err(bad("This is not a supported Heirs Ad Astra save."));
    }
    Ok(())
}
pub async fn save(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<Save>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    validate(&input.save)?;
    let encoded = serde_json::to_string(&input.save).map_err(internal)?;
    let size_limit = if input.save["state"]["version"]
        .as_u64()
        .is_some_and(|v| v >= 19)
    {
        8 * 1024 * 1024
    } else {
        1024 * 1024
    };
    if encoded.len() > size_limit {
        return Err(bad("This save exceeds the table size limit."));
    }
    let db = app.store.0.lock().map_err(internal)?;
    let (_, current, revision, rules) = load(&db, &id, &u.id)?;
    let incoming = format!(
        "galactic-reach/{}.{}",
        input.save["state"]["version"], input.save["state"]["rulesRevision"]
    );
    if incoming != rules {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "This table is pinned to another rules version. Open it from Your tables.".into(),
        ));
    }
    // Retry a successful save after a dropped response without creating a conflict.
    if current.as_deref() == Some(&encoded) {
        return Ok(Json(json!({"revision":revision})));
    }
    if revision != input.revision {
        return Err(ApiError(StatusCode::CONFLICT,"This table changed in another tab or device. Reload its latest save before continuing.".into()));
    }
    db.execute("UPDATE solo_tables SET state=?,revision=revision+1,updated=? WHERE id=? AND owner_id=? AND revision=?",params![encoded,now(),id,u.id,revision]).map_err(internal)?;
    Ok(Json(json!({"revision":revision+1})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{app, call};
    #[test]
    fn current_tables_skip_round_choices_but_archived_tables_keep_them() {
        let mut save = json!({"state":{
            "version":12,"rulesRevision":17,"players":[{},{},{},{}],
            "planets":{},"fleets":{},"clusters":[],"round":3,
            "activePlayer":0,"phase":"operations","winner":null
        }});
        assert!(validate(&save).is_ok());
        save["state"]["phase"] = json!("directive");
        assert!(validate(&save).is_err());
        save["state"]["version"] = json!(13);
        save["state"]["rulesRevision"] = json!(18);
        assert!(validate(&save).is_err());
        save["state"]["phase"] = json!("operations");
        assert!(validate(&save).is_ok());
        save["state"]["phase"] = json!("directive");
        save["state"]["version"] = json!(11);
        save["state"]["rulesRevision"] = json!(16);
        assert!(validate(&save).is_ok());
        save["state"]["phase"] = json!("policy");
        assert!(validate(&save).is_err());
        save["state"]["version"] = json!(8);
        save["state"]["rulesRevision"] = json!(13);
        assert!(validate(&save).is_ok());
    }
    #[test]
    fn old_tables_keep_their_rules_version() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE solo_tables(id TEXT,owner_id TEXT,name TEXT,state TEXT,revision INTEGER,created INTEGER,updated INTEGER);INSERT INTO solo_tables VALUES('old','a','old','{\"state\":{\"version\":5,\"rulesRevision\":10}}',1,1,1);INSERT INTO solo_tables VALUES('blank','a','blank',NULL,0,1,1);").unwrap();
        migrate(&db).unwrap();
        migrate(&db).unwrap();
        let versions: Vec<String> = db
            .prepare("SELECT rules_version FROM solo_tables")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(versions, vec!["galactic-reach/5.10", "galactic-reach/4.9"]);
        let v4 = json!({"state":{
            "version":4,"rulesRevision":9,"players":[{},{},{},{}],
            "planets":{},"fleets":{},"clusters":[],"round":1,
            "activePlayer":0,"phase":"operations","winner":null
        }});
        validate(&v4).unwrap();
    }
    async fn account(a: &App, name: &str) -> String {
        let (s, h, _) = call(
            a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":name}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        h[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .into()
    }
    #[tokio::test]
    async fn playing_alone_never_opens_a_waiting_room_invitation_or_shared_table() {
        let a = app(true);
        let me = account(&a, "Alone").await;
        // An unlisted target is refused, and a waiting room chooses its target in the room.
        for body in [
            json!({"game":"galactic-reach","name":"Alone","victory_target":35}),
            json!({"game":"galactic-reach","name":"Alone","victory_target":40,"lobby":true}),
        ] {
            assert_eq!(
                call(&a, "POST", "/api/tables", &me, body).await.0,
                StatusCode::BAD_REQUEST
            );
        }
        let (s, _, t) = call(
            &a,
            "POST",
            "/api/tables",
            &me,
            json!({"game":"galactic-reach","name":"Alone · Nov 21","victory_target":40}),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "{t}");
        let id = t["id"].as_str().unwrap().to_string();
        assert_eq!(t["url"], format!("/galactic-reach/?table={id}"));
        let table = call(&a, "GET", &format!("/api/tables/{id}"), &me, json!({}))
            .await
            .2;
        assert!(table["lobby"].is_null(), "{table}");
        assert!(table["shared_url"].is_null(), "{table}");
        assert_eq!(table["settings"]["victory_target"], 40);
        let shared_rows = |a: &App| {
            let db = a.store.0.lock().unwrap();
            [
                "gr_lobbies",
                "gr_lobby_seats",
                "tabletop_rooms",
                "tabletop_requests",
                "tabletop_grants",
                "gr_shared_tables",
            ]
            .map(|t| {
                db.query_row(&format!("SELECT count(*) FROM {t}"), [], |r| {
                    r.get::<_, u32>(0)
                })
                .unwrap()
            })
        };
        assert_eq!(shared_rows(&a), [0; 6], "created alone");
        // No waiting room, invitation, device link or shared table can be opened for it.
        for (method, path) in [
            ("GET", format!("/api/tables/{id}/lobby")),
            ("POST", format!("/api/tables/{id}/lobby/start")),
            ("POST", format!("/api/tabletop/{id}/phone-invite")),
            ("POST", format!("/api/tabletop/{id}/play-here")),
            ("POST", format!("/api/tabletop/{id}/host-phone")),
            ("POST", format!("/api/tabletop/{id}/board-grant")),
        ] {
            assert!(
                !call(&a, method, &path, &me, json!({})).await.0.is_success(),
                "{path}"
            );
        }
        assert_eq!(shared_rows(&a), [0; 6], "still alone after those requests");
        let shelf = call(&a, "GET", "/api/tables", &me, json!({})).await.2;
        assert_eq!(shelf[0]["url"], format!("/galactic-reach/?table={id}"));
        assert_eq!(shelf[0]["status"], "new");
        // A table created alone without a target keeps the engine default (null here).
        let (_, _, plain) = call(
            &a,
            "POST",
            "/api/tables",
            &me,
            json!({"game":"galactic-reach","name":"Plain"}),
        )
        .await;
        let plain = plain["id"].as_str().unwrap();
        let plain = call(&a, "GET", &format!("/api/tables/{plain}"), &me, json!({}))
            .await
            .2;
        assert!(plain["settings"].is_null(), "{plain}");
    }
    #[tokio::test]
    async fn galactic_reach_waiting_room_invites_seats_and_starts() {
        let a = app(true);
        let host = account(&a, "Host").await;
        let friend = account(&a, "Friend").await;
        let stranger = account(&a, "Stranger").await;
        let (s, _, t) = call(
            &a,
            "POST",
            "/api/tables",
            &host,
            json!({"game":"galactic-reach","name":"Friday","lobby":true}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        let id = t["id"].as_str().unwrap().to_string();
        assert_eq!(t["url"], format!("/?game=galactic-reach#lobby/{id}"));
        let lobby = format!("/api/tables/{id}/lobby");
        let room = call(&a, "GET", &lobby, &host, json!({})).await.2;
        assert_eq!(room["host"], true);
        assert_eq!(room["seats"].as_array().unwrap().len(), 4);
        assert!(
            room["blocked"].is_null(),
            "solo host with three standard rivals can start"
        );
        let invite_url = room["invite_url"].as_str().unwrap().to_string();
        let invite = invite_url.rsplit('/').next().unwrap().to_string();
        assert_eq!(
            call(&a, "GET", &lobby, &stranger, json!({})).await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("{lobby}/join"),
                &stranger,
                json!({"invite":"0".repeat(64)})
            )
            .await
            .0,
            StatusCode::NOT_FOUND
        );
        let preview = call(
            &a,
            "GET",
            &format!("{lobby}?invite={invite}"),
            &friend,
            json!({}),
        )
        .await
        .2;
        assert_eq!(preview["member"], false);
        assert!(
            preview["invite_url"].is_null(),
            "only the host sees the invite"
        );
        let joined = call(
            &a,
            "POST",
            &format!("{lobby}/join"),
            &friend,
            json!({"invite":invite}),
        )
        .await
        .2;
        assert_eq!(joined["member"], true);
        assert_eq!(joined["ai_rivals"], 2, "a friend takes an AI seat");
        assert!(
            joined["blocked"].is_null(),
            "two people and two rivals fill the table"
        );
        let shelf = call(&a, "GET", "/api/tables", &friend, json!({})).await.2;
        assert!(
            shelf
                .as_array()
                .unwrap()
                .iter()
                .any(|t| t["id"] == id.as_str() && t["guest"] == true && t["status"] == "waiting")
        );
        // Starting with the friend seated opens a shared table (shared::tests covers it).
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("{lobby}/settings"),
                &friend,
                json!({"ai_rivals":1,"difficulty":"easy"})
            )
            .await
            .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("{lobby}/settings"),
                &host,
                json!({"ai_rivals":3,"difficulty":"standard"})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST,
            "only two AI seats are free"
        );
        call(&a, "POST", &format!("{lobby}/leave"), &friend, json!({})).await;
        // Rivals are fixed: Standard rivals fill every seat a person has not taken.
        let room = call(&a, "GET", &lobby, &host, json!({})).await.2;
        assert_eq!(
            room["ai_rivals"], 3,
            "the friend's seat returns to an AI rival"
        );
        assert_eq!(room["difficulty"], "standard");
        assert!(room["blocked"].is_null());
        for choice in [
            json!({"ai_rivals":2,"difficulty":"standard"}),
            json!({"ai_rivals":3,"difficulty":"easy"}),
        ] {
            assert_eq!(
                call(&a, "POST", &format!("{lobby}/settings"), &host, choice)
                    .await
                    .0,
                StatusCode::BAD_REQUEST,
                "fewer or Easy rivals are not offered"
            );
        }
        // 31.36 #victory: the host picks the Prestige target; 30 by default.
        assert_eq!(
            call(&a, "GET", &lobby, &host, json!({})).await.2["victory_target"],
            30
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("{lobby}/settings"),
                &host,
                json!({"ai_rivals":3,"difficulty":"standard","victory_target":35})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST,
            "only listed targets"
        );
        call(
            &a,
            "POST",
            &format!("{lobby}/settings"),
            &host,
            json!({"ai_rivals":3,"difficulty":"standard","victory_target":30}),
        )
        .await;
        assert_eq!(
            call(&a, "GET", "/api/tables", &host, json!({})).await.2[0]["status"],
            "waiting"
        );
        let started = call(&a, "POST", &format!("{lobby}/start"), &host, json!({}))
            .await
            .2;
        assert_eq!(started["table_url"], format!("/galactic-reach/?table={id}"));
        assert_eq!(started["victory_target"], 30);
        assert_eq!(
            call(&a, "GET", &format!("/api/tables/{id}"), &host, json!({}))
                .await
                .2["settings"]["victory_target"],
            30,
            "the browser engine receives the chosen target"
        );
        assert_eq!(
            call(&a, "GET", &format!("/api/tables/{id}"), &host, json!({}))
                .await
                .2["lobby"],
            "started"
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("{lobby}/join"),
                &stranger,
                json!({"invite":invite})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST,
            "no joining after Start"
        );
    }
    #[tokio::test]
    async fn table_shelf_is_private_persistent_and_saves_use_revisions() {
        let path = std::env::temp_dir().join(format!("table-test-{}.sqlite", uuid::Uuid::new_v4()));
        let mut a = app(true);
        a.store = Arc::new(Store::open(path.to_str().unwrap()).unwrap());
        let owner = account(&a, "Owner").await;
        let other = account(&a, "Other").await;
        let (s, _, g) = call(
            &a,
            "POST",
            "/api/tables",
            &owner,
            json!({"game":"galactic-reach","name":"Expedition"}),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        let endpoint = format!("/api/tables/{}", g["id"].as_str().unwrap());
        let savepath = format!("{endpoint}/save");
        assert_eq!(
            call(&a, "GET", &endpoint, &owner, json!({})).await.2["save"],
            serde_json::Value::Null
        );
        assert_eq!(
            call(&a, "GET", &endpoint, &owner, json!({})).await.2["rules_version"],
            galactic_reach::RULES
        );
        // A realistic size above the normal 16 KiB request limit is accepted here only.
        let save = json!({"state":{"version":39,"rulesRevision":44,"players":[{},{},{},{}],"planets":{},"fleets":{},"clusters":[],"round":3,"activePlayer":0,"phase":"operations","winner":null,"log":"x".repeat(40000)},"turnHistory":{"pending":null,"undo":null},"gameHistory":{"format":1,"complete":true,"events":[{"text":"x".repeat(1100000)}]}});
        let body = json!({"revision":0,"save":save});
        let mut wrong = body.clone();
        wrong["save"]["state"]["version"] = json!(5);
        wrong["save"]["state"]["rulesRevision"] = json!(10);
        wrong["save"].as_object_mut().unwrap().remove("gameHistory");
        assert_eq!(
            call(&a, "POST", &savepath, &owner, wrong).await.0,
            StatusCode::CONFLICT
        );

        assert_eq!(
            call(&a, "POST", &savepath, &other, body.clone()).await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(&a, "GET", &endpoint, &other, json!({})).await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(&a, "GET", &endpoint, "", json!({})).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&a, "POST", &savepath, &owner, body.clone()).await.2["revision"],
            1
        );
        assert_eq!(
            call(&a, "POST", &savepath, &owner, body.clone()).await.2["revision"],
            1
        );
        let mut changed = body.clone();
        changed["save"]["state"]["round"] = json!(4);
        assert_eq!(
            call(&a, "POST", &savepath, &owner, changed.clone()).await.0,
            StatusCode::CONFLICT
        );
        changed["revision"] = json!(1);
        assert_eq!(
            call(&a, "POST", &savepath, &owner, changed.clone()).await.2["revision"],
            2
        );
        assert_eq!(
            call(
                &a,
                "POST",
                &savepath,
                &owner,
                json!({"revision":2,"save":{}})
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call(
                &a,
                "POST",
                "/api/tables",
                &owner,
                json!({"game":"voidwright","name":"Kepler practice","practice":true})
            )
            .await
            .0,
            StatusCode::OK
        );
        let shelf = call(&a, "GET", "/api/tables", &owner, json!({})).await.2;
        assert_eq!(shelf.as_array().unwrap().len(), 2);
        assert!(!shelf.to_string().contains("turnHistory"));
        assert_eq!(shelf[0]["round"], 4);
        assert_eq!(
            call(&a, "GET", "/api/tables", &other, json!({})).await.2,
            json!([])
        );
        // A fresh connection to the on-disk database retains accounts and full saves.
        a.store = Arc::new(Store::open(path.to_str().unwrap()).unwrap());
        let loaded = call(&a, "GET", &endpoint, &owner, json!({})).await.2;
        assert_eq!(loaded["save"], changed["save"]);
        assert_eq!(loaded["revision"], 2);
        drop(a);
        std::fs::remove_file(path).unwrap();
    }
}
