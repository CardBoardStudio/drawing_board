//! Shared contract for authoritative games and player policies. No HTTP or storage.
use serde::{Deserialize, Serialize};

/// A game owns secrets, validates actions, and exposes only a player's observation.
/// Seat indices remain stable for a match. Larger terminal scores rank higher.
pub trait GameAdapter {
    type Observation;
    type Action: Clone + PartialEq;
    fn rules_version(&self) -> &str;
    fn active_seat(&self) -> Option<usize>;
    fn observe(&self, seat: usize) -> Option<Self::Observation>;
    fn legal_actions(&self, seat: usize) -> Vec<Self::Action>;
    fn apply_action(&mut self, seat: usize, action: Self::Action) -> Result<(), String>;
    fn scores(&self) -> Option<Vec<f64>>;
}

/// Policies receive no authoritative state, hidden decks, or shuffle seed.
/// The result is an index into the server-provided legal action list.
/// Implementations must return promptly; untrusted policies need process isolation.
pub trait PlayerAgent<G: GameAdapter> {
    fn policy_version(&self) -> &str;
    fn select_action(&mut self, observation: &G::Observation, legal: &[G::Action]) -> usize;
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MatchResult {
    pub rules_version: String,
    pub policies: Vec<String>,
    pub scores: Vec<f64>,
    pub decisions: usize,
}

/// Bounded runner shared by all adapters. Invalid policy output fails the match;
/// callers must not award ratings for failed or incomplete matches.
pub fn run_match<G: GameAdapter>(
    game: &mut G,
    agents: &mut [Box<dyn PlayerAgent<G>>],
    decision_budget: usize,
) -> Result<MatchResult, String> {
    for decisions in 0..=decision_budget {
        if let Some(scores) = game.scores() {
            if scores.len() != agents.len() || scores.iter().any(|s| !s.is_finite()) {
                return Err("Invalid terminal scores.".into());
            }
            return Ok(MatchResult {
                rules_version: game.rules_version().into(),
                policies: agents.iter().map(|a| a.policy_version().into()).collect(),
                scores,
                decisions,
            });
        }
        if decisions == decision_budget {
            break;
        }
        let seat = game
            .active_seat()
            .ok_or("No active player in unfinished match.")?;
        let observation = game.observe(seat).ok_or("Missing player observation.")?;
        let legal = game.legal_actions(seat);
        let agent = agents.get_mut(seat).ok_or("Missing player policy.")?;
        let index = agent.select_action(&observation, &legal);
        let action = legal
            .get(index)
            .ok_or("Policy selected an illegal action.")?
            .clone();
        game.apply_action(seat, action)?;
    }
    Err("Match exceeded its decision budget.".into())
}

/// Two-player Elo, K=32. The pair changes by equal and opposite amounts.
/// Keep independent pools for each rules version and match format.
pub fn elo_pair(ratings: [f64; 2], scores: [f64; 2]) -> Result<[f64; 2], String> {
    if ratings.iter().chain(scores.iter()).any(|v| !v.is_finite()) {
        return Err("Ratings and scores must be finite.".into());
    }
    let actual = if scores[0] > scores[1] {
        1.0
    } else if scores[0] < scores[1] {
        0.0
    } else {
        0.5
    };
    let expected = 1.0 / (1.0 + 10_f64.powf((ratings[1] - ratings[0]) / 400.0));
    let change = 32.0 * (actual - expected);
    Ok([ratings[0] + change, ratings[1] - change])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn elo_handles_wins_draws_and_upsets() {
        assert_eq!(elo_pair([1200.0; 2], [3.0, 1.0]).unwrap(), [1216.0, 1184.0]);
        assert_eq!(elo_pair([1200.0; 2], [1.0; 2]).unwrap(), [1200.0; 2]);
        let upset = elo_pair([1000.0, 1400.0], [1.0, 0.0]).unwrap();
        assert!(upset[0] > 1029.0);
        assert!((upset.iter().sum::<f64>() - 2400.0).abs() < 1e-9);
        assert!(elo_pair([f64::NAN, 1200.0], [1.0, 0.0]).is_err());
    }
}
