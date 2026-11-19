//! Hidden-information seam. Everything a zero-knowledge table would replace sits
//! behind `HiddenInfoAuthority`: shuffling hidden cards, recovering a logged
//! shuffle while folding the log, projecting each seat's private view (which is
//! how a seat learns the cards it drew), and opening the hidden record once the
//! game is over. `TrustedAuthority` is the server-held implementation used today;
//! docs/shared-tables.md maps each method to the zk/ draw proof and gr-table contract.
use super::log::{Event, NewEvent};
use galactic_reach::GalacticReach;
use rand::{RngCore, rngs::OsRng, seq::SliceRandom};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

/// A shuffle the engine asked for: the order it uses now, and the log event
/// that lets the table be rebuilt (and, after the game, audited) later.
pub struct Shuffle {
    pub order: Vec<usize>,
    pub event: NewEvent,
}

pub trait HiddenInfoAuthority: Send + Sync {
    /// Stored with each table, so a table is always folded by the authority
    /// that dealt it.
    fn name(&self) -> &'static str;
    /// Orders `n` hidden cards (a deck, the market pile, relics, map tiles).
    /// `index` counts this table's shuffles from 0.
    fn shuffle(&self, table: &str, index: u64, n: usize, purpose: &str) -> Result<Shuffle, String>;
    /// The order a logged `shuffle` event produced, for folding the log.
    fn replay_shuffle(&self, event: &Event, n: usize, purpose: &str) -> Result<Vec<usize>, String>;
    /// Everything `seat` may see: public table state plus its own hand and deck
    /// contents. Never another seat's hand, any deck order, or unlocated relics.
    fn private_view(&self, engine: &GalacticReach, seat: usize) -> Result<Value, String>;
    /// Public board information only, including after the game ends.
    fn public_view(&self, engine: &GalacticReach) -> Result<Value, String> {
        engine.public_state()
    }
    /// After the game ends: opens every hidden shuffle so anyone holding the log
    /// can replay the whole game and check each commitment.
    fn reveal(&self, table: &str, events: &[Event]) -> Result<NewEvent, String>;
}

/// The server generates each order from OS randomness, keeps it in the log's
/// private column, and shows seats only a salted commitment until the end.
pub struct TrustedAuthority;

fn commitment(table: &str, index: u64, purpose: &str, order: &[usize], salt: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!(
            "galactic-reach-shuffle-v1\n{table}\n{index}\n{purpose}\n{}\n{salt}",
            json!(order)
        ))
    )
}

fn deal(table: &str, index: u64, n: usize, purpose: &str, rng: &mut impl RngCore) -> Shuffle {
    let mut order: Vec<usize> = (0..n).collect();
    order.shuffle(rng);
    let mut salt = [0u8; 32];
    rng.fill_bytes(&mut salt);
    let salt = hex::encode(salt);
    let event = NewEvent {
        kind: "shuffle",
        seat: None,
        public: json!({"index":index,"purpose":purpose,"n":n,"commitment":commitment(table,index,purpose,&order,&salt)}),
        private: Some(json!({"order":order,"salt":salt})),
    };
    Shuffle { order, event }
}

impl HiddenInfoAuthority for TrustedAuthority {
    fn name(&self) -> &'static str {
        "trusted-server/1"
    }
    fn shuffle(&self, table: &str, index: u64, n: usize, purpose: &str) -> Result<Shuffle, String> {
        Ok(deal(table, index, n, purpose, &mut OsRng))
    }
    fn replay_shuffle(&self, event: &Event, n: usize, purpose: &str) -> Result<Vec<usize>, String> {
        if event.kind != "shuffle"
            || event.public["n"] != json!(n)
            || event.public["purpose"] != purpose
        {
            return Err(format!(
                "Table log mismatch at event {}: expected a {purpose} shuffle of {n}.",
                event.seq
            ));
        }
        let order: Vec<usize> = event
            .private
            .as_ref()
            .and_then(|p| serde_json::from_value(p["order"].clone()).ok())
            .ok_or("A logged shuffle is missing its order.")?;
        Ok(order)
    }
    fn private_view(&self, engine: &GalacticReach, seat: usize) -> Result<Value, String> {
        engine.private_state(seat)
    }
    fn reveal(&self, table: &str, events: &[Event]) -> Result<NewEvent, String> {
        let openings: Vec<Value> = events
            .iter()
            .filter(|e| e.kind == "shuffle")
            .map(|e| {
                let private = e.private.clone().unwrap_or_default();
                let order: Vec<usize> =
                    serde_json::from_value(private["order"].clone()).unwrap_or_default();
                let salt = private["salt"].as_str().unwrap_or_default();
                let index = e.public["index"].as_u64().unwrap_or_default();
                let purpose = e.public["purpose"].as_str().unwrap_or_default();
                let valid =
                    commitment(table, index, purpose, &order, salt) == e.public["commitment"];
                json!({"seq":e.seq,"index":index,"order":order,"salt":salt,"valid":valid})
            })
            .collect();
        Ok(NewEvent {
            kind: "reveal",
            seat: None,
            public: json!({"authority":self.name(),"shuffles":openings}),
            private: None,
        })
    }
}

/// Tests only: `TrustedAuthority` with every shuffle drawn from a fixed seed, so
/// a shared game deals the same cards on every run. The table id is left out of
/// the seed because tables get random ids.
#[cfg(test)]
pub struct SeededAuthority(pub [u8; 32]);

#[cfg(test)]
impl HiddenInfoAuthority for SeededAuthority {
    fn name(&self) -> &'static str {
        TrustedAuthority.name()
    }
    fn shuffle(&self, table: &str, index: u64, n: usize, purpose: &str) -> Result<Shuffle, String> {
        use rand::SeedableRng;
        let seed: [u8; 32] =
            Sha256::digest(format!("{}\n{index}\n{purpose}", hex::encode(self.0))).into();
        Ok(deal(
            table,
            index,
            n,
            purpose,
            &mut rand::rngs::StdRng::from_seed(seed),
        ))
    }
    fn replay_shuffle(&self, event: &Event, n: usize, purpose: &str) -> Result<Vec<usize>, String> {
        TrustedAuthority.replay_shuffle(event, n, purpose)
    }
    fn private_view(&self, engine: &GalacticReach, seat: usize) -> Result<Value, String> {
        TrustedAuthority.private_view(engine, seat)
    }
    fn reveal(&self, table: &str, events: &[Event]) -> Result<NewEvent, String> {
        TrustedAuthority.reveal(table, events)
    }
}
