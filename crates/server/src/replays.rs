//! Owner-scoped, completed Galactic Reach matches. Replaying never updates ratings.
use super::*;
use serde_json::Value;
pub(super) fn simulate(
    seed: [u8; 32],
    rules: &str,
    policies: &[String],
    agent_seeds: &[[u8; 32]],
) -> Result<(MatchResult, Value), String> {
    let mut game = galactic_reach::GalacticReach::with_rules(seed, rules)?;
    let mut agents: Vec<_> = policies
        .iter()
        .zip(agent_seeds)
        .map(|(policy, seed)| galactic_reach::agent(policy, *seed))
        .collect::<Result<_, _>>()?;
    game.start_trace()?;
    let result = run_match(&mut game, &mut agents, 10000)?;
    Ok((result, game.take_trace().unwrap().finish()))
}
pub(super) fn store(
    db: &Connection,
    owner: &str,
    pool: &str,
    game: &RatedMatch,
    mut replay: Value,
) -> ApiResult<()> {
    let names = game
        .seats
        .iter()
        .map(|id| {
            db.query_row("SELECT name FROM accounts WHERE id=?", [id], |r| {
                r.get::<_, String>(0)
            })
            .map_err(internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let summary = json!({"id":game.id,"rules_version":game.result.rules_version,"pool":pool,"names":names,"policies":game.result.policies,"before":game.before,"after":game.after,"metrics":replay["summary"],"ready":true});
    replay["match"] = summary.clone();
    db.execute(
        "INSERT OR IGNORE INTO arena_replays(owner_id,match_id,summary,replay) VALUES(?,?,?,?)",
        params![owner, game.id, summary.to_string(), replay.to_string()],
    )
    .map_err(internal)?;
    Ok(())
}
fn matches(db: &Connection, owner: &str) -> ApiResult<Vec<(String, RatedMatch)>> {
    let mut q=db.prepare("SELECT result FROM arena_series WHERE owner_id=? AND json_extract(result,'$.pool') LIKE 'galactic-reach/%' ORDER BY created DESC LIMIT 100").map_err(internal)?;
    let mut result = vec![];
    for row in q
        .query_map([owner], |r| r.get::<_, String>(0))
        .map_err(internal)?
    {
        let series: SeriesResult =
            serde_json::from_str(&row.map_err(internal)?).map_err(internal)?;
        for game in series.matches {
            result.push((series.pool.clone(), game));
        }
    }
    Ok(result)
}
pub async fn list(State(app): State<App>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    let db = app.store.0.lock().map_err(internal)?;
    let mut rows = vec![];
    for (pool, game) in matches(&db, &u.id)? {
        let cached: Option<String> = db
            .query_row(
                "SELECT summary FROM arena_replays WHERE owner_id=? AND match_id=?",
                params![u.id, game.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(internal)?;
        let summary = if let Some(cached) = cached {
            serde_json::from_str(&cached).map_err(internal)?
        } else {
            json!({"id":game.id,"pool":pool,"rules_version":game.result.rules_version,"ready":false})
        };
        rows.push(summary);
    }
    rows.sort_by(|a, b| {
        b["metrics"]["interest"]
            .as_u64()
            .cmp(&a["metrics"]["interest"].as_u64())
            .then(a["id"].as_str().cmp(&b["id"].as_str()))
    });
    Ok(Json(
        json!({"matches":rows,"ranking":"40 per lead change + 5 per battle + 2 × max(0, 20 − final Prestige gap)","series_limit":100}),
    ))
}
fn cached(app: &App, owner: &str, id: &str) -> ApiResult<Option<Value>> {
    let db = app.store.0.lock().map_err(internal)?;
    let value: Option<String> = db
        .query_row(
            "SELECT replay FROM arena_replays WHERE owner_id=? AND match_id=?",
            params![owner, id],
            |r| r.get(0),
        )
        .optional()
        .map_err(internal)?;
    value
        .map(|s| serde_json::from_str(&s).map_err(internal))
        .transpose()
}
fn build(app: &App, owner: &str, id: &str) -> ApiResult<Value> {
    if let Some(value) = cached(app, owner, id)? {
        return Ok(value);
    }
    let (pool, game) = {
        let db = app.store.0.lock().map_err(internal)?;
        matches(&db, owner)?
            .into_iter()
            .find(|(_, g)| g.id == id)
            .ok_or(ApiError(
                StatusCode::NOT_FOUND,
                "Completed match not found in this lab.".into(),
            ))?
    };
    let decode = |seed: &str| -> ApiResult<[u8; 32]> {
        hex::decode(seed)
            .map_err(internal)?
            .try_into()
            .map_err(|_| bad("Invalid saved seed."))
    };
    let seeds = game
        .agent_seeds
        .iter()
        .map(|s| decode(s))
        .collect::<ApiResult<Vec<_>>>()?;
    let (result, replay) = simulate(
        decode(&game.seed)?,
        &game.result.rules_version,
        &game.result.policies,
        &seeds,
    )
    .map_err(internal)?;
    if result != game.result {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Replay does not match the recorded result. Original ratings are preserved.".into(),
        ));
    }
    {
        let db = app.store.0.lock().map_err(internal)?;
        store(&db, owner, &pool, &game, replay)?;
    }
    cached(app, owner, id)?.ok_or_else(|| bad("Replay could not be loaded."))
}
pub async fn get(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let u = user(&app, &headers)?;
    if let Some(value) = cached(&app, &u.id, &id)? {
        return Ok(Json(value));
    }
    let permit = WORKERS.try_acquire().map_err(|_| {
        ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "The arena is busy. Try again shortly.".into(),
        )
    })?;
    Ok(Json(
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            build(&app, &u.id, &id)
        })
        .await
        .map_err(internal)??,
    ))
}
pub fn index(app: &App, owner: &str) -> ApiResult<usize> {
    let games = {
        let db = app.store.0.lock().map_err(internal)?;
        matches(&db, owner)?
    };
    let count = games.len();
    for (i, (_, game)) in games.into_iter().enumerate() {
        build(app, owner, &game.id)?;
        tracing::info!(completed = i + 1, total = count, "Replay verified");
    }
    Ok(count)
}
