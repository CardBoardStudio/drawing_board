# Local release host over Tailscale HTTPS

This is an optional local test deployment alongside the canonical Render previews. It uses a separate database and a release server bound only to loopback. Do not expose `scripts/dev.sh` through a public proxy.

Tailscale **Funnel** makes a service public; **Serve** limits it to the tailnet. Funnel supports HTTPS ports 443, 8443, and 10000. These instructions use 10000 so existing services on 443/8443 can continue running. Check current mappings first and choose a different arrangement if 10000 is occupied. See [the official Funnel command reference](https://tailscale.com/docs/reference/tailscale-cli/funnel).

## Prepare on macOS

Requires a logged-in Tailscale node with HTTPS and Funnel permission, Rust, and the Wasm build prerequisites from the README.

```sh
tailscale funnel status
./scripts/build-web.sh
cargo build --release -p server --locked
./scripts/local-host.sh prepare
```

`prepare` creates an ignored `.local/host.env` with mode 600, a random enrollment code, the node's exact HTTPS origin on port 10000, a loopback bind on port 3100, and persistent SQLite under `.local/`. It also generates a launchd job. Rerunning it preserves the existing configuration and credentials. Review this private file before starting; change both the origin and Funnel command if you choose different ports. The code admits new accounts: share it privately only with invited testers.

## Start and publish

```sh
./scripts/local-host.sh start
curl --fail http://127.0.0.1:3100/api/health
# Verify DEV_AUTH and PREVIEW_AUTH are both false:
curl --fail http://127.0.0.1:3100/api/session
tailscale funnel --bg --https=10000 http://127.0.0.1:3100
tailscale funnel status
```

Use the URL Tailscale returns and verify `/api/health` over HTTPS. If Tailscale returns an enablement URL, a tailnet administrator must authorize Funnel for this node; a private Serve link does not substitute for a public test. Do not reset the whole Funnel configuration because it may host unrelated services.

If Funnel is unavailable on your plan, you can explicitly test privately instead:

```sh
tailscale serve --bg --https=10000 http://127.0.0.1:3100
# Only tailnet members can use this URL; it is not public.
# To remove this private mapping:
tailscale serve --https=10000 off
```

The launchd job runs as your user and restarts the server after failure during the current login session. It is loaded from the repository's `.local/` directory, so it is not installed for automatic loading on future logins: run `start` again after logging in. The checkout must remain at its current path. Logs are `.local/server.log` and `.local/server-error.log`.

For release updates, run the build steps, stop, then start the local job. Do not delete `.local/` when updating. Back up its database using SQLite-aware backup tooling, including account credentials and ratings. Run one server process per database. Named Galactic Reach tables are stored in this database; guest saves remain in each tester's browser.

## Set up the administrator

After building the current server, run:

```sh
./scripts/local-host.sh admin-invite
```

Open the printed one-time setup link, sign in or create your persistent account, and accept administrator access. It expires after 24 hours. Once claimed, bootstrap is closed. Then use **Invitations** in the sidebar to create, copy, and revoke player enrollment links. You no longer need to share the host enrollment code. Nido remains an independent sign-in option when enabled.

The setup link grants administrator access to whoever claims it first. Keep it private. Regenerating it before acceptance invalidates the old link. Existing accounts, tables, sessions, and ratings survive this additive database migration.

## Stop or inspect

```sh
./scripts/local-host.sh status
tailscale funnel --https=10000 off
./scripts/local-host.sh stop
```

Stopping the public mapping leaves other Tailscale ports intact. The laptop must remain awake and online for the public URL to work. This is a playtest host, not a highly available production deployment.
