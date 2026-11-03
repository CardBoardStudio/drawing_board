# Galactic Reach rules maintenance

The [canonical rulebook](../../prototypes/galactic-reach/rulebook.html) is the player-facing specification for **Galactic Reach 7.12 / Pass & Buy experiment**. It is semantic HTML so the exact reviewed source can ship unchanged, without a Markdown renderer or a second generated copy. Edit that file directly. Voidwright is outside this rulebook's scope.

## Read, change, verify

1. Read the relevant rulebook sections before implementing a PR. Describe the intended behavior and cite the section anchors in the PR template.
2. Pair every game-logic change with a meaningful rulebook change. For an implementation fix, add the missing clarification or concrete example. Keep the initial [known discrepancies](implementation-notes.md) explicit until deliberately resolved.
3. Update affected printed card text, quick help, tests, and (once built) tutorial steps. Clarifications alone must not change gameplay. Apply the [safe/breaking workflow](../playtest-workflow.md).
4. Run the applicable checks. Verify the rulebook on that PR's successful Render origin before review, then on the stable origin after adoption. Preserve anchors when reorganizing content.

The rulebook is authoritative for intended play. The initial version documents existing 6.11 behavior, including exceptions, without approving those exceptions as final design. An inconsistency is a review item, not permission to silently change rules or saves. Developer notes and old READMEs are not competing rules specifications.

## Where rules meet code

| Rulebook anchor | Implementation starting points | Behavior checks |
| --- | --- | --- |
| `#setup`, `#round` | `newState`, `generateGalaxy`, `beginRound`, `cleanupRound` in `app.js` | `test-long-reach.cjs`, `test-pass-and-buy.cjs`, `test-galactic-reach-dialogs.cjs` |
| `#resources`, `#orders`, `#movement` | `produceAll`, `cardResources`, `movementRange`, `reachableFrom`, `applyColonizeOrder` | `test-galactic-reach.cjs`, `test-long-reach.cjs` |
| `#building`, `#combat` | `constructAt`, `buildResearchStation`, `resolveCombat`, `colonizePlanet` | `test-galactic-reach.cjs` |
| `#trade`, `#buy` | `offerTrade`, `respondTrade`, `buyCard`, `upgradeStarter`, `decommission` | `test-galactic-reach.cjs`, `test-long-reach.cjs` |
| `#politics`, `#victory` | `enactPolicy`, `applyDirective`, `calculatePrestige`, `finishRound` | `test-long-reach.cjs`, `test-pass-and-buy.cjs`, `test-galactic-reach-dialogs.cjs` |
| `#cards`, `#clarifications` | card definitions, `resolveHumanSpecial`, `useBuyEffect`, `resolveCombat`; legal actions in `adapter.js` | relevant mechanic regression, added when resolving each discrepancy |

Engine files are under `prototypes/galactic-reach/`; check scripts are under `scripts/`. The Rust adapter in `crates/galactic-reach/` embeds the same JavaScript. Historical engines remain under `crates/galactic-reach/rules/`. Do not revise an archived ruleset's meaning to match the current manual.

## Publication and checks

- Local standalone preview: `python3 -m http.server 8000 --directory prototypes/galactic-reach`, then open `/rulebook.html` on that local server.
- `node scripts/check-rulebook.cjs` checks section links, expected rule version, and the link from the game. `node scripts/check-rulebook.cjs dist/galactic-reach` also verifies the build contains the exact source assets.
- `node scripts/test-rules-contract.cjs` exercises the CI policy. Locally run `node scripts/check-rules-contract.cjs origin/main --body-file /path/to/pr-body.md` against a drafted PR body; it includes tracked working-tree edits.
- GitHub's `Rules contract` job checks every PR's grounding declaration. Known rule-bearing paths require the canonical rulebook in the diff; a declaration of changed gameplay also requires it. UI-only changes inside shared engine files are conservatively included. A reviewer must still catch logic changes elsewhere and assess whether the document update is meaningful.
- `scripts/build-web.sh` copies the HTML and CSS directly into `dist/galactic-reach/`; Docker copies that same directory. No account, external publishing service, client script, or game save is needed to read rules.

The 7.12 experiment buys immediately on passing and permits starter trashing. The archived 6.11 manual and browser remain at `/galactic-reach/rules/6.11/`. Every deployment is a snapshot: a preview serves that PR's rulebook and the stable deployment serves the adopted rulebook. The new v7 guest keys and version-pinned tables isolate this experiment from ongoing games. The [tutorial brief](tutorial.md) is the next stage after rules review, not an implemented tutorial.
