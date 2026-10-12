# Galactic Reach balance simulation — balance pass 1

Date: October 11, 2026

## Changes tested

- All starting Shipyard hexes produce Energy, removing the initial resource-type mismatch.
- Victory requires 10 Prestige instead of 15.
- Every eight purchased cards grant 1 permanent Prestige, making deck-building the favored path.
- Every 10 unspent influence grants 1 Prestige.
- Each Colony grants 1 Prestige, with a 1-Prestige frontier bonus for every two Colonies beyond the home world.
- Every pair of Shipyards grants 1 Prestige.
- Fleet Supremacy and Occupation Mandate grant 2 Prestige; Galactic Reach grants 1.
- Expansion AI prioritizes replacement Scouts instead of Dreadnoughts.

## Method

- 72 seeded four-player AI games with fleet production enabled in the final tuning run.
- 72 matched games without fleet production were retained as a control.
- Each game ran for up to 24 rounds.
- Military, Economy, and Expansion AI strategies were rotated evenly across all four seats.
- Policy votes and directives were automated according to each AI's strategy.
- The simulator does not model human negotiation, so Culture and player-to-player trading are not represented fairly.

The reusable harness is `scripts/balance-simulations.cjs`.

## Final results

| Strategy | Win share | Mean Prestige | Mean cards purchased | Mean fleet income |
|---|---:|---:|---:|---:|
| Economy / deck-building | 40.8% | 8.64 | 20.20 | 7.45 |
| Military | 35.2% | 7.79 | 14.92 | 12.35 |
| Expansion | 23.9% | 6.64 | 14.79 | 9.82 |

Deck-building is now the strongest route, but only 5.6 percentage points ahead of Military in the final sample. Expansion remains viable and wins nearly one quarter of completed games.

Seat results also showed a meaningful positional gap:

| Seat | Win share | Mean Prestige | Fleet resources gained |
|---|---:|---:|---:|
| 1 | 19.7% | 7.38 | 10.90 |
| 2 | 25.4% | 7.97 | 10.78 |
| 3 | 14.1% | 7.17 | 8.67 |
| 4 | 40.8% | 8.24 | 9.15 |

Starting fleet income is much more even after normalizing every starting Shipyard to Energy. Seat 4 still has a significant win-rate advantage despite comparable fleet income, indicating that map routes or world placement—not the starting resource—remain asymmetric.

Combat remains uncommon at 1.96 conflicts per completed game, and conquest is still rare. Military remains competitive mainly through Fleet Supremacy and paired Shipyards rather than capturing Colonies.

Victory pacing improved substantially: 71 of 72 fleet-production games finished by round 24, with a mean finish in round 19.83. This is still a long game in physical turns, so live playtests should determine whether the target should eventually move from 10 to 9.

## Remaining watch items

1. Seat 4's route advantage and Seat 3's disadvantage.
2. Low combat and conquest frequency.
3. Culture is underrepresented because the simulator cannot negotiate player trades.
4. Deck-building should remain slightly favored, but the eight-card milestone may need adjustment after human playtests reveal how often Procurement and Decommission are used.
