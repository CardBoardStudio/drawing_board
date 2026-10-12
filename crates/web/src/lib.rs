use game::*;
use gloo_net::http::Request;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::HtmlInputElement;
use yew::prelude::*;

async fn api<T: DeserializeOwned>(
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<T, String> {
    let response = if method == "GET" {
        Request::get(path).send().await
    } else {
        Request::post(path)
            .header("x-drawing-board", "1")
            .json(&body.unwrap_or(json!({})))
            .map_err(|e| e.to_string())?
            .send()
            .await
    }
    .map_err(|_| {
        "Connection lost. Your game is saved; retry when the server is available.".to_string()
    })?;
    if !response.ok() {
        let value: Value = response.json().await.unwrap_or_default();
        return Err(value["error"]
            .as_str()
            .unwrap_or("Request failed. Please try again.")
            .into());
    }
    response
        .json()
        .await
        .map_err(|_| "The server returned an unreadable response.".into())
}
fn route_id() -> Option<String> {
    web_sys::window()?
        .location()
        .hash()
        .ok()?
        .strip_prefix("#table/")
        .filter(|s| s.len() == 32 && s.chars().all(|c| c.is_ascii_hexdigit()))
        .map(str::to_string)
}
fn navigate(id: Option<&str>) {
    let _ = web_sys::window()
        .unwrap()
        .location()
        .set_hash(&id.map(|id| format!("table/{id}")).unwrap_or_default());
}

struct App {
    session: Option<SessionInfo>,
    games: Vec<GameSummary>,
    game: Option<GameView>,
    pending: Option<String>,
    error: Option<String>,
    busy: bool,
    name: String,
    access_code: String,
    title: String,
    join: String,
    rounds: u16,
    tab: String,
    help: bool,
    _poll: gloo_timers::callback::Interval,
    _route: gloo_events::EventListener,
}
enum Msg {
    Boot(Result<SessionInfo, String>),
    Refresh,
    Games(Result<Vec<GameSummary>, String>),
    Name(String),
    AccessCode(String),
    Title(String),
    JoinInput(String),
    Rounds(String),
    Login,
    Logged(Result<Value, String>),
    Logout,
    Create(bool),
    Join,
    Open(String),
    Loaded(Result<Box<GameView>, String>, bool),
    Command(Command),
    Home,
    Tab(String),
    Help,
    Dismiss,
    RouteChanged,
}
impl Component for App {
    type Message = Msg;
    type Properties = ();
    fn create(ctx: &Context<Self>) -> Self {
        let link = ctx.link().clone();
        spawn_local(async move {
            link.send_message(Msg::Boot(api("GET", "/api/session", None).await));
        });
        let link = ctx.link().clone();
        let poll =
            gloo_timers::callback::Interval::new(1800, move || link.send_message(Msg::Refresh));
        let route_link = ctx.link().clone();
        let route =
            gloo_events::EventListener::new(&web_sys::window().unwrap(), "hashchange", move |_| {
                route_link.send_message(Msg::RouteChanged)
            });
        Self {
            _route: route,
            session: None,
            games: vec![],
            game: None,
            pending: route_id(),
            error: None,
            busy: false,
            name: "".into(),
            access_code: "".into(),
            title: "First contact".into(),
            join: "".into(),
            rounds: 20,
            tab: "market".into(),
            help: false,
            _poll: poll,
        }
    }
    fn update(&mut self, ctx: &Context<Self>, msg: Msg) -> bool {
        match msg {
            Msg::Boot(r) => match r {
                Ok(s) => {
                    let logged = s.user.is_some();
                    self.session = Some(s);
                    if logged {
                        if let Some(id) = self.pending.take() {
                            ctx.link().send_message(Msg::Open(id));
                        } else {
                            ctx.link().send_message(Msg::Refresh);
                        }
                    }
                }
                Err(e) => self.error = Some(e),
            },
            Msg::Refresh => {
                if self.busy
                    || self
                        .session
                        .as_ref()
                        .and_then(|s| s.user.as_ref())
                        .is_none()
                {
                    return false;
                }
                let link = ctx.link().clone();
                if let Some(g) = &self.game {
                    let id = g.id.clone();
                    spawn_local(async move {
                        link.send_message(Msg::Loaded(
                            api("GET", &format!("/api/games/{id}"), None).await,
                            false,
                        ));
                    });
                } else {
                    spawn_local(async move {
                        link.send_message(Msg::Games(api("GET", "/api/games", None).await));
                    });
                }
                return false;
            }
            Msg::Games(r) => match r {
                Ok(g) => self.games = g,
                Err(e) => self.error = Some(e),
            },
            Msg::Name(v) => self.name = v,
            Msg::AccessCode(v) => self.access_code = v,
            Msg::Title(v) => self.title = v,
            Msg::JoinInput(v) => self.join = v,
            Msg::Rounds(v) => self.rounds = v.parse().unwrap_or(20),
            Msg::Login => {
                if self.busy {
                    return false;
                }
                self.busy = true;
                self.error = None;
                let name = self.name.clone();
                let preview = self.session.as_ref().is_some_and(|s| s.preview_auth);
                let code = self.access_code.clone();
                let link = ctx.link().clone();
                spawn_local(async move {
                    link.send_message(Msg::Logged(
                        api(
                            "POST",
                            if preview {
                                "/api/auth/preview"
                            } else {
                                "/api/auth/dev"
                            },
                            Some(json!({"name":name,"code":code})),
                        )
                        .await,
                    ));
                });
            }
            Msg::Logout => {
                if self.busy {
                    return false;
                }
                self.busy = true;
                let link = ctx.link().clone();
                spawn_local(async move {
                    link.send_message(Msg::Logged(api("POST", "/api/auth/logout", None).await));
                });
            }
            Msg::Logged(r) => {
                self.busy = false;
                match r {
                    Ok(_) => {
                        self.access_code.clear();
                        self.game = None;
                        self.games.clear();
                        let link = ctx.link().clone();
                        spawn_local(async move {
                            link.send_message(Msg::Boot(api("GET", "/api/session", None).await));
                        });
                    }
                    Err(e) => self.error = Some(e),
                }
            }
            Msg::Create(practice) => {
                if self.busy {
                    return false;
                }
                self.busy = true;
                self.error = None;
                let input = CreateGame {
                    opponent_id: None,
                    name: self.title.clone(),
                    practice,
                    round_limit: self.rounds,
                };
                let link = ctx.link().clone();
                spawn_local(async move {
                    link.send_message(Msg::Loaded(
                        api(
                            "POST",
                            "/api/games",
                            Some(serde_json::to_value(input).unwrap()),
                        )
                        .await,
                        true,
                    ));
                });
            }
            Msg::Join => {
                let raw = self.join.trim();
                let id = raw.rsplit("#table/").next().unwrap_or(raw).to_string();
                ctx.link().send_message(Msg::Open(id));
            }
            Msg::Open(id) => {
                if self.busy {
                    return false;
                }
                if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
                    self.error = Some("Paste a table link or its 32-character code.".into());
                    return true;
                }
                self.busy = true;
                self.error = None;
                let link = ctx.link().clone();
                spawn_local(async move {
                    link.send_message(Msg::Loaded(
                        api("POST", &format!("/api/games/{id}/join"), None).await,
                        true,
                    ));
                });
            }
            Msg::Loaded(r, mutation) => {
                if mutation {
                    self.busy = false;
                }
                match r {
                    Ok(g) => {
                        if !mutation
                            && (self
                                .game
                                .as_ref()
                                .is_none_or(|old| old.id != g.id || old.revision >= g.revision)
                                || self.busy)
                        {
                            return false;
                        }
                        navigate(Some(&g.id));
                        self.game = Some(*g);
                    }
                    Err(e) => {
                        self.error = Some(e);
                        if mutation {
                            ctx.link().send_message(Msg::Refresh);
                        }
                    }
                }
            }
            Msg::Command(command) => {
                if self.busy {
                    return false;
                }
                if let Some(g) = &self.game {
                    self.busy = true;
                    self.error = None;
                    let id = g.id.clone();
                    let input = CommandRequest {
                        revision: g.revision,
                        command,
                    };
                    let link = ctx.link().clone();
                    spawn_local(async move {
                        link.send_message(Msg::Loaded(
                            api(
                                "POST",
                                &format!("/api/games/{id}/commands"),
                                Some(serde_json::to_value(input).unwrap()),
                            )
                            .await,
                            true,
                        ));
                    });
                }
            }
            Msg::Home => {
                if self.busy {
                    return false;
                }
                self.game = None;
                self.error = None;
                navigate(None);
                ctx.link().send_message(Msg::Refresh);
            }
            Msg::Tab(t) => self.tab = t,
            Msg::Help => self.help = !self.help,
            Msg::Dismiss => self.error = None,
            Msg::RouteChanged => {
                if !self.busy && self.session.as_ref().is_some_and(|s| s.user.is_some()) {
                    match route_id() {
                        Some(id) if self.game.as_ref().is_none_or(|g| g.id != id) => {
                            ctx.link().send_message(Msg::Open(id))
                        }
                        None if self.game.is_some() => ctx.link().send_message(Msg::Home),
                        _ => {}
                    }
                }
                return false;
            }
        }
        true
    }
    fn view(&self, ctx: &Context<Self>) -> Html {
        let signed = self.session.as_ref().and_then(|s| s.user.as_ref());
        html! {<div class="app-shell">
        <aside class="rail"><button class="brand" onclick={ctx.link().callback(|_|Msg::Home)} aria-label="Drawing Board home">{"db"}<span>{"."}</span></button><div class="rail-label">{"PLAY / MAKE / REPEAT"}</div><div class="rail-bottom">{"01"}<span>{"LAB"}</span></div></aside>
        <div class="workspace"><header class="topbar"><button class="wordmark" onclick={ctx.link().callback(|_|Msg::Home)}>{"DRAWING BOARD"}<span>{"A place for games to begin."}</span></button><nav><a class="text-button" href="/">{"Game library"}</a><button class="text-button" onclick={ctx.link().callback(|_|Msg::Help)}>{"How to play"}</button>{if let Some(u)=signed{html!{<><span class="user"><span class="status-dot"/>{&u.name}if u.development {<small class="identity-mode">{if self.session.as_ref().is_some_and(|s|s.preview_auth){"PREVIEW"}else{"LOCAL"}}</small>}</span><button class="text-button" disabled={self.busy} onclick={ctx.link().callback(|_|Msg::Logout)}>{"Sign out"}</button></>}}else{html!{<span class="version">{"PLAYTEST LAB · V0.1"}</span>}}}</nav></header>
        if self.session.as_ref().is_some_and(|s|s.preview_auth) {<div class="preview-banner">{"PR PREVIEW · Test identities only. Games reset when this preview redeploys or closes."}</div>}
        if let Some(e)=&self.error{<div class="error" role="alert"><span>{e}</span><button onclick={ctx.link().callback(|_|Msg::Dismiss)} aria-label="Dismiss error">{"×"}</button></div>}
        if self.help{<section class="rules"><div class="section-heading"><h2>{"A quick flight briefing"}</h2><button class="text-button" onclick={ctx.link().callback(|_|Msg::Help)}>{"Close ×"}</button></div><div class="rules-grid"><div><b>{"01 / Deploy"}</b><p>{"Start each turn with 5 cards, 1 action, and 1 buy. Play action cards to draw, earn credits, or extend your turn."}</p></div><div><b>{"02 / Build"}</b><p>{"Play resources for credits, then buy from the shared supply. Buying or playing resources ends your action phase. New cards go to your discard pile."}</p></div><div><b>{"03 / Expand"}</b><p>{"End your turn to discard your hand and draw 5. Your discard pile reshuffles when the deck runs out. Colonies score influence but cannot be played."}</p></div><div><b>{"04 / Win"}</b><p>{"Most influence wins; ties are shared. Finish after a turn that empties Metropolis or 3 supply piles, or after everyone reaches the round limit. Influence is public."}</p></div></div></section>}
        {if self.session.is_none(){html!{<main class="loading">{"Opening the lab…"}</main>}}else if signed.is_none(){self.login_view(ctx)}else if let Some(g)=&self.game{self.table_view(ctx,g)}else{self.lobby_view(ctx)}}
        <footer><span>{"CARDBOARD STUDIOS"}</span><span>{"Ideas become games at the table."}</span><span>{"EXPERIMENT 001"}</span></footer></div></div>}
    }
}
impl App {
    fn login_view(&self, ctx: &Context<Self>) -> Html {
        let s = self.session.as_ref().unwrap();
        html! {<main class="welcome"><div class="hero-copy"><div class="eyebrow"><span class="status-dot"/>{"THE PLAYTEST LAB"}</div><h1>{"Small cards."}<br/>{"Infinite "}<em>{"possibilities."}</em></h1><p class="intro">{"A workbench for worlds that don’t exist. Build a deck, explore a strategy, and find your next great game."}</p><div class="signin"><h2>{"Pull up a seat."}</h2><p>{"Your next expedition starts here."}</p><a class="button primary full" href="/#account">{"Sign in or create a persistent account →"}</a>{if s.nido_available{html!{<a class="button primary full" href="/api/auth/nido">{"Continue with Nido ↗"}</a>}}else{html!{<><button class="button full" disabled=true>{"Nido sign-in · setup required"}</button><p class="small">{"Nido account keys must be configured by the host."}</p></>}}}
        if s.dev_auth || s.preview_auth {<div class="dev-label">{if s.preview_auth{"PR PLAYTEST ACCESS"}else{"LOCAL DEVELOPMENT ACCESS"}}</div><label for="pilot">{"Pilot name"}</label><input id="pilot" maxlength="32" placeholder="e.g. Nova" value={self.name.clone()} oninput={ctx.link().callback(|e:InputEvent|Msg::Name(e.target_unchecked_into::<HtmlInputElement>().value()))}/>if s.preview_auth {<label for="preview-code">{"Preview access code"}</label><input id="preview-code" type="password" autocomplete="off" value={self.access_code.clone()} oninput={ctx.link().callback(|e:InputEvent|Msg::AccessCode(e.target_unchecked_into::<HtmlInputElement>().value()))}/>}<button class="button primary full" disabled={self.busy||self.name.trim().is_empty()||(s.preview_auth&&self.access_code.is_empty())} onclick={ctx.link().callback(|_|Msg::Login)}>{if self.busy{"Taking your seat…"}else{"Enter the lab →"}}</button><p class="small">{if s.preview_auth{"Use the access code from the preview host. This creates a temporary test identity, not a Nido account."}else{"Local test identity. This is not a Nido account."}}</p>}
        </div></div><div class="hero-visual"><div class="orbit-label">{"EXPEDITION 001 / VOIDWRIGHT"}</div><div class="orbit orbit-one"/><div class="orbit orbit-two"/><div class="planet"><div class="planet-ring"/></div><div class="hero-card hero-card-back">{self.decorative_card(Card::Relay)}</div><div class="hero-card hero-card-front">{self.decorative_card(Card::Metropolis)}</div><div class="visual-caption"><span>{"THE FRONTIER IS YOURS TO BUILD."}</span><span>{"↗"}</span></div></div></main>}
    }
    fn decorative_card(&self, c: Card) -> Html {
        let i = c.info();
        html! {<div class={classes!("card","display-card",kind_class(i.kind))}><div class="card-top"><span>{kind_name(i.kind)}</span><b>{i.cost}</b></div><div class="card-art"><span>{&i.icon}</span></div><h3>{&i.name}</h3><p>{&i.text}</p><div class="flavor">{&i.flavor}</div></div>}
    }
    fn lobby_view(&self, ctx: &Context<Self>) -> Html {
        html! {<main class="lobby"><div class="page-heading"><div><div class="eyebrow">{"YOUR WORKBENCH"}</div><h1>{"Let’s play something "}<em>{"new."}</em></h1><p>{"One idea. A table of possibilities. Every playtest makes it better."}</p></div><span class="pill">{"● LAB ONLINE"}</span></div>
        <section class="game-feature"><div class="feature-copy"><div class="eyebrow">{"001 / DECK-BUILDING STRATEGY"}</div><h2>{"VOIDWRIGHT"}</h2><p>{"A new frontier. An empire in your hand."}</p><p class="feature-description">{"Turn a handful of credits into a thriving interstellar civilization. Recruit ships, build an engine, and stake your claim among the stars."}</p><div class="feature-meta"><span>{"◷ 20–40 min"}</span><span>{"♙ 2–4 players"}</span><span>{"12 unique cards"}</span></div><div class="tag">{"PROTOTYPE / RULESET 01"}</div></div><div class="feature-art"><div class="planet small-planet"/><div class="mini-card left-mini">{self.decorative_card(Card::Freighter)}</div><div class="mini-card right-mini">{self.decorative_card(Card::Colony)}</div><span class="coordinates">{"SECTOR 07 / OUTER REACH"}</span></div></section>
        <div class="lobby-grid"><section class="panel create-panel"><div class="section-heading"><h2>{"Set up a playtest"}</h2><span>{"↗"}</span></div><label for="title">{"Table name"}</label><input id="title" maxlength="60" value={self.title.clone()} oninput={ctx.link().callback(|e:InputEvent|Msg::Title(e.target_unchecked_into::<HtmlInputElement>().value()))}/><label for="rounds">{"Maximum rounds per player"}</label><input id="rounds" type="number" min="10" max="50" value={self.rounds.to_string()} oninput={ctx.link().callback(|e:InputEvent|Msg::Rounds(e.target_unchecked_into::<HtmlInputElement>().value()))}/><div class="button-row"><button class="button primary" disabled={self.busy||self.title.trim().is_empty()} onclick={ctx.link().callback(|_|Msg::Create(true))}>{"Practice with Kepler →"}</button><button class="button" disabled={self.busy||self.title.trim().is_empty()} onclick={ctx.link().callback(|_|Msg::Create(false))}>{"Host a table"}</button></div><p class="small">{"Practice with a bot, or invite friends to a private table."}</p></section><section class="panel"><div class="section-heading"><h2>{"An invitation to explore"}</h2><span>{"⌁"}</span></div><p>{"Got a seat waiting? Paste your table link or code."}</p><label for="join">{"Table invitation"}</label><input id="join" placeholder="Paste a table link or code" value={self.join.clone()} oninput={ctx.link().callback(|e:InputEvent|Msg::JoinInput(e.target_unchecked_into::<HtmlInputElement>().value()))}/><button class="button" disabled={self.busy||self.join.trim().is_empty()} onclick={ctx.link().callback(|_|Msg::Join)}>{"Join playtest →"}</button><p class="small">{"Everyone signs in with their own identity. Hands stay private."}</p></section></div>
        <section class="saved"><div class="section-heading"><h2>{"Your playtests"}<span class="count">{self.games.len()}</span></h2><span class="small">{"AUTOMATICALLY SAVED"}</span></div>{if self.games.is_empty(){html!{<div class="empty"><span>{"⌑"}</span><p>{"A blank slate. Your first expedition is waiting."}</p></div>}}else{html!{<div class="saved-list">{for self.games.iter().map(|g|{let id=g.id.clone();html!{<button class="saved-game" disabled={self.busy} onclick={ctx.link().callback(move |_|Msg::Open(id.clone()))}><span class="saved-icon">{"⟁"}</span><span><b>{&g.name}</b><small>{format!("Voidwright · {} players · Round {}",g.players,g.round)}</small></span><span class="pill">{status_name(g.status)}</span><span>{"↗"}</span></button>}})}</div>}}}</section></main>}
    }
    fn table_view(&self, ctx: &Context<Self>, g: &GameView) -> Html {
        let mine = g.players.iter().find(|p| p.is_you).unwrap();
        let invitation = format!(
            "{}{}#table/{}",
            web_sys::window()
                .unwrap()
                .location()
                .origin()
                .unwrap_or_default(),
            "/voidwright/",
            g.id
        );
        html! {<main class="table-page"><div class="table-heading"><div><button class="back" onclick={ctx.link().callback(|_|Msg::Home)}>{"← All playtests"}</button><h1>{"VOIDWRIGHT"}<span>{&g.name}</span></h1></div><div class="table-meta"><span class="pill">{status_name(g.status)}</span><span>{format!("ROUND {:02} / {}",g.round.min(g.round_limit),g.round_limit)}</span></div></div>
        if g.status==Status::Lobby {<section class="waiting panel"><div class="eyebrow">{"ASSEMBLING YOUR CREW"}</div><h2>{"Good games start with good company."}</h2><p>{"Share this invitation with up to three friends. Each person opens it in their own browser and signs in."}</p><label for="invite">{"Table invitation · select to copy"}</label><input id="invite" readonly=true value={invitation}/><div class="crew">{for g.players.iter().map(|p|html!{<span class="pill">{"● "}{&p.name}</span>})}</div><button class="button primary" disabled={!g.host||g.players.len()<2||self.busy} onclick={ctx.link().callback(|_|Msg::Command(Command::Start))}>{if g.host{"Launch expedition →"}else{"Waiting for the host to launch"}}</button></section>}
        if g.status==Status::Finished {<section class="finish"><span>{"✺"}</span><div><div class="eyebrow">{"EXPEDITION COMPLETE"}</div><h2>{format!("{} {}",g.winners.join(" & "),if g.winners.len()>1{"share the frontier."}else{"claims the frontier."})}</h2><p>{"Every deck tells a story. Take what you learned into the next playtest."}</p></div><button class="button primary" onclick={ctx.link().callback(|_|Msg::Home)}>{"Back to the lab →"}</button></section>}
        <div class="table-layout"><div class="play-area"><div class="players">{for g.players.iter().enumerate().map(|(i,p)|html!{<div class={classes!("player",(i==g.active && g.status==Status::Active).then_some("active-player"))}><div class="avatar">{if p.bot{"K".to_string()}else{p.name.chars().next().unwrap_or('?').to_uppercase().to_string()}}</div><div><b>{&p.name}{if p.is_you{" (you)"}else{""}}</b><small>{format!("{} in hand · {} in deck",p.hand,p.deck)}</small></div><div class="score"><b>{p.influence}</b><small>{"INFLUENCE"}</small></div></div>})}</div>
        if g.status!=Status::Lobby {<div class="turnbar"><div><span class="status-dot"/><b>{if g.status==Status::Finished{"Final standings".into()}else if g.your_turn{"Your turn, commander".into()}else{format!("{} is commanding",g.players[g.active].name)}}</b><small>{if g.phase==Phase::Action{"ACTION PHASE"}else{"BUY PHASE"}}</small></div><div class="resources"><span><b>{g.actions}</b>{" Actions"}</span><span><b>{g.buys}</b>{" Buys"}</span><span class="credit-stat"><b>{g.credits}</b>{" Credits"}</span></div></div>
        <div class="market-heading"><div class="tabs"><button class={classes!((self.tab=="market").then_some("selected"))} onclick={ctx.link().callback(|_|Msg::Tab("market".into()))}>{"Supply market"}</button><button class={classes!((self.tab=="deck").then_some("selected"))} onclick={ctx.link().callback(|_|Msg::Tab("deck".into()))}>{"Your collection"}<span>{mine.cards}</span></button></div><span class="small">{if self.tab=="market"{"SHARED SUPPLY"}else{"ALL YOUR CARDS · NO DRAW ORDER"}}</span></div>
        {if self.tab=="market"{html!{<><div class="market-caption"><h3>{"Fleet & technology"}</h3><span>{"Build your engine."}</span></div><div class="card-grid">{for Card::ALL.into_iter().filter(|c|c.info().kind==Kind::Action).map(|c|self.market_card(ctx,g,c))}</div><div class="market-caption"><h3>{"Resources & colonies"}</h3><span>{"Power your fleet. Grow your influence."}</span></div><div class="base-grid">{for Card::ALL.into_iter().filter(|c|c.info().kind!=Kind::Action).map(|c|self.market_card(ctx,g,c))}</div></>}}else{html!{<div class="collection">{for g.collection.iter().map(|(c,n)|{let info=c.info();html!{<div class="collection-row"><span class={classes!("collection-icon",kind_class(info.kind))}>{info.icon}</span><div><b>{info.name}</b><small>{info.text}</small></div><b>{format!("×{n}")}</b></div>}})}</div>}}}
        <section class="hand-section"><div class="section-heading"><div><h2>{"Your hand"}<span class="count">{g.hand.len()}</span></h2><p class="small">{if g.your_turn && g.phase==Phase::Action{"Play an action, then generate credits to buy cards."}else if g.your_turn{"Acquire cards from the supply, then end your turn."}else{"Your hand is private. Plan your next move."}}</p></div><div class="button-row"><button class="button" disabled={!g.your_turn||self.busy||g.hand.iter().all(|c|c.credits()==0)} onclick={ctx.link().callback(|_|Msg::Command(Command::PlayResources))}>{"Play all resources"}</button><button class="button primary" disabled={!g.your_turn||self.busy} onclick={ctx.link().callback(|_|Msg::Command(Command::EndTurn))}>{if self.busy{"Updating…"}else{"End turn →"}}</button></div></div><div class="hand-cards">{for g.hand.iter().enumerate().map(|(index,&c)|{let i=c.info();let enabled=g.your_turn&&!self.busy&&(i.kind==Kind::Resource || (i.kind==Kind::Action&&g.phase==Phase::Action&&g.actions>0));html!{<button class={classes!("hand-card",kind_class(i.kind))} disabled={!enabled} onclick={ctx.link().callback(move |_|Msg::Command(Command::Play{index}))} title={i.text.clone()}><span>{&i.icon}</span><b>{&i.name}</b><small>{&i.text}</small><em>{if i.kind==Kind::Colony{"Scores at game end"}else if enabled{"Click to play ↗"}else{"In your hand"}}</em></button>}})}</div><div class="deck-counts"><span>{format!("▤ Draw pile: {}",mine.deck)}</span><span>{format!("↻ Discard: {}",mine.discard)}</span><span>{format!("◇ Played: {}",mine.played.len())}</span><span>{format!("Scrapped: {}",g.trash.len())}</span></div></section>}
        </div><aside class="activity"><div class="section-heading"><h2>{"Flight log"}</h2><span class="status-dot"/></div><p class="small">{"Every move, a little history."}</p><div class="log" aria-live="polite">{for g.log.iter().rev().map(|e|html!{<div class="log-entry"><span>{format!("{:02}",e.revision)}</span><p>{&e.text}</p></div>})}</div><div class="log-note"><span>{"✳"}</span><b>{"Built through play."}</b><p>{"Try an unexpected combination. The best strategies start as experiments."}</p></div></aside></div></main>}
    }
    fn market_card(&self, ctx: &Context<Self>, g: &GameView, c: Card) -> Html {
        let i = c.info();
        let remaining = g.supply.get(&c).copied().unwrap_or(0);
        let can =
            g.your_turn && !self.busy && g.buys > 0 && g.credits >= i.cost as u16 && remaining > 0;
        html! {<div class={classes!("card",kind_class(i.kind),(remaining==0).then_some("sold-out"))}><div class="card-top"><span>{kind_name(i.kind)}</span><b title="Cost in credits">{i.cost}</b></div><div class="card-art"><span>{&i.icon}</span><div class="art-lines"/></div><h3>{&i.name}</h3><p>{&i.text}</p><div class="card-bottom"><span>{format!("{remaining} left")}</span><button disabled={!can} title={if can{"Add to your discard pile"}else{"Requires your turn, a buy, and enough credits"}} onclick={ctx.link().callback(move |_|Msg::Command(Command::Buy{card:c}))}>{if remaining==0{"Empty"}else{"Acquire +"}}</button></div></div>}
    }
}
fn kind_class(k: Kind) -> &'static str {
    match k {
        Kind::Action => "action-card",
        Kind::Resource => "resource-card",
        Kind::Colony => "colony-card",
    }
}
fn kind_name(k: Kind) -> &'static str {
    match k {
        Kind::Action => "ACTION",
        Kind::Resource => "RESOURCE",
        Kind::Colony => "COLONY",
    }
}
fn status_name(s: Status) -> &'static str {
    match s {
        Status::Lobby => "WAITING FOR CREW",
        Status::Active => "IN PROGRESS",
        Status::Finished => "COMPLETED",
    }
}
#[wasm_bindgen(start)]
pub fn main() {
    yew::Renderer::<App>::new().render();
}
