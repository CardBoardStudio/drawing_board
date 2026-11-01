# Cards and deck selection

Choose the setup in the lobby before **Practice with Kepler** or **Host a table**. The host chooses a shared market of exactly six different fleet and technology cards, plus one ten-card starting deck for everyone. This keeps the starting conditions equal while making combinations quick to playtest. Setup is fixed when the table is created and appears in **Match setup** for everyone who joins.

## Shared market

Use a preset or deselect a card and select its replacement. Six resource/colony piles are always present: Credit, Reactor, Fusion core, Outpost, Colony, and Metropolis. Only the six selected action piles appear in the market; excluded cards cannot be purchased and do not count as empty piles.

| Preset | Fleet and technology piles |
| --- | --- |
| First contact | Deep-space scout, Orbital relay, Star freighter, Research lab, Trade nexus, Salvage drone |
| Deep space | All six new cards below |
| Heavy industry | Star freighter, Trade nexus, Salvage drone, Survey vessel, Asteroid rig, Fabricator |

## New cards

All six are action cards: playing one spends an action before applying its effect. Draws can reshuffle the discard pile as usual. Cards gained by Fabricator go to discard, so they may be drawn by a later action if a reshuffle occurs.

| Card | Cost | Effect |
| --- | ---: | --- |
| Survey vessel | 4 | +1 card, +1 action, +1 credit |
| Asteroid rig | 4 | +2 credits, +1 buy |
| Command bridge | 5 | +1 card, +3 actions |
| Wormhole drive | 4 | +3 cards |
| Fabricator | 4 | +1 action; gain one Reactor from supply to discard if available |
| Observatory | 5 | +2 cards, +1 buy |

Fabricator spends neither credits nor a buy. If the Reactor pile is empty it still grants the action, but gains nothing. A gain can empty a pile; the existing end-of-turn game-end rules apply. Kepler can play and buy all twelve action cards and only buys from the selected supply.

## Starting decks

| Preset | Ten starting cards |
| --- | --- |
| Classic (default) | 7 Credits, 3 Outposts |
| Explorer | 6 Credits, 3 Outposts, 1 Survey vessel |
| Industrial | 5 Credits, 3 Outposts, 2 Reactors |

Each player, including the practice bot, shuffles a separate copy and draws five. All presets start at three influence. Starting cards are separate from supply counts; Explorer includes its Survey vessel even if that pile is not selected. These presets change the pace of a playtest; they are not asymmetric player factions.

## API and saved games

`POST /api/games` accepts an optional `setup` object. Omission preserves First contact plus Classic. For example:

```json
{
  "name": "Deep-space industry",
  "practice": true,
  "round_limit": 20,
  "setup": {
    "market": ["surveyor", "mining_rig", "command_bridge", "wormhole", "fabricator", "observatory"],
    "starting_deck": "industrial"
  }
}
```

The server rejects duplicate piles, non-action piles, and any market without exactly six entries. Unknown card or starting-deck identifiers are invalid. Setup is persisted in the game snapshot and initial private replay record and included in each player's public game view. The draw order and hands remain private.

New games use `voidwright/2`. Existing `voidwright/1` snapshots without setup load with First contact and Classic; their original version, supply, hands, and deck order remain intact. An existing lobby also keeps that original setup when launched.
