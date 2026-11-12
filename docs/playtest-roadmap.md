# Playtest roadmap

## Implemented in the 21.26 Scoring Bots experiment

- Improve rivals’ ability to earn Prestige through Colonies, relics and favorable combat; coordinate units and preserve useful orders/resources.
- Rerun matched strategy and resource simulations against the exact 20.25 baseline, including head-to-head checks.

Status: implementation and validation in progress. Existing20.25 games keep their archived rivals.

## Implemented in the 20.25 Open Worlds experiment

- Keep all planets visible to all players at all times, with resources, ownership, and buildings public. Hide only undiscovered moons and unlocated relic sites on the map. Keep private relic signals distinct from public surveys.
- Randomize the four moons while keeping them widely spaced, fairly distributed across the map, and at comparable travel distances from each home. Preserve the approved thirteen-world layout.

Status: implemented; new-game experiment preserves 19.24 tables and reports.

## Implemented in the 19.24 Game Reports experiment

- **Export game report:** add a visible button to download a JSON report containing the current saved position, rules version, round/phase, factions and bot profiles, scores and scoring breakdowns, resources, and the available game log. Include readable log text so a completed human-versus-bot game can be reviewed alongside its final position.
- **Full game logging:** retain the complete history from setup through victory for new games, covering every faction's turns, actions and outcomes. Identify the round, phase and acting faction; include resource changes, conversions, construction, movement, colonization, excavation, trades, purchases, combat outcomes and Prestige awards. Preserve the history across reloads and record undo boundaries. The visible Comms Feed can remain compact while the exported history stays complete.
- **History completeness:** existing saves export their retained events and clearly mark earlier history as incomplete. Full recording begins with new games; starting another game starts a separate history.
- **Clickable point totals:** click a faction's point total to see its Prestige breakdown by scoring source.
- **Remove Shipyard points:** Shipyards no longer grant Prestige, including the current point per pair.
- **Remove card points:** purchased cards no longer grant Prestige, including the current point per eight lifetime purchases.

Status: implemented in 19.24. Start a new game for the revised scoring and complete history. Earlier tables keep their archived rules.

## Historical planning

Historical planning snapshot: PR #5 was adopted and Long Reach 6.11 reached `main` in PR #16. Use the [current workflow](playtest-workflow.md) for new branches and the [canonical rules maintenance guide](rules/README.md) for rules changes. The statuses and numbered follow-ups below describe the earlier planning stage.

This repository has three related pull requests with deliberately different jobs:

