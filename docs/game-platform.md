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
- `elo_pair`: two-player Elo, initial rating 1200 and K=32, including draws and equal/opposite updates.

The Voidwright adapter derives legal actions using the rules engine, avoiding a second rules implementation. Explorer makes random acquisition choices; Merchant prioritizes resources and colonies; Kepler uses the existing engine-building heuristic. Versions are immutable (`explorer/1`, `merchant/1`, `kepler/1`). Practice games and the arena use the same policy interface. Practice policy randomness is deterministically derived from the private game seed and revision.

To add a game, implement `GameAdapter`, add policies implementing `PlayerAgent<YourGame>`, expose its catalog entry, and register a server-side constructor and rating pool. The generic runner is ready for reuse; the current HTTP table API and arena constructor remain Voidwright-specific. Galactic Reach is explicitly an unrated browser prototype until its rules are extracted into an authoritative adapter. This is not yet a dynamic plugin loader.

## Arena guarantees and limits

Each human owns up to twelve AI accounts. An AI's policy is immutable, and ratings are scoped to the owner's lab plus the rules/format pool `voidwright/1:duel:20-rounds:policies-v1`. There is no global ladder, human Elo, arbitrary code upload, or remote-agent API yet.

A series is 2–20 games. Every pair uses the same game seed and reverses seats; an agent's random seed is also paired. This mitigates first-player bias but is not a claim of statistical certainty. Ratings are provisional until 20 games, and measured only against opponents in that lab. Policy descriptions are behaviors, not promised difficulty levels. Use the ladder's Practice action to play against any owned AI without changing its rating.

The server simulates bounded matches on at most two blocking workers, outside the SQLite lock. It accepts bot IDs, game count, and a UUID request ID; it never accepts client scores or ratings. The whole series, all results, and every Elo update commit in one transaction. Retrying an identical request returns the stored result; reusing its ID for different input returns 409. Six new series per owner per minute are allowed. Invalid or unfinished simulations get no rating credit.

Each result retains game seed, per-seat agent seeds, policy versions, rules version, seat IDs, scores, decision count, and ratings before/after. Replaying requires the matching immutable rules/policy implementations. The owner can read their last ten series in the UI; the database retains older results. Seeds belong to completed AI-only games, never human tables.

Policies are trusted in-process implementations. The decision budget limits the number of decisions, not CPU time inside a policy. External or user-supplied AI needs a separate worker/process with enforced time, memory, and transport limits before it can safely join this contract.
