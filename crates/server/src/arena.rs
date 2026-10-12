//! Owner-scoped AI laboratories. Only completed authoritative simulations affect Elo.
use crate::*;
use game::agents::{BuiltinAgent, Strategy};
use game_core::{MatchResult, PlayerAgent, elo_pair, run_match};
use rusqlite::{Connection, OptionalExtension, params};

const POOL: &str = "voidwright/1:duel:20-rounds:policies-v1";
static WORKERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS ratings(
        account_id TEXT NOT NULL REFERENCES accounts(id), pool TEXT NOT NULL,
        elo REAL NOT NULL DEFAULT 1200, games INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(account_id,pool));
        CREATE TABLE IF NOT EXISTS arena_series(
        owner_id TEXT NOT NULL REFERENCES accounts(id), request_id TEXT NOT NULL,
        request TEXT NOT NULL, result TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY(owner_id,request_id));",
    )
}
pub async fn catalog() -> Json<serde_json::Value> {
    Json(json!({"games":[
        {"id":"galactic-reach","name":"Galactic Reach","href":"/galactic-reach/","mode":"Browser playtest","rated":false,"description":"Command a faction, explore the galaxy, and outmaneuver three AI rivals. Saved in this browser."},
        {"id":"voidwright","name":"Voidwright","href":"/voidwright/","mode":"Server tables + AI arena","rated":true,"description":"Build a fleet of cards. Play with friends or compare AI players in the rated arena."}
    ],"policies":[
        {"id":"explorer","version":"explorer/1","name":"Explorer","description":"Experiments with random purchases and sometimes passes."},
        {"id":"merchant","version":"merchant/1","name":"Merchant","description":"Builds a resource economy, then buys scoring colonies."},
        {"id":"kepler","version":"kepler/1","name":"Kepler","description":"Balances resource growth with a small action engine."}
    ],"pool":POOL}))
}
#[derive(Serialize)]
struct Bot {
    id: String,
    name: String,
    policy: String,
    elo: f64,
    games: u32,
    wins: u32,
    draws: u32,
}
pub async fn overview(
    State(app): State<App>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut query = db.prepare("SELECT a.id,a.name,a.policy,r.elo,r.games,r.wins,r.draws FROM accounts a JOIN ratings r ON r.account_id=a.id WHERE a.owner_id=? AND r.pool=? ORDER BY r.elo DESC,a.created,a.id").map_err(internal)?;
    let bots = query
        .query_map(params![u.id, POOL], |r| {
            Ok(Bot {
                id: r.get(0)?,
                name: r.get(1)?,
                policy: r.get(2)?,
                elo: r.get(3)?,
                games: r.get(4)?,
                wins: r.get(5)?,
                draws: r.get(6)?,
            })
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    let mut query = db
        .prepare("SELECT result FROM arena_series WHERE owner_id=? ORDER BY rowid DESC LIMIT 10")
        .map_err(internal)?;
    let series = query
        .query_map([u.id], |r| r.get::<_, String>(0))
        .map_err(internal)?
        .map(|r| serde_json::from_str::<serde_json::Value>(&r.map_err(internal)?).map_err(internal))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({"pool":POOL,"bots":bots,"series":series})))
}
#[derive(Deserialize)]
pub struct NewBot {
    name: String,
    strategy: Strategy,
}
pub async fn create_bot(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<NewBot>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let name = clean(&input.name, 32)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    let count: u32 = tx
        .query_row(
            "SELECT count(*) FROM accounts WHERE owner_id=?",
            [&u.id],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if count >= 12 {
        return Err(bad("This lab already has 12 AI accounts."));
    }
    let id = format!("ai:{}", uuid::Uuid::new_v4());
    tx.execute(
        "INSERT INTO accounts(id,name,kind,owner_id,policy,created) VALUES(?,?,'ai',?,?,?)",
        params![id, name, u.id, input.strategy.version(), now()],
    )
    .map_err(internal)?;
    tx.execute(
        "INSERT INTO ratings(account_id,pool) VALUES(?,?)",
        params![id, POOL],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"id":id})))
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SeriesRequest {
    request_id: String,
    bots: [String; 2],
    games: u8,
}
#[derive(Serialize, Deserialize)]
struct RatedMatch {
    id: String,
    seats: [String; 2],
    seed: String,
    agent_seeds: [String; 2],
    result: MatchResult,
    before: [f64; 2],
    after: [f64; 2],
}
#[derive(Serialize, Deserialize)]
struct SeriesResult {
    id: String,
    pool: String,
    created: u64,
    matches: Vec<RatedMatch>,
}
fn existing(
    db: &Connection,
    owner: &str,
    input: &SeriesRequest,
    request: &str,
) -> ApiResult<Option<serde_json::Value>> {
    let row: Option<(String, String)> = db
        .query_row(
            "SELECT request,result FROM arena_series WHERE owner_id=? AND request_id=?",
            params![owner, input.request_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(internal)?;
    match row {
        Some((saved, result)) if saved == request => {
            Ok(Some(serde_json::from_str(&result).map_err(internal)?))
        }
        Some(_) => Err(ApiError(
            StatusCode::CONFLICT,
            "This request ID was already used for a different series.".into(),
        )),
        None => Ok(None),
    }
}
pub fn strategy(version: &str) -> ApiResult<Strategy> {
    match version {
        "explorer/1" => Ok(Strategy::Explorer),
        "merchant/1" => Ok(Strategy::Merchant),
        "kepler/1" => Ok(Strategy::Kepler),
        _ => Err(bad("Unknown policy version.")),
    }
}
pub async fn run_series(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<SeriesRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    if uuid::Uuid::parse_str(&input.request_id).is_err()
        || input.bots[0] == input.bots[1]
        || !(2..=20).contains(&input.games)
        || !input.games.is_multiple_of(2)
    {
        return Err(bad(
            "Choose two distinct AI accounts and an even number of games from 2 to 20, with a UUID request ID.",
        ));
    }
    let request = serde_json::to_string(&input).map_err(internal)?;
    let policies = {
        let db = app.store.0.lock().map_err(internal)?;
        if let Some(result) = existing(&db, &u.id, &input, &request)? {
            return Ok(Json(result));
        }
        let mut policies = Vec::new();
        for id in &input.bots {
            let version: String = db
                .query_row(
                    "SELECT policy FROM accounts WHERE id=? AND owner_id=? AND kind='ai'",
                    params![id, u.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(internal)?
                .ok_or(ApiError(
                    StatusCode::FORBIDDEN,
                    "Choose AI accounts from your own lab.".into(),
                ))?;
            policies.push(strategy(&version)?);
        }
        let bucket = format!("arena:{}", u.id);
        db.execute("INSERT INTO auth_limits VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window",params![bucket,now()/60]).map_err(internal)?;
        let attempts: u32 = db
            .query_row(
                "SELECT attempts FROM auth_limits WHERE bucket=?",
                [bucket],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if attempts > 6 {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Six series per minute per lab. Try again shortly.".into(),
            ));
        }
        policies
    };
    let permit = WORKERS.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "The arena is busy. Try again shortly.".into(),
        )
    })?;
    // CPU work is bounded and off the async executor. The SQLite lock is released
    // throughout simulation, then results and all rating changes commit atomically.
    let result = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        simulate_series(&app, &u.id, input, policies, request)
    })
    .await
    .map_err(internal)??;
    Ok(Json(result))
}

