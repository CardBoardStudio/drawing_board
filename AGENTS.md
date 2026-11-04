# Project instructions

## GitHub identity

- Every GitHub write, including commits, pushes, PRs, comments, labels, and merges, must use `bitswell`. Never use `willemneal` or its credentials, even if the local defaults point there. Do not add co-author trailers for that account or an AI agent.
- Run every GitHub CLI/API call through `~/.config/bitswell/gh-bitswell gh <args>`. The wrapper injects the token from 1Password only for that command. Never print, persist, export, or paste the token; do not read, list, or explore other 1Password items.
- Set this repository's commit identity to `bitswell` / `96487943+bitswell@users.noreply.github.com`. Use HTTPS remotes, never SSH. Reset this repo's GitHub credential helper with `git config credential.https://github.com.helper ''`, then add `~/.config/bitswell/git-credential-bitswell` with `git config --add credential.https://github.com.helper ~/.config/bitswell/git-credential-bitswell`.
- Before the first write, verify that `~/.config/bitswell/gh-bitswell gh api user --jq .login` reports `bitswell`, `git config user.email` reports its noreply address, and `git remote -v` contains HTTPS URLs. If any check fails, or 1Password reports an authentication or network error, stop and report it. Never fall back to another account.
- Do not merge without explicit user authorization. Do not write to upstream or third-party repositories unless the user names them.

## Ground every PR in the rules

- Read the [canonical Galactic Reach rulebook](prototypes/galactic-reach/rulebook.html) and [rules maintenance guide](docs/rules/README.md) before planning changes. The HTML is the editable source document, served unchanged at `/galactic-reach/rulebook.html`; do not create a second copy of its rules in Markdown, a tutorial, or a generated site.
- Every PR must cite the relevant rulebook section anchors in **Rules grounding** and explain how the change follows them. If the work is unrelated to Galactic Reach (for example, Voidwright or account infrastructure), explicitly explain why the rulebook does not apply and cite the applicable existing specification instead.
- Any change to Galactic Reach game logic MUST include a meaningful update to the canonical rulebook in the same PR. This includes fixes, setup, legal actions, automatic resolution, costs, card effects, production, AI-specific rule behavior, scoring, victory, and saved-state meaning. For a fix restoring a rule, clarify that rule or add the edge-case example. Tests and changelogs alone do not satisfy this requirement.
- Establish the intended rule in prose before implementing it. Keep rules, implementation, printed card/help text, and behavior tests consistent. If they disagree, record the discrepancy and resolve the intended behavior explicitly; do not silently turn an implementation accident or proposed idea into a new rule. The initial 6.11 baseline records existing exceptions in [implementation notes](docs/rules/implementation-notes.md).
- Keep the rulebook approachable: lead with what a player does, use short sentences and concrete examples, put costs in tables and exceptions in the reference, and preserve section anchors. Keep developer details in `docs/rules/`, not the player's learning flow.
- The PR template and `Rules contract` CI check enforce grounding and paired rulebook edits for known rule-bearing paths. The path check is conservative and cannot infer semantics; shared engine files require a useful rulebook clarification even for presentation-only edits. Reviewers must also inspect logic changes outside those paths. Do not bypass the gate or make cosmetic rules edits to satisfy it.
- The tutorial is future work. Follow the [tutorial brief](docs/rules/tutorial.md) after the rules and known discrepancies are reviewed; teach the canonical sections through the real engine, and update tutorial steps in the same PR whenever their rules change.

## Canonical live site and rulebook

- Drawing Board deployments on Render are the canonical live playtest sites. Never present a `chatgpt.site` deployment as the live game or rulebook unless the user explicitly requests that separate host.
- The stable deployment is <https://drawing-board-p0g3.onrender.com/>. Before sharing any live link, verify the latest successful GitHub deployment status for the intended commit and use its `environment_url`; preview URLs can change.
- An unmerged PR must link to its own successful Render deployment, including `/galactic-reach/rulebook.html` on that same origin. Do not link a preview game to `main`'s rules or a hard-coded old PR preview.
- The build must package the canonical rulebook and stylesheet with the game. Verify anonymous access, game-to-rules navigation, section links, and a narrow viewport. Rules changes need a preview just like code changes; never add `render-preview-skip` to a rules PR.
- Publishing means pushing to GitHub and confirming the corresponding Render deployment. Opening a PR does not authorize merging it. Report missing or failed deployments honestly.

## Make preview changes visible

- Every player-facing preview must show a visible **What’s new in this playtest** summary in the game. Name the changes a player should try, link the relevant canonical rules, and clearly identify experiments that require a new game. Use short player-facing language, not implementation details.
- Update the summary in the same PR as gameplay or UI changes, including stacked PRs. Describe the current PR’s additions so testers can distinguish them from its base. Keep the preview’s game, rulebook, version badge, and change summary aligned.
- Verify the summary on both localhost and the successful Render preview. Include it in the PR’s verification notes. During adoption, review its wording for the stable release; do not leave obsolete experiment claims.

## Playtest change lanes

- `main` is the current stable lane: Long Reach 6.11 was promoted in PR #16. The former `codex/add-galactic-reach-prototype` lane has merged; do not target it or a closed PR by default. If a new stable playtest lane is explicitly established, update this file and the workflow together.
- Use a `codex/<short-name>` branch from latest `origin/main` and a PR into `main` for save-compatible work. Apply `playtest-safe`. Examples: layout, accessibility, wording, diagnostics, and fixes that do not change legal decisions or saved-state meaning.
- Put every breaking rules experiment on its own `codex/experiment-<short-name>` branch from the latest stable head, target `main`, and apply `playtest-breaking`. Never mix both labels. A change is breaking if it can invalidate an ongoing game or materially change player decisions, including setup, topology, phases, economy, combat, card contents, scoring, victory, limits, or persisted state meaning.
- Test experiments only on their successful Render preview and start a new game there. The distinct origin keeps guest saves separate. Preserve pinned table versions and their archived engines; never redirect an existing game to an incompatible ruleset.
- To adopt an experiment, announce the reset, increment `SAVE_FORMAT_VERSION` and `RULES_REVISION` as appropriate, update all version declarations and derived storage keys, preserve supported old engines/assets, then verify the stable deployment after merge. Close rejected experiment PRs without changing stable play.
- Follow [the playtest branching workflow](docs/playtest-workflow.md) for preview and promotion details.

## Verification

- Run `node scripts/test-rules-contract.cjs` and `node scripts/check-rulebook.cjs` for rules/tooling edits. Run the check against `dist/galactic-reach` after `./scripts/build-web.sh` to verify packaged assets too.
- Run the relevant Galactic Reach mechanic, dialog, and replay suites for changes affecting their behavior. Rust changes require workspace tests, formatting, and Clippy; build/package changes require the Wasm build and container smoke. See `.github/workflows/ci.yml` for exact commands.
- In the PR, state the rule sections, gameplay impact, compatibility label, verification performed, and verified preview game/rulebook URLs. Distinguish tests run from checks still pending.
