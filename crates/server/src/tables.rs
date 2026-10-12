//! Shared table shelf. Voidwright retains its authoritative multiplayer API;
//! Galactic Reach solo tables store private, unrated browser saves with CAS.
use crate::*;
use rusqlite::{Connection, OptionalExtension, params};
pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS solo_tables(
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES accounts(id),
        name TEXT NOT NULL, state TEXT, revision INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL, updated INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS solo_tables_owner ON solo_tables(owner_id,updated);",
    )
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
    let mut query=db.prepare("SELECT id,name,state,updated FROM solo_tables WHERE owner_id=? ORDER BY updated DESC,rowid DESC").map_err(internal)?;
    let rows = query
        .query_map([&u.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, u64>(3)?,
            ))
        })
        .map_err(internal)?;
    for row in rows {
        let (id, name, state, updated) = row.map_err(internal)?;
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
        result.push(json!({"id":id,"name":name,"game":"galactic-reach","status":status,"players":4,"round":save["state"]["round"].as_u64().unwrap_or(1),"url":table_url("galactic-reach",&id),"updated":updated}));
    }
    let mut query = db
        .prepare("SELECT state FROM games ORDER BY rowid DESC")
        .map_err(internal)?;
    for row in query
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(internal)?
    {
        let g: Game = serde_json::from_str(&row.map_err(internal)?).map_err(internal)?;
        if g.players.iter().any(|p| p.id == u.id) {
            result.push(json!({"id":g.id,"name":g.name,"game":"voidwright","status":g.status,"players":g.players.len(),"round":(g.players.iter().map(|p|p.turns).min().unwrap_or(0)+1).min(g.round_limit),"url":table_url("voidwright",&g.id)}));
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
            "This account has reached its 100 Galactic Reach table limit.",
        ));
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    db.execute(
        "INSERT INTO solo_tables(id,owner_id,name,created,updated) VALUES(?,?,?,?,?)",
        params![id, u.id, name, now(), now()],
    )
    .map_err(internal)?;
    Ok(Json(json!({"id":id,"url":table_url("galactic-reach",&id)})))
}
fn load(db: &Connection, id: &str, owner: &str) -> ApiResult<(String, Option<String>, u64)> {
    db.query_row(
        "SELECT name,state,revision FROM solo_tables WHERE id=? AND owner_id=?",
        params![id, owner],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
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
    let (name, state, revision) = load(&*app.store.0.lock().map_err(internal)?, &id, &u.id)?;
    let save: serde_json::Value = state
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(internal)?
        .unwrap_or_default();
    Ok(Json(
        json!({"id":id,"name":name,"owner_id":u.id,"revision":revision,"save":save}),
    ))
}
#[derive(Deserialize)]
pub struct Save {
    revision: u64,
    save: serde_json::Value,
}
fn validate(save: &serde_json::Value) -> ApiResult<()> {
    let s = &save["state"];
    if s["version"] != 5
        || s["rulesRevision"] != 10
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
        return Err(bad("This is not a supported Galactic Reach save."));
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
    if encoded.len() > 1024 * 1024 {
        return Err(bad("This save exceeds the table size limit."));
    }
    let db = app.store.0.lock().map_err(internal)?;
    let (_, current, revision) = load(&db, &id, &u.id)?;
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
        // A realistic size above the normal 16 KiB request limit is accepted here only.
        let save = json!({"state":{"version":5,"rulesRevision":10,"players":[{},{},{},{}],"planets":{},"fleets":{},"clusters":[],"round":3,"activePlayer":0,"phase":"policy","winner":null,"log":"x".repeat(40000)},"turnHistory":{"pending":null,"undo":null}});
        let body = json!({"revision":0,"save":save});
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
