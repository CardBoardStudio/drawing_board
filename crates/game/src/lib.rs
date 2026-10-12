//! Voidwright's deterministic, transport-independent rules. Never send `Game` to a client.
pub mod agents;
use rand::{SeedableRng, seq::SliceRandom};
use rand_chacha::ChaCha20Rng;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const RULES_VERSION: &str = "voidwright/1";

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
    pub const ALL: [Card; 12] = [
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
    #[serde(default)]
    pub registration_available: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateGame {
    #[serde(default)]
    pub opponent_id: Option<String>,
    pub name: String,
    pub practice: bool,
    pub round_limit: u16,
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
    ) -> Result<Self, String> {
        if !(10..=50).contains(&round_limit) {
            return Err("Round limit must be between 10 and 50.".into());
        }
        let mut game = Self {
            id,
            name,
            rules_version: RULES_VERSION.into(),
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
                self.players[i].deck = vec![Card::Credit; 7];
                self.players[i].deck.extend([Card::Outpost; 3]);
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
                let count = *self.supply.get(&card).ok_or("Unknown card.")?;
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
        self.agent_command(agents::Strategy::Kepler)
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
        let mut g = Game::new("t".into(), "t".into(), "a".into(), "A".into(), [0; 32], 10).unwrap();
        assert!(g.apply("a", Command::Start).is_err());
        for id in ["b", "c", "d"] {
            g.join(id.into(), id.into(), false).unwrap();
        }
        assert!(g.join("e".into(), "E".into(), false).is_err());
        assert!(g.apply("b", Command::Start).is_err());
    }
}
