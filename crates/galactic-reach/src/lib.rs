//! Galactic Reach's existing JavaScript rules behind the shared Rust game contract.
//! QuickJS has no host IO, filesystem, timers, or module loader. Each match gets a
//! separate heap, memory/stack limits, and a wall-clock interrupt deadline.
use game_core::{GameAdapter, PlayerAgent};
use rand::{Rng, SeedableRng, rngs::StdRng};
use rquickjs::{Context, Runtime};
use serde::Deserialize;
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::{Duration, Instant};

/// Rules a shared table may play: the current rules and every archived engine
/// that carries the shared-table hooks (authority shuffles, private views, Undo
/// marks). A table keeps the rules it was dealt with, as solo tables do, so a
/// cutover never strands a running shared game. At a cutover, archive the
/// outgoing engine (rules/vNN-*, with `include_str!` arms in `boot`) and add its
/// revision here.
pub const SHARED_RULES: [&str; 9] = [
    RULES,
    "galactic-reach/34.39",
    "galactic-reach/35.40",
    "galactic-reach/36.41",
    "galactic-reach/37.42",
    "galactic-reach/33.38",
    "galactic-reach/32.37",
    "galactic-reach/31.36",
    "galactic-reach/30.35",
];
/// The [`SHARED_RULES`] entry for `rules`, if a shared table can play it.
pub fn shared_rules(rules: &str) -> Option<&'static str> {
    SHARED_RULES.iter().find(|r| **r == rules).copied()
}
pub const RULES: &str = "galactic-reach/38.43";
/// How many rules-changing (`compat: breaking`) entries were pending in
/// `changes/` when this was built (see build.rs). A dev build of `main` names its
/// rules [`dev_rules`], so each breaking merge starts a new dev revision and a dev
/// table keeps the engine it was dealt with (docs/release.md#dev-channel).
pub const DEV_SERIES: &str = env!("GALACTIC_REACH_DEV_SERIES");
/// The rules a dev build deals: `<RULES>+dev.<n>`. It never equals a released
/// revision, so dev tables cannot be mistaken for released ones.
pub fn dev_rules() -> String {
    format!("{RULES}+dev.{DEV_SERIES}")
}
/// Engine sources for rules that are not compiled into this server: a dev
/// server keeps each dev revision's [`APP_SOURCE`] and [`ADAPTER_SOURCE`] while a
/// table still plays it.
#[derive(Clone, Copy)]
pub struct Sources<'a> {
    pub app: &'a str,
    pub adapter: &'a str,
}
/// The current engine (`prototypes/galactic-reach/app.js`).
pub const APP_SOURCE: &str = ENGINE;
/// The current headless adapter (`prototypes/galactic-reach/adapter.js`).
pub const ADAPTER_SOURCE: &str = ADAPTER;
/// A `'static` copy of `rules`, made once per distinct name (a dev server meets a
/// handful of dev revisions).
fn intern(rules: &str) -> &'static str {
    static NAMES: std::sync::Mutex<Vec<&'static str>> = std::sync::Mutex::new(Vec::new());
    let mut names = NAMES.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(name) = names.iter().find(|n| **n == rules) {
        return name;
    }
    let name: &'static str = Box::leak(rules.to_owned().into_boxed_str());
    names.push(name);
    name
}
/// Player-facing name of the current rules, as printed on the rulebook masthead.
pub const EXPERIMENT: &str = "Construct III Playtest";
mod legacy_v1;
mod legacy_v10;
mod legacy_v11;
mod legacy_v12;
mod legacy_v13;
mod legacy_v14;
mod legacy_v15;
mod legacy_v16;
mod legacy_v17;
mod legacy_v18;
mod legacy_v19;
mod legacy_v2;
mod legacy_v20;
mod legacy_v21;
mod legacy_v22;
mod legacy_v23;
mod legacy_v24;
mod legacy_v25;
mod legacy_v26;
mod legacy_v27;
mod legacy_v28;
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
/// A shared table's per-request budget, renewed with `extend_deadline`.
pub const SHARED_STEP: Duration = Duration::from_secs(20);
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
    deadline: Rc<Cell<Instant>>,
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
            "galactic-reach/34.39" => "galactic-reach/34.39",
            "galactic-reach/35.40" => "galactic-reach/35.40",
            "galactic-reach/36.41" => "galactic-reach/36.41",
            "galactic-reach/37.42" => "galactic-reach/37.42",

            "galactic-reach/33.38" => "galactic-reach/33.38",
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
            "galactic-reach/22.27" => "galactic-reach/22.27",
            "galactic-reach/23.28" => "galactic-reach/23.28",
            "galactic-reach/24.29" => "galactic-reach/24.29",
            "galactic-reach/25.30" => "galactic-reach/25.30",
            "galactic-reach/26.31" => "galactic-reach/26.31",
            "galactic-reach/27.32" => "galactic-reach/27.32",
            "galactic-reach/28.33" => "galactic-reach/28.33",
            "galactic-reach/29.34" => "galactic-reach/29.34",
            "galactic-reach/30.35" => "galactic-reach/30.35",
            "galactic-reach/31.36" => "galactic-reach/31.36",
            "galactic-reach/32.37" => "galactic-reach/32.37",
            _ => return Err("Unsupported rules version.".into()),
        };
        Self::initialize(seed, MATCH_TIMEOUT, rules)
    }
    fn initialize(seed: [u8; 32], timeout: Duration, rules: &'static str) -> Result<Self, String> {
        // Seeded RNG is owned by the game, never by a policy observation.
        let rng = RefCell::new(StdRng::from_seed(seed));
        Self::boot(
            timeout,
            rules,
            None,
            move |ctx| {
                ctx.globals().set(
                    "gameRandom",
                    rquickjs::Function::new(ctx.clone(), move || rng.borrow_mut().r#gen::<f64>())?,
                )
            },
            "globalThis.game = createGalacticReach({headless: true, random: gameRandom});",
        )
    }
    /// A shared multi-human table on the current rules. The engine draws no
    /// randomness of its own: every shuffle is a permutation of `0..n` returned by
    /// `shuffle(n, purpose)`, which the table's hidden-information authority
    /// supplies (or replays from the table log). `seats` names each faction and
    /// says whether a person plays it. Call [`Self::extend_deadline`] before each
    /// batch of work: a shared table lives far longer than one match budget.
    pub fn shared(
        rules: &str,
        seats: &[(String, bool); 4],
        victory_target: u32,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        Self::shared_on(rules, seats, victory_target, None, shuffle)
    }
    /// [`Self::shared`] resumed from a [`Self::snapshot`] (`resume`) instead of a
    /// fresh deal, the way a solo save loads.
    pub fn shared_on(
        rules: &str,
        seats: &[(String, bool); 4],
        victory_target: u32,
        resume: Option<&str>,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        let rules = shared_rules(rules)
            .ok_or_else(|| format!("Shared tables cannot run {rules} on this server."))?;
        Self::shared_from(rules, None, seats, victory_target, resume, shuffle)
    }
    /// [`Self::shared_on`] for rules this server does not compile in: a dev
    /// revision the server kept, booted from its stored `sources`.
    pub fn shared_source(
        rules: &str,
        sources: Sources,
        seats: &[(String, bool); 4],
        victory_target: u32,
        resume: Option<&str>,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        Self::shared_from(
            intern(rules),
            Some(sources),
            seats,
            victory_target,
            resume,
            shuffle,
        )
    }
    fn shared_from(
        rules: &'static str,
        sources: Option<Sources>,
        seats: &[(String, bool); 4],
        victory_target: u32,
        resume: Option<&str>,
        shuffle: impl FnMut(usize, &str) -> Vec<usize> + 'static,
    ) -> Result<Self, String> {
        let shuffle = RefCell::new(shuffle);
        // The snapshot is spliced in as the engine's own JSON text. Parsing it into
        // a serde_json::Value would sort object keys, and the rules iterate some
        // objects (planets by coordinate) in order, so a resumed game would drift.
        let resume = match resume {
            Some(text) => {
                serde_json::from_str::<serde::de::IgnoredAny>(text)
                    .map_err(|e| format!("Unreadable snapshot: {e}"))?;
                text
            }
            None => "null",
        };
        let names: Vec<&str> = seats.iter().map(|s| s.0.as_str()).collect();
        let controllers: Vec<&str> = seats
            .iter()
            .map(|s| if s.1 { "human" } else { "ai" })
            .collect();
        Self::boot(
            SHARED_STEP,
            rules,
            sources,
            move |ctx| {
                ctx.globals().set(
                    "authorityShuffle",
                    rquickjs::Function::new(ctx.clone(), move |n: u32, purpose: String| {
                        (shuffle.borrow_mut())(n as usize, &purpose)
                            .into_iter()
                            .map(|i| i as u32)
                            .collect::<Vec<u32>>()
                    })?,
                )
            },
            &format!(
                "globalThis.game = createGalacticReach({{headless: true, shuffle: authorityShuffle, names: {}, controllers: {}, victoryTarget: {}, resume: {}}});",
                json!(names),
                json!(controllers),
                victory_target,
                resume
            ),
        )
    }
    /// Gives the engine `budget` of wall-clock time from now.
    pub fn extend_deadline(&self, budget: Duration) {
        self.deadline.set(Instant::now() + budget);
    }
    /// The live state shape one seat's browser renders, with every other seat's
    /// hidden information removed (see `privateState` in adapter.js).
    pub fn private_state(&self, seat: usize) -> Result<Value, String> {
        self.eval_json(&format!("JSON.stringify(game.privateState({seat}))"))
    }
    /// Public tablet projection, with no player seat or hidden cards. Older
    /// pinned engines do not acquire new display semantics implicitly.
    pub fn public_state(&self) -> Result<Value, String> {
        self.eval_json(
            "JSON.stringify(typeof game.publicState === 'function' ? game.publicState() : null)",
        )
    }
    /// The whole position, secrets included, for [`Self::shared_on`], as the
    /// engine's JSON text (keep it as text: object key order matters to the rules).
    pub fn snapshot(&self) -> Result<String, String> {
        let deadline = self.deadline.get();
        self.context
            .with(|ctx| ctx.eval::<String, _>("JSON.stringify(game.snapshotState())"))
            .map_err(|e| execution_error(deadline, e))
    }
    /// The current turn and a summary of everything an action could reveal; a
    /// shared table compares it before and after each action to place Undo checkpoints.
    pub fn undo_mark(&self) -> Result<Value, String> {
        self.eval_json("JSON.stringify(game.undoMark())")
    }
    /// Legal choices a seat cannot check from its private state alone.
    pub fn hints(&self, seat: usize) -> Result<Value, String> {
        self.eval_json(&format!("JSON.stringify(game.hints({seat}))"))
    }
    fn eval_json(&self, script: &str) -> Result<Value, String> {
        let deadline = self.deadline.get();
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        let json = self
            .context
            .with(|ctx| ctx.eval::<String, _>(script))
            .map_err(|e| execution_error(deadline, e))?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    fn boot(
        timeout: Duration,
        rules: &'static str,
        sources: Option<Sources>,
        globals: impl FnOnce(&rquickjs::Ctx) -> rquickjs::Result<()>,
        start: &str,
    ) -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(64 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Rc::new(Cell::new(Instant::now() + timeout));
        let limit = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= limit.get())));
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context
            .with(|ctx| {
                globals(&ctx)?;
                ctx.eval::<(), _>(match (sources, rules) {
                    (Some(s), _) => s.adapter,
                    (None, rules) => match rules {
                        RULES => ADAPTER,
                        "galactic-reach/17.22" => include_str!("../rules/v17-adapter.js"),
                        "galactic-reach/18.23" => include_str!("../rules/v18-adapter.js"),
                        "galactic-reach/19.24" => include_str!("../rules/v19-adapter.js"),
                        "galactic-reach/20.25" => include_str!("../rules/v20-adapter.js"),
                        "galactic-reach/21.26" => include_str!("../rules/v21-adapter.js"),
                        "galactic-reach/22.27" => include_str!("../rules/v22-adapter.js"),
                        "galactic-reach/23.28" => include_str!("../rules/v23-adapter.js"),
                        "galactic-reach/24.29" => include_str!("../rules/v24-adapter.js"),
                        "galactic-reach/25.30" => include_str!("../rules/v25-adapter.js"),
                        "galactic-reach/26.31" => include_str!("../rules/v26-adapter.js"),
                        "galactic-reach/27.32" => include_str!("../rules/v27-adapter.js"),
                        "galactic-reach/28.33" => include_str!("../rules/v28-adapter.js"),
                        "galactic-reach/29.34" => include_str!("../rules/v29-adapter.js"),
                        "galactic-reach/30.35" => include_str!("../rules/v30-adapter.js"),
                        "galactic-reach/31.36" => include_str!("../rules/v31-adapter.js"),
                        "galactic-reach/32.37" => include_str!("../rules/v32-adapter.js"),
                        "galactic-reach/33.38" => include_str!("../rules/v33-adapter.js"),
                        "galactic-reach/34.39" => include_str!("../rules/v34-adapter.js"),
                        "galactic-reach/35.40" => include_str!("../rules/v35-adapter.js"),
                        "galactic-reach/36.41" => include_str!("../rules/v36-adapter.js"),
                        "galactic-reach/37.42" => include_str!("../rules/v37-adapter.js"),
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
                    },
                })?;
                ctx.eval::<(), _>(include_str!("../rules/replay-view.js"))?;
                ctx.eval::<(), _>(match (sources, rules) {
                    (Some(s), _) => s.app,
                    (None, rules) => match rules {
                        RULES => ENGINE,
                        "galactic-reach/17.22" => include_str!("../rules/v17-app.js"),
                        "galactic-reach/18.23" => include_str!("../rules/v18-app.js"),
                        "galactic-reach/19.24" => include_str!("../rules/v19-app.js"),
                        "galactic-reach/20.25" => include_str!("../rules/v20-app.js"),
                        "galactic-reach/21.26" => include_str!("../rules/v21-app.js"),
                        "galactic-reach/22.27" => include_str!("../rules/v22-app.js"),
                        "galactic-reach/23.28" => include_str!("../rules/v23-app.js"),
                        "galactic-reach/24.29" => include_str!("../rules/v24-app.js"),
                        "galactic-reach/25.30" => include_str!("../rules/v25-app.js"),
                        "galactic-reach/26.31" => include_str!("../rules/v26-app.js"),
                        "galactic-reach/27.32" => include_str!("../rules/v27-app.js"),
                        "galactic-reach/28.33" => include_str!("../rules/v28-app.js"),
                        "galactic-reach/29.34" => include_str!("../rules/v29-app.js"),
                        "galactic-reach/30.35" => include_str!("../rules/v30-app.js"),
                        "galactic-reach/31.36" => include_str!("../rules/v31-app.js"),
                        "galactic-reach/32.37" => include_str!("../rules/v32-app.js"),
                        "galactic-reach/33.38" => include_str!("../rules/v33-app.js"),
                        "galactic-reach/34.39" => include_str!("../rules/v34-app.js"),
                        "galactic-reach/35.40" => include_str!("../rules/v35-app.js"),
                        "galactic-reach/36.41" => include_str!("../rules/v36-app.js"),
                        "galactic-reach/37.42" => include_str!("../rules/v37-app.js"),
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
                    },
                })?;
                ctx.eval::<(), _>(start)
            })
            .map_err(|e| {
                execution_error(
                    deadline.get(),
                    format!("Galactic Reach initialization failed: {e}"),
                )
            })?;
        let snapshot = Self::read_snapshot(&context, deadline.get())?;
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
        self.eval_json("JSON.stringify(game.replayView())")
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
            self.context
                .with(|ctx| {
                    ctx.eval::<String, _>(format!("JSON.stringify(game.legalActions({seat}))"))
                })
                .ok()
                .and_then(|json| serde_json::from_str(&json).ok())
                .unwrap_or_default()
        }
    }
    fn apply_action(&mut self, seat: usize, action: Value) -> Result<(), String> {
        let deadline = self.deadline.get();
        if Instant::now() >= deadline {
            return Err(SIMULATION_TIMEOUT.into());
        }
        if !self.legal_actions(seat).contains(&action) {
            return Err("Illegal action.".into());
        }
        self.context
            .with(|ctx| ctx.eval::<(), _>(format!("game.applyAction({seat}, {});", action)))
            .map_err(|e| execution_error(deadline, format!("Galactic Reach action failed: {e}")))?;
        self.snapshot = Self::read_snapshot(&self.context, self.deadline.get())?;
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
    Market,
    Expansion,
    Wanderer,
}
impl Strategy {
    pub fn version(self) -> &'static str {
        match self {
            Self::Military => "gr-military/29",
            Self::Economy => "gr-economy/29",
            Self::Market => "gr-market/29",
            Self::Expansion => "gr-expansion/29",
            Self::Wanderer => "gr-wanderer/29",
        }
    }
    pub fn parse(version: &str) -> Option<Self> {
        match version {
            "gr-military/29" => Some(Self::Military),
            "gr-economy/29" => Some(Self::Economy),
            "gr-market/29" => Some(Self::Market),
            "gr-expansion/29" => Some(Self::Expansion),
            "gr-wanderer/29" => Some(Self::Wanderer),
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
fn coord(s: &str) -> Option<(i32, i32)> {
    let (q, r) = s.split_once(',')?;
    Some((q.parse().ok()?, r.parse().ok()?))
}
fn point_distance((aq, ar): (i32, i32), (bq, br): (i32, i32)) -> f64 {
    ((aq - bq).abs() + (ar - br).abs() + (aq + ar - bq - br).abs()) as f64 / 2.0
}
fn distance(a: &str, b: &str) -> f64 {
    coord(a)
        .zip(coord(b))
        .map_or(100.0, |(a, b)| point_distance(a, b))
}
thread_local! {
    static PORTAL_DISTANCES: RefCell<(Value,f64,Vec<f64>)> = const { RefCell::new((Value::Null,0.0,Vec::new())) };
}
// Cache only public geometry. Policies never recompute the same 18-edge metric
// for every candidate Move in a full game; archived views use physical distance.
fn travel_distance(view: &Value, a: &str, b: &str) -> f64 {
    let Some(links) = view["portalLinks"].as_object() else {
        return distance(a, b);
    };
    let cost = view["portalMovementCost"].as_f64().unwrap_or(2.0);
    let index = |c: (i32, i32)| {
        ((-10..=10).contains(&c.0) && (-10..=10).contains(&c.1))
            .then_some(((c.0 + 10) * 21 + c.1 + 10) as usize)
    };
    let Some((a, b)) = coord(a).and_then(index).zip(coord(b).and_then(index)) else {
        return distance(a, b);
    };
    PORTAL_DISTANCES.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.0 != view["portalLinks"] || cache.1 != cost || cache.2.is_empty() {
            let pairs: Vec<_> = links
                .iter()
                .filter_map(|(entry, exit)| coord(entry).zip(exit.as_str().and_then(coord)))
                .collect();
            let points: Vec<_> = (-10..=10)
                .flat_map(|q| (-10..=10).map(move |r| (q, r)))
                .collect();
            let matrix = points
                .iter()
                .flat_map(|a| {
                    points.iter().map(|b| {
                        pairs
                            .iter()
                            .map(|(entry, exit)| {
                                point_distance(*a, *entry) + cost + point_distance(*exit, *b)
                            })
                            .fold(point_distance(*a, *b), f64::min)
                    })
                })
                .collect();
            *cache = (view["portalLinks"].clone(), cost, matrix);
        }
        cache.2[a * 441 + b]
    })
}
fn bot_units(view: &Value, seat: usize, kind: &str) -> f64 {
    view["fleets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .map(|g| number(&g[seat.to_string()][kind]))
        .sum()
}
/// 31.36 Capacity Cards market (rules #cards): key, price in Matter, Energy, Biomass,
/// Data, printed Prestige (reusable Prestige weighted x3) and whether it joins the
/// military deck. Policy 26 meets these keys only in 31.36 games, so its play under
/// earlier rules is unchanged.
const CAPACITY_CARDS: [(&str, [f64; 4], f64, bool); 42] = [
    ("exchangeProtocol", [0.0, 2.0, 0.0, 1.0], 0.0, false),
    ("barterNetwork", [0.0, 0.0, 1.0, 2.0], 0.0, false),
    ("clearingHouse", [1.0, 0.0, 0.0, 2.0], 0.0, false),
    ("signalRelay", [0.0, 2.0, 0.0, 1.0], 0.0, false),
    ("surveyNetwork", [0.0, 0.0, 1.0, 2.0], 0.0, false),
    ("tacticalBriefing", [1.0, 0.0, 0.0, 2.0], 0.0, false),
    ("ionThrusters", [0.0, 5.0, 0.0, 1.0], 0.0, false),
    ("slipstreamCharts", [0.0, 1.0, 0.0, 5.0], 0.0, false),
    ("strikeVector", [2.0, 6.0, 0.0, 0.0], 0.0, false),
    ("foldSpaceGate", [0.0, 10.0, 0.0, 4.0], 0.0, false),
    ("prefabYards", [5.0, 1.0, 0.0, 0.0], 0.0, false),
    ("orbitalFoundry", [7.0, 2.0, 0.0, 1.0], 0.0, false),
    ("worldEngine", [10.0, 3.0, 3.0, 0.0], 0.0, false),
    ("seedArk", [1.0, 0.0, 5.0, 0.0], 0.0, false),
    ("colonyPods", [0.0, 2.0, 7.0, 0.0], 0.0, false),
    ("genesisCharter", [4.0, 0.0, 11.0, 2.0], 2.0, false),
    ("miningCharter", [5.0, 0.0, 0.0, 1.0], 0.0, false),
    ("bioReactor", [0.0, 2.0, 5.0, 0.0], 0.0, false),
    ("dataHaven", [0.0, 1.0, 0.0, 6.0], 0.0, false),
    ("harvestCycle", [3.0, 0.0, 6.0, 0.0], 0.0, false),
    ("quartermaster", [2.0, 5.0, 1.0, 0.0], 0.0, false),
    ("strategyCore", [0.0, 2.0, 0.0, 6.0], 0.0, false),
    ("archivePurge", [0.0, 0.0, 2.0, 5.0], 0.0, false),
    ("commandNexus", [0.0, 4.0, 0.0, 9.0], 0.0, false),
    ("cargoExpansion", [6.0, 0.0, 0.0, 2.0], 0.0, false),
    ("hyperspaceVaults", [4.0, 2.0, 0.0, 9.0], 0.0, false),
    ("procurementHub", [0.0, 0.0, 2.0, 6.0], 0.0, false),
    ("tradeSyndicate", [0.0, 5.0, 0.0, 2.0], 0.0, false),
    ("monumentOfAccord", [8.0, 0.0, 4.0, 3.0], 3.0, false),
    ("senateSeat", [0.0, 5.0, 2.0, 9.0], 4.0, false),
    ("dysonLattice", [6.0, 12.0, 0.0, 4.0], 6.0, false),
    ("ascendancyCodex", [0.0, 3.0, 6.0, 12.0], 6.0, false),
    ("railBattery", [5.0, 1.0, 0.0, 0.0], 0.0, true),
    ("deflectorGrid", [1.0, 5.0, 0.0, 0.0], 0.0, true),
    ("flakScreen", [6.0, 0.0, 2.0, 0.0], 0.0, true),
    ("boardingMarines", [2.0, 0.0, 6.0, 0.0], 0.0, true),
    ("torpedoSpread", [0.0, 7.0, 0.0, 2.0], 0.0, true),
    ("hardlightBulwark", [7.0, 2.0, 0.0, 0.0], 0.0, true),
    ("phaseLance", [0.0, 8.0, 0.0, 3.0], 0.0, true),
    ("novaBarrage", [5.0, 10.0, 0.0, 0.0], 0.0, true),
    ("aegisLattice", [10.0, 4.0, 0.0, 0.0], 0.0, true),
    ("victoryDoctrine", [2.0, 4.0, 0.0, 9.0], 2.0, true),
];
/// Printed attack, shield and pierce of the 31.36 military cards (rules #military-deck).
const CAPACITY_TACTICS: [(&str, f64, f64, bool); 10] = [
    ("railBattery", 2.0, 0.0, false),
    ("deflectorGrid", 0.0, 3.0, false),
    ("flakScreen", 1.0, 2.0, false),
    ("boardingMarines", 1.0, 0.0, false),
    ("torpedoSpread", 3.0, 0.0, false),
    ("hardlightBulwark", 0.0, 5.0, false),
    ("phaseLance", 2.0, 0.0, true),
    ("novaBarrage", 5.0, 0.0, false),
    ("aegisLattice", 0.0, 8.0, false),
    ("victoryDoctrine", 2.0, 0.0, false),
];
const RESOURCE_KEYS: [&str; 4] = ["matter", "energy", "biomass", "data"];
fn bank_rate(view: &Value, seat: usize, resource: &str) -> f64 {
    if view["players"][seat]["bankTradeRates"][resource] == 2 {
        2.0
    } else {
        4.0
    }
}
/// Fund one concrete, currently reachable goal. Never borrow production or fill reserves alone.
fn goal_trade_plan(view: &Value, seat: usize) -> Value {
    let me = &view["players"][seat];
    let Some(goals) = view["tradeGoals"].as_array() else {
        return Value::Null;
    };
    let stock: [f64; 4] = std::array::from_fn(|i| number(&me["resources"][RESOURCE_KEYS[i]]));
    let limits: [f64; 4] = std::array::from_fn(|i| bot_limit(view, seat, RESOURCE_KEYS[i]));
    let rates: [f64; 4] = std::array::from_fn(|i| bank_rate(view, seat, RESOURCE_KEYS[i]));
    let income = bot_income(view, seat);
    let can_enable = view["phase"] == "operations"
        && me["passed"] != true
        && me["hand"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|c| view["cardStats"][c["key"].as_str().unwrap_or("")]["bankRate"] == 2);
    let mut best = Value::Null;
    let mut best_score = f64::NEG_INFINITY;
    for goal in goals {
        let mut priority = number(&goal["priority"]);
        let mut cost: [f64; 4] = std::array::from_fn(|i| number(&goal["cost"][RESOURCE_KEYS[i]]));
        let mut keep: [f64; 4] = std::array::from_fn(|i| number(&goal["keep"][RESOURCE_KEYS[i]]));
        if goal["kind"] == "market" {
            let key = goal["key"].as_str().unwrap_or("");
            let Some(value) = capacity_value(view, seat, key) else {
                continue;
            };
            if value < 18.0 {
                continue;
            }
            let Some(bill) = observed_payment_cost(view, key) else {
                continue;
            };
            cost = bill;
            keep = planning_protection(view, seat);
            priority = 70.0
                + value.min(60.0) * 0.25
                + observed_buy_prestige(view, key).unwrap_or(0.0) * 4.0;
        }
        let budget: [f64; 4] = std::array::from_fn(|i| {
            cost[i]
                + if cost[i] > 0.0 {
                    keep[i]
                } else {
                    keep[i].min(stock[i])
                }
        });
        if (0..4).any(|i| budget[i] > limits[i]) {
            continue;
        }
        let enables =
            std::iter::once(None).chain((0..4).filter(|i| can_enable && rates[*i] > 2.0).map(Some));
        for enable in enables {
            let mut funds = stock;
            let mut trial = rates;
            if let Some(i) = enable {
                trial[i] = 2.0;
            }
            let mut steps = Vec::new();
            let mut loss = 0.0;
            for get in 0..4 {
                while funds[get] < budget[get] {
                    let give = (0..4)
                        .filter(|i| *i != get && funds[*i] - budget[*i] >= trial[*i])
                        .min_by(|a, b| {
                            let overflow = |i: usize| {
                                (funds[i] + number(&income[RESOURCE_KEYS[i]]) - limits[i]).max(0.0)
                            };
                            trial[*a]
                                .total_cmp(&trial[*b])
                                .then_with(|| overflow(*b).total_cmp(&overflow(*a)))
                                .then_with(|| {
                                    (funds[*b] - budget[*b]).total_cmp(&(funds[*a] - budget[*a]))
                                })
                                .then_with(|| a.cmp(b))
                        });
                    let Some(give) = give else {
                        break;
                    };
                    funds[give] -= trial[give];
                    funds[get] += 1.0;
                    loss += trial[give] - 1.0;
                    steps
                        .push(json!({"giveType":RESOURCE_KEYS[give],"getType":RESOURCE_KEYS[get]}));
                }
            }
            if (0..4).any(|i| funds[i] < budget[i])
                || enable.is_some_and(|i| !steps.iter().any(|s| s["giveType"] == RESOURCE_KEYS[i]))
            {
                continue;
            }
            let score = priority
                - loss * 1.5
                - steps.len() as f64 * 2.0
                - if enable.is_some() { 3.0 } else { 0.0 };
            if score > best_score {
                best_score = score;
                best = json!({"goal":goal,"priority":priority,"score":score,"enable":enable.map(|i|RESOURCE_KEYS[i]),"steps":steps});
            }
        }
    }
    best
}

/// Current stock only: improve a rate when a useful trade can follow immediately.
fn exchange_surplus(view: &Value, seat: usize, resource: &str) -> f64 {
    if bank_rate(view, seat, resource) <= 2.0 {
        return 0.0;
    }
    let i = RESOURCE_KEYS.iter().position(|r| *r == resource).unwrap();
    if view["cardPurchasePlanning"] != true {
        return (number(&view["players"][seat]["resources"][resource])
            - planning_protection(view, seat)[i])
            .max(0.0)
            + number(&bot_income(view, seat)[resource]);
    }
    let goal = bot_storage_reserve(view, seat);
    let me = &view["players"][seat];
    if RESOURCE_KEYS.iter().any(|give| {
        bank_rate(view, seat, give) == 2.0
            && number(&me["resources"][*give]) - number(&goal[*give]) >= 2.0
            && RESOURCE_KEYS.iter().any(|get| {
                get != give
                    && number(&me["resources"][*get])
                        < number(&goal[*get]).min(bot_limit(view, seat, get))
            })
    }) {
        return 0.0;
    }
    let deficit = RESOURCE_KEYS.iter().any(|get| {
        *get != resource
            && number(&me["resources"][*get]) < number(&goal[*get]).min(bot_limit(view, seat, get))
    });
    if !deficit {
        return 0.0;
    }
    (number(&me["resources"][resource]) - number(&goal[resource])).max(0.0)
}
fn capacity_card(key: &str) -> Option<([f64; 4], f64, bool)> {
    CAPACITY_CARDS
        .iter()
        .find(|c| c.0 == key)
        .map(|c| (c.1, c.2, c.3))
}
/// Hits, shields and pierce of a combat tactic: the observation's printed stats when the
/// rules publish them (34.39 `tacticStats`), otherwise the basic tactics or the 31.36 table.
fn tactic_stats(view: &Value, key: &str) -> (f64, f64, bool) {
    let printed = &view["tacticStats"][key];
    if printed.is_object() {
        return (
            number(&printed["attack"]),
            number(&printed["shield"]),
            printed["pierce"] == true,
        );
    }
    match key {
        "concentratedFire" => (1.0, 0.0, false),
        "defensiveScreen" => (0.0, 2.0, false),
        _ => CAPACITY_TACTICS
            .iter()
            .find(|t| t.0 == key)
            .map_or((1.0, 0.0, false), |t| (t.1, t.2, t.3)),
    }
}
/// The table's Prestige target (31.36 #victory-target); earlier rules race to 20.
fn victory_target(view: &Value) -> f64 {
    view["victoryTarget"].as_f64().unwrap_or(20.0)
}
/// How much a 31.36 rival values a market card: its price (the set is priced by
/// power), its printed Prestige, minus copies it already owns.
/// A market card's price: the observation's printed costs when the rules publish them
/// (32.37 `marketCosts`), otherwise the 31.36 table.
fn observed_cost(view: &Value, key: &str) -> Option<[f64; 4]> {
    let market = view["market"].as_array()?;
    let costs = view["marketCosts"].as_array()?;
    let index = market.iter().position(|c| c["key"] == key)?;
    Some(std::array::from_fn(|i| {
        number(&costs[index][RESOURCE_KEYS[i]])
    }))
}
fn observed_payment_cost(view: &Value, key: &str) -> Option<[f64; 4]> {
    if view["investmentPlanning"] == true
        && let Some(index) = view["market"]
            .as_array()?
            .iter()
            .position(|c| c["key"] == key)
        && let Some(cost) = view["marketPaymentCosts"]
            .as_array()
            .and_then(|costs| costs.get(index))
    {
        return Some(std::array::from_fn(|i| number(&cost[RESOURCE_KEYS[i]])));
    }
    observed_cost(view, key)
}
/// Prestige a market card gives when bought, as printed in the observation (34.39
/// `marketPrestige`, e.g. Dyson Lattice 5); `None` for earlier rules or other cards.
fn observed_buy_prestige(view: &Value, key: &str) -> Option<f64> {
    let market = view["market"].as_array()?;
    let index = market.iter().position(|c| c["key"] == key)?;
    let prestige = number(&view["marketPrestige"].as_array()?[index]);
    (prestige > 0.0).then_some(prestige)
}
fn market_combat_opportunity(view: &Value, seat: usize) -> bool {
    let mut own_fleets = Vec::new();
    let mut enemy_fleets = Vec::new();
    let mut own_yards = Vec::new();
    let mut enemy_yards = Vec::new();
    for (at, group) in view["fleets"].as_object().into_iter().flatten() {
        if number(&group[seat.to_string()]["fleet"]) > 0.0 {
            own_fleets.push(at.as_str());
        }
        if group
            .as_object()
            .into_iter()
            .flatten()
            .any(|(id, f)| *id != seat.to_string() && number(&f["fleet"]) > 0.0)
        {
            enemy_fleets.push(at.as_str());
        }
    }
    for (at, p) in view["planets"].as_object().into_iter().flatten() {
        if p["upgrade"] != "starbase" {
            continue;
        }
        if p["owner"] == json!(seat) {
            own_yards.push(at.as_str());
        } else if p["owner"].as_u64().is_some_and(|id| id as usize != seat) {
            enemy_yards.push(at.as_str());
        }
    }
    own_fleets.iter().any(|a| {
        enemy_fleets
            .iter()
            .chain(&enemy_yards)
            .any(|b| travel_distance(view, a, b) <= 3.0)
    }) || own_yards.iter().any(|a| {
        enemy_fleets
            .iter()
            .any(|b| travel_distance(view, a, b) <= 3.0)
    })
}
fn public_colony_opportunity(view: &Value, seat: usize) -> bool {
    view["clusters"].as_array().into_iter().flatten().any(|c| {
        let Some(center) = c["center"].as_str() else {
            return false;
        };
        let planet = &view["planets"][center];
        c["kind"] == "world"
            && planet.is_object()
            && planet["owner"] != json!(seat)
            && (planet["owner"].is_null()
                || view["captureNeedsFleet"] != true
                || bot_units(view, seat, "fleet") > 0.0)
    })
}
fn capacity_value(view: &Value, seat: usize, key: &str) -> Option<f64> {
    if view["excludedMarketCards"]
        .as_array()
        .is_some_and(|cards| cards.iter().any(|c| c == key))
    {
        return None;
    }
    let (table_cost, table_prestige, military) = capacity_card(key)?;
    let prestige = observed_buy_prestige(view, key).unwrap_or(table_prestige);
    let immediate_prestige = if view["cardStats"][key].is_object() {
        number(&view["cardStats"][key]["gainPrestige"])
    } else if military {
        0.0
    } else {
        prestige
    };
    match view["marketPurchasePolicy"].as_str().unwrap_or("normal") {
        "none" => return None,
        "points-only" if immediate_prestige <= 0.0 => return None,
        _ => {}
    }
    let cost = observed_cost(view, key).unwrap_or(table_cost);
    let me = &view["players"][seat];
    if military && bot_units(view, seat, "fleet") == 0.0 {
        return None;
    }
    if military
        && view["investmentPlanning"] == true
        && view["_rival_market_focus"] == true
        && view["marketOpportunityFilter"] != false
        && view["_rival_market_combat_opportunity"] != true
    {
        return None;
    }
    let owned = ["hand", "discard", "inPlay", "military"]
        .iter()
        .flat_map(|pile| me[*pile].as_array().into_iter().flatten())
        .filter(|c| c["key"] == key)
        .count() as f64
        + me["deckContents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|g| g["key"] == key)
            .map(|g| number(&g["count"]))
            .sum::<f64>();
    let stats = &view["cardStats"][key];
    if !stats.is_object() {
        return Some(10.0 + cost.iter().sum::<f64>() + prestige * 5.0 - owned * 8.0);
    }
    let prestige = number(&stats["gainPrestige"]);
    let size = number(&me["handCount"])
        + number(&me["deckCount"])
        + me["discard"].as_array().map_or(0, Vec::len) as f64
        + me["inPlay"].as_array().map_or(0, Vec::len) as f64;
    let leader = view["players"]
        .as_array()?
        .iter()
        .map(|p| number(&p["prestige"]))
        .fold(0.0, f64::max);
    let horizon = ((view["victoryTarget"].as_f64().unwrap_or(40.0) - leader) / 5.0)
        .ceil()
        .clamp(1.0, 5.0);
    let fallback_draw = number(&stats["fallbackDraw"]);
    let draw = number(&stats["draw"]).max(fallback_draw);
    let acquisition = if view["cardPurchasePlanning"] == true {
        ((horizon - (number(&me["deckCount"]) / 5.0).ceil()).max(0.0) / horizon).min(1.0)
    } else {
        1.0
    };
    let draw_value = acquisition * draw * (7.0 + size.min(18.0) * 0.25) * (horizon / 2.0).min(1.0);
    let mut value = 6.0 + prestige * 9.0 + number(&stats["prestige"]) * horizon.min(4.0) * 8.0;
    value += draw_value;
    if stats["bankRate"] == 2 {
        let income = bot_income(view, seat);
        let exchanges = RESOURCE_KEYS
            .iter()
            .map(|r| {
                if view["cardPurchasePlanning"] == true {
                    let future = (number(&me["resources"][*r]) + number(&income[*r]) * 2.0)
                        .min(bot_limit(view, seat, r));
                    let missing = RESOURCE_KEYS.iter().any(|get| {
                        get != r
                            && number(&me["resources"][*get]) + number(&income[*get]) * 2.0
                                < bot_limit(view, seat, get)
                    });
                    if missing {
                        ((future - 2.0).max(0.0) / 2.0).min(3.0)
                    } else {
                        0.0
                    }
                } else {
                    ((number(&me["resources"][*r]) + number(&income[*r]) * 2.0) / 2.0)
                        .clamp(0.0, 3.0)
                }
            })
            .fold(0.0, f64::max);
        let family: f64 = ["hand", "discard", "inPlay", "deckContents"]
            .iter()
            .flat_map(|pile| me[*pile].as_array().into_iter().flatten())
            .filter(|c| view["cardStats"][c["key"].as_str().unwrap_or("")]["bankRate"] == 2)
            .map(|c| c["count"].as_f64().unwrap_or(1.0))
            .sum();
        value += exchanges * 4.0 * (horizon * 5.0 / size.max(5.0)).min(3.0) - family * 10.0;
    }
    // Research only: printed one-less-of-each coupons need a later purchase to pay off.
    // Face-up prices bound possible savings; this is not a promise of future spending.
    if view["investmentPlanning"] == true
        && (view["buyDiscountPlanning"] == true || view["cardPurchasePlanning"] == true)
        && horizon > 1.0
        && matches!(
            stats["buyEffect"].as_str(),
            Some("hubDiscount" | "discountEach")
        )
    {
        let saving = view["market"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|card| card["key"].as_str())
            .filter(|other| {
                view["cardStats"][*other].is_object()
                    && view["cardStats"][*other]["buyEffect"].as_str().is_none()
                    && !view["excludedMarketCards"]
                        .as_array()
                        .is_some_and(|cards| cards.iter().any(|c| c == *other))
            })
            .filter_map(|other| observed_cost(view, other))
            .map(|cost| cost.iter().filter(|n| **n > 0.0).count() as f64)
            .fold(0.0_f64, f64::max);
        let uses = ((horizon - 1.0) * 5.0 / size.max(5.0)).min(3.0);
        value += saving * uses * 2.0;
    }
    if military {
        let power = |s: &Value| {
            number(&s["attack"])
                + number(&s["shield"]) * 0.8
                + if s["pierce"] == true { 2.0 } else { 0.0 }
                + number(&s["victoryPrestige"]) * 1.5
        };
        let mut tactics: Vec<f64> = me["military"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| power(&view["cardStats"][c["key"].as_str().unwrap_or("")]))
            .collect();
        tactics.sort_by(|a, b| b.total_cmp(a));
        let improvement = power(stats) - tactics.get(2).copied().unwrap_or(1.0);
        value = 10.0 + improvement * 5.0;
        if tactics.len() >= 3 && improvement <= 0.0 {
            value -= 18.0;
        }
        // Like other engine investments, a tactic needs an opportunity to pay off.
        if view["cardPurchasePlanning"] == true && !market_combat_opportunity(view, seat) {
            value *= 0.35;
        }
        if (view["militaryHorizon"] == true || view["cardPurchasePlanning"] == true)
            && horizon == 1.0
        {
            value -= 15.0;
        }
    } else {
        value -= owned * if draw >= 2.0 { 9.0 } else { 12.0 };
        match stats["order"].as_str().unwrap_or("") {
            "construct" => {
                value += if bot_cards(me, "construct") < 3.0 {
                    15.0
                } else {
                    5.0
                }
            }
            "move" => {
                value += if bot_cards(me, "move") < 4.0 {
                    12.0
                } else {
                    3.0
                }
            }
            "colonize" => {
                let printed = (view["colonyPlanning"] == true
                    || view["cardPurchasePlanning"] == true)
                    && view["investmentPlanning"] == true;
                let useful = bot_units(view, seat, "settler") > 0.0
                    && (!printed || public_colony_opportunity(view, seat));
                let mut colony_value = if useful {
                    (16.0 - bot_cards(me, "colonize") * 8.0).max(0.0)
                } else {
                    -15.0
                };
                if printed && useful {
                    let uses = (horizon * 5.0 / size.max(5.0)).min(3.0);
                    colony_value +=
                        ((if stats["keepSettler"] == true {
                            6.0
                        } else {
                            0.0
                        }) + (2.0 - stats["colonyCost"].as_f64().unwrap_or(2.0)).max(0.0) * 2.0
                            + number(&stats["colonyPrestige"]) * 6.0)
                            * uses;
                }
                value += if fallback_draw > 0.0 {
                    (colony_value - draw_value).max(0.0)
                } else {
                    colony_value
                };
            }
            _ => {}
        }
        if (view["orderBenefitPlanning"] == true || view["cardPurchasePlanning"] == true)
            && view["investmentPlanning"] == true
        {
            let uses = (horizon * 5.0 / size.max(5.0)).min(3.0);
            match stats["order"].as_str().unwrap_or("") {
                "move" => {
                    let ships = ["settler", "explorer", "fleet"]
                        .iter()
                        .any(|k| bot_units(view, seat, k) > 0.0);
                    if ships {
                        value += number(&stats["range"]) * 2.0;
                    } else {
                        value -= if bot_cards(me, "move") < 4.0 {
                            12.0
                        } else {
                            3.0
                        };
                    }
                }
                "construct" => {
                    if let Some(discount) = stats["buildDiscount"].as_str() {
                        value += (if view["cardPurchasePlanning"] == true {
                            if discount == "free" { 8.0 } else { 6.0 }
                        } else if discount == "free" {
                            2.5
                        } else {
                            2.0
                        }) * uses
                            * acquisition;
                        if stats["secondBuild"] == true {
                            value += 3.0;
                        }
                    }
                }
                _ => {}
            }
        }
        value += stats["limits"]
            .as_object()
            .into_iter()
            .flat_map(|m| m.values())
            .map(|n| number(n).min(2.0) * 1.5)
            .sum::<f64>();
        if draw == 0.0 && prestige == 0.0 {
            value -= (size - 10.0).max(0.0) * 1.3;
        }
        if horizon == 1.0 && prestige == 0.0 {
            value -= 15.0;
        }
    }
    if view["cardPurchasePlanning"] == true && !military {
        let pressure = bot_income(view, seat);
        value += stats["limits"]
            .as_object()
            .into_iter()
            .flat_map(|m| m.iter())
            .map(|(r, n)| {
                number(n).min(
                    (number(&me["resources"][r]) + number(&pressure[r]) * horizon
                        - bot_limit(view, seat, r))
                    .max(0.0),
                ) * 2.0
            })
            .sum::<f64>()
            * acquisition;
        if stats["trashSelf"] == true {
            value += 4.0 * acquisition;
        }
    }
    let income = bot_income(view, seat);
    value -= cost
        .iter()
        .enumerate()
        .map(|(i, c)| {
            c * (0.5 + 1.0 / (number(&income[RESOURCE_KEYS[i]]) + 1.0))
                + (c - bot_limit(view, seat, RESOURCE_KEYS[i])).max(0.0) * 3.0
        })
        .sum::<f64>();
    Some(value)
}
/// Market funding goal: the printed bill, optionally together with the same
/// protected payment checked by the buyer. Kept funds are not part of the price.
fn market_target_cost(view: &Value, seat: usize) -> Option<[f64; 4]> {
    let protection = (view["investmentPlanning"] == true && view["protectedMarketBudget"] == true)
        .then(|| planning_protection(view, seat));
    view["market"]
        .as_array()?
        .iter()
        .filter_map(|card| {
            let key = card["key"].as_str()?;
            let mut value = capacity_value(view, seat, key)?;
            let bill =
                observed_payment_cost(view, key).or_else(|| capacity_card(key).map(|c| c.0))?;
            let budget = if let Some(keep) = protection {
                std::array::from_fn(|i| {
                    if bill[i] > 0.0 {
                        bill[i] + keep[i]
                    } else {
                        0.0
                    }
                })
            } else {
                bill
            };
            if view["investmentPlanning"] == true {
                if value <= 0.0 {
                    return None;
                }
                let income = bot_income(view, seat);
                let room = RESOURCE_KEYS
                    .iter()
                    .enumerate()
                    .map(|(i, r)| (budget[i] - bot_limit(view, seat, r)).max(0.0))
                    .sum::<f64>();
                let saving = RESOURCE_KEYS
                    .iter()
                    .enumerate()
                    .map(|(i, r)| {
                        (budget[i] - number(&view["players"][seat]["resources"][*r])).max(0.0)
                            / number(&income[*r]).max(0.5)
                    })
                    .fold(0.0_f64, f64::max);
                value /= 1.0
                    + 0.55
                        * (saving
                            + if room > 0.0 {
                                (room / 4.0).ceil() * 2.0
                            } else {
                                0.0
                            });
            }
            Some((value, budget))
        })
        .max_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, budget)| budget)
}

