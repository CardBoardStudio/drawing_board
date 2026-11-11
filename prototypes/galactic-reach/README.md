# Galactic Reach prototype

Galactic Reach is a self-contained browser prototype for a four-faction strategy game. One human player competes against three computer-controlled factions to explore a large hex map, gather resources, build fleets and colonies, improve a deck, choose resource directives, and reach 20 Prestige.

## Play locally

From the repository root, run:

```sh
python3 -m http.server 8000 --directory prototypes/galactic-reach
```

Then open <http://127.0.0.1:8000>.

The prototype has no build step or external runtime dependencies. Game state and the one-turn undo snapshot are stored in browser `localStorage`; use **New game** to reset the current game.

## Checks

CI runs these with Node and no packages:

```sh
node scripts/test-galactic-reach.cjs           # adapter conformance and non-mutating legal-action discovery
node scripts/test-galactic-reach-dialogs.cjs   # round-end dialogs and save migrations against the real app.js
node scripts/balance-simulations.cjs 1         # AI-vs-AI balance harness; raise the count for a full report
```

## Rules and scope

The [canonical rulebook](rulebook.html) describes the current **Excavation 13.18 experiment** game: four factions race to 20 Prestige through exploration, construction, deck building, trade, excavation, and combat. Open `/galactic-reach/rulebook.html` on the deployed site, or `/rulebook.html` on the standalone local server above. It requires no account and is packaged with every PR preview.

Read the [rules maintenance guide](../../docs/rules/README.md) before changing the game. Logic changes must include a rulebook update in the same PR. The [implementation notes](../../docs/rules/implementation-notes.md) record known printed-text discrepancies; the [tutorial brief](../../docs/rules/tutorial.md) describes the later interactive learning experience.

Guest play saves in the browser. Account-backed tables pin their rules version, and the authoritative AI arena uses the same JavaScript engine. Existing 4.9, 5.10, 6.11, 7.12, 8.13, 9.14, 10.15, 11.16, and 12.17 tables retain their archived engines; this rulebook applies to 13.18 only. Settlers move 1 hex, Fleets 2, and Explorers 3. Start with only one Colony and no units or Shipyard. Influence tracks and policies are removed; round-end resource directives are removed. Explorer commissions grant Excavate directly in hand. Pay 1 Matter, 1 Energy, and 2 Data at a relic to choose one of three visible cards, gain 1 Prestige, remove the site, keep the Explorer, and trash Excavate. Twelve worlds and four non-producing gray moons hold twelve relics. All units stay visible under fog. Preview/local development controls are enabled with `?dev=1`. Start a new game on the experiment’s preview or a separate localhost port.

The archived 11.16 Alien Relics iteration used Probe and Research Stations. Those rules remain available only to pinned historical games. Current games use Excavate and the public relic row. Permanent capacity purchases and playtest annotations remain.
