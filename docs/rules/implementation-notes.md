# 6.11 baseline: decisions still to make

This is a maintainer audit, not additional player rules. The initial rulebook described `main` at `dd3cd49`. The [current rulebook](../../prototypes/galactic-reach/rulebook.html#clarifications) now also records the 7.12 Pass & Buy experiment. The 6.11 engine and manual are archived unchanged. Older quick help, the prototype README, and several printed cards did not match that implementation.

Before declaring the rules ready for tutorial production, review the following with the game designer. For each, either accept and clarify the behavior or propose a separate rules experiment with paired code, rulebook, card-text, and regression updates. Do not make those decisions implicitly in a docs PR.

| Area | Current behavior / discrepancy | Source |
| --- | --- | --- |
| Extra orders | Survey Drones has no extra range/filter; Gate Synchronization has no special move; Modular Construction, Orbital Shipyards, and Precursor Forge resolve one normal construction without the printed extras. | `movementRange`, `constructAt`, adapter `legalActions` |
| Hand choices | Foresight/Archive discard the first hand card automatically; Brokerage originally removed the first purchased basic in discard; 7.12 deliberately permits originals/upgrades too and updates the printed text; Uplink returns a basic but ends the action. | `resolveHumanSpecial` |
| Commerce | Trade Consortium performs one automatic 2:1 exchange (or gains Data); its conversion is 2 Data. Procurement gives a second buy without a discount. Manipulation replaces the first two market cards. | `resolveHumanSpecial`, `cardResources` callers, `useBuyEffect` |
| Production | A Colony does not own all seven hexes. Industrial Surge's local rival implementation selects three hexes across worlds, while the human/authoritative action selects a single world. | `canClaimStructureHex`, `produceAll`, `runAiOperation`, `resolveHumanSpecial` |
| Research | Research Stations consume Researchers and score Relics but neither claim/produce on their hex nor upgrade. A declared station upgrade cost is unused. | `buildResearchStation`, `buildUpgrade` |
| Occupation | Markers remain after departure; surrounding structures do not transfer with a captured center. | `executeMove`, `resolveCombat`, `colonizePlanet` |
| Retreat | A failed retreat logs a loss without removing surviving units. Civilian-only groups can receive tactic bonuses despite zero base power. | `resolveCombat`, `retreatFleet`, `tacticAttack` |
| Ties | Browser victory chooses the earliest seat after exact score ties; arena standings share rank. Policy ties use first-player seat parity, not a choice prompt. | `finishRound`, adapter `standings`, `enactPolicy` |

Open proposals such as voluntary resource discards and upgrading purchased basic cards are not current rules. The initial rulebook must not pre-adopt them. The tutorial should link to these decisions through its source rule sections and avoid teaching unresolved exceptions as deliberate strategy.

The 8.13 Resource Actions experiment resolves the Trade Consortium exception: its order explicitly chooses a resource gain or up to two chosen 2:1 exchanges. Its conversion remains 2 Data. The archived 6.11 and 7.12 behavior above is unchanged.
