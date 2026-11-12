# Galactic Reach balance research

These reports preserve the completed offline studies and their exact recorded outputs. They are historical research, not the current player rules. The canonical game manual is [the HTML rulebook](../prototypes/galactic-reach/rulebook.html).

- [16.21 balance report](galactic-reach-16.21/report.html) and [seat-effect investigation](galactic-reach-16.21/seat-cause.html).
- [17.22 / 10-Prestige comparison](galactic-reach-10-point/report.html).
- [Proposed central-world layout comparison](galactic-reach-central-worlds/report.html).

**The central-world simulations predate decisive-combat Prestige and the removal of Shipyard upgrades.** They measure the map intervention with the original 17.22 bots and scoring. They do not establish balance for the combined 18.23 release.

The `.jsonl.gz` files contain all raw outputs, including events where recorded. Run `python3 analysis/restore-results.py` to restore the ignored `.jsonl` files and verify every byte against `raw-results.json`. The reports and summaries are readable without decompression. Study metadata records engine hashes, settings, and commit identities. The scripts retain the original engine-worktree paths; reproduce a study with its recorded engine revision, rather than substituting the latest game. The release retains 17.22 under `crates/galactic-reach/rules/v17-*`.

The original uncompressed local outputs remain intact. Statistical intervals resample seed blocks. These studies compare fixed heuristic bots, not optimal human players.
