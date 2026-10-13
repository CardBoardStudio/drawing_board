//! Owner-scoped AI laboratories. Only completed authoritative simulations affect Elo.
use crate::*;
#[path = "replays.rs"]
pub mod replays;
use game::agents::{BuiltinAgent, Strategy};
use game_core::{MatchResult, PlayerAgent, elo_multiplayer, run_match};
use rusqlite::{Connection, OptionalExtension, params};

#[derive(Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GameKind {
    #[default]
    Voidwright,
    GalacticReach,
}
impl GameKind {
    fn is_default(&self) -> bool {
        *self == Self::Voidwright
    }
    fn pool(self) -> &'static str {
        match self {
            Self::Voidwright => "voidwright/1:duel:20-rounds:policies-v1",
            Self::GalacticReach => "galactic-reach/6.11:four-player:placement:policies-v3",
        }
    }
    fn seats(self) -> usize {
        if self == Self::Voidwright { 2 } else { 4 }
    }
    fn validate_policy(self, version: &str) -> ApiResult<()> {
        match self {
            Self::Voidwright => {
                strategy(version)?;
            }
            Self::GalacticReach => {
                galactic_reach::Strategy::parse(version)
                    .ok_or_else(|| bad("Choose a Galactic Reach policy."))?;
            }
        }
        Ok(())
    }
    fn simulate(
        self,
        id: &str,
        seed: [u8; 32],
        policies: &[String],
        agent_seeds: &[[u8; 32]],
    ) -> Result<(MatchResult, Option<serde_json::Value>), String> {
        match self {
            Self::Voidwright => {
                let mut game = Game::new(
                    id.into(),
                    "AI arena".into(),
                    "a".into(),
                    "Seat one".into(),
                    seed,
                    20,
                )?;
                game.join("b".into(), "Seat two".into(), true)?;
                game.apply("a", Command::Start)?;
                let mut agents: Vec<Box<dyn PlayerAgent<Game>>> = policies
                    .iter()
                    .zip(agent_seeds)
                    .map(|(p, seed)| {
                        Ok(Box::new(BuiltinAgent::new(
                            strategy(p).map_err(|_| "Invalid Voidwright policy")?,
                            *seed,
                        )) as Box<dyn PlayerAgent<Game>>)
                    })
                    .collect::<Result<_, String>>()?;
                run_match(&mut game, &mut agents, 10000).map(|result| (result, None))
            }
            Self::GalacticReach => {
                replays::simulate(seed, galactic_reach::RULES, policies, agent_seeds)
                    .map(|(result, replay)| (result, Some(replay)))
            }
        }
    }
}
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
        PRIMARY KEY(owner_id,request_id));
        CREATE TABLE IF NOT EXISTS arena_replays(owner_id TEXT NOT NULL REFERENCES accounts(id),match_id TEXT NOT NULL,summary TEXT NOT NULL,replay TEXT NOT NULL,PRIMARY KEY(owner_id,match_id));",
    )
}
pub async fn catalog() -> Json<serde_json::Value> {
    Json(json!({"games":[
        {"id":"galactic-reach","name":"Galactic Reach","href":"/galactic-reach/","rules_version":galactic_reach::RULES,"mode":"Browser playtest + AI arena","rated":true,"seats":4,"pool":GameKind::GalacticReach.pool(),"description":"Long Reach experiment: explore a larger random galaxy against three AI rivals. Play to 20 Prestige; start a new game."},
        {"id":"voidwright","name":"Voidwright","href":"/voidwright/","rules_version":RULES_VERSION,"mode":"Server tables + AI arena","rated":true,"seats":2,"pool":GameKind::Voidwright.pool(),"description":"Build a fleet of cards. Play with friends or compare AI players in the rated arena."}
    ],"policies":[
        {"game":"voidwright","id":"explorer","version":"explorer/1","name":"Explorer","description":"Experiments with random purchases and sometimes passes."},
        {"game":"voidwright","id":"merchant","version":"merchant/1","name":"Merchant","description":"Builds a resource economy, then buys scoring colonies."},
        {"game":"voidwright","id":"kepler","version":"kepler/1","name":"Kepler","description":"Balances resource growth with a small action engine."}
        ,{"game":"galactic-reach","id":"gr-military","version":"gr-military/3","name":"Vanguard","description":"Builds warships and shipyards, then moves toward rival colonies."}
        ,{"game":"galactic-reach","id":"gr-economy","version":"gr-economy/3","name":"Architect","description":"Prioritizes production, storage, and terraforming."}
        ,{"game":"galactic-reach","id":"gr-expansion","version":"gr-expansion/3","name":"Pathfinder","description":"Builds Scouts and seeks new colony sites."}
        ,{"game":"galactic-reach","id":"gr-wanderer","version":"gr-wanderer/3","name":"Wanderer","description":"Samples useful legal actions with seeded randomness."}
    ],"pool":GameKind::Voidwright.pool()}))
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
#[derive(Default, Deserialize)]
pub struct ArenaQuery {
    #[serde(default)]
    game: GameKind,
}
pub async fn overview(
    State(app): State<App>,
    axum::extract::Query(query): axum::extract::Query<ArenaQuery>,
    headers: HeaderMap,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let pool = query.game.pool();
    let db = app.store.0.lock().map_err(internal)?;
    let mut query = db.prepare("SELECT a.id,a.name,a.policy,r.elo,r.games,r.wins,r.draws FROM accounts a JOIN ratings r ON r.account_id=a.id WHERE a.owner_id=? AND r.pool=? ORDER BY r.elo DESC,a.created,a.id").map_err(internal)?;
    let bots = query
        .query_map(params![u.id, pool], |r| {
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
        .prepare("SELECT result FROM arena_series WHERE owner_id=? AND json_extract(result,'$.pool')=? ORDER BY rowid DESC LIMIT 10")
        .map_err(internal)?;
    let series = query
        .query_map(params![u.id, pool], |r| r.get::<_, String>(0))
        .map_err(internal)?
        .map(|r| serde_json::from_str::<serde_json::Value>(&r.map_err(internal)?).map_err(internal))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({"pool":pool,"bots":bots,"series":series})))
}
#[derive(Deserialize)]
pub struct NewBot {
    name: String,
    strategy: String,
    #[serde(default)]
    game: GameKind,
}
pub async fn create_bot(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<NewBot>,
) -> ApiResult<Json<serde_json::Value>> {
    let u = user(&app, &headers)?;
    let name = clean(&input.name, 32)?;
    let version = format!(
        "{}/{}",
        input.strategy,
        if input.game == GameKind::GalacticReach {
            3
        } else {
            1
        }
    );
    input.game.validate_policy(&version)?;
    let mut db = app.store.0.lock().map_err(internal)?;
    let tx = db.transaction().map_err(internal)?;
    let count: u32 = tx
        .query_row(
            "SELECT count(*) FROM accounts a JOIN ratings r ON r.account_id=a.id WHERE a.owner_id=? AND r.pool=?",
            params![u.id, input.game.pool()],
            |r| r.get(0),
        )
        .map_err(internal)?;
    if count >= 12 {
        return Err(bad("This lab already has 12 AI accounts."));
    }
    let id = format!("ai:{}", uuid::Uuid::new_v4());
    tx.execute(
        "INSERT INTO accounts(id,name,kind,owner_id,policy,created) VALUES(?,?,'ai',?,?,?)",
        params![id, name, u.id, version, now()],
    )
    .map_err(internal)?;
    tx.execute(
        "INSERT INTO ratings(account_id,pool) VALUES(?,?)",
        params![id, input.game.pool()],
    )
    .map_err(internal)?;
    tx.commit().map_err(internal)?;
    Ok(Json(json!({"id":id})))
}
#[derive(Clone, Serialize, Deserialize)]
pub struct SeriesRequest {
    request_id: String,
    bots: Vec<String>,
    #[serde(default, skip_serializing_if = "GameKind::is_default")]
    game: GameKind,
    games: u8,
}
#[derive(Serialize, Deserialize)]
struct RatedMatch {
    id: String,
    seats: Vec<String>,
    seed: String,
    agent_seeds: Vec<String>,
    result: MatchResult,
    before: Vec<f64>,
    after: Vec<f64>,
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
        || input.bots.len() != input.game.seats()
        || input
            .bots
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != input.bots.len()
        || !(2..=20).contains(&input.games)
        || !input.games.is_multiple_of(input.game.seats() as u8)
    {
        return Err(bad(
            "Choose distinct AI accounts for every seat and 2–20 games in complete seat rotations, with a UUID request ID.",
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
            input.game.validate_policy(&version)?;
            policies.push(version);
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
    policies: Vec<String>,
    request: String,
) -> ApiResult<serde_json::Value> {
    let mut matches = vec![];
    let mut replays = vec![];
    let count = input.game.seats();
    for cycle in 0..input.games as usize / count {
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        for rotation in 0..count {
            let order: Vec<_> = (0..count).map(|seat| (seat + rotation) % count).collect();
            let seats = order.iter().map(|&i| input.bots[i].clone()).collect();
            let id = uuid::Uuid::new_v4().to_string();
            let agent_seeds: Vec<_> = order
                .iter()
                .map(|&i| {
                    let mut agent_seed = seed;
                    agent_seed[0] ^= i as u8 + 1;
                    agent_seed[1] ^= cycle as u8;
                    agent_seed
                })
                .collect();
            let ordered_policies: Vec<_> = order.iter().map(|&i| policies[i].clone()).collect();
            let (result, replay) = input
                .game
                .simulate(&id, seed, &ordered_policies, &agent_seeds)
                .map_err(internal)?;
            tracing::info!(
                completed = matches.len() + 1,
                total = input.games,
                "Arena match completed"
            );
            replays.push(replay);
            matches.push(RatedMatch {
                id,
                seats,
                seed: hex::encode(seed),
                agent_seeds: agent_seeds.iter().map(hex::encode).collect(),
                result,
                before: vec![0.0; count],
                after: vec![0.0; count],
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
        for i in 0..count {
            game.before[i] = tx
                .query_row(
                    "SELECT elo FROM ratings WHERE account_id=? AND pool=?",
                    params![game.seats[i], input.game.pool()],
                    |r| r.get(0),
                )
                .map_err(internal)?;
        }
        game.after = elo_multiplayer(&game.before, &game.result.scores).map_err(internal)?;
        let top = game
            .result
            .scores
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max);
        let leaders = game
            .result
            .scores
            .iter()
            .filter(|&&score| score == top)
            .count();
        for i in 0..count {
            tx.execute("UPDATE ratings SET elo=?,games=games+1,wins=wins+?,draws=draws+? WHERE account_id=? AND pool=?",params![game.after[i],game.result.scores[i]==top && leaders==1,game.result.scores[i]==top && leaders>1,game.seats[i],input.game.pool()]).map_err(internal)?;
        }
    }
    for (game, replay) in matches.iter().zip(replays) {
        if let Some(replay) = replay {
            replays::store(&tx, owner, input.game.pool(), game, replay)?;
        }
    }
    let result = serde_json::to_value(SeriesResult {
        id: input.request_id.clone(),
        pool: input.game.pool().into(),
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

/// Local host maintenance command: use the same authoritative series and Elo
/// transaction as the API. No session impersonation or client-supplied scores.
pub fn calibrate(
    app: &App,
    owner: &str,
    games: u8,
    request_id: &str,
) -> ApiResult<serde_json::Value> {
    if uuid::Uuid::parse_str(request_id).is_err()
        || !(4..=20).contains(&games)
        || !games.is_multiple_of(4)
    {
        return Err(bad(
            "Use a UUID request ID and 4–20 games in full four-seat rotations.",
        ));
    }
    let game = GameKind::GalacticReach;
    let policies: Vec<String> = [
        "gr-military/3",
        "gr-economy/3",
        "gr-expansion/3",
        "gr-wanderer/3",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    let bots: Vec<String> = policies
        .iter()
        .map(|policy| {
            format!(
                "ai:baseline:{}",
                digest(&format!("{owner}:{}:{policy}", game.pool()))
            )
        })
        .collect();
    let input = SeriesRequest {
        request_id: request_id.into(),
        bots: bots.clone(),
        game,
        games,
    };
    let request = serde_json::to_string(&input).map_err(internal)?;
    {
        let mut db = app.store.0.lock().map_err(internal)?;
        let tx = db.transaction().map_err(internal)?;
        let human: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM accounts WHERE id=? AND kind='human')",
                [owner],
                |r| r.get(0),
            )
            .map_err(internal)?;
        if !human {
            return Err(bad("Choose an existing human account ID as the owner."));
        }
        if let Some(result) = existing(&tx, owner, &input, &request)? {
            return Ok(result);
        }
        let count: usize = tx.query_row("SELECT count(*) FROM accounts a JOIN ratings r ON r.account_id=a.id WHERE a.owner_id=? AND r.pool=?", params![owner,game.pool()], |r|r.get(0)).map_err(internal)?;
        let mut missing = 0;
        for id in &bots {
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM ratings WHERE account_id=? AND pool=?)",
                    params![id, game.pool()],
                    |r| r.get(0),
                )
                .map_err(internal)?;
            if !exists {
                missing += 1;
            }
        }
        if count + missing > 12 {
            return Err(bad(
                "This lab has no room for four baseline AI accounts (12 per rules pool).",
            ));
        }
        for ((id, policy), name) in bots.iter().zip(&policies).zip([
            "Military baseline",
            "Economy baseline",
            "Expansion baseline",
            "Wanderer baseline",
        ]) {
            tx.execute("INSERT OR IGNORE INTO accounts(id,name,kind,owner_id,policy,created) VALUES(?,?,'ai',?,?,?)",params![id,name,owner,policy,now()]).map_err(internal)?;
            tx.execute(
                "INSERT OR IGNORE INTO ratings(account_id,pool) VALUES(?,?)",
                params![id, game.pool()],
            )
            .map_err(internal)?;
        }
        tx.commit().map_err(internal)?;
    }
    simulate_series(app, owner, input, policies, request)
}

#[cfg(test)]
mod calibration_tests {
    use super::*;
    #[test]
    fn calibration_rejects_unknown_owners_and_invalid_rotations() {
        let app = App {
            store: Arc::new(Store::open(":memory:").unwrap()),
            dev_auth: false,
            preview_code_hash: None,
            registration_code_hash: None,
            origin: "http://localhost:3000".into(),
            nido: Arc::new(
                nido::Config::new(false, "https://soroban-testnet.stellar.org".into()).unwrap(),
            ),
        };
        let id = uuid::Uuid::new_v4().to_string();
        assert!(calibrate(&app, "missing", 20, &id).is_err());
        assert!(calibrate(&app, "missing", 3, &id).is_err());
        assert!(calibrate(&app, "missing", 20, "invalid").is_err());
    }
}
