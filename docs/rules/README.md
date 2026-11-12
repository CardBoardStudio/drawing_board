# Galactic Reach rules maintenance

The [canonical rulebook](../../prototypes/galactic-reach/rulebook.html) is the player-facing specification for **Galactic Reach 16.21 / Compact Frontier experiment**. It is semantic HTML so the exact reviewed source can ship unchanged, without a Markdown renderer or a second generated copy. Edit that file directly. Voidwright is outside this rulebook's scope.

## Read, change, verify

1. Read the relevant rulebook sections before implementing a PR. Describe the intended behavior and cite the section anchors in the PR template.
2. Pair every game-logic change with a meaningful rulebook change. For an implementation fix, add the missing clarification or concrete example. Keep the initial [known discrepancies](implementation-notes.md) explicit until deliberately resolved.
3. Update affected printed card text, quick help, tests, and (once built) tutorial steps. Clarifications alone must not change gameplay. Apply the [safe/breaking workflow](../playtest-workflow.md).
4. Run the applicable checks. Verify the rulebook on that PR's successful Render origin before review, then on the stable origin after adoption. Preserve anchors when reorganizing content.

The rulebook is authoritative for intended play. The initial version documents existing 6.11 behavior, including exceptions, without approving those exceptions as final design. An inconsistency is a review item, not permission to silently change rules or saves. Developer notes and old READMEs are not competing rules specifications.

## Where rules meet code

| Rulebook anchor | Implementation starting points | Behavior checks |
| --- | --- | --- |
| `#setup`, `#round` | `newState`, `generateGalaxy`, `beginRound`, `cleanupRound` in `app.js` | `test-long-reach.cjs`, `test-pass-and-buy.cjs`, `test-resource-actions.cjs`, `test-galactic-reach-dialogs.cjs` |
| `#resources`, `#orders`, `#movement` | `produceAll`, `cardResources`, `movementRange`, `reachableFrom`, `applyColonizeOrder` | `test-galactic-reach.cjs`, `test-long-reach.cjs` |
| `#building`, `#combat` | `constructAt`, `excavate`, `resolveCombat`, `colonizePlanet` | `test-galactic-reach.cjs` |
| `#resources`, `#trade`, `#buy` | `offerTrade`, `respondTrade`, `buyCard`, `upgradeStarter`, `decommission`, `increaseStorage` | `test-galactic-reach.cjs`, `test-long-reach.cjs` |
| `#politics`, `#victory` | `cleanupRound`, `calculatePrestige`, `finishRound` | `test-long-reach.cjs`, `test-pass-and-buy.cjs`, `test-resource-actions.cjs`, `test-galactic-reach-dialogs.cjs` |
| `#cards`, `#clarifications` | card definitions, `resolveHumanSpecial`, `useBuyEffect`, `resolveCombat`; legal actions in `adapter.js` | relevant mechanic regression, added when resolving each discrepancy |

Engine files are under `prototypes/galactic-reach/`; check scripts are under `scripts/`. The Rust adapter in `crates/galactic-reach/` embeds the same JavaScript. Historical engines remain under `crates/galactic-reach/rules/`. Do not revise an archived ruleset's meaning to match the current manual.

## Publication and checks

- Local standalone preview: `python3 -m http.server 8000 --directory prototypes/galactic-reach`, then open `/rulebook.html` on that local server.
- `node scripts/check-rulebook.cjs` checks section links, expected rule version, and the link from the game. `node scripts/check-rulebook.cjs dist/galactic-reach` also verifies the build contains the exact source assets.
- `node scripts/test-rules-contract.cjs` exercises the CI policy. Locally run `node scripts/check-rules-contract.cjs origin/main --body-file /path/to/pr-body.md` against a drafted PR body; it includes tracked working-tree edits.
- GitHub's `Rules contract` job checks every PR's grounding declaration. Known rule-bearing paths require the canonical rulebook in the diff; a declaration of changed gameplay also requires it. UI-only changes inside shared engine files are conservatively included. A reviewer must still catch logic changes elsewhere and assess whether the document update is meaningful.
- `scripts/build-web.sh` copies the HTML and CSS directly into `dist/galactic-reach/`; Docker copies that same directory. No account, external publishing service, client script, or game save is needed to read rules.

The 9.14 experiment removes influence and policy voting. Settlers replace Scouts at movement 1, Explorers replace Researchers at movement 3, and Frigates move 2. Each faction starts with a Colony and one Settler on it, without a Shipyard. Resource directives and the 8.13 resource actions remain. Archived engines and manuals preserve earlier games, and v9 guest keys isolate new games. The [tutorial brief](tutorial.md) is the next stage after rules review, not an implemented tutorial.

