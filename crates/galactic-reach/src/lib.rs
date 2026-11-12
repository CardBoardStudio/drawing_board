//! Galactic Reach's existing JavaScript rules behind the shared Rust game contract.
//! QuickJS has no host IO, filesystem, timers, or module loader. Each match gets a
//! separate heap, memory/stack limits, and a wall-clock interrupt deadline.
use game_core::{GameAdapter, PlayerAgent};
use rand::{Rng, SeedableRng, rngs::StdRng};
use rquickjs::{Context, Runtime};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};

pub const RULES: &str = "galactic-reach/22.27";
mod legacy_v1;
mod legacy_v10;
mod legacy_v11;
mod legacy_v12;
mod legacy_v13;
mod legacy_v14;
mod legacy_v15;
mod legacy_v16;
mod legacy_v17;
mod legacy_v2;
mod legacy_v3;
mod legacy_v4;
mod legacy_v5;
mod legacy_v6;
mod legacy_v7;
mod legacy_v8;
mod legacy_v9;
mod replay;
pub use replay::Trace;
const ENGINE: &str = include_str!("../../../prototypes/galactic-reach/app.js");
const ADAPTER: &str = include_str!("../../../prototypes/galactic-reach/adapter.js");
const MATCH_TIMEOUT: Duration = Duration::from_secs(300);
pub const SIMULATION_TIMEOUT: &str = "Galactic Reach simulation exceeded its time limit.";
fn execution_error(deadline: Instant, error: impl ToString) -> String {
    if Instant::now() >= deadline {
        SIMULATION_TIMEOUT.into()
    } else {
        error.to_string()
    }
}
#[derive(Deserialize)]
struct Snapshot {
    active: Option<usize>,
    observation: Value,
    legal: Vec<Value>,
    scores: Option<Vec<f64>>,
}
pub struct GalacticReach {
    context: Context,
    deadline: Instant,
    snapshot: Snapshot,
    rules: &'static str,
    trace: Option<Trace>,
}
impl GalacticReach {
    pub fn new(seed: [u8; 32]) -> Result<Self, String> {
        Self::with_timeout(seed, MATCH_TIMEOUT)
    }
    fn with_timeout(seed: [u8; 32], timeout: Duration) -> Result<Self, String> {
        Self::initialize(seed, timeout, RULES)
    }
    pub fn with_rules(seed: [u8; 32], rules: &str) -> Result<Self, String> {
        let rules = match rules {
            RULES => RULES,
            "galactic-reach/4.9" => "galactic-reach/4.9",
            "galactic-reach/5.10" => "galactic-reach/5.10",
            "galactic-reach/6.11" => "galactic-reach/6.11",
            "galactic-reach/7.12" => "galactic-reach/7.12",
            "galactic-reach/8.13" => "galactic-reach/8.13",
            "galactic-reach/9.14" => "galactic-reach/9.14",
            "galactic-reach/10.15" => "galactic-reach/10.15",
            "galactic-reach/11.16" => "galactic-reach/11.16",
            "galactic-reach/12.17" => "galactic-reach/12.17",
            "galactic-reach/13.18" => "galactic-reach/13.18",
            "galactic-reach/14.19" => "galactic-reach/14.19",
            "galactic-reach/15.20" => "galactic-reach/15.20",
            "galactic-reach/16.21" => "galactic-reach/16.21",
            "galactic-reach/17.22" => "galactic-reach/17.22",
            "galactic-reach/18.23" => "galactic-reach/18.23",
            "galactic-reach/19.24" => "galactic-reach/19.24",
            "galactic-reach/20.25" => "galactic-reach/20.25",
            "galactic-reach/21.26" => "galactic-reach/21.26",
            _ => return Err("Unsupported rules version.".into()),
        };
        Self::initialize(seed, MATCH_TIMEOUT, rules)
    }
    fn initialize(seed: [u8; 32], timeout: Duration, rules: &'static str) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(64 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Instant::now() + timeout;
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context
            .with(|ctx| {
                // Seeded RNG is owned by the game, never by a policy observation.
                let rng = std::cell::RefCell::new(StdRng::from_seed(seed));
                ctx.globals().set(
                    "gameRandom",
                    rquickjs::Function::new(ctx.clone(), move || rng.borrow_mut().r#gen::<f64>())?,
                )?;
                ctx.eval::<(), _>(match rules {
                    RULES => ADAPTER,
                    "galactic-reach/17.22" => include_str!("../rules/v17-adapter.js"),
                    "galactic-reach/18.23" => include_str!("../rules/v18-adapter.js"),
                    "galactic-reach/19.24" => include_str!("../rules/v19-adapter.js"),
                    "galactic-reach/20.25" => include_str!("../rules/v20-adapter.js"),
                    "galactic-reach/21.26" => include_str!("../rules/v21-adapter.js"),
                    "galactic-reach/16.21" => include_str!("../rules/v16-adapter.js"),
                    "galactic-reach/15.20" => include_str!("../rules/v15-adapter.js"),
                    "galactic-reach/14.19" => include_str!("../rules/v14-adapter.js"),
                    "galactic-reach/13.18" => include_str!("../rules/v13-adapter.js"),
                    "galactic-reach/12.17" => include_str!("../rules/v12-adapter.js"),
                    "galactic-reach/11.16" => include_str!("../rules/v11-adapter.js"),
                    "galactic-reach/10.15" => include_str!("../rules/v10-adapter.js"),
                    "galactic-reach/9.14" => include_str!("../rules/v9-adapter.js"),
                    "galactic-reach/8.13" => include_str!("../rules/v8-adapter.js"),
                    "galactic-reach/7.12" => include_str!("../rules/v7-adapter.js"),
                    "galactic-reach/6.11" => include_str!("../rules/v6-adapter.js"),
                    "galactic-reach/5.10" => include_str!("../rules/v5-adapter.js"),
                    _ => include_str!("../rules/v4-adapter.js"),
                })?;
                ctx.eval::<(), _>(include_str!("../rules/replay-view.js"))?;
                ctx.eval::<(), _>(match rules {
                    RULES => ENGINE,
                    "galactic-reach/17.22" => include_str!("../rules/v17-app.js"),
                    "galactic-reach/18.23" => include_str!("../rules/v18-app.js"),
                    "galactic-reach/19.24" => include_str!("../rules/v19-app.js"),
                    "galactic-reach/20.25" => include_str!("../rules/v20-app.js"),
                    "galactic-reach/21.26" => include_str!("../rules/v21-app.js"),
                    "galactic-reach/16.21" => include_str!("../rules/v16-app.js"),
                    "galactic-reach/15.20" => include_str!("../rules/v15-app.js"),
                    "galactic-reach/14.19" => include_str!("../rules/v14-app.js"),
                    "galactic-reach/13.18" => include_str!("../rules/v13-app.js"),
                    "galactic-reach/12.17" => include_str!("../rules/v12-app.js"),
                    "galactic-reach/11.16" => include_str!("../rules/v11-app.js"),
                    "galactic-reach/10.15" => include_str!("../rules/v10-app.js"),
                    "galactic-reach/9.14" => include_str!("../rules/v9-app.js"),
                    "galactic-reach/8.13" => include_str!("../rules/v8-app.js"),
                    "galactic-reach/7.12" => include_str!("../rules/v7-app.js"),
                    "galactic-reach/6.11" => include_str!("../rules/v6-app.js"),
                    "galactic-reach/5.10" => include_str!("../rules/v5-app.js"),
                    _ => include_str!("../rules/v4-app.js"),
                })?;
                ctx.eval::<(), _>(
                    "globalThis.game = createGalacticReach({headless: true, random: gameRandom});",
                )
            })
            .map_err(|e| {
                execution_error(
                    deadline,
                    format!("Galactic Reach initialization failed: {e}"),
                )
            })?;
        let snapshot = Self::read_snapshot(&context, deadline)?;
        Ok(Self {
            context,
            deadline,
            snapshot,
            rules,
            trace: None,
        })
    }
    pub fn start_trace(&mut self) -> Result<(), String> {
        self.trace = Some(Trace::new(self.replay_view()?));
        Ok(())
    }
    pub fn take_trace(&mut self) -> Option<Trace> {
        self.trace.take()
    }
    fn replay_view(&self) -> Result<Value, String> {
        if Instant::now() >= self.deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.replayView())"))
            .map_err(|e| execution_error(self.deadline, e))?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    fn read_snapshot(context: &Context, deadline: Instant) -> Result<Snapshot, String> {
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        let json = context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.snapshot())"))
            .map_err(|e| {
                execution_error(deadline, format!("Galactic Reach execution failed: {e}"))
            })?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
}
impl GameAdapter for GalacticReach {
    type Observation = Value;
    type Action = Value;
    fn rules_version(&self) -> &str {
        self.rules
    }
    fn active_seat(&self) -> Option<usize> {
        self.snapshot.active
    }
    fn observe(&self, seat: usize) -> Option<Value> {
        if seat >= 4 {
            return None;
        }
        if self.snapshot.active == Some(seat) {
            return Some(self.snapshot.observation.clone());
        }
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>(format!("JSON.stringify(game.observe({seat}))")))
            .ok()?;
        serde_json::from_str(&json).ok()
    }
    fn legal_actions(&self, seat: usize) -> Vec<Value> {
        if self.snapshot.active == Some(seat) {
            self.snapshot.legal.clone()
        } else {
            vec![]
        }
    }
    fn apply_action(&mut self, seat: usize, action: Value) -> Result<(), String> {
        if Instant::now() >= self.deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        if self.snapshot.active != Some(seat) || !self.snapshot.legal.contains(&action) {
            return Err("Illegal action.".into());
        }
        self.context
            .with(|ctx| ctx.eval::<(), _>(format!("game.applyAction({seat}, {});", action)))
            .map_err(|e| {
                execution_error(self.deadline, format!("Galactic Reach action failed: {e}"))
            })?;
        self.snapshot = Self::read_snapshot(&self.context, self.deadline)?;
        if self.trace.is_some() {
            let view = self.replay_view()?;
            if let Some(trace) = self.trace.as_mut() {
                trace.push(seat, action, view);
            }
        }
        Ok(())
    }
    fn scores(&self) -> Option<Vec<f64>> {
        self.snapshot.scores.clone()
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Strategy {
    Military,
    Economy,
    Expansion,
    Wanderer,
}
impl Strategy {
    pub fn version(self) -> &'static str {
        match self {
            Self::Military => "gr-military/18",
            Self::Economy => "gr-economy/18",
            Self::Expansion => "gr-expansion/18",
            Self::Wanderer => "gr-wanderer/18",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/18" => Some(Self::Military),
            "gr-economy/18" => Some(Self::Economy),
            "gr-expansion/18" => Some(Self::Expansion),
            "gr-wanderer/18" => Some(Self::Wanderer),
            _ => None,
        }
    }
}
pub struct BuiltinAgent {
    strategy: Strategy,
    rng: StdRng,
}
fn number(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}
fn distance(a: &str, b: &str) -> f64 {
    let coord = |s: &str| -> Vec<f64> { s.split(',').filter_map(|n| n.parse().ok()).collect() };
    let a = coord(a);
    let b = coord(b);
    if a.len() != 2 || b.len() != 2 {
        return 100.0;
    }
    ((a[0] - b[0]).abs() + (a[1] - b[1]).abs() + (a[0] + a[1] - b[0] - b[1]).abs()) / 2.0
}
fn bot_units(view: &Value, seat: usize, kind: &str) -> f64 {
    view["fleets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .map(|g| number(&g[seat.to_string()][kind]))
        .sum()
}
fn bot_order(key: &str) -> &str {
    match key {
        "move"
        | "surveyDrones"
        | "pathfinderNetwork"
        | "fleetOverdrive"
        | "coordinatedAssault"
        | "phaseShearDrive"
        | "obeliskOfAnnihilation" => "move",
        "construct" | "modularConstruction" | "orbitalShipyards" => "construct",
        "colonize" | "dropColonyModules" | "genesisSeedVault" => "colonize",
        "excavate" => "excavate",
        "probe" => "probe",
        _ => "other",
    }
}
fn bot_cards(me: &Value, order: &str) -> f64 {
    ["hand", "discard", "deckContents"]
        .iter()
        .flat_map(|k| me[k].as_array().into_iter().flatten())
        .filter(|c| bot_order(c["key"].as_str().unwrap_or("")) == order)
        .map(|c| c["count"].as_f64().unwrap_or(1.0))
        .sum()
}
fn bot_yards(view: &Value, seat: usize) -> usize {
    view["planets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .filter(|p| {
            p["owner"] == json!(seat) && p["upgrade"] == "starbase" && p["occupiedBy"].is_null()
        })
        .count()
}
fn bot_cost(view: &Value, seat: usize) -> Value {
    let me = &view["players"][seat];
    let hand = me["hand"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    for (coord, p) in view["planets"].as_object().into_iter().flatten() {
        let f = &view["fleets"][coord][seat.to_string()];
        let center = p["cluster"]
            .as_u64()
            .is_some_and(|id| view["clusters"][id as usize]["center"] == *coord);
        if center
            && number(&f["settler"]) > 0.0
            && (p["owner"].is_null() || p["owner"] != json!(seat) && p["occupiedBy"] == json!(seat))
            && hand
                .iter()
                .any(|c| bot_order(c["key"].as_str().unwrap_or("")) == "colonize")
        {
            let discount = hand.iter().any(|c| c["key"] == "dropColonyModules");
            return json!({"biomass": if discount||!p["owner"].is_null(){1}else{2}});
        }
        if number(&f["explorer"]) > 0.0
            && p["special"] == "relic"
            && hand.iter().any(|c| c["key"] == "excavate")
        {
            return json!({"matter":1,"energy":1,"data":2});
        }
    }
    if bot_yards(view, seat) == 0 {
        json!({"matter":2,"energy":1,"biomass":1,"data":1})
    } else {
        json!({"matter":2,"energy":2,"biomass":2,"data": if view["relicRow"].as_array().is_some_and(|r|!r.is_empty()){2}else{1}})
    }
}
fn bot_safe_fight(view: &Value, seat: usize, moving: &Value, target: &str) -> bool {
    let opponent = view["fleets"][target].as_object().and_then(|g| {
        g.iter().find(|(id, f)| {
            *id != &seat.to_string()
                && ["settler", "explorer", "fleet"]
                    .iter()
                    .any(|k| number(&f[k]) > 0.0)
        })
    });
    let empty = json!({});
    let enemy = opponent.map(|(_, f)| f).unwrap_or(&empty);
    let p = &view["planets"][target];
    let yard =
        p["upgrade"] == "starbase" && p["owner"] != json!(seat) && p["occupiedBy"] != json!(seat);
    let attack = number(&moving["settler"]) + 3.0 * number(&moving["fleet"]);
    let hull = 2.0 * number(&moving["settler"]) + 7.0 * number(&moving["fleet"]);
    let enemy_attack = number(&enemy["settler"])
        + number(&enemy["explorer"])
        + 3.0 * number(&enemy["fleet"])
        + if yard { 3.0 } else { 0.0 };
    let enemy_hull = 4.0 * number(&enemy["settler"])
        + number(&enemy["explorer"])
        + 7.0 * number(&enemy["fleet"])
        + if yard { 3.0 } else { 0.0 };
    if enemy_hull == 0.0 {
        return true;
    }
    if number(&moving["settler"]) > 0.0 {
        return enemy_attack <= 1.0 && attack - 2.0 >= enemy_hull;
    }
    attack * 3.0 - 4.0 >= enemy_hull && hull > enemy_attack * 3.0 + 2.0
}
impl BuiltinAgent {
    pub fn new(strategy: Strategy, seed: [u8; 32]) -> Self {
        Self {
            strategy,
            rng: StdRng::from_seed(seed),
        }
    }
    fn score(&self, view: &Value, action: &Value) -> f64 {
        let seat = view["seat"].as_u64().unwrap() as usize;
        let me = &view["players"][seat];
        let military = matches!(self.strategy, Strategy::Military);
        let economy = matches!(self.strategy, Strategy::Economy);
        match action["type"].as_str().unwrap_or("") {
            "combat_stay" => 30.0,
            "combat_escape" => {
                let combat = &view["combat"];
                let side = combat["side"].as_str().unwrap();
                let own = &combat["sides"][side];
                let enemy = &combat["sides"][if side == "attacker" {
                    "defender"
                } else {
                    "attacker"
                }];
                let all_explorers = own["pieces"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|p| p["type"] == "explorer");
                let enemy_attack: f64 = enemy["pieces"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|p| number(&p["damage"]) < number(&p["hull"]))
                    .map(|p| number(&p["power"]))
                    .sum();
                if all_explorers || enemy_attack >= 3.0 {
                    80.0 + number(&action["amount"])
                } else {
                    10.0
                }
            }
            "combat_tactic" => {
                // Only public used tactics and our own hand are in this view.
                // An opponent's pending commitment is deliberately unavailable.
                let combat = &view["combat"];
                let side = combat["side"].as_str().unwrap();
                let own = &combat["sides"][side];
                let enemy = &combat["sides"][if side == "attacker" {
                    "defender"
                } else {
                    "attacker"
                }];
                let stats = |force: &Value| -> (f64, f64) {
                    force["pieces"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|p| number(&p["damage"]) < number(&p["hull"]))
                        .fold((0.0, 0.0), |(power, hull), p| {
                            (
                                power + number(&p["power"]),
                                hull + number(&p["hull"]) - number(&p["damage"]),
                            )
                        })
                };
                let (own_attack, own_hull) = stats(own);
                let (enemy_attack, enemy_hull) = stats(enemy);
                let used = enemy["used"].as_array().unwrap();
                let fire = 2.0
                    - used
                        .iter()
                        .filter(|key| **key == "concentratedFire")
                        .count() as f64;
                let probability = fire / (4.0 - used.len() as f64);
                let screen = action["tactic"] == "defensiveScreen";
                let dealt = (own_attack + if screen { 0.0 } else { 1.0 }
                    - (1.0 - probability) * 2.0)
                    .max(0.0);
                let received =
                    (enemy_attack + probability - if screen { 2.0 } else { 0.0 }).max(0.0);
                50.0 + dealt - received * 0.75 + if dealt >= enemy_hull { 8.0 } else { 0.0 }
                    - if received >= own_hull { 10.0 } else { 0.0 }
                    + if screen && side == "defender" && combat["volley"] == 3 {
                        2.0
                    } else {
                        0.0
                    }
            }
            "trade_accept" => {
                let offer = view["tradeOffers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["id"] == action["offer"])
                    .unwrap();
                let give = offer["giveType"].as_str().unwrap();
                let get = offer["getType"].as_str().unwrap();
                let received = number(&offer["giveAmount"])
                    * if number(&me["resources"][give]) < 2.0 {
                        1.45
                    } else {
                        1.0
                    };
                let paid = number(&offer["getAmount"])
                    * if number(&me["resources"][get]) < 2.0 {
                        1.4
                    } else {
                        1.0
                    };
                if received >= paid { 130.0 } else { -20.0 }
            }
            "trade_reject" => 110.0,
            "trade_cancel" => -20.0,
            "trade_offer" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                let willing = view["players"].as_array().unwrap().iter().any(|p| {
                    p["id"] != json!(seat)
                        && p["passed"] == false
                        && number(&p["resources"][get]) >= 2.0
                });
                if action["giveAmount"] == 1
                    && action["getAmount"] == 1
                    && number(&me["resources"][give]) >= 3.0
                    && number(&me["resources"][get]) < 2.0
                    && willing
                {
                    10.0
                } else {
                    -20.0
                }
            }
            "colonize" => 160.0,
            "build" | "colony_build" => match action["kind"].as_str().unwrap_or("") {
                "starbase" => {
                    if bot_yards(view, seat) == 0 {
                        110.0
                    } else {
                        -5.0
                    }
                }
                "harvester" => {
                    let resource = view["planets"][action["coord"].as_str().unwrap()]["type"]
                        .as_str()
                        .unwrap_or("");
                    let income: f64 = view["planets"]
                        .as_object()
                        .unwrap()
                        .values()
                        .filter(|p| {
                            p["owner"] == json!(seat)
                                && p["type"] == resource
                                && p["occupiedBy"].is_null()
                        })
                        .map(|p| {
                            1.0 + if p["upgrade"] == "harvester" {
                                number(&p["upgradeLevel"])
                            } else {
                                0.0
                            }
                        })
                        .sum();
                    if income < 2.0 {
                        if economy { 79.0 } else { 68.0 }
                    } else {
                        4.0
                    }
                }
                "settler" => {
                    if bot_units(view, seat, "settler")
                        < if matches!(self.strategy, Strategy::Expansion) {
                            2.0
                        } else {
                            1.0
                        }
                    {
                        86.0
                    } else {
                        5.0
                    }
                }
                "explorer" => {
                    if bot_units(view, seat, "explorer") < 1.0
                        && view["relicRow"].as_array().is_some_and(|r| !r.is_empty())
                    {
                        83.0
                    } else {
                        -5.0
                    }
                }
                _ => {
                    if military && bot_units(view, seat, "fleet") < 3.0 {
                        78.0
                    } else {
                        8.0
                    }
                }
            },
            "resource" => {
                let cost = bot_cost(view, seat);
                let gain = action["gain"].as_object().unwrap();
                let need: f64 = gain
                    .iter()
                    .map(|(k, v)| {
                        number(v) * (number(&cost[k]) - number(&me["resources"][k])).max(0.0)
                    })
                    .sum();
                let deficit = cost
                    .as_object()
                    .unwrap()
                    .iter()
                    .any(|(k, v)| number(v) > number(&me["resources"][k]));
                let bankable: f64 = gain
                    .iter()
                    .filter(|(k, _)| number(&me["resources"][*k]) < number(&cost[*k]) + 4.0)
                    .map(|(_, v)| number(v))
                    .sum();
                let key = action["key"].as_str().unwrap_or("");
                let last_build = bot_yards(view, seat) == 0
                    && bot_order(key) == "construct"
                    && me["hand"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter(|c| bot_order(c["key"].as_str().unwrap_or("")) == "construct")
                        .count()
                        == 1;
                if last_build {
                    -20.0
                } else if need > 0.0 {
                    45.0 + need * 4.0
                } else if deficit && bankable > 0.0 {
                    30.0 + bankable
                } else {
                    -5.0
                }
            }
            "move" => {
                let from = action["source"].as_str().unwrap();
                let to = action["destination"].as_str().unwrap();
                let fleet = &view["fleets"][from][seat.to_string()];
                let explorer = action["moveGroup"] == "explorer";
                let settlers = number(&fleet["settler"]);
                let here = &view["planets"][from];
                let waiting_probe = here["cluster"].as_u64().is_some_and(|id| {
                    let cluster = &view["clusters"][id as usize];
                    (cluster["kind"] == "moon" || id >= 4 && cluster["center"] != "0,0")
                        && cluster["located"] == false
                });
                if explorer
                    && (here["special"] == "relic"
                        || here["relicSignal"] == true
                        || waiting_probe
                        || view["relicRow"].as_array().is_none_or(|r| r.is_empty()))
                {
                    return -10.0;
                }
                let here_center = here["cluster"]
                    .as_u64()
                    .is_some_and(|id| view["clusters"][id as usize]["center"] == from);
                if !explorer
                    && settlers > 0.0
                    && here_center
                    && (here["owner"].is_null()
                        || here["owner"] != json!(seat) && here["occupiedBy"] == json!(seat))
                {
                    return -10.0;
                }
                let mut best = -10.0_f64;
                for (coord, p) in view["planets"].as_object().unwrap() {
                    let center = p["cluster"]
                        .as_u64()
                        .is_some_and(|id| view["clusters"][id as usize]["center"] == *coord);
                    let known_relic = p["special"] == "relic" || p["relicSignal"] == true;
                    let goal = if explorer {
                        known_relic
                            || center
                                && p["cluster"].as_u64().unwrap() >= 4
                                && *coord != "0,0"
                                && view["clusters"][p["cluster"].as_u64().unwrap() as usize]["located"]
                                    == false
                    } else {
                        settlers > 0.0
                            && center
                            && p["type"] != "moon"
                            && p["owner"] != json!(seat)
                            && bot_safe_fight(view, seat, fleet, coord)
                    };
                    if goal && distance(from, coord) > distance(to, coord) {
                        best = best.max(
                            (if explorer {
                                if known_relic { 90.0 } else { 70.0 }
                            } else {
                                92.0
                            }) + distance(from, coord)
                                - distance(to, coord)
                                - distance(to, coord) * 0.3,
                        );
                    }
                }
                if !explorer && settlers == 0.0 {
                    for (coord, group) in view["fleets"].as_object().unwrap() {
                        let enemy = group
                            .as_object()
                            .unwrap()
                            .iter()
                            .find(|(id, _)| *id != &seat.to_string());
                        if let Some((owner, other)) = enemy {
                            let escape = number(&other["explorer"]) > 0.0
                                && number(
                                    &view["players"][owner.parse::<usize>().unwrap()]["resources"]
                                        ["energy"],
                                ) >= number(&other["explorer"]);
                            if !escape
                                && bot_safe_fight(view, seat, fleet, coord)
                                && distance(from, coord) > distance(to, coord)
                            {
                                best = best.max(
                                    (if military { 94.0 } else { 80.0 })
                                        - distance(to, coord) * 0.3,
                                );
                            }
                        }
                    }
                }
                best
            }
            "probe" => 150.0,
            "excavate" => 160.0,
            "special" => 50.0,

            "buy_effect" => 100.0,
            "upgrade" => {
                let cost = bot_cost(view, seat);
                let r = action["resource"].as_str().unwrap();
                if bot_yards(view, seat) > 0
                    && number(&me["resources"][r]) >= number(&cost[r]) + 2.0
                {
                    65.0
                } else {
                    -5.0
                }
            }
            "buy" => {
                let key = action["key"].as_str().unwrap_or("");
                let order = bot_order(key);
                let size = number(&me["handCount"])
                    + number(&me["deckCount"])
                    + me["discard"].as_array().map_or(0, Vec::len) as f64;
                if bot_yards(view, seat) == 0 {
                    -10.0
                } else if order == "move" && bot_cards(me, "move") < 5.0 {
                    if key == "fleetOverdrive" { 94.0 } else { 88.0 }
                } else if key == "dropColonyModules"
                    && bot_units(view, seat, "settler") > 0.0
                    && size < 16.0
                {
                    90.0
                } else if order == "construct" && bot_cards(me, "construct") < 2.0 {
                    80.0
                } else if size < 14.0 && ["tradeConsortium", "tacticalForesight"].contains(&key) {
                    75.0
                } else {
                    -10.0
                }
            }
            "increase_storage" => {
                let used: f64 = me["resources"]
                    .as_object()
                    .unwrap()
                    .values()
                    .map(number)
                    .sum();
                let reserve = bot_cost(view, seat);
                if number(&me["capacity"]) < 30.0
                    && number(&me["capacity"]) - used <= 2.0
                    && [("matter", 2.0), ("energy", 1.0), ("data", 1.0)]
                        .iter()
                        .all(|(r, n)| number(&me["resources"][r]) >= number(&reserve[r]) + n)
                {
                    55.0
                } else {
                    -20.0
                }
            }
            "bank_trade" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                let cost = bot_cost(view, seat);
                let bootstrap = get == "data"
                    && bot_yards(view, seat) == 0
                    && number(&me["resources"]["data"]) < 1.0
                    && number(&me["resources"][give]) >= 4.0;
                let funded = number(&me["resources"][get]) < number(&cost[get])
                    && number(&me["resources"][give]) >= number(&cost[give]) + 4.0;
                if bootstrap || funded { 100.0 } else { -20.0 }
            }
            // Voluntary discards are exposed for players; policies never discard blindly.
            "consortium_gain" => {
                30.0 - number(&me["resources"][action["resource"].as_str().unwrap()])
            }
            "consortium_exchange" => {
                let give = number(&me["resources"][action["giveType"].as_str().unwrap()]);
                let get = number(&me["resources"][action["getType"].as_str().unwrap()]);
                if give > get + 1.0 {
                    20.0 + give - get
                } else {
                    -5.0
                }
            }
            "finish_consortium" => 0.0,
            "cancel_consortium" | "discard_resources" => -50.0,
            "discard_overflow" => {
                let resource = action["resource"].as_str().unwrap();
                let reserve = bot_cost(view, seat);
                number(&me["resources"][resource]) - number(&reserve[resource])
                    + number(&action["amount"]) * 0.01
            }
            "decommission" => {
                let card = me["discard"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|c| c["id"] == action["card"])
                    .unwrap();
                let order = bot_order(card["key"].as_str().unwrap_or(""));
                let redundant = match order {
                    "construct" => bot_cards(me, order) > 2.0,
                    "move" => bot_cards(me, order) > 6.0,
                    "colonize" => bot_cards(me, order) > 3.0,
                    "excavate" => view["relicRow"].as_array().is_none_or(|r| r.is_empty()),
                    _ => false,
                };
                let r = action["resource"].as_str().unwrap();
                let reserve = bot_cost(view, seat);
                if redundant
                    && card["upgraded"] != true
                    && number(&me["resources"][r]) >= number(&reserve[r]) + 3.0
                {
                    30.0
                } else {
                    -10.0
                }
            }
            _ => 0.0,
        }
    }
}
impl PlayerAgent<GalacticReach> for BuiltinAgent {
    fn policy_version(&self) -> &str {
        self.strategy.version()
    }
    fn select_action(&mut self, observation: &Value, legal: &[Value]) -> usize {
        let random = matches!(self.strategy, Strategy::Wanderer);
        legal
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let score = self.score(observation, a);
                (
                    i,
                    if random && score > 0.0 {
                        self.rng.gen_range(1.0..100.0)
                    } else {
                        score
                    },
                )
            })
            .max_by(|a, b| a.1.total_cmp(&b.1).then_with(|| b.0.cmp(&a.0)))
            .map(|p| p.0)
            .unwrap_or(0)
    }
}

