# Storage planning25.30 study

See `docs/rules/storage-planning.md` and `freeze.json` for the policy and predeclared2592-trial design. Both conditions use the corrected nearest-relic Probe rule. Previous24.29 decisions are rerun, not reused from23.28 or the interrupted world-bound-Probe draft.

Run `node analysis/galactic-reach-25.30/verify.cjs` before comparison. Then run `run.cjs` with each suite: main/baseline32 seeds offset4000, headtohead16 seeds offset4100, gifts/gifts-old8 seeds offset4000. Every task has a100-round cutoff; missing winners stay missing. Defaults can differ, so always pass these exact parameters. `analyze.py` audits setup, ledger, score and combat integrity and produces whole-seed-block bootstrap summaries. `report.py` creates a standalone HTML report and static figures.

Instrumentation adds no RNG or policy changes. The previous-policy bridge runs the archived24.29 decisions in a shared current rules closure and synchronizes the card serial. Verification compares that bridge to the exact archived engine, current observations to uninstrumented trajectories, and32 initial setups after version metadata normalization. Live/browser funding-discard parity is a separate regression in `scripts/test-storage-planning.cjs`.

Generated raw records and reports are retained in the delivered local result bundle. Raw metadata records the checkout parent at launch plus exact source hashes: runs began before committing the frozen source. The final report records the source commit separately; `freeze.json` binds the actual engine bytes.
