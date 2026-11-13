# Central-world layout study

This is an offline map experiment against the local 17.22 Ten Prestige engine. It does not publish or change the browser game, saved games, or canonical rules. The canonical rulebook remains the specification for the control; this document specifies only the proposed setup intervention for simulation.

## Intended setup intervention, established before implementation

Keep the radius-10 board and homes at (-9,0), (0,-9), (9,0), and (0,9). Move the eight existing neutral worlds to the two unused corners, (9,-9) and (-9,9), and a symmetric six-world ring at (6,-3), (3,-6), (-3,-3), (-6,3), (-3,6), and (3,3). Add one seven-hex neutral world at (0,0). Place the four moons at (-3,0), (0,-3), (3,0), and (0,3), as in the approved diagram.

Randomly assign the eight existing neutral world identities, resource tiles, and relic sites to the eight outer neutral slots for each seed. Preserve the original resource tiles within each relocated world. Shuffle the added center world's seven tiles separately using the existing even-world resource composition: two Matter, two Energy, two Biomass, and one Data. Keep twelve relic sites and the existing twelve-card relic deck; the added center world has no relic. Homes, starter resources, costs, card effects, scoring, victory at 10, and browser AI policies stay unchanged.

## Rules grounding

- `prototypes/galactic-reach/rulebook.html#setup`: the sole rules intervention is world and moon placement plus the additional center world. The control has twelve worlds; the intervention has thirteen. All worlds retain seven hexes and all four moons remain single hexes.
- `prototypes/galactic-reach/rulebook.html#resources` and `#excavation`: production, non-producing moons, twelve relic sites, reward supply, excavation costs, and resource accounting remain unchanged.
- `prototypes/galactic-reach/rulebook.html#computer-rivals` and `#victory`: use the same corrected local rivals and 10-Prestige victory check in both conditions.

Any subsequent implementation or PR must update the canonical HTML rulebook meaningfully, isolate the incompatible setup in an experimental lane, and verify its Render preview. This study does not authorize publication or merging.

## Comparison design

Use the previous study's 64 independent seeds, three duplicated-strategy lineups and all four seat rotations: 768 mixed games per map. Add 96 mirror games, with all four players using the same profile. Repeat the previous 16-seed resource-gift experiment on the proposed map: +2 of one resource at round 1 or 10, with a no-gift matched control, each focal strategy rotated through every home.

Generate each original game normally, including its original random map, resource tiles, decks, and shuffle state. Before production, relocate its terrain for the intervention using an independent deterministic map RNG. Thus each pair starts with identical player decks, market/relic-deck order, game RNG position, homes, and resources. The eight relocated worlds keep exactly their original tile composition. The independent map RNG only assigns identities to slots and shuffles the added world's tiles; it never advances the gameplay RNG. Later draws may diverge because map-dependent decisions consume cards differently.

Reuse the prior study's exact resource ledger and browser policy harness. Validate representative control games byte-for-byte against their saved results, map invariants across 1,000 seeds, initial-state parity between paired maps, and instrumented versus uninstrumented play. Count only completed games as victories. Report seed-block bootstrap intervals for paired changes; games sharing a seed are not independent samples. These are heuristic-bot results, not estimates of optimal human strategy.