| Pull request | Lane | Purpose | State |
| --- | --- | --- | --- |
| [#3](https://github.com/CardBoardStudio/drawing_board/pull/3) | Stable prototype | Galactic Reach browser game, local rivals, board rules, and guest saves | Merged to `main` |
| [#4](https://github.com/CardBoardStudio/drawing_board/pull/4) | Platform foundation | Shared library, accounts, invitations, saved tables, two game adapters, AI arena, and owner-scoped Elo | Merged into the stable lane |
| [#5](https://github.com/CardBoardStudio/drawing_board/pull/5) | Breaking experiment | Galactic Reach 6.11 rules, pinned table versions, placement Elo, calibration, ranked games, and step-through replays | Adoption candidate |

PR #5 targets the stable lane after #4. It is an integration experiment because the new rules, table versioning, arena pool, and replay browser need the account and arena foundation together. The work inside #5 is organized into four review slices:

1. **Rules and player experience** — the larger randomized map, 20-Prestige target, movement minimums, upgraded starter orders, open offers, larger resource/key UI, direct card orders, and hex-anchored Sector Scan.
2. **Versioned saved tables** — `galactic-reach/6.11` uses save format 6 and rules revision 11. Existing 4.9 and 5.10 tables retain their engines and open from archived asset bundles. A table displays its pinned version and rejects a cross-version save.
3. **Arena calibration and placement Elo** — four version-3 policies run authoritative 20-game calibrations. Final standings use Prestige, colonies, and stored resources; pairwise Elo therefore reflects second, third, and fourth place as well as first.
4. **Interestingness and replay** — completed AI games are ranked by lead changes, battles, and finish closeness. The replay view exposes the board, resources, hands, log, action frames, round jumps, autoplay, and final Elo changes. Replays are owner-scoped and verified against the recorded result before caching.

## Proposed follow-up PRs

These are the next logical changes after the PR #5 playtest. Each should remain small enough to review and should target the branch that has actually been adopted.

### PR 6 — 6.11 playtest fixes

Base this on the tested PR #5 commit. Include only bugs, accessibility fixes, copy, layout, and replay navigation issues found during playtest. Keep the 6.11 rules and save meaning unchanged, and use the `playtest-safe` label.

### PR 7 — promote the accepted ruleset

If the playtest is accepted, rebase the experiment on the latest platform foundation, announce the save cutover, and promote 6.11 to the stable Galactic Reach lane. Verify the new stable deployment before asking players to start fresh tables. If the rules are rejected, close #5 and leave the stable 5.10 lane untouched.

### PR 8 — calibrated AI opponents in human tables

Let a table owner choose one of their calibrated AI accounts as a Galactic Reach opponent. Reuse the existing `PlayerAgent` contract and owner checks, but keep human tables separate from rated arena matches. Define what happens when a policy version is unavailable before changing table saves.

### PR 9 — deployment and operations hardening

Make the local/Tailscale test service repeatable: documented port selection, isolated database and cookie prefixes per rules version, backup/restore checks, health diagnostics, and a verified preview or local test link. Keep public exposure opt-in and separate from the stable service.

## Done criteria for the current playtest

- CI passes for formatting, tests, Clippy, Wasm, release build, container smoke, and browser assets.
- A new account can create a 6.11 table and sees its version in the shelf, table bar, and game header.
- The same account can reopen 4.9 and 5.10 tables and the loader keeps each on its archived engine.
- The arena shows separate 5.10 and 6.11 pools, 20 games per calibrated profile, placement-based Elo, and the ranked replay list.
- At least one replay can be opened, stepped backward and forward, jumped by round, and taken to the final Elo view on desktop and mobile.
- The existing stable and 5.10 local services remain playable throughout the experiment.

The companion tracking issue records the remaining decisions and links the next implementation work: [Playtest roadmap after PR #5](https://github.com/CardBoardStudio/drawing_board/issues/6).

## Streamlined Reach 12.17 requested modifications

- Remove public awards and their Prestige.
- Compact the Your Command resource totals and remove their descriptions.
- Remove the council directive and its resource bonuses.
- Trash each eligible discarded card for three of one chosen resource type.
- Collect full gains and let the player choose excess-resource discards.
- Let Settlers, Fleets, and Explorers discover worlds.

## Implemented in the 13.18 excavation experiment

These requests follow the six-change 12.17 playtest and are implemented together in the 13.18 experiment.

- Remove Research Stations.
- Purchasing an Explorer adds an Excavate card directly to that player's hand.
- Excavate collects a relic, removes it from the board, and grants a relic-deck card into the player's hand. Trash the Excavate card immediately after use.
- Replace the random relic draw with a visible row of three relic cards. The excavating player chooses one.
- Increase the map to eight inner worlds and four home worlds, for twelve worlds total.
- Add single gray Moons that produce no resources. Relics may appear on planet hexes and moons.
- Keep at least one empty space tile between separate worlds and moons, and between moons. Larger gaps are allowed.
- Add a development-only Reveal entire map toggle for worlds, moons, relics, resources, buildings, and units. Switching it off restores normal fog of war.
- Keep every player's units visible to every other player, including in unexplored regions and empty space, independently of the development toggle. Map icons and Sector Scan must agree.

Confirmed defaults: excavation costs 1 Matter, 1 Energy, and 2 Data; keep the Explorer; gain 1 permanent Prestige; four moons and twelve relics total; refill the chosen row slot immediately. Trash the used Excavate card.

## Implemented in the 14.19 Fair Frontier experiment

- Make the player's **Deck** count clickable to inspect the cards currently in that deck. Show card identities and quantities grouped or sorted, without revealing their draw order.
- Keep world and moon positions randomized, but distribute each fairly evenly across the map. Give every starting faction comparable access and travel distances to nearby worlds and moons; avoid excessive clustering or large underserved regions while preserving the minimum empty-space gaps.
- Remove the Rich planet mechanic, its ★ markers, and its extra production bonus. Keep those planet hexes as ordinary resource planets, and update affected card effects and rules consistently.
- Reduce the map by one hex on every side: board radius 12 → 11. Fit the home worlds, randomized inner worlds, and moons inside the smaller board while preserving fair access and minimum empty-space gaps.
- Change each starter upgrade from 1 Data to two of one chosen resource type, as confirmed by the user.
- On successful excavation, consume one Explorer at the relic site as well as permanently trashing the used Excavate card. This supersedes the 13.18 rule that keeps the Explorer; unsuccessful or canceled choices consume neither.

Confirmed card treatment: remove Terraforming Protocols from the new market; Worldweaver Spore keeps its immediate gain from up to two unoccupied owned planet hexes, without a permanent production effect.

- All newly gained cards enter discard by default: unit-bundled orders (including Excavate), relic rewards, and purchases. Drawing/shuffling owned cards and returning an existing card to hand keep their printed behavior. No gain-to-hand exceptions are introduced.

## Implemented in the 15.20 Tactical Combat experiment

- Replace the shuffled military deck with two Concentrated Fire and two Defensive Screen per side per battle. Secret commitments reveal together, consume cards, and offer no replacement draws. Maximum three volleys.
- Try Fleet attack 3/hull 7, Explorer 1/1, Settler 1/2 (4 defending), Fire +1 and Screen 2. Damage is the direct surviving attack sum, simultaneous, and persists between volleys.
- Before tactics, allow paid adjacent Explorer escape at 1 Energy per Explorer, respecting safety and unit capacity. Remaining mixed-group ships fight.
- Require a Fleet for War-Song and Obelisk’s largest offensive bonuses; keep normal reactions automatic.
- After three volleys defenders hold. Attackers retreat to a safe adjacent hex with room or are destroyed. Remove power-ratio automatic retreats; preserve Emergency Jump’s printed condition.
- Pause human or AI Operations for a serializable battle continuation, including human defense during an AI turn. Keep commitments private and complete the original Move exactly once.
- Show available tactics, public used cards and unit damage, plus base/bonus/shield breakdowns. Preserve 14.19 tables/replays and policy 10.

- Put the shared relic row in a dedicated Relics console tab. Browse anytime; starting or targeting a valid excavation site opens it automatically. Keep payment help, disabled unaffordable choices, resource conversions through Hand, and cancellation together without changing excavation mechanics.

## Implemented in the 16.21 Compact Frontier experiment

- Shrink the board by one hex on every side: radius 11/397 cells → radius 10/331 cells. Keep twelve complete worlds, four moons, twelve relics and comparable access, with the same separation and fairness bounds. Preserve 15.20 games and policy 11; change no other mechanics.
