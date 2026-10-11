# Galactic Reach prototype

Galactic Reach is a self-contained browser prototype for a four-faction strategy game. One human player competes against three computer-controlled factions to explore a large hex map, gather resources, build fleets and colonies, improve a deck, shape policy, and reach 10 Prestige.

## Play locally

From the repository root, run:

```sh
python3 -m http.server 8000 --directory prototypes/galactic-reach
```

Then open <http://127.0.0.1:8000>.

The prototype has no build step or external runtime dependencies. Game state and the one-turn undo snapshot are stored in browser `localStorage`; use **New game** to reset the current game.

## Current scope

- Interactive galaxy map with movement, construction, colonization, production, trade, combat, and conquest.
- Separate 12-card military decks replace dice combat: both sides reveal a tactic each volley, combine it with fleet power, then discard and reshuffle tactics as needed.
- Eleven seven-hex worlds with fog of war. Probes reveal only exact relic coordinates; fast Scouts explore blindly and reveal worlds on arrival.
- Four home worlds touch the outer edge. Every faction begins with a Colony on the world’s center hex and a Shipyard on the adjacent inward hex.
- Colonies can only be founded or captured on the center hex of a seven-hex world.
- A Colony claims its seven-hex world. Each hex can hold only one building; additional structures spread across connected empty hexes and upgrade in place.
- During Production, every planet hex held by a combat fleet grants that fleet's controller 1 of its printed resource, in addition to any normal owner production. Researcher-only teams do not produce.
- Deck-building market with basic orders, advanced cards, reactions, and card-pile inspection.
- Deck-building is a primary scoring path: every eight purchased cards grant 1 permanent Prestige.
- Permanent starter cards that upgrade to level II, plus upgradeable planet structures.
- Expansionist, Culture, Economy, and Technology tracks used for secret policy votes every three rounds.
- Every 10 unspent influence grants 1 Prestige, creating a tradeoff between voting power and endgame scoring.
- Each Colony scores 1 Prestige plus a frontier bonus for every two beyond the home world; every pair of Shipyards scores 1 Prestige.
- End-of-round directives that give the chooser a primary benefit and every rival a related lesser benefit.
- Slow Researchers recruited at home (or upgraded outer settlements), Rosetta Stone stations, 1-Prestige Relics, and a three-station unlock for the powerful relic deck.
- Three computer-controlled rival factions with military, economy, and expansion strategies.
- Public awards, Prestige scoring, round phases, game log, rules reference, autosave, and one-turn undo.

This is an independent static playtest prototype. The deployment build serves it from the repository's Rust server, but the game does not yet use the multiplayer API, sessions, or server-side persistence model.
