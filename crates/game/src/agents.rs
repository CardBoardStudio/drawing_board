//! Voidwright adapter and versioned, observation-only reference policies.
use crate::*;
use game_core::{GameAdapter, PlayerAgent};

impl GameAdapter for Game {
    type Observation = GameView;
    type Action = Command;
    fn rules_version(&self) -> &str {
        &self.rules_version
    }
    fn active_seat(&self) -> Option<usize> {
        (self.status == Status::Active).then_some(self.active)
    }
    fn observe(&self, seat: usize) -> Option<GameView> {
        self.players.get(seat).and_then(|p| self.view(&p.id))
    }
    fn legal_actions(&self, seat: usize) -> Vec<Command> {
        if self.active_seat() != Some(seat) {
            return vec![];
        }
        let mut candidates = vec![Command::EndTurn];
        // Do not offer no-op resource plays: a policy could otherwise stall forever.
        if self.players[seat].hand.iter().any(|c| c.credits() > 0) {
            candidates.push(Command::PlayResources);
        }
        candidates.extend((0..self.players[seat].hand.len()).map(|index| Command::Play { index }));
        candidates.extend(Card::ALL.map(|card| Command::Buy { card }));
        candidates
            .into_iter()
            .filter(|c| {
                self.clone()
                    .apply(&self.players[seat].id, c.clone())
                    .is_ok()
            })
            .collect()
    }
    fn apply_action(&mut self, seat: usize, action: Command) -> Result<(), String> {
        let actor = self.players.get(seat).ok_or("Unknown seat.")?.id.clone();
        self.apply(&actor, action)
    }
    fn scores(&self) -> Option<Vec<f64>> {
        (self.status == Status::Finished)
            .then(|| self.players.iter().map(|p| f64::from(p.score())).collect())
    }
}

impl Game {
    /// Practice uses the same observation-only policy contract as arena matches.
    pub fn agent_command(&self, strategy: Strategy) -> Option<Command> {
        if self.status != Status::Active || !self.players[self.active].bot {
            return None;
        }
        let mut seed = self.seed;
        for (i, b) in self.revision.to_le_bytes().iter().enumerate() {
            seed[i] ^= b;
        }
        let mut agent = BuiltinAgent::new(strategy, seed);
        let legal = self.legal_actions(self.active);
        let index = agent.select_action(&self.observe(self.active)?, &legal);
        legal.get(index).cloned()
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Explorer,
    Merchant,
    Kepler,
}
impl Strategy {
    pub fn version(self) -> &'static str {
        match self {
            Self::Explorer => "explorer/1",
            Self::Merchant => "merchant/1",
            Self::Kepler => "kepler/1",
        }
    }
}

pub struct BuiltinAgent {
    strategy: Strategy,
    rng: ChaCha20Rng,
}
impl BuiltinAgent {
    pub fn new(strategy: Strategy, seed: [u8; 32]) -> Self {
        Self {
            strategy,
            rng: ChaCha20Rng::from_seed(seed),
        }
    }
}
impl PlayerAgent<Game> for BuiltinAgent {
    fn policy_version(&self) -> &str {
        self.strategy.version()
    }
    fn select_action(&mut self, view: &GameView, legal: &[Command]) -> usize {
        let find = |action: &Command| legal.iter().position(|c| c == action);
        // All profiles play their available engine before choosing acquisitions.
        for card in [
            Card::Relay,
            Card::Laboratory,
            Card::Exchange,
            Card::Scout,
            Card::Salvager,
            Card::Freighter,
        ] {
            if let Some(index) = view.hand.iter().position(|c| *c == card)
                && let Some(i) = find(&Command::Play { index })
            {
                return i;
            }
        }
        if let Some(i) = find(&Command::PlayResources) {
            return i;
        }
        let order = match self.strategy {
            Strategy::Explorer => {
                // Includes passing: an intentionally exploratory baseline, not a claimed Elo tier.
                let choices: Vec<_> = legal
                    .iter()
                    .enumerate()
                    .filter(|(_, c)| matches!(c, Command::Buy { .. } | Command::EndTurn))
                    .map(|(i, _)| i)
                    .collect();
                return *choices.choose(&mut self.rng).unwrap_or(&0);
            }
            Strategy::Merchant => vec![Card::Metropolis, Card::Fusion, Card::Colony, Card::Reactor],
            Strategy::Kepler => vec![
                Card::Metropolis,
                Card::Fusion,
                Card::Laboratory,
                Card::Colony,
                Card::Freighter,
                Card::Reactor,
                Card::Relay,
                Card::Scout,
            ],
        };
        for card in order {
            if card.info().kind == Kind::Action
                && view.collection.get(&card).copied().unwrap_or(0) >= 2
            {
                continue;
            }
            if let Some(i) = find(&Command::Buy { card }) {
                return i;
            }
        }
        find(&Command::EndTurn).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_core::run_match;
    fn match_game() -> Game {
        let mut g = Game::new(
            "test".into(),
            "Arena".into(),
            "a".into(),
            "A".into(),
            [9; 32],
            20,
        )
        .unwrap();
        g.join("b".into(), "B".into(), true).unwrap();
        g.apply("a", Command::Start).unwrap();
        g
    }
    #[test]
    fn policies_finish_deterministic_matches_without_secret_observations() {
        for strategy in [Strategy::Explorer, Strategy::Merchant, Strategy::Kepler] {
            let play = || {
                let mut g = match_game();
                let mut agents: Vec<Box<dyn PlayerAgent<Game>>> = vec![
                    Box::new(BuiltinAgent::new(strategy, [1; 32])),
                    Box::new(BuiltinAgent::new(Strategy::Kepler, [2; 32])),
                ];
                let result = run_match(&mut g, &mut agents, 10000).unwrap();
                assert_eq!(g.status, Status::Finished);
                result
            };
            assert_eq!(play(), play());
        }
        let mut g = match_game();
        let before = g.clone();
        assert!(!g.legal_actions(0).is_empty());
        assert!(g.legal_actions(1).is_empty());
        assert_eq!(g, before);
        let observation = serde_json::to_string(&g.observe(0).unwrap()).unwrap();
        assert!(!observation.contains("seed"));
        assert!(!observation.contains("shuffles"));
        let mut agents: Vec<Box<dyn PlayerAgent<Game>>> =
            vec![Box::new(BuiltinAgent::new(Strategy::Kepler, [1; 32]))];
        assert!(run_match(&mut g, &mut agents, 0).is_err());
    }
    #[test]
    fn invalid_agent_cannot_mutate_game() {
        struct Invalid;
        impl PlayerAgent<Game> for Invalid {
            fn policy_version(&self) -> &str {
                "invalid/1"
            }
            fn select_action(&mut self, _: &GameView, _: &[Command]) -> usize {
                usize::MAX
            }
        }
        let mut g = match_game();
        let before = g.clone();
        assert!(run_match(&mut g, &mut [Box::new(Invalid)], 10).is_err());
        assert_eq!(g, before);
    }
}
