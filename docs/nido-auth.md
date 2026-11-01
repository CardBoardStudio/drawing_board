# Nido authentication

Drawing Board supports passwordless sign-in with current Nido **Stellar testnet** wallets. On the account page, select **Continue with Nido**, choose your wallet, and approve the sign-in message with its passkey. Your first sign-in creates a persistent player account; later sign-ins return to its tables and AI roster. No playtest enrollment code, client secret, or manually enrolled public key is needed. Recovery-key accounts remain a separate sign-in method; signing in with a wallet does not merge another account into it.

## Host setup

Nido is enabled by default. Set `APP_ORIGIN` to the exact externally reachable HTTPS origin (including a nonstandard port), for example the origin configured by `scripts/local-host.sh`. Localhost HTTP is supported for development. The server must reach `https://soroban-testnet.stellar.org`.

- `NIDO_AUTH=0` disables wallet sign-in and invalidates wallet sessions on their next API request.
- `NIDO_RPC_URL` optionally selects another trusted **HTTPS testnet RPC**. Its reported network passphrase is checked on every ownership lookup. This does not switch the wallet to another network.
- `NIDO_SIGNERS_FILE` is retired. Remove it; startup rejects it with an explanation rather than silently continuing static-key authentication.

The Tailscale origin can stay private to your tailnet: the wallet returns through your browser, so Nido's servers do not need access to Drawing Board. Use the same browser throughout the redirect and return.

## Supported wallet authority

The server reads the wallet's deployed Wasm and `configuration()` through Stellar RPC. It accepts a **non-expiring, policy-free self-admin rule with exactly one external P-256 passkey**, using Nido's current Perch WebAuthn verifier. Multiple independent admin rules are supported. Scoped session keys, delegated signers, multisig rules, attached policies, active recovery freezes, archived accounts, and unknown/older account implementations fail closed with an account-page explanation. Nido's message protocol supplies one primary-passkey assertion; it cannot prove a multisig quorum. This integration does not submit or authorize a blockchain transaction.

The pins match Nido's October 9 deployment:

- Account Wasm: `bbb30174bbd85a2956a2f6146a156769621254011a6bdcac707cf787ce7bcd52`
- WebAuthn verifier: `CBCCINHRMS3COAV5RHTCUASZLOEC52FCOBR3HMU4FKWJTAHWZTVFTHHY`
- Network: `Test SDF Network ; September 2015`

A future Nido account upgrade requires reviewing and updating these pins and the decoder in `crates/server/src/nido_chain.rs`. An older wallet is not automatically upgraded by this app. A testnet reset may also require a new wallet; this integration is not a mainnet identity service.

## Authentication and session lifecycle

1. A five-minute random challenge is bound to an HttpOnly, SameSite=Lax browser cookie. Only its hash is stored. The original game/account destination is stored server-side and restricted to local game pages.
2. The wallet returns its address. Drawing Board validates its checksum and live authority before requesting a signature over the app origin, testnet network, address, nonce, and expiry.
3. Nido signs `SHA-256("Nido signed message (v1):\n" || message)`. Drawing Board re-reads live wallet authority, checks the envelope, exact account origin and RP hash, WebAuthn challenge, user presence and verification, and P-256 signature. A public key supplied by the browser is never itself an identity authority.
4. Challenge consumption, persistent account creation, and session issuance are atomic. Replay, expiry, cancellation, and invalid proofs cannot issue a session. Errors return to the account UI; successful sign-in returns to the selected destination.
5. Accounts retain the existing `nido:<address>` IDs and display names. Sessions use the same 24-hour expiry, ten-session cap, logout, and revoke-other-sessions controls as recovery-key accounts.
6. Wallet sessions retain the verified public key and recheck live authority on API use after 60 seconds. Removed keys, recovery freezes, and unsupported upgrades invalidate the session. A network outage denies requests after the cached authorization expires; it never extends stale authority. Static-key-era sessions require fresh authentication. Other account types remain usable during RPC outages.

The RPC is a trust dependency. Responses, XDR decoding, parallel lookups, and elapsed lookup time are bounded. The server only calls `getNetwork`, `getLedgerEntries`, and a read-only `simulateTransaction` of `configuration()`; it never calls `sendTransaction`.

## Verification and protocol references

Automated tests cover signed assertions, browser binding, one-time challenges, persistent identity, session revocation, cancellation/expiry, redirect restrictions, network/code pins, ledger ordering, and rejection of insufficient authority. The mock RPC accepts only the three read-only methods and checks that simulations have no signatures or authorizations. A real passkey approval is still a user-operated end-to-end check.

Run the optional read-only smoke against a supported public wallet:

```sh
NIDO_SMOKE_ACCOUNT=C... cargo test -p server live_account_lookup -- --ignored
```

Protocol inspected at Nido commit `27b044bc5546738c6e2c10d221414a37c86a2804`:

- [Message domain and challenge](https://github.com/nidohq/nido/blob/27b044bc5546738c6e2c10d221414a37c86a2804/packages/frontend/src/lib/messageSigning.ts)
- [Assertion envelope](https://github.com/nidohq/nido/blob/27b044bc5546738c6e2c10d221414a37c86a2804/packages/frontend/src/lib/walletSign.ts)
- [Redirect URLs](https://github.com/nidohq/nido/blob/27b044bc5546738c6e2c10d221414a37c86a2804/packages/stellar-wallets-kit-module/src/urls.ts)
- [Deployed contracts](https://github.com/nidohq/nido/blob/27b044bc5546738c6e2c10d221414a37c86a2804/packages/passkey-sdk/src/perch/deployment.ts)
- [Perch configuration interface](https://github.com/stellar-registry/perch/blob/bb746f9d03c593f0d5a2518c6900e00c938f95ec/crates/perch-smart-account/src/lib.rs)
