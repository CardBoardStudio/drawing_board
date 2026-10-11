# Nido authentication

Nido is a passkey wallet for Stellar smart accounts. It is not treated as an OAuth/OIDC provider. Drawing Board follows the wallet's actual redirect/message-signing protocol, implemented in Rust on the server.

Protocol references inspected at Nido commit `882b4474b04fea748e56c482725eb6ffb62f7bc5`:

- [Wallet handoff URLs](https://github.com/nidohq/nido/blob/882b4474b04fea748e56c482725eb6ffb62f7bc5/packages/stellar-wallets-kit-module/src/urls.ts)
- [Return parameters](https://github.com/nidohq/nido/blob/882b4474b04fea748e56c482725eb6ffb62f7bc5/packages/stellar-wallets-kit-module/src/handover.ts)
- [Message signing and assertion envelope](https://github.com/nidohq/nido/blob/882b4474b04fea748e56c482725eb6ffb62f7bc5/packages/frontend/src/lib/walletSign.ts)

## Enroll playtesters

Create a local JSON file mapping each **verified** C-address to its trusted uncompressed SEC1 P-256 public key(s), hex encoded (65 bytes, starting with `04`). For example, the shape is:

```json
{
  "<valid uppercase Stellar C-address>": ["<130 hex characters of a verified P-256 public key>"]
}
```

The placeholders are deliberately invalid. Obtain each key through a trusted enrollment process and independently confirm that it is an appropriate account signer on the intended Nido network. Do not enroll a key merely because a browser or login assertion supplies it. Multi-signature/policy-constrained accounts require an explicit application enrollment decision: this prototype's login means “one of the enrolled keys proved possession,” not “the full on-chain account policy was satisfied.”

Set configuration before starting the server:

```sh
NIDO_SIGNERS_FILE=/absolute/path/to/trusted-signers.json \
APP_ORIGIN=https://your-playtest-host.example \
BIND_ADDR=127.0.0.1:3000 \
cargo run --release -p server
```

The file is read at startup. Restart after changes. Keep it outside the repository or use the ignored `trusted-signers.local.json`. This contains public keys, not private keys. Nido does not require a client secret for this handoff. The currently hosted Nido wallet targets Stellar testnet.

Without an enrolled account, the Nido button is disabled. A separate `DEV_AUTH=1` local-only identity path lets the game be tested without pretending that Nido authenticated anyone.

## Flow and verification

1. `/api/auth/nido` creates a 5-minute random, browser-bound challenge state, stores its hash, and sets an HttpOnly SameSite=Lax state cookie. It redirects to `https://nido.fyi/connect/` with `dapp` and `return` parameters.
2. Nido returns `nido_address`. The server checks that the account is enrolled, saves a message bound to the app origin, account, nonce, and expiry, and redirects to `https://<lowercase-C-address>.nido.fyi/sign/?kind=message`.
3. Nido asks the user to sign the message with a passkey, returning `nido_signed` and `kind=message`. The server decodes the envelope, checks its type and enrolled public key, verifies `webauthn.get`, exact account origin/RP hash, SHA-256 message challenge, user presence and verification flags, and the P-256 signature over authenticator data plus the client-data hash.
4. Challenge consumption and session creation occur in one database transaction. The server rotates any existing session and issues an opaque 24-hour HttpOnly SameSite=Lax cookie, with Secure on HTTPS. Tokens are stored hashed. Logout revokes the server session.

The public wallet address is only an identifier. It is never sufficient to authenticate. Cancellation returns to the app without creating a session. Failed or expired ceremonies do not authenticate.

## Validation status and remaining work

Synthetic P-256 fixtures exercise trusted signatures and reject wrong origins, account bindings, challenges, flags, and untrusted keys. API tests cover cookie authentication, logout, and request-origin protection. A real end-to-end Nido passkey login requires an enrolled account and the user's passkey approval and has not been exercised here.

Before open enrollment, replace static trust anchors with live Soroban account-policy validation, including signer revocation, key recovery, network binding, thresholds, and policy scope. Existing sessions are not automatically revoked on signer-file changes or on-chain recovery; remove affected sessions and restart when revoking enrollment. The current static enrollment is appropriate for a controlled prototype, not a claim to implement unrestricted Nido account authorization.
