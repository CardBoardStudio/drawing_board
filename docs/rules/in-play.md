# Cards in play 27.32

The user requires used cards to remain outside discard so card-draw effects cannot recycle them during the same round. Canonical sections: `#round`, `#resources`, `#orders`, `#buy`, `#politics`, `#cards`.

Add a saved, public inPlay zone per faction. Ordinary orders, conversions, Buy effects and reactions enter it; shared round cleanup moves it and remaining hands to discard. Explicit discards/returns and newly gained cards retain their existing destinations. Successful basic Colonize/Probe/Excavate still trash themselves. Failure/cancellation spends nothing.

Commit a draw card to inPlay before its effect. Tactical Foresight retains the documented automatic first-remaining-card discard; the played Foresight is excluded because it is already in play. Correct its printed summary to match that reference. Do not add a discard-choice mechanic. Command Uplink still returns a basic from discard for a later action, as documented; correct its printed summary rather than adding an immediate action.

Count inPlay cards as owned in bot deck planning, saves, reports and replays. Discard-only recovery/trashing and hand/discard starter upgrades exclude them. Add a read-only In play pile. No policy-weight changes or balance claims.

Cutover: format 27, revision 32, native policy 23. Preserve exact 26.31 browser/manual assets and native policy 22. New preview/new game; no migration or merge into main.
