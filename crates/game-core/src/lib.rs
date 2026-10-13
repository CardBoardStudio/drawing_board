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

/// Multiplayer Elo: average the pairwise K=32 changes against every opponent,
/// computed simultaneously from pre-match ratings. Total rating stays constant.
/// Two seats give exactly the same result as `elo_pair`.
pub fn elo_multiplayer(ratings: &[f64], scores: &[f64]) -> Result<Vec<f64>, String> {
    if ratings.len() < 2 || ratings.len() != scores.len() {
        return Err("Ratings and scores need the same number of seats, at least two.".into());
    }
    let mut result = ratings.to_vec();
    for i in 0..ratings.len() {
        for j in i + 1..ratings.len() {
            let pair = elo_pair([ratings[i], ratings[j]], [scores[i], scores[j]])?;
            let change = (pair[0] - ratings[i]) / (ratings.len() - 1) as f64;
            result[i] += change;
            result[j] -= change;
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiplayer_elo_is_simultaneous_and_conserves_ratings() {
        assert_eq!(
            elo_multiplayer(&[1200.0; 2], &[3.0, 1.0]).unwrap(),
            elo_pair([1200.0; 2], [3.0, 1.0]).unwrap()
        );
        let ratings = [1000.0, 1100.0, 1300.0, 1400.0];
        let scores = [1.0, 0.0, 0.0, 0.0];
        let result = elo_multiplayer(&ratings, &scores).unwrap();
        assert!((result.iter().sum::<f64>() - 4800.0).abs() < 1e-9);
        assert!(result[0] > ratings[0]);
        let reversed = elo_multiplayer(
            &ratings.into_iter().rev().collect::<Vec<_>>(),
            &scores.into_iter().rev().collect::<Vec<_>>(),
        )
        .unwrap();
        for (a, b) in result.iter().zip(reversed.iter().rev()) {
            assert!((a - b).abs() < 1e-9);
        }
        assert!(elo_multiplayer(&[1200.0], &[1.0]).is_err());
        assert!(elo_multiplayer(&[1200.0; 4], &[1.0, f64::NAN, 0.0, 0.0]).is_err());
    }
    #[test]
    fn placement_elo_rewards_second_and_handles_exact_ties() {
        let out = elo_multiplayer(&[1200.0; 4], &[3.0, 2.0, 1.0, 0.0]).unwrap();
        assert!((out[0] - 1216.0).abs() < 1e-9);
        assert!((out[1] - 1205.3333333333).abs() < 1e-8);
        assert!((out[2] - 1194.6666666667).abs() < 1e-8);
        assert!((out[3] - 1184.0).abs() < 1e-9);
        let tied = elo_multiplayer(&[1200.0; 4], &[3.0, 2.0, 2.0, 0.0]).unwrap();
        assert_eq!(tied[1], tied[2]);
        assert!((out.iter().sum::<f64>() - 4800.0).abs() < 1e-9);
    }
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
