# Accounts, game adapters, and AI players

The shared library at `/` links to Galactic Reach at `/galactic-reach/` and Voidwright at `/voidwright/`. `/lab/` is an alias for the library. Galactic Reach's rules, save keys, and save format are unchanged; moving within the same origin preserves its browser save. Switching between Render, localhost, and Tailscale creates separate browser storage. Old `/#table/<id>` links forward to Voidwright.

## Account lifecycle

An `accounts` row outlives its sessions. Human accounts use either an enrolled Nido identity or a server-generated random 256-bit recovery key. Display names are not unique and are never credentials. Only SHA-256 hashes of recovery keys and session tokens are stored. New keys are returned once over the authenticated response and are not stored in browser storage. Save them in a password manager: there is no email recovery or password-reset service.

Registration is open in loopback development. Shared hosts require `ACCOUNT_REGISTRATION_CODE` (at least 24 characters), or the existing preview access code on Render PR previews. Login with an existing recovery key remains available when enrollment closes. Keep enrollment codes outside the repository. Auth requests are globally limited to 120 per minute; this is a small private-playtest limit, not distributed abuse protection.

Sessions use HttpOnly, SameSite=Lax cookies, Secure under HTTPS, and a fixed 24-hour expiration. Accounts can rename their display name, revoke other sessions, or replace their recovery key. Key replacement invalidates the old key and all existing sessions atomically, then signs in the current browser with a new token. Recovery-key login keeps at most ten active sessions. Existing tables retain the display names captured at join time.

Schema setup is additive and idempotent. Existing session identities are imported into `accounts`; Nido sign-ins retain their `nido:<address>` identity. Legacy development and preview identities remain temporary. AI accounts cannot authenticate as humans, even if a session row names their ID.

## Shared game and player contract

`crates/game-core` has no HTTP, database, or Voidwright dependency:

- `GameAdapter`: versioned rules, active seat, a private observation for one player, legal actions, validated action application, and terminal scores.
- `PlayerAgent<G>`: a versioned policy receives only the observation and legal actions, and returns the index of its choice. No server seed, opponent hand, or hidden draw order is passed to it.
- `run_match`: drives adapters and policies with a decision budget, rejects illegal policy output, and returns results only for completed games with finite scores.
- `elo_pair` / `elo_multiplayer`: Elo starts at 1200, K=32. Multiplayer updates average each player’s pairwise changes against all opponents, simultaneously from pre-match ratings. Two seats reproduce the original pair formula; every match conserves total rating.

The Voidwright adapter derives legal actions using the rules engine, avoiding a second rules implementation. Explorer makes random acquisition choices; Merchant prioritizes resources and colonies; Kepler uses the existing engine-building heuristic. Versions are immutable (`explorer/1`, `merchant/1`, `kepler/1`). Practice games and the arena use the same policy interface. Practice policy randomness is deterministically derived from the private game seed and revision.

Galactic Reach is the second concrete adapter, in `crates/galactic-reach`. It embeds `prototypes/galactic-reach/app.js` and `adapter.js` in QuickJS, using the same rule primitives as the guest browser game. Rules remain `galactic-reach/4.9` (save format 4, rules revision 9). The adapter exposes atomic card/resource, movement, construction, colonization, research, purchase, upgrade, special, vote, and directive commands. Player-to-player trade negotiation is not exposed by the arena command vocabulary yet. All four policy seats choose their own sealed policy ballots and directives through the interface. Their private views omit opponent hands, hidden world types, draw decks, military decks, and pending ballots. Board fleets and discarded cards are public, as in the browser UI.

Four observation-only Rust policies implement `PlayerAgent<GalacticReach>`: Vanguard (`gr-military/1`), Architect (`gr-economy/1`), Pathfinder (`gr-expansion/1`), and Wanderer (`gr-wanderer/1`). They select indices from legal commands; they cannot access the JavaScript runtime or authoritative state. Matches use the existing 10-Prestige victory condition and its colony/resource tiebreakers. Terminal scores are 1 for the actual winner and 0 for the other factions. A decision-budget timeout is an error, never an invented draw or victory.

Each Galactic Reach runtime has a 64 MiB heap limit, 1 MiB stack limit, and 30-second interrupt deadline. It has no host filesystem, network, timers, or module loading. The binary embeds its JavaScript sources, so deployments need no Node installation. The server creates the runtime on its blocking worker; the same generic Rust `run_match` calls this adapter and the native Voidwright adapter. `scripts/test-galactic-reach.cjs` checks rule-state hashes captured from the preceding browser implementation; its golden data comes from commit `cb97f8b`.

To add a game, implement `GameAdapter`, add policies implementing `PlayerAgent<YourGame>`, expose catalog metadata, and register a constructor, seat count, and rating pool in `GameKind`. The arena’s authentication, simulation scheduling, seat rotations, results, idempotency, and Elo transaction are game-independent. This is not a dynamic plugin loader. Human server tables and the Practice action remain Voidwright-specific; Galactic Reach guest play continues with its existing browser save and original local opponents.

## Arena guarantees and limits

Each human owns up to twelve AI accounts per game. An AI's policy is immutable, and ratings are scoped to the owner’s lab and a rules/format pool:

- Voidwright: `voidwright/1:duel:20-rounds:policies-v1` (2 seats).
- Galactic Reach: `galactic-reach/4.9:four-player:winner:policies-v1` (4 seats).

Game selection also scopes the roster and recent-series history. Policies from a different game, duplicate seats, and another owner’s bots are rejected. There is no global ladder, human Elo, arbitrary code upload, or remote-agent API yet.

A series is 2–20 games, in complete seat rotations (multiples of 2 for Voidwright, 4 for Galactic Reach). Every rotation group uses the same game seed and places each AI in every starting seat once; each AI keeps its own paired random seed across that group. This mitigates first-player bias but is not a claim of statistical certainty. Ratings are provisional until 20 games, and measured only against opponents in that lab. Policy descriptions are behaviors, not promised difficulty levels. The Voidwright ladder’s Practice action creates an unrated human table against that AI. Galactic Reach’s existing guest game is also unrated; its local opponents are separate from the arena roster.

The server simulates bounded matches on at most two blocking workers, outside the SQLite lock. It accepts a game ID, the required number of bot IDs, game count, and a UUID request ID; it never accepts client scores or ratings. The whole series, all results, and every Elo update commit in one transaction. Retrying an identical request returns the stored result; reusing its ID for different input returns 409. Six new series per owner per minute are allowed. Invalid or unfinished simulations get no rating credit.

Each result retains game seed, per-seat agent seeds, policy versions, rules version, seat IDs, scores, decision count, and ratings before/after. Replaying requires the matching immutable rules/policy implementations. The owner can read their last ten series in the UI; the database retains older results. Seeds belong to completed AI-only games, never human tables.

Policies are trusted in-process implementations. The decision budget limits the number of decisions, not CPU time inside a policy. External or user-supplied AI needs a separate worker/process with enforced time, memory, and transport limits before it can safely join this contract.

## API examples

`GET /api/arena?game=galactic-reach` selects the four-player lab. `POST /api/arena/bots` accepts `{"game":"galactic-reach","name":"My Vanguard","strategy":"gr-military"}`. `POST /api/arena/series` accepts `{"game":"galactic-reach","request_id":"<UUID>","bots":["<id1>","<id2>","<id3>","<id4>"],"games":4}`. All writes require the authenticated cookie and `x-drawing-board` header. Omitting `game` retains the existing Voidwright behavior and replay/idempotency semantics for previously stored requests.
