# Galactic Reach playtest workflow

## Stable lane

`main` is the stable lane following the promotion of Long Reach 6.11 in [PR #16](https://github.com/CardBoardStudio/drawing_board/pull/16). PR #3 and the later promotion PR are closed. Do not use their old preview URLs or target their historical branch for new work.

Create save-compatible work on `codex/<short-name>` from latest `origin/main`, open a PR against `main`, and apply `playtest-safe`. This includes accessibility, layout, wording, diagnostics, and fixes that preserve available decisions and saved-state meaning. Keep existing guest saves, pinned tables, and replays playable.

## Rules contract for every PR

Read the [canonical rulebook](../prototypes/galactic-reach/rulebook.html) and [maintenance guide](rules/README.md). Cite its section anchors in the PR and explain the gameplay impact. Any game-logic change requires a meaningful rulebook update in that same PR, including a bug fix that restores intended behavior. Clarify the restored rule or give an edge-case example.

The `Rules contract` check requires a grounding declaration and pairs changes in known engine paths with the canonical document. It does not prove semantic agreement: reviewers must compare rules, code, card text, and tests. Work unrelated to Galactic Reach must explain its exclusion and cite its own specification.

## Breaking experiments

A change is breaking if it can invalidate a game or materially change a player's decisions: setup, map generation, turn order, legal actions, card effects/costs, production, combat, scoring, victory, component limits, or saved-state meaning. If uncertain, treat it as breaking until proven compatible.

1. Create `codex/experiment-<short-name>` from latest `origin/main`.
2. Describe one rules hypothesis in the rulebook and PR, then implement it with supporting behavior tests.
3. Open a PR against `main` and apply `playtest-breaking`.
4. Keep the game and rulebook version declarations aligned. Label experimental rules as experimental on their preview.
5. Wait for checks and the Render preview; inspect GitHub deployment statuses for that head commit and use the successful `environment_url`.
6. Start a new game on that origin. Keep existing play on the stable origin; never redirect stable saves into an experiment.

## Preview verification

Every rules PR ships the edited source document to `/galactic-reach/rulebook.html` beside that PR's game. Open both without signing in. Check the game's Rules dialog link, rulebook navigation and narrow layout, and any changed mechanic. Include both verified URLs in the PR. Each player-facing preview must also show “What’s new in this playtest,” with the current PR’s changes and rulebook links. Verify that panel at the same time. Do not skip Render previews for documentation-only rules changes.

`scripts/build-web.sh` packages the rulebook and its stylesheet; `scripts/check-rulebook.cjs` verifies source and deployed asset contracts. The container smoke requests the rulebook and checks its version marker so a fallback HTML response cannot masquerade as a successful deployment.

## Adopt or reject

Rejected experiments remain separate; close their PRs without changing stable play. Adoption requires an explicit decision and a playtest reset announcement before merge.

Before adopting an incompatible ruleset, increment `SAVE_FORMAT_VERSION` and `RULES_REVISION` in the live engine as needed, keep browser/adapter/Rust/table declarations aligned, and update the rulebook version. Guest save and undo keys derive from the format version. Preserve existing supported engines and archived browser bundles so pinned tables and replays retain their original meaning. Test old and new versions; do not introduce a migration unless the old state means exactly the same thing.

Select exactly one compatibility label: `playtest-safe` or `playtest-breaking`. After merge, verify the new successful stable deployment and share its game and rulebook URLs. Start new games for the new ruleset. A PR being ready does not itself authorize a merge.