## Preview change summaries

Every player-facing preview has a visible “What’s new in this playtest” summary in the game. Update it for the PR’s changes, link the relevant rulebook sections, and state when testers need a new game. Keep it concise and distinguish a stacked PR’s additions from its parent. Verify it on localhost and the successful Render preview; review the wording again when adopting the change.

The 10.15 iteration removes Research Stations, Dreadnoughts, Gates, and Gate Synchronization. Fleet replaces Frigate at movement 2. Capacity grows by 5 for 2 Matter, 1 Energy, and 1 Data during Operations or Buy without using a card, action, purchase, or map hex. Explorers recover relics for the former station cost using Construct, and three recoveries unlock relic exchanges. The complete 9.14 rules remain archived; new games use v10 saves.

The 11.16 revision overrides the earlier Relic infrastructure. Start with only a Colony and a six-card deck; commission all units at Shipyards. Settler and Explorer purchases grant Colonize and Probe respectively, outside the basic market. Research Stations grant 1 Prestige and an immediate private draw from the 12-card alien deck; inventory, recovery counters, and exchanges are gone. The 11.16 saves use v11 and prior 10.15 assets and AI policies remain archived.

The 12.17 playtest removes public awards and council directives, reduces the resource panel, permits discovery by every ship type, and prices each trash at three of one chosen resource type. Full resource gains remain stored until the owning player chooses the excess discards, including across reloads. New guest saves use v12; 11.16 browser assets and policy-v7 agents remain archived.

The 13.18 experiment removes stations, replaces Explorer-bundled Probe with Excavate directly in hand, and uses a public three-card relic row. Excavation costs 1 Matter, 1 Energy, and 2 Data, keeps the Explorer, removes the site, grants one permanent Prestige and the chosen relic to hand, and trashes Excavate. The map has 12 worlds, four non-producing moons, and 12 relics with separated terrain. All units remain visible under fog; the preview-only development reveal changes only local rendering. Complete 12.17 assets and policy-v8 remain immutable.

The 14.19 Fair Frontier experiment consumes one Explorer per successful excavation, prices starter upgrades at two of a selected resource type, removes Rich and Terraforming Protocols, and allows private unordered deck inspection. Worldweaver Spore retains its one-time resource gain. Complete 13.18 browser assets and policy-v9 remain immutable.

The radius-11 map has 397 cells. Generation places two inner worlds and one moon in each unique-nearest-home region. Near worlds are 5–6 center steps from home; the other world is 7–9. Nearest-world and nearest-moon distances differ by at most one step across factions; second-nearest-world distances differ by at most two. Worlds have center gaps of at least four, moons stay at least three from world centers and two from each other, and every board cell is within six steps of terrain. Bounded random retries use a validated balanced fallback. These numerical bounds are regression-tested over 1,000 seeds and adversarial constant random sources.

Every newly gained card in 14.19 enters discard and must reach hand through normal shuffle/draw before use, including both unit bundles and relic rewards. A single gainCard primitive enforces this default. Draws and returns of already-owned cards keep their printed effects. This supersedes 13.18’s immediate-hand Explorer bundle and relic reward.

The 15.20 Tactical Combat experiment replaces random military draws with two Fire and two Screen tactics per battle, consumed only after simultaneous secret reveal. Test values are Fleet attack 3/hull 7, Explorer 1/1, Settler 1/2 (4 defending), with Fire +1 and Screen 2. Attack is the sum of surviving piece attack, rather than the old quarter-power formula. Paid Explorer escape precedes commitments. Serializable combat and moving-order continuation preserve each stage across reloads and defer Operations completion exactly once. Forced retreats check adjacent safety and full-group capacity; trapped attackers are destroyed. War-Song and Obelisk offensive bonuses require a Fleet. Complete 14.19 assets and policy 10 remain immutable.

The 16.21 Compact Frontier experiment reduces the board to radius 10 (331 cells), with homes at radius 9. Twelve complete worlds, four moons and twelve relics remain. The existing fairness bands and bounds are retained: near-world center distances 5–6, second-world band 7–9, common two-distance moon bands, nearest-world/moon spread at most 1, second-nearest-world spread at most 2, terrain gaps and coverage at most 6. The radius 7 inner pools and the bounded-retry fallback are validated for the smaller board. Complete 15.20 browser assets and policy 11 remain immutable. No other mechanic changes.
