# Render PR previews

`render.yaml` defines one Docker web service with automatic **service previews**. Each PR gets its own Rust API, Wasm frontend, session store, and SQLite database. Render rebuilds on new PR commits, adds a **View deployment** link on GitHub, and deletes the preview when the PR closes or merges. No deployment token is exposed to GitHub Actions.

This uses single-service previews rather than a multi-service Preview Environment. The latter requires a Pro workspace; this app has no separate database service to clone. Preview compute is billed by Render while it exists. The Blueprint selects one 0.5 CPU / 512 MB instance; consult the workspace's current pricing before provisioning.

## One-time activation

1. Connect Render's GitHub integration to the private `CardBoardStudio/drawing_board` repository.
2. After this bootstrap PR is merged, create a **Blueprint** in Render from `main` using the root `render.yaml`. Confirm the compute plan in the provisioning screen. Do not set an explicit service branch in YAML: previews must build each PR's head.
3. Confirm **Automatic** under the service's **Previews** settings. The Blueprint already requests it.
4. Render generates `PREVIEW_ACCESS_CODE` on the base service. Retrieve it from that service's Environment page and share it privately with playtesters. Each new preview inherits the setting. Never put the code in a PR comment, commit, screenshot, or URL.
5. Open a PR. Wait for its Render deployment, click **View deployment**, and enter a pilot name plus the preview code. Host a table and share its invitation with another signed-in tester, or practice against Kepler.

**Testing this first PR before merge:** no base service exists on `main` yet. You can create a temporary Docker web service from this PR branch to try it immediately. Set `RENDER_EXTERNAL_URL` via Render's automatic variable, `IS_PULL_REQUEST=true`, `PREVIEW_AUTH=1`, and a randomly generated `PREVIEW_ACCESS_CODE` of at least 24 characters. Set `autoDeployTrigger: checksPass` (or After CI Checks Pass in the dashboard) and use `/api/health`. Delete that temporary service after the main Blueprint is connected. Provisioning still requires access to the Render workspace and private GitHub repository.

There is no live preview until the Render integration and base service are created. Committing the Blueprint alone cannot connect a private repo to an external hosting account.

## Identity and isolation

Preview login requires all of `RENDER=true`, `IS_PULL_REQUEST=true`, `PREVIEW_AUTH=1`, an HTTPS preview URL, and a nontrivial access code. The code is compared using constant-time hashes and is never returned by the API. Each successful login creates a separate temporary identity. It is labeled **PREVIEW**, and the page explains that data is disposable. A Nido account is not claimed by this login.

The base service has preview login disabled even though the preview configuration is inherited. For real accounts on the base service, configure Nido enrollment as described in [Nido authentication](nido-auth.md). `DEV_AUTH` is rejected on Render, including loopback binds. PRs select their own `RENDER_EXTERNAL_URL` instead of inheriting a production `APP_ORIGIN`, preserving origin checks and secure cookies.

The image contains no local database, session file, signer file, `.env`, or Git metadata. SQLite lives at `/app/data/drawing-board.sqlite` within each container. **A redeploy, replacement, or preview closure discards all games and sessions.** The initial Blueprint is a disposable testing host, including its base service; it does not promise durable production storage. For a durable service, provision storage separately and test its preview behavior before enabling it. Never point previews at a production database or attach production credentials.

When changing the access code, update already-running previews too or recreate them: service previews copy settings at creation. Signing out and back in creates a fresh test identity, not a recovery of the old name.

## CI and local packaging

GitHub checks format/lint/tests, builds the Rust frontend, then builds the deployment image and runs an HTTP smoke test. The smoke test covers protected preview login, both player sessions, joining, starting, purchasing, changing turns, private views, and logout. A generated Wasm bundle is available as a 7-day Actions artifact.

```sh
docker build -t drawing-board:test .
docker run --rm -p 127.0.0.1:3100:3000 \
  -e RENDER=true -e IS_PULL_REQUEST=true \
  -e RENDER_EXTERNAL_URL=https://preview.example \
  -e PREVIEW_AUTH=1 \
  -e PREVIEW_ACCESS_CODE=ci-only-access-code-not-a-secret \
  drawing-board:test
```

From a second terminal:

```sh
SMOKE_PREVIEW_CODE=ci-only-access-code-not-a-secret python3 scripts/smoke.py
```

Those values are **local test fixtures**, not deployment credentials. The test deliberately connects through loopback HTTP while exercising the secure cookies that Render uses behind TLS. To play manually in a local browser, use `scripts/dev.sh` instead.

## Controls and references

- Skip a preview with the `render-preview-skip` PR label or `[skip preview]` in its title.
- Closing the PR destroys its service preview. Delete abandoned previews in Render if necessary.
- Render retains base-service settings at preview creation; recreate old previews after changing configuration.
- [Render service previews](https://render.com/docs/service-previews)
- [Blueprint service preview configuration](https://render.com/docs/blueprint-spec#previews)
- [Render's runtime environment variables](https://render.com/docs/environment-variables)
