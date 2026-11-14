# Developer change queue

The owner can collect requested changes for `CardBoardStudio/drawing_board`, connect each request to its implementation PRs, review checks and the exact Render preview, and explicitly merge a ready PR into `main` from a desktop side panel. This is repository tooling. It never reads or changes game state, hidden information, rules or saves.

## Intended behavior

- **Change queue** opens a named, keyboard-accessible drawer from the game header for administrators. `?dev=1` also exposes the entry point, but never grants API access. Other players do not receive repository data.
- Queue entries are GitHub issues labelled `drawing-board-change`. New requests contain a title and description. Linking PRs appends a human-readable issue comment with a small versioned metadata block. It never rewrites the original request, preserving concurrent title/body edits and a history of link changes. Updates compare the displayed body/link revision with GitHub before appending, and reject an already stale view. GitHub is the durable source; there is no second server database queue.
- The drawer separates requested changes from open PRs. A request can link several PR numbers from this repository. Users can inspect the original issue and PR on GitHub. If a create response is lost, refresh the queue before retrying; the drawer never automatically retries a repository write.
- PR review shows the description, changed-file totals, head commit, checks, compatibility label, preview game/rulebook and merge blockers. Opening or refreshing the panel never merges anything.
- A merge requires a separate confirmation of the displayed PR and exact head SHA. Breaking PRs also require acknowledgement that new games need the new rules. The server rechecks the current PR, latest checks/statuses/reviews, main base, same repository, compatibility label and successful Render preview for that head. Missing, incomplete, failed or truncated evidence blocks merging. The final GitHub merge request includes the expected SHA and never bypasses branch protection.
- Merged and deployed are different states. The panel shows the successful stable deployment only after GitHub records one for the merge commit. It never presents the old live version as the new release.
- No queue action implements a request automatically or authorizes unrelated merges. The owner chooses each implementation PR.

## GitHub connection

Choose **Connect GitHub** in the administrator panel and supply a fine-grained GitHub token restricted to this one repository. It needs Issues write, Pull requests read, Contents write (GitHub's merge permission), Checks read, Commit statuses read and Deployments read. The panel links to GitHub’s token settings. Use a short token expiry and the organization's approval process.

The connection is per administrator, expires after one hour, and exists only in server memory. A deploy or restart disconnects it. It is never stored in browser storage, the database, a deployment environment variable, logs or Git. The password field clears when submitted or closed. Disconnect removes the server’s temporary connection; revoke the underlying token in GitHub to invalidate it everywhere. The existing host administrator role controls access. A player or preview login never grants administrator rights.

There is no OAuth app registration or deployment secret to inherit into previews. `IS_PULL_REQUEST=true` refuses all GitHub connections. Exercise mutations, including merge confirmation, with the local mock fixture. Without a connection, administrators see a clear setup state and game play is unaffected. Never use a real PR merge as a UI test.

The initial interface is desktop only. Check keyboard opening/closing and focus return, draft retention, errors, stale edits, linked PRs, blocked and confirmed merges, and separate deployment state. Run server tests, formatting, Clippy, Wasm/package and production-container checks, plus the local browser/axe audit. See [playtest workflow](playtest-workflow.md) and [playtest notes](playtest-notes.md).

API references: [issues](https://docs.github.com/en/rest/issues/issues), [merge with expected SHA](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request), [checks](https://docs.github.com/en/rest/checks/runs), [commit statuses](https://docs.github.com/en/rest/commits/statuses), [deployment statuses](https://docs.github.com/en/rest/deployments/statuses). Deployment configuration follows [Render preview isolation](https://render.com/docs/preview-environments).
