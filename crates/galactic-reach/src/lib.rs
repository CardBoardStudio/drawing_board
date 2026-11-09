//! Galactic Reach's existing JavaScript rules behind the shared Rust game contract.
//! QuickJS has no host IO, filesystem, timers, or module loader. Each match gets a
//! separate heap, memory/stack limits, and a wall-clock interrupt deadline.
use game_core::{GameAdapter, PlayerAgent};
use rand::{Rng, SeedableRng, rngs::StdRng};
use rquickjs::{Context, Runtime};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};

pub const RULES: &str = "galactic-reach/11.16";
mod legacy_v1;
mod legacy_v2;
mod legacy_v3;
mod legacy_v4;
mod legacy_v5;
mod legacy_v6;
mod replay;
pub use replay::Trace;
const ENGINE: &str = include_str!("../../../prototypes/galactic-reach/app.js");
const ADAPTER: &str = include_str!("../../../prototypes/galactic-reach/adapter.js");
#[derive(Deserialize)]
struct Snapshot {
    active: Option<usize>,
    observation: Value,
    legal: Vec<Value>,
    scores: Option<Vec<f64>>,
}
pub struct GalacticReach {
    context: Context,
    snapshot: Snapshot,
    rules: &'static str,
    trace: Option<Trace>,
}
impl GalacticReach {
    pub fn new(seed: [u8; 32]) -> Result<Self, String> {
        Self::with_timeout(seed, Duration::from_secs(90))
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
            _ => return Err("Unsupported rules version.".into()),
        };
        Self::initialize(seed, Duration::from_secs(90), rules)
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
            .map_err(|e| format!("Galactic Reach initialization failed: {e}"))?;
        let snapshot = Self::read_snapshot(&context)?;
        Ok(Self {
            context,
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
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.replayView())"))
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    fn read_snapshot(context: &Context) -> Result<Snapshot, String> {
        let json = context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.snapshot())"))
            .map_err(|e| format!("Galactic Reach execution failed: {e}"))?;
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
        if self.snapshot.active != Some(seat) || !self.snapshot.legal.contains(&action) {
            return Err("Illegal action.".into());
        }
        self.context
            .with(|ctx| ctx.eval::<(), _>(format!("game.applyAction({seat}, {});", action)))
            .map_err(|e| format!("Galactic Reach action failed: {e}"))?;
        self.snapshot = Self::read_snapshot(&self.context)?;
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
            Self::Military => "gr-military/7",
            Self::Economy => "gr-economy/7",
            Self::Expansion => "gr-expansion/7",
            Self::Wanderer => "gr-wanderer/7",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/7" => Some(Self::Military),
            "gr-economy/7" => Some(Self::Economy),
            "gr-expansion/7" => Some(Self::Expansion),
            "gr-wanderer/7" => Some(Self::Wanderer),
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
        let preferred_directive = if military {
            "technology"
        } else if economy {
            "economy"
        } else {
            "expansion"
        };
        match action["type"].as_str().unwrap_or("") {
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
            "colonize" => 100.0,
            "build" | "colony_build" | "establish_station" => match action["kind"].as_str().unwrap_or("") {
                "research" => 95.0,
                "starbase" => {
                    if military {
                        72.0
                    } else {
                        64.0
                    }
                }
                "harvester" => {
                    if economy {
                        80.0
                    } else {
                        65.0
                    }
                }
                "settler" => {
                    let settlers: f64 = view["fleets"]
                        .as_object()
                        .unwrap()
                        .values()
                        .map(|g| number(&g[seat.to_string()]["settler"]))
                        .sum();
                    if settlers < 3.0 { 82.0 } else { 20.0 }
                }
                "explorer" => 30.0,
                _ => {
                    if military {
                        78.0
                    } else {
                        35.0
                    }
                }
            },
            "resource" => {
                let gain = action["gain"].as_object().unwrap();
                let need: f64 = gain
                    .iter()
                    .map(|(k, v)| number(v) * (4.0 - number(&me["resources"][k])).max(0.0))
                    .sum();
                if need > 0.0 { 40.0 + need } else { -5.0 }
            }
            "move" => {
                let from = action["source"].as_str().unwrap();
                let to = action["destination"].as_str().unwrap();
                let fleet = &view["fleets"][from][seat.to_string()];
                let explorer = action["moveGroup"] == "explorer";
                let mut best = -10.0_f64;
                for (coord, p) in view["planets"].as_object().unwrap() {
                    let center = view["clusters"][p["cluster"].as_u64().unwrap() as usize]["center"]
                        == *coord;
                    let goal = if explorer {
                        p["relicSignal"] == true
                            || p["special"] == "relic" && p["researchStationOwner"].is_null()
                    } else if military
                        && number(&fleet["fleet"]) > 1.0
                    {
                        !p["owner"].is_null() && p["owner"] != json!(seat)
                    } else {
                        center && p["owner"].is_null() && number(&fleet["settler"]) > 0.0
                    };
                    if !goal {
                        continue;
                    }
                    let before = distance(from, coord);
                    let after = distance(to, coord);
                    if before > after {
                        best = best.max(60.0 + (before - after) * 2.0 - after * 0.2);
                    }
                }
                best
            }
            "probe" => 15.0,
            "special" => 50.0,
            "terraform" => {
                if economy {
                    75.0
                } else {
                    45.0
                }
            }
            "buy_effect" => 100.0,
            "upgrade" => {
                if number(&me["resources"]["data"]) >= 2.0 {
                    95.0
                } else {
                    5.0
                }
            }
            "buy" => {
                let favorites = if military {
                    [
                        "coordinatedAssault",
                        "targetingAlgorithms",
                        "orbitalShipyards",
                        "construct",
                    ]
                } else if economy {
                    [
                        "industrialSurge",
                        "modularConstruction",
                        "terraformingProtocols",
                        "construct",
                    ]
                } else {
                    [
                        "dropColonyModules",
                        "surveyDrones",
                        "pathfinderNetwork",
                        "move",
                    ]
                };
                if favorites.contains(&action["key"].as_str().unwrap_or("")) {
                    85.0
                } else {
                    70.0
                }
            }
            "directive" => {
                if action["directive"] == preferred_directive {
                    10.0
                } else {
                    0.0
                }
            }
            "increase_storage" => {
                let used: f64 = me["resources"]
                    .as_object()
                    .unwrap()
                    .values()
                    .map(number)
                    .sum();
                if number(&me["capacity"]) - used <= 2.0 {
                    90.0
                } else {
                    -20.0
                }
            }
            "bank_trade" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                if get == "data"
                    && number(&me["resources"][give]) >= 4.0
                    && number(&me["resources"]["data"]) < 2.0
                {
                    // The Colony-only deck has no Data conversion before its first Explorer.
                    if view["phase"] == "buy" {
                        35.0
                    } else {
                        75.0
                    }
                } else if number(&me["resources"][give]) >= 5.0 && number(&me["resources"][get]) < 2.0 {
                    // Keep one of the given resource; favor scarce Data during Buy.
                    if view["phase"] == "buy" && get == "data" {
                        35.0
                    } else {
                        12.0
                    }
                } else {
                    -20.0
                }
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
            "decommission" => -10.0,
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
    Err("Unsupported Galactic Reach policy version.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_core::run_match;
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
                        "galactic-reach/7.12" | "galactic-reach/8.13" | "galactic-reach/9.14" | "galactic-reach/10.15"
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
        assert!(
            before["planets"]
                .as_object()
                .unwrap()
                .values()
                .any(|p| p["unknown"] == true && p.get("type").is_none())
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
            let mut game = GalacticReach::new([17; 32]).unwrap();
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
        assert!(GalacticReach::with_timeout([1; 32], Duration::ZERO).is_err());
    }
}
