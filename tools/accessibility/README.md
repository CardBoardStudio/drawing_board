# Galactic Reach accessibility audit

This local fixture runs the real game and canonical rulebook with pinned axe-core 4.14.0. The published game never loads the library, audit controls, or prepared positions.

From the repository root:

```sh
npm ci --prefix tools/accessibility --ignore-scripts
node tools/accessibility/audit.cjs
```

Open the printed localhost URL in the in-app browser. Click **Run WCAG audit** after opening the screen or dialog to check. The control moves into the active dialog or popover so it remains reachable. It hides during the scan and is excluded from the results. Reports go to `tools/accessibility/reports/`; set `A11Y_OUTPUT` to choose another local directory, or `A11Y_PORT` to choose another port.

The `fixture` query accepts `fresh`, `buy`, `combat`, `overflow`, and `mixed`. These are disposable, seeded QA positions on localhost. Each page load replaces only the fixture origin’s v27 game/history keys. Combat is created through the real adapter’s legal move and combat actions. The JSON reports record hashes of all seven reviewed browser assets, the viewport, axe results, and supplementary contrast calculations. The HTML index shows only reports matching the current source; earlier failures remain on disk as evidence.

## Scope and manual review

The scanner uses WCAG 2.0, 2.1 and 2.2 A/AA tags plus best practices. See the [W3C standard](https://www.w3.org/TR/WCAG22/), [reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [axe-core](https://www.deque.com/axe/axe-core/).

Per the project’s interface scope, run desktop checks only. Use desktop windows such as 1024, 1280, 1440 and 1920 CSS pixels for the hand, Buy market, Relics, Trade, Fleet, pile views, Rules, map key, point breakdown, sector inspector, notes, combat and overflow. Also scan the canonical rulebook. Check keyboard activation, skip-link destination, tab arrows/Home/End, visible focus, Escape and focus return. Check that shared panels never cover hexes and that controls remain usable in a smaller desktop window. Inspect the accessibility tree for dialog names and control labels. Do not adapt or test mobile UI.

Axe cannot determine every gradient’s background. The runner preserves these raw indeterminates and supplements them with computed foreground colors against conservative surface bounds: dark gradient surfaces use a conservative `#34494a` bound; light card gradients only lighten their opaque paper base. Opaque surfaces use their computed background. Decorative/disabled elements are excluded. Review these assumptions whenever the palette or texture changes. Check the report’s individual ratios, using 4.5:1 for normal text and 3:1 for large text. The map also checks 3:1 boundaries and piece contrast against the light/dark tile-bevel bounds. Ships retain faction colors with a dark keyline. These calculations do not measure every anti-aliased pixel or substitute for reviewing focus and graphics.

Automated and keyboard checks are evidence for the tested states, not a complete conformance certification. Spoken output and usability with screen-reader users still need assistive-technology testing.
