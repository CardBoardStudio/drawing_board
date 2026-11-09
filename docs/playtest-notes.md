# Playtest notes

Open **Playtest notes** in the game header. Write a general observation, or choose **Pick a map hex or UI element** and click its target. Picking intercepts that click before the game acts. Escape cancels picking. Each note records the rules version, round, phase, active faction, time, target label, and map coordinate when applicable.

Drafts save as you type. **Save note** adds an entry; **Edit**, **Remove**, and **Undo remove** manage entries. Numbered pins follow targets through board rerenders and scrolling. **Show target** scrolls to the original control when it is still present.

Choose which notes to include, edit the issue title, and open **Issue preview**. **Review GitHub issue** opens the repository's GitHub composer with the title and selected notes filled in. Review and submit there. Notes remain saved locally afterward. For drafts longer than the link can carry, use **Copy issue text** and paste the complete preview into GitHub.

Notes are stored separately from game progress, scoped to the browser origin, game, and rules version. Context uses rendered UI and strips URL queries, fragments, and credentials; the feature does not inspect saved games, cookies, private recovery keys, or authentication tokens. Browser storage failures keep the current in-memory notes available and show a prompt to copy them.

The standalone JavaScript and stylesheet are packaged with the game. They work with an existing save and require no server API. Regression checks: `node scripts/test-playtest-notes.cjs`; browser checks cover draft reload, target picking, editing, selected-note issue content, coordinates, remove/undo, and narrow layouts.
