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
            Self::Military => "gr-military/23",
            Self::Economy => "gr-economy/23",
            Self::Expansion => "gr-expansion/23",
            Self::Wanderer => "gr-wanderer/23",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/23" => Some(Self::Military),
            "gr-economy/23" => Some(Self::Economy),
            "gr-expansion/23" => Some(Self::Expansion),
            "gr-wanderer/23" => Some(Self::Wanderer),
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
    ["hand", "discard", "deckContents", "inPlay"]
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
fn bot_storage_budget(view: &Value, seat: usize) -> Option<(Value, Value)> {
    let me = &view["players"][seat];
    let leader = view["players"]
        .as_array()?
        .iter()
        .map(|p| number(&p["prestige"]))
        .fold(0.0_f64, f64::max);
    if leader >= 20.0 {
        return None;
    }
    let cost = me["storageUpgradeCost"].as_object()?;
    let resources = ["matter", "energy", "biomass", "data"];
    if resources.iter().any(|r| number(&cost[*r]) <= 0.0) {
        return None;
    }
    let mut production = 0.0;
    for (coord, p) in view["planets"].as_object().into_iter().flatten() {
        if !resources.contains(&p["type"].as_str().unwrap_or("")) {
            continue;
        }
        if p["owner"] == json!(seat) && p["occupiedBy"].is_null() {
            production += 1.0
                + if p["upgrade"] == "harvester" {
                    number(&p["upgradeLevel"]).max(1.0)
                } else {
                    0.0
                };
        }
        let fleet = &view["fleets"][coord][seat.to_string()];
        if number(&fleet["settler"]) + number(&fleet["fleet"]) > 0.0 {
            production += 1.0;
        }
    }
    let used: f64 = resources.iter().map(|r| number(&me["resources"][*r])).sum();
    let pressure = (used + production - number(&me["capacity"])).max(0.0);
    let horizon = ((20.0 - leader) / 4.0).ceil().clamp(1.0, 4.0);
    if pressure.min(5.0) * horizon <= cost.values().map(number).sum::<f64>() {
        return None;
    }
    let settlers = bot_units(view, seat, "settler") > 0.0;
    let explorers = bot_units(view, seat, "explorer") > 0.0;
    let protection = if bot_yards(view, seat) == 0 {
        json!({"matter":2,"energy":1,"biomass":1,"data":1})
    } else if !settlers && !explorers {
        json!({"matter":1,"energy":1})
    } else {
        json!({"matter":if explorers{1}else{0},"energy":if explorers{1}else{0},"biomass":if settlers{2}else{0},"data":if explorers{2}else{0}})
    };
    Some((Value::Object(cost.clone()), protection))
}

fn bot_storage_reserve(view: &Value, seat: usize) -> Value {
    let base = bot_cost(view, seat);
    let Some((cost, protection)) = bot_storage_budget(view, seat) else {
        return base;
    };
    let mut desired = json!({});
    let mut reserve = json!({});
    for r in ["matter", "energy", "biomass", "data"] {
        let n = number(&cost[r]) + number(&protection[r]);
        desired[r] = json!(n);
        reserve[r] = json!(n.max(number(&base[r])));
    }
    let sum = |v: &Value| v.as_object().unwrap().values().map(number).sum::<f64>();
    let capacity = number(&view["players"][seat]["capacity"]);
    if sum(&reserve) <= capacity {
        reserve
    } else if sum(&desired) <= capacity {
        desired
    } else {
        base
    }
}

// Public one-Move threat envelope. Never inspect another faction's hand.
fn bot_threat(view: &Value, seat: usize, moving: &Value, destination: &str, source: &str) -> f64 {
    let standing = &view["fleets"][destination][seat.to_string()];
    let own_fleets = number(&moving["fleet"])
        + if source == destination {
            0.0
        } else {
            number(&standing["fleet"])
        };
    let p = &view["planets"][destination];
    let yard = p["owner"] == json!(seat) && p["upgrade"] == "starbase" && p["occupiedBy"].is_null();
    let defense = own_fleets + if yard { 0.7 } else { 0.0 };
    view["fleets"]
        .as_object()
        .into_iter()
        .flatten()
        .flat_map(|(coord, groups)| {
            groups
                .as_object()
                .into_iter()
                .flatten()
                .filter_map(move |(owner, enemy)| {
                    let range = if number(&enemy["settler"]) > 0.0 {
                        2.0
                    } else {
                        3.0
                    };
                    let fleets = number(&enemy["fleet"]);
                    if owner != &seat.to_string()
                        && fleets > 0.0
                        && distance(coord, destination) <= range
                    {
                        Some(if fleets > defense { 1.0 } else { 0.0 })
                    } else {
                        None
                    }
                })
        })
        .fold(0.0_f64, f64::max)
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
                    let coord = action["coord"].as_str().unwrap();
                    let group = &view["fleets"][coord][seat.to_string()];
                    if bot_threat(view, seat, group, coord, coord) > 0.0 {
                        115.0
                    } else if military && bot_units(view, seat, "fleet") < 4.0 {
                        81.0
                    } else {
                        8.0
                    }
                }
            },
            "resource" => {
                let cost = bot_storage_reserve(view, seat);
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
                if explorer
                    && (here["special"] == "relic"
                        || here["relicSignal"] == true
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
                if !explorer {
                    let here_risk = bot_threat(view, seat, fleet, from, from);
                    let there_risk = bot_threat(view, seat, fleet, to, from);
                    if here_risk > there_risk {
                        best = best.max(105.0);
                    }
                    if settlers == 0.0 {
                        for (coord, group) in view["fleets"].as_object().unwrap() {
                            let ally = &group[seat.to_string()];
                            let escort = number(&ally["settler"]) > 0.0
                                && bot_threat(view, seat, ally, coord, coord) > 0.0;
                            if coord != from
                                && (escort || number(&ally["fleet"]) > 0.0)
                                && distance(to, coord) < distance(from, coord)
                            {
                                best = best.max(if escort {
                                    99.0
                                } else if military {
                                    87.0
                                } else {
                                    65.0
                                });
                            }
                        }
                    }
                    best -= there_risk * if settlers > 0.0 { 130.0 } else { 50.0 };
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
                    && number(&me["resources"][r]) >= (number(&cost[r]).min(2.0) + 2.0)
                {
                    if action["key"] == "construct" {
                        76.0
                    } else {
                        70.0
                    }
                } else {
                    -5.0
                }
            }
            "buy" => {
                let key = action["key"].as_str().unwrap_or("");
                let order = bot_order(key);
                let size = number(&me["handCount"])
                    + number(&me["deckCount"])
                    + me["discard"].as_array().map_or(0, Vec::len) as f64
                    + me["inPlay"].as_array().map_or(0, Vec::len) as f64;
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
                let worthwhile =
                    bot_storage_budget(view, seat).is_some_and(|(cost, protection)| {
                        ["matter", "energy", "biomass", "data"].iter().all(|r| {
                            let held = number(&me["resources"][*r]);
                            held - number(&cost[*r]) >= held.min(number(&protection[*r]))
                        })
                    });
                if worthwhile { 125.0 } else { -20.0 }
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
                let reserve = bot_storage_reserve(view, seat);
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
