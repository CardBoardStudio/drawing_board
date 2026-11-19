use super::*;
use crate::tests::call;

fn session(headers: &HeaderMap) -> String {
    headers[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .into()
}
fn secret(link: &Value, key: &str) -> String {
    link["url"]
        .as_str()
        .unwrap()
        .split(&format!("#{key}="))
        .nth(1)
        .unwrap()
        .into()
}
async fn setup() -> (App, String, String) {
    let app = crate::tests::app(true);
    let (code, h, _) = call(&app, "POST", "/api/auth/dev", "", json!({"name":"Host"})).await;
    assert_eq!(code, StatusCode::OK);
    let host = session(&h);
    let (code, _, table) = call(
        &app,
        "POST",
        "/api/tables",
        &host,
        json!({"name":"Phones","game":"galactic-reach","lobby":true}),
    )
    .await;
    assert_eq!(code, StatusCode::OK, "{table}");
    (app, host, table["id"].as_str().unwrap().into())
}
async fn scoped(
    app: &App,
    id: &str,
    path: &str,
    cookie: &str,
    body: Value,
) -> (StatusCode, HeaderMap, Value) {
    call(
        app,
        "POST",
        &format!("/api/tabletop/{id}/{path}"),
        cookie,
        body,
    )
    .await
}
async fn view(app: &App, id: &str, cookie: &str) -> (StatusCode, HeaderMap, Value) {
    call(
        app,
        "GET",
        &format!("/api/tabletop/{id}/seat"),
        cookie,
        json!({}),
    )
    .await
}
async fn redeem_phone(app: &App, id: &str, link: &Value) -> String {
    let (code, h, result) =
        scoped(app, id, "redeem", "", json!({"token":secret(link,"pair")})).await;
    assert_eq!(code, StatusCode::OK, "{result}");
    session(&h)
}
async fn join_phone(app: &App, id: &str, invite: &Value, name: &str) -> (String, String) {
    let (code, h, result) = scoped(
        app,
        id,
        "join",
        "",
        json!({"invite":secret(invite,"invite"),"name":name}),
    )
    .await;
    assert_eq!(code, StatusCode::OK, "{result}");
    (session(&h), result["code"].as_str().unwrap().into())
}
async fn requests(app: &App, id: &str, host: &str) -> Value {
    call(
        app,
        "GET",
        &format!("/api/tabletop/{id}/requests"),
        host,
        json!({}),
    )
    .await
    .2
}
#[tokio::test]
async fn guest_approval_scopes_private_hands_and_reconnects_without_accounts() {
    let (mut app, host, id) = setup().await;
    let (_, _, host_link) = scoped(&app, &id, "host-phone", &host, json!({})).await;
    assert!(host_link["qr"].as_str().unwrap().contains("<svg"));
    let host_phone = redeem_phone(&app, &id, &host_link).await;
    assert_eq!(
        call(
            &app,
            "POST",
            &format!("/api/tables/{id}/lobby/start"),
            &host,
            json!({})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (_, _, invite) = scoped(&app, &id, "phone-invite", &host, json!({})).await;
    let mut cookies = vec![];
    for name in ["Ada", "Bo", "Cy"] {
        let (cookie, code) = join_phone(&app, &id, &invite, name).await;
        assert_eq!(view(&app, &id, &cookie).await.2["status"], "pending");
        assert_eq!(
            scoped(
                &app,
                &id,
                "act",
                &cookie,
                json!({"seq":0,"actions":[{"type":"pass"}]})
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        let rows = requests(&app, &id, &host).await;
        let participant = rows["requests"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["code"] == code)
            .unwrap()["participant"]
            .clone();
        let again = scoped(
            &app,
            &id,
            "join",
            &cookie,
            json!({"invite":secret(&invite,"invite"),"name":name}),
        )
        .await;
        assert_eq!(again.2["code"], code, "retry keeps one request");
        assert!(
            !scoped(
                &app,
                &id,
                "approve",
                &cookie,
                json!({"participant":participant,"approve":true})
            )
            .await
            .0
            .is_success()
        );
        let accepted = scoped(
            &app,
            &id,
            "approve",
            &host,
            json!({"participant":participant,"approve":true}),
        )
        .await;
        assert_eq!(accepted.0, StatusCode::OK, "{}", accepted.2);
        cookies.push(cookie);
    }
    assert_eq!(
        scoped(
            &app,
            &id,
            "join",
            "",
            json!({"invite":secret(&invite,"invite"),"name":"Fifth"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let started = call(
        &app,
        "POST",
        &format!("/api/tables/{id}/lobby/start"),
        &host,
        json!({}),
    )
    .await;
    assert_eq!(started.0, StatusCode::OK, "{}", started.2);
    let before = view(&app, &id, &host_phone).await.2;
    assert_eq!(before["committed_only"], true);
    assert_eq!(
        call(
            &app,
            "POST",
            &format!("/api/tables/{id}/lobby/start"),
            &host,
            json!({})
        )
        .await
        .0,
        StatusCode::OK,
        "start retry is idempotent"
    );
    assert_eq!(
        before,
        view(&app, &id, &host_phone).await.2,
        "start never rerolls"
    );
    let guest = view(&app, &id, &cookies[0]).await.2;
    assert_ne!(guest["seat"], before["seat"]);
    assert_eq!(guest["client_path"], format!("/api/tabletop/{id}/client/"));
    let hs = before["seat"].as_u64().unwrap() as usize;
    assert_eq!(guest["state"]["players"][hs]["hand"], json!([]));
    let own_card = &before["state"]["players"][hs]["hand"][0]["id"];
    let denied = scoped(
        &app,
        &id,
        "act",
        &cookies[0],
        json!({"seq":guest["seq"],"seat":hs,"actions":[{"type":"resource","card":own_card}]}),
    )
    .await;
    assert!(!denied.0.is_success(), "a guest cannot spend another hand");
    assert_eq!(view(&app, &id, &host_phone).await.2["seq"], before["seq"]);
    app.shared.snapshot_all().await;
    app.shared = table_service(&app.store, std::time::Duration::ZERO);
    assert_eq!(
        guest,
        view(&app, &id, &cookies[0]).await.2,
        "cookie resumes the same seat after server reload"
    );
    assert_eq!(
        view(&app, &"f".repeat(32), &cookies[0]).await.0,
        StatusCode::UNAUTHORIZED
    );
    for path in ["/api/account", "/api/tables", "/api/admin/overview"] {
        assert!(
            !call(&app, "GET", path, &cookies[0], json!({}))
                .await
                .0
                .is_success()
        );
    }
    let participant = requests(&app, &id, &host).await["requests"][0]["participant"].clone();
    let (_, _, replacement) = scoped(
        &app,
        &id,
        "repair",
        &host,
        json!({"participant":participant}),
    )
    .await;
    assert_eq!(
        view(&app, &id, &cookies[0]).await.0,
        StatusCode::UNAUTHORIZED
    );
    let renewed = redeem_phone(&app, &id, &replacement).await;
    assert_eq!(view(&app, &id, &renewed).await.2["seat"], guest["seat"]);
    let host_view = view(&app, &id, &host_phone).await.2;
    let seat = host_view["seat"].as_u64().unwrap() as usize;
    let action = json!({"seq":host_view["seq"],"actions":[{"type":"resource","card":host_view["state"]["players"][seat]["hand"][0]["id"]}]});
    let accepted = scoped(&app, &id, "act", &host_phone, action.clone()).await;
    assert_eq!(accepted.0, StatusCode::OK, "{}", accepted.2);
    let head = accepted.2["view"]["seq"].clone();
    assert_eq!(
        scoped(&app, &id, "act", &host_phone, action).await.0,
        StatusCode::CONFLICT,
        "a lost response cannot apply the same command twice"
    );
    for (path, cookie) in [
        (format!("/api/tabletop/{id}/undo"), &host_phone),
        (format!("/api/shared/{id}/undo"), &host),
    ] {
        let denied = call(&app, "POST", &path, cookie, json!({"seq":head})).await;
        assert_eq!(denied.0, StatusCode::CONFLICT);
        assert!(denied.2["error"].as_str().unwrap().contains("final"));
    }
    app.shared.kick(&id);
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    assert_eq!(
        view(&app, &id, &host_phone).await.2["seq"],
        head,
        "no automatic replacement of a waiting human"
    );
    let (_, _, board_link) = scoped(&app, &id, "board-grant", &host, json!({})).await;
    let board = redeem_phone(&app, &id, &board_link).await;
    assert_eq!(view(&app, &id, &board).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(
        call(
            &app,
            "GET",
            &format!("/api/tabletop/{id}/client/app.js"),
            &board,
            json!({})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
}
#[tokio::test]
async fn approve_and_start_cannot_accept_a_phone_outside_the_frozen_roster() {
    let (app, host, id) = setup().await;
    let (_, _, invite) = scoped(&app, &id, "phone-invite", &host, json!({})).await;
    let (one, _) = join_phone(&app, &id, &invite, "One").await;
    let first = requests(&app, &id, &host).await["requests"][0]["participant"].clone();
    assert_eq!(
        scoped(
            &app,
            &id,
            "approve",
            &host,
            json!({"participant":first,"approve":true})
        )
        .await
        .0,
        StatusCode::OK
    );
    let (two, _) = join_phone(&app, &id, &invite, "Two").await;
    let second = requests(&app, &id, &host).await["requests"][1]["participant"].clone();
    let path = format!("/api/tables/{id}/lobby/start");
    let (approved, started) = tokio::join!(
        scoped(
            &app,
            &id,
            "approve",
            &host,
            json!({"participant":second,"approve":true})
        ),
        call(&app, "POST", &path, &host, json!({}))
    );
    assert_eq!(started.0, StatusCode::OK, "{}", started.2);
    let second_view = view(&app, &id, &two).await;
    if approved.0.is_success() {
        assert!(
            second_view.2.get("seat").is_some(),
            "approved phone must be seated"
        );
    } else {
        assert_eq!(second_view.2["status"], "closed");
    }
    assert!(view(&app, &id, &one).await.2.get("seat").is_some());
    assert_eq!(
        scoped(
            &app,
            &id,
            "join",
            "",
            json!({"invite":secret(&invite,"invite"),"name":"Late"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn board_focus_is_public_ephemeral_and_only_reaches_the_acting_phone() {
    let (app, host, id) = setup().await;
    let (_, _, host_link) = scoped(&app, &id, "host-phone", &host, json!({})).await;
    let mut phones = vec![redeem_phone(&app, &id, &host_link).await];
    let (_, _, invite) = scoped(&app, &id, "phone-invite", &host, json!({})).await;
    for name in ["A", "B", "C"] {
        let (cookie, code) = join_phone(&app, &id, &invite, name).await;
        let participant = requests(&app, &id, &host).await["requests"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["code"] == code)
            .unwrap()["participant"]
            .clone();
        assert_eq!(
            scoped(
                &app,
                &id,
                "approve",
                &host,
                json!({"participant":participant,"approve":true})
            )
            .await
            .0,
            StatusCode::OK
        );
        phones.push(cookie);
    }
    call(
        &app,
        "POST",
        &format!("/api/tables/{id}/lobby/start"),
        &host,
        json!({}),
    )
    .await;
    let (_, _, link) = scoped(&app, &id, "board-grant", &host, json!({})).await;
    let board = redeem_phone(&app, &id, &link).await;
    let before = app.shared.public_view(&id).await.unwrap();
    let seq = before["seq"].as_u64().unwrap();
    assert_eq!(
        scoped(
            &app,
            &id,
            "focus",
            &phones[0],
            json!({"seq":seq,"coord":"0,0"})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    for coord in ["99,0", "1,x,2", "0,0,0"] {
        assert_eq!(
            scoped(&app, &id, "focus", &board, json!({"seq":seq,"coord":coord}))
                .await
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    assert_eq!(
        scoped(
            &app,
            &id,
            "focus",
            &board,
            json!({"seq":seq-1,"coord":"0,0"})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    assert_eq!(
        scoped(&app, &id, "focus", &board, json!({"seq":seq,"coord":"0,0"}))
            .await
            .0,
        StatusCode::OK
    );
    assert_eq!(
        before,
        app.shared.public_view(&id).await.unwrap(),
        "suggestion never mutates game state or log"
    );
    let mut recipients = 0;
    for cookie in phones {
        let v = view(&app, &id, &cookie).await.2;
        if v["active"] == v["seat"] {
            assert_eq!(v["board_focus"]["coord"], "0,0");
            recipients += 1;
        } else {
            assert!(v.get("board_focus").is_none());
        }
    }
    assert_eq!(recipients, 1);
    assert!(
        app.shared.sector_suggestion(&id, seq + 1).is_none(),
        "suggestions expire when the position changes"
    );
}
