use crate::tests::{app, call};
use crate::*;

fn session_cookie(headers: &HeaderMap) -> String {
    headers[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .into()
}
async fn register_account(a: &App, name: &str) -> (String, String) {
    let (status, h, v) = call(
        a,
        "POST",
        "/api/accounts/register",
        "",
        json!({"name":name}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    (
        session_cookie(&h),
        v["recovery_key"].as_str().unwrap().into(),
    )
}
#[tokio::test]
async fn accounts_survive_logout_and_keys_rotate_atomically() {
    let a = app(true);
    let (cookie, key) = register_account(&a, "Ada").await;
    assert!(key.starts_with("dbk_") && key.len() == 68);
    let me = call(&a, "GET", "/api/account", &cookie, json!({})).await.2;
    let (_, _, game) = call(
        &a,
        "POST",
        "/api/games",
        &cookie,
        json!({"name":"Persistent","practice":true,"round_limit":10}),
    )
    .await;
    call(&a, "POST", "/api/auth/logout", &cookie, json!({})).await;
    assert_eq!(
        call(&a, "GET", "/api/account", &cookie, json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, h, _) = call(
        &a,
        "POST",
        "/api/accounts/login",
        "",
        json!({"recovery_key":key}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let first = session_cookie(&h);
    assert_eq!(
        call(&a, "GET", "/api/account", &first, json!({})).await.2["id"],
        me["id"]
    );
    assert_eq!(
        call(
            &a,
            "GET",
            &format!("/api/games/{}", game["id"].as_str().unwrap()),
            &first,
            json!({})
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
        json!({"recovery_key":key}),
    )
    .await;
    let second = session_cookie(&h);
    call(
        &a,
        "POST",
        "/api/account",
        &first,
        json!({"name":"Ada Lovelace"}),
    )
    .await;
    assert_eq!(
        call(&a, "GET", "/api/account", &second, json!({})).await.2["name"],
        "Ada Lovelace"
    );
    call(
        &a,
        "POST",
        "/api/account/revoke-sessions",
        &first,
        json!({}),
    )
    .await;
    assert_eq!(
        call(&a, "GET", "/api/account", &second, json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, h, rotated) = call(&a, "POST", "/api/account/rotate-key", &first, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let new_cookie = session_cookie(&h);
    assert_eq!(
        call(&a, "GET", "/api/account", &first, json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&a, "GET", "/api/account", &new_cookie, json!({}))
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/accounts/login",
            "",
            json!({"recovery_key":key})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/accounts/login",
            "",
            json!({"recovery_key":rotated["recovery_key"]})
        )
        .await
        .0,
        StatusCode::OK
    );
    let db = a.store.0.lock().unwrap();
    let stored: String = db
        .query_row(
            "SELECT credential_hash FROM accounts WHERE id=?",
            [me["id"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stored, digest(rotated["recovery_key"].as_str().unwrap()));
    assert_ne!(stored, rotated["recovery_key"]);
}
#[tokio::test]
async fn public_enrollment_requires_code_and_limits_requests() {
    let mut a = app(false);
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"A"})
        )
        .await
        .0,
        StatusCode::FORBIDDEN
    );
    a.registration_code_hash = Some(Sha256::digest(b"test-enrollment-code-with-entropy").into());
    a.origin = "https://lab.example".into();
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/accounts/register",
            "",
            json!({"name":"A","code":"wrong"})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (status, h, _) = call(
        &a,
        "POST",
        "/api/accounts/register",
        "",
        json!({"name":"A","code":"test-enrollment-code-with-entropy"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(h[header::SET_COOKIE].to_str().unwrap().contains("; Secure"));
    a.store
        .0
        .lock()
        .unwrap()
        .execute(
            "UPDATE auth_limits SET attempts=120 WHERE bucket='accounts'",
            [],
        )
        .unwrap();
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/accounts/login",
            "",
            json!({"recovery_key":"bad"})
        )
        .await
        .0,
        StatusCode::TOO_MANY_REQUESTS
    );
}
#[tokio::test]
async fn arena_enforces_ownership_pairs_seats_and_rates_exactly_once() {
    let a = app(true);
    let (owner, _) = register_account(&a, "Owner").await;
    let (other, _) = register_account(&a, "Other").await;
    let mut bots = vec![];
    for (name, strategy) in [("Explorer", "explorer"), ("Kepler", "kepler")] {
        let (status, _, v) = call(
            &a,
            "POST",
            "/api/arena/bots",
            &owner,
            json!({"name":name,"strategy":strategy}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        bots.push(v["id"].as_str().unwrap().to_string());
    }
    let request = json!({"request_id":uuid::Uuid::new_v4().to_string(),"bots":bots,"games":2});
    assert_eq!(
        call(&a, "POST", "/api/arena/series", "", request.clone())
            .await
            .0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        call(&a, "POST", "/api/arena/series", &other, request.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (status, _, result) = call(&a, "POST", "/api/arena/series", &owner, request.clone()).await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["matches"].as_array().unwrap().len(), 2);
    assert_eq!(result["matches"][0]["seed"], result["matches"][1]["seed"]);
    assert_eq!(
        result["matches"][0]["seats"][0],
        result["matches"][1]["seats"][1]
    );
    let (_, _, retry) = call(&a, "POST", "/api/arena/series", &owner, request.clone()).await;
    assert_eq!(result, retry);
    let mut changed = request.clone();
    changed["games"] = json!(4);
    assert_eq!(
        call(&a, "POST", "/api/arena/series", &owner, changed)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let ladder = call(&a, "GET", "/api/arena", &owner, json!({})).await.2;
    assert!(
        ladder["bots"]
            .as_array()
            .unwrap()
            .iter()
            .all(|b| b["games"] == 2)
    );
    let total: f64 = ladder["bots"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["elo"].as_f64().unwrap())
        .sum();
    assert!((total - 2400.0).abs() < 1e-8);
    assert!(
        call(&a, "GET", "/api/arena", &other, json!({})).await.2["bots"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let practice =
        json!({"name":"Test rival","practice":true,"round_limit":20,"opponent_id":bots[0]});
    assert_eq!(
        call(&a, "POST", "/api/games", &other, practice.clone())
            .await
            .0,
        StatusCode::FORBIDDEN
    );
    let (_, _, game) = call(&a, "POST", "/api/games", &owner, practice).await;
    assert_eq!(game["players"][1]["name"], "Explorer");
    let commands = format!("/api/games/{}/commands", game["id"].as_str().unwrap());
    let (status, _, played) = call(
        &a,
        "POST",
        &commands,
        &owner,
        json!({"revision":game["revision"],"command":{"type":"end_turn"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(played["your_turn"], true);
    // A forged AI session still cannot sign in as a human.
    a.store
        .0
        .lock()
        .unwrap()
        .execute(
            "INSERT INTO sessions VALUES(?,?,?,0,?)",
            rusqlite::params![digest("forged"), bots[0], "Bot", now() + 100],
        )
        .unwrap();
    assert_eq!(
        call(
            &a,
            "GET",
            "/api/account",
            "drawing_board_session=forged",
            json!({})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    // Replay a completed match from stored seed and immutable policy versions.
    use game::agents::BuiltinAgent;
    use game_core::{PlayerAgent, run_match};
    let m = &result["matches"][0];
    let seed: [u8; 32] = hex::decode(m["seed"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let mut replay = Game::new(
        "replay".into(),
        "Replay".into(),
        "a".into(),
        "A".into(),
        seed,
        20,
    )
    .unwrap();
    replay.join("b".into(), "B".into(), true).unwrap();
    replay.apply("a", Command::Start).unwrap();
    let mut agents: Vec<Box<dyn PlayerAgent<Game>>> = (0..2)
        .map(|i| {
            let strategy = arena::strategy(m["result"]["policies"][i].as_str().unwrap())
                .ok()
                .unwrap();
            let seed = hex::decode(m["agent_seeds"][i].as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap();
            Box::new(BuiltinAgent::new(strategy, seed)) as Box<dyn PlayerAgent<Game>>
        })
        .collect();
    let replay_result = run_match(&mut replay, &mut agents, 10000).unwrap();
    assert_eq!(serde_json::to_value(replay_result).unwrap(), m["result"]);
    // Identical simultaneous submissions commit one series, not two.
    let concurrent = json!({"request_id":uuid::Uuid::new_v4().to_string(),"bots":bots,"games":2});
    let (one, two) = tokio::join!(
        call(&a, "POST", "/api/arena/series", &owner, concurrent.clone()),
        call(&a, "POST", "/api/arena/series", &owner, concurrent)
    );
    assert_eq!(one.0, StatusCode::OK);
    assert_eq!(two.0, StatusCode::OK);
    assert_eq!(one.2, two.2);
    let ladder = call(&a, "GET", "/api/arena", &owner, json!({})).await.2;
    assert!(
        ladder["bots"]
            .as_array()
            .unwrap()
            .iter()
            .all(|b| b["games"] == 4)
    );
    assert_eq!(ladder["series"].as_array().unwrap().len(), 2);
    // An injected storage failure must leave both ladder and history unchanged.
    a.store.0.lock().unwrap().execute_batch("CREATE TRIGGER fail_rating BEFORE UPDATE ON ratings BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    let failure = json!({"request_id":uuid::Uuid::new_v4().to_string(),"bots":bots,"games":2});
    assert_eq!(
        call(&a, "POST", "/api/arena/series", &owner, failure)
            .await
            .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        call(&a, "GET", "/api/arena", &owner, json!({})).await.2,
        ladder
    );
}
