# Project instructions

## Canonical live site

- Drawing Board deployments on Render are the canonical live playtest sites for this repository.
- Never present a `chatgpt.site` deployment as the project's live game site.
- The stable Drawing Board deployment is <https://drawing-board-p0g3.onrender.com/>.
- When work is on an unmerged branch, use that branch's successful Render preview URL so the link contains the latest changes. For the current Galactic Reach branch (`codex/add-galactic-reach-prototype`, PR #3), that URL is <https://drawing-board-pr-3.onrender.com/>, and the game is at <https://drawing-board-pr-3.onrender.com/galactic-reach/>.
- Before giving the user a live link, verify the latest successful GitHub deployment status and use its `environment_url`; Render preview URLs can change when the PR or service changes.
- Publishing changes means pushing them to GitHub and confirming the corresponding Render deployment. Do not publish or redirect users to a ChatGPT-hosted Sites copy unless the user explicitly requests it.

## Playtest change lanes

- Treat `codex/add-galactic-reach-prototype` and its open pull request, **Add Galactic Reach browser prototype**, as the stable playtest lane. Keep it playable and save-compatible while a game is in progress.
- Commit non-breaking work directly to the stable lane. This includes accessibility and layout improvements, copy clarification, diagnostics, and bug fixes that do not alter legal moves, setup, scoring, economy, board topology, card contents, or saved-state meaning.
- Put every breaking rules experiment on its own `codex/experiment-<short-name>` branch created from the latest stable-lane head. Open its pull request against `codex/add-galactic-reach-prototype`, not `main`, and apply the `playtest-breaking` label.
- A change is breaking when it can invalidate an ongoing game or materially changes player decisions: setup, map generation, turn or phase structure, card effects or costs, resource production, combat, scoring, victory conditions, component limits, or persisted state shape/meaning.
- Use the experiment pull request's successful Render `environment_url` to test that ruleset. Its distinct origin gives it an independent browser save. Start a new game there; do not overwrite or redirect the stable playtest URL.
- Keep rejected experiments separate and close their pull requests. To adopt an experiment, announce the playtest reset, increment the Galactic Reach save-format version and storage keys, merge the experiment into the stable lane, then verify and share the stable lane's new Render deployment.
- Apply the `playtest-safe` label to save-compatible pull requests and `playtest-breaking` to rules experiments. Never mix both categories in one pull request.
- Follow [the playtest branching workflow](docs/playtest-workflow.md) for branch, preview, promotion, and reset details.
