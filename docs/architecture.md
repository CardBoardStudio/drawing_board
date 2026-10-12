# Architecture

The first vertical slice keeps game rules independent of HTTP, storage, identity providers, and rendering. This makes new mechanics easy to test without running a browser.

| Crate | Responsibility | Dependencies across boundaries |
| --- | --- | --- |
| `game-core` | Game adapter, player AI interface, bounded match runner, Elo | Serde; no game or transport dependency |
| `game` | Voidwright rules, views, adapter, versioned reference policies | `game-core`, Serde, pinned ChaCha RNG |
| `galactic-reach` | Browser rules embedded in bounded QuickJS, adapter, four reference policies | `game-core`, existing JavaScript rules; no HTTP or database |
| `server` | Accounts, Nido, sessions, authorization, tables, AI arena, SQLite, static delivery | `game-core`, `game`, `galactic-reach`, Axum, SQLite, P-256 |
| `web` | Browser interface compiled to WebAssembly | `game` for wire types and catalog; Yew for rendering |

## A move

The Rust UI sends `{revision, command}` with the session cookie and same-origin request header. The server verifies membership and revision while holding the database mutex. `Game::apply(actor, command)` validates and applies to a cloned state: a rejected command makes no partial changes. The server runs any bot turn through the same command reducer, then saves the snapshot and command records in one transaction. It returns only `GameView` for the authenticated player. Polling follows the same view projection.

The browser cannot pick an actor, grant itself credits, view another hand, or replay a command against a newer revision. Lobby joining is idempotent; only the host can start. A started table does not admit new participants.

## Reproducibility and private data

The server generates a secret 256-bit OS-random seed. Each shuffle uses a separate ChaCha20 stream. State stores the seed and shuffle counter for deterministic reproduction. The initial private record includes starting state; subsequent records capture joins, bot addition, and commands. Pin the rules version and dependency lockfile when reproducing an old playtest. Replay/export UI is future work.

The database contains secrets: seed, deck order, all hands, and private command details. There is no API to export this aggregate or the command records. Views contain public supply, counts, influence, public moves, played cards, and only the viewer's hand and unordered collection. Private cards do not appear in the public flight log.

Each event is linked to its predecessor using a domain-separated SHA-256 hash. This detects accidental edits when checked against a trusted head; a database administrator can rewrite both records and hashes. The chain does not by itself provide tamper-proof history or a ZKP.

## Growing the testing bed

Next useful additions are versioned card/ruleset definitions, saved setup presets, structured playtest notes, deterministic replay tooling, and balance simulations. The shared `GameAdapter` / `PlayerAgent` contract drives both Voidwright and Galactic Reach through the same match runner. The arena selects each game’s constructor, seat count, policies, and rating pool; account storage, seat rotations, match recording, and rating transactions are shared. Human table transport remains Voidwright-specific. Galactic Reach’s guest UI and authoritative adapter call the same JavaScript rule primitives; no second port of its rules is maintained. See [accounts and the game platform](game-platform.md) for extension points, rating isolation, and current limits.

## Soroban and ZKP path

1. Version the command encoding and state schema. Add conformance vectors that native Rust and a contract/guest implementation both verify. The current `std`/Serde/RNG engine is a reference implementation, not a drop-in Soroban contract.
2. Split public state from each player's secret state. Define hiding commitments with fresh randomness; never publish an unsalted deck hash, a shared deck seed, or current private command records.
3. Design fair setup/shuffling and private draws. A shared public seed reveals all hands. Commit/reveal randomness alone does not solve private draws or malicious aborts; select a mental-poker/encryption or proof-based shuffle/deal protocol with an explicit trust model.
4. Bind signed commands to network, rules version, match, turn, actor, and previous state commitment. Specify membership, timeout, dispute, and recovery rules before distributing authority.
5. Define proof statements for valid draws, resource use, purchases, and state transitions that conceal hidden cards. Benchmark proof cost, verification cost, storage, and latency against the target Soroban environment.
6. Add a Soroban settlement/verification adapter. The Rust server can remain a relay/indexer; Nido can provide account authorization. Preserve server mode for inexpensive rapid playtests.

This implementation delivers step zero: a working browser game, deterministic reference rules, identity boundaries, and durable commands. It does not implement decentralized state, consensus, cryptographic private hands, or proof generation.
