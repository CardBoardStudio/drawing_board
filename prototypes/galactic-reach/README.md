# Galactic Reach prototype

Galactic Reach is a self-contained browser prototype for a four-faction strategy game. One human player competes against three computer-controlled factions to explore a hex map, gather resources, build fleets and colonies, improve a deck, and reach 15 Prestige.

## Play locally

From the repository root, run:

```sh
python3 -m http.server 8000 --directory prototypes/galactic-reach
```

Then open <http://127.0.0.1:8000>.

The prototype has no build step or external runtime dependencies. Game state and the one-turn undo snapshot are stored in browser `localStorage`; use **New game** to reset the current game.

## Current scope

- Interactive galaxy map with movement, construction, colonization, production, trade, combat, and conquest.
- Deck-building market with basic orders, advanced cards, reactions, and card-pile inspection.
- Three computer-controlled rival factions with military, economy, and expansion strategies.
- Public awards, Prestige scoring, round phases, game log, rules reference, autosave, and one-turn undo.

This is an independent static playtest prototype. It is not yet integrated with the repository's Rust server, multiplayer sessions, or persistence model.
