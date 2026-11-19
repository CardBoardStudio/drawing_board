use super::authority::{HiddenInfoAuthority, TrustedAuthority};
use super::log::SqliteTableLog;
use super::*;
use crate::tests::{app, call};

impl Service {
    /// Test driver access: the active seat, its observation and legal actions.
    async fn turn(self: &Arc<Self>, id: &str) -> Option<(usize, Value, Vec<Value>)> {
        let id = id.to_string();
        self.call(move |t| {
            let live = t.live(&id)?;
            Ok(live.engine.active_seat().map(|seat| {
                (
                    seat,
                    live.engine.observe(seat).unwrap(),
                    live.engine.legal_actions(seat),
                )
            }))
        })
        .await
        .unwrap()
    }
    /// The engine's own private view after forgetting it and folding the log
    /// again: once from the newest snapshot and once from the whole log.
    async fn refolded(self: &Arc<Self>, id: &str, seat: usize) -> Value {
        let id = id.to_string();
        self.call(move |t| {
            let before = t.live(&id)?.engine.private_state(seat).map_err(broken)?;
            t.live.remove(&id);
            let after = t.live(&id)?.engine.private_state(seat).map_err(broken)?;
            assert_eq!(
                before, after,
                "resuming from a snapshot rebuilds the same position"
            );
            let table = t.log.table(&id).map_err(broken)?.unwrap();
            let events = t.log.read(&id).map_err(broken)?;
            let source = t.channel.engine(&table.rules).unwrap();
            let full =
                build(table, events, vec![], t.authority.clone(), &source).map_err(broken)?;
            assert_eq!(
                full.engine.private_state(seat).map_err(broken)?,
                after,
                "fold(log) from the start rebuilds the same position"
            );
            Ok(after)
        })
        .await
        .unwrap()
    }
}

fn table(id: &str, people: &[(&str, &str)]) -> Table {
    let people: Vec<(String, String)> = people
        .iter()
        .map(|(a, n)| (a.to_string(), n.to_string()))
        .collect();
    Table {
        id: id.into(),
        name: "Test table".into(),
        rules: galactic_reach::RULES.into(),
        authority: String::new(),
        status: "active".into(),
        seats: seats(&people),
        victory_target: 40,
        committed_only: false,
    }
}
fn store_with(accounts: &[&str]) -> Arc<Store> {
    let store = Arc::new(Store::open(":memory:").unwrap());
    {
        let db = store.0.lock().unwrap();
        for id in accounts {
            db.execute(
                "INSERT INTO accounts(id,name,kind,created) VALUES(?,?,'human',0)",
                [id, id],
            )
            .unwrap();
        }
    }
    store
}

#[test]
fn trusted_shuffles_commit_and_replay_only_their_own_purpose() {
    let a = TrustedAuthority;
    let s = a.shuffle("t", 0, 12, "deck:1").unwrap();
    let mut sorted = s.order.clone();
    sorted.sort();
    assert_eq!(sorted, (0..12).collect::<Vec<_>>());
    assert!(
        !s.event.public.to_string().contains("order"),
        "the public record carries a commitment, not the order"
    );
    let logged = Event {
        seq: 1,
        kind: "shuffle".into(),
        seat: None,
        public: s.event.public.clone(),
        private: s.event.private.clone(),
        hash: String::new(),
    };
    assert_eq!(a.replay_shuffle(&logged, 12, "deck:1").unwrap(), s.order);
    assert!(a.replay_shuffle(&logged, 12, "deck:2").is_err());
    assert!(a.replay_shuffle(&logged, 11, "deck:1").is_err());
    let reveal = a.reveal("t", std::slice::from_ref(&logged)).unwrap();
    assert_eq!(reveal.public["shuffles"][0]["valid"], true);
    assert_eq!(reveal.public["shuffles"][0]["order"], json!(s.order));
    let mut forged = logged.clone();
    forged.private.as_mut().unwrap()["order"][0] = json!(99);
    assert_eq!(
        a.reveal("t", &[forged]).unwrap().public["shuffles"][0]["valid"],
        false,
        "an opening that does not match its commitment is flagged"
    );
}