fn capacity_need(view: &Value, seat: usize) -> Option<[f64; 4]> {
    let target = market_target_cost(view, seat)?;
    let need: [f64; 4] =
        std::array::from_fn(|i| (target[i] - bot_limit(view, seat, RESOURCE_KEYS[i])).max(0.0));
    need.iter().any(|n| *n > 0.0).then_some(need)
}
fn bot_order(key: &str) -> &str {
    match key {
        "move"
        | "surveyDrones"
        | "pathfinderNetwork"
        | "fleetOverdrive"
        | "coordinatedAssault"
        | "phaseShearDrive"
        | "obeliskOfAnnihilation"
        | "ionThrusters"
        | "slipstreamCharts"
        | "strikeVector"
        | "foldSpaceGate"
        | "starfarersCompass"
        | "horizonSail"
        | "cinderDrive" => "move",
        "construct"
        | "modularConstruction"
        | "orbitalShipyards"
        | "prefabYards"
        | "orbitalFoundry"
        | "worldEngine"
        | "stellarCrucible"
        | "moonforge" => "construct",
        "colonize" | "dropColonyModules" | "genesisSeedVault" | "seedArk" | "colonyPods"
        | "genesisCharter" | "evergreenArk" => "colonize",
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
/// Capacity Modules a rival owns but has not played (rules #storage-allocation): in
/// hand, discard or deck. Rivals hold at most one, like the browser rivals.
fn bot_unplayed_modules(me: &Value) -> f64 {
    ["hand", "discard", "deckContents"]
        .iter()
        .flat_map(|k| me[k].as_array().into_iter().flatten())
        .filter(|c| c["key"] == "capacityModule")
        .map(|c| c["count"].as_f64().unwrap_or(1.0))
        .sum()
}
/// Archive Purge (34.39 #cards, #rival-cards): the level I starters in discard a rival
/// trashes, in discard order. It keeps at least 3 Move-order and 2 Construct-order
/// cards, because Move and Construct are not sold; the browser rivals choose the same.
fn bot_purge_choice(me: &Value, max: usize) -> Vec<Value> {
    let mut owned = [bot_cards(me, "move"), bot_cards(me, "construct")];
    let mut trash = vec![];
    for card in me["discard"].as_array().into_iter().flatten() {
        if trash.len() >= max {
            break;
        }
        if card["starter"] != true || card["upgraded"] == true {
            continue;
        }
        let (slot, keep) = match card["key"].as_str() {
            Some("move") => (0, 3.0),
            Some("construct") => (1, 2.0),
            _ => continue,
        };
        if owned[slot] > keep {
            owned[slot] -= 1.0;
            trash.push(card["id"].clone());
        }
    }
    trash
}
fn bot_yards(view: &Value, seat: usize) -> usize {
    view["planets"]
        .as_object()
        .into_iter()
        .flat_map(|m| m.values())
        .filter(|p| p["owner"] == json!(seat) && p["upgrade"] == "starbase")
        .count()
}
// Public Fleet approaches to each owned Colony, including weighted portal paths.
fn colony_defense(view: &Value, seat: usize) -> Vec<(&str, f64, f64)> {
    if let Some(rows) = view["_rival_colony_defense"].as_array() {
        return rows
            .iter()
            .filter_map(|r| Some((r[0].as_str()?, number(&r[1]), number(&r[2]))))
            .collect();
    }
    view["planets"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, p)| p["owner"] == json!(seat) && p["hasColony"] == true)
        .map(|(coord, _)| {
            let attackers = view["fleets"]
                .as_object()
                .into_iter()
                .flatten()
                .filter(|(at, _)| travel_distance(view, at, coord) <= 3.0)
                .flat_map(|(_, g)| g.as_object().into_iter().flatten())
                .filter(|(owner, _)| *owner != &seat.to_string())
                .map(|(_, f)| number(&f["fleet"]))
                .fold(0.0, f64::max);
            (
                coord.as_str(),
                attackers,
                number(&view["fleets"][coord][seat.to_string()]["fleet"]),
            )
        })
        .collect()
}
fn investment_horizon(view: &Value) -> f64 {
    let leader = view["players"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| number(&p["prestige"]))
        .fold(0.0_f64, f64::max);
    let pace = ((leader - 3.0) / (number(&view["round"]) - 1.0).max(1.0)).max(2.0);
    ((victory_target(view) - leader) / pace)
        .ceil()
        .clamp(0.0, 6.0)
}
// Research only: one delayed return when existing stock/income leaves no marginal room.
// Printed costs account for payment freeing room; free first builds have no delay.
fn harvester_headroom_delay(
    view: &Value,
    seat: usize,
    action: &Value,
    resource: &str,
    income: f64,
) -> Option<(f64, bool)> {
    if view["harvesterHeadroomPlanning"] != true || !view["harvesterCost"].is_object() {
        return None;
    }
    let printed = view["harvesterCost"].as_object()?;
    if printed.is_empty()
        || printed.iter().any(|(r, v)| {
            !RESOURCE_KEYS.contains(&r.as_str())
                || v.as_f64().is_none_or(|n| !n.is_finite() || n < 0.0)
        })
    {
        return None;
    }
    let index = RESOURCE_KEYS.iter().position(|r| *r == resource)?;
    let mut cost: [f64; 4] =
        std::array::from_fn(|i| number(&view["harvesterCost"][RESOURCE_KEYS[i]]));
    if action["type"] == "build" {
        match action["discountResource"].as_str() {
            Some("free") => cost = [0.0; 4],
            Some("each") => cost.iter_mut().for_each(|n| *n = (*n - 1.0).max(0.0)),
            Some(r) => {
                if let Some(i) = RESOURCE_KEYS.iter().position(|key| *key == r) {
                    cost[i] = (cost[i] - 1.0).max(0.0);
                }
            }
            None => {}
        }
    }
    let free = cost.iter().all(|n| *n == 0.0);
    let stock_after =
        (number(&view["players"][seat]["resources"][resource]) - cost[index]).max(0.0);
    let delay = if !free && stock_after + income >= bot_limit(view, seat, resource) {
        1.0
    } else {
        0.0
    };
    Some((delay, free))
}
// Printed ship costs, with discounts applied only to the first construction.
fn paid_ship_cost(view: &Value, action: &Value) -> Option<f64> {
    let kind = action["kind"].as_str()?;
    let printed = view["shipCosts"][kind].as_object()?;
    if printed.is_empty()
        || printed.iter().any(|(r, v)| {
            !RESOURCE_KEYS.contains(&r.as_str())
                || v.as_f64().is_none_or(|n| !n.is_finite() || n < 0.0)
        })
    {
        return None;
    }
    let mut cost: [f64; 4] =
        std::array::from_fn(|i| number(&view["shipCosts"][kind][RESOURCE_KEYS[i]]));
    if action["type"] == "build" {
        match action["discountResource"].as_str() {
            Some("free") => cost = [0.0; 4],
            Some("each") => cost.iter_mut().for_each(|n| *n = (*n - 1.0).max(0.0)),
            Some(r) => {
                if let Some(i) = RESOURCE_KEYS.iter().position(|key| *key == r) {
                    cost[i] = (cost[i] - 1.0).max(0.0);
                }
            }
            None => {}
        }
    }
    Some(cost.iter().sum())
}
fn established_construction(me: &Value) -> bool {
    ["hand", "discard", "inPlay", "deckContents"]
        .iter()
        .flat_map(|pile| me[*pile].as_array().into_iter().flatten())
        .any(|c| {
            c["key"] == "construct"
                && c["starter"] == true
                && (c["upgraded"] == true || number(&c["level"]) >= 2.0)
        })
}
fn planning_protection(view: &Value, seat: usize) -> [f64; 4] {
    if view["investmentPlanning"] == true {
        if bot_yards(view, seat) == 0 {
            return [2.0, 1.0, 1.0, 1.0];
        }
        let me = &view["players"][seat];
        let mut keep = [0.0_f64; 4];
        for (coord, p) in view["planets"].as_object().into_iter().flatten() {
            let group = &view["fleets"][coord][seat.to_string()];
            let center = p["cluster"]
                .as_u64()
                .is_some_and(|id| view["clusters"][id as usize]["center"] == *coord);
            if center
                && p["owner"] != json!(seat)
                && number(&group["settler"]) > 0.0
                && bot_cards(me, "colonize") > 0.0
            {
                keep[2] = if p["owner"].is_null() { 2.0 } else { 1.0 };
            }
            if p["special"] == "relic"
                && p["relicClaimed"] != true
                && number(&group["explorer"]) > 0.0
            {
                keep[0] = 1.0;
                keep[1] = 1.0;
                keep[3] = 2.0;
            }
        }
        if colony_defense(view, seat)
            .iter()
            .any(|(_, a, g)| *a > 0.0 && *g < *a + 1.0)
        {
            for (i, c) in [2.0_f64, 1.0, 1.0, 0.0].into_iter().enumerate() {
                keep[i] = keep[i].max(c);
            }
        }
        return keep;
    }

    let settlers = bot_units(view, seat, "settler") > 0.0;
    let explorers = bot_units(view, seat, "explorer") > 0.0;
    let mut keep: [f64; 4] = [
        if explorers { 1.0 } else { 0.0 },
        if explorers { 1.0 } else { 0.0 },
        if settlers { 2.0 } else { 1.0 },
        if explorers { 2.0 } else { 0.0 },
    ];
    if colony_defense(view, seat)
        .iter()
        .any(|(_, a, g)| *a > 0.0 && *g < *a + 1.0)
    {
        for (i, c) in [2.0_f64, 1.0, 1.0, 0.0].into_iter().enumerate() {
            keep[i] = keep[i].max(c);
        }
    }
    keep
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
            && (p["owner"] != json!(seat))
            && hand
                .iter()
                .any(|c| bot_order(c["key"].as_str().unwrap_or("")) == "colonize")
        {
            let discount = hand.iter().any(|c| c["key"] == "dropColonyModules");
            return json!({"biomass": if discount||!p["owner"].is_null(){1}else{2}});
        }
        if number(&f["explorer"]) > 0.0
            && p["special"] == "relic"
            && hand
                .iter()
                .any(|c| c["key"] == "excavate" || c["key"] == "probe")
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
// Restricted public-tactic model: one Fleet each, no reaction/order bonuses.
fn fleet_tactic_hand(view: &Value, seat: usize, used: &Value) -> Value {
    let mut hand = json!({"concentratedFire":2,"defensiveScreen":2});
    for card in view["players"][seat]["military"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if let Some(key) = card["key"].as_str() {
            hand[key] = json!(hand[key].as_u64().unwrap_or(0) + 1);
        }
    }
    for key in used
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        hand[key] = json!(hand[key].as_u64().unwrap_or(0).saturating_sub(1));
    }
    hand
}
fn fleet_tactic_plan(
    view: &Value,
    own: &Value,
    enemy: &Value,
    hull: i16,
    enemy_hull: i16,
    volley: u8,
) -> Option<(i8, String)> {
    use std::collections::HashMap;
    type Position = (i16, i16, u64, u64, u8);
    type Plan = (i8, usize);
    struct Search {
        stats: Vec<(i16, i16, bool)>,
        memo: HashMap<Position, Plan>,
    }
    impl Search {
        fn visit(&mut self, a: i16, b: i16, ours: u64, theirs: u64, n: u8) -> (i8, usize) {
            if a <= 0 {
                return (-1, 0);
            }
            if b <= 0 {
                return (1, 0);
            }
            if n >= 3 {
                return (0, 0);
            }
            let key = (a, b, ours, theirs, n);
            if let Some(v) = self.memo.get(&key) {
                return *v;
            }
            let mut best = (-2, 0);
            for i in 0..self.stats.len() {
                if (ours >> (2 * i)) & 3 == 0 {
                    continue;
                }
                let (attack, shield, pierce) = self.stats[i];
                let mut worst = 1;
                for j in 0..self.stats.len() {
                    if (theirs >> (2 * j)) & 3 == 0 {
                        continue;
                    }
                    let (enemy_attack, enemy_shield, enemy_pierce) = self.stats[j];
                    let damage = (3 + attack - if pierce { 0 } else { enemy_shield }).max(0);
                    let received =
                        (3 + enemy_attack - if enemy_pierce { 0 } else { shield }).max(0);
                    worst = worst.min(
                        self.visit(
                            a - received,
                            b - damage,
                            ours - (1 << (2 * i)),
                            theirs - (1 << (2 * j)),
                            n + 1,
                        )
                        .0,
                    );
                    if worst == -1 {
                        break;
                    }
                }
                if worst > best.0 {
                    best = (worst, i)
                }
                if best.0 == 1 {
                    break;
                }
            }
            self.memo.insert(key, best);
            best
        }
    }
    let keys: Vec<&str> = view["tacticStats"]
        .as_object()?
        .keys()
        .map(String::as_str)
        .collect();
    if keys.is_empty() || keys.len() > 32 || hull <= 0 || enemy_hull <= 0 || volley >= 3 {
        return None;
    }
    let encode = |hand: &Value| {
        keys.iter().enumerate().fold(0_u64, |bits, (i, k)| {
            bits | (hand[*k].as_u64().unwrap_or(0).min(3) << (2 * i))
        })
    };
    let ours = encode(own);
    let theirs = encode(enemy);
    if ours == 0 || theirs == 0 {
        return None;
    }
    let stats = keys
        .iter()
        .map(|k| {
            let (a, s, p) = tactic_stats(view, k);
            (a as i16, s as i16, p)
        })
        .collect();
    let (score, index) = Search {
        stats,
        memo: HashMap::new(),
    }
    .visit(hull, enemy_hull, ours, theirs, volley);
    Some((score, keys[index].to_string()))
}
fn combat_fleet_tactic_plan(view: &Value) -> Option<String> {
    if view["singleFleetForecast"] != true {
        return None;
    }
    let combat = &view["combat"];
    let side = combat["side"].as_str()?;
    let own = &combat["sides"][side];
    let enemy = &combat["sides"][if side == "attacker" {
        "defender"
    } else {
        "attacker"
    }];
    let piece = |force: &Value| -> Option<i16> {
        let pieces = force["pieces"].as_array()?;
        if pieces.len() != 1 || pieces[0]["type"] != "fleet" {
            return None;
        }
        Some((number(&pieces[0]["hull"]) - number(&pieces[0]["damage"])) as i16)
    };
    let enemy_id = enemy["playerId"].as_u64()? as usize;
    let hand = fleet_tactic_hand(view, enemy_id, &enemy["used"]);
    let (score, tactic) = fleet_tactic_plan(
        view,
        &own["hand"],
        &hand,
        piece(own)?,
        piece(enemy)?,
        combat["volley"].as_u64()?.saturating_sub(1) as u8,
    )?;
    (score == 1).then_some(tactic)
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
    let yard = p["upgrade"] == "starbase" && p["owner"] != json!(seat);
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
    let old_safe = attack * 3.0 - 4.0 >= enemy_hull && hull > enemy_attack * 3.0 + 2.0;
    if old_safe {
        return true;
    }
    if view["singleFleetForecast"] == true
        && !yard
        && number(&moving["fleet"]) == 1.0
        && number(&moving["explorer"]) == 0.0
        && number(&enemy["fleet"]) == 1.0
        && number(&enemy["settler"]) == 0.0
        && number(&enemy["explorer"]) == 0.0
        && let Some((id, _)) = opponent
        && let Ok(enemy_id) = id.parse::<usize>()
    {
        let own_hand = fleet_tactic_hand(view, seat, &Value::Null);
        let enemy_hand = fleet_tactic_hand(view, enemy_id, &Value::Null);
        return fleet_tactic_plan(view, &own_hand, &enemy_hand, 7, 7, 0).is_some_and(|p| p.0 == 1);
    }
    false
}
fn bot_limit(view: &Value, seat: usize, resource: &str) -> f64 {
    view["players"][seat]["resourceLimits"][resource]
        .as_f64()
        .unwrap_or(4.0)
}
fn bot_income(view: &Value, seat: usize) -> Value {
    let mut income = json!({"matter":0.0,"energy":0.0,"biomass":0.0,"data":0.0});
    for (coord, p) in view["planets"].as_object().into_iter().flatten() {
        let resource = p["type"].as_str().unwrap_or("");
        if !["matter", "energy", "biomass", "data"].contains(&resource) {
            continue;
        }
        let mut amount = 0.0;
        if p["owner"] == json!(seat) {
            // 32.37 Harvesters yield `harvesterYield` (2); earlier rules yield 1.
            amount += if p["upgrade"] == "harvester" {
                view["harvesterYield"].as_f64().unwrap_or(1.0)
            } else {
                1.0
            };
        }
        let fleet = &view["fleets"][coord][seat.to_string()];
        if number(&fleet["settler"]) + number(&fleet["fleet"]) > 0.0 {
            amount += 1.0;
        }
        income[resource] = json!(number(&income[resource]) + amount);
    }
    income
}
fn bot_allocation_value(view: &Value, seat: usize, action: &Value, paid: bool) -> f64 {
    // Unpaid allocations before the Capacity Module were Cradle of Lost Suns (+2 Biomass).
    bot_split_value(view, seat, action, paid, if paid { 0.0 } else { 2.0 })
}
/// A played Capacity Module's split: first toward the limits the best market card
/// needs, then by the same storage pressure as other allocations.
fn bot_module_allocation_value(view: &Value, seat: usize, action: &Value) -> f64 {
    let need = capacity_need(view, seat).map_or(0.0, |need| {
        RESOURCE_KEYS
            .iter()
            .enumerate()
            .map(|(i, r)| number(&action["allocation"][*r]).min(need[i]) * 10.0)
            .sum::<f64>()
    });
    need + bot_split_value(view, seat, action, false, 0.0) * 0.1
}
fn bot_split_value(view: &Value, seat: usize, action: &Value, paid: bool, biomass: f64) -> f64 {
    let me = &view["players"][seat];
    let income = bot_income(view, seat);
    let protection = bot_cost(view, seat);
    let next_price = number(&me["storageUpgradeCost"]["matter"]);
    let mut value = 0.0;
    for r in ["matter", "energy", "biomass", "data"] {
        let count = action["allocation"][r].as_u64().unwrap_or(0);
        let payment = if paid {
            number(&me["storageUpgradeCost"][r])
        } else {
            0.0
        };
        let gain = if r == "biomass" { biomass } else { 0.0 };
        for point in 0..count {
            let limit = bot_limit(view, seat, r) + point as f64;
            let need =
                number(&me["resources"][r]) - payment + gain + 2.0 * number(&income[r]) - limit;
            value += if limit < next_price + number(&protection[r]) {
                100.0
            } else {
                0.0
            };
            value += need.clamp(0.0, 1.0) * 10.0 + (number(&income[r]) + 1.0) / (limit + 1.0);
        }
    }
    value
}
fn bot_storage_budget(view: &Value, seat: usize) -> Option<(Value, Value)> {
    let me = &view["players"][seat];
    let leader = view["players"]
        .as_array()?
        .iter()
        .map(|p| number(&p["prestige"]))
        .fold(0.0_f64, f64::max);
    let target = victory_target(view);
    if leader >= target {
        return None;
    }
    let cost = me["storageUpgradeCost"].as_object()?;
    let resources = ["matter", "energy", "biomass", "data"];
    if resources.iter().any(|r| number(&cost[*r]) <= 0.0) {
        return None;
    }
    let income = bot_income(view, seat);
    let pressure: f64 = resources
        .iter()
        .map(|r| {
            (number(&me["resources"][*r]) + number(&income[*r]) - bot_limit(view, seat, r)).max(0.0)
        })
        .sum();
    let horizon = ((target - leader) / 4.0).ceil().clamp(1.0, 4.0);
    if pressure.min(4.0) * horizon <= cost.values().map(number).sum::<f64>() {
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
    let mut base = bot_cost(view, seat);
    if view["investmentPlanning"] == true
        && bot_yards(view, seat) > 0
        && let Some(cost) = market_target_cost(view, seat)
    {
        for (i, r) in RESOURCE_KEYS.iter().enumerate() {
            base[*r] = json!(number(&base[*r]).max(cost[i]).min(bot_limit(view, seat, r)));
        }
    }
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
    if ["matter", "energy", "biomass", "data"]
        .iter()
        .all(|r| number(&reserve[*r]) <= bot_limit(view, seat, r))
    {
        reserve
    } else if ["matter", "energy", "biomass", "data"]
        .iter()
        .all(|r| number(&desired[*r]) <= bot_limit(view, seat, r))
    {
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
    let yard = p["owner"] == json!(seat) && p["upgrade"] == "starbase";
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
                    let range = 3.0; // Fleets can leave their slower Settlers behind.
                    let fleets = number(&enemy["fleet"]);
                    if owner != &seat.to_string()
                        && fleets > 0.0
                        && travel_distance(view, coord, destination) <= range
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
        let economy = matches!(self.strategy, Strategy::Economy | Strategy::Market);
        if view["goalDirectedTrading"] == true {
            let bank = action["type"] == "bank_trade";
            let exchange = action["type"] == "special"
                && view["cardStats"][action["key"].as_str().unwrap_or("")]["bankRate"] == 2;
            if bank || exchange {
                let plan = view
                    .get("_rival_goal_trade")
                    .cloned()
                    .unwrap_or_else(|| goal_trade_plan(view, seat));
                if exchange {
                    return if plan["enable"].is_string() && plan["enable"] == action["resource"] {
                        130.0 + number(&plan["priority"]) * 0.02
                    } else {
                        -20.0
                    };
                }
                let first = &plan["steps"][0];
                return if plan["enable"].is_null()
                    && first.is_object()
                    && first["giveType"] == action["giveType"]
                    && first["getType"] == action["getType"]
                {
                    125.0 + number(&plan["priority"]) * 0.02
                } else {
                    -20.0
                };
            }
        }
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
                if let Some(tactic) = view["_rival_fleet_tactic"].as_str() {
                    return if action["tactic"] == tactic {
                        10000.0
                    } else {
                        -10000.0
                    };
                }
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
                // Printed stats: basic tactics, or a 31.36 military card (Phase Lance pierces).
                let (hits, shield, pierce) =
                    tactic_stats(view, action["tactic"].as_str().unwrap_or(""));
                let screen = shield > 0.0;
                let dealt = (own_attack + hits
                    - if pierce {
                        0.0
                    } else {
                        (1.0 - probability) * 2.0
                    })
                .max(0.0);
                let received = (enemy_attack + probability - shield).max(0.0);
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
            // Current engines expose this choice; archived observations never do.
            "order_draw" => {
                if number(&view["cardStats"][action["key"].as_str().unwrap_or("")]["fallbackDraw"])
                    > 0.0
                    && (number(&me["deckCount"]) > 0.0
                        || me["discard"]
                            .as_array()
                            .is_some_and(|cards| !cards.is_empty()))
                {
                    95.0
                } else {
                    -10.0
                }
            }
            "construct_draw" => {
                if view["constructDrawOnly"] == true
                    && (number(&me["deckCount"]) > 0.0
                        || me["discard"]
                            .as_array()
                            .is_some_and(|cards| !cards.is_empty()))
                {
                    12.0
                } else {
                    -10.0
                }
            }
            "colonize" => {
                if (view["colonyPlanning"] == true || view["colonyExecutionPlanning"] == true)
                    && view["investmentPlanning"] == true
                {
                    let stats = &view["cardStats"][action["key"].as_str().unwrap_or("")];
                    let owner = &view["planets"][action["coord"].as_str().unwrap_or("")]["owner"];
                    let capture = owner.as_u64().is_some_and(|id| id as usize != seat);
                    let cost = stats["colonyCost"].as_f64().unwrap_or(2.0).min(if capture {
                        1.0
                    } else {
                        2.0
                    });
                    160.0
                        + (if stats["keepSettler"] == true {
                            10.0
                        } else {
                            0.0
                        })
                        + number(&stats["colonyPrestige"]) * 3.0
                        - cost
                } else {
                    160.0
                }
            }
            "build" | "second_build" | "colony_build" => {
                let value = match action["kind"].as_str().unwrap_or("") {
                    "starbase" => {
                        if bot_yards(view, seat) == 0 {
                            110.0
                        } else {
                            -5.0
                        }
                    }
                    "harvester" if view["investmentPlanning"] == true => {
                        let planet = &view["planets"][action["coord"].as_str().unwrap()];
                        let resource = planet["type"].as_str().unwrap_or("");
                        let income = number(&bot_income(view, seat)[resource]);
                        let target: f64 = match resource {
                            "matter" => 5.0,
                            "energy" => 4.0,
                            "biomass" => {
                                if matches!(self.strategy, Strategy::Expansion) {
                                    4.0
                                } else {
                                    3.0
                                }
                            }
                            "data" => {
                                if view["relicRow"].as_array().is_some_and(|r| !r.is_empty()) {
                                    4.0
                                } else {
                                    3.0
                                }
                            }
                            _ => 0.0,
                        };
                        let shortage =
                            (target.min(bot_limit(view, seat, resource)) - income).max(0.0);
                        let gain = if planet["owner"] == json!(seat) {
                            (view["harvesterYield"].as_f64().unwrap_or(2.0) - 1.0).max(0.0)
                        } else {
                            view["harvesterYield"].as_f64().unwrap_or(2.0)
                        };
                        let headroom =
                            harvester_headroom_delay(view, seat, action, resource, income);
                        let (delay, free) = headroom.unwrap_or((
                            0.0,
                            action["type"] == "build"
                                && matches!(
                                    action["discountResource"].as_str(),
                                    Some("free" | "each")
                                ),
                        ));
                        let returns = (investment_horizon(view) - 1.0 - delay).max(0.0);
                        if resource == "data" && income == 0.0 && number(&view["round"]) <= 2.0 {
                            53.0
                        } else if shortage > 0.0 && gain.min(shortage) * returns >= 3.0 {
                            10.0 + shortage * 7.0 + if economy { 4.0 } else { 0.0 }
                        } else if (view["productionDiscipline"] == true || delay > 0.0) && !free {
                            // Pass scores zero. Merely lowering this to +1 still pays for it.
                            -1.0
                        } else {
                            1.0
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
                            .filter(|p| p["owner"] == json!(seat) && p["type"] == resource)
                            .map(|_| 1.0)
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
                        } else if view["investmentPlanning"] == true
                            && view["settlerInvestmentDiscipline"] == true
                            && paid_ship_cost(view, action).is_some_and(|cost| cost > 0.0)
                        {
                            -1.0
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
                        let urgent = colony_defense(view, seat)
                            .into_iter()
                            .filter(|(at, a, g)| {
                                *a > 0.0
                                    && *g < *a + 1.0
                                    && number(&group["fleet"]) < *a + 1.0
                                    && travel_distance(view, coord, at) <= 6.0
                            })
                            .map(|(at, _, _)| 120.0 - travel_distance(view, coord, at) * 2.0)
                            .fold(0.0, f64::max);
                        let enemy = view["fleets"]
                            .as_object()
                            .into_iter()
                            .flat_map(|g| g.values())
                            .flat_map(|g| g.as_object().into_iter().flatten())
                            .any(|(id, f)| *id != seat.to_string() && number(&f["fleet"]) > 0.0);
                        if urgent > 0.0 {
                            urgent
                        } else if military && bot_units(view, seat, "fleet") < 5.0 {
                            81.0
                        } else if enemy
                            && bot_units(view, seat, "fleet")
                                < (colony_defense(view, seat).len() as f64).min(3.0)
                        {
                            80.0
                        } else if view["investmentPlanning"] == true
                            && view["fleetInvestmentDiscipline"] == true
                            && !(action["type"] == "build" && action["discountResource"] == "free")
                        {
                            -1.0
                        } else {
                            8.0
                        }
                    }
                };
                // Keep old policy scores byte-for-byte equivalent on archived engines.
                if view["constructDrawOnly"] == true && action["type"] == "build" {
                    let key = action["key"].as_str().unwrap_or("");
                    let card = me["hand"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .find(|c| c["id"] == action["card"]);
                    let bonus = match view["cardStats"][key]["buildDiscount"].as_str() {
                        Some("free") => 0.75,
                        Some("each") => 0.5,
                        _ if key == "construct" && card.is_some_and(|c| c["level"] == 3) => 0.25,
                        _ => 0.0,
                    };
                    value + bonus
                } else {
                    value
                }
            }
            "resource" => {
                let cost = bot_storage_reserve(view, seat);
                let gain = action["gain"].as_object().unwrap();
                let need: f64 = gain
                    .iter()
                    .map(|(k, v)| {
                        number(v)
                            .min((bot_limit(view, seat, k) - number(&me["resources"][k])).max(0.0))
                            * (number(&cost[k]) - number(&me["resources"][k])).max(0.0)
                    })
                    .sum();
                let deficit = cost
                    .as_object()
                    .unwrap()
                    .iter()
                    .any(|(k, v)| number(v) > number(&me["resources"][k]));
                let bankable: f64 = gain
                    .iter()
                    .filter(|(k, _)| {
                        number(&me["resources"][*k]) < number(&cost[*k]) + bank_rate(view, seat, k)
                    })
                    .map(|(r, v)| {
                        number(v)
                            .min((bot_limit(view, seat, r) - number(&me["resources"][r])).max(0.0))
                    })
                    .sum();
                let key = action["key"].as_str().unwrap_or("");
                let cantrip = me["hand"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|c| c["id"] == action["card"] && c["level"] == 3)
                    && (number(&me["deckCount"]) > 0.0
                        || me["discard"].as_array().is_some_and(|p| !p.is_empty()));
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
                } else if cantrip {
                    80.0 + need
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
                let here_fleet = &view["fleets"][from][seat.to_string()];
                // 33.38 #movement: a Move names the units it takes; score only those.
                // Earlier rules list no `units` and move the whole group, as before.
                let split = action["units"].is_object();
                let fleet = if split { &action["units"] } else { here_fleet };
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
                // 34.39 #combat: a capture needs a Fleet too, so only Settlers that can
                // found or capture here wait for Colonize.
                let fleet_rule = view["captureNeedsFleet"] == true;
                let can_settle_at = |p: &Value, coord: &str, escorted: bool| {
                    p["owner"].is_null()
                        || !fleet_rule
                        || escorted
                        || number(&view["fleets"][coord][seat.to_string()]["fleet"]) > 0.0
                };
                let escorted = number(&fleet["fleet"]) > 0.0;
                if !explorer
                    && settlers > 0.0
                    && here_center
                    && (here["owner"] != json!(seat))
                    && can_settle_at(here, from, escorted)
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
                            && can_settle_at(p, coord, escorted)
                            && bot_safe_fight(view, seat, fleet, coord)
                    };
                    if goal && travel_distance(view, from, coord) > travel_distance(view, to, coord)
                    {
                        best = best.max(
                            (if explorer {
                                if known_relic { 90.0 } else { 70.0 }
                            } else {
                                92.0
                            }) + travel_distance(view, from, coord)
                                - travel_distance(view, to, coord)
                                - travel_distance(view, to, coord) * 0.3,
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
                                && travel_distance(view, from, coord)
                                    > travel_distance(view, to, coord)
                            {
                                best = best.max(
                                    (if military { 94.0 } else { 80.0 })
                                        - travel_distance(view, to, coord) * 0.3,
                                );
                            }
                        }
                    }
                }
                if !explorer {
                    let moving = number(&fleet["fleet"]);
                    let vacates = colony_defense(view, seat).iter().any(|(at, a, g)| {
                        *at == from && *a > 0.0 && *g >= *a + 1.0 && *g - moving < *a + 1.0
                    });
                    for (at, attackers, guards) in colony_defense(view, seat) {
                        if attackers == 0.0 {
                            continue;
                        }
                        if at != from
                            && guards < attackers + 1.0
                            && moving > 0.0
                            && travel_distance(view, to, at) < travel_distance(view, from, at)
                        {
                            best = best.max(120.0 - travel_distance(view, to, at) * 0.5);
                        }
                    }
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
                                && travel_distance(view, to, coord)
                                    < travel_distance(view, from, coord)
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
                    if vacates {
                        best -= 120.0;
                    }
                    // Fleets may leave Settlers behind (#movement), weighed like moving them into danger.
                    let left = number(&here_fleet["settler"]) - settlers;
                    if split && left > 0.0 {
                        let stay = json!({"settler": left});
                        best -= bot_threat(view, seat, &stay, from, from) * 130.0;
                        // 34.39 #combat: the last Fleet stays on an enemy center its Settler can capture.
                        let fleets_left = number(&here_fleet["fleet"]) - number(&fleet["fleet"]);
                        if fleet_rule
                            && here_center
                            && !here["owner"].is_null()
                            && here["owner"] != json!(seat)
                            && fleets_left <= 0.0
                        {
                            return -10.0;
                        }
                    }
                }
                best
            }
            "probe" => {
                let known = view["planets"].as_object().is_some_and(|ps| {
                    ps.values().any(|p| {
                        (p["special"] == "relic" || p["relicSignal"] == true)
                            && p["relicClaimed"] != true
                    })
                });
                if view["combinedProbe"] == true && known {
                    -10.0
                } else {
                    150.0
                }
            }
            "excavate" => {
                let key = view["relicRow"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .find(|c| c["id"] == action["relic"])
                    .and_then(|c| c["key"].as_str())
                    .unwrap_or("");
                let stats = &view["cardStats"][key];
                160.0
                    + number(&stats["draw"]) * 4.0
                    + stats["limits"]
                        .as_object()
                        .into_iter()
                        .flat_map(|m| m.values())
                        .map(number)
                        .sum::<f64>()
                        * 2.0
            }
            // A Capacity Module is played as soon as it is drawn (rules #rival-planning).
            "special" if action["key"] == "capacityModule" => {
                95.0 + bot_module_allocation_value(view, seat, action) * 0.01
            }
            // 31.36: permanent Prestige, capacity and big draws come first.
            "special"
                if matches!(
                    action["key"].as_str(),
                    Some(
                        "ascendancyCodex"
                            | "cargoExpansion"
                            | "hyperspaceVaults"
                            | "commandNexus"
                            | "strategyCore"
                            | "signalRelay"
                            | "surveyNetwork"
                            | "tacticalBriefing"
                            | "memoryPrism"
                            | "keepersArchive"
                            | "foldedWarehouse"
                    )
                ) =>
            {
                95.0
            }
            "special"
                if view["cardStats"][action["key"].as_str().unwrap_or("")]["bankRate"] == 2 =>
            {
                let resource = action["resource"].as_str().unwrap_or("");
                if !RESOURCE_KEYS.contains(&resource)
                    || exchange_surplus(view, seat, resource) < 2.0
                {
                    -10.0
                } else {
                    (if view["cardPurchasePlanning"] == true {
                        110.0
                    } else {
                        75.0
                    }) + exchange_surplus(view, seat, resource).min(8.0)
                }
            }
            "special" => {
                50.0 + if action["key"] == "cradleOfLostSuns" {
                    bot_allocation_value(view, seat, action, false) * 0.1
                } else if let Some(trash) = action["trash"].as_array() {
                    // 34.39 Archive Purge: prefer the rival's own surplus-starter choice.
                    if *trash == bot_purge_choice(me, 2) {
                        2.0
                    } else {
                        -10.0
                    }
                } else {
                    0.0
                }
            }

            "buy_effect" if view["investmentPlanning"] == true => 200.0,
            "buy_effect" => 100.0,
            "upgrade" => {
                let r = action["resource"].as_str().unwrap();
                let card = me["hand"]
                    .as_array()
                    .into_iter()
                    .chain(me["discard"].as_array())
                    .chain(me["inPlay"].as_array())
                    .flatten()
                    .find(|c| c["id"] == action["card"]);
                let level_iii = card.is_some_and(|c| c["upgraded"] == true);
                let price = if level_iii { 3.0 } else { 2.0 };
                let index = RESOURCE_KEYS.iter().position(|k| *k == r).unwrap();
                let leader = view["players"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|p| number(&p["prestige"]))
                    .fold(0.0, f64::max);
                if bot_yards(view, seat) > 0
                    && number(&me["resources"][r]) >= planning_protection(view, seat)[index] + price
                    && view["victoryTarget"].as_f64().unwrap_or(40.0) - leader > 3.0
                {
                    if view["investmentPlanning"] == true
                        && !established_construction(me)
                        && card.is_some_and(|c| c["key"] == "construct")
                    {
                        128.0
                    } else if level_iii {
                        116.0
                    } else if card.is_some_and(|c| c["key"] == "construct") {
                        112.0
                    } else {
                        103.0
                    }
                } else {
                    -5.0
                }
            }
            // Rules #storage-allocation: buy a Capacity Module from the Upgrades tray when
            // the best market card needs more room or storage is worthwhile, holding at
            // most one unplayed module.
            "buy" if action["source"] == "capacity" => {
                let worthwhile =
                    bot_storage_budget(view, seat).is_some_and(|(cost, protection)| {
                        ["matter", "energy", "biomass", "data"].iter().all(|r| {
                            let held = number(&me["resources"][*r]);
                            held - number(&cost[*r]) >= held.min(number(&protection[*r]))
                        })
                    });
                if bot_unplayed_modules(me) > 0.0 {
                    -20.0
                } else if view["investmentPlanning"] == true {
                    let keep = planning_protection(view, seat);
                    let consumes_scoring = RESOURCE_KEYS.iter().enumerate().any(|(i, r)| {
                        let held = number(&me["resources"][*r]);
                        held - number(&me["storageUpgradeCost"][*r]) < keep[i].min(held)
                    });
                    if investment_horizon(view) < 3.0 || consumes_scoring {
                        -20.0
                    } else if capacity_need(view, seat).is_some() || worthwhile {
                        if established_construction(me) {
                            if matches!(self.strategy, Strategy::Market)
                                && capacity_need(view, seat).is_some()
                            {
                                134.0
                            } else {
                                100.0
                            }
                        } else {
                            90.0
                        }
                    } else {
                        -20.0
                    }
                } else if capacity_need(view, seat).is_some() {
                    130.0
                } else if worthwhile {
                    125.0
                } else {
                    -20.0
                }
            }
            "buy" if capacity_card(action["key"].as_str().unwrap_or("")).is_some() => {
                let key = action["key"].as_str().unwrap_or("");
                if bot_yards(view, seat) == 0 {
                    -10.0
                } else {
                    let cost = observed_payment_cost(view, key).unwrap_or([0.0; 4]);
                    let keep = planning_protection(view, seat);
                    if RESOURCE_KEYS.iter().enumerate().any(|(i, r)| {
                        number(&me["resources"][*r]) - cost[i]
                            < keep[i].min(number(&me["resources"][*r]))
                    }) {
                        -10.0
                    } else {
                        capacity_value(view, seat, key).map_or(-10.0, |v| {
                            if v > 0.0 {
                                if view["investmentPlanning"] == true
                                    && established_construction(me)
                                    && v >= if matches!(self.strategy, Strategy::Market) {
                                        18.0
                                    } else {
                                        24.0
                                    }
                                {
                                    120.0 + v
                                } else {
                                    60.0 + v
                                }
                            } else {
                                -10.0
                            }
                        })
                    }
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
            "finish_construct" => {
                if view["investmentPlanning"] == true
                    && view["optionalConstructionPlanning"] == true
                {
                    0.0
                } else {
                    -20.0
                }
            }
            // 31.36: during Buy, raise the limits the best market card needs.
            "increase_storage" if view["phase"] == "buy" && capacity_need(view, seat).is_some() => {
                let need = capacity_need(view, seat).unwrap();
                130.0
                    + RESOURCE_KEYS
                        .iter()
                        .enumerate()
                        .map(|(i, r)| number(&action["allocation"][*r]).min(need[i]) * 10.0)
                        .sum::<f64>()
            }
            "increase_storage" => {
                let worthwhile =
                    bot_storage_budget(view, seat).is_some_and(|(cost, protection)| {
                        ["matter", "energy", "biomass", "data"].iter().all(|r| {
                            let held = number(&me["resources"][*r]);
                            held - number(&cost[*r]) >= held.min(number(&protection[*r]))
                        })
                    });
                if worthwhile {
                    125.0 + bot_allocation_value(view, seat, action, true) * 0.1
                } else {
                    -20.0
                }
            }
            "bank_trade" => {
                let give = action["giveType"].as_str().unwrap();
                let get = action["getType"].as_str().unwrap();
                let cost = if view["investmentPlanning"] == true {
                    bot_storage_reserve(view, seat)
                } else {
                    bot_cost(view, seat)
                };
                let bootstrap = get == "data"
                    && bot_yards(view, seat) == 0
                    && number(&me["resources"]["data"]) < 1.0
                    && number(&me["resources"][give]) >= bank_rate(view, seat, give);
                let funded = number(&me["resources"][get]) < number(&cost[get])
                    && number(&me["resources"][give]) >= bank_rate(view, seat, give)
                    && (number(&me["resources"][give])
                        >= number(&cost[give]) + bank_rate(view, seat, give)
                        || (view["investmentPlanning"] != true
                            && number(&me["resources"][give]) >= bot_limit(view, seat, give)));
                if number(&me["resources"][get]) >= bot_limit(view, seat, get) {
                    -100.0
                } else if bootstrap || funded {
                    100.0
                        + if view["cardPurchasePlanning"] == true
                            && bank_rate(view, seat, give) == 2.0
                        {
                            5.0
                        } else {
                            0.0
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
                let reserve = bot_storage_reserve(view, seat);
                number(&me["resources"][resource]) - number(&reserve[resource])
                    + number(&action["amount"]) * 0.01
            }
            // #buy: trash candidates come from discard, from play or from hand, scored
            // alike. Older rules never offer a hand card, so their games play as before.
            "decommission" => {
                let card = me["discard"]
                    .as_array()
                    .into_iter()
                    .chain(me["inPlay"].as_array())
                    .chain(me["hand"].as_array())
                    .flatten()
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
                let basic = matches!(
                    card["key"].as_str().unwrap_or(""),
                    "construct" | "move" | "colonize" | "excavate" | "probe"
                );
                if redundant
                    && (view["investmentPlanning"] != true || basic)
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
        // Hundreds of legal split moves share the same public defense plan.
        // Cache it only for this decision, never across changes to the table.
        let mut planned = observation.clone();
        planned["_rival_fleet_tactic"] = json!(combat_fleet_tactic_plan(observation));
        planned["_rival_market_focus"] = json!(matches!(self.strategy, Strategy::Market));
        planned["_rival_market_combat_opportunity"] = json!(
            matches!(self.strategy, Strategy::Market)
                && market_combat_opportunity(
                    observation,
                    observation["seat"].as_u64().unwrap() as usize
                )
        );
        let defense: Vec<Value> =
            colony_defense(observation, observation["seat"].as_u64().unwrap() as usize)
                .into_iter()
                .map(|(at, a, g)| json!([at, a, g]))
                .collect();
        planned["_rival_colony_defense"] = json!(defense);
        if observation["goalDirectedTrading"] == true {
            planned["_rival_goal_trade"] =
                goal_trade_plan(&planned, observation["seat"].as_u64().unwrap() as usize);
        }
        legal
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let score = self.score(&planned, a);
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
    if let Some(strategy) = legacy_v18::Strategy::parse(version) {
        return Ok(Box::new(legacy_v18::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v19::Strategy::parse(version) {
        return Ok(Box::new(legacy_v19::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v20::Strategy::parse(version) {
        return Ok(Box::new(legacy_v20::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v21::Strategy::parse(version) {
        return Ok(Box::new(legacy_v21::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v22::Strategy::parse(version) {
        return Ok(Box::new(legacy_v22::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v23::Strategy::parse(version) {
        return Ok(Box::new(legacy_v23::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v24::Strategy::parse(version) {
        return Ok(Box::new(legacy_v24::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v25::Strategy::parse(version) {
        return Ok(Box::new(legacy_v25::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v26::Strategy::parse(version) {
        return Ok(Box::new(legacy_v26::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v27::Strategy::parse(version) {
        return Ok(Box::new(legacy_v27::BuiltinAgent::new(strategy, seed)));
    }
    if let Some(strategy) = legacy_v28::Strategy::parse(version) {
        return Ok(Box::new(legacy_v28::BuiltinAgent::new(strategy, seed)));
    }
    Err("Unsupported Galactic Reach policy version.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn strategic_view() -> Value {
        json!({"seat":0,"round":8,"victoryTarget":40,"players":[
            {"id":0,"prestige":3,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":12,"energy":12,"biomass":12,"data":12},"hand":[],"discard":[],"inPlay":[],"deckContents":[],"deckCount":1,"handCount":0,"military":[]},
            {"id":1,"prestige":3,"resources":{}},{"id":2,"prestige":3,"resources":{}},{"id":3,"prestige":3,"resources":{}}],
            "planets":{"0,0":{"cluster":0,"type":"matter","owner":0,"hasColony":true},"-1,0":{"cluster":0,"type":"energy","owner":0,"upgrade":"starbase"}},
            "clusters":[{"kind":"world","center":"0,0","coords":["0,0","-1,0"]}],"fleets":{},"relicRow":[],"market":[],"marketCosts":[],"cardStats":{}})
    }
    #[test]
    fn strategic_rivals_upgrade_ii_in_play_before_discretionary_purchases() {
        let mut view = strategic_view();
        view["players"][0]["inPlay"] =
            json!([{"id":"starter","key":"move","starter":true,"upgraded":true,"level":2}]);
        view["players"][0]["resources"] = json!({"matter":0,"energy":0,"biomass":1,"data":3});
        for strategy in [Strategy::Military, Strategy::Economy, Strategy::Expansion] {
            let agent = BuiltinAgent::new(strategy, [17; 32]);
            assert!(
                agent.score(
                    &view,
                    &json!({"type":"upgrade","card":"starter","resource":"data"})
                ) > 110.0
            );
            view["players"][0]["resources"]["data"] = json!(2);
            assert!(
                agent.score(
                    &view,
                    &json!({"type":"upgrade","card":"starter","resource":"data"})
                ) < 0.0
            );
            view["players"][0]["resources"]["data"] = json!(3);
        }
        assert_eq!(
            agent("gr-economy/28", [17; 32]).unwrap().policy_version(),
            "gr-economy/28"
        );
        assert_eq!(Strategy::Economy.version(), "gr-economy/29");
    }
    #[test]
    fn investment_planning_adds_profitable_harvesters_without_changing_archived_views() {
        let agent = BuiltinAgent::new(Strategy::Economy, [5; 32]);
        let mut view = json!({"seat":0,"round":4,"victoryTarget":40,"players":[{"prestige":10,"resourceLimits":{"matter":8,"energy":8,"biomass":8,"data":8}},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"},"1,0":{"owner":0,"type":"matter"},"2,0":{"owner":0,"type":"matter"}},"fleets":{},"harvesterYield":2,"relicRow":[{"key":"memoryPrism"}]});
        let action = json!({"type":"build","coord":"1,0","kind":"harvester"});
        let archived = agent.score(&view, &action);
        assert_eq!(archived, 4.0);
        view["investmentPlanning"] = json!(true);
        assert!(agent.score(&view, &action) > archived);
        view["players"][1]["hand"] = json!([{"key":"commandNexus"}]);
        let public_score = agent.score(&view, &action);
        view["players"][1]["hand"] = json!([]);
        assert_eq!(agent.score(&view, &action), public_score);
        view["players"][1]["prestige"] = json!(39);
        assert_eq!(
            agent.score(&view, &action),
            1.0,
            "Late production cannot pay back"
        );
        view.as_object_mut().unwrap().remove("investmentPlanning");
        assert_eq!(agent.score(&view, &action), archived);
    }
    #[test]
    fn order_benefits_value_range_and_build_savings_without_inventing_draws() {
        let mut agent = BuiltinAgent::new(Strategy::Market, [5; 32]);
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":5,"phase":"buy","victoryTarget":40,"players":[{"prestige":10,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":8,"energy":8,"biomass":8,"data":8},"hand":[{"id":"c","key":"construct","starter":true,"level":2,"upgraded":true}],"handCount":1,"deckCount":5,"deckContents":[{"key":"construct","starter":true,"level":3,"upgraded":true,"count":2},{"key":"move","starter":true,"level":3,"upgraded":true,"count":3}],"discard":[],"inPlay":[],"military":[]},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"},"1,0":{"owner":0,"type":"energy","upgrade":"harvester"}},"fleets":{"0,0":{"0":{"settler":1}}},"harvesterYield":2,"market":[{"key":"worldEngine"},{"key":"foldSpaceGate"},{"key":"prefabYards"}],"marketCosts":[{"matter":6,"energy":1,"biomass":1},{"energy":6,"data":1},{"matter":4}],"cardStats":{"worldEngine":{"order":"construct","draw":1,"buildDiscount":"free"},"foldSpaceGate":{"order":"move","range":5},"prefabYards":{"order":"construct","buildDiscount":"each","secondBuild":true}}});
        let world = capacity_value(&view, 0, "worldEngine").unwrap();
        let gate = capacity_value(&view, 0, "foldSpaceGate").unwrap();
        let prefab = capacity_value(&view, 0, "prefabYards").unwrap();
        let buy = json!({"type":"buy","source":"market","key":"worldEngine"});
        let upgrade = json!({"type":"upgrade","card":"c","resource":"data"});
        assert_eq!(
            agent.select_action(&view, &[upgrade.clone(), buy.clone()]),
            0
        );
        view["orderBenefitPlanning"] = json!(true);
        assert!((capacity_value(&view, 0, "worldEngine").unwrap() - world - 7.5).abs() < 1e-9);
        assert_eq!(
            capacity_value(&view, 0, "foldSpaceGate").unwrap(),
            gate + 10.0
        );
        assert_eq!(
            capacity_value(&view, 0, "prefabYards").unwrap(),
            prefab + 9.0
        );
        assert_eq!(
            agent.select_action(&view, &[upgrade, buy]),
            1,
            "Printed savings can prioritize the purchase before another starter upgrade"
        );
        view["cardStats"]["prefabYards"]["secondBuild"] = json!(false);
        assert_eq!(
            capacity_value(&view, 0, "prefabYards").unwrap(),
            prefab + 6.0
        );
        view["fleets"] = json!({});
        assert!(
            capacity_value(&view, 0, "foldSpaceGate").unwrap() < gate,
            "An extra Move needs an actual ship"
        );
        view["fleets"] = json!({"0,0":{"0":{"settler":1}}});
        view["orderBenefitPlanning"] = json!(false);
        assert_eq!(capacity_value(&view, 0, "worldEngine").unwrap(), world);
    }
    #[test]
    fn market_purchase_ablation_changes_purchases_and_targets_not_order_legality() {
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":5,"victoryTarget":40,"players":[{"prestige":10,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":10,"energy":10,"biomass":10,"data":10},"hand":[],"discard":[],"inPlay":[],"military":[],"deckContents":[]}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"}},"fleets":{"0,0":{"0":{"fleet":1}}},"market":[{"key":"signalRelay"},{"key":"monumentOfAccord"},{"key":"victoryDoctrine"}],"marketCosts":[{"data":3},{"matter":6,"biomass":2,"data":2},{"matter":1,"energy":2,"data":6}],"marketPrestige":[0,3,0],"cardStats":{"signalRelay":{"order":"special","draw":2},"monumentOfAccord":{"gainPrestige":3},"victoryDoctrine":{"military":true,"attack":2,"victoryPrestige":2}}});
        let normal = capacity_value(&view, 0, "signalRelay");
        assert!(normal.is_some());
        view["marketPurchasePolicy"] = json!("points-only");
        assert!(capacity_value(&view, 0, "signalRelay").is_none());
        assert!(
            capacity_value(&view, 0, "victoryDoctrine").is_none(),
            "Combat Prestige is not Prestige on purchase"
        );
        assert!(capacity_value(&view, 0, "monumentOfAccord").is_some());
        assert_eq!(market_target_cost(&view, 0), Some([6.0, 0.0, 2.0, 2.0]));
        view["marketPurchasePolicy"] = json!("none");
        for key in ["signalRelay", "monumentOfAccord", "victoryDoctrine"] {
            assert!(capacity_value(&view, 0, key).is_none());
        }
        assert!(market_target_cost(&view, 0).is_none());
        assert!(
            capacity_need(&view, 0).is_none(),
            "Never fund cards the policy will not buy"
        );
        let agent = BuiltinAgent::new(Strategy::Economy, [5; 32]);
        assert!(
            agent.score(
                &view,
                &json!({"type":"buy","source":"market","key":"monumentOfAccord"})
            ) < agent.score(&view, &json!({"type":"finish_buy"}))
        );
        assert_eq!(
            agent.score(&view, &json!({"type":"colonize"})),
            160.0,
            "Already-held orders remain available"
        );
        view["marketPurchasePolicy"] = json!("normal");
        assert_eq!(capacity_value(&view, 0, "signalRelay"), normal);
    }
    #[test]
    fn protected_market_budget_funds_the_bill_and_preserved_scoring_payment() {
        let mut agent = BuiltinAgent::new(Strategy::Market, [5; 32]);
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":5,"phase":"buy","victoryTarget":40,"players":[{"prestige":10,"resources":{"matter":2,"energy":3,"biomass":1,"data":6},"resourceLimits":{"matter":4,"energy":4,"biomass":4,"data":6},"hand":[{"key":"construct","id":"c","starter":true,"upgraded":true,"level":2},{"key":"probe","id":"p"}],"handCount":2,"deckCount":8,"deckContents":[{"key":"move","count":8}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"data","upgrade":"starbase","cluster":0},"3,0":{"owner":null,"type":"moon","special":"relic","cluster":1}},"clusters":[{"center":"0,0","kind":"world"},{"center":"3,0","kind":"moon"}],"fleets":{"3,0":{"0":{"explorer":1}}},"market":[{"key":"commandNexus"}],"marketCosts":[{"energy":2,"data":6}],"cardStats":{"commandNexus":{"order":"special","draw":4}}});
        let buy = json!({"type":"buy","source":"market","key":"commandNexus"});
        assert_eq!(planning_protection(&view, 0), [1.0, 1.0, 0.0, 2.0]);
        assert_eq!(market_target_cost(&view, 0), Some([0.0, 2.0, 0.0, 6.0]));
        assert!(capacity_need(&view, 0).is_none());
        assert!(
            agent.score(&view, &buy) < 0.0,
            "The printed price alone cannot preserve the excavation payment"
        );
        view["protectedMarketBudget"] = json!(true);
        assert_eq!(market_target_cost(&view, 0), Some([0.0, 3.0, 0.0, 8.0]));
        assert_eq!(capacity_need(&view, 0), Some([0.0, 0.0, 0.0, 2.0]));
        assert!(
            agent.score(&view, &buy) < 0.0,
            "Planning does not waive the actual purchase guard"
        );
        view["players"][0]["resourceLimits"]["data"] = json!(8);
        assert_eq!(
            bot_storage_reserve(&view, 0)["data"],
            8.0,
            "Banking funds the whole budget once it fits"
        );
        view["players"][0]["resources"]["data"] = json!(8);
        assert_eq!(
            agent.select_action(&view, &[json!({"type":"finish_buy"}), buy.clone()]),
            1
        );
        view["fleets"] = json!({});
        view["players"][0]["hand"] = json!([]);
        assert_eq!(
            market_target_cost(&view, 0),
            Some([0.0, 2.0, 0.0, 6.0]),
            "Without a protected payment the target remains the printed bill"
        );
    }
    #[test]
    fn colony_planning_values_printed_terms_and_chooses_the_better_legal_order() {
        let mut agent = BuiltinAgent::new(Strategy::Market, [5; 32]);
        let mut view = json!({"investmentPlanning":true,"captureNeedsFleet":true,"seat":0,"round":5,"phase":"buy","victoryTarget":40,"players":[{"prestige":10,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":10,"energy":10,"biomass":10,"data":10},"hand":[{"id":"c","key":"construct","starter":true,"level":2,"upgraded":true}],"handCount":1,"deckCount":9,"deckContents":[{"key":"move","count":9}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase","cluster":0},"3,0":{"owner":null,"type":"biomass","cluster":1}},"clusters":[{"kind":"world","center":"0,0"},{"kind":"world","center":"3,0"}],"fleets":{"0,0":{"0":{"settler":1}}},"market":[{"key":"seedArk"},{"key":"colonyPods"},{"key":"genesisCharter"}],"marketCosts":[{"biomass":4},{"energy":1,"biomass":4},{"matter":2,"biomass":8,"data":1}],"cardStats":{"seedArk":{"order":"colonize","colonyCost":1},"colonyPods":{"order":"colonize","colonyCost":1,"keepSettler":true},"genesisCharter":{"order":"colonize","colonyCost":0,"keepSettler":true,"colonyPrestige":2}}});
        assert!(
            capacity_value(&view, 0, "seedArk") > capacity_value(&view, 0, "colonyPods"),
            "Old generic-order valuation misses the retained Settler"
        );
        view["colonyPlanning"] = json!(true);
        assert!(capacity_value(&view, 0, "colonyPods") > capacity_value(&view, 0, "seedArk"));
        assert_eq!(
            agent.select_action(
                &view,
                &[
                    json!({"type":"buy","source":"market","key":"seedArk"}),
                    json!({"type":"buy","source":"market","key":"colonyPods"})
                ]
            ),
            1
        );
        let useful = capacity_value(&view, 0, "colonyPods").unwrap();
        view["planets"]["3,0"]["owner"] = json!(1);
        assert!(
            !public_colony_opportunity(&view, 0),
            "Enemy worlds still need a Fleet"
        );
        assert!(capacity_value(&view, 0, "colonyPods").unwrap() < useful);
        view["fleets"]["0,0"]["0"]["fleet"] = json!(1);
        assert!(public_colony_opportunity(&view, 0));
        let a = |key| json!({"type":"colonize","key":key,"coord":"3,0"});
        assert!(agent.score(&view, &a("colonyPods")) > agent.score(&view, &a("seedArk")));
        assert!(
            agent.score(&view, &a("genesisCharter")) > agent.score(&view, &a("colonyPods")),
            "Zero cost and bonus Prestige remain distinct"
        );
        let charter = agent.score(&view, &a("genesisCharter"));
        view["planets"]["3,0"]["owner"] = Value::Null;
        assert_eq!(
            agent.score(&view, &a("genesisCharter")),
            charter,
            "Zero cost stays zero for founding and capture"
        );
        view["fleets"]["0,0"]["0"]["settler"] = json!(0);
        assert!(
            capacity_value(&view, 0, "colonyPods").unwrap() < useful,
            "A card never supplies its own Settler"
        );
        view["colonyPlanning"] = json!(false);
        assert_eq!(agent.score(&view, &a("seedArk")), 160.0);
        assert_eq!(
            agent.score(&view, &a("colonyPods")),
            160.0,
            "Unflagged decision ranking is unchanged"
        );
    }
    #[test]
    fn production_discipline_prefers_pass_to_unprofitable_paid_harvesters() {
        let mut agent = BuiltinAgent::new(Strategy::Economy, [5; 32]);
        let mut view = json!({"investmentPlanning":true,"constructDrawOnly":true,"seat":0,"round":12,"victoryTarget":40,"players":[{"prestige":10,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":8,"energy":8,"biomass":8,"data":8},"hand":[{"key":"construct","id":"iii","starter":true,"level":3}],"deckContents":[],"inPlay":[],"discard":[]},{"prestige":39},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"},"1,0":{"owner":0,"type":"matter"},"2,0":{"owner":0,"type":"matter"}},"fleets":{},"harvesterYield":2,"relicRow":[{"key":"memoryPrism"}],"cardStats":{"prefabYards":{"buildDiscount":"each"},"worldEngine":{"buildDiscount":"free"}}});
        let paid = json!({"type":"build","coord":"1,0","kind":"harvester","card":"iii","key":"construct","discountResource":null});
        let pass = json!({"type":"pass"});
        assert_eq!(
            agent.select_action(&view, &[paid.clone(), pass.clone()]),
            0,
            "The existing positive fallback still builds"
        );
        view["productionDiscipline"] = json!(true);
        assert_eq!(
            agent.select_action(&view, &[paid.clone(), pass.clone()]),
            1,
            "Even the III build bonus must remain below Pass"
        );
        for (key, discount) in [("prefabYards", "each"), ("worldEngine", "free")] {
            let mut free = paid.clone();
            free["key"] = json!(key);
            free["discountResource"] = json!(discount);
            assert_eq!(
                agent.select_action(&view, &[free, pass.clone()]),
                0,
                "A free first Harvester remains an option"
            );
        }
        assert_eq!(
            agent.select_action(
                &view,
                &[
                    json!({"type":"second_build","coord":"1,0","kind":"harvester"}),
                    pass.clone()
                ]
            ),
            1,
            "An optional second build pays full cost"
        );
        view["round"] = json!(4);
        view["players"][1]["prestige"] = json!(3);
        assert_eq!(
            agent.select_action(&view, &[paid.clone(), pass.clone()]),
            0,
            "Profitable investment is unchanged"
        );
        view["planets"]["3,0"] = json!({"owner":0,"type":"matter"});
        view["planets"]["4,0"] = json!({"owner":0,"type":"matter"});
        assert_eq!(
            agent.select_action(&view, &[paid.clone(), pass.clone()]),
            1,
            "Production already at the target need not grow"
        );
        view["round"] = json!(1);
        view["planets"]["1,0"]["type"] = json!("data");
        view["planets"]["1,0"]["owner"] = Value::Null;
        assert_eq!(
            agent.select_action(&view, &[paid, pass]),
            0,
            "Keep the zero-Data bootstrap"
        );
    }
    #[test]
    fn investment_planning_values_reachable_targets_and_preserves_first_construct_upgrade() {
        let agent = BuiltinAgent::new(Strategy::Economy, [6; 32]);
        let mut view = json!({"seat":0,"round":4,"phase":"buy","victoryTarget":40,"players":[{"prestige":8,"resources":{"matter":8,"energy":8,"biomass":8,"data":8},"resourceLimits":{"matter":8,"energy":8,"biomass":8,"data":8},"hand":[{"id":"c","key":"construct","starter":true}],"handCount":1,"deckCount":9,"deckContents":[{"key":"move","count":9}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"}},"fleets":{},"clusters":[],"market":[{"key":"commandNexus"}],"marketCosts":[{"energy":2,"data":6}],"cardStats":{"commandNexus":{"draw":4,"order":"special"}}});
        let upgrade = json!({"type":"upgrade","card":"c","resource":"matter"});
        let buy = json!({"type":"buy","source":"market","key":"commandNexus"});
        let old_upgrade = agent.score(&view, &upgrade);
        let old_buy = agent.score(&view, &buy);
        assert!(old_upgrade > old_buy);
        view["investmentPlanning"] = json!(true);
        assert!(
            agent.score(&view, &upgrade) > agent.score(&view, &buy),
            "First Construct II comes first"
        );
        view["players"][0]["hand"][0]["upgraded"] = json!(true);
        assert!(
            agent.score(&view, &buy) > agent.score(&view, &upgrade),
            "A useful affordable draw card can precede further upgrades"
        );
        view.as_object_mut().unwrap().remove("investmentPlanning");
        assert!(
            agent.score(&view, &upgrade) > agent.score(&view, &buy),
            "Archived ranking is unchanged"
        );
        view["investmentPlanning"] = json!(true);
        assert!(
            agent.score(&view, &json!({"type":"buy_effect"})) > agent.score(&view, &buy),
            "Activate a held discount before paying for a market card"
        );
        let mut ready = view.clone();
        ready["planets"]["0,0"]["special"] = json!("relic");
        ready["planets"]["0,0"]["cluster"] = json!(0);
        ready["clusters"] = json!([{"center":"0,0","kind":"world"}]);
        ready["fleets"] = json!({"0,0":{"0":{"explorer":1}}});
        ready["players"][0]["resources"] = json!({"matter":3,"energy":2,"biomass":8,"data":7});
        ready["marketPaymentCosts"] = json!([{"energy":1,"data":5}]);
        assert!(
            agent.score(&ready, &buy) > 0.0,
            "Discounted payment retains the ready excavation cost"
        );
        ready.as_object_mut().unwrap().remove("marketPaymentCosts");
        assert!(
            agent.score(&ready, &buy) < 0.0,
            "Full price would consume that excavation payment"
        );
        ready["players"][0]["resources"] = json!({"matter":1,"energy":1,"biomass":2,"data":2});
        ready["players"][0]["resourceLimits"]["data"] = json!(4);
        ready["players"][0]["storageUpgradeCost"] =
            json!({"matter":1,"energy":1,"biomass":1,"data":1});
        assert!(capacity_need(&ready, 0).is_some());
        assert!(
            agent.score(&ready, &json!({"type":"buy","source":"capacity"})) < 0.0,
            "A module cannot consume the ready scoring payment"
        );
        view.as_object_mut().unwrap().remove("investmentPlanning");
        view["market"] = json!([{"key":"signalRelay"},{"key":"ascendancyCodex"}]);
        view["marketCosts"] = json!([{"energy":2,"data":1},{"energy":2,"biomass":4,"data":8}]);
        view["cardStats"] = json!({"signalRelay":{"draw":2,"order":"special"},"ascendancyCodex":{"draw":1,"prestige":2,"order":"special"}});
        view["players"][0]["resources"] = json!({"matter":0,"energy":0,"biomass":0,"data":0});
        view["players"][0]["resourceLimits"] = json!({"matter":4,"energy":4,"biomass":4,"data":4});
        assert!(capacity_need(&view, 0).is_some());
        view["investmentPlanning"] = json!(true);
        assert!(
            capacity_need(&view, 0).is_none(),
            "Near-term draw outranks a distant expensive target"
        );
    }
    #[test]
    fn investment_planning_banks_toward_the_market_price_not_just_the_next_unit() {
        let agent = BuiltinAgent::new(Strategy::Economy, [7; 32]);
        let mut view = json!({"seat":0,"round":4,"victoryTarget":30,"players":[{"prestige":6,"resources":{"matter":6,"energy":8,"biomass":3,"data":2},"resourceLimits":{"matter":12,"energy":12,"biomass":12,"data":12},"hand":[],"handCount":0,"deckCount":10,"deckContents":[],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"data","upgrade":"starbase"}},"fleets":{},"market":[{"key":"strategyCore"}],"marketCosts":[{"energy":1,"data":5}],"cardStats":{"strategyCore":{"draw":3,"order":"special"}}});
        let bank = json!({"type":"bank_trade","giveType":"energy","getType":"data"});
        assert!(agent.score(&view, &bank) < 0.0);
        view["investmentPlanning"] = json!(true);
        assert_eq!(number(&bot_storage_reserve(&view, 0)["data"]), 5.0);
        assert!(agent.score(&view, &bank) > 0.0);
        view["players"][0]["resources"]["energy"] = json!(4);
        view["players"][0]["resourceLimits"]["energy"] = json!(4);
        assert!(
            agent.score(&view, &bank) < 0.0,
            "Full tracks cannot be burned when the market reserve still needs them"
        );
        view["players"][1]["hand"] = json!([{"key":"genesisCharter"}]);
        assert_eq!(number(&bot_storage_reserve(&view, 0)["data"]), 5.0);
    }
    #[test]
    fn market_research_profile_keeps_economy_core_and_prioritizes_useful_purchases() {
        let mut market = BuiltinAgent::new(Strategy::Market, [8; 32]);
        let mut economy = BuiltinAgent::new(Strategy::Economy, [8; 32]);
        assert!(agent("gr-market/29", [0; 32]).is_ok());
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":4,"phase":"buy","victoryTarget":30,"players":[{"prestige":6,"resources":{"matter":4,"energy":4,"biomass":4,"data":4},"resourceLimits":{"matter":4,"energy":4,"biomass":4,"data":4},"hand":[{"id":"c","key":"construct","starter":true,"upgraded":true,"level":2}],"handCount":1,"deckCount":9,"deckContents":[{"key":"move","count":9}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"}},"fleets":{},"clusters":[],"market":[{"key":"signalRelay"}],"marketCosts":[{"energy":2,"data":1}],"cardStats":{"signalRelay":{"draw":2,"order":"special"}}});
        let legal = vec![
            json!({"type":"upgrade","card":"c","resource":"matter"}),
            json!({"type":"buy","source":"market","key":"signalRelay"}),
        ];
        assert_eq!(economy.select_action(&view, &legal), 0);
        assert_eq!(market.select_action(&view, &legal), 1);
        view["players"][0]["hand"][0]["upgraded"] = json!(false);
        view["players"][0]["hand"][0]["level"] = json!(1);
        assert_eq!(
            market.select_action(&view, &legal),
            0,
            "First Construct II is protected"
        );
        view["phase"] = json!("operations");
        view["planets"]["0,0"]["hasColony"] = json!(true);
        view["planets"]["1,0"] = json!({"owner":0,"type":"matter","cluster":0});
        let build = json!({"type":"build","kind":"harvester","coord":"1,0"});
        assert_eq!(
            market.score(&view, &build),
            economy.score(&view, &build),
            "Market priority does not replace the Economy production core"
        );
        view["phase"] = json!("buy");
        view["players"][0]["hand"][0]["upgraded"] = json!(true);
        view["players"][0]["hand"][0]["level"] = json!(2);
        view["players"][0]["storageUpgradeCost"] =
            json!({"matter":1,"energy":1,"biomass":1,"data":1});
        view["market"] = json!([{"key":"commandNexus"}]);
        view["marketCosts"] = json!([{"energy":2,"data":6}]);
        view["cardStats"] = json!({"commandNexus":{"draw":4,"order":"special"}});
        let capacity = vec![
            legal[0].clone(),
            json!({"type":"buy","source":"capacity","key":"capacityModule"}),
        ];
        assert_eq!(economy.select_action(&view, &capacity), 0);
        assert_eq!(
            market.select_action(&view, &capacity),
            1,
            "Market profile can fund capacity before another starter upgrade"
        );
    }
    #[test]
    fn seed_ark_alternatives_draw_or_colonize_without_double_counting() {
        let mut agent = BuiltinAgent::new(Strategy::Economy, [8; 32]);
        let mut view = strategic_view();
        view["players"][0]["hand"] = json!([{"id":"seed","key":"seedArk"}]);
        view["players"][0]["deckCount"] = json!(2);
        view["market"] = json!([{"key":"seedArk"}]);
        view["marketCosts"] = json!([{"biomass":4}]);
        view["cardStats"]["seedArk"] = json!({"order":"colonize","colonyCost":1});
        let baseline = capacity_value(&view, 0, "seedArk").unwrap();
        let draw = json!({"type":"order_draw","key":"seedArk","card":"seed"});
        let pass = json!({"type":"pass"});
        assert_eq!(agent.select_action(&view, &[draw.clone(), pass.clone()]), 1);
        view["cardStats"]["seedArk"]["fallbackDraw"] = json!(2);
        assert_eq!(agent.select_action(&view, &[pass.clone(), draw.clone()]), 1);
        assert_eq!(
            agent.select_action(
                &view,
                &[
                    draw.clone(),
                    json!({"type":"colonize","key":"seedArk","card":"seed","coord":"1,0"})
                ]
            ),
            1,
            "A legal Colony scores before drawing"
        );
        let flexible = capacity_value(&view, 0, "seedArk").unwrap();
        assert!(flexible > baseline);
        view["cardStats"]["seedArk"] = json!({"order":"special","draw":2});
        assert_eq!(
            capacity_value(&view, 0, "seedArk").unwrap(),
            flexible,
            "Without a Colony opportunity, use the draw alternative's value"
        );
        view["cardStats"]["seedArk"] = json!({"order":"colonize","colonyCost":1,"fallbackDraw":0});
        assert_eq!(
            capacity_value(&view, 0, "seedArk").unwrap(),
            baseline,
            "Zero/absent fallback retains previous valuation"
        );
        view["cardStats"]["seedArk"]["fallbackDraw"] = json!(2);
        view["players"][0]["deckCount"] = json!(0);
        view["players"][0]["discard"] = json!([]);
        assert_eq!(
            agent.select_action(&view, &[draw, pass]),
            1,
            "Do not spend a card on an empty draw"
        );
    }

    #[test]
    fn buy_discount_planning_values_future_visible_purchases_without_inventing_savings() {
        let mut agent = BuiltinAgent::new(Strategy::Market, [8; 32]);
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":4,"phase":"buy","victoryTarget":30,"players":[{"prestige":6,"resources":{"matter":4,"energy":4,"biomass":4,"data":4},"resourceLimits":{"matter":4,"energy":4,"biomass":4,"data":4},"hand":[{"id":"c","key":"construct","starter":true,"upgraded":true,"level":2}],"handCount":1,"deckCount":9,"deckContents":[{"key":"move","count":9}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"}},"fleets":{},"clusters":[],"market":[{"key":"procurementHub"},{"key":"surveyNetwork"}],"marketCosts":[{"biomass":1,"data":4},{"biomass":1,"data":2,"matter":0}],"cardStats":{"procurementHub":{"buyEffect":"hubDiscount"},"surveyNetwork":{"draw":2,"order":"special"}}});
        let buy = json!({"type":"buy","source":"market","key":"procurementHub"});
        let finish = json!({"type":"finish_buy"});
        let baseline = capacity_value(&view, 0, "procurementHub").unwrap();
        let other = capacity_value(&view, 0, "surveyNetwork").unwrap();
        assert_eq!(
            agent.select_action(&view, &[buy.clone(), finish.clone()]),
            1
        );
        view["buyDiscountPlanning"] = json!(true);
        assert!(capacity_value(&view, 0, "procurementHub").unwrap() > baseline);
        assert_eq!(agent.select_action(&view, &[buy, finish]), 0);
        assert_eq!(capacity_value(&view, 0, "surveyNetwork").unwrap(), other);
        view["marketCosts"][1] = json!({"matter":0,"energy":0,"biomass":0,"data":0});
        assert_eq!(
            capacity_value(&view, 0, "procurementHub").unwrap(),
            baseline,
            "Free offers save nothing"
        );
        view["market"] = json!([{"key":"procurementHub"},{"key":"tradeSyndicate"}]);
        view["marketCosts"][1] = json!({"energy":4,"data":1});
        view["cardStats"]["tradeSyndicate"] = json!({"buyEffect":"discountEach"});
        assert_eq!(
            capacity_value(&view, 0, "procurementHub").unwrap(),
            baseline,
            "Coupons are not their own purchase plan"
        );
        view["market"][1]["key"] = json!("surveyNetwork");
        view["marketCosts"][1] = json!({"biomass":1,"data":2});
        view["cardStats"]["procurementHub"]["buyEffect"] = json!("unknown");
        assert_eq!(
            capacity_value(&view, 0, "procurementHub").unwrap(),
            baseline
        );
        view["cardStats"]["procurementHub"]["buyEffect"] = json!("hubDiscount");
        view["investmentPlanning"] = json!(false);
        assert_eq!(
            capacity_value(&view, 0, "procurementHub").unwrap(),
            baseline,
            "Historical views keep existing valuation"
        );
        view["investmentPlanning"] = json!(true);
        view["players"][0]["prestige"] = json!(29);
        let late = capacity_value(&view, 0, "procurementHub").unwrap();
        view["buyDiscountPlanning"] = json!(false);
        assert_eq!(
            capacity_value(&view, 0, "procurementHub").unwrap(),
            late,
            "No future-use bonus in the last horizon"
        );
    }

    #[test]
    fn military_purchase_horizon_discounts_only_late_opt_in_investments() {
        let mut view = json!({"seat":0,"victoryTarget":30,"players":[{"prestige":26,"resources":{},"resourceLimits":{"matter":10,"energy":10,"biomass":10,"data":10},"military":[]}],"fleets":{"0,0":{"0":{"fleet":1}}},"planets":{},"market":[{"key":"aegisLattice"}],"marketCosts":[{"matter":7,"energy":2}],"cardStats":{"aegisLattice":{"shield":8}}});
        let baseline = capacity_value(&view, 0, "aegisLattice").unwrap();
        view["militaryHorizon"] = json!(true);
        assert_eq!(
            capacity_value(&view, 0, "aegisLattice").unwrap(),
            baseline - 15.0
        );
        view["players"][0]["prestige"] = json!(10);
        let early = capacity_value(&view, 0, "aegisLattice").unwrap();
        view["militaryHorizon"] = json!(false);
        assert_eq!(capacity_value(&view, 0, "aegisLattice").unwrap(), early);
        view["players"][0]["prestige"] = json!(30);
        view["militaryHorizon"] = json!(true);
        assert_eq!(
            capacity_value(&view, 0, "aegisLattice").unwrap(),
            baseline - 15.0,
            "Already reaching the target does not make tactics into immediate points"
        );
    }
    #[test]
    fn single_fleet_forecast_uses_public_tactics_and_stays_gated() {
        let mut view = json!({"seat":0,"players":[{"military":[{"key":"torpedoSpread"}]},{"military":[]}],"tacticStats":{"concentratedFire":{"attack":1,"shield":0},"defensiveScreen":{"attack":0,"shield":2},"torpedoSpread":{"attack":3,"shield":0},"aegisLattice":{"attack":0,"shield":8},"phaseLance":{"attack":2,"shield":0,"pierce":true}},"fleets":{"1,0":{"1":{"fleet":1}}},"planets":{}});
        let moving = json!({"fleet":1});
        assert!(!bot_safe_fight(&view, 0, &moving, "1,0"));
        view["singleFleetForecast"] = json!(true);
        assert!(bot_safe_fight(&view, 0, &moving, "1,0"));
        view["players"][1]["military"] = json!([{"key":"aegisLattice"}]);
        assert!(
            !bot_safe_fight(&view, 0, &moving, "1,0"),
            "Enemy public tactics change the forecast"
        );
        view["players"][1]["military"] = json!([]);
        assert!(
            !bot_safe_fight(&view, 0, &json!({"fleet":1,"explorer":1}), "1,0"),
            "Unsupported mixed forces retain their old safety check"
        );
        let hand = fleet_tactic_hand(&view, 0, &json!([]));
        let enemy = fleet_tactic_hand(&view, 1, &json!([]));
        assert_eq!(
            fleet_tactic_plan(&view, &hand, &enemy, 7, 7, 0).unwrap().0,
            1
        );
        view["combat"] = json!({"side":"attacker","volley":1,"sides":{"attacker":{"playerId":0,"pieces":[{"type":"fleet","hull":7,"damage":0}],"hand":hand,"used":[]},"defender":{"playerId":1,"pieces":[{"type":"fleet","hull":7,"damage":0}],"used":[]}}});
        let tactic = combat_fleet_tactic_plan(&view).unwrap();
        let mut bot = BuiltinAgent::new(Strategy::Market, [9; 32]);
        let legal = vec![
            json!({"type":"combat_tactic","tactic":if tactic=="defensiveScreen"{"concentratedFire"}else{"defensiveScreen"}}),
            json!({"type":"combat_tactic","tactic":tactic}),
        ];
        assert_eq!(bot.select_action(&view, &legal), 1);
        view["combat"]["sides"]["defender"]["choice"] = json!("aegisLattice");
        assert_eq!(
            bot.select_action(&view, &legal),
            1,
            "An injected secret commitment must not influence the plan"
        );
        let used = fleet_tactic_hand(&view, 0, &json!(["torpedoSpread", "concentratedFire"]));
        assert_eq!(used["torpedoSpread"], 0);
        assert_eq!(used["concentratedFire"], 1);
    }
    #[test]
    fn market_tactics_follow_public_combat_opportunities() {
        let mut market = BuiltinAgent::new(Strategy::Market, [9; 32]);
        let mut economy = BuiltinAgent::new(Strategy::Economy, [9; 32]);
        let mut view = json!({"investmentPlanning":true,"seat":0,"round":6,"phase":"buy","victoryTarget":30,"players":[{"prestige":9,"resources":{"matter":8,"energy":4,"biomass":4,"data":4},"resourceLimits":{"matter":10,"energy":10,"biomass":10,"data":10},"hand":[{"id":"c","key":"construct","starter":true,"upgraded":true,"level":2}],"handCount":1,"deckCount":9,"deckContents":[{"key":"move","count":9}],"discard":[],"inPlay":[],"military":[]},{"prestige":3},{"prestige":3},{"prestige":3}],"planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase"}},"fleets":{"0,0":{"0":{"fleet":1}},"9,0":{"1":{"fleet":1}}},"clusters":[],"market":[{"key":"aegisLattice"}],"marketCosts":[{"matter":7,"energy":2}],"cardStats":{"aegisLattice":{"shield":8}}});
        let legal = vec![
            json!({"type":"upgrade","card":"c","resource":"matter"}),
            json!({"type":"buy","source":"market","key":"aegisLattice"}),
        ];
        assert_eq!(
            economy.select_action(&view, &legal),
            1,
            "Standard profile ranking remains unchanged"
        );
        assert_eq!(
            market.select_action(&view, &legal),
            0,
            "A remote army does not justify this military purchase yet"
        );
        view["marketOpportunityFilter"] = json!(false);
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "Disabling the research filter restores the ordinary purchase ranking"
        );
        view["marketOpportunityFilter"] = Value::Null;
        view["players"][1]["hand"] = json!([{"key":"novaBarrage"}]);
        assert_eq!(
            market.select_action(&view, &legal),
            0,
            "Private enemy cards do not create a public opportunity"
        );
        view["fleets"] = json!({"0,0":{"0":{"fleet":1}},"3,0":{"1":{"fleet":1}}});
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "Three weighted steps is within the forecast"
        );
        view["fleets"] = json!({"0,0":{"0":{"fleet":1}},"4,0":{"1":{"fleet":1}}});
        assert_eq!(
            market.select_action(&view, &legal),
            0,
            "Four ordinary steps is outside it"
        );
        view["fleets"] = json!({"0,0":{"0":{"fleet":1}},"3,0":{"1":{"fleet":1}}});
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "A nearby Fleet makes preparation useful"
        );
        view["fleets"] = json!({"0,0":{"0":{"fleet":1}}});
        view["planets"]["3,0"] = json!({"owner":1,"type":"energy","upgrade":"starbase"});
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "An armed Shipyard is also a combat opportunity"
        );
        view["fleets"] = json!({"-9,0":{"0":{"fleet":1}}});
        assert_eq!(
            market.select_action(&view, &legal),
            0,
            "Two immobile Shipyards do not create a near-term battle"
        );
        view["fleets"] = json!({"-9,0":{"0":{"fleet":1}},"3,0":{"1":{"fleet":1}}});
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "A moving enemy can threaten the owned Shipyard"
        );
        view["planets"].as_object_mut().unwrap().remove("3,0");
        view["fleets"] = json!({"-9,9":{"0":{"fleet":1}},"9,-10":{"1":{"fleet":1}}});
        view["portalLinks"] = json!({"-9,10":"9,-10","9,-10":"-9,10"});
        view["portalMovementCost"] = json!(2);
        assert_eq!(
            market.select_action(&view, &legal),
            1,
            "A nearby portal makes a physically distant enemy reachable"
        );
    }
    #[test]
    fn construct_iii_draw_choice_and_equivalent_card_preference() {
        let mut view = strategic_view();
        view["constructDrawOnly"] = json!(true);
        view["players"][0]["deckCount"] = json!(1);
        view["players"][0]["discard"] = json!([]);
        view["players"][0]["hand"] = json!([
            {"id":"ii","key":"construct","starter":true,"upgraded":true,"level":2},
            {"id":"iii","key":"construct","starter":true,"upgraded":true,"level":3}
        ]);
        view["fleets"] = json!({});
        let agent = BuiltinAgent::new(Strategy::Military, [29; 32]);
        let draw = json!({"type":"construct_draw","card":"iii","key":"construct"});
        let ii =
            json!({"type":"build","card":"ii","key":"construct","kind":"settler","coord":"-1,0"});
        let iii =
            json!({"type":"build","card":"iii","key":"construct","kind":"settler","coord":"-1,0"});
        assert!(agent.score(&view, &iii) > agent.score(&view, &ii));
        assert!(agent.score(&view, &ii) > agent.score(&view, &draw));
        assert!(agent.score(&view, &draw) > agent.score(&view, &json!({"type":"pass"})));
        view["players"][0]["deckCount"] = json!(0);
        assert!(agent.score(&view, &draw) < 0.0);
        view["constructDrawOnly"] = json!(false);
        assert_eq!(agent.score(&view, &iii), agent.score(&view, &ii));
    }

    #[test]
    fn strategic_defense_targets_colonies_and_retains_a_guard() {
        let mut view = strategic_view();
        view["fleets"] = json!({"0,2":{"1":{"fleet":2}},"-2,0":{"0":{"fleet":3}}});
        let mut agent = BuiltinAgent::new(Strategy::Economy, [19; 32]);
        assert!(
            agent.score(
                &view,
                &json!({"type":"build","kind":"fleet","coord":"-1,0"})
            ) > 110.0
        );
        let reinforce = json!({"type":"move","source":"-2,0","destination":"0,0","moveGroup":"ships","units":{"fleet":3}});
        assert!(agent.score(&view, &reinforce) > 110.0);
        let unchanged = view.clone();
        let choices = [reinforce.clone(), json!({"type":"pass"})];
        assert_eq!(agent.select_action(&view, &choices), 0);
        assert_eq!(view, unchanged, "Planning never mutates the observation");
        view["fleets"].as_object_mut().unwrap().remove("0,2");
        assert_eq!(
            agent.select_action(&view, &choices),
            1,
            "A changed board gets a fresh defense plan"
        );
        view["fleets"] = json!({"0,2":{"1":{"fleet":2}},"0,0":{"0":{"fleet":3}}});
        assert!(agent.score(&view,&json!({"type":"move","source":"0,0","destination":"0,2","moveGroup":"ships","units":{"fleet":3}}))<0.0);
        view["planets"]["8,-10"] = json!({"owner":0,"hasColony":true});
        view["fleets"] = json!({"-10,8":{"1":{"fleet":2}}});
        view["portalLinks"] = json!({"-10,8":"8,-10","8,-10":"-10,8"});
        view["portalMovementCost"] = json!(2);
        assert!(
            colony_defense(&view, 0)
                .iter()
                .any(|(at, a, _)| *at == "8,-10" && *a == 2.0)
        );
    }
    #[test]
    fn strategic_card_selection_uses_draw_effects_and_cantrip_conversions() {
        let mut view = strategic_view();
        view["market"] = json!([{"key":"signalRelay"},{"key":"worldEngine"}]);
        view["marketCosts"] = json!([{"energy":2,"data":1},{"matter":8,"energy":1}]);
        view["cardStats"] = json!({"signalRelay":{"draw":2,"order":"special"},"worldEngine":{"draw":0,"order":"construct"}});
        assert!(capacity_value(&view, 0, "signalRelay") > capacity_value(&view, 0, "worldEngine"));
        view["players"][0]["hand"] =
            json!([{"id":"iii","key":"move","starter":true,"upgraded":true,"level":3}]);
        let agent = BuiltinAgent::new(Strategy::Expansion, [17; 32]);
        assert!(
            agent.score(
                &view,
                &json!({"type":"resource","card":"iii","key":"move","gain":{"energy":2}})
            ) > 70.0
        );
        view["relicRow"] =
            json!([{"id":"a","key":"warSongOfHollowStars"},{"id":"b","key":"foldedWarehouse"}]);
        view["cardStats"]["foldedWarehouse"] =
            json!({"draw":2,"limits":{"matter":1,"energy":1,"biomass":1,"data":1}});
        assert!(
            agent.score(&view, &json!({"type":"excavate","relic":"b"}))
                > agent.score(&view, &json!({"type":"excavate","relic":"a"}))
        );
    }
    #[test]
    fn in_play_cards_still_count_in_owned_deck_planning() {
        let me = json!({"hand":[],"discard":[],"deckContents":[{"key":"move","count":1}],"inPlay":[{"key":"move"},{"key":"construct"}]});
        assert_eq!(bot_cards(&me, "move"), 2.0);
        assert_eq!(bot_cards(&me, "construct"), 1.0);
    }
    #[test]
    fn explorer_follows_private_signal_without_searching_its_current_world() {
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let view = json!({"seat":0,"players":[{"resources":{},"hand":[]}],"fleets":{"5,0":{"0":{"explorer":1}}},"planets":{"5,0":{"cluster":4,"type":"data","owner":null,"special":null},"8,0":{"cluster":5,"unknown":true,"relicSignal":true}},"clusters":[{},{},{},{},{"kind":"world","center":"5,0","located":false},{"kind":"unknown","center":null,"located":true}],"relicRow":[{"key":"voidglassAstrolabe"}]});
        let moving =
            json!({"type":"move","source":"5,0","destination":"7,0","moveGroup":"explorer"});
        assert!(agent.score(&view, &moving) > 0.0);
        assert!(
            agent.score(&view, &json!({"type":"probe","coord":"5,0"}))
                > agent.score(&view, &moving)
        );
    }
    #[test]
    fn storage_forecast_allocates_independent_limits_and_protects_scoring() {
        let agent = BuiltinAgent::new(Strategy::Military, [3; 32]);
        let mut view = json!({"seat":0,"players":[{"resources":{"matter":4,"energy":3,"biomass":2,"data":4},"prestige":3,"capacity":16,"resourceLimits":{"matter":4,"energy":4,"biomass":4,"data":4},"storageUpgradeCost":{"matter":1,"energy":1,"biomass":1,"data":1}},{"prestige":3},{"prestige":3},{"prestige":3}],"fleets":{},"planets":{"2,0":{"owner":0,"occupiedBy":null,"type":"matter"},"3,0":{"owner":0,"occupiedBy":null,"type":"data"},"0,0":{"owner":0,"occupiedBy":null,"type":"matter","upgrade":"starbase"},"1,0":{"owner":0,"occupiedBy":null,"type":"data","upgrade":"harvester","upgradeLevel":1}}});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) > 100.0);
        view["players"][0]["resources"] = json!({"matter":3,"energy":3,"biomass":2,"data":2});
        view["fleets"] = json!({"1,0":{"0":{"settler":1,"explorer":1}}});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) < 0.0);
        assert_eq!(
            bot_storage_reserve(&view, 0),
            json!({"matter":2.0,"energy":2.0,"biomass":3.0,"data":3.0})
        );
        view["players"][0]["resources"] = json!({"matter":2,"energy":2,"biomass":3,"data":4});
        assert!(agent.score(&view, &json!({"type":"increase_storage","allocation":{"matter":2,"energy":0,"biomass":0,"data":2}})) > 100.0);
        let before = bot_storage_budget(&view, 0);
        view["players"][1]["hand"] = json!([{"key":"omniscientChorus"}]);
        assert_eq!(bot_storage_budget(&view, 0), before);
        view["players"][1]["prestige"] = json!(20);
        assert!(bot_storage_budget(&view, 0).is_none());
    }
    use game_core::run_match;
    #[test]
    fn public_corner_portals_change_routes_and_visible_threats() {
        let mut view = json!({"portalLinks":{"-10,8":"8,-10","8,-10":"-10,8"},"portalMovementCost":2,
            "fleets":{"-10,8":{"1":{"fleet":2}}},"planets":{}});
        assert_eq!(travel_distance(&view, "-10,8", "8,-10"), 2.0);
        assert_eq!(travel_distance(&view, "-9,8", "8,-10"), 3.0);
        assert_eq!(
            bot_threat(&view, 0, &json!({"settler":1}), "8,-10", "8,-10"),
            1.0,
            "visible enemy Fleets threaten the opposite gate"
        );
        view.as_object_mut().unwrap().remove("portalLinks");
        assert!(travel_distance(&view, "-10,8", "8,-10") > 2.0);
        assert_eq!(
            bot_threat(&view, 0, &json!({"settler":1}), "8,-10", "8,-10"),
            0.0,
            "earlier rules keep physical distance"
        );
    }
    // 33.38 #movement: a Move names its `units`; Fleets may leave a safe Settler behind.
    #[test]
    fn split_moves_leave_safe_settlers_and_keep_exposed_ones_escorted() {
        let mut agent = BuiltinAgent::new(Strategy::Military, [9; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"}],"discard":[],"deckContents":[],"handCount":1,"deckCount":0,"capacity":30},{"resources":{"energy":0}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":null,"type":"biomass","upgrade":null,"cluster":0}},
            "clusters":[{"center":"0,0"}],
            "fleets":{"0,0":{"0":{"settler":1,"explorer":0,"fleet":2}},"8,0":{"1":{"settler":0,"explorer":0,"fleet":1}}}});
        let whole = json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships","units":{"settler":1,"explorer":0,"fleet":2}});
        let split = json!({"type":"move","source":"0,0","destination":"2,0","moveGroup":"ships","units":{"settler":0,"explorer":0,"fleet":2}});
        assert!(
            agent.score(&view, &whole) < 0.0,
            "A Settler on its Colony site waits"
        );
        assert!(
            agent.score(&view, &split) > 50.0,
            "Fleets leave the safe Settler to hunt at Fleet speed"
        );
        assert_eq!(
            agent.select_action(&view, &[whole.clone(), split.clone()]),
            1
        );
        view["fleets"]["-2,0"] = json!({"1":{"settler":0,"explorer":0,"fleet":2}});
        assert!(
            agent.score(&view, &split) < 0.0,
            "Fleets do not strand a Settler an enemy Fleet could reach"
        );
        let old = json!({"type":"move","source":"0,0","destination":"2,0","moveGroup":"ships"});
        assert!(
            agent.score(&view, &old) < 0.0,
            "Without `units` (earlier rules) the whole group is scored, as before"
        );
    }
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

    /// 34.39 balance package: native rivals follow the observation's capture rule, printed
    /// Wonder Prestige and military stats, and choose an Archive Purge like browser rivals.
    #[test]
    fn balance_package_rivals_read_the_published_rules() {
        let agent = BuiltinAgent::new(Strategy::Expansion, [5; 32]);
        let mut view = json!({"seat":0,"phase":"operations","relicRow":[],
            "players":[{"resources":{"matter":5,"energy":5,"biomass":5,"data":5},"hand":[{"id":"m","key":"move"}],"discard":[],"deckContents":[],"handCount":1,"deckCount":0,"capacity":30},{"resources":{}},{"resources":{}},{"resources":{}}],
            "planets":{"0,0":{"owner":0,"type":"matter","upgrade":"starbase","cluster":0},"4,0":{"owner":1,"type":"energy","upgrade":null,"hasColony":true,"cluster":1}},
            "clusters":[{"center":"0,0","surveyed":true},{"center":"4,0","surveyed":true}],
            "fleets":{"0,0":{"0":{"settler":1,"fleet":0,"explorer":0}}}});
        let toward = json!({"type":"move","source":"0,0","destination":"1,0","moveGroup":"ships"});
        let before_rule = agent.score(&view, &toward);
        assert!(
            before_rule > 80.0,
            "Earlier rules: a lone Settler heads for the enemy center"
        );
        view["captureNeedsFleet"] = json!(true);
        assert!(
            agent.score(&view, &toward) < before_rule,
            "A lone Settler cannot capture, so the enemy center is no goal"
        );
        view["fleets"]["0,0"]["0"]["fleet"] = json!(1);
        assert!(
            agent.score(&view, &toward) > 80.0,
            "A Settler with a Fleet goes for the capture"
        );
        // Split moves (33.38): the last Fleet does not leave a Settler that can capture here.
        let mut on_center = view.clone();
        on_center["fleets"] = json!({"4,0":{"0":{"settler":1,"fleet":1,"explorer":0}},"7,0":{"2":{"settler":1,"fleet":0,"explorer":0}}});
        let away = |fleet: u32| json!({"type":"move","source":"4,0","destination":"5,0","moveGroup":"ships","units":{"settler":0,"explorer":0,"fleet":fleet}});
        assert_eq!(agent.score(&on_center, &away(1)), -10.0);
        on_center["fleets"]["4,0"]["0"]["fleet"] = json!(2);
        assert!(
            agent.score(&on_center, &away(1)) > -10.0,
            "a second Fleet may go"
        );

        // Wonders: the observation's printed Prestige replaces the 31.36 table.
        view["market"] = json!([{"key":"dysonLattice"}]);
        let table = capacity_value(&view, 0, "dysonLattice").unwrap();
        view["marketPrestige"] = json!([5]);
        assert_eq!(
            capacity_value(&view, 0, "dysonLattice").unwrap(),
            table - 5.0
        );
        // Military cards: printed stats from the observation (Boarding Marines +2).
        assert_eq!(tactic_stats(&view, "boardingMarines"), (1.0, 0.0, false));
        view["tacticStats"] = json!({"boardingMarines":{"attack":2,"shield":0,"pierce":false}});
        assert_eq!(tactic_stats(&view, "boardingMarines"), (2.0, 0.0, false));

        // Archive Purge keeps 3 Move-order and 2 Construct-order cards.
        let starter = |id: &str, key: &str| json!({"id":id,"key":key,"starter":true});
        view["players"][0]["hand"] = json!([{"id":"purge","key":"archivePurge"}]);
        view["players"][0]["discard"] = json!([
            starter("m1", "move"),
            starter("c1", "construct"),
            starter("m2", "move"),
            starter("c2", "construct")
        ]);
        view["players"][0]["deckContents"] =
            json!([{"key":"move","count":2},{"key":"construct","count":1}]);
        let me = &view["players"][0];
        assert_eq!(bot_purge_choice(me, 2), vec![json!("m1"), json!("c1")]);
        let purge = |trash: Value| json!({"type":"special","card":"purge","key":"archivePurge","trash":trash});
        assert!(
            agent.score(&view, &purge(json!(["m1", "c1"])))
                > agent.score(&view, &purge(json!(["m1", "m2"])))
        );
        view["players"][0]["deckContents"] = json!([]);
        assert!(
            agent.score(&view, &purge(json!([]))) > agent.score(&view, &purge(json!(["m1"]))),
            "With no surplus a rival trashes nothing"
        );
    }
    #[test]
    fn decommission_scores_hand_cards() {
        // #buy: a card still in hand when Buy began may be trashed, with the same priority
        // as the same card in discard.
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let mut view = strategic_view();
        let surplus = json!([{"id":"m1","key":"move","starter":true}]);
        view["players"][0]["deckContents"] = json!([{"key":"move","count":7}]);
        let trash = json!({"type":"decommission","card":"m1","resource":"matter"});
        view["players"][0]["hand"] = surplus.clone();
        let from_hand = agent.score(&view, &trash);
        view["players"][0]["hand"] = json!([]);
        view["players"][0]["discard"] = surplus;
        assert_eq!(from_hand, agent.score(&view, &trash));
    }

    #[test]
    fn exchange_cards_choose_surplus_and_use_the_published_bank_rate() {
        let mut agent = BuiltinAgent::new(Strategy::Market, [7; 32]);
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["players"][0]["resources"] = json!({"matter":1,"energy":3,"biomass":6,"data":0});
        view["cardStats"]["exchangeProtocol"] = json!({"order":"special","bankRate":2});
        let biomass = json!({"type":"special","key":"exchangeProtocol","resource":"biomass"});
        let energy = json!({"type":"special","key":"exchangeProtocol","resource":"energy"});
        assert_eq!(agent.select_action(&view, &[energy, biomass.clone()]), 1);
        view["players"][0]["bankTradeRates"] = json!({"biomass":2});
        assert!(
            agent.score(&view, &biomass) < agent.score(&view, &json!({"type":"pass"})),
            "Do not replay for an already improved give type"
        );
        assert_eq!(bank_rate(&view, 0, "energy"), 4.0);
        assert_eq!(bank_rate(&view, 0, "biomass"), 2.0);
        view["market"] = json!([{"key":"strategyCore"}]);
        view["marketCosts"] = json!([{"energy":1,"data":5}]);
        view["cardStats"]["strategyCore"] = json!({"order":"special","draw":3});
        view["players"][0]["resources"]["biomass"] = json!(3);
        view["planets"]["0,0"]["special"] = json!("relic");
        view["fleets"] = json!({"0,0":{"0":{"explorer":1}}});
        view["players"][0]["hand"] = json!([{"key":"probe","id":"probe"}]);
        let trade = json!({"type":"bank_trade","giveType":"biomass","getType":"data"});
        assert!(
            agent.score(&view, &trade) > 0.0,
            "Use a legal2:1trade below four resources"
        );
        view["players"][0]["bankTradeRates"] = json!({});
        assert!(
            agent.score(&view, &trade) < 0.0,
            "Ordinary4:1rate stays unchanged"
        );
    }

    #[test]
    fn current_card_planning_requires_a_real_exchange_and_precedes_four_to_one() {
        let mut v = strategic_view();
        v["investmentPlanning"] = json!(true);
        v["cardPurchasePlanning"] = json!(true);
        v["players"][0]["resources"] = json!({"matter":2,"energy":2,"biomass":6,"data":0});
        v["cardStats"]["exchangeProtocol"] = json!({"order":"special","bankRate":2});
        let play = json!({"type":"special","key":"exchangeProtocol","resource":"biomass"});
        let trade = json!({"type":"bank_trade","giveType":"biomass","getType":"data"});
        let mut agent = BuiltinAgent::new(Strategy::Market, [7; 32]);
        assert_eq!(
            agent.select_action(&v, &[trade.clone(), play.clone()]),
            1,
            "Enable2:1before spending4"
        );
        v["players"][0]["resources"]["biomass"] = json!(1);
        v["planets"]["1,0"] = json!({"owner":0,"type":"biomass","upgrade":"harvester"});
        assert!(
            agent.score(&v, &play) < 0.0,
            "Future production cannot fund the trade now"
        );
        v["players"][0]["resources"] = json!({"matter":12,"energy":12,"biomass":12,"data":12});
        assert!(
            agent.score(&v, &play) < 0.0,
            "No deficit means no reason to spend an order"
        );
        v["players"][0]["resources"] = json!({"matter":2,"energy":6,"biomass":6,"data":0});
        v["players"][0]["bankTradeRates"] = json!({"energy":2});
        assert!(
            agent.score(&v, &play) < 0.0,
            "Use an existing useful discount before another card"
        );
    }

    #[test]
    fn goal_trades_require_a_complete_useful_payment_and_keep_ready_scoring() {
        let mut v = strategic_view();
        v["goalDirectedTrading"] = json!(true);
        v["cardPurchasePlanning"] = json!(true);
        v["investmentPlanning"] = json!(true);
        v["phase"] = json!("operations");
        v["players"][0]["resourceLimits"] = json!({"matter":12,"energy":12,"biomass":12,"data":12});
        v["players"][0]["resources"] = json!({"matter":2,"energy":2,"biomass":8,"data":0});
        v["players"][0]["hand"] = json!([{"key":"exchangeProtocol","id":"exchange"}]);
        v["cardStats"]["exchangeProtocol"] = json!({"bankRate":2});
        let activate = json!({"type":"special","key":"exchangeProtocol","resource":"biomass"});
        let trade = json!({"type":"bank_trade","giveType":"biomass","getType":"data"});
        let mut agent = BuiltinAgent::new(Strategy::Market, [7; 32]);
        v["tradeGoals"] = json!([]);
        assert!(
            agent.score(&v, &activate) < 0.0,
            "Reserve shortage alone cannot spend an exchange order"
        );
        assert!(
            agent.score(&v, &trade) < 0.0,
            "Nor cause a speculative bank trade"
        );
        v["tradeGoals"] =
            json!([{"kind":"excavate","cost":{"matter":1,"energy":1,"data":2},"priority":145}]);
        assert_eq!(
            agent.select_action(&v, &[trade.clone(), activate.clone()]),
            1,
            "Improve the rate before paying four"
        );
        let plan = goal_trade_plan(&v, 0);
        assert_eq!(
            plan["steps"].as_array().unwrap().len(),
            2,
            "Fund the full payment,not merely the first deficit"
        );
        v["players"][0]["resources"]["biomass"] = json!(2);
        assert!(
            goal_trade_plan(&v, 0).is_null(),
            "Do not trade when the rest of the payment remains unfunded"
        );
        v["players"][0]["resources"]["biomass"] = json!(8);
        v["players"][0]["resources"]["data"] = json!(2);
        assert!(
            agent.score(&v, &activate) < 0.0,
            "The goal is already affordable"
        );
        v["players"][0]["resources"]["data"] = json!(0);
        v["players"][0]["bankTradeRates"] = json!({"biomass":2});
        assert!(
            goal_trade_plan(&v, 0)["enable"].is_null(),
            "Use an existing useful rate"
        );
        assert!(agent.score(&v, &trade) > 0.0);
        v["tradeGoals"]
            .as_array_mut()
            .unwrap()
            .push(json!({"kind":"colonize","cost":{"biomass":2},"priority":150}));
        assert!(
            agent.score(&v, &trade) < 0.0,
            "Take the ready higher-priority Colony instead of funding an alternative"
        );
        v["tradeGoals"] = json!([{"kind":"excavate","cost":{"data":13},"priority":145}]);
        assert!(
            goal_trade_plan(&v, 0).is_null(),
            "Never fund a goal above current limits"
        );
        v["market"] = json!([{"key":"strategyCore"}]);
        v["marketCosts"] = json!([{"energy":2,"data":1}]);
        v["cardStats"]["strategyCore"] = json!({"order":"special","draw":3});
        v["tradeGoals"] = json!([{"kind":"market","key":"strategyCore","cost":{"energy":2,"data":1},"priority":80}]);
        assert!(
            goal_trade_plan(&v, 0).is_object(),
            "A worthwhile available purchase is a concrete goal"
        );
        v["excludedMarketCards"] = json!(["strategyCore"]);
        assert!(
            goal_trade_plan(&v, 0).is_null(),
            "Research purchase bans also remove funding goals"
        );
    }

    #[test]
    fn current_buying_reads_free_builds_coupons_and_acquisition_delay() {
        let mut v = strategic_view();
        v["investmentPlanning"] = json!(true);
        v["cardPurchasePlanning"] = json!(true);
        v["cardStats"]["worldEngine"] =
            json!({"order":"construct","draw":1,"buildDiscount":"free"});
        let free = capacity_value(&v, 0, "worldEngine").unwrap();
        v["cardStats"]["worldEngine"]["buildDiscount"] = Value::Null;
        assert!(
            free > capacity_value(&v, 0, "worldEngine").unwrap() + 10.0,
            "Printed free builds have real future savings"
        );
        v["cardStats"]["signalRelay"] = json!({"order":"special","draw":2});
        let soon = capacity_value(&v, 0, "signalRelay").unwrap();
        v["players"][0]["deckCount"] = json!(30);
        assert!(
            soon > capacity_value(&v, 0, "signalRelay").unwrap(),
            "A new card waits in discard"
        );
    }

    #[test]
    fn omitted_card_is_excluded_from_purchase_value_and_saving_targets() {
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["market"] = json!([{"key":"signalRelay"}]);
        view["marketCosts"] = json!([{"energy":2,"data":1}]);
        view["cardStats"]["signalRelay"] = json!({"order":"special","draw":2});
        assert!(capacity_value(&view, 0, "signalRelay").is_some());
        assert!(market_target_cost(&view, 0).is_some());
        view["excludedMarketCards"] = json!(["signalRelay"]);
        assert!(capacity_value(&view, 0, "signalRelay").is_none());
        assert!(market_target_cost(&view, 0).is_none());
        let agent = BuiltinAgent::new(Strategy::Market, [7; 32]);
        assert!(
            agent.score(
                &view,
                &json!({"type":"buy","source":"catalog","key":"signalRelay"})
            ) < 0.0
        );
        assert!(
            capacity_value(&view, 0, "exchangeProtocol").is_some(),
            "Other designs retain their normal valuation"
        );
    }

    #[test]
    fn settler_discipline_replaces_units_but_rejects_paid_surplus() {
        let mut agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["shipCosts"] = json!({"settler":{"matter":1,"energy":1,"biomass":1}});
        view["fleets"] = json!({"0,0":{"0":{"settler":1,"fleet":1,"explorer":0}}});
        let build = json!({"type":"build","kind":"settler","coord":"0,0"});
        let pass = json!({"type":"pass"});
        assert_eq!(agent.score(&view, &build), 5.0);
        view["settlerInvestmentDiscipline"] = json!(true);
        assert_eq!(agent.select_action(&view, &[build.clone(), pass]), 1);
        let mut free = build.clone();
        free["discountResource"] = json!("free");
        assert_eq!(agent.score(&view, &free), 5.0);
        free["discountResource"] = json!("each");
        assert_eq!(agent.score(&view, &free), 5.0);
        free["type"] = json!("second_build");
        assert_eq!(
            agent.score(&view, &free),
            -1.0,
            "Second build pays its cost"
        );
        free = build.clone();
        free["discountResource"] = json!("matter");
        assert_eq!(
            agent.score(&view, &free),
            -1.0,
            "Partial discounts still cost resources"
        );
        view["fleets"]["0,0"]["0"]["settler"] = json!(0);
        assert_eq!(agent.score(&view, &build), 86.0, "Replace consumed Settler");
        view["fleets"]["0,0"]["0"]["settler"] = json!(1);
        agent = BuiltinAgent::new(Strategy::Expansion, [17; 32]);
        assert_eq!(agent.score(&view, &build), 86.0, "Expansion keeps two");
        view["fleets"]["0,0"]["0"]["settler"] = json!(2);
        assert_eq!(agent.score(&view, &build), -1.0);
        view["shipCosts"] = json!(null);
        assert_eq!(
            agent.score(&view, &build),
            5.0,
            "Missing metadata preserves prior choice"
        );
        view["shipCosts"] = json!({"settler":{"matter":-1}});
        assert_eq!(
            agent.score(&view, &build),
            5.0,
            "Malformed metadata preserves prior choice"
        );
        view["investmentPlanning"] = json!(false);
        assert_eq!(agent.score(&view, &build), 5.0);
    }

    #[test]
    fn optional_construction_can_finish_instead_of_paying_for_rejected_builds() {
        let mut agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["productionDiscipline"] = json!(true);
        view["round"] = json!(18);
        view["players"][0]["prestige"] = json!(40);
        view["planets"]["1,0"] = json!({"type":"biomass","owner":0});
        let finish = json!({"type":"finish_construct"});
        let paid = json!({"type":"second_build","kind":"harvester","coord":"1,0"});
        let original = agent.score(&view, &paid);
        assert!(original < 0.0);
        assert!(
            agent.score(&view, &finish) < original,
            "Existing pending choice still buys the rejected Harvester"
        );
        view["optionalConstructionPlanning"] = json!(true);
        assert_eq!(
            agent.select_action(&view, &[paid.clone(), finish.clone()]),
            1
        );
        assert_eq!(
            agent.score(&view, &paid),
            original,
            "Only the finish alternative changes"
        );
        let yard = json!({"type":"second_build","kind":"starbase","coord":"1,0"});
        view["planets"]["0,0"]["upgrade"] = json!("starbase");
        assert_eq!(agent.select_action(&view, &[yard, finish.clone()]), 1);
        let free =
            json!({"type":"build","kind":"harvester","coord":"1,0","discountResource":"free"});
        assert!(agent.score(&view, &free) > agent.score(&view, &finish));
        view["round"] = json!(2);
        view["players"][0]["prestige"] = json!(3);
        assert_eq!(
            agent.select_action(&view, &[finish.clone(), paid]),
            1,
            "Profitable construction still wins"
        );
        view["investmentPlanning"] = json!(false);
        assert_eq!(
            agent.score(&view, &finish),
            -20.0,
            "Archived policy stays unchanged"
        );
    }

    #[test]
    fn harvester_headroom_waits_for_delayed_returns_but_keeps_useful_and_free_builds() {
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["productionDiscipline"] = json!(true);
        view["harvesterCost"] = json!({"matter":1,"energy":1,"data":1});
        view["harvesterYield"] = json!(2);
        view["round"] = json!(15);
        view["players"][0]["prestige"] = json!(32);
        view["players"][0]["resources"]["biomass"] = json!(4);
        view["players"][0]["resourceLimits"]["biomass"] = json!(4);
        view["planets"]["1,0"] = json!({"type":"biomass","owner":0});
        view["planets"]["2,0"] = json!({"type":"biomass","owner":0});
        let paid = json!({"type":"build","kind":"harvester","coord":"1,0"});
        let original = agent.score(&view, &paid);
        assert!(original > 0.0);
        view["harvesterHeadroomPlanning"] = json!(true);
        assert!(agent.score(&view, &paid) < agent.score(&view, &json!({"type":"pass"})));
        view["players"][0]["resources"]["biomass"] = json!(0);
        assert_eq!(
            agent.score(&view, &paid),
            original,
            "Room keeps the normal payback"
        );
        view["players"][0]["resources"]["biomass"] = json!(4);
        view["players"][0]["prestige"] = json!(3);
        assert!(
            agent.score(&view, &paid) > 0.0,
            "A longer race can justify full-stock investment"
        );
        view["players"][0]["prestige"] = json!(39);
        let free =
            json!({"type":"build","kind":"harvester","coord":"1,0","discountResource":"free"});
        let each =
            json!({"type":"build","kind":"harvester","coord":"1,0","discountResource":"each"});
        assert!(agent.score(&view, &free) > 0.0);
        assert!(agent.score(&view, &each) > 0.0);
        view["harvesterCost"]["matter"] = json!(2);
        assert!(
            agent.score(&view, &each) < 0.0,
            "Partial discount is still paid"
        );
        let second = json!({"type":"second_build","kind":"harvester","coord":"1,0","discountResource":"free"});
        assert!(
            agent.score(&view, &second) < 0.0,
            "Second builds do not inherit the first discount"
        );
        view["players"][0]["prestige"] = json!(32);
        view["harvesterCost"] = json!({});
        assert_eq!(
            agent.score(&view, &paid),
            original,
            "Empty cost metadata preserves old scores"
        );
        view.as_object_mut().unwrap().remove("harvesterCost");
        assert_eq!(
            agent.score(&view, &paid),
            original,
            "Missing metadata preserves old scores"
        );
        view["investmentPlanning"] = json!(false);
        let archived = agent.score(&view, &paid);
        view["harvesterHeadroomPlanning"] = json!(false);
        assert_eq!(agent.score(&view, &paid), archived);

        let mut room = strategic_view();
        room["investmentPlanning"] = json!(true);
        room["productionDiscipline"] = json!(true);
        room["harvesterHeadroomPlanning"] = json!(true);
        room["harvesterCost"] = json!({"matter":1,"energy":1,"data":1});
        room["harvesterYield"] = json!(2);
        room["round"] = json!(17);
        room["players"][0]["prestige"] = json!(34);
        room["players"][0]["resources"]["matter"] = json!(4);
        room["players"][0]["resourceLimits"]["matter"] = json!(4);
        room["planets"] = json!({"0,0":{"type":"matter","owner":null}});
        assert!(
            agent.score(
                &room,
                &json!({"type":"build","kind":"harvester","coord":"0,0"})
            ) > 0.0,
            "Construction payment frees room"
        );
        room["round"] = json!(1);
        room["players"][0]["prestige"] = json!(3);
        room["players"][0]["resources"]["data"] = json!(1);
        room["planets"] = json!({"0,0":{"type":"data","owner":null}});
        assert_eq!(
            agent.score(
                &room,
                &json!({"type":"build","kind":"harvester","coord":"0,0"})
            ),
            53.0,
            "Keep initial Data bootstrap"
        );
    }

    #[test]
    fn colony_execution_prefers_printed_terms_without_changing_purchase_values() {
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["colonyExecutionPlanning"] = json!(true);
        view["planets"]["1,0"] = json!({"owner":null});
        view["cardStats"] = json!({
            "colonize":{"order":"colonize","colonyCost":2},
            "seedArk":{"order":"colonize","colonyCost":1},
            "colonyPods":{"order":"colonize","colonyCost":1,"keepSettler":true},
            "genesisCharter":{"order":"colonize","colonyCost":0,"keepSettler":true,"colonyPrestige":2}
        });
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let order = |key| json!({"type":"colonize","key":key,"coord":"1,0"});
        assert!(agent.score(&view, &order("seedArk")) > agent.score(&view, &order("colonize")));
        assert!(agent.score(&view, &order("colonyPods")) > agent.score(&view, &order("seedArk")));
        assert!(
            agent.score(&view, &order("genesisCharter")) > agent.score(&view, &order("colonyPods"))
        );
        let purchase = capacity_value(&view, 0, "seedArk");
        view["colonyExecutionPlanning"] = json!(false);
        assert_eq!(
            purchase,
            capacity_value(&view, 0, "seedArk"),
            "Execution does not change valuation"
        );
        assert_eq!(agent.score(&view, &order("seedArk")), 160.0);
        view["colonyExecutionPlanning"] = json!(true);
        view["planets"]["1,0"]["owner"] = json!(1);
        assert_eq!(
            agent.score(&view, &order("seedArk")),
            agent.score(&view, &order("colonize"))
        );
        view["investmentPlanning"] = json!(false);
        assert_eq!(agent.score(&view, &order("genesisCharter")), 160.0);
    }

    #[test]
    fn optional_fleet_discipline_keeps_defense_military_and_free_builds() {
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["fleetInvestmentDiscipline"] = json!(true);
        view["fleets"] = json!({"-1,0":{"0":{"fleet":5}}});
        let paid = json!({"type":"build","kind":"fleet","coord":"-1,0"});
        let free = json!({"type":"build","kind":"fleet","coord":"-1,0","discountResource":"free"});
        let discounted =
            json!({"type":"build","kind":"fleet","coord":"-1,0","discountResource":"each"});
        for strategy in [Strategy::Economy, Strategy::Expansion, Strategy::Military] {
            let agent = BuiltinAgent::new(strategy, [17; 32]);
            assert!(agent.score(&view, &paid) < agent.score(&view, &json!({"type":"pass"})));
            assert!(
                agent.score(&view, &discounted) < 0.0,
                "Fleet each-discount still costs Matter"
            );
            assert!(agent.score(&view, &free) > 0.0);
            view["fleetInvestmentDiscipline"] = json!(false);
            assert_eq!(agent.score(&view, &paid), 8.0);
            view["fleetInvestmentDiscipline"] = json!(true);
            view["investmentPlanning"] = json!(false);
            assert_eq!(agent.score(&view, &paid), 8.0);
            view["investmentPlanning"] = json!(true);
        }
        let military = BuiltinAgent::new(Strategy::Military, [17; 32]);
        view["fleets"] = json!({"-1,0":{"0":{"fleet":4}}});
        assert_eq!(military.score(&view, &paid), 81.0);
        let economy = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        view["fleets"] = json!({"8,0":{"1":{"fleet":1}}});
        assert_eq!(
            economy.score(&view, &paid),
            80.0,
            "Keep ordinary defensive coverage"
        );
        view["fleets"] = json!({"1,0":{"1":{"fleet":2}}});
        assert!(
            economy.score(&view, &paid) > 110.0,
            "Keep urgent Colony defense"
        );
    }

    #[test]
    fn investment_trimming_preserves_named_orders() {
        let agent = BuiltinAgent::new(Strategy::Economy, [17; 32]);
        let mut view = strategic_view();
        view["investmentPlanning"] = json!(true);
        view["players"][0]["resources"] = json!({"matter":30,"energy":30,"biomass":30,"data":30});
        view["players"][0]["deckContents"] = json!([
            {"key":"construct","count":4}, {"key":"move","count":8},
            {"key":"colonize","count":5}
        ]);
        for key in [
            "worldEngine",
            "prefabYards",
            "stellarCrucible",
            "horizonSail",
            "evergreenArk",
        ] {
            view["players"][0]["hand"] = json!([{"id":"held","key":key,"upgraded":false}]);
            let trash = json!({"type":"decommission","card":"held","resource":"matter"});
            assert!(agent.score(&view, &trash) < 0.0, "Keep named order {key}");
            view["investmentPlanning"] = json!(false);
            assert!(
                agent.score(&view, &trash) > 0.0,
                "Historical trimming is preserved"
            );
            view["investmentPlanning"] = json!(true);
        }
        view["players"][0]["hand"] = json!([{"id":"held","key":"construct","starter":true}]);
        assert!(
            agent.score(
                &view,
                &json!({"type":"decommission","card":"held","resource":"matter"})
            ) > 0.0
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
            "galactic-reach/22.27",
            "galactic-reach/23.28",
            "galactic-reach/24.29",
            "galactic-reach/25.30",
            "galactic-reach/26.31",
            "galactic-reach/27.32",
            "galactic-reach/28.33",
            "galactic-reach/29.34",
            "galactic-reach/30.35",
            "galactic-reach/31.36",
            "galactic-reach/32.37",
            "galactic-reach/33.38",
            "galactic-reach/34.39",
            "galactic-reach/35.40",
            "galactic-reach/36.41",
            "galactic-reach/37.42",
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
                            | "galactic-reach/22.27"
                            | "galactic-reach/23.28"
                            | "galactic-reach/24.29"
                            | "galactic-reach/25.30"
                            | "galactic-reach/26.31"
                            | "galactic-reach/27.32"
                            | "galactic-reach/28.33"
                            | "galactic-reach/29.34"
                            | "galactic-reach/30.35"
                            | "galactic-reach/31.36"
                            | "galactic-reach/32.37"
                            | "galactic-reach/33.38"
                            | "galactic-reach/34.39"
                            | "galactic-reach/35.40"
                            | "galactic-reach/36.41"
                            | "galactic-reach/37.42"
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
            "gr-military/19",
            "gr-military/20",
            "gr-military/21",
            "gr-military/22",
            "gr-military/23",
            "gr-military/24",
            "gr-military/25",
            "gr-military/26",
            "gr-military/27",
            "gr-military/28",
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
        // Rules #market-tiers: nine public cards, three per price row, and no market deck order.
        assert_eq!(before["market"].as_array().unwrap().len(), 9);
        assert_eq!(before["marketCosts"].as_array().unwrap().len(), 9);
        assert!(before.get("marketDecks").is_none());
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
        assert!(g.legal_actions(1).iter().all(|a| matches!(
            a["type"].as_str(),
            Some("resource" | "bank_trade" | "increase_storage")
        )));
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
    // 31.36 (#rival-cards): the reference rivals that run shared tables buy the new
    // cards, raise their limits toward them, play them and use military tactics.
    #[test]
    fn reference_policies_buy_and_play_capacity_cards() {
        let mut game = GalacticReach::new([8; 32]).unwrap();
        let mut agents: Vec<BuiltinAgent> = [
            Strategy::Military,
            Strategy::Economy,
            Strategy::Expansion,
            Strategy::Military,
        ]
        .into_iter()
        .enumerate()
        .map(|(i, s)| BuiltinAgent::new(s, [i as u8; 32]))
        .collect();
        let (mut bought, mut storage, mut played, mut tactics, mut modules) = (0, 0, 0, 0, 0);
        for _ in 0..12000 {
            let Some(seat) = game.active_seat() else {
                break;
            };
            let view = game.observe(seat).unwrap();
            let legal = game.legal_actions(seat);
            let action = legal[agents[seat].select_action(&view, &legal)].clone();
            let key = action["key"].as_str().unwrap_or("");
            match action["type"].as_str().unwrap_or("") {
                "buy" if capacity_card(key).is_some() => bought += 1,
                "increase_storage" => storage += 1,
                "buy" if action["source"] == "capacity" => storage += 1,
                "special" if key == "capacityModule" => modules += 1,
                "special" | "move" | "build" | "colonize" if capacity_card(key).is_some() => {
                    played += 1
                }
                "combat_tactic" if CAPACITY_TACTICS.iter().any(|t| action["tactic"] == t.0) => {
                    tactics += 1
                }
                _ => {}
            }
            game.apply_action(seat, action).unwrap();
        }
        eprintln!(
            "capacity cards: bought {bought}, capacity {storage}, modules played {modules}, played {played}, military tactics {tactics}"
        );
        assert!(game.scores().is_some(), "the 40-point match finishes");
        assert!(bought >= 4, "rivals buy new market cards ({bought})");
        assert!(storage > 0, "rivals buy Capacity Modules ({storage})");
        assert!(
            modules > 0 && modules <= storage,
            "Purchased modules are played ({modules}/{storage})"
        );
        let observed = game.observe(0).unwrap();
        let stored: usize = observed["players"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["storage"].as_array().map_or(0, Vec::len))
            .sum();
        assert_eq!(
            stored, modules,
            "Every played module remains in its permanent pile"
        );
        assert!(played >= 2, "rivals play new cards ({played})");
    }
    /// A shared table resumes from its snapshot text exactly: every revision in
    /// SHARED_RULES boots, and a resumed engine re-snapshots byte for byte (object
    /// key order included, which the rules depend on) and plays on identically.
    #[test]
    fn shared_tables_resume_exactly_on_every_shared_revision() {
        use std::cell::RefCell;
        use std::rc::Rc;
        for rules in SHARED_RULES {
            let log: Rc<RefCell<Vec<Vec<usize>>>> = Rc::default();
            let mut rng = StdRng::from_seed([9; 32]);
            let record = log.clone();
            let seats: [(String, bool); 4] = std::array::from_fn(|i| (format!("P{i}"), i < 2));
            let mut game = GalacticReach::shared(rules, &seats, 20, move |n, _| {
                let mut order: Vec<usize> = (0..n).collect();
                rand::seq::SliceRandom::shuffle(order.as_mut_slice(), &mut rng);
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
            let used = log.borrow().len();
            let replay = log.clone();
            let mut next = used;
            let mut resumed =
                GalacticReach::shared_on(rules, &seats, 20, Some(&text), move |n, _| {
                    let order = replay.borrow()[next].clone();
                    assert_eq!(order.len(), n);
                    next += 1;
                    order
                })
                .unwrap();
            assert_eq!(
                resumed.snapshot().unwrap(),
                text,
                "{rules}: resumed snapshot is identical"
            );
            for _ in 0..150 {
                let action = step(&mut game);
                let seat = resumed.active_seat().unwrap();
                resumed.apply_action(seat, action).unwrap();
            }
            assert_eq!(
                resumed.snapshot().unwrap(),
                game.snapshot().unwrap(),
                "{rules}: plays on identically"
            );
        }
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
        game.deadline.set(Instant::now());
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
