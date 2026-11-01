# Galactic Reach playtest workflow

The repository uses two change lanes so an ongoing game can continue receiving safe fixes while incompatible rules ideas remain independently playable.

## Stable playtest lane

The open pull request **Add Galactic Reach browser prototype**, from `codex/add-galactic-reach-prototype` into `main`, is the stable playtest lane. Its verified Render preview is the default game link during the current playtest.

Commit only save-compatible changes to this lane:

- accessibility, responsive layout, and presentation improvements;
- wording and rules-reference clarification that does not change play;
- diagnostics, logging, and test coverage;
- bug fixes that restore the already-intended rule without changing saved-state meaning.

Apply the `playtest-safe` label. After each push, wait for GitHub checks and the Render deployment to succeed before sharing its `environment_url`.

## Breaking experiment lane

A change is breaking when it can invalidate an in-progress game or materially changes a player's available decisions. Examples include setup, board generation, phase order, card effects or costs, production, combat, scoring, victory conditions, component limits, and persisted-state structure or meaning.

For each such idea:

1. Update the local stable branch and create `codex/experiment-<short-name>` from that exact head.
2. Implement only that experiment and its supporting tests.
3. Open a pull request with base `codex/add-galactic-reach-prototype` and apply `playtest-breaking`.
4. Wait for checks and Render, then use that pull request's verified `environment_url` for the experiment.
5. Start a new game on the experiment preview. Because it has a different origin, its browser save is separate from the stable preview's save.
6. Continue the existing game only on the stable preview. Never redirect the stable URL to an experiment.

Keep one rules hypothesis per experimental pull request so testers can compare, abandon, or combine ideas deliberately.

## Adopting or rejecting an experiment

If the experiment is rejected, close its pull request. The stable lane and its saved game remain unchanged.

If the experiment is adopted:

1. Tell playtesters that merging it is a rules cutover and requires a new game.
2. Increment `SAVE_FORMAT_VERSION` in `prototypes/galactic-reach/app.js`. The save and turn-history storage keys derive from this value, so the new rules cannot accidentally load the prior ruleset's state.
3. Rebase or merge the latest stable-lane changes into the experiment and rerun checks.
4. Merge the experiment into the stable playtest branch.
5. Verify the stable pull request's new Render deployment and start a new stable game there.

Do not add a migration merely to preserve an incompatible game. Migrations are appropriate only when old state retains the same gameplay meaning.

## Pull request compatibility declaration

Every playtest pull request must select exactly one compatibility class in the pull request template:

- **Playtest-safe:** the current stable game can continue after deployment.
- **Playtest-breaking:** testers use the experiment preview and begin a new game.

If classification is uncertain, treat the change as breaking until it is proven save-compatible.
