## Playtest compatibility

Select exactly one:

- [ ] `playtest-safe` — the current stable game can continue after deployment.
- [ ] `playtest-breaking` — test only on this pull request's preview and start a new game.

For a breaking experiment:

- [ ] This pull request targets `codex/add-galactic-reach-prototype`.
- [ ] It contains one rules hypothesis.
- [ ] Adopting it will increment `SAVE_FORMAT_VERSION` before it reaches the stable lane.

## Change

Describe the player-visible change and why it is being tested.

## Verification

Describe the automated checks and the playtest path used on the Render preview.