/// Immutable policy versions used to verify historical match replays.
pub fn agent(version: &str, seed: [u8; 32]) -> Result<Box<dyn PlayerAgent<GalacticReach>>, String> {
    if let Some(strategy) = Strategy::parse(version) {
        return Ok(Box::new(BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v1::Strategy::parse(version) {
        return Ok(Box::new(legacy_v1::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v2::Strategy::parse(version) {
        return Ok(Box::new(legacy_v2::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v3::Strategy::parse(version) {
        return Ok(Box::new(legacy_v3::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v4::Strategy::parse(version) {
        return Ok(Box::new(legacy_v4::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v5::Strategy::parse(version) {
        return Ok(Box::new(legacy_v5::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v6::Strategy::parse(version) {
        return Ok(Box::new(legacy_v6::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v7::Strategy::parse(version) {
        return Ok(Box::new(legacy_v7::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v8::Strategy::parse(version) {
        return Ok(Box::new(legacy_v8::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v9::Strategy::parse(version) {
        return Ok(Box::new(legacy_v9::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v10::Strategy::parse(version) {
        return Ok(Box::new(legacy_v10::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v11::Strategy::parse(version) {
        return Ok(Box::new(legacy_v11::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v12::Strategy::parse(version) {
        return Ok(Box::new(legacy_v12::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v13::Strategy::parse(version) {
        return Ok(Box::new(legacy_v13::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v14::Strategy::parse(version) {
        return Ok(Box::new(legacy_v14::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v15::Strategy::parse(version) {
        return Ok(Box::new(legacy_v15::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v16::Strategy::parse(version) {
        return Ok(Box::new(legacy_v16::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v17::Strategy::parse(version) {
        return Ok(Box::new(legacy_v17::BuiltinAgent::new(strategy, seed)));
    }
    Err("Unsupported Galactic Reach policy version.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_core::run_match;
    #[test]
    fn scoring_policy_prefers_points_and_settler_colony_goals() {
        let agent = BuiltinAgent::new(Strategy::Military, [9; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[{"key":"voidglassAstrolabe"}],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"},{"id":"c","key":"construct"}],"discard":[],"deckContents":[],"handCount":2,"deckCount":0,"capacity":30},{"resources":{}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase","occupiedBy":null,"cluster":0},"3,0":{"owner":null,"type":"biomass","upgrade":null,"occupiedBy":null,"cluster":1},"-1,0":{"owner":1,"type":"energy","upgrade":"harvester","occupiedBy":null,"cluster":2}},
            "clusters":[{"center":"0,0","surveyed":true},{"center":"3,0","surveyed":false},{"center":"-6,0","surveyed":true}],"fleets":{"0,0":{"0":{"settler":1,"fleet":0,"explorer":0}}}});
        let progress =
            json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships"});
        let occupation =
            json!({"type":"move","source":"0,0","destination":"-1,0","moveGroup":"ships"});
        assert!(
            agent.score(&view, &progress) > agent.score(&view, &occupation),
            "Military Settlers pursue neutral Colonies instead of unrelated resource occupations"
        );
        assert!(
            agent.score(&view, &json!({"type":"colonize"}))
                > agent.score(
                    &view,
                    &json!({"type":"build","coord":"0,0","kind":"harvester"})
                )
        );
        assert!(
            agent.score(&view, &json!({"type":"excavate"}))
                > agent.score(
                    &view,
                    &json!({"type":"build","coord":"0,0","kind":"starbase"})
                )
        );
        let score = agent.score(&view, &progress);
        view["players"][1]["hand"] = json!([{"key":"warSongOfHollowStars"}]);
        assert_eq!(
            agent.score(&view, &progress),
            score,
            "Hidden enemy cards cannot influence planning"
        );
        view["relicRow"] = json!([]);
        assert!(agent.score(&view, &json!({"type":"build","kind":"explorer"})) < 0.0);
        view["fleets"]["0,0"]["0"] = json!({"settler":0,"fleet":0,"explorer":1});
        view["planets"]["0,0"]["special"] = json!("relic");
        assert!(
            agent.score(
                &view,
                &json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"explorer"})
            ) < 0.0
        );
    }
    #[test]
    fn combat_policy_uses_public_damage_and_used_tactics() {
        let agent = BuiltinAgent::new(Strategy::Military, [7; 32]);
        let mut view = json!({"seat":0,"players":[{"resources":{}}],"combat":{
            "side":"attacker","volley":2,"sides":{
                "attacker":{"pieces":[{"type":"fleet","power":3,"hull":7,"damage":0}],"used":[]},
                "defender":{"pieces":[{"type":"fleet","power":3,"hull":7,"damage":5}],"used":["concentratedFire","concentratedFire"],"committed":true}
            }
        }});
        let fire = json!({"type":"combat_tactic","tactic":"concentratedFire"});
        let screen = json!({"type":"combat_tactic","tactic":"defensiveScreen"});
        assert!(
            agent.score(&view, &fire) > agent.score(&view, &screen),
            "Fire can finish a damaged enemy through its remaining Screens"
        );
        view["combat"]["sides"]["attacker"]["pieces"][0]["damage"] = json!(5);
        view["combat"]["sides"]["defender"]["pieces"][0]["damage"] = json!(0);
        view["combat"]["sides"]["defender"]["used"] = json!([]);
        assert!(
            agent.score(&view, &screen) > agent.score(&view, &fire),
            "Screen can preserve a damaged Fleet for another decision"
        );
        let scores = (agent.score(&view, &fire), agent.score(&view, &screen));
        view["combat"]["sides"]["defender"]["committed"] = json!(false);
        assert_eq!(
            scores,
            (agent.score(&view, &fire), agent.score(&view, &screen)),
            "Commitment status does not reveal or predict its card"
        );
    }

    #[test]
    fn current_agents_bootstrap_data_before_explorers() {
        let agent = BuiltinAgent::new(Strategy::Military, [7; 32]);
        let view = json!({
            "seat": 0,
            "phase": "operations",
            "players": [{
                "resources": {"matter": 4, "energy": 4, "biomass": 2, "data": 0},
                "capacity": 10
            }]
        });
        let bank = json!({"type":"bank_trade","giveType":"energy","getType":"data"});
        assert!(agent.score(&view, &bank) > agent.score(&view, &json!({"type":"pass"})));
    }
    #[test]
    fn archived_rules_and_policies_still_load() {
        for rules in [
            "galactic-reach/4.9",
            "galactic-reach/5.10",
            "galactic-reach/6.11",
            "galactic-reach/7.12",
            "galactic-reach/8.13",
            "galactic-reach/9.14",
            "galactic-reach/10.15",
            "galactic-reach/11.16",
            "galactic-reach/12.17",
            "galactic-reach/13.18",
            "galactic-reach/14.19",
            "galactic-reach/15.20",
            "galactic-reach/16.21",
            "galactic-reach/17.22",
            "galactic-reach/18.23",
            "galactic-reach/19.24",
            "galactic-reach/20.25",
            "galactic-reach/21.26",
        ] {
            let game = GalacticReach::with_rules([19; 32], rules).unwrap();
            assert_eq!(game.rules_version(), rules);
            let mut game = game;
            game.apply_action(0, json!({"type":"pass"})).unwrap();
            assert_eq!(
                game.active_seat(),
                Some(
                    if matches!(
                        rules,
                        "galactic-reach/7.12"
                            | "galactic-reach/8.13"
                            | "galactic-reach/9.14"
                            | "galactic-reach/10.15"
                            | "galactic-reach/11.16"
                            | "galactic-reach/12.17"
                            | "galactic-reach/13.18"
                            | "galactic-reach/14.19"
                            | "galactic-reach/15.20"
                            | "galactic-reach/16.21"
                            | "galactic-reach/17.22"
                            | "galactic-reach/18.23"
                            | "galactic-reach/19.24"
                            | "galactic-reach/20.25"
                            | "galactic-reach/21.26"
                    ) {
                        0
                    } else {
                        1
                    },
                ),
                "Archived passes retain their original timing"
            );
        }
        for policy in [
            "gr-military/1",
            "gr-economy/2",
            "gr-expansion/3",
            "gr-military/4",
            "gr-expansion/5",
            "gr-economy/6",
            "gr-military/7",
            "gr-military/8",
            "gr-military/9",
            "gr-military/10",
            "gr-military/11",
            "gr-military/12",
            "gr-military/13",
            "gr-military/14",
            "gr-military/15",
            "gr-military/16",
            "gr-military/17",
            "gr-military/18",
        ] {
            assert_eq!(agent(policy, [23; 32]).unwrap().policy_version(), policy);
        }
    }
    #[test]
    fn adapter_enforces_seats_actions_and_private_observations() {
        let mut g = GalacticReach::new([3; 32]).unwrap();
        let before = g.observe(0).unwrap();
        let me = &before["players"][0];
        assert_eq!(me["hand"].as_array().unwrap().len(), 5);
        for seat in 1..4 {
            assert!(before["players"][seat]["hand"].is_null());
        }
        assert!(me.get("deck").is_none());
        assert!(me.get("militaryDeck").is_none());
        assert!(before.get("advancedDeck").is_none());
        assert_eq!(before["planets"].as_object().unwrap().len(), 91);
        assert!(
            before["planets"]
                .as_object()
                .unwrap()
                .values()
                .all(|p| p.get("type").is_some() && p["special"].is_null())
        );
        assert_eq!(
            before["clusters"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|c| c["kind"] == "unknown" && c["center"].is_null())
                .count(),
            4
        );
        assert!(g.legal_actions(1).is_empty());
        assert!(g.apply_action(1, json!({"type":"pass"})).is_err());
        assert!(
            g.apply_action(0, json!({"type":"move", "destination":"999,999"}))
                .is_err()
        );
        assert_eq!(g.observe(0).unwrap(), before);
        let legal = g.legal_actions(0);
        assert_eq!(legal, g.legal_actions(0));
        assert_eq!(g.observe(0).unwrap(), before);
        g.apply_action(0, json!({"type":"pass"})).unwrap();
        assert_eq!(g.active_seat(), Some(0));
        assert_eq!(g.observe(0).unwrap()["phase"], "buy");
        g.apply_action(0, json!({"type":"finish_buy"})).unwrap();
        assert_eq!(g.active_seat(), Some(1));
        assert_eq!(g.observe(1).unwrap()["phase"], "operations");
    }
    #[test]
    fn reference_policies_complete_reproducible_four_player_matches() {
        let play = || {
            let mut game = GalacticReach::new([8; 32]).unwrap();
            let mut agents: Vec<Box<dyn PlayerAgent<GalacticReach>>> = [
                Strategy::Military,
                Strategy::Economy,
                Strategy::Expansion,
                Strategy::Wanderer,
            ]
            .into_iter()
            .enumerate()
            .map(|(i, s)| {
                Box::new(BuiltinAgent::new(s, [i as u8; 32])) as Box<dyn PlayerAgent<GalacticReach>>
            })
            .collect();
            run_match(&mut game, &mut agents, 10000).unwrap()
        };
        let result = play();
        assert_eq!(result, play());
        assert_eq!(result.rules_version, RULES);
        assert_eq!(result.scores.len(), 4);
        assert_eq!(result.scores.iter().copied().fold(0.0, f64::max), 3.0);
        assert!(result.scores.iter().all(|s| (0.0..=3.0).contains(s)));
    }
    #[test]
    fn execution_deadline_interrupts_javascript() {
        assert_eq!(
            GalacticReach::with_timeout([1; 32], Duration::ZERO)
                .err()
                .unwrap(),
            SIMULATION_TIMEOUT
        );
        let mut game = GalacticReach::new([17; 32]).unwrap();
        let before = game.observe(0).unwrap();
        let action = game.legal_actions(0)[0].clone();
        game.deadline = Instant::now();
        assert_eq!(
            game.apply_action(0, action).unwrap_err(),
            SIMULATION_TIMEOUT
        );
        assert_eq!(
            game.observe(0).unwrap(),
            before,
            "An expired simulation never applies another action"
        );
        assert!(game.scores().is_none());
    }
}
