use crate::{Card, Kind};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const MARKET_SIZE: usize = 6;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MarketPreset {
    #[default]
    FirstContact,
    DeepSpace,
    Industry,
}
impl MarketPreset {
    pub const ALL: [Self; 3] = [Self::FirstContact, Self::DeepSpace, Self::Industry];
    pub fn name(self) -> &'static str {
        match self {
            Self::FirstContact => "First contact",
            Self::DeepSpace => "Deep space",
            Self::Industry => "Heavy industry",
        }
    }
    pub fn cards(self) -> Vec<Card> {
        use Card::*;
        match self {
            Self::FirstContact => vec![Scout, Relay, Freighter, Laboratory, Exchange, Salvager],
            Self::DeepSpace => vec![
                Surveyor,
                MiningRig,
                CommandBridge,
                Wormhole,
                Fabricator,
                Observatory,
            ],
            Self::Industry => vec![
                Freighter, Exchange, Salvager, Surveyor, MiningRig, Fabricator,
            ],
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StartingDeck {
    #[default]
    Standard,
    Explorer,
    Industrial,
}
impl StartingDeck {
    pub const ALL: [Self; 3] = [Self::Standard, Self::Explorer, Self::Industrial];
    pub fn name(self) -> &'static str {
        match self {
            Self::Standard => "Classic",
            Self::Explorer => "Explorer",
            Self::Industrial => "Industrial",
        }
    }
    pub fn description(self) -> &'static str {
        match self {
            Self::Standard => "7 Credits · 3 Outposts",
            Self::Explorer => "6 Credits · 3 Outposts · 1 Survey vessel",
            Self::Industrial => "5 Credits · 3 Outposts · 2 Reactors",
        }
    }
    pub fn cards(self) -> Vec<Card> {
        let credits = match self {
            Self::Standard => 7,
            Self::Explorer => 6,
            Self::Industrial => 5,
        };
        let mut cards = vec![Card::Credit; credits];
        cards.extend([Card::Outpost; 3]);
        match self {
            Self::Standard => {}
            Self::Explorer => cards.push(Card::Surveyor),
            Self::Industrial => cards.extend([Card::Reactor; 2]),
        }
        cards
    }
}

/// Host-selected public setup, frozen when the table is created.
/// Defaults preserve the original twelve-pile market and ten-card deck.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct GameSetup {
    pub market: Vec<Card>,
    pub starting_deck: StartingDeck,
}
impl Default for GameSetup {
    fn default() -> Self {
        Self {
            market: MarketPreset::FirstContact.cards(),
            starting_deck: StartingDeck::Standard,
        }
    }
}
impl GameSetup {
    pub fn validate(&self) -> Result<(), String> {
        if self.market.len() != MARKET_SIZE
            || self.market.iter().collect::<BTreeSet<_>>().len() != MARKET_SIZE
            || self.market.iter().any(|c| c.info().kind != Kind::Action)
        {
            return Err(format!(
                "Choose exactly {MARKET_SIZE} different fleet and technology cards. Resources and colonies are always included."
            ));
        }
        Ok(())
    }
    pub fn market_name(&self) -> &'static str {
        let cards: BTreeSet<_> = self.market.iter().copied().collect();
        MarketPreset::ALL
            .into_iter()
            .find(|preset| preset.cards().into_iter().collect::<BTreeSet<_>>() == cards)
            .map(MarketPreset::name)
            .unwrap_or("Custom market")
    }
}
