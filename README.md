# Drawing Board

A Rust workbench for browser-based board-game playtests. The first experiment is **Voidwright**, a sci-fi deck builder inspired by Dominion: build an engine of ships and technology, acquire colonies, and finish with the most influence.

## Run locally

Requires Rust (edition 2024; tested on 1.97.1) and the WebAssembly target:

```sh
rustup target add wasm32-unknown-unknown
./scripts/dev.sh
```

Open **http://127.0.0.1:3000** for the shared game library. Create an account under **Your account**, save its private recovery key, then open Voidwright tables or create AI players in **AI arena**. Galactic Reach can be played without signing in. The build script installs the pinned `wasm-bindgen` CLI under the ignored `.tools/` directory on first use. No Node runtime or frontend JavaScript framework is required to host the games. The server embeds QuickJS for Galactic Reach’s shared JavaScript rules. Node is used only for the browser-rule regression check.

For two human players on one computer, use separate browser profiles or a private window. Share the table invitation, join before launch, then have the host launch. Recovery keys and Nido identities return to the same account across sign-ins; browser sessions expire after 24 hours. The legacy development and preview login forms still create temporary identities.

## Additional prototypes

[`prototypes/galactic-reach`](prototypes/galactic-reach) contains **Galactic Reach**, a self-contained browser prototype for a four-faction strategy game. It currently supports one human player against three computer-controlled factions and saves progress in the browser. The shared library links to it at `/galactic-reach/`; Voidwright is at `/voidwright/`. Existing Galactic Reach saves remain compatible on the same origin. See the prototype README for local play instructions and scope.

## Included

- Shared game library, persistent human profiles, recovery-key login, session revocation, and owned AI accounts.
- Reusable game/player traits, seven reference AI policies across two adapters, authoritative matches with rotating seats, and persistent per-lab Elo. See [game platform](docs/game-platform.md).
- The current prototype/platform/experiment dependency graph and follow-up PR plan are tracked in the [playtest roadmap](docs/playtest-roadmap.md).
- Optional local release deployment through Tailscale Funnel. See [local HTTPS hosting](docs/local-hosting.md).

- Yew Rust/WebAssembly UI: lobby, saved tables, private invitations, hand, market, collection, rules, and flight log.
- Axum HTTP server with SQLite persistence, cookie sessions, membership checks, origin protection, and revision-checked commands.
- Deterministic Rust rules engine, 12 cards, 2–4 players, practice bot, configurable 10–50-round cap, shared supply, reshuffles, and final scoring.
- Nido passkey sign-in with live Stellar testnet wallet verification; see [Nido setup](docs/nido-auth.md).
- Atomic snapshots and private, hash-linked command records for future replay tooling. These records are not a ZKP or a trustless consensus system.

## Rules

Each player starts with 7 Credits and 3 Outposts, shuffled, and draws 5. Each turn grants 1 action and 1 buy. Play actions first. Playing any resource, playing all resources, or buying a card moves to the buy phase. Spend credits on supply cards; acquired cards go to discard. End the turn to discard the remaining hand and played cards, then draw 5, shuffling the discard pile if necessary. Unspent resources, actions, and buys expire.

Colonies cannot be played; they score influence across your entire collection: Outpost 1, Colony 3, Metropolis 6. Influence is public in this prototype. The game finishes at the end of the turn when the Metropolis pile is empty, any 3 supply piles are empty, or all players have completed the configured number of turns. Most influence wins; tied players share victory. Salvage Drone automatically scraps a Credit from the remaining hand, otherwise an Outpost, if available.

## Build and verify

```sh
node scripts/test-galactic-reach.cjs
cargo test --workspace --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
./scripts/build-web.sh
```

Run `./scripts/build-web.sh` again after UI changes, then reload the browser. Backend changes require restarting the server. Build an optimized server with `cargo build --release -p server --locked` and run it from the repository root (it serves `dist/`).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1:3000` | Server listen address; overrides `PORT` |
| `PORT` | unset | When set without `BIND_ADDR`, listens on `0.0.0.0:$PORT` |
| `APP_ORIGIN` | Render's external URL, otherwise the listen origin | Exact browser origin, no trailing slash; PR previews always use their own Render URL |
| `DATABASE_PATH` | `drawing-board.sqlite` | SQLite state, replay records, sessions, and login challenges |
| `DEV_AUTH` | disabled | `1` enables local identities, requires loopback bind and is rejected on Render |
| `PREVIEW_AUTH` | disabled | `1` enables test login only in Render PR previews |
| `PREVIEW_ACCESS_CODE` | unset | Shared preview login code, at least 24 characters; generated by the Blueprint |
| `ACCOUNT_REGISTRATION_CODE` | unset | Private enrollment code (24+ characters); local development needs none, Render previews can use their preview code |
| `NIDO_AUTH` | `1` | Enable current Nido testnet wallets; `0` disables sign-in |
| `NIDO_RPC_URL` | Stellar testnet RPC | Trusted HTTPS testnet RPC used for live wallet verification |
| `RUST_LOG` | unset | Server diagnostic filter, e.g. `info` |

For a shared deployment, serve through HTTPS, set `APP_ORIGIN` to its exact public origin, leave `DEV_AUTH` unset, and configure an account enrollment code or use Nido sign-in. A loopback bind does not prevent a reverse proxy from exposing development sign-in: do not publish a process started with `scripts/dev.sh`. Back up the SQLite database with SQLite-aware backup tooling. Run a single server process per database for this prototype.

## Design boundaries

The server currently knows the decks and controls shuffle entropy. Other players cannot retrieve your hand or draw order through the API, but this is **not** cryptographic privacy from the server. There is no Soroban deployment or ZKP implementation yet. [Architecture and migration notes](docs/architecture.md) explain what can be reused and what needs a different protocol.

Both Voidwright and Galactic Reach implement the shared game/AI contract and run authoritative, rated matches in the arena. Choose a game there to create its AI roster and run a series. Galactic Reach reuses its browser rules inside the server; its guest-play UI and existing v4 saves remain unchanged. Human server tables and the Practice action currently belong to Voidwright. There is not yet a visual card editor or arbitrary game plugin system. Polling updates the table every 1.8 seconds. The prototype does not yet provide spectators, disconnect timeouts, game deletion, turn timers, or public matchmaking. Nido sign-in currently supports single-passkey admin authority on the pinned testnet implementation.

## Pull request previews

The repository includes a multi-stage Docker image and a Render Blueprint with automatic per-PR service previews. GitHub Actions builds and smoke-tests the actual deployment image. Preview instances have an access-code-protected test login and isolated, disposable game data; the main service keeps test login disabled. During active Galactic Reach playtests, save-compatible changes stay in the stable playtest pull request while breaking rules experiments use separate pull requests and preview URLs.

See [the playtest branching workflow](docs/playtest-workflow.md) for stable and experimental lanes. See [PR preview activation](docs/pr-previews.md) for the one-time Render/GitHub connection, first-PR bootstrap, access code, lifecycle, and storage limitations. The checked-in Blueprint is a disposable testing host, not durable production infrastructure.
