//! Voidwright's deterministic, transport-independent rules. Never send `Game` to a client.
use rand::{SeedableRng, seq::SliceRandom};
use rand_chacha::ChaCha20Rng;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
mod setup;
pub use setup::{GameSetup, MARKET_SIZE, MarketPreset, StartingDeck};

pub const RULES_VERSION: &str = "voidwright/2";

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Card {
    Credit,
    Reactor,
    Fusion,
    Outpost,
    Colony,
    Metropolis,
    Scout,
    Relay,
    Freighter,
    Laboratory,
    Exchange,
    Salvager,
    Surveyor,
    MiningRig,
    CommandBridge,
    Wormhole,
    Fabricator,
    Observatory,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Resource,
    Colony,
    Action,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CardInfo {
    pub id: Card,
    pub name: String,
    pub kind: Kind,
    pub cost: u8,
    pub text: String,
    pub flavor: String,
    pub icon: String,
}
impl Card {
    pub const ALL: [Card; 18] = [
        Self::Credit,
        Self::Reactor,
        Self::Fusion,
        Self::Outpost,
        Self::Colony,
        Self::Metropolis,
        Self::Scout,
        Self::Relay,
        Self::Freighter,
        Self::Laboratory,
        Self::Exchange,
        Self::Salvager,
        Self::Surveyor,
        Self::MiningRig,
        Self::CommandBridge,
        Self::Wormhole,
        Self::Fabricator,
        Self::Observatory,
    ];
    pub fn info(self) -> CardInfo {
        use Card::*;
        let (name, kind, cost, text, flavor, icon) = match self {
            Credit => (
                "Credit",
                Kind::Resource,
                0,
                "+1 credit",
                "Small beginnings. Distant horizons.",
                "◈",
            ),
            Reactor => (
                "Reactor",
                Kind::Resource,
                3,
                "+2 credits",
                "The quiet heart of your fleet.",
                "◎",
            ),
            Fusion => (
                "Fusion core",
                Kind::Resource,
                6,
                "+3 credits",
                "A star, persuaded to stay.",
                "✺",
            ),
            Outpost => (
                "Outpost",
                Kind::Colony,
                2,
                "1 influence at game end",
                "A light in the emptiness.",
                "⌂",
            ),
            Colony => (
                "Colony",
                Kind::Colony,
                5,
                "3 influence at game end",
                "Somewhere to call tomorrow.",
                "◉",
            ),
            Metropolis => (
                "Metropolis",
                Kind::Colony,
                8,
                "6 influence · empty this pile to end",
                "Build a world worth returning to.",
                "◍",
            ),
            Scout => (
                "Deep-space scout",
                Kind::Action,
                2,
                "+2 cards",
                "There is always another horizon.",
                "⌁",
            ),
            Relay => (
                "Orbital relay",
                Kind::Action,
                3,
                "+1 card · +2 actions",
                "A thousand voices. One signal.",
                "⌘",
            ),
            Freighter => (
                "Star freighter",
                Kind::Action,
                4,
                "+3 credits",
                "Fortune favors a full cargo hold.",
                "⟁",
            ),
            Laboratory => (
                "Research lab",
                Kind::Action,
                5,
                "+2 cards · +1 action",
                "The impossible takes one more orbit.",
                "⚗",
            ),
            Exchange => (
                "Trade nexus",
                Kind::Action,
                5,
                "+1 card · +1 action · +1 buy · +1 credit",
                "Every route leads somewhere new.",
                "❖",
            ),
            Salvager => (
                "Salvage drone",
                Kind::Action,
                3,
                "+2 credits · scrap 1 Credit, or 1 Outpost if no Credit",
                "Nothing is lost. Only repurposed.",
                "⟐",
            ),
            Surveyor => (
                "Survey vessel",
                Kind::Action,
                4,
                "+1 card · +1 action · +1 credit",
                "Chart the route. Claim the horizon.",
                "⌖",
            ),
            MiningRig => (
                "Asteroid rig",
                Kind::Action,
                4,
                "+2 credits · +1 buy",
                "The belt has more to give.",
                "⛏",
            ),
            CommandBridge => (
                "Command bridge",
                Kind::Action,
                5,
                "+1 card · +3 actions",
                "One fleet. A hundred possibilities.",
                "⌬",
            ),
            Wormhole => (
                "Wormhole drive",
                Kind::Action,
                4,
                "+3 cards",
                "Distance is a matter of perspective.",
                "◌",
            ),
            Fabricator => (
                "Fabricator",
                Kind::Action,
                4,
                "+1 action · gain a Reactor to discard if available",
                "Tomorrow's engines, assembled today.",
                "⚙",
            ),
            Observatory => (
                "Observatory",
                Kind::Action,
                5,
                "+2 cards · +1 buy",
                "See a little farther. Reach a little more.",
                "✧",
            ),
        };
        CardInfo {
            id: self,
            name: name.into(),
            kind,
            cost,
            text: text.into(),
            flavor: flavor.into(),
            icon: icon.into(),
        }
    }
    pub fn points(self) -> u16 {
        match self {
            Self::Outpost => 1,
            Self::Colony => 3,
            Self::Metropolis => 6,
            _ => 0,
        }
    }
    pub fn credits(self) -> u8 {
        match self {
            Self::Credit => 1,
            Self::Reactor => 2,
            Self::Fusion => 3,
            _ => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Lobby,
    Active,
    Finished,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Action,
    Buy,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    Start,
    Play { index: usize },
    PlayResources,
    Buy { card: Card },
    EndTurn,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub bot: bool,
    pub deck: Vec<Card>,
    pub hand: Vec<Card>,
    pub discard: Vec<Card>,
    pub played: Vec<Card>,
    pub turns: u16,
}
impl Player {
    fn cards(&self) -> impl Iterator<Item = &Card> {
        self.deck
            .iter()
            .chain(&self.hand)
            .chain(&self.discard)
            .chain(&self.played)
    }
    pub fn score(&self) -> u16 {
        self.cards().map(|c| c.points()).sum()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub revision: u64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub rules_version: String,
    #[serde(default)]
    pub setup: GameSetup,
    pub status: Status,
    pub players: Vec<Player>,
    pub supply: BTreeMap<Card, u16>,
    pub active: usize,
    pub phase: Phase,
    pub actions: u8,
    pub buys: u8,
    pub credits: u16,
    pub revision: u64,
    pub round_limit: u16,
    pub log: Vec<Event>,
    pub trash: Vec<Card>,
    // Secret entropy is persisted for server-side replay, never included in a public view.
    seed: [u8; 32],
    shuffles: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PlayerView {
    pub name: String,
    pub bot: bool,
    pub is_you: bool,
    pub cards: usize,
    pub deck: usize,
    pub hand: usize,
    pub discard: usize,
    pub played: Vec<Card>,
    pub influence: u16,
    pub turns: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GameView {
    pub id: String,
    pub name: String,
    pub rules_version: String,
    #[serde(default)]
    pub setup: GameSetup,
    pub status: Status,
    pub players: Vec<PlayerView>,
    pub supply: BTreeMap<Card, u16>,
    pub active: usize,
    pub phase: Phase,
    pub actions: u8,
    pub buys: u8,
    pub credits: u16,
    pub revision: u64,
    pub round: u16,
    pub round_limit: u16,
    pub hand: Vec<Card>,
    pub collection: BTreeMap<Card, usize>,
    pub log: Vec<Event>,
    pub trash: Vec<Card>,
    pub your_turn: bool,
    pub host: bool,
    pub winners: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Identity {
    pub name: String,
    pub development: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub user: Option<Identity>,
    pub dev_auth: bool,
    #[serde(default)]
    pub preview_auth: bool,
    pub nido_available: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateGame {
    pub name: String,
    pub practice: bool,
    pub round_limit: u16,
    #[serde(default)]
    pub setup: GameSetup,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CommandRequest {
    pub revision: u64,
    pub command: Command,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameSummary {
    pub id: String,
    pub name: String,
    pub status: Status,
    pub players: usize,
    pub round: u16,
}

impl Game {
    pub fn new(
        id: String,
        name: String,
        player_id: String,
        player_name: String,
        seed: [u8; 32],
        round_limit: u16,
        setup: GameSetup,
    ) -> Result<Self, String> {
        if !(10..=50).contains(&round_limit) {
            return Err("Round limit must be between 10 and 50.".into());
        }
        setup.validate()?;
        let mut game = Self {
            id,
            name,
            rules_version: RULES_VERSION.into(),
            setup,
            status: Status::Lobby,
            players: vec![],
            supply: BTreeMap::new(),
            active: 0,
            phase: Phase::Action,
            actions: 1,
            buys: 1,
            credits: 0,
            revision: 0,
            round_limit,
            log: vec![],
            trash: vec![],
            seed,
            shuffles: 0,
        };
        game.join(player_id, player_name, false)?;
        Ok(game)
    }
    pub fn join(&mut self, id: String, name: String, bot: bool) -> Result<(), String> {
        if self.players.iter().any(|p| p.id == id) {
            return Ok(());
        }
        if self.status != Status::Lobby {
            return Err("This playtest has already started.".into());
        }
        if self.players.len() >= 4 {
            return Err("This table is full (4 players).".into());
        }
        self.players.push(Player {
            id,
            name: name.clone(),
            bot,
            deck: vec![],
            hand: vec![],
            discard: vec![],
            played: vec![],
            turns: 0,
        });
        self.revision += 1;
        self.record(format!("{name} joined the table."));
        Ok(())
    }
    fn record(&mut self, text: String) {
        self.log.push(Event {
            revision: self.revision,
            text,
        });
    }
    fn shuffle(&mut self, player: usize) {
        let mut rng = ChaCha20Rng::from_seed(self.seed);
        rng.set_stream(self.shuffles);
        self.shuffles += 1;
        self.players[player].deck.shuffle(&mut rng);
    }
    fn draw(&mut self, player: usize, count: usize) {
        for _ in 0..count {
            if self.players[player].deck.is_empty() {
                self.players[player].deck = std::mem::take(&mut self.players[player].discard);
                self.shuffle(player);
            }
            if let Some(c) = self.players[player].deck.pop() {
                self.players[player].hand.push(c);
            }
        }
    }
    /// Atomic transition: invalid commands leave every byte of the game unchanged.
    pub fn apply(&mut self, actor: &str, command: Command) -> Result<(), String> {
        let mut next = self.clone();
        next.transition(actor, command)?;
        *self = next;
        Ok(())
    }
    fn transition(&mut self, actor: &str, command: Command) -> Result<(), String> {
        if command == Command::Start {
            if self.status != Status::Lobby {
                return Err("The game has already started.".into());
            }
            if self.players[0].id != actor {
                return Err("Only the host can launch this game.".into());
            }
            if self.players.len() < 2 {
                return Err("Invite at least one other player first.".into());
            }
            self.revision += 1;
            for c in Card::ALL {
                if c.info().kind == Kind::Action && !self.setup.market.contains(&c) {
                    continue;
                }
                self.supply.insert(
                    c,
                    match c.info().kind {
                        Kind::Resource => 40,
                        Kind::Colony => {
                            if self.players.len() == 2 {
                                8
                            } else {
                                12
                            }
                        }
                        Kind::Action => 10,
                    },
                );
            }
            for i in 0..self.players.len() {
                self.players[i].deck = self.setup.starting_deck.cards();
                self.shuffle(i);
                self.draw(i, 5);
            }
            self.status = Status::Active;
            self.record("Expedition launched. Build the most influence to win.".into());
            return Ok(());
        }
        if self.status != Status::Active {
            return Err("This game is not active.".into());
        }
        if self.players[self.active].id != actor {
            return Err("Wait for your turn.".into());
        }
        let i = self.active;
        let name = self.players[i].name.clone();
        self.revision += 1;
        match command {
            Command::Start => unreachable!(),
            Command::Play { index } => {
                let card = *self.players[i]
                    .hand
                    .get(index)
                    .ok_or("That card is no longer in your hand.")?;
                match card.info().kind {
                    Kind::Colony => {
                        return Err("Colonies score influence; they cannot be played.".into());
                    }
                    Kind::Action => {
                        if self.phase != Phase::Action || self.actions == 0 {
                            return Err(
                                "No actions available. Play resources or end your turn.".into()
                            );
                        }
                        self.actions -= 1;
                    }
                    Kind::Resource => {
                        self.phase = Phase::Buy;
                        self.credits += card.credits() as u16;
                    }
                }
                self.players[i].hand.remove(index);
                self.players[i].played.push(card);
                self.record(format!("{name} played {}.", card.info().name));
                match card {
                    Card::Scout => self.draw(i, 2),
                    Card::Relay => {
                        self.draw(i, 1);
                        self.actions += 2;
                    }
                    Card::Freighter => self.credits += 3,
                    Card::Laboratory => {
                        self.draw(i, 2);
                        self.actions += 1;
                    }
                    Card::Exchange => {
                        self.draw(i, 1);
                        self.actions += 1;
                        self.buys += 1;
                        self.credits += 1;
                    }
                    Card::Salvager => {
                        self.credits += 2;
                        if let Some(j) = self.players[i]
                            .hand
                            .iter()
                            .position(|c| *c == Card::Credit)
                            .or_else(|| {
                                self.players[i]
                                    .hand
                                    .iter()
                                    .position(|c| *c == Card::Outpost)
                            })
                        {
                            let c = self.players[i].hand.remove(j);
                            self.trash.push(c);
                            self.record(format!("{name} scrapped {}.", c.info().name));
                        }
                    }
                    Card::Surveyor => {
                        self.draw(i, 1);
                        self.actions += 1;
                        self.credits += 1;
                    }
                    Card::MiningRig => {
                        self.credits += 2;
                        self.buys += 1;
                    }
                    Card::CommandBridge => {
                        self.draw(i, 1);
                        self.actions += 3;
                    }
                    Card::Wormhole => self.draw(i, 3),
                    Card::Fabricator => {
                        self.actions += 1;
                        if let Some(count) = self.supply.get_mut(&Card::Reactor)
                            && *count > 0
                        {
                            *count -= 1;
                            self.players[i].discard.push(Card::Reactor);
                            self.record(format!("{name} fabricated a Reactor."));
                        }
                    }
                    Card::Observatory => {
                        self.draw(i, 2);
                        self.buys += 1;
                    }
                    _ => {}
                }
            }
            Command::PlayResources => {
                if self.players[i].hand.iter().all(|c| c.credits() == 0) {
                    return Err("No resources in your hand.".into());
                }
                self.phase = Phase::Buy;
                let hand = std::mem::take(&mut self.players[i].hand);
                let mut gain = 0;
                for c in hand {
                    if c.credits() > 0 {
                        gain += c.credits() as u16;
                        self.players[i].played.push(c);
                    } else {
                        self.players[i].hand.push(c);
                    }
                }
                self.credits += gain;
                self.record(format!("{name} generated {gain} credits."));
            }
            Command::Buy { card } => {
                let count = *self
                    .supply
                    .get(&card)
                    .ok_or("That card is not in this market.")?;
                if count == 0 {
                    return Err("That supply pile is empty.".into());
                }
                if self.buys == 0 {
                    return Err("No buys remaining.".into());
                }
                let cost = card.info().cost as u16;
                if self.credits < cost {
                    return Err("Not enough credits.".into());
                }
                self.phase = Phase::Buy;
                self.buys -= 1;
                self.credits -= cost;
                self.supply.insert(card, count - 1);
                self.players[i].discard.push(card);
                self.record(format!("{name} acquired {}.", card.info().name));
            }
            Command::EndTurn => {
                let hand = std::mem::take(&mut self.players[i].hand);
                let played = std::mem::take(&mut self.players[i].played);
                self.players[i].discard.extend(hand);
                self.players[i].discard.extend(played);
                self.players[i].turns += 1;
                if self.supply.get(&Card::Metropolis) == Some(&0)
                    || self.supply.values().filter(|&&n| n == 0).count() >= 3
                    || self.players.iter().all(|p| p.turns >= self.round_limit)
                {
                    self.status = Status::Finished;
                    self.record("Expedition complete. Final influence tallied.".into());
                } else {
                    self.draw(i, 5);
                    self.active = (i + 1) % self.players.len();
                    self.phase = Phase::Action;
                    self.actions = 1;
                    self.buys = 1;
                    self.credits = 0;
                    self.record(format!("{} takes command.", self.players[self.active].name));
                }
            }
        }
        Ok(())
    }
    pub fn bot_command(&self) -> Option<Command> {
        if self.status != Status::Active || !self.players[self.active].bot {
            return None;
        }
        let p = &self.players[self.active];
        if self.phase == Phase::Action && self.actions > 0 {
            // Prefer actions that keep the chain alive.
            for card in [
                Card::CommandBridge,
                Card::Relay,
                Card::Laboratory,
                Card::Exchange,
                Card::Surveyor,
                Card::Fabricator,
                Card::Observatory,
                Card::Wormhole,
                Card::Scout,
                Card::Salvager,
                Card::MiningRig,
                Card::Freighter,
            ] {
                if let Some(index) = p.hand.iter().position(|c| *c == card) {
                    return Some(Command::Play { index });
                }
            }
        }
        if p.hand.iter().any(|c| c.credits() > 0) {
            return Some(Command::PlayResources);
        }
        if self.buys > 0 {
            for card in [
                Card::Metropolis,
                Card::Fusion,
                Card::Laboratory,
                Card::CommandBridge,
                Card::Colony,
                Card::Observatory,
                Card::Exchange,
                Card::Surveyor,
                Card::Wormhole,
                Card::Fabricator,
                Card::MiningRig,
                Card::Freighter,
                Card::Reactor,
                Card::Relay,
                Card::Salvager,
                Card::Scout,
            ] {
                let owned = p.cards().filter(|&&c| c == card).count();
                if card.info().kind == Kind::Action && owned >= 2 {
                    continue;
                }
                if self.credits >= card.info().cost as u16
                    && self.supply.get(&card).copied().unwrap_or(0) > 0
                {
                    return Some(Command::Buy { card });
                }
            }
        }
        Some(Command::EndTurn)
    }
    pub fn view(&self, viewer: &str) -> Option<GameView> {
        let you = self.players.iter().position(|p| p.id == viewer)?;
        let mut collection = BTreeMap::new();
        for c in self.players[you].cards() {
            *collection.entry(*c).or_default() += 1;
        }
        let max = self.players.iter().map(Player::score).max().unwrap_or(0);
        Some(GameView {
            id: self.id.clone(),
            name: self.name.clone(),
            rules_version: self.rules_version.clone(),
            setup: self.setup.clone(),
            status: self.status,
            players: self
                .players
                .iter()
                .enumerate()
                .map(|(i, p)| PlayerView {
                    name: p.name.clone(),
                    bot: p.bot,
                    is_you: i == you,
                    cards: p.cards().count(),
                    deck: p.deck.len(),
                    hand: p.hand.len(),
                    discard: p.discard.len(),
                    played: p.played.clone(),
                    influence: p.score(),
                    turns: p.turns,
                })
                .collect(),
            supply: self.supply.clone(),
            active: self.active,
            phase: self.phase,
            actions: self.actions,
            buys: self.buys,
            credits: self.credits,
            revision: self.revision,
            round: (self.players.iter().map(|p| p.turns).min().unwrap_or(0) + 1)
                .min(self.round_limit),
            round_limit: self.round_limit,
            hand: self.players[you].hand.clone(),
            collection,
            log: self
                .log
                .iter()
                .rev()
                .take(35)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect(),
            trash: self.trash.clone(),
            your_turn: self.active == you && self.status == Status::Active,
            host: you == 0,
            winners: if self.status == Status::Finished {
                self.players
                    .iter()
                    .filter(|p| p.score() == max)
                    .map(|p| p.name.clone())
                    .collect()
            } else {
                vec![]
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn started() -> Game {
        let mut g = Game::new(
            "test".into(),
            "Test".into(),
            "a".into(),
            "Ada".into(),
            [42; 32],
            10,
            GameSetup::default(),
        )
        .unwrap();
        g.join("b".into(), "Turing".into(), true).unwrap();
        g.apply("a", Command::Start).unwrap();
        g
    }
    #[test]
    fn replay_is_deterministic() {
        let mut a = started();
        let mut b = started();
        for _ in 0..10 {
            let id = a.players[a.active].id.clone();
            a.apply(&id, Command::EndTurn).unwrap();
            b.apply(&id, Command::EndTurn).unwrap();
        }
        assert_eq!(a, b);
    }
    #[test]
    fn invalid_commands_are_atomic() {
        let mut g = started();
        let before = g.clone();
        for (id, c) in [
            ("b", Command::EndTurn),
            ("a", Command::Play { index: 99 }),
            (
                "a",
                Command::Buy {
                    card: Card::Metropolis,
                },
            ),
        ] {
            assert!(g.apply(id, c).is_err());
            assert_eq!(g, before);
        }
    }
    #[test]
    fn views_do_not_expose_secrets() {
        let g = started();
        let v = serde_json::to_value(g.view("a").unwrap()).unwrap();
        assert!(v.get("seed").is_none());
        assert!(v.get("shuffles").is_none());
        assert!(v["players"][1]["hand"].is_number());
        assert!(v["players"][1].get("id").is_none());
        assert!(g.view("stranger").is_none());
    }
    #[test]
    fn resources_close_action_phase() {
        let mut g = started();
        g.players[0].hand = vec![Card::Credit, Card::Scout];
        g.apply("a", Command::PlayResources).unwrap();
        assert_eq!(g.credits, 1);
        assert!(g.apply("a", Command::Play { index: 0 }).is_err());
    }
    #[test]
    fn purchase_goes_to_discard_and_cannot_overspend() {
        let mut g = started();
        g.credits = 3;
        g.apply(
            "a",
            Command::Buy {
                card: Card::Reactor,
            },
        )
        .unwrap();
        assert_eq!(g.credits, 0);
        assert_eq!(g.buys, 0);
        assert_eq!(g.players[0].discard, vec![Card::Reactor]);
        assert!(g.apply("a", Command::Buy { card: Card::Credit }).is_err());
    }
    #[test]
    fn salvage_removes_card_permanently() {
        let mut g = started();
        g.players[0].hand = vec![Card::Salvager, Card::Credit, Card::Outpost];
        g.apply("a", Command::Play { index: 0 }).unwrap();
        assert_eq!(g.trash, vec![Card::Credit]);
        assert_eq!(g.players[0].hand, vec![Card::Outpost]);
        assert_eq!(g.credits, 2);
    }
    #[test]
    fn full_bot_match_terminates_and_conserves_cards() {
        let mut g = started();
        g.players[0].bot = true;
        let total: usize = g.supply.values().map(|&x| x as usize).sum::<usize>() + 20;
        let mut steps = 0;
        while let Some(c) = g.bot_command() {
            let id = g.players[g.active].id.clone();
            g.apply(&id, c).unwrap();
            steps += 1;
            assert!(steps < 2000);
            assert_eq!(
                g.supply.values().map(|&x| x as usize).sum::<usize>()
                    + g.players.iter().map(|p| p.cards().count()).sum::<usize>()
                    + g.trash.len(),
                total
            );
        }
        assert_eq!(g.status, Status::Finished);
        assert!(!g.view("a").unwrap().winners.is_empty());
    }
    #[test]
    fn empty_colony_pile_ends_after_turn() {
        let mut g = started();
        g.supply.insert(Card::Metropolis, 1);
        g.credits = 8;
        g.apply(
            "a",
            Command::Buy {
                card: Card::Metropolis,
            },
        )
        .unwrap();
        assert_eq!(g.status, Status::Active);
        g.apply("a", Command::EndTurn).unwrap();
        assert_eq!(g.status, Status::Finished);
    }
    #[test]
    fn host_and_capacity_are_enforced() {
        let mut g = Game::new(
            "t".into(),
            "t".into(),
            "a".into(),
            "A".into(),
            [0; 32],
            10,
            GameSetup::default(),
        )
        .unwrap();
        assert!(g.apply("a", Command::Start).is_err());
        for id in ["b", "c", "d"] {
            g.join(id.into(), id.into(), false).unwrap();
        }
        assert!(g.join("e".into(), "E".into(), false).is_err());
        assert!(g.apply("b", Command::Start).is_err());
    }
    fn configured(setup: GameSetup) -> Game {
        let mut g = Game::new(
            "configured".into(),
            "Configured".into(),
            "a".into(),
            "Ada".into(),
            [24; 32],
            10,
            setup,
        )
        .unwrap();
        g.join("b".into(), "Kepler".into(), true).unwrap();
        g.apply("a", Command::Start).unwrap();
        g
    }
    #[test]
    fn setup_requires_six_distinct_action_piles() {
        for market in [
            vec![],
            vec![Card::Scout; 6],
            Card::ALL[..6].to_vec(),
            Card::ALL[6..].to_vec(),
        ] {
            assert!(
                Game::new(
                    "x".into(),
                    "X".into(),
                    "a".into(),
                    "Ada".into(),
                    [0; 32],
                    10,
                    GameSetup {
                        market,
                        ..Default::default()
                    }
                )
                .is_err()
            );
        }
        for preset in MarketPreset::ALL {
            assert!(
                GameSetup {
                    market: preset.cards(),
                    ..Default::default()
                }
                .validate()
                .is_ok()
            );
        }
    }
    #[test]
    fn selected_market_excludes_other_cards_without_counting_them_as_empty() {
        let mut setup = GameSetup {
            market: MarketPreset::DeepSpace.cards(),
            ..Default::default()
        };
        setup.market[0] = Card::Scout;
        let mut g = configured(setup.clone());
        assert_eq!(g.supply.len(), 12);
        for card in Card::ALL {
            assert_eq!(
                g.supply.contains_key(&card),
                card.info().kind != Kind::Action || setup.market.contains(&card)
            );
        }
        g.credits = 10;
        let before = g.clone();
        assert!(
            g.apply(
                "a",
                Command::Buy {
                    card: Card::Surveyor
                }
            )
            .is_err()
        );
        assert_eq!(g, before);
        g.apply("a", Command::EndTurn).unwrap();
        assert_eq!(g.status, Status::Active);
        assert_eq!(g.view("b").unwrap().setup, setup);
    }
    #[test]
    fn every_player_receives_the_selected_ten_card_deck() {
        for deck in StartingDeck::ALL {
            let g = configured(GameSetup {
                starting_deck: deck,
                ..Default::default()
            });
            let mut expected = deck.cards();
            expected.sort();
            assert_eq!(expected.len(), 10);
            for player in &g.players {
                let mut actual: Vec<_> = player.cards().copied().collect();
                actual.sort();
                assert_eq!(actual, expected);
                assert_eq!(player.hand.len(), 5);
                assert_eq!(player.score(), 3);
            }
            assert_eq!(g.supply[&Card::Reactor], 40);
        }
    }
    #[test]
    fn new_action_cards_apply_their_printed_effects() {
        for (card, draws, actions, credits, buys) in [
            (Card::Surveyor, 1, 1, 1, 1),
            (Card::MiningRig, 0, 0, 2, 2),
            (Card::CommandBridge, 1, 3, 0, 1),
            (Card::Wormhole, 3, 0, 0, 1),
            (Card::Observatory, 2, 0, 0, 2),
        ] {
            let mut g = configured(GameSetup {
                market: MarketPreset::DeepSpace.cards(),
                ..Default::default()
            });
            g.players[0].hand = vec![card];
            // Drawing must also work across an exhausted draw pile.
            g.players[0].deck.clear();
            g.players[0].discard = vec![Card::Credit; 3];
            g.apply("a", Command::Play { index: 0 }).unwrap();
            assert_eq!(g.players[0].hand.len(), draws, "{card:?}");
            assert_eq!(
                (g.actions, g.credits, g.buys),
                (actions, credits, buys),
                "{card:?}"
            );
            assert_eq!(g.phase, Phase::Action);
            assert_eq!(g.players[0].played, vec![card]);
        }
    }
    #[test]
    fn fabricator_gains_from_supply_without_a_buy_and_handles_empty_pile() {
        let mut g = configured(GameSetup {
            market: MarketPreset::DeepSpace.cards(),
            ..Default::default()
        });
        for available in [1, 0] {
            g.players[0].hand = vec![Card::Fabricator];
            g.players[0].discard.clear();
            g.supply.insert(Card::Reactor, available);
            g.apply("a", Command::Play { index: 0 }).unwrap();
            assert_eq!(g.supply[&Card::Reactor], 0);
            assert_eq!(
                g.players[0].discard,
                if available > 0 {
                    vec![Card::Reactor]
                } else {
                    vec![]
                }
            );
            assert_eq!(
                (g.actions, g.buys, g.credits, g.phase),
                (1, 1, 0, Phase::Action)
            );
        }
    }
    #[test]
    fn old_saved_games_keep_their_original_setup() {
        for mut game in [
            started(),
            Game::new(
                "old".into(),
                "Old".into(),
                "a".into(),
                "Ada".into(),
                [9; 32],
                10,
                GameSetup::default(),
            )
            .unwrap(),
        ] {
            game.rules_version = "voidwright/1".into();
            let mut old = serde_json::to_value(&game).unwrap();
            old.as_object_mut().unwrap().remove("setup");
            let restored: Game = serde_json::from_value(old).unwrap();
            assert_eq!(restored, game);
            assert_eq!(restored.setup, GameSetup::default());
        }
    }
    #[test]
    fn all_presets_finish_with_bots_conserve_cards_and_resume_deterministically() {
        for market in MarketPreset::ALL {
            for starting_deck in StartingDeck::ALL {
                let mut game = configured(GameSetup {
                    market: market.cards(),
                    starting_deck,
                });
                game.players[0].bot = true;
                let total = game.supply.values().map(|&n| n as usize).sum::<usize>() + 20;
                for _ in 0..2000 {
                    let Some(command) = game.bot_command() else {
                        break;
                    };
                    let actor = game.players[game.active].id.clone();
                    let mut restored: Game =
                        serde_json::from_str(&serde_json::to_string(&game).unwrap()).unwrap();
                    assert_eq!(restored.bot_command(), Some(command.clone()));
                    restored.apply(&actor, command.clone()).unwrap();
                    game.apply(&actor, command).unwrap();
                    assert_eq!(game, restored);
                    assert_eq!(
                        game.supply.values().map(|&n| n as usize).sum::<usize>()
                            + game
                                .players
                                .iter()
                                .map(|p| p.cards().count())
                                .sum::<usize>()
                            + game.trash.len(),
                        total
                    );
                }
                assert_eq!(
                    game.status,
                    Status::Finished,
                    "{market:?} / {starting_deck:?}"
                );
            }
        }
    }
}
