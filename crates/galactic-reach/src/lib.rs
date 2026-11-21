//! Heirs Ad Astra's existing JavaScript rules behind the shared Rust game contract.
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
pub const SHARED_RULES: [&str; 10] = [
    RULES,
    "galactic-reach/34.39",
    "galactic-reach/35.40",
    "galactic-reach/36.41",
    "galactic-reach/37.42",
    "galactic-reach/38.43",
    "galactic-reach/33.38",
    "galactic-reach/32.37",
    "galactic-reach/31.36",
    "galactic-reach/30.35",
];
/// The [`SHARED_RULES`] entry for `rules`, if a shared table can play it.
pub fn shared_rules(rules: &str) -> Option<&'static str> {
    SHARED_RULES.iter().find(|r| **r == rules).copied()
}
pub const RULES: &str = "galactic-reach/39.44";
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
pub const EXPERIMENT: &str = "Playtest 2026-11-16";
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
pub const SIMULATION_TIMEOUT: &str = "Heirs Ad Astra simulation exceeded its time limit.";
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
    browser_profiles: [Option<BrowserProfile>; 4],
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
            "galactic-reach/38.43" => "galactic-reach/38.43",

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
            "globalThis.game = createGalacticReach({headless: true, browserPolicy: true, random: gameRandom});",
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
                "globalThis.game = createGalacticReach({{headless: true, browserPolicy: true, shuffle: authorityShuffle, names: {}, controllers: {}, victoryTarget: {}, resume: {}}});",
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
                        "galactic-reach/38.43" => include_str!("../rules/v38-adapter.js"),
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
                        "galactic-reach/38.43" => include_str!("../rules/v38-app.js"),
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
                    format!("Heirs Ad Astra initialization failed: {e}"),
                )
            })?;
        let snapshot = Self::read_snapshot(&context, deadline.get())?;
        Ok(Self {
            context,
            deadline,
            snapshot,
            rules,
            trace: None,
            browser_profiles: [None; 4],
        })
    }
    /// Register browser-controlled seats. Human seats retain ordinary legal commands.
    pub fn set_browser_profiles(
        &mut self,
        profiles: [Option<BrowserProfile>; 4],
    ) -> Result<(), String> {
        if profiles.iter().any(Option::is_some)
            && self.eval_json("JSON.stringify(typeof game.browserStep === 'function')")?
                != json!(true)
        {
            return Err("This archived engine cannot run browser policy commands.".into());
        }
        self.browser_profiles = profiles;
        Ok(())
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
                execution_error(deadline, format!("Heirs Ad Astra execution failed: {e}"))
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
        if self.active_seat() == Some(seat)
            && let Some(Some(profile)) = self.browser_profiles.get(seat)
        {
            return vec![json!({"type":"browser_policy", "profile":profile.name()})];
        }
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
        let script = if action["type"] == "browser_policy" {
            let profile = self.browser_profiles[seat].ok_or("No browser policy registered.")?;
            format!("game.browserStep({seat}, {});", json!(profile.name()))
        } else {
            format!("game.applyAction({seat}, {});", action)
        };
        self.context
            .with(|ctx| ctx.eval::<(), _>(script))
            .map_err(|e| execution_error(deadline, format!("Heirs Ad Astra action failed: {e}")))?;
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

// Historical policies stay available only for previously dealt tables and replays.
mod archived_rust;
#[cfg(feature = "archived-rust-bots")]
pub use archived_rust::BuiltinAgent;
pub use archived_rust::Strategy;
mod browser_policy;
pub use browser_policy::{BrowserAgent, BrowserProfile};
/// Create a current browser-policy agent. Retired native IDs are refused.
pub fn agent(
    version: &str,
    _seed: [u8; 32],
) -> Result<Box<dyn PlayerAgent<GalacticReach>>, String> {
    if let Some(profile) = BrowserProfile::parse(version) {
        return Ok(Box::new(BrowserAgent(profile)));
    }
    Err("Rust bots are archived; new games require a browser policy.".into())
}
/// Resolve an old recorded policy only when restoring a table or historical replay.
pub fn historical_agent(
    version: &str,
    seed: [u8; 32],
) -> Result<Box<dyn PlayerAgent<GalacticReach>>, String> {
    archived_rust::agent(version, seed)
}