fn simulate_series(
    app: &App,
    owner: &str,
    input: SeriesRequest,
    policies: Vec<Strategy>,
    request: String,
) -> ApiResult<serde_json::Value> {
    let mut matches = vec![];
    for pair in 0..input.games / 2 {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        for reverse in [false, true] {
            let order = if reverse { [1, 0] } else { [0, 1] };
            let seats = order.map(|i| input.bots[i].clone());
            let id = uuid::Uuid::new_v4().to_string();
            let mut game = Game::new(
                id.clone(),
                "AI arena".into(),
                seats[0].clone(),
                "Seat one".into(),
                seed,
                20,
            )
            .map_err(internal)?;
            game.join(seats[1].clone(), "Seat two".into(), true)
                .map_err(internal)?;
            game.apply(&seats[0], Command::Start).map_err(internal)?;
            let agent_seeds = order.map(|i| {
                let mut agent_seed = seed;
                agent_seed[0] ^= i as u8 + 1;
                agent_seed[1] ^= pair;
                hex::encode(agent_seed)
            });
            let mut agents: Vec<Box<dyn PlayerAgent<Game>>> = order
                .iter()
                .map(|&i| {
                    let mut agent_seed = seed;
                    agent_seed[0] ^= i as u8 + 1;
                    agent_seed[1] ^= pair;
                    Box::new(BuiltinAgent::new(policies[i], agent_seed))
                        as Box<dyn PlayerAgent<Game>>
                })
                .collect();
            let result = run_match(&mut game, &mut agents, 10000).map_err(internal)?;
            matches.push(RatedMatch {
                id,
                seats,
                seed: hex::encode(seed),
                agent_seeds,
                result,
                before: [0.0; 2],
                after: [0.0; 2],
            });
        }
    }
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    // Concurrent retries may have finished while this simulation ran.
    if let Some(result) = existing(&tx, owner, &input, &request)? {
        return Ok(result);
    }
    for game in &mut matches {
        for i in 0..2 {
            game.before[i] = tx
                .query_row(
                    "SELECT elo FROM ratings WHERE account_id=? AND pool=?",
                    params![game.seats[i], POOL],
                    |r| r.get(0),
                )
                .map_err(internal)?;
        }
        game.after = elo_pair(game.before, [game.result.scores[0], game.result.scores[1]])
            .map_err(internal)?;
        for i in 0..2 {
            tx.execute("UPDATE ratings SET elo=?,games=games+1,wins=wins+?,draws=draws+? WHERE account_id=? AND pool=?",params![game.after[i],game.result.scores[i]>game.result.scores[1-i],game.result.scores[i]==game.result.scores[1-i],game.seats[i],POOL]).map_err(internal)?;
        }
    }
    let result = serde_json::to_value(SeriesResult {
        id: input.request_id.clone(),
        pool: POOL.into(),
        created: now(),
        matches,
    })
    .map_err(internal)?;
    tx.execute(
        "INSERT INTO arena_series VALUES(?,?,?,?,?)",
        params![owner, input.request_id, request, result.to_string(), now()],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok::<_, ApiError>(result)
}
