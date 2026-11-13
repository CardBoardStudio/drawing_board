// Immutable AI agents for14.19 games and replays.
use super::*;
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
            Self::Military => "gr-military/10",
            Self::Economy => "gr-economy/10",
            Self::Expansion => "gr-expansion/10",
            Self::Wanderer => "gr-wanderer/10",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/10" => Some(Self::Military),
            "gr-economy/10" => Some(Self::Economy),
            "gr-expansion/10" => Some(Self::Expansion),
            "gr-wanderer/10" => Some(Self::Wanderer),
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
            "build" | "colony_build" => match action["kind"].as_str().unwrap_or("") {
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
                        p["relicSignal"] == true || p["special"] == "relic" || p["unknown"] == true
                    } else if military && number(&fleet["fleet"]) > 1.0 {
                        !p["owner"].is_null() && p["owner"] != json!(seat)
                    } else {
                        center
                            && p["type"] != "moon"
                            && p["owner"].is_null()
                            && number(&fleet["settler"]) > 0.0
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
            "excavate" => 95.0,
            "special" => 50.0,

            "buy_effect" => 100.0,
            "upgrade" => {
                if number(&me["resources"][action["resource"].as_str().unwrap()]) >= 2.0 {
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
                        "tradeConsortium",
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
                    if view["phase"] == "buy" { 35.0 } else { 75.0 }
                } else if number(&me["resources"][give]) >= 5.0
                    && number(&me["resources"][get]) < 2.0
                {
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
            "discard_overflow" => {
                let resource = action["resource"].as_str().unwrap();
                number(&me["resources"][resource]) + number(&action["amount"]) * 0.01
            }
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
