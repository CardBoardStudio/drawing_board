# Twenty Point Strategy 23.28 experiment

## Intended rules

User authorization: implement the pending storage proposal, improve bots using the supplied 21.26 human report, and resimulate with 20 points to win, 3 per Colony without a pair bonus, 2 per relic, and 1 per qualifying combat win. The canonical rules are `rulebook.html#resources`, `#victory`, `#combat`, `#excavation`, and `#buy`; this file records implementation and study decisions.

Each paid storage purchase adds 5 capacity and costs N of every resource, where N is one plus that faction’s prior paid purchases. `storageUpgrades` continues to count all capacity increments. New `storagePurchases` counts only paid increments; free Cradle of Lost Suns storage does not advance the price. Reject an unaffordable purchase atomically. Keep costs visible and authoritative for browser, native observations, reports, replay, and Undo.

Colonies and excavated relic counters stay raw counts; point breakdowns weight them by 3 and 2. Combat qualification and end-of-round victory/tiebreakers are unchanged. No shipyard or purchased-card points. Save 23, rules revision 28; new origin and new games. Preserve 22.27 and native policy 18 unchanged.

## Policy intent

The uploaded game exposed lone Settlers next to two enemy Fleets, scattered military groups, and slow starter upgrades. Use only public enemy unit positions, public structures and resources, and the acting faction’s private cards/Probe results. Prefer safer paths and destinations; group Fleets and escort vulnerable Settlers; retreat from public superior forces; upgrade Construct and Move starters earlier while retaining immediate scoring payments. Do not change movement, combat, or information permissions to help bots.

## Predeclared evaluation

Freeze development before held-out seed blocks 2000–2063. Rotate seats and map-home assignments. Compare frozen 22.27 bots/rules, old decision policy on 23.28 rules with only a storage-price API adaptation, and new policy on 23.28 rules. Head-to-head old/new bots use the same 23.28 engine. Score unfinished games as censored, not wins. Report completion rate, strategy win shares, scoring sources, rounds, resource production/spending/discards, and randomized +2-resource gifts at early/late timing. Bootstrap whole seeds, not individual correlated seat rotations. Development pilots use other seeds. Archive raw results, hashes, and runner source; simulations evaluate these policies rather than prove human balance.
