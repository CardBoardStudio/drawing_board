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

The [canonical rulebook](rulebook.html) describes the current **Single-use Orders26.31 experiment** game: four factions race to 20 Prestige through exploration, construction, deck building, trade, excavation, and combat. Open `/galactic-reach/rulebook.html` on the deployed site, or `/rulebook.html` on the standalone local server above. It requires no account and is packaged with every PR preview.

Read the [rules maintenance guide](../../docs/rules/README.md) before changing the game. Logic changes must include a rulebook update in the same PR. The [implementation notes](../../docs/rules/implementation-notes.md) record known printed-text discrepancies; the [tutorial brief](../../docs/rules/tutorial.md) describes the later interactive learning experience.

Guest play saves in the browser. Account-backed tables pin their rules version, and the authoritative AI arena uses the same JavaScript engine. Existing 4.9, 5.10, 6.11, 7.12, 8.13, 9.14, 10.15, 11.16, 12.17, 13.18, 14.19, 15.20, 16.21, 17.22, 18.23, 19.24, 20.25, 21.26, 22.27,23.28,24.29, and25.30 tables retain their archived engines; this rulebook applies to26.31 only. Settlers move 1 hex, Fleets 2, and Explorers 3. Start with only one Colony and no units or Shipyard. Influence tracks and policies are removed; round-end resource directives are removed. Explorer commissions grant Probe and Excavate in discard. Pay 1 Matter, 1 Energy, and 2 Data at a relic to choose one of three visible cards for discard, gain 2 Prestige, remove the site, consume one Explorer, and trash Excavate. Thirteen worlds and four non-producing gray moons use the symmetric central layout. Twelve relic sites remain; the center has none. All units stay visible under fog. Preview/local development controls are enabled with `?dev=1`. Start a new game on the experiment’s preview or a separate localhost port.

The archived 11.16 Alien Relics iteration used Probe and Research Stations. Those rules remain available only to pinned historical games. Current games use Probe and Excavate with the public relic row. Permanent capacity purchases and playtest annotations remain.

The 14.19 map uses radius 11 and balanced randomized home regions. Rich production and Terraforming Protocols are removed; Worldweaver Spore grants only immediate resources. Starter upgrades cost two of a selected resource type. Click Deck to browse grouped remaining cards without revealing or changing draw order.

Every newly gained card goes to discard, including unit orders and relic rewards. Normal draws and returns of already-owned cards keep their printed behavior.

The 15.20 experiment gives each side two Fire and two Screen tactics each battle, with hidden commitments and simultaneous reveal. Fleet attack 3/hull 7, Explorer 1/1, and Settler 1/2 (4 defending) are playtest values. Explorers may pay 1 Energy each to escape before tactics. Damage persists for up to three volleys. Defenders holding at the limit force retreat; trapped attacking survivors are destroyed. Pending choices and moving-order completion survive reload.

The 16.21 board reduced the map to radius 10 and 331 cells. Home centers move to radius 9, while all twelve full worlds, four moons and twelve relics remain. Fair-access and separation bounds stay the same; only the map size and its generated positions change.

The 19.24 experiment removes Prestige from Shipyards and purchased cards, adds point-breakdown controls, and exports full private game reports. Reports retain setup, actions, resources, combat, scoring, and Undo boundaries across reloads; missing history is explicitly partial. Older engines and policies remain archived.

The 20.25 preview keeps all world terrain public, independently hides unlocated relics and moons, and samples four evenly spread moon locations each new game. Reports retain survey knowledge changes. Start a new game on this experiment’s separate origin.

The 21.26 Scoring Bots experiment improves the local opponents’ scoring, movement, decks and resource planning without changing costs, topology, combat or victory. Full 20.25 engines and policy 16 remain available to pinned games.

The22.27 Probe Relics experiment separates terrain surveys from private relic discovery. See the canonical [discovery rules](rulebook.html#movement). It uses v22 saves and policy18 on a separate preview; full21.26 engines, manuals and policy17 remain available to pinned games.

The 23.28 Twenty Point Strategy experiment uses 20 points to win, 3 per Colony (no pair bonus), 2 per excavated relic, and 1 per qualifying combat victory. Paid +5 storage upgrades cost 1 of each resource, then 2 each, 3 each, and so on; free relic storage does not raise the paid tier. Save23 and native policy19 preserve full22.27 engines and policy18. Rivals use public threats to avoid exposed Settler moves, retreat, escort and gather Fleets, and improve opening production and starter upgrades. See [the evaluation plan](../../docs/rules/twenty-point-strategy.md).

The24.29 Nearest Probe correction lets an Explorer locate its nearest unlocated remaining relic from any hex. The action publishes no hidden target and does not survey terrain. Save24/rules29/native20 preserve full23.28 and policy19. Storage-planning work remains separate.

The25.30 Storage Planning experiment improves feasible reserves, public-production overflow forecasts, scoring-payment protection and pre-Buy capacity purchases. Funding overflow keeps the selected order’s payment consistently in browser and headless play. Human mechanics remain24.29. Save25/rules30/native21 archive24.29 and policy20. See [the evaluation plan](../../docs/rules/storage-planning.md).

The26.31 Single-use Orders experiment permanently trashes a successfully used Probe. Conversion still discards it, and failed or canceled attempts keep it. Save26/rules31/native22 preserve full25.30 and native21; policy weights remain unchanged. The25.30 balance study predates this change. See [single-use Probe](../../docs/rules/single-use-orders.md).
