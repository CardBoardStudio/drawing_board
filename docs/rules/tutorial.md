# Tutorial brief: your first expedition

Status: **planned, not implemented**. First review the canonical rules and decide the [known 6.11 discrepancies](implementation-notes.md). This PR establishes that foundation; tutorial implementation follows once the rules are ready.

## The experience

Give a new commander a small, friendly expedition with a clear destination. Let them discover one decision at a time, see its consequence on the real board, and celebrate progress with short mission messages. Keep explanations beside the action, offer a hint when needed, and let players skip or replay any lesson.

| Mission | Player does | Rulebook source | Completion evidence |
| --- | --- | --- | --- |
| Power up | Compare a card's resource and order uses, then convert it | `#resources`, `#orders` | Resource and discard changes from an engine action |
| First flight | Move a Scout and reveal a world | `#movement` | Legal movement and shared world reveal |
| A place to call home | Reserve Biomass and found a Colony | `#orders`, `#building` | Cost paid, Scout consumed, ownership and Prestige updated |
| Build an engine | Build a structure and observe next-round production | `#building`, `#round` | Production and storage demonstrated, including overflow |
| Make a deal | Offer or accept a trade, then pass | `#trade`, `#round` | Settlement, Culture gain, and Operations ending |
| Make the deck yours | Buy a card and upgrade an original starter | `#buy` | Discard destination, upgrade cost, Technology gain |
| Choose your future | Spend influence on a vote and choose a directive | `#politics` | Bid spent, policy enacted, benefits distributed |
| Beyond the frontier | Optional Researcher/relic and combat practice | `#building`, `#combat`, `#cards` | Real engine outcome with an explanation |
| Your next goal | Inspect scoring and play a staged final round | `#victory` | Victory checked only after the directive |

## Implementation boundaries

- Pin the tutorial scenario to a declared rules version. Use deterministic setup/fixtures and the real legal-action and resolution APIs; do not implement simplified duplicate game rules. Explain any staged starting position.
- Give tutorial progress its own storage namespace and isolated state. Never reset, migrate, or overwrite a guest save or saved table to start a lesson. Reset/replay affects the lesson only.
- Each step stores its canonical section anchor and version. When a PR changes a taught rule, update that step and its behavior test in the same PR. Fail clearly if a scenario's rules version is unsupported.
- Advance from observed game state after the learner's action, not from clicking Next. Accept alternative legal solutions when they meet the objective. Let players retry safely.
- Keep keyboard access, visible focus, reduced-motion support, readable mobile layouts, and screen-reader announcements. Do not rely on color, animation, hover, or timed responses to teach a rule.

## Ready-to-ship evidence

The approved rulebook and tutorial agree on every demonstrated result. A new player can complete the core path without prior game knowledge; an experienced player can skip it. Test retry, reload, skip, alternative valid actions, and return to the existing game without save changes. Review the tutorial alongside the exact same version's rulebook on its Render PR preview before adoption.