#[test]
fn sqlite_log_appends_in_order_and_rejects_a_stale_head() {
    let store = store_with(&["a", "b"]);
    let log = SqliteTableLog(store);
    let t = table("t1", &[("a", "Ada"), ("b", "Bo")]);
    log.create(&t).unwrap();
    assert_eq!(log.table("t1").unwrap().unwrap().seats, t.seats);
    assert_eq!(log.tables_for("b").unwrap()[0].id, "t1");
    assert!(log.tables_for("c").unwrap().is_empty());
    let event = |n| NewEvent {
        kind: "action",
        seat: Some(0),
        public: json!({"action":{"type":"pass","n":n}}),
        private: None,
    };
    assert_eq!(log.append("t1", 0, &[event(1), event(2)]).unwrap(), 2);
    assert!(
        log.append("t1", 1, &[event(3)]).is_err(),
        "a writer that missed an event cannot append"
    );
    assert_eq!(log.append("t1", 2, &[event(3)]).unwrap(), 3);
    let events = log.read("t1").unwrap();
    assert_eq!(
        events.iter().map(|e| e.seq).collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert!(events.windows(2).all(|w| w[0].hash != w[1].hash));
}

#[tokio::test]
async fn private_views_never_hold_another_seats_hand_or_deck_order() {
    let store = store_with(&["a", "b"]);
    let service = Service::start(
        Arc::new(SqliteTableLog(store)),
        Arc::new(TrustedAuthority),
        Duration::ZERO,
    );
    service
        .open(table("t2", &[("a", "Ada"), ("b", "Bo")]))
        .await
        .unwrap();
    let full = service
        .call(|t| {
            let live = t.live("t2")?;
            live.engine.extend_deadline(SHARED_STEP);
            Ok(live.engine.private_state(0).unwrap())
        })
        .await
        .unwrap();
    // Seat 0's own projection still holds its hand; compare against seat 1's view.
    let ada = service.view("t2", "a").await.unwrap();
    let bo = service.view("t2", "b").await.unwrap();
    assert_eq!(
        (ada["seat"].as_u64(), bo["seat"].as_u64()),
        (Some(0), Some(1))
    );
    let ada_hand: Vec<String> = full["players"][0]["hand"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(ada_hand.len(), 5);
    let bo_text = bo.to_string();
    for id in &ada_hand {
        assert!(
            !bo_text.contains(&format!("\"{id}\"")),
            "Bo's view contains Ada's card {id}"
        );
    }
    assert_eq!(bo["state"]["players"][0]["hand"], json!([]));
    assert_eq!(bo["state"]["players"][0]["handCount"], 5);
    assert_eq!(bo["state"]["players"][0]["deck"], json!([]));
    assert!(
        bo["state"]["relicDeck"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c == &json!({"hidden":true}))
    );
    // Rules #market-tiers: each of the three market decks keeps its size but hides its order.
    let decks = bo["state"]["marketDecks"].as_object().unwrap();
    assert_eq!(
        decks.keys().collect::<Vec<_>>(),
        ["cheap", "expensive", "medium"]
    );
    assert!(
        decks
            .values()
            .flat_map(|deck| deck.as_array().unwrap())
            .all(|c| c == &json!({"hidden":true}))
    );
    assert_eq!(
        decks
            .values()
            .map(|deck| deck.as_array().unwrap().len())
            .sum::<usize>()
            + bo["state"]["market"].as_array().unwrap().len(),
        56
    );
    // A seat's own deck is listed without its order.
    let deck: Vec<&str> = bo["state"]["players"][1]["deck"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["key"].as_str().unwrap())
        .collect();
    let mut sorted = deck.clone();
    sorted.sort();
    assert_eq!(deck, sorted);
    assert!(
        !bo_text.contains("\"salt\"") && !bo_text.contains("\"order\""),
        "no authority secret reaches a seat"
    );
    assert_eq!(service.view("t2", "stranger").await, Err(Refusal::NotFound));
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

/// Two accounts play a whole shared game through the HTTP API, with the table
/// service's AI rivals in the other two seats. The seeded service deals the same
/// game every run, so the test's coverage and run time do not vary.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn heavy_two_accounts_play_a_shared_game_to_the_end_over_http() {
    let mut a = app(true);
    a.shared = Service::start_seeded(
        Arc::new(SqliteTableLog(a.store.clone())),
        Duration::ZERO,
        [11; 32],
    );
    let host = account(&a, "Ada").await;
    let friend = account(&a, "Bo").await;
    let stranger = account(&a, "Cy").await;
    let created = call(
        &a,
        "POST",
        "/api/tables",
        &host,
        json!({"game":"galactic-reach","name":"Friday","lobby":true}),
    )
    .await
    .2;
    let id = created["id"].as_str().unwrap().to_string();
    let lobby = format!("/api/tables/{id}/lobby");
    let room = call(&a, "GET", &lobby, &host, json!({})).await.2;
    let invite = room["invite_url"]
        .as_str()
        .unwrap()
        .rsplit('/')
        .next()
        .unwrap()
        .to_string();
    let joined = call(
        &a,
        "POST",
        &format!("{lobby}/join"),
        &friend,
        json!({"invite":invite}),
    )
    .await
    .2;
    assert!(
        joined["blocked"].is_null(),
        "two people and two rivals can start"
    );
    let started = call(&a, "POST", &format!("{lobby}/start"), &host, json!({}))
        .await
        .2;
    assert_eq!(started["table_url"], url(&id));
    assert_eq!(started["shared"], true);
    let guest_room = call(&a, "GET", &lobby, &friend, json!({})).await.2;
    assert_eq!(guest_room["table_url"], url(&id), "guests can open it too");
    let shelf = call(&a, "GET", "/api/tables", &friend, json!({})).await.2;
    assert!(
        shelf
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["url"] == url(&id))
    );
    assert_eq!(
        call(&a, "GET", &format!("/api/tables/{id}"), &host, json!({}))
            .await
            .2["shared_url"],
        url(&id)
    );

    let endpoint = format!("/api/shared/{id}");
    assert_eq!(
        call(&a, "GET", &endpoint, &stranger, json!({})).await.0,
        StatusCode::NOT_FOUND
    );
    let first = call(&a, "GET", &endpoint, &host, json!({})).await.2;
    // Seats are dealt at random when the host starts (rulebook #shared-tables).
    let seat_of = |name: &str| {
        first["seats"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["name"] == name && s["human"] == true)
            .map(|s| s["seat"].as_u64().unwrap() as usize)
            .unwrap()
    };
    let people = [seat_of("Ada"), seat_of("Bo")];
    let rival = (0..4).find(|s| !people.contains(s)).unwrap();
    assert_eq!(first["seats"][rival]["human"], false);
    assert_eq!(first["seats"][people[0]]["you"], true);
    assert_eq!(
        call(&a, "GET", &format!("{endpoint}/report"), &host, json!({}))
            .await
            .0,
        StatusCode::CONFLICT,
        "no report while cards are hidden"
    );

    let cookies = [host.clone(), friend.clone()];
    let mut agents = [
        BuiltinAgent::new(Strategy::Economy, [1; 32]),
        BuiltinAgent::new(Strategy::Expansion, [2; 32]),
    ];
    let mut human_moves = 0;
    let (mut undid, mut refused_after_reveal) = (false, false);
    let mut checked_stale = false;
    for _ in 0..20000 {
        let Some((seat, observation, legal)) = a.shared.turn(&id).await else {
            break;
        };
        let Some(person) = people.iter().position(|s| *s == seat) else {
            tokio::time::sleep(Duration::from_millis(2)).await;
            continue;
        };
        let me = &cookies[person];
        let view = call(&a, "GET", &endpoint, me, json!({})).await.2;
        assert_eq!(view["active"], seat);
        let other = &view["state"]["players"][people[1 - person]];
        assert_eq!(
            other["hand"],
            json!([]),
            "a seat never sees the other's hand"
        );
        let other_seat = call(&a, "GET", &endpoint, &cookies[1 - person], json!({}))
            .await
            .2;
        let seq = view["seq"].as_u64().unwrap();
        // The seat not to move cannot act, and a stale view cannot either.
        let wrong = call(
            &a,
            "POST",
            &format!("{endpoint}/act"),
            &cookies[1 - person],
            json!({"seq":other_seat["seq"],"actions":[{"type":"pass"}]}),
        )
        .await;
        assert_eq!(wrong.0, StatusCode::CONFLICT);
        let action = legal[agents[person].select_action(&observation, &legal)].clone();
        if !checked_stale && seq > 0 {
            checked_stale = true;
            let stale = call(
                &a,
                "POST",
                &format!("{endpoint}/act"),
                me,
                json!({"seq":seq-1,"actions":[action.clone()]}),
            )
            .await;
            assert_eq!(stale.0, StatusCode::CONFLICT);
        }
        // Send the command as a browser would: without fields the server computes.
        let mut intent = action.clone();
        if intent["type"] == "resource" {
            intent.as_object_mut().unwrap().remove("gain");
        }
        let (status, _, result) = call(
            &a,
            "POST",
            &format!("{endpoint}/act"),
            me,
            json!({"seq":seq,"actions":[intent]}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{result}");
        assert_eq!(result["applied"], 1);
        human_moves += 1;
        let after = &result["view"];
        let undo_path = format!("{endpoint}/undo");
        if after["active"] == seat {
            if action["type"] == "buy" && action["source"] == "market" && !refused_after_reveal {
                // 36.41 can rewind this human's reveal while no other human has acted.
                refused_after_reveal = true;
                assert_eq!(after["undo"]["available"], true);
                let r = call(&a, "POST", &undo_path, me, json!({"seq":after["seq"]})).await;
                assert_eq!(r.0, StatusCode::OK, "{}", r.2);
            } else if action["type"] == "resource" && !undid {
                undid = true;
                assert_eq!(after["undo"]["available"], true);
                let hand = after["state"]["players"][seat]["hand"]
                    .as_array()
                    .unwrap()
                    .len();
                let r = call(&a, "POST", &undo_path, me, json!({"seq":after["seq"]})).await;
                assert_eq!(r.0, StatusCode::OK, "{}", r.2);
                assert!(r.2["undone"].as_u64().unwrap() >= 1);
                assert!(
                    r.2["view"]["state"]["players"][seat]["hand"]
                        .as_array()
                        .unwrap()
                        .len()
                        > hand
                );
            }
        }
    }
    assert!(human_moves > 20, "both people played many decisions");
    assert!(undid, "a person undid a conversion over HTTP");
    // `refused_after_reveal` depends on the shuffles: when a person buys from the
    // market mid-turn, Undo must refuse (checked above); the deterministic case is
    // `undo_takes_back_this_turn_but_not_past_a_reveal_or_the_turn`.
    let _ = refused_after_reveal;
    let end = call(&a, "GET", &endpoint, &friend, json!({})).await.2;
    eprintln!(
        "shared game: seats {people:?}, {human_moves} human moves, seq {}, winner {}",
        end["seq"], end["state"]["winner"]
    );
    assert_eq!(end["status"], "finished");
    assert!(end["state"]["winner"].is_u64());
    a.shared.refolded(&id, 1).await;
    let report = call(&a, "GET", &format!("{endpoint}/report"), &host, json!({})).await;
    assert_eq!(report.0, StatusCode::OK);
    let events = report.2["events"].as_array().unwrap();
    let reveal = events.last().unwrap();
    assert_eq!(reveal["kind"], "reveal");
    assert!(
        reveal["public"]["shuffles"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["valid"] == true),
        "every shuffle opens to its commitment"
    );
    assert!(
        events
            .iter()
            .any(|e| e["seat"] == rival && e["kind"] == "action")
    );
    assert!(events.iter().any(|e| e["kind"] == "undo"));
    // Level III conversions may draw or shuffle; ordinary conversions reveal nothing.
    let actions = || events.iter().filter(|e| e["kind"] == "action");
    assert!(
        actions()
            .filter(|e| e["public"]["action"]["type"] == "resource")
            .all(|e| e["public"]["revealed"].is_null()
                || matches!(
                    e["public"]["revealed"].as_str(),
                    Some("cards were drawn" | "cards were shuffled")
                ))
    );
    // A market buy turns up a card (or reshuffles the pile) unless the pile is empty.
    let market: Vec<_> = actions()
        .filter(|e| e["public"]["action"]["source"] == "market")
        .collect();
    assert!(market.is_empty() || market.iter().any(|e| e["public"]["revealed"].is_string()));
}

#[tokio::test]
async fn a_live_view_streams_the_current_seat_view_first() {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let a = app(true);
    let host = account(&a, "Ada").await;
    let friend = account(&a, "Bo").await;
    {
        let db = a.store.0.lock().unwrap();
        db.execute(
            "INSERT INTO solo_tables(id,owner_id,name,created,updated,rules_version) SELECT 'ffffffffffffffffffffffffffffffff',id,'Stream',0,0,'x' FROM accounts WHERE name='Ada'",
            [],
        )
        .unwrap();
    }
    let ids: Vec<(String, String)> = {
        let db = a.store.0.lock().unwrap();
        ["Ada", "Bo"]
            .iter()
            .map(|n| {
                db.query_row("SELECT id,name FROM accounts WHERE name=?", [n], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .unwrap()
            })
            .collect()
    };
    let id = "ffffffffffffffffffffffffffffffff";
    a.shared
        .open(Table {
            id: id.into(),
            name: "Stream".into(),
            rules: galactic_reach::RULES.into(),
            authority: String::new(),
            status: "active".into(),
            seats: seats(&ids),
            victory_target: 40,
            committed_only: false,
        })
        .await
        .unwrap();
    let request = |cookie: &str| {
        Request::builder()
            .uri(format!("/api/shared/{id}/stream"))
            .header("cookie", cookie)
            .body(Body::empty())
            .unwrap()
    };
    a.shared.set_ping_every(Duration::from_millis(100));
    let response = crate::router(a.clone())
        .oneshot(request(&friend))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    let frame = body.frame().await.unwrap().unwrap().into_data().unwrap();
    let text = String::from_utf8(frame.to_vec()).unwrap();
    assert!(text.starts_with("event: view\n"), "{text}");
    let data = text.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
    let view: Value = serde_json::from_str(data).unwrap();
    assert_eq!(view["seat"], 1);
    let _ = host;
    // A quiet stream sends `ping {seq}` so a page can spot silence or a gap.
    async fn next(body: &mut axum::body::Body) -> String {
        let frame = tokio::time::timeout(Duration::from_secs(5), body.frame())
            .await
            .expect("the stream keeps talking")
            .unwrap()
            .unwrap()
            .into_data()
            .unwrap();
        String::from_utf8(frame.to_vec()).unwrap()
    }
    let ping = loop {
        let text = next(&mut body).await;
        if text.starts_with("event: ping\n") {
            break text;
        }
    };
    let data = ping.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(data).unwrap()["seq"],
        view["seq"]
    );
    // A change pushes the new view to the other seat.
    let seq = view["seq"].as_u64().unwrap();
    a.shared
        .act(id, &ids[0].0, seq, vec![json!({"type":"pass"})])
        .await
        .unwrap();
    let pushed = loop {
        let text = next(&mut body).await;
        if text.starts_with("event: view\n") {
            break text;
        }
    };
    let data = pushed
        .lines()
        .find_map(|l| l.strip_prefix("data: "))
        .unwrap();
    assert!(
        serde_json::from_str::<Value>(data).unwrap()["seq"]
            .as_u64()
            .unwrap()
            > seq
    );
    // At shutdown every stream ends, so browsers reconnect to the next server
    // rather than hearing a frozen copy of the table from the old process.
    a.shared.close();
    let ended = loop {
        match tokio::time::timeout(Duration::from_secs(5), body.frame()).await {
            Ok(None) => break true,
            Ok(Some(_)) => continue,
            Err(_) => break false,
        }
    };
    assert!(ended, "the stream ends at shutdown");
    let stranger = account(&a, "Cy").await;
    assert_eq!(
        crate::router(a.clone())
            .oneshot(request(&stranger))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

fn hand_count(view: &Value, seat: usize) -> u64 {
    view["state"]["players"][seat]["handCount"]
        .as_u64()
        .unwrap()
}

/// Undo (rulebook #shared-tables): back to the start of the current turn, never past
/// a reveal, never after the turn ends; every seat's view rolls back; the log stays
/// append-only and folds to the same position.
#[tokio::test]
async fn undo_takes_back_this_turn_but_not_past_a_reveal_or_the_turn() {
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    let mut legacy = table("t3", &[("a", "Ada"), ("b", "Bo")]);
    legacy.rules = "galactic-reach/33.38".into();
    service.open(legacy).await.unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["active"], 0);
    assert_eq!(ada["undo"]["available"], false);
    assert_eq!(ada["undo"]["reason"], "Nothing to undo this turn.");
    let cards: Vec<String> = ada["state"]["players"][0]["hand"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap().to_string())
        .collect();
    let convert = |card: &str| vec![json!({"type":"resource","card":card})];

    // Two conversions this turn; Bo sees Ada's hand shrink, then Ada undoes both.
    let mut seq = ada["seq"].as_u64().unwrap();
    for card in &cards[..2] {
        seq = service.act("t3", "a", seq, convert(card)).await.unwrap()["seq"]
            .as_u64()
            .unwrap();
    }
    let bo = service.view("t3", "b").await.unwrap();
    assert_eq!(hand_count(&bo, 0), 3);
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["available"], true);
    assert_eq!(ada["undo"]["actions"], 2);
    assert_eq!(
        service.undo("t3", "b", seq).await,
        Err(Refusal::Conflict("Undo works on your own turn.".into()))
    );
    assert!(
        matches!(
            service.undo("t3", "a", seq - 1).await,
            Err(Refusal::Conflict(_))
        ),
        "a stale view cannot undo"
    );
    let undone = service.undo("t3", "a", seq).await.unwrap();
    assert_eq!(undone["undone"], 2);
    seq = undone["seq"].as_u64().unwrap();
    let bo = service.view("t3", "b").await.unwrap();
    assert_eq!(hand_count(&bo, 0), 5, "the other seat's view rolls back");
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(hand_count(&ada, 0), 5);
    assert_eq!(ada["undo"]["reason"], "Nothing to undo this turn.");
    service.refolded("t3", 0).await;

    // A reveal is a checkpoint. Mark one conversion as revealing (as a draw
    // would be) straight in the log; Undo then stops just after it.
    let logged = NewEvent {
        kind: "action",
        seat: Some(0),
        public: json!({"action": {"type":"resource","card":cards[0],"key":cards[0].split('-').next().unwrap(),
            "gain": if cards[0].starts_with("move") {json!({"energy":1})} else {json!({"matter":1})}},
            "turn": log.read("t3").unwrap().iter().rev().find(|e| e.kind=="action").unwrap().public["turn"],
            "revealed": "cards were drawn"}),
        private: None,
    };
    seq = log.append("t3", seq, &[logged]).unwrap();
    service
        .call(|t| {
            t.live.remove("t3");
            Ok(())
        })
        .await
        .unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["available"], false);
    assert_eq!(
        ada["undo"]["reason"],
        "Undo stops here: cards were drawn, so earlier choices this turn are final."
    );
    seq = service
        .act("t3", "a", seq, convert(&cards[1]))
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    let ada = service.view("t3", "a").await.unwrap();
    assert_eq!(ada["undo"]["actions"], 1);
    assert_eq!(ada["undo"]["stop"], "cards were drawn");
    seq = service.undo("t3", "a", seq).await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert_eq!(
        hand_count(&service.view("t3", "b").await.unwrap(), 0),
        4,
        "only the choice after the reveal is taken back"
    );
    assert!(
        matches!(service.undo("t3", "a", seq).await, Err(Refusal::Conflict(r)) if r.starts_with("Undo stops here"))
    );

    // Passing ends the Operations turn; the Buy turn that follows starts fresh.
    seq = service
        .act("t3", "a", seq, vec![json!({"type":"pass"})])
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert_eq!(
        service.undo("t3", "a", seq).await,
        Err(Refusal::Conflict("Nothing to undo this turn.".into()))
    );
    service.refolded("t3", 1).await;
    // The log only grew: two undo events, nothing deleted.
    let kinds: Vec<String> = log
        .read("t3")
        .unwrap()
        .iter()
        .map(|e| e.kind.clone())
        .collect();
    assert_eq!(kinds.iter().filter(|k| *k == "undo").count(), 2);
    assert_eq!(log.read("t3").unwrap().last().unwrap().seq, seq);
}

#[test]
fn reveal_checkpoints_name_what_changed() {
    let mark = |decks: u64, market: u64| json!({"turn":3,"reveal":{"decks":[decks],"market":market,"relics":0,"surveys":[],"located":[],"combat":null,"combats":null}});
    assert_eq!(revealed(&mark(5, 9), &mark(5, 9), false), None);
    assert_eq!(
        revealed(&mark(5, 9), &mark(5, 9), true).as_deref(),
        Some("cards were shuffled")
    );
    assert_eq!(
        revealed(&mark(5, 9), &mark(3, 9), false).as_deref(),
        Some("cards were drawn")
    );
    assert_eq!(
        revealed(&mark(5, 9), &mark(5, 8), false).as_deref(),
        Some("a new market card was turned up")
    );
}

/// Server rivals move on the current rules, including at a table dealt with an
/// older version of their policies (a stuck table must resume after a redeploy).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn server_rivals_move_on_the_current_rules_even_with_older_policy_versions() {
    assert!(rival("gr-economy/25").is_some() && rival("gr-military/1").is_some());
    assert!(rival("someone-else/26").is_none());
    let store = store_with(&["a"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    for (id, old) in [("current", false), ("older", true)] {
        let mut t = table(id, &[("a", "Ada")]);
        if old {
            for seat in t.seats.iter_mut().filter(|s| s.policy.is_some()) {
                let profile = seat
                    .policy
                    .as_ref()
                    .unwrap()
                    .split('/')
                    .next()
                    .unwrap()
                    .to_string();
                seat.policy = Some(format!("{profile}/25"));
            }
        }
        service.open(t).await.unwrap();
        let seq = service.view(id, "a").await.unwrap()["seq"]
            .as_u64()
            .unwrap();
        service
            .act(
                id,
                "a",
                seq,
                vec![json!({"type":"pass"}), json!({"type":"finish_buy"})],
            )
            .await
            .unwrap();
        let mut moved = false;
        for _ in 0..400 {
            let events = log.read(id).unwrap();
            if [1, 2, 3].iter().all(|s| {
                events
                    .iter()
                    .any(|e| e.kind == "action" && e.seat == Some(*s))
            }) {
                moved = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        assert!(moved, "every rival at the {id} table moved");
        assert!(service.view(id, "a").await.unwrap()["ai_error"].is_null());
    }
}

// 32.37 cutover: a shared table keeps the rules it was dealt with, so a running
// 31.36 table keeps playing on the archived 31.36 engine (old prices) and its
// rivals keep moving; 30.35 tables keep loading as well.
#[tokio::test]
async fn archived_31_36_shared_tables_keep_playing_after_the_cutover() {
    let store = store_with(&["a"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    let mut t = table("archived", &[("a", "Ada")]);
    t.rules = "galactic-reach/31.36".into();
    service.open(t).await.unwrap();
    let view = service.view("archived", "a").await.unwrap();
    assert_eq!(view["rules_version"], "galactic-reach/31.36");
    assert!(
        galactic_reach::GalacticReach::with_rules([3; 32], "galactic-reach/31.36").is_ok(),
        "the archived engine is embedded"
    );
    let seq = view["seq"].as_u64().unwrap();
    service
        .act(
            "archived",
            "a",
            seq,
            vec![json!({"type":"pass"}), json!({"type":"finish_buy"})],
        )
        .await
        .unwrap();
    let mut moved = false;
    for _ in 0..400 {
        let events = log.read("archived").unwrap();
        if [1, 2, 3].iter().all(|s| {
            events
                .iter()
                .any(|e| e.kind == "action" && e.seat == Some(*s))
        }) {
            moved = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert!(moved, "every rival at the 31.36 table moved");
    let view = service.view("archived", "a").await.unwrap();
    assert!(view["ai_error"].is_null());
    let dealt = view["state"]["market"]
        .as_array()
        .into_iter()
        .flatten()
        .chain(
            view["state"]["advancedDeck"]
                .as_array()
                .into_iter()
                .flatten(),
        )
        .count();
    assert!(dealt > 0, "the 31.36 market is dealt");
    // 30.35 shared tables (archived with the shared hooks by #47) still load too.
    let mut older = table("older", &[("a", "Ada")]);
    older.rules = "galactic-reach/30.35".into();
    service.open(older).await.unwrap();
    assert_eq!(
        service.view("older", "a").await.unwrap()["rules_version"],
        "galactic-reach/30.35"
    );
}

/// A shared table resumes from its stored snapshot, like a solo save, so an
/// engine edit that changes how older events replay does not strand it; with no
/// usable snapshot, players get a clear message instead of a server error.
#[tokio::test]
async fn tables_resume_from_snapshots_and_explain_when_they_cannot() {
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store.clone()));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table("t4", &[("a", "Ada"), ("b", "Bo")]))
        .await
        .unwrap();
    let ada = service.view("t4", "a").await.unwrap();
    let mut seq = ada["seq"].as_u64().unwrap();
    for card in ada["state"]["players"][0]["hand"].as_array().unwrap()[..2].iter() {
        seq = service
            .act(
                "t4",
                "a",
                seq,
                vec![json!({"type":"resource","card":card["id"]})],
            )
            .await
            .unwrap()["seq"]
            .as_u64()
            .unwrap();
    }
    assert_eq!(
        log.snapshots("t4").unwrap()[0].0,
        seq,
        "a snapshot follows every change"
    );
    // The snapshot resumes to exactly the position a full replay builds.
    let resumed = service.refolded("t4", 0).await;
    let first_action = log
        .read("t4")
        .unwrap()
        .into_iter()
        .find(|e| e.kind == "action")
        .unwrap()
        .seq;
    // Simulate an engine edit: an early event no longer replays.
    store
        .0
        .lock()
        .unwrap()
        .execute(
            "UPDATE gr_shared_events SET public=json_set(public,'$.action.card','gone-1') WHERE table_id='t4' AND seq=?",
            [first_action],
        )
        .unwrap();
    service
        .call(|t| {
            t.live.remove("t4");
            Ok(())
        })
        .await
        .unwrap();
    let after = service.view("t4", "a").await.unwrap();
    assert_eq!(
        after["state"], resumed,
        "the table continues from its snapshot"
    );
    // It keeps playing, and Undo still works on top of the snapshot.
    seq = service
        .act("t4", "a", seq, vec![json!({"type":"pass"})])
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert!(seq > after["seq"].as_u64().unwrap());
    // Without a usable snapshot the table cannot be rebuilt: say why, plainly.
    store
        .0
        .lock()
        .unwrap()
        .execute("DELETE FROM gr_shared_snapshots WHERE table_id='t4'", [])
        .unwrap();
    service
        .call(|t| {
            t.live.remove("t4");
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        service.view("t4", "b").await,
        Err(Refusal::Conflict(EARLIER_BUILD.into()))
    );
    // snapshot-shared reports the same table instead of crashing.
    let all = service.snapshot_all().await;
    assert!(all.iter().any(|(id, r)| id == "t4" && r.is_err()));
}

/// A shared table keeps the rules revision it was dealt with and plays on that
/// revision's archived engine after the current rules move on (as solo tables
/// do): people act, rivals move, Undo works, and the table rebuilds both from
/// its snapshot and from the whole log. Its browser is the archived copy.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_table_dealt_on_an_archived_revision_keeps_playing_on_it() {
    let archived = galactic_reach::SHARED_RULES
        .iter()
        .find(|r| **r != galactic_reach::RULES)
        .expect("an archived revision with shared-table support");
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    let mut t = table("t5", &[("a", "Ada"), ("b", "Bo")]);
    t.rules = archived.to_string();
    service.open(t).await.unwrap();
    let ada = service.view("t5", "a").await.unwrap();
    assert_eq!(ada["rules_version"], *archived);
    let revision = archived.rsplit('/').next().unwrap();
    assert_eq!(
        ada["client_path"],
        format!("/galactic-reach/rules/{revision}/")
    );
    let card = ada["state"]["players"][0]["hand"][0]["id"].clone();
    let mut seq = service
        .act(
            "t5",
            "a",
            ada["seq"].as_u64().unwrap(),
            vec![json!({"type":"resource","card":card})],
        )
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    seq = service.undo("t5", "a", seq).await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    for (account, steps) in [("a", ["pass", "finish_buy"]), ("b", ["pass", "finish_buy"])] {
        for step in steps {
            // Wait for this seat's turn (the rivals between move on the server).
            for _ in 0..400 {
                let v = service.view("t5", account).await.unwrap();
                if v["active"] == v["seat"] {
                    seq = v["seq"].as_u64().unwrap();
                    break;
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            seq = service
                .act("t5", account, seq, vec![json!({"type": step})])
                .await
                .unwrap()["seq"]
                .as_u64()
                .unwrap();
        }
    }
    let mut rivals_moved = false;
    for _ in 0..400 {
        let events = log.read("t5").unwrap();
        if [2, 3].iter().all(|s| {
            events
                .iter()
                .any(|e| e.kind == "action" && e.seat == Some(*s))
        }) {
            rivals_moved = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert!(rivals_moved, "rivals move on the archived engine");
    service.refolded("t5", 1).await;
    // The current rules still open fresh tables; an unknown revision is refused plainly.
    let mut unknown = table("t6", &[("a", "Ada")]);
    unknown.rules = "galactic-reach/1.1".into();
    log.create(&unknown).unwrap();
    assert_eq!(
        service.view("t6", "a").await,
        Err(Refusal::Conflict(
            "This shared table plays galactic-reach/1.1, which this server cannot run.".into()
        ))
    );
}

/// Undo needs a position to roll back to. If an earlier build dealt the turn and
/// only a later snapshot exists, Undo is refused with an explanation instead of
/// recording an undo the table could never rebuild.
#[tokio::test]
async fn undo_is_refused_when_no_rebuildable_position_exists() {
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store.clone()));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table("t7", &[("a", "Ada"), ("b", "Bo")]))
        .await
        .unwrap();
    let ada = service.view("t7", "a").await.unwrap();
    let cards = ada["state"]["players"][0]["hand"]
        .as_array()
        .unwrap()
        .clone();
    let mut seq = ada["seq"].as_u64().unwrap();
    for card in &cards[..2] {
        seq = service
            .act(
                "t7",
                "a",
                seq,
                vec![json!({"type":"resource","card":card["id"]})],
            )
            .await
            .unwrap()["seq"]
            .as_u64()
            .unwrap();
    }
    // As if the table moved here from an earlier build: its deal no longer
    // replays, and only the snapshot after this turn's choices survives.
    {
        let db = store.0.lock().unwrap();
        db.execute(
            "UPDATE gr_shared_events SET private=json_set(private,'$.order',json('[0]')) WHERE table_id='t7' AND seq=1",
            [],
        )
        .unwrap();
        db.execute(
            "DELETE FROM gr_shared_snapshots WHERE table_id='t7' AND seq<?",
            [seq],
        )
        .unwrap();
    }
    service
        .call(|t| {
            t.live.remove("t7");
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        service.view("t7", "a").await.unwrap()["undo"]["available"],
        true
    );
    let refused = service.undo("t7", "a", seq).await;
    assert!(
        matches!(&refused, Err(Refusal::Conflict(m)) if m.starts_with("Undo is not available here")),
        "{refused:?}"
    );
    // Nothing was recorded, and the table still plays.
    assert!(log.read("t7").unwrap().iter().all(|e| e.kind != "undo"));
    service
        .act("t7", "a", seq, vec![json!({"type":"pass"})])
        .await
        .unwrap();
}

// Rulebook #shared-tables: people take random seats when the host starts, so the first
// two are not always neighbors on one half of the map (homes pair seats 0-1 and 2-3).
#[test]
fn start_deals_people_to_random_seats_and_rivals_fill_the_rest() {
    use rand::SeedableRng;
    let people = [
        ("a".to_string(), "Ada".to_string()),
        ("b".to_string(), "Bo".to_string()),
    ];
    let rivals = [
        "Cyan Concord",
        "Ember Directorate",
        "Violet Assembly",
        "Helios Compact",
    ];
    let (mut split, mut host_seats) = (0, std::collections::BTreeSet::new());
    for seed in 0..64 {
        let dealt = random_seats(&people, &mut rand::rngs::StdRng::seed_from_u64(seed));
        assert_eq!(
            dealt.iter().map(|s| s.seat).collect::<Vec<_>>(),
            [0, 1, 2, 3]
        );
        let at = |account: &str| {
            dealt
                .iter()
                .find(|s| s.account.as_deref() == Some(account))
                .unwrap()
                .seat
        };
        let (ada, bo) = (at("a"), at("b"));
        assert_ne!(ada, bo);
        assert_eq!(dealt[ada].name, "Ada");
        assert_eq!(dealt[bo].name, "Bo");
        for seat in dealt.iter().filter(|s| s.account.is_none()) {
            assert_eq!(
                seat.name, rivals[seat.seat],
                "rivals keep their seat's faction"
            );
            assert!(seat.policy.is_some());
        }
        host_seats.insert(ada);
        split += usize::from(ada / 2 != bo / 2);
    }
    assert_eq!(host_seats.len(), 4, "the host can land in any seat");
    assert!(
        (24..=60).contains(&split),
        "two people sit on opposite halves about two times in three ({split}/64)"
    );
    let ordered = seats(&people);
    assert_eq!(
        (ordered[0].name.as_str(), ordered[1].name.as_str()),
        ("Ada", "Bo")
    );
}

// Shared movement fixtures load a real persisted position with human-controlled seats.
async fn prepared_shared_movement(source: &str) -> (Arc<Service>, u64) {
    let store = store_with(&["a", "b", "c", "d"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table(
            "split",
            &[("a", "Ada"), ("b", "Bo"), ("c", "Cy"), ("d", "Dee")],
        ))
        .await
        .unwrap();
    let (seq, mut snapshot) = log.snapshots("split").unwrap().into_iter().next().unwrap();
    let mut engine: Value = serde_json::from_str(snapshot["engine"].as_str().unwrap()).unwrap();
    let card = engine["state"]["players"][0]["hand"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == "move")
        .unwrap()
        .clone();
    engine["state"]["fleets"] = json!({});
    engine["state"]["fleets"][source] = json!({"0":{"settler":1,"explorer":1,"fleet":2}});
    engine["state"]["players"][0]["hand"] = json!([card]);
    snapshot["engine"] = json!(engine.to_string());
    log.save_snapshot("split", seq, &snapshot).unwrap();
    service
        .call(|t| {
            t.live.remove("split");
            Ok(())
        })
        .await
        .unwrap();
    (service, seq)
}

/// #split-moves: the real server moves only the browser's chosen units.
#[tokio::test]
async fn a_shared_move_can_leave_units_behind() {
    let (service, seq) = prepared_shared_movement("0,0").await;
    let (seat, _, legal) = service.turn("split").await.unwrap();
    assert_eq!(seat, 0);
    let split = legal
        .iter()
        .find(|a| {
            a["type"] == "move"
                && a["source"] == "0,0"
                && a["destination"] == "2,0"
                && a["units"] == json!({"settler":0,"explorer":0,"fleet":1})
        })
        .expect("one Fleet can move two hexes from the prepared stack");
    let intent = json!({"type":"move","card":split["card"],"source":split["source"],
        "destination":split["destination"],"moveGroup":split["moveGroup"],"units":split["units"]});
    for invalid_units in [
        json!({"settler":0,"explorer":0,"fleet":0.5}),
        json!({"settler":0,"explorer":1,"fleet":1}),
    ] {
        let mut invalid = intent.clone();
        invalid["units"] = invalid_units;
        assert!(
            service.act("split", "a", seq, vec![invalid]).await.is_err(),
            "the server refuses fractional or mixed-team choices"
        );
        assert_eq!(
            service.view("split", "a").await.unwrap()["seq"],
            seq,
            "refused choices do not change the table"
        );
    }
    service
        .act("split", "a", seq, vec![intent.clone()])
        .await
        .unwrap();
    let after = service.view("split", "a").await.unwrap();
    assert_eq!(
        after["state"]["fleets"]["0,0"]["0"],
        json!({"settler":1,"explorer":1,"fleet":1}),
        "the Settler, Explorer and unchosen Fleet stay behind"
    );
    assert_eq!(
        after["state"]["fleets"]["2,0"]["0"],
        json!({"settler":0,"explorer":0,"fleet":1}),
        "only the selected Fleet arrives"
    );
    assert!(
        after["state"]["players"][0]["inPlay"]
            .as_array()
            .unwrap()
            .iter()
            .any(|card| card["id"] == intent["card"]),
        "the move uses its card"
    );
    assert!(
        matches!(
            service.act("split", "a", seq, vec![intent]).await,
            Err(Refusal::Conflict(_))
        ),
        "a stale command cannot move another Fleet"
    );
}

// 36.41 #shared-tables: human Undo crosses later bot actions, but no later human action.
async fn exercise_human_undo(dev: bool) {
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store.clone()));
    let channel = if dev {
        let channel = Channel::dev(store, galactic_reach::dev_rules(), "undo-test".into());
        channel.keep_current(1).unwrap();
        channel
    } else {
        Channel::stable()
    };
    let service = Service::start_on(
        log.clone(),
        Arc::new(TrustedAuthority),
        Duration::from_secs(3600),
        Arc::new(channel),
    );
    let mut dealt = table("human-undo", &[("a", "Ada"), ("b", "Bo")]);
    dealt.rules = service.channel.rules.clone();
    service.open(dealt).await.unwrap();
    let mut seq = service.view("human-undo", "a").await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    for (account, action) in [
        ("a", "pass"),
        ("a", "finish_buy"),
        ("b", "pass"),
        ("b", "finish_buy"),
    ] {
        seq = service
            .act("human-undo", account, seq, vec![json!({"type":action})])
            .await
            .unwrap()["seq"]
            .as_u64()
            .unwrap();
    }
    assert_eq!(service.turn("human-undo").await.unwrap().0, 2);
    service
        .call(|tables| {
            tables.step_ai("human-undo")?;
            Ok(())
        })
        .await
        .unwrap();
    let bo = service.view("human-undo", "b").await.unwrap();
    assert_eq!(bo["undo"]["available"], true);
    assert!(bo["undo"]["actions"].as_u64().unwrap() >= 2);
    seq = bo["seq"].as_u64().unwrap();
    seq = service.undo("human-undo", "b", seq).await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    let restored = service.view("human-undo", "b").await.unwrap();
    assert_eq!(restored["active"], 1);
    assert_eq!(restored["state"]["phase"], "buy");
    service.refolded("human-undo", 1).await;
    seq = service
        .act("human-undo", "b", seq, vec![json!({"type":"finish_buy"})])
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    let ada = service.view("human-undo", "a").await.unwrap();
    let card = ada["state"]["players"][0]["hand"][0]["id"].clone();
    seq = service
        .act(
            "human-undo",
            "a",
            seq,
            vec![json!({"type":"resource","card":card})],
        )
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    assert_eq!(
        service.view("human-undo", "b").await.unwrap()["undo"]["available"],
        false
    );
    assert!(service.undo("human-undo", "b", seq).await.is_err());
    assert!(
        log.read("human-undo")
            .unwrap()
            .iter()
            .any(|e| e.kind == "undo")
    );
}

#[tokio::test]
async fn human_undo_rewinds_bots_until_another_human_acts() {
    exercise_human_undo(false).await;
}
#[tokio::test]
async fn dev_human_undo_rewinds_bots_until_another_human_acts() {
    exercise_human_undo(true).await;
}

#[tokio::test]
async fn off_turn_economy_is_private_authorized_and_preserves_the_active_turn() {
    let store = store_with(&["a", "b", "c", "d"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table(
            "free-economy",
            &[("a", "Ada"), ("b", "Bo"), ("c", "Cy"), ("d", "Dee")],
        ))
        .await
        .unwrap();
    let bo = service.view("free-economy", "b").await.unwrap();
    let seq = bo["seq"].as_u64().unwrap();
    assert!(
        service
            .act("free-economy", "b", seq, vec![json!({"type":"pass"})])
            .await
            .is_err()
    );
    let card = bo["state"]["players"][1]["hand"][0]["id"].clone();
    let seq = service
        .act(
            "free-economy",
            "b",
            seq,
            vec![json!({"type":"resource","card":card})],
        )
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    let after = service.view("free-economy", "b").await.unwrap();
    assert_eq!(after["active"], 0);
    assert_eq!(
        after["state"]["players"][1]["inPlay"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        service
            .act(
                "free-economy",
                "a",
                seq,
                vec![json!({"type":"resource","card":card})]
            )
            .await
            .is_err()
    );
    service.refolded("free-economy", 1).await;
}

#[tokio::test]
async fn undo_reuses_a_reversed_shuffle_and_resumes_its_snapshot() {
    let store = store_with(&["a", "b", "c", "d"]);
    let log = Arc::new(SqliteTableLog(store));
    let service = Service::start(log.clone(), Arc::new(TrustedAuthority), Duration::ZERO);
    service
        .open(table(
            "shuffle-undo",
            &[("a", "Ada"), ("b", "Bo"), ("c", "Cy"), ("d", "Dee")],
        ))
        .await
        .unwrap();
    let (seq, mut snapshot) = log
        .snapshots("shuffle-undo")
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let mut engine: Value = serde_json::from_str(snapshot["engine"].as_str().unwrap()).unwrap();
    let starters = engine["state"]["players"][0]["hand"].clone();
    engine["state"]["players"][0]["hand"] = json!([{"id":"qa-draw","key":"strategyCore"}]);
    engine["state"]["players"][0]["deck"] = json!([]);
    engine["state"]["players"][0]["discard"] = starters;
    snapshot["engine"] = json!(engine.to_string());
    log.save_snapshot("shuffle-undo", seq, &snapshot).unwrap();
    service
        .call(|t| {
            t.live.remove("shuffle-undo");
            Ok(())
        })
        .await
        .unwrap();
    let action = json!({"type":"special","card":"qa-draw"});
    let seq = service
        .act("shuffle-undo", "a", seq, vec![action.clone()])
        .await
        .unwrap()["seq"]
        .as_u64()
        .unwrap();
    let first = service.view("shuffle-undo", "a").await.unwrap();
    assert_eq!(first["undo"]["available"], true);
    let seq = service.undo("shuffle-undo", "a", seq).await.unwrap()["seq"]
        .as_u64()
        .unwrap();
    service
        .call(|t| {
            t.live.remove("shuffle-undo");
            Ok(())
        })
        .await
        .unwrap();
    let restored = service.view("shuffle-undo", "a").await.unwrap();
    assert_eq!(restored["state"]["players"][0]["hand"][0]["id"], "qa-draw");
    service
        .act("shuffle-undo", "a", seq, vec![action])
        .await
        .unwrap();
    let second = service.view("shuffle-undo", "a").await.unwrap();
    assert_eq!(
        first["state"]["players"][0]["hand"],
        second["state"]["players"][0]["hand"]
    );
    let events = log.read("shuffle-undo").unwrap();
    let dealt: Vec<_> = events
        .iter()
        .filter(|e| e.seq > seq - 3 && e.kind == "shuffle" && e.public["purpose"] == "deck:0")
        .collect();
    let last = dealt.last().unwrap();
    assert!(
        events
            .iter()
            .any(|e| e.seq < last.seq && e.kind == "shuffle" && e.public == last.public),
        "repeating the order reuses its commitment and permutation"
    );
    service
        .call(|t| {
            t.live.remove("shuffle-undo");
            Ok(())
        })
        .await
        .unwrap();
    assert_eq!(
        service.view("shuffle-undo", "a").await.unwrap()["state"],
        second["state"]
    );
}

/// #corner-portals: the command service enforces the cost-2 aligned crossing.
#[tokio::test]
async fn a_shared_move_uses_the_aligned_corner_portal() {
    let (service, seq) = prepared_shared_movement("-10,8").await;
    let (seat, observation, legal) = service.turn("split").await.unwrap();
    assert_eq!(seat, 0);
    assert_eq!(observation["portalLinks"]["-10,8"], "8,-10");
    assert_eq!(observation["portalMovementCost"], 2);
    let action = legal
        .iter()
        .find(|a| {
            a["type"] == "move"
                && a["source"] == "-10,8"
                && a["destination"] == "8,-10"
                && a["units"] == json!({"settler":0,"explorer":0,"fleet":1})
        })
        .unwrap()
        .clone();
    let mut too_far = action.clone();
    too_far["destination"] = json!("8,-9");
    assert!(
        service.act("split", "a", seq, vec![too_far]).await.is_err(),
        "crossing plus one step costs 3, beyond Fleet Move's 2"
    );
    service.act("split", "a", seq, vec![action]).await.unwrap();
    let after = service.view("split", "a").await.unwrap();
    assert_eq!(
        after["state"]["fleets"]["-10,8"]["0"],
        json!({"settler":1,"explorer":1,"fleet":1})
    );
    assert_eq!(after["state"]["fleets"]["8,-10"]["0"]["fleet"], 1);
}

/// docs/release.md#dev-channel: on a dev server (every merge to main deploys),
/// a table keeps the engine it was dealt with when a rules-changing merge
/// deploys, a save-compatible merge reaches tables at once, and a kept revision
/// is pruned only when no unfinished table plays it.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_dev_table_keeps_its_build_when_a_rules_change_deploys() {
    use super::channel::{Channel, KEEP_FOR};
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    let store = store_with(&["a", "b"]);
    let log = Arc::new(SqliteTableLog(store.clone()));
    let dev = |n: u32| format!("{}+dev.{n}", galactic_reach::RULES);
    // Each deploy is a fresh server process over the same database.
    let deploy = |rules: String, app: &str, now: u64| {
        let channel = Channel::dev(store.clone(), rules, format!("c{now}"));
        channel
            .keep_current_as(app, galactic_reach::ADAPTER_SOURCE, now)
            .unwrap();
        Service::start_on(
            log.clone(),
            Arc::new(TrustedAuthority),
            Duration::ZERO,
            Arc::new(channel),
        )
    };
    let resource = |view: &Value| {
        let card = view["state"]["players"][0]["hand"][0]["id"].clone();
        vec![json!({"type":"resource","card":card})]
    };
    let limit = |view: &Value| view["state"]["players"][0]["resourceLimits"]["matter"].clone();
    let current = galactic_reach::APP_SOURCE;
    let original = "resourceLimits: { matter:4,";
    assert!(
        current.contains(original),
        "the engine still sets the starting limit here"
    );
    // Build A's rules differ visibly: a starting Matter limit of 9.
    let build_a = current.replace(original, "resourceLimits: { matter:9,");

    // A dev revision nothing plays, last current long ago.
    deploy(dev(0), current, 1);

    // Build A deals table d1.
    let a = deploy(dev(1), &build_a, 2 * KEEP_FOR);
    let mut t = table("d1", &[("a", "Ada"), ("b", "Bo")]);
    t.rules = a.channel.rules.clone();
    a.open(t).await.unwrap();
    let view = a.view("d1", "a").await.unwrap();
    assert_eq!(view["rules_version"], dev(1));
    assert_eq!(view["client_path"], "/galactic-reach/");
    assert_eq!(limit(&view), 9);
    let seq = view["seq"].as_u64().unwrap();
    a.act("d1", "a", seq, resource(&view)).await.unwrap();
    drop(a);

    // Build B merges a rules change (a new breaking entry: +dev.2).
    let b = deploy(dev(2), current, 2 * KEEP_FOR + 1);
    assert!(
        b.channel.kept(&dev(0)).is_none(),
        "an unplayed revision is pruned after KEEP_FOR"
    );
    let view = b.view("d1", "a").await.unwrap();
    assert_eq!(view["rules_version"], dev(1), "d1 keeps its dealt revision");
    assert_eq!(limit(&view), 9, "d1 still plays build A's rules");
    assert_eq!(
        view["client_path"],
        format!(
            "/galactic-reach/dev/{}/",
            dev(1).rsplit('/').next().unwrap()
        )
    );
    let seq = view["seq"].as_u64().unwrap();
    let after = b.act("d1", "a", seq, resource(&view)).await.unwrap();
    assert!(
        after["seq"].as_u64().unwrap() > seq,
        "d1 keeps playing on build B's server"
    );
    let mut t = table("d2", &[("a", "Ada"), ("b", "Bo")]);
    t.rules = b.channel.rules.clone();
    b.open(t).await.unwrap();
    let fresh = b.view("d2", "a").await.unwrap();
    assert_eq!(fresh["rules_version"], dev(2));
    assert_eq!(limit(&fresh), 4, "new tables get build B's rules");
    drop(b);

    // Build B' merges an interface-only change: same revision, new build.
    let interface = format!("{current}\n// interface-only edit\n");
    let b2 = deploy(dev(2), &interface, 2 * KEEP_FOR + 2);
    for (id, rules, matter) in [("d1", dev(1), 9), ("d2", dev(2), 4)] {
        let view = b2.view(id, "a").await.unwrap();
        assert_eq!(view["rules_version"], rules);
        assert_eq!(limit(&view), matter);
        let seq = view["seq"].as_u64().unwrap();
        b2.act(id, "a", seq, resource(&view)).await.unwrap();
    }
    assert_eq!(
        b2.channel.kept(&dev(2)).unwrap().app,
        interface,
        "the current revision runs the newest build"
    );

    // d1's browser: build A's engine with the current interface files.
    let mut app = crate::tests::app(false);
    app.store = store.clone();
    app.shared = b2.clone();
    let get = |path: String| {
        let app = app.clone();
        async move {
            let req = Request::builder().uri(path).body(Body::empty()).unwrap();
            let res = crate::router(app).oneshot(req).await.unwrap();
            let status = res.status();
            let location = res.headers().get("location").cloned();
            let body = res.into_body().collect().await.unwrap().to_bytes();
            (
                status,
                location,
                String::from_utf8_lossy(&body).into_owned(),
            )
        }
    };
    let base = format!("/galactic-reach/dev/{}", dev(1).rsplit('/').next().unwrap());
    let (status, _, body) = get(format!("{base}/app.js")).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body.contains("resourceLimits: { matter:9,"),
        "build A's engine"
    );
    let (_, _, body) = get(format!("{base}/channel.js")).await;
    assert!(body.contains(&dev(1)), "the page plays build A's revision");
    let (status, location, _) = get(format!("{base}/styles.css")).await;
    assert_eq!(status, StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(
        location.unwrap(),
        "/galactic-reach/styles.css",
        "current interface"
    );
    let (_, _, body) = get("/galactic-reach/channel.js".into()).await;
    assert!(body.contains(&dev(2)) && body.contains("\"dev\""));
    let (status, _, _) = get(format!("{base}/../../app.js")).await;
    assert_ne!(status, StatusCode::OK);
    let (status, _, _) = get("/galactic-reach/dev/33.38/app.js".into()).await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "released revisions are not dev builds"
    );
}

// Fast stand-ins on change PRs for the whole-match tests in the heavy tier
// (.config/nextest.toml, docs/release.md#heavy-tests). They live here rather than in
// crates/galactic-reach so that test-only edits there do not count as rule changes.

/// The first 300 decisions of a four-rival match, twice: every pick is legal and
/// the two runs choose identically.
#[test]
fn reference_rivals_open_a_match_legally_and_reproducibly() {
    let play = || {
        let mut game = GalacticReach::new([8; 32]).unwrap();
        let mut agents: Vec<BuiltinAgent> = [
            Strategy::Military,
            Strategy::Economy,
            Strategy::Expansion,
            Strategy::Wanderer,
        ]
        .into_iter()
        .enumerate()
        .map(|(i, s)| BuiltinAgent::new(s, [i as u8; 32]))
        .collect();
        let mut trace = vec![];
        for _ in 0..300 {
            let seat = game.active_seat().expect("the match is still running");
            let legal = game.legal_actions(seat);
            let pick = agents[seat].select_action(&game.observe(seat).unwrap(), &legal);
            game.apply_action(seat, legal[pick].clone()).unwrap();
            trace.push((seat, legal[pick].clone()));
        }
        trace
    };
    assert_eq!(play(), play());
}

/// A shared table on the current rules resumes from its snapshot text exactly:
/// the resumed engine re-snapshots byte for byte and plays on identically. The
/// galactic-reach heavy test does the same for every revision in SHARED_RULES.
#[test]
fn shared_tables_resume_exactly_on_current_rules() {
    use rand::{SeedableRng, rngs::StdRng, seq::SliceRandom};
    use std::{cell::RefCell, rc::Rc};
    let rules = galactic_reach::RULES;
    assert!(galactic_reach::SHARED_RULES.contains(&rules));
    let log: Rc<RefCell<Vec<Vec<usize>>>> = Rc::default();
    let mut rng = StdRng::from_seed([9; 32]);
    let record = log.clone();
    let seats: [(String, bool); 4] = std::array::from_fn(|i| (format!("P{i}"), i < 2));
    let mut game = GalacticReach::shared(rules, &seats, 20, move |n, _| {
        let mut order: Vec<usize> = (0..n).collect();
        order.shuffle(&mut rng);
        record.borrow_mut().push(order.clone());
        order
    })
    .unwrap();
    assert_eq!(game.rules_version(), rules);
    let mut agents: Vec<BuiltinAgent> = (0..4)
        .map(|i| BuiltinAgent::new(Strategy::Economy, [i; 32]))
        .collect();
    let mut step = |g: &mut GalacticReach| {
        let seat = g.active_seat().unwrap();
        let legal = g.legal_actions(seat);
        let pick = agents[seat].select_action(&g.observe(seat).unwrap(), &legal);
        g.apply_action(seat, legal[pick].clone()).unwrap();
        legal[pick].clone()
    };
    for _ in 0..120 {
        step(&mut game);
    }
    let text = game.snapshot().unwrap();
    let mut next = log.borrow().len();
    let replay = log.clone();
    let mut resumed = GalacticReach::shared_on(rules, &seats, 20, Some(&text), move |n, _| {
        let order = replay.borrow()[next].clone();
        assert_eq!(order.len(), n);
        next += 1;
        order
    })
    .unwrap();
    assert_eq!(
        resumed.snapshot().unwrap(),
        text,
        "resumed snapshot is identical"
    );
    for _ in 0..150 {
        let action = step(&mut game);
        let seat = resumed.active_seat().unwrap();
        resumed.apply_action(seat, action).unwrap();
    }
    assert_eq!(
        resumed.snapshot().unwrap(),
        game.snapshot().unwrap(),
        "plays on identically"
    );
}
