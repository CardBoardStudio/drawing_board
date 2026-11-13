# Nearest Probe24.29

User correction: Probe locates the nearest relic when used and does not require its Explorer to be on a planet or moon. This takes priority over the unfinished storage-planning study.

Canonical anchors: `#orders`, `#movement`, `#excavation`, `#computer-rivals`. Select an owned Explorer’s hex as the origin, including empty space/home/Shipyard. Pick the nearest unclaimed, unlocated relic by actual relic-hex distance, breaking ties by fixed cluster ID. No resources, movement or RNG are spent. Discard Probe and spend one Operations action; keep the Explorer. With no eligible relic, reject atomically. Show a private signal only; do not survey moon terrain, disclose coordinates in the public log or serialize a hidden target in legal actions. The chosen origin is public. One Explorer (or an already selected Explorer) can resolve immediately from Use order; multiple unselected Explorers require choosing an origin.

Rivals Probe from an available Explorer and follow known signals. Remove the old wait-on-unsearched-world behavior. Keep discovery relic-card effects unchanged. Archive23.28/policy19; use save24/rules29/native20. Storage-planning code and partial simulations remain separate and will be rebased and rerun against this corrected Probe rule.
