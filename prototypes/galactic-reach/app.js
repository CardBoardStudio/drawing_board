// Browser UI and authoritative adapter share these exact rules.
'use strict';
function createGalacticReach(options = {}) {
  // Catalog mode (card gallery) never touches the DOM, timers or storage.
  const headless = options.headless === true || options.catalog === true;
  // Replay viewer: the live table's renderers over recorded observer states. No rules run.
  const replayMode = options.replay === true;
  // Presentation only: card stock, motion, the inspect view and drag-to-play (card-feel.js).
  const cardFeel = headless || replayMode ? null : globalThis.galacticReachCardFeel || null;
  // Presentation only: on-table guidance and the Learn to play coach marks (guide.js).
  const guide = headless || replayMode ? null : globalThis.galacticReachGuide || null;
  const developmentMode = !headless && !replayMode &&
    (/^(localhost|127\.0\.0\.1)$/.test(globalThis.location?.hostname || '') || /^drawing-board-pr-\d+(?:-[a-z0-9]+)?\.onrender\.com$/.test(globalThis.location?.hostname || '')) &&
    new URLSearchParams(globalThis.location?.search || '').get('dev')==='1';
  let revealEntireMap = false;
  const random = options.random || Math.random;
  let storage = options.storage;
  if (!headless && !storage) {
    try { storage = globalThis.localStorage; } catch (_) {}
  }
  const clearTimeout = headless ? () => {} : globalThis.clearTimeout.bind(globalThis);

  const SAVE_FORMAT_VERSION = 39;
  const RULES_REVISION = 44;
  // A dev build of main names its own rules in channel.js (docs/release.md#dev-channel).
  // Its saves get their own keys and are stamped with those rules, so a later dev
  // revision never reads them. Headless engines and released pages have no channel.
  const CHANNEL = !headless && globalThis.galacticReachChannel?.channel === 'dev' ? globalThis.galacticReachChannel : null;
  const RULES_ID = CHANNEL?.rules || `galactic-reach/${SAVE_FORMAT_VERSION}.${RULES_REVISION}`;
  const KEY_SUFFIX = CHANNEL ? `-${RULES_ID.split('/').pop()}` : '';
  // The Learn to play walkthrough (tutorial.js) keeps its game under its own keys, so starting,
  // replaying or leaving a lesson never touches the guest save (docs/rules/tutorial.md).
  const TUTORIAL = !headless && !replayMode && options.tutorial === true;
  const KEY_BASE = TUTORIAL ? 'galactic-reach-tutorial' : 'galactic-reach';
  const SAVE_KEY = `${KEY_BASE}-save-v${SAVE_FORMAT_VERSION}${KEY_SUFFIX}`;
  const TURN_HISTORY_KEY = `${KEY_BASE}-turn-history-v${SAVE_FORMAT_VERSION}${KEY_SUFFIX}`;
  const HISTORY_KEY = `${KEY_BASE}-history-v${SAVE_FORMAT_VERSION}${KEY_SUFFIX}`;
  // table.js seeds a server save under exactly these keys (createGalacticReach.storageKeys).
  if (options.storageKeys === true) return {save:SAVE_KEY,turnHistory:TURN_HISTORY_KEY,history:HISTORY_KEY};
  if (CHANNEL && typeof document !== 'undefined') document.querySelectorAll('.rules-badge').forEach(badge => { badge.textContent = CHANNEL.label; });
  const COLONY_LIFE_COST = 3;
  const RESOURCES = ['matter', 'energy', 'biomass', 'data'];
  const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Life', data: 'Data' };
  const RESOURCE_DETAILS = {
    matter: {
      purpose: 'Build ships and structures',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2 8 7-3 11H7L4 9z"></path><path d="m4 9 8 4 8-4M12 13v7M8 6l4 7 4-7"></path></svg>'
    },
    energy: {
      purpose: 'Fund fleets and card purchases',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.5 2 5 13h6l-.5 9L19 10h-6z"></path></svg>'
    },
    biomass: {
      purpose: 'Found colonies and sustain growth',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4C11 4 5 8.5 5 15c0 2.8 2.2 5 5 5 6.5 0 10-7 10-16Z"></path><path d="M4 21c2.6-5.1 6.3-8.8 11-11"></path></svg>'
    },
    data: {
      purpose: 'Research, buy, and upgrade cards',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2.5"></circle><circle cx="6" cy="18" r="2.5"></circle><circle cx="18" cy="18" r="2.5"></circle><path d="m10.7 7.2-3.4 8.6M13.3 7.2l3.4 8.6M8.5 18h7"></path></svg>'
    }
  };
  const PLAYER_COLORS = ['#55d9f4', '#ff9f6e', '#a58cff', '#f2cf66'];
  const PLAYER_NAMES = ['You', 'Ember Directorate', 'Violet Assembly', 'Helios Compact'];
  const PLAYER_STRATEGIES = ['human', 'military', 'economy', 'expansion'];
  const STRATEGY_NAMES = { military: 'Military', economy: 'Economy', expansion: 'Expansion', maxbot: 'MaxBot' };
  // Rules #setup: in a solo game the three rival factions are dealt to seats 1-3 at random.
  // Home order maps these logical seats to physical homes. A lineup lists the
  // rival (1-3, by its default seat) in seats 1, 2 and 3; headless games keep [1,2,3].
  const DEFAULT_LINEUP = [1, 2, 3];
  function validLineup(lineup) {
    return Array.isArray(lineup) && lineup.length === 3 && [1,2,3].every(n => lineup.includes(n));
  }
  function rollLineup() {
    const lineup = [...DEFAULT_LINEUP];
    for (let i = lineup.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [lineup[i], lineup[j]] = [lineup[j], lineup[i]]; }
    return lineup;
  }
  const DEFAULT_HOME_ORDER = [0,1,2,3];
  function validHomeOrder(order) {
    return Array.isArray(order) && order.length===4 && DEFAULT_HOME_ORDER.every(n=>order.includes(n));
  }
  function rollHomeOrder() {
    const order=[...DEFAULT_HOME_ORDER];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    return order;
  }
  function neighborSeat(homeOrder=DEFAULT_HOME_ORDER) {
    return homeOrder.indexOf(homeOrder[0]^1);
  }
  function lineupText(lineup, homeOrder=DEFAULT_HOME_ORDER, maxbot=false) {
    const neighbor=neighborSeat(homeOrder);
    const seats=[neighbor,...[1,2,3].filter(id=>id!==neighbor)];
    const [near,...far]=seats.map(id=>{const n=lineup[id-1];return maxbot&&PLAYER_STRATEGIES[n]==='economy' ? 'MaxBot (MaxBot)' : `${options.names?.[id]||PLAYER_NAMES[n]} (${STRATEGY_NAMES[PLAYER_STRATEGIES[n]]})`;});
    return {neighbor:near,far:far.join(' and ')};
  }
  const BOARD_RADIUS = 10;
  const PORTAL_MOVEMENT_COST = 2;
  // Straight-across reflection: lower-left (q,r) meets upper-right (r,q).
  const PORTAL_PAIRS = [...Array.from({length:5},(_,i)=>[-10,6+i]),...Array.from({length:4},(_,i)=>[-9+i,10])]
    .map(([q,r])=>[`${q},${r}`,`${r},${q}`]);
  const CORNER_PORTAL_LINKS = Object.fromEntries(PORTAL_PAIRS.flatMap(([a,b])=>[[a,b],[b,a]]));
  const HOME_STARTS = [
    { cluster: 0, owner: 0, colonySector: 0, inwardSector: 1 },
    { cluster: 1, owner: 1, colonySector: 0, inwardSector: 6 },
    { cluster: 2, owner: 2, colonySector: 0, inwardSector: 4 },
    { cluster: 3, owner: 3, colonySector: 0, inwardSector: 3 }
  ];
  const HOME_CLUSTER_OWNERS = HOME_STARTS.map(({ cluster, owner }) => [cluster, owner]);
  const RELIC_SECTORS = [[4,2],[5,5],[6,1],[7,4],[8,6],[9,3],[10,2],[11,5],[12,0]];
  const SHIP_STATS = {
    settler: { name: 'Settler', move: 1, power: 1, hull: 2, defendingHull: 4, cost: {"matter": 1, "biomass": 2} },
    explorer: { name: 'Explorer', move: 3, power: 1, hull: 1, civilian: true, cost: { energy: 1, data: 2 } },
    fleet: { name: 'Fleet', move: 2, power: 3, hull: 7, cost: {"matter": 2, "energy": 2} },
  };
  const BASIC_TACTICS = {
    concentratedFire: { name: 'Concentrated Fire', attack: 1, shield: 0, text: '+1 hit.' },
    defensiveScreen: { name: 'Defensive Screen', attack: 0, shield: 2, text: 'Prevent 2 hits.' },
  };
  const BASIC_TACTIC_HAND = { concentratedFire: 2, defensiveScreen: 2 };
  const STRUCTURES = {
    harvester: { name: 'Harvester', code: 'H', cost: { matter: 1, energy: 1, data: 1 } },
    starbase: { name: 'Shipyard', code: 'S', cost: {"matter": 2, "energy": 2, "data": 1} },
  };
  const STORAGE_UPGRADE = { capacity: 4 };
  // Rules #storage-allocation: capacity is a card. The table shares one pile of Capacity
  // Modules in the Upgrades tray. A played module joins its owner's permanent Storage pile,
  // and a module always costs 1 of each resource.
  const CAPACITY_SUPPLY = 20;
  const SUPPLY_CARDS = {
    capacityModule: { code: 'U01', name: 'Capacity Module', kind: 'Capacity', accent: 'var(--gold)', order: 'special', tag: 'capacityModule', supply: true, effect: { allocate: STORAGE_UPGRADE.capacity, store: true }, text: 'Costs 1 of each resource, every time. Add 4 capacity points, split as you choose among your resource limits, then put this card in your Storage pile.' }
  };
  // 32.37: a Harvester hex produces 2 of its resource (31.36 and earlier: 1).
  const HARVESTER_YIELD = 2;
  // Rules #victory: Prestige per decisive combat victory (2 from this package; 1 earlier).
  const COMBAT_VICTORY_PRESTIGE = 2;
  const RELIC_STORAGE_POINTS = 4;
  const EXCAVATION_COST = {"energy": 1, "data": 3};
  const LEGEND_TOOLTIPS = {
    settler: 'Colony ship. Base movement 1; Move II adds 1. It has 1 attack and 2 hull (4 while defending), reveals worlds by entering them, and is required to colonize. Commission at a Shipyard to receive a Colonize card.',
    explorer: 'Explorer: 1 attack, 1 hull. Before the first volley, pay 1 Energy per Explorer to escape to one legal adjacent hex. Reveals terrain by entering it; use Probe to locate relics. Base movement 3; Move II adds 1. Commission at a Shipyard to receive Probe / Excavate in discard; choose Probe or Excavate on the same card. Play it at a relic, pay 1 Energy and 3 Data, and choose a relic card. Consume one Explorer and trash Excavate.',
    fleet: 'Reveals terrain by entering it; use Probe to locate relics. Base movement 2 (3 with Move II), with 3 attack and 7 hull. You may have up to 10 Fleets on the map.',
    colony: 'Claims a seven-hex world. Colonies must occupy the world’s center hex.',
    harvester: 'Produces 2 of its hex’s resource per round. Buildings have no upgrades.',
    starbase: 'Commissions ships and defends its hex with 3 attack and 3 hull. Cannot be upgraded.',
  };
  const BOARD_ICONS = {
    settler: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>',
    explorer: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"></circle><path d="M4 21v-3a5 5 0 0 1 10 0v3"></path><path d="m15 11 2 2 4-5"></path></svg>',
    fleet: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"></path><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"></path></svg>',
    colony: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
    harvester: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"></path><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"></path><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"></path><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"></path></svg>',
    starbase: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"></path><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"></path><circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="5" cy="19" r="2"></circle></svg>',
  };
  const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

  const BASIC_CARDS = {
    colonize: { name: 'Colonize', kind: 'Basic', accent: 'var(--biomass)', order: 'colonize', text: `Pay ${COLONY_LIFE_COST} Life and consume a Settler on a world’s center hex to establish a Colony, then permanently trash Colonize. A capture costs 1 Life and also needs a Fleet.` },
    construct: { name: 'Construct', kind: 'Basic', accent: 'var(--matter)', resource: { matter: 1 }, order: 'construct', text: 'Build on any empty planet hex adjacent to your Colony, or commission one ship.', cost: { matter: 1, data: 1 } },
    move: { name: 'Move', kind: 'Basic', accent: 'var(--energy)', resource: { energy: 1 }, order: 'move', text: 'Move chosen combat ships or Explorers at the slowest chosen speed. Crossing the corner portal costs 2 movement.', cost: { energy: 1, data: 1 } },
    probe: { name: 'Probe / Excavate', kind: 'Basic', accent: 'var(--data)', order: 'probe', text: 'Probe: from your Explorer, locate the nearest remaining relic you don’t already know. Keep this card; if none remain unknown, keep your action too. Excavate: at a located site, pay 1 Energy and 3 Data; gain a relic into discard and 2 Prestige. Consume the Explorer and trash this card.' },
    excavate: { name: 'Excavate', kind: 'Basic', accent: 'var(--data)', order: 'excavate', text: 'At your Explorer’s located relic, pay 1 Energy and 3 Data. Choose a relic card into discard and gain 2 Prestige. Remove the relic and trash this card; consume one Explorer.' }
  };

  // Basic cards are not for sale. Cheap supplies draw-two and exchange designs.
  // Tiered market (rules #market): three decks by a card's total price, each with three
  // face-up slots, listed in table order (the relic row lies above Expensive).
  const MARKET_TIERS = [
    { id: 'expensive', name: 'Expensive', minPrice: 8 },
    { id: 'medium', name: 'Medium', minPrice: 6 },
    { id: 'cheap', name: 'Cheap', minPrice: 0 }
  ];
  const MARKET_TIER_SLOTS = 3;
  const MARKET_SIZE = MARKET_TIERS.length * MARKET_TIER_SLOTS;
  const MARKET_COPIES = 2;
  const STARTING_LIMIT = 4;
  const DEFAULT_VICTORY_TARGET = 30;
  const VICTORY_TARGET_CHOICES = [20, 30, 40, 50, 60];

  // Normal-deck market cards (codes N01-N29). Field meanings:
  // range/pathfinder/assault: Move bonuses; buildDiscount 'each'|'free', buildGain and secondBuild
  // (an optional full-price build after the first, like Construct II): Construct;
  // colonyCost/keepSettler/colonyPrestige: Colonize; effect: one-step special order;
  // buyEffect: Buy-turn card; gainPrestige: permanent Prestige when you buy it.
  const ADVANCED_CARDS = {
    ionThrusters: { code: 'N01', name: 'Ion Thrusters', kind: 'Movement', accent: 'var(--energy)', cost: { energy: 5 }, order: 'move', tag: 'ionThrusters', range: 2, text: 'Move one group with +2 range.' },
    slipstreamCharts: { code: 'N02', name: 'Slipstream Charts', kind: 'Movement', accent: 'var(--data)', cost: { data: 5 }, order: 'move', tag: 'slipstreamCharts', range: 3, pathfinder: true, text: 'Move one group with +3 range. It cannot enter hostile hexes.' },
    strikeVector: { code: 'N03', name: 'Strike Vector', kind: 'Movement', accent: 'var(--red)', cost: {"matter": 1, "energy": 4}, order: 'move', tag: 'strikeVector', range: 1, assault: 2, text: 'Move one group with +1 range. If it attacks, add 2 hits to the first volley.' },
    foldSpaceGate: { code: 'N04', name: 'Fold-Space Gate', kind: 'Movement', accent: 'var(--energy)', cost: {"energy": 6, "data": 1}, order: 'move', tag: 'foldSpaceGate', range: 5, text: 'Move one group with +5 range.' },
    prefabYards: { code: 'N05', name: 'Prefab Yards', kind: 'Industry', accent: 'var(--matter)', cost: {"matter": 4}, order: 'construct', tag: 'prefabYards', buildDiscount: 'each', secondBuild: true, text: 'Build or commission once, paying 1 less of each resource in its cost; then you may build once more at full price.' },
    worldEngine: { code: 'N07', name: 'World Engine', kind: 'Industry', accent: 'var(--matter)', cost: {"matter": 6, "energy": 1, "biomass": 1}, order: 'construct', tag: 'worldEngine', buildDiscount: 'free', orderDraw: 1, text: 'Build or commission once at no resource cost, then draw one card.' },
    seedArk: { code: 'N08', name: 'Seed Ark', kind: 'Expansion', accent: 'var(--biomass)', cost: {"biomass": 4}, order: 'colonize', tag: 'seedArk', colonyCost: 1, text: 'Colonize with a Settler for 1 Life. The Settler is consumed; Seed Ark stays in your deck.' },
    colonyPods: { code: 'N09', name: 'Colony Pods', kind: 'Expansion', accent: 'var(--biomass)', cost: {"energy": 1, "biomass": 4}, order: 'colonize', tag: 'colonyPods', colonyCost: 1, keepSettler: true, text: 'Colonize for 1 Life without consuming the Settler.' },
    genesisCharter: { code: 'N10', name: 'Genesis Charter', kind: 'Expansion', accent: 'var(--biomass)', cost: { matter: 2, biomass: 8, data: 1 }, order: 'colonize', tag: 'genesisCharter', colonyCost: 0, keepSettler: true, colonyPrestige: 2, text: 'Colonize for 0 Life without consuming the Settler, and gain 2 permanent Prestige.' },
    strategyCore: { code: 'N16', name: 'Strategy Core', kind: 'Deckcraft', accent: 'var(--data)', cost: { energy: 1, data: 5 }, order: 'special', tag: 'strategyCore', effect: { draw: 3 }, text: 'Draw three cards.' },
    archivePurge: { code: 'N17', name: 'Archive Purge', kind: 'Deckcraft', accent: 'var(--data)', cost: { biomass: 1, data: 5 }, order: 'special', tag: 'archivePurge', effect: { trashStarters: 2, draw: 1 }, text: 'Choose up to two level I starter cards in your discard pile and trash them permanently, then draw one card.' },
    commandNexus: { code: 'N18', name: 'Command Nexus', kind: 'Deckcraft', accent: 'var(--data)', cost: { energy: 2, data: 6 }, order: 'special', tag: 'commandNexus', effect: { draw: 4 }, text: 'Draw four cards.' },
    cargoExpansion: { code: 'N19', name: 'Cargo Expansion', kind: 'Capacity', accent: 'var(--gold)', cost: { matter: 5, data: 1 }, order: 'special', tag: 'cargoExpansion', effect: { limits: { matter: 2, energy: 2, biomass: 2, data: 2 }, trashSelf: true }, text: 'Permanently raise each resource limit by 2, then trash this card.' },
    hyperspaceVaults: { code: 'N20', name: 'Hyperspace Vaults', kind: 'Capacity', accent: 'var(--gold)', cost: { matter: 2, energy: 1, data: 6 }, order: 'special', tag: 'hyperspaceVaults', effect: { limits: { matter: 2, energy: 2, biomass: 2, data: 2 }, draw: 1 }, text: 'Permanently raise each resource limit by 2, then draw one card.' },
    procurementHub: { code: 'N21', name: 'Procurement Hub', kind: 'Buy', accent: 'var(--gold)', cost: {"biomass": 1, "data": 4}, buyEffect: 'hubDiscount', text: 'Buy turn: your next purchase this Buy costs 1 less of each resource in its cost.' },
    tradeSyndicate: { code: 'N22', name: 'Trade Syndicate', kind: 'Buy', accent: 'var(--gold)', cost: {"energy": 4, "data": 1}, buyEffect: 'discountEach', text: 'Buy turn: your next purchase this Buy costs 1 less of each resource in its cost.' },
    monumentOfAccord: { code: 'N23', name: 'Monument of Accord', kind: 'Wonder', accent: 'var(--gold)', cost: { matter: 6, biomass: 2, data: 2 }, gainPrestige: 3, text: 'When bought, gain 3 permanent Prestige. This card enters discard and has no effect in hand; trash it later to remove it from your deck.' },
    dysonLattice: { code: 'N25', name: 'Dyson Lattice', kind: 'Wonder', accent: 'var(--gold)', cost: { matter: 4, energy: 8, data: 2 }, gainPrestige: 5, text: 'When bought, gain 5 permanent Prestige. This card enters discard and has no effect in hand; trash it later to remove it from your deck.' },
    ascendancyCodex: { code: 'N26', name: 'Ascendancy Codex', kind: 'Prestige', accent: 'var(--gold)', cost: { energy: 2, biomass: 4, data: 8 }, order: 'special', tag: 'ascendancyCodex', effect: { prestige: 2, draw: 1 }, text: 'Gain 2 permanent Prestige, then draw one card.' },
    signalRelay: { code:'N27', name:'Signal Relay', kind:'Deckcraft', accent:'var(--data)', cost:{energy:2,data:1}, order:'special', effect:{draw:2}, text:'Draw two cards.' },
    surveyNetwork: { code:'N28', name:'Survey Network', kind:'Deckcraft', accent:'var(--data)', cost:{biomass:1,data:2}, order:'special', effect:{draw:2}, text:'Draw two cards.' },
    tacticalBriefing: { code:'N29', name:'Tactical Briefing', kind:'Deckcraft', accent:'var(--data)', cost:{matter:1,data:2}, order:'special', effect:{draw:2}, text:'Draw two cards.' },
    exchangeProtocol: { code:'N30', name:'Exchange Protocol', kind:'Exchange', accent:'var(--gold)', cost:{energy:2,data:1}, order:'special', effect:{bankRate:2}, text:'Play during Operations or your Buy turn. Choose a resource to give at 2:1 with the bank until your Buy ends.' },
    barterNetwork: { code:'N31', name:'Barter Network', kind:'Exchange', accent:'var(--gold)', cost:{biomass:1,data:2}, order:'special', effect:{bankRate:2}, text:'Play during Operations or your Buy turn. Choose a resource to give at 2:1 with the bank until your Buy ends.' },
    clearingHouse: { code:'N32', name:'Clearing House', kind:'Exchange', accent:'var(--gold)', cost:{matter:1,data:2}, order:'special', effect:{bankRate:2}, text:'Play during Operations or your Buy turn. Choose a resource to give at 2:1 with the bank until your Buy ends.' },
  };

  // Military-deck market cards (codes M01-M10). Buying one adds it to your military deck,
  // never your normal deck. Each battle your tactic hand is the four basic tactics plus
  // every military card you own; each card is usable once per battle.
  const MARKET_MILITARY = {
    railBattery: { code: 'M01', name: 'Rail Battery', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 5 }, attack: 2, shield: 0, text: '+2 hits this volley.' },
    deflectorGrid: { code: 'M02', name: 'Deflector Grid', kind: 'Military', military: true, accent: 'var(--red)', cost: { energy: 5 }, attack: 0, shield: 3, text: 'Prevent 3 hits this volley.' },
    flakScreen: { code: 'M03', name: 'Flak Screen', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 5, biomass: 1 }, attack: 1, shield: 2, text: '+1 hit and prevent 2 hits this volley.' },
    torpedoSpread: { code: 'M05', name: 'Torpedo Spread', kind: 'Military', military: true, accent: 'var(--red)', cost: { energy: 5, data: 1 }, attack: 3, shield: 0, text: '+3 hits this volley.' },
    hardlightBulwark: { code: 'M06', name: 'Hardlight Bulwark', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 5, energy: 1 }, attack: 0, shield: 5, text: 'Prevent 5 hits this volley.' },
    phaseLance: { code: 'M07', name: 'Phase Lance', kind: 'Military', military: true, accent: 'var(--red)', cost: { energy: 6, data: 2 }, attack: 2, shield: 0, pierce: true, text: '+2 hits this volley. The opponent’s shields prevent none of your hits.' },
    novaBarrage: { code: 'M08', name: 'Nova Barrage', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 3, energy: 7 }, attack: 5, shield: 0, text: '+5 hits this volley.' },
    aegisLattice: { code: 'M09', name: 'Aegis Lattice', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 7, energy: 2 }, attack: 0, shield: 8, text: 'Prevent 8 hits this volley.' },
    victoryDoctrine: { code: 'M10', name: 'Victory Doctrine', kind: 'Military', military: true, accent: 'var(--red)', cost: { matter: 1, energy: 2, data: 6 }, attack: 2, shield: 0, victoryPrestige: 2, text: '+2 hits this volley. If your side wins a decisive combat victory, gain 2 more permanent Prestige.' }
  };
  const RETIRED_MARKET_KEYS = ['strikeVector', 'prefabYards', 'seedArk', 'colonyPods', 'procurementHub', 'tradeSyndicate', 'archivePurge'];
  const MARKET_CARDS = Object.fromEntries(Object.entries({ ...ADVANCED_CARDS, ...MARKET_MILITARY }).filter(([key]) => !RETIRED_MARKET_KEYS.includes(key)));
  // Expensive wins at total 8+; requiring five of one resource raises a card to Medium.
  function marketTier(key) {
    const price = Object.values(MARKET_CARDS[key]?.cost || {}).reduce((sum, n) => sum + n, 0);
    if (price < 8 && Object.values(MARKET_CARDS[key]?.cost || {}).some(n => n >= 5)) return 'medium';
    return MARKET_TIERS.find(tier => price >= tier.minPrice).id;
  }
  const MILITARY_CARDS = { ...BASIC_TACTICS, ...MARKET_MILITARY };
  const CARD_BY_TAG = {}; // Filled after the full card catalog below.

  const RETIRED_RELIC_CARDS = {
    "phaseShearDrive": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Phase-Shear Drive",
        "affinity": "Exploration",
        "order": "move",
        "tag": "alienPhase",
        "text": "Move one group with +3 range. Hostile hexes still stop movement.",
        "lore": "Its makers folded distance into a crystal."
    },
    "firstDawnEchoes": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Echoes of the First Dawn",
        "affinity": "Exploration",
        "order": "special",
        "tag": "alienEchoes",
        "text": "Draw three cards into your hand.",
        "lore": "A vanished civilization speaks in possible futures."
    },
    "omniscientChorus": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Omniscient Chorus",
        "affinity": "Exploration",
        "order": "special",
        "tag": "alienSignals",
        "text": "Privately locate every remaining relic, then draw one card. A located signal does not reveal a hidden moon; other players do not see your private signals.",
        "lore": "Twelve dead moons hum the same coordinates."
    },
    "obeliskOfAnnihilation": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Obelisk of Annihilation",
        "affinity": "Military",
        "order": "move",
        "tag": "alienAssault",
        "text": "Move one group with +2 range. A battle you initiate with a Fleet gains +2 hits in its first volley.",
        "lore": "Its shadow arrives before its light."
    },
    "aegisOfSilentArchitects": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Aegis of the Silent Architects",
        "affinity": "Military",
        "reaction": "prevent",
        "strength": 4,
        "text": "Automatic reaction: prevent up to 4 incoming hits in your next combat volley.",
        "lore": "An impossible wall built by hands that never existed."
    },
    "warSongOfHollowStars": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "War-Song of the Hollow Stars",
        "affinity": "Military",
        "reaction": "targeting",
        "strength": 3,
        "requiresFleet": true,
        "text": "Automatic reaction: with a surviving Fleet, add 3 hits to your next combat volley.",
        "lore": "The weapon is the song. Your fleet is its instrument."
    },
};

  Object.assign(RETIRED_RELIC_CARDS, {
  "starfarersCompass": {
    "kind": "Alien Relic",
    "name": "Starfarer’s Compass",
    "affinity": "Exploration",
    "accent": "var(--gold)",
    "order": "move",
    "tag": "starfarersCompass",
    "text": "Move one group with +2 range, avoiding hostile hexes.",
    "lore": "A fragment of the civilizations that came before.",
    "range": 2,
    "pathfinder": true
  },
  "horizonSail": {
    "kind": "Alien Relic",
    "name": "Horizon Sail",
    "affinity": "Exploration",
    "accent": "var(--gold)",
    "order": "move",
    "tag": "horizonSail",
    "text": "Move one group with +4 range.",
    "lore": "A fragment of the civilizations that came before.",
    "range": 4
  },
  "memoryPrism": {
    "kind": "Alien Relic",
    "name": "Memory Prism",
    "affinity": "Exploration",
    "accent": "var(--gold)",
    "order": "special",
    "tag": "memoryPrism",
    "text": "Draw four cards.",
    "lore": "A fragment of the civilizations that came before.",
    "effect": {
      "draw": 4
    }
  },
  "archiveOfTides": {
    "kind": "Alien Relic",
    "name": "Archive of Tides",
    "affinity": "Exploration",
    "accent": "var(--gold)",
    "order": "special",
    "tag": "archiveOfTides",
    "text": "Trash up to two level I starters from discard, then draw two cards.",
    "lore": "A fragment of the civilizations that came before.",
    "effect": {
      "trashStarters": 2,
      "draw": 2
    }
  },
  "stellarCrucible": {
    "kind": "Alien Relic",
    "name": "Stellar Crucible",
    "affinity": "Settlement",
    "accent": "var(--gold)",
    "order": "construct",
    "tag": "stellarCrucible",
    "text": "Build or commission one ship or structure at no resource cost.",
    "lore": "A fragment of the civilizations that came before.",
    "buildDiscount": "free"
  },
  "evergreenArk": {
    "kind": "Alien Relic",
    "name": "Evergreen Ark",
    "affinity": "Settlement",
    "accent": "var(--gold)",
    "order": "colonize",
    "tag": "evergreenArk",
    "text": "Found or capture a Colony for zero Life without consuming the Settler.",
    "lore": "A fragment of the civilizations that came before.",
    "colonyCost": 0,
    "keepSettler": true
  },
  "foldedWarehouse": {
    "kind": "Alien Relic",
    "name": "Folded Warehouse",
    "affinity": "Settlement",
    "accent": "var(--gold)",
    "order": "special",
    "tag": "foldedWarehouse",
    "text": "Raise each resource limit by 1, then draw two cards.",
    "lore": "A fragment of the civilizations that came before.",
    "effect": {
      "limits": {
        "matter": 1,
        "energy": 1,
        "biomass": 1,
        "data": 1
      },
      "draw": 2
    }
  },
  "cinderDrive": {
    "kind": "Alien Relic",
    "name": "Cinder Drive",
    "affinity": "Military",
    "accent": "var(--gold)",
    "order": "move",
    "tag": "cinderDrive",
    "text": "Move one group with +1 range; add 3 hits to an attacking first volley.",
    "lore": "A fragment of the civilizations that came before.",
    "range": 1,
    "assault": 3
  },
  "keepersArchive": {
    "kind": "Alien Relic",
    "name": "Keepers’ Archive",
    "affinity": "Exploration",
    "accent": "var(--gold)",
    "order": "special",
    "tag": "keepersArchive",
    "text": "Raise your Data limit by 2, then draw three cards.",
    "lore": "A fragment of the civilizations that came before.",
    "effect": {
      "limits": {
        "data": 2
      },
      "draw": 3
    }
  }
});

  // Active sixteen-card deck. Retired definitions remain readable for historical card receipts.
  const RELIC_CARDS = {
  "firstDawnEchoes": {
    "code": "R02",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Echoes of the First Dawn",
    "affinity": "Exploration",
    "text": "Return up to two other cards from your In play pile to your hand.",
    "relicAbility": "echoes",
    "order": "special"
  },
  "omniscientChorus": {
    "code": "R03",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Omniscient Chorus",
    "affinity": "Exploration",
    "text": "Privately locate every remaining relic, then draw one card. Located signals do not reveal hidden moons.",
    "order": "special",
    "tag": "alienSignals"
  },
  "warSongOfHollowStars": {
    "code": "R06",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "War-Song of the Hollow Stars",
    "affinity": "Military",
    "text": "Play during battle, before committing your tactic. Recover one of your tactics used in this battle so you may choose it again.",
    "relicAbility": "warsong",
    "order": "special",
    "battleRelic": true
  },
  "starfarersCompass": {
    "code": "R07",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Starfarer’s Compass",
    "affinity": "Exploration",
    "text": "Move a chosen Explorer group directly to a remaining relic site you have located, regardless of distance. A hostile destination starts combat.",
    "relicAbility": "compass",
    "order": "special"
  },
  "horizonSail": {
    "code": "R08",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Horizon Sail",
    "affinity": "Military",
    "text": "Summon a chosen friendly ship group from within six hexes to your ships, Colony or Shipyard. You may also play it when attacked, before escapes, to reinforce your defense.",
    "relicAbility": "horizon",
    "order": "special"
  },
  "foldedWarehouse": {
    "code": "R13",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Folded Warehouse",
    "affinity": "Settlement",
    "text": "Raise each resource limit by 1, then draw two cards.",
    "order": "special",
    "tag": "foldedWarehouse",
    "effect": {
      "limits": {
        "matter": 1,
        "energy": 1,
        "biomass": 1,
        "data": 1
      },
      "draw": 2
    }
  },
  "keepersArchive": {
    "code": "R15",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Keepers’ Archive",
    "affinity": "Settlement",
    "text": "During Operations, buy one face-up market card for two fewer resources total. Choose which resource costs to reduce; no cost goes below zero. The card enters discard normally.",
    "relicAbility": "keepers",
    "order": "special"
  },
  "prismaticReservoir": {
    "code": "R16",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Prismatic Reservoir",
    "affinity": "Settlement",
    "text": "Redistribute your existing capacity between resource limits. Keep the same total; no limit may fall below 4 or the resources you hold.",
    "relicAbility": "reservoir",
    "order": "special",
    "newRelic": true
  },
  "hourglassOfTwoSuns": {
    "code": "R17",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Hourglass of Two Suns",
    "affinity": "Exploration",
    "text": "Immediately play two other Operations cards before play passes. Once per round; you may give up the extra actions by passing.",
    "relicAbility": "hourglass",
    "order": "special",
    "newRelic": true
  },
  "crownOfTheUsurper": {
    "code": "R18",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Crown of the Usurper",
    "affinity": "Military",
    "text": "At the start of battle, before escapes, take control of one enemy Fleet. It fights for you and stays yours if it survives. Your Fleet component limit still applies.",
    "relicAbility": "crown",
    "order": "special",
    "battleRelic": true,
    "newRelic": true
  },
  "phoenixCrucible": {
    "code": "R19",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Phoenix Crucible",
    "affinity": "Military",
    "text": "After battle, rebuild up to three ships you lost in that battle at one friendly, enemy-free Shipyard, for free. Component limits apply. Restored ships grant no bundled cards.",
    "relicAbility": "phoenix",
    "order": "special",
    "battleRelic": true,
    "newRelic": true
  },
  "worldseed": {
    "code": "R20",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Worldseed",
    "affinity": "Settlement",
    "text": "Found a Colony at an unoccupied neutral world center without a Settler. Pay the normal 3 Life Colony cost.",
    "relicAbility": "worldseed",
    "order": "special",
    "newRelic": true
  },
  "theSilentHour": {
    "code": "R21",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "The Silent Hour",
    "affinity": "Military",
    "text": "Play during battle before committing your tactic. Prevent all damage to your side for that volley; your side attacks normally.",
    "relicAbility": "silent",
    "order": "special",
    "battleRelic": true,
    "newRelic": true
  },
  "gravityScepter": {
    "code": "R22",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Gravity Scepter",
    "affinity": "Military",
    "text": "Displace one entire enemy ship group up to three hexes to an unoccupied hex with no building. This ignores routes and does not change ownership of the ships.",
    "relicAbility": "gravity",
    "order": "special",
    "newRelic": true
  },
  "eclipseRegalia": {
    "code": "R23",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Eclipse Regalia",
    "affinity": "Military",
    "text": "Before the first tactic commitments, take one unused enemy tactic for this battle. Only you may use that copy; ownership returns after battle.",
    "relicAbility": "eclipse",
    "order": "special",
    "battleRelic": true,
    "newRelic": true
  },
  "oracleOfTheUnmade": {
    "code": "R24",
    "kind": "Alien Relic",
    "accent": "var(--gold)",
    "name": "Oracle of the Unmade",
    "affinity": "Exploration",
    "text": "Search any market tier’s remaining deck and buy one card at normal cost. A normal card enters your hand immediately; a military card joins your military deck normally.",
    "relicAbility": "oracle",
    "order": "special",
    "newRelic": true
  }
};
  Object.assign(CARD_BY_TAG,Object.fromEntries([...Object.values(ADVANCED_CARDS),...Object.values(RETIRED_RELIC_CARDS),...Object.values(RELIC_CARDS)].filter(def=>def.tag).map(def=>[def.tag,def])));
  const ALL_CARDS = { ...BASIC_CARDS, ...ADVANCED_CARDS, ...MARKET_MILITARY, ...SUPPLY_CARDS, ...RETIRED_RELIC_CARDS, ...RELIC_CARDS };

  // The card vocabulary: one glyph per idea that recurs in card text.
  const VOCAB_ICONS = {
    prestige: '<span class="vocab-icon vocab-star" aria-hidden="true">★</span>',
    draw: '<span class="vocab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="3" width="11" height="15" rx="2"></rect><path d="M9 21h8a2 2 0 0 0 2-2V7"></path></svg></span>',
    hit: '<span class="vocab-icon vocab-hit" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 5l14 14M19 5 5 19"></path><path d="M3 9l3-3M15 21l3-3M21 9l-3-3M9 21l-3-3"></path></svg></span>',
    miss: '<span class="vocab-icon vocab-miss" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"></path></svg></span>',
    colonize: '<span class="vocab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 21V4"></path><path d="M5 4h12l-2.5 4L17 12H5"></path></svg></span>',
    build: '<span class="vocab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m14 4 6 6-3 3-6-6z"></path><path d="m11 7-8 8 3 3 8-8"></path></svg></span>',
    move: '<span class="vocab-icon vocab-move" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 12h13"></path><path d="m13 6 6 6-6 6"></path></svg></span>',
    limit: '<span class="vocab-icon vocab-limit" aria-hidden="true"><i></i></span>',
  };
  const VOCAB_LABELS = [['prestige','Prestige'],['draw','Draw a card'],['move','Move'],['hit','Hit'],['miss','Miss'],['limit','Limit'],['colonize','Colonize'],['build','Build']];
  const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };

  // Card corners (rules #card-corners). Top left: what the card does, as its symbols only;
  // top right: what it converts to, or its price. One symbol per unit, as the map key prints
  // prices; four or more of one symbol print once with their number, so a corner never overflows.
  const CORNER_REPEAT_MAX = 3;
  function cornerRepeat(symbol, count) {
    return count <= CORNER_REPEAT_MAX ? symbol.repeat(count) : `${symbol}<b class="corner-count">${count}</b>`;
  }
  // A price as one cluster of symbols per resource, in resource order: one symbol alone, two side
  // by side, three as a triangle (one above two), four or more once with their number. The amounts
  // are the accessible name. Markup only; styles.css shapes each cluster by its data-count.
  function costClusters(cost) {
    const present = RESOURCES.filter(resource => cost?.[resource] > 0);
    const label = present.map(resource => `${cost[resource]} ${RESOURCE_NAMES[resource]}`).join(', ');
    return `<span class="cost-clusters" role="img" aria-label="${label}">${present.map(resource => `<span class="cost-cluster ${resource}" data-count="${Math.min(cost[resource], CORNER_REPEAT_MAX + 1)}" title="${cost[resource]} ${RESOURCE_NAMES[resource]}">${cornerRepeat(resourceDot(resource), cost[resource])}</span>`).join('')}</span>`;
  }
  // The card's effect values, read from its data (never from its text): the order first, then
  // what comes with it. A card with no value that has a symbol returns none.
  function cardEffectParts(definition, card = {}) {
    const level = card.level === 3 ? 3 : card.upgraded ? 2 : 1, effect = definition.effect || {}, parts = [];
    const add = (key, count, label) => { if (count > 0) parts.push({ key, count, label }); };
    if (definition.order === 'construct') { const n = definition.secondBuild || level > 1 ? 2 : 1; add('build', n, n > 1 ? `Build up to ${n}` : 'Build 1'); }
    if (definition.order === 'move') { const range = (definition.range || 0) + (level > 1 ? 1 : 0); add('move', 1 + range, range ? `Move 1 group, +${range} range` : 'Move 1 group'); }
    if (definition.order === 'colonize') { add('colonize', 1, 'Colonize'); if (level > 1) add('build', 1, 'then build 1'); }
    add('hit', definition.attack, `+${definition.attack} ${definition.attack === 1 ? 'hit' : 'hits'}`);
    add('miss', definition.shield, `prevent ${definition.shield} ${definition.shield === 1 ? 'hit' : 'hits'}`);
    const limit = Math.max(0, ...Object.values(effect.limits || {}));
    add('limit', limit, `+${limit} to each resource limit`);
    const prestige = effect.prestige || definition.colonyPrestige || definition.gainPrestige || 0;
    add('prestige', prestige, `${prestige} Prestige`);
    const draw = (effect.draw || 0) + (definition.orderDraw || 0) + (level === 3 ? 1 : 0);
    add('draw', draw, `draw ${draw}`);
    return parts;
  }
  function cardEffectLabel(parts) {
    const text = parts.map(part => part.label).join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function cardSymbolGroups(parts) {
    return parts.map(part => `<span class="corner-group">${cornerRepeat(VOCAB_ICONS[part.key], part.count)}</span>`).join('');
  }
  function cardSymbols(definition, card = {}) {
    const parts = cardEffectParts(definition, card);
    if (!parts.length) return '';
    const label = cardEffectLabel(parts);
    return `<span class="card-symbols" role="img" aria-label="${label}" title="${label}">${cardSymbolGroups(parts)}</span>`;
  }
  // The top-right corner's resources: one symbol per unit, the amount in the accessible name.
  function cornerDots(amounts, prefix = '', marks = {}) {
    const present = RESOURCES.filter(resource => amounts?.[resource]);
    // Market prices keep their "; " list (they may carry a limit note); other amounts read as a list.
    const label = (prefix ? prefix + ' ' : '') + present.map(resource => `${amounts[resource]} ${RESOURCE_NAMES[resource]}${marks[resource]?.label || ''}`).join(Object.keys(marks).length ? '; ' : ', ');
    const repeat = n => n > 1 && n <= CORNER_REPEAT_MAX ? ` data-repeat="${n}"` : '';
    const chips = present.map(resource => `<span class="resource-chip ${resource} ${marks[resource]?.mark || ''}"${repeat(amounts[resource])} title="${marks[resource]?.title || `${amounts[resource]} ${RESOURCE_NAMES[resource]}`}">${cornerRepeat(resourceDot(resource), amounts[resource])}${marks[resource]?.icon || ''}</span>`).join('');
    return `<span class="resource-dots corner-dots" role="img" aria-label="${label}">${chips}</span>`;
  }

  // Card data only, for the card gallery page: no galaxy, state, timers or storage.
  if (options.catalog === true) return {
    rulesVersion: `galactic-reach/${SAVE_FORMAT_VERSION}.${RULES_REVISION}`, MARKET_CARDS, ADVANCED_CARDS, MARKET_MILITARY, BASIC_TACTICS, BASIC_CARDS, RELIC_CARDS,
    MARKET_SIZE, MARKET_COPIES, MARKET_TIERS, MARKET_TIER_SLOTS, marketTier, STARTING_LIMIT, DEFAULT_VICTORY_TARGET, VICTORY_TARGET_CHOICES, RESOURCES, RESOURCE_NAMES,
    // Shared, state-free presentation for the gallery's costs and card descriptions.
    resourceDots, iconText, BOARD_ICONS, cardSymbols, cornerDots, costClusters, cardEffectParts, cardEffectLabel
  };


  let cardSerial = 1;
  // Table settings chosen when a game is created (rules #victory). Saved in state.
  let newGameSettings = { ...(options.newGameSettings || {}) };
  // Counts turn starts in this session (not saved). A shared table uses it to keep
  // Undo inside the current turn; replaying the table log reproduces it exactly.
  let turnSerial = 0;
  let state;
  const bankSelection = { give: null, get: null };
  let storageAllocationDraft = null;
  let newGameLineup = null;
  let newGameHomeOrder = null;
  let archivePurgeCardId = null;
  let aiTimer = null;
  let displayingCombatReport = false;
  let turnHistory = { pending: null, undo: null };
  // Browser-only notice for turns the interface finished on the player's behalf
  // (empty hand, or a Buy turn with no possible choice). It stays visible until the
  // player completes their next turn. Rules and legal actions are unchanged.
  let autoNotice = '', autoTurn = false;
  let gameHistory = null;
  let historyPosition = null;
  let historySaveFailed = false;
  let moonLayoutChoices = null;
  // A shared table's browser is a client of the server's table service: it renders
  // its seat's private view and sends that seat's choices. No rule runs here.
  const network = !headless && !replayMode ? options.network || null : null;
  // The seat this browser plays: always 0 for solo play and the headless engine.
  const ME = network ? network.seat : 0;
  // Whose command panels (resources, hand) are shown. Live play shows ME.
  let viewSeat = ME;

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const coordKey = (q, r) => `${q},${r}`;
  const parseCoord = (key) => key.split(',').map(Number);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function makeCard(key, starter = false) {
    return { key, id: `${key}-${cardSerial++}`, starter, upgraded: false };
  }

  // At a shared table every shuffle comes from the table's hidden-information
  // authority (options.shuffle returns a permutation of 0..n-1), so the table log
  // records it. Solo play and the arena draw from `random` exactly as before.
  function shuffled(array, purpose = 'shuffle') {
    if (options.shuffle) {
      const order = options.shuffle(array.length, purpose);
      if (!Array.isArray(order) || order.length !== array.length || new Set(order).size !== array.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= array.length))
        throw new Error('The table authority returned an invalid shuffle.');
      return order.map(i => array[i]);
    }
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function randomizedMoonPositions(worlds, homes) {
    // Enumerate the bounded legal space once. Sampling it needs no random retries,
    // including when tests supply a constant RNG. The chosen positions alone save.
    const moonDistance=(a,b)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[0]+a[1]-b[0]-b[1]));
    if (!moonLayoutChoices) {
      const pools = homes.map(()=>[]);
      for (let q=-BOARD_RADIUS;q<=BOARD_RADIUS;q++) for (let r=-BOARD_RADIUS;r<=BOARD_RADIUS;r++) {
        const key=coordKey(q,r);
        if (!boardHas(key) || worlds.some(([a,b])=>moonDistance([q,r],[a,b])<3)) continue;
        const distances=homes.map(([a,b])=>moonDistance([q,r],[a,b])), nearest=Math.min(...distances);
        if (nearest<4 || nearest>7 || distances.filter(d=>d===nearest).length!==1) continue;
        pools[distances.indexOf(nearest)].push({point:[q,r],distance:nearest});
      }
      moonLayoutChoices=[];
      const choose=(picked,distances)=>{
        if (picked.length===4) {
          const nearest=picked.map((p,i)=>Math.min(...picked.filter((_,j)=>j!==i).map(other=>moonDistance(p,other))));
          const q=picked.reduce((sum,p)=>sum+p[0],0),r=picked.reduce((sum,p)=>sum+p[1],0);
          if (Math.max(...nearest)-Math.min(...nearest)>2 || Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))>8) return;
          moonLayoutChoices.push([...picked]);return;
        }
        for (const {point,distance} of pools[picked.length]) {
          const nextDistances=[...distances,distance];
          if (Math.max(...nextDistances)-Math.min(...nextDistances)>1 || picked.some(other=>moonDistance(point,other)<6)) continue;
          choose([...picked,point],nextDistances);
        }
      };
      choose([],[]);
      if (!moonLayoutChoices.length) throw new Error('The approved world layout has no balanced moon placements.');
    }
    const choice=options.shuffle ? shuffled(moonLayoutChoices.map((_,i)=>i),'moon-layout')[0] : Math.floor(random()*moonLayoutChoices.length);
    return moonLayoutChoices[choice].map(point=>[...point]);
  }

  function centralTerrainPositions() {
    const slots=[[8,-8],[-8,8],[6,-3],[3,-6],[-3,-3],[-6,3],[-3,6],[3,3]], edge=BOARD_RADIUS-1;
    const homes=[[-edge,0],[0,-edge],[edge,0],[0,edge]];
    return {worlds:[...shuffled(slots,'world-positions'),[0,0]],moons:randomizedMoonPositions([...homes,...slots,[0,0]],homes)};
  }

  function generateGalaxy(homeOrder=DEFAULT_HOME_ORDER) {
    // Seven-hex home worlds touch the rim; first AI Shipyards use the inward Energy hex.
    const edge = BOARD_RADIUS - 1;
    const physicalHomes = [[-edge,0],[0,-edge],[edge,0],[0,edge]];
    const homeCenters = homeOrder.map(slot=>physicalHomes[slot]);
    const layout = centralTerrainPositions();
    const centers = [...homeCenters, ...layout.worlds];
    const names = ['Asterion','Borealis','Cygnus','Draco','Erebus','Fornax','Gemini','Helios','Icarus','Juno','Kepler','Lyra','Meridian'];
    const homes = new Map(HOME_CLUSTER_OWNERS);
    const relicSectors = new Map(RELIC_SECTORS);
    const resourceCycle = ['matter','energy','biomass','data'];
    const numerals = ['I','II','III','IV','V','VI','VII'];
    const planets = {};
    const clusters = [];
    centers.forEach(([q,r], clusterIndex) => {
      const coords = [[q,r], ...DIRECTIONS.map(([dq,dr]) => [q+dq,r+dr])];
      const homeOwner = homes.has(clusterIndex) ? homes.get(clusterIndex) : null;
      const originalStart = HOME_STARTS.find(start => start.cluster === clusterIndex);
      const homeStart = originalStart && {...originalStart,inwardSector:HOME_STARTS[homeOrder[clusterIndex]].inwardSector};
      const types = homeOwner !== null
        ? ['matter','energy','biomass','data','matter','energy','data']
        : shuffled(Array.from({ length: 7 }, (_, index) => resourceCycle[(clusterIndex * 2 + index) % 4]),`world-sectors:${clusterIndex}`);
      if (homeStart && types[homeStart.inwardSector] !== 'energy') {
        const energySector = types.findIndex((type,index) => type === 'energy' && index !== homeStart.colonySector);
        [types[homeStart.inwardSector],types[energySector]] = [types[energySector],types[homeStart.inwardSector]];
      }
      clusters.push({
        id: clusterIndex, kind: 'world', name: names[clusterIndex], center: coordKey(q,r),
        coords: coords.map(([cq,cr]) => coordKey(cq,cr)),
        scannedBy: homeOwner === null ? [] : [0,1,2,3], revealedBy: homeOwner === null ? [] : [0,1,2,3]
      });
      coords.forEach(([cq,cr], planetIndex) => {
        const isHomeColony = Boolean(homeStart && planetIndex === homeStart.colonySector);
        const owner = isHomeColony ? homeOwner : null;
        const type = types[planetIndex];
        planets[coordKey(cq,cr)] = {
          q: cq, r: cr, cluster: clusterIndex, name: `${names[clusterIndex]} ${numerals[planetIndex]}`,
          type, special: relicSectors.get(clusterIndex) === planetIndex ? 'relic' : null,
          owner, originalFounder: isHomeColony ? owner : null, hasColony: isHomeColony,
          upgrade: null, upgradeLevel: 0,
          relicClaimed: false, conquest: owner !== null ? false : null
        };
      });
    });
    layout.moons.forEach(([q,r],index)=>{
      const key=coordKey(q,r), id=clusters.length, name=`Moon ${index+1}`;
      clusters.push({id,kind:'moon',name,center:key,coords:[key],scannedBy:[],revealedBy:[]});
      planets[key]={q,r,cluster:id,name,type:'moon',special:'relic',owner:null,originalFounder:null,
        hasColony:false,upgrade:null,upgradeLevel:0,relicClaimed:false,conquest:null};
    });
    return { planets, clusters, homes };
  }

  function createPlayer(index, lineup = DEFAULT_LINEUP) {
    const deck = [];
    for (let i = 0; i < 3; i += 1) deck.push(makeCard('move',true), makeCard('construct',true));
    const faction = index === 0 ? 0 : lineup[index - 1];
    const maxbot=(options.maxbot===true||newGameSettings.maxbot===true)&&PLAYER_STRATEGIES[faction]==='economy';
    return {
      id: index, name: maxbot?'MaxBot':options.names?.[index] || PLAYER_NAMES[faction], color: PLAYER_COLORS[faction], strategy: maxbot?'maxbot':PLAYER_STRATEGIES[faction],
      resources: { matter: 0, energy: 0, biomass: 1, data: 1 }, deck: shuffled(deck,`deck:${index}`), discard: [], hand: [], inPlay: [],
      resourceLimits: { matter:4, energy:4, biomass:4, data:4 }, storageUpgrades: 0, storagePurchases: 0, storage: [], initialShipyardCoord: null, cardsPurchased: 0, relicsExcavated: 0, combatVictories: 0, passed: false, tradeUsed: false, bought: 0,
      buyDiscountEach: 0, buyHubDiscounts: 0, bankExchangeResources: [], buyStartDiscardIds: [], buyStartInPlayIds: [], buyStartHandIds: [], combatBonus: 0, military: [], cardPrestige: 0,
      tradesWith: [0,0,0,0], ...(options.controllers ? {controller: options.controllers[index]} : {})
    };
  }

  function newState() {
    cardSerial = 1;
    // Solo positions are shuffled; authority/simulation defaults and the practice game stay fixed.
    const solo = !headless && !network && !replayMode && !TUTORIAL;
    const homeOrder = validHomeOrder(options.homeOrder) ? [...options.homeOrder]
      : validHomeOrder(newGameSettings.homeOrder) ? [...newGameSettings.homeOrder]
      : solo ? rollHomeOrder() : DEFAULT_HOME_ORDER;
    const galaxy = generateGalaxy(homeOrder);
    // The rival lineup is dealt after the map, so a solo game's galaxy is unchanged by it.
    const lineup = validLineup(options.lineup) ? options.lineup : validLineup(newGameSettings.lineup) ? newGameSettings.lineup
      : headless || options.names ? DEFAULT_LINEUP : rollLineup();
    const players = [0,1,2,3].map(index => createPlayer(index, lineup));
    const fleets = {};
    // Rules #market: one shuffled deck per price tier, each mixing normal-deck and military cards.
    const marketDecks = Object.fromEntries(MARKET_TIERS.map(tier => [tier.id, shuffled(Object.keys(MARKET_CARDS).filter(key => marketTier(key) === tier.id)
      .flatMap(key => Array.from({ length: MARKET_COPIES }, () => makeCard(key))), `market-deck:${tier.id}`)]));
    const target = Number(options.victoryTarget ?? newGameSettings.victoryTarget);
    const relicDeck = shuffled(Object.keys(RELIC_CARDS).map(key=>makeCard(key)),'relic-deck');
    const relicRow = [relicDeck.pop(),relicDeck.pop(),relicDeck.pop()];
    // Rules #setup: each faction draws its opening five before Round 1 Production.
    players.forEach(player => drawCards(player, 5));
    const initial = {
      version: SAVE_FORMAT_VERSION, round: 1, phase: 'production', firstPlayer: 0, activePlayer: 0, players,
      ...(solo || validHomeOrder(options.homeOrder) ? {homeOrder:[...homeOrder]} : {}),
      portalLinks: {...CORNER_PORTAL_LINKS}, planets: galaxy.planets, clusters: galaxy.clusters, fleets, marketDecks, market: [], capacitySupply: CAPACITY_SUPPLY,
      selected: null, actionMode: null, actionCardId: null, actionOptions: {}, moveSource: null, reachable: [],
      turnStage: 'waiting', log: [], winner: null,
      lastCombat: null, pendingCombat: null, pendingMove: null, pendingCombatReport: null, relicDeck, relicRow,
      tradeOffers: [], nextTradeOfferId: 1, pendingColonyBuild: null, pendingConstruct: null, pendingConsortium: null,
      visibilityRevision: 4, rulesRevision: RULES_REVISION, ...(CHANNEL ? {devRules: RULES_ID} : {}),
      victoryTarget: VICTORY_TARGET_CHOICES.includes(target) ? target : DEFAULT_VICTORY_TARGET
    };
    if (!headless) {
      gameHistory = {format:1, rulesVersion:`galactic-reach/${SAVE_FORMAT_VERSION}.${RULES_REVISION}`, complete:true, initialState:clone(initial), events:[]};
      historyPosition = auditPosition(initial);
    }
    return initial;
  }

  // The append-only audit is outside state: undo snapshots and arena observations
  // must not duplicate the whole history or reveal private cards to policies.
  function auditPosition(position = state) {
    return {
      round:position.round, phase:position.phase, activePlayer:position.activePlayer, winner:position.winner,
      players:position.players.map(player=>({
        resources:clone(player.resources), resourceLimits:clone(player.resourceLimits), prestige:prestigeBreakdown(player.id,position), storageUpgrades:player.storageUpgrades, storagePurchases:player.storagePurchases,
        cardsPurchased:player.cardsPurchased, relicsExcavated:player.relicsExcavated, combatVictories:player.combatVictories, cardPrestige:player.cardPrestige, military:clone(player.military),
        passed:player.passed, bought:player.bought, bankExchangeResources:[...(player.bankExchangeResources||[])],
        hand:clone(player.hand), deck:clone(player.deck), discard:clone(player.discard), inPlay:clone(player.inPlay)
      })),
      planets:clone(position.planets), clusters:clone(position.clusters), fleets:clone(position.fleets),
      market:clone(position.market), relicRow:clone(position.relicRow), tradeOffers:clone(position.tradeOffers),
      pendingConstruct:clone(position.pendingConstruct || null), lastCombat:clone(position.lastCombat)
    };
  }

  function auditChanges(before, after, path = [], changes = []) {
    if (JSON.stringify(before) === JSON.stringify(after)) return changes;
    if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before),...Object.keys(after)])) auditChanges(before[key],after[key],[...path,key],changes);
    } else if (path.length === 1 && path[0] === 'players') {
      after.forEach((player,id)=>auditChanges(before[id],player,[...path,String(id)],changes));
    } else changes.push({path,before:before ?? null,after:after ?? null});
    return changes;
  }

  function appendHistory(text, detail = {}) {
    if (headless || replayMode || !gameHistory) return;
    const position = auditPosition();
    const changes = auditChanges(historyPosition,position);
    if (!text && !changes.length) return;
    const actor = detail.actor ?? state.players.find(player=>text?.startsWith(player.name) || (player.id===ME && text?.startsWith('You ')))?.id ?? null;
    gameHistory.events.push({seq:gameHistory.events.length+1,round:state.round,phase:state.phase,actor,
      kind:detail.kind || (text?'event':'position'),text:text || 'Position updated.',changes,...detail});
    historyPosition = position;
  }

  function stateSignature(position, version = 2) {
    // Detect an interrupted two-key write or a different game's history. This is
    // an integrity marker, not a security primitive or a seed for the game RNG.
    let hash = 2166136261;
    // Account storage may reorder object keys. Array order (including decks)
    // still matters. Version 1 remains readable for existing browser histories.
    const canonical = value=>Array.isArray(value)?value.map(canonical):value && typeof value==='object'
      ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
    const text = JSON.stringify(version===1?position:canonical(position));
    for (let n=0;n<text.length;n++) hash = Math.imul(hash ^ text.charCodeAt(n),16777619) >>> 0;
    return `${text.length}:${hash.toString(16)}`;
  }

  function loadGameHistory() {
    let saved;
    try { saved = JSON.parse(storage.getItem(HISTORY_KEY) || 'null'); } catch (_) {}
    const rulesVersion = `galactic-reach/${SAVE_FORMAT_VERSION}.${RULES_REVISION}`;
    if (saved?.format===1 && saved.rulesVersion===rulesVersion && saved.stateSignature===stateSignature(state,saved.signatureVersion || 1) && Array.isArray(saved.events)) {
      gameHistory = saved;
    } else {
      for (const snapshot of [turnHistory.pending,turnHistory.undo]) if (snapshot) snapshot.historyCursor = null;
      gameHistory = {format:1,rulesVersion,complete:false,initialState:null,
        coverageNote:'Full history was unavailable for this position. Only retained messages and subsequent events are included.',
        events:[...state.log].reverse().map((text,index)=>({seq:index+1,round:Number(/^R(\d+)/.exec(text)?.[1]) || null,phase:null,actor:null,kind:'retained',text,changes:[]}))};
    }
    historyPosition = auditPosition();
  }

  function saveGame() {
    if (headless || replayMode || network) return;
    appendHistory();
    gameHistory.signatureVersion = 2;
    gameHistory.stateSignature = stateSignature(state);
    historySaveFailed = false;
    try {
      storage.setItem(HISTORY_KEY,JSON.stringify(gameHistory));
      storage.setItem(TURN_HISTORY_KEY,JSON.stringify(turnHistory));
      storage.setItem(SAVE_KEY,JSON.stringify(state));
    } catch (_) { historySaveFailed = true; }
    options.onSave?.({state,turnHistory,gameHistory});
    renderHistoryStatus();
  }

  function saveTurnHistory() {
    saveGame();
  }

  function renderHistoryStatus() {
    if (headless || replayMode) return;
    $('#history-status').textContent = historySaveFailed
      ? 'Browser save unavailable. Keep this page open and export a report to keep your history.'
      : gameHistory?.complete ? 'Full history retained from setup.' : 'Partial history: earlier actions are unavailable.';
  }

  function createGameReport() {
    // A report is a read-only snapshot. Pending deltas belong in this copy only.
    const history = clone(gameHistory);
    const changes = auditChanges(historyPosition,auditPosition());
    if (changes.length) history.events.push({seq:history.events.length+1,round:state.round,phase:state.phase,actor:null,kind:'position',text:'Current position at export.',changes});
    history.signatureVersion = 2;
    history.stateSignature = stateSignature(state);
    const changeText = change=>{
      const path=change.path;
      if (path[0]==='players' && path[2]==='resources') {
        const delta=change.after-change.before;
        return `${state.players[Number(path[1])].name}: ${delta>=0?'+':''}${delta} ${RESOURCE_NAMES[path[3]]}`;
      }
      if (path[0]==='players' && path[2]==='prestige' && path[3]==='total') return `${state.players[Number(path[1])].name}: ${change.after-change.before>=0?'+':''}${change.after-change.before} Prestige (${change.after} total)`;
      return '';
    };
    return {
      reportFormat:'galactic-reach-game-report/1', rulesVersion:history.rulesVersion,
      round:state.round, phase:state.phase, activePlayer:state.activePlayer, winner:state.winner,
      coverage:{complete:history.complete,note:history.coverageNote || 'History retained from setup.',events:history.events.length},
      factions:state.players.map(player=>({id:player.id,name:player.name,controller:player.id===ME?'human':'computer',
        botProfile:player.id===ME?null:{strategy:player.strategy,implementation:'browser-ai',rulesVersion:history.rulesVersion},
        resources:clone(player.resources),resourceLimits:clone(player.resourceLimits),capacity:playerCapacity(player.id),points:prestigeBreakdown(player.id),
        cards:{hand:player.hand.length,deck:player.deck.length,discard:player.discard.length,inPlay:player.inPlay.length,purchased:player.cardsPurchased || 0}})),
      save:{state:clone(state),turnHistory:clone(turnHistory),gameHistory:history},
      logText:[history.complete?'Complete history from setup.':history.coverageNote,...history.events.map(event=>`#${event.seq} R${event.round ?? '?'} ${event.phase || ''} · ${event.text}${event.kind==='undo'?(Number.isInteger(event.undone.from)?` [rolls back #${event.undone.from}–#${event.undone.to}]`:' [earlier event range unavailable]'):''}${event.changes.map(changeText).filter(Boolean).map(text=>' | '+text).join('')}`)].join('\n')
    };
  }

  function downloadGameReport() {
    if (headless || replayMode) return;
    const report = createGameReport();
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = `galactic-reach-${SAVE_FORMAT_VERSION}.${RULES_REVISION}-round-${state.round}-report.json`;
    link.click();
    globalThis.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function loadTurnHistory() {
    try {
      const raw = storage.getItem(TURN_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        turnHistory.pending = parsed.pending || null;
        turnHistory.undo = parsed.undo || null;
      }
    } catch (_) {
      turnHistory = { pending: null, undo: null };
    }
  }

  function clearTurnHistory() {
    turnHistory = { pending: null, undo: null };
    try { storage.removeItem(TURN_HISTORY_KEY); } catch (_) {}
  }

  function captureHumanTurn(label) {
    if (headless) return;
    turnHistory.pending = { state: clone(state), cardSerial, label, historyCursor:gameHistory?.events.length || 0 };
    saveTurnHistory();
  }

  function completeHumanTurn() {
    if (!autoTurn) autoNotice = '';
    if (!turnHistory.pending) return;
    turnHistory.undo = turnHistory.pending;
    turnHistory.pending = null;
    saveTurnHistory();
  }

  function undoLastTurn() {
    if (!turnHistory.undo || state.pendingConstruct || state.pendingCombatReport || state.pendingCombat || state.pendingMove || overflowPlayer()>=0) return;
    const snapshot = turnHistory.undo;
    clearTimeout(aiTimer);
    const lastEvent = gameHistory.events.length;
    state = clone(snapshot.state);
    cardSerial = snapshot.cardSerial;
    turnHistory.undo = null;
    const knownRange = Number.isInteger(snapshot.historyCursor) && snapshot.historyCursor < lastEvent;
    appendHistory(`${snapshot.label} restored with Undo.`,{kind:'undo',actor:0,undone:knownRange?{from:snapshot.historyCursor+1,to:lastEvent}:{from:null,to:null,reason:'Earlier event range unavailable.'}});
    turnHistory.pending = { state: clone(state), cardSerial, label: snapshot.label, historyCursor:gameHistory.events.length };
    saveTurnHistory();
    const messageDialog = $('#message-dialog');
    if (messageDialog.open) messageDialog.close();
    $('#trade-response').textContent = '';
    saveGame();
    render();
    toast(`${snapshot.label} restored.`);
  }

  // A save this engine will not resume is left untouched; the reason goes to the console,
  // because the page itself only says the save could not be loaded.
  function rejectSave(reason) {
    globalThis.console?.warn?.(`Heirs Ad Astra did not load the save at ${SAVE_KEY}: ${reason}`);
    return false;
  }

  function loadGame() {
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return options.requireSave ? rejectSave('no save under this key') : false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_FORMAT_VERSION || parsed.rulesRevision !== RULES_REVISION)
        return rejectSave(`it was dealt with rules ${parsed?.version}.${parsed?.rulesRevision}, not ${SAVE_FORMAT_VERSION}.${RULES_REVISION}`);
      if (CHANNEL && parsed.devRules !== RULES_ID) return rejectSave(`it was dealt with dev rules ${parsed.devRules || '(none)'}, not ${RULES_ID}`);
      // A save from before the tiered market has one market deck; it belongs to the earlier rules.
      if (!parsed.marketDecks) return rejectSave('it has no tiered market decks');
      if (!Array.isArray(parsed.players) || parsed.players.length!==4 || parsed.players.some(p=>!p.resourceLimits || RESOURCES.some(r=>!Number.isSafeInteger(p.resourceLimits[r])||p.resourceLimits[r]<4))) return rejectSave('its players or resource limits are malformed');
      state = parsed;
      if (!Number.isInteger(state.capacitySupply)) state.capacitySupply = CAPACITY_SUPPLY;
      state.players.forEach(p => { if (!Array.isArray(p.storage)) p.storage = []; });
      loadGameHistory();
      cardSerial = Math.max(1, ...state.players.flatMap(p => [...p.deck, ...p.discard, ...p.hand, ...p.inPlay, ...(p.storage || [])].map(c => Number(String(c.id).split('-').pop()) || 0)), ...state.market.map(c => Number(String(c.id).split('-').pop()) || 0)) + 1;
      if (!state.visibilityRevision) {
        const everyone = [0,1,2,3];
        HOME_CLUSTER_OWNERS.forEach(([clusterIndex]) => {
          state.clusters[clusterIndex].scannedBy = [...everyone];
          state.clusters[clusterIndex].revealedBy = [...everyone];
        });
        state.clusters.forEach(cluster => {
          if (cluster.revealedBy?.length) cluster.revealedBy = [...everyone];
        });
        state.visibilityRevision = 4;
        clearTurnHistory();
        saveGame();
      }
      return true;
    } catch (error) { return rejectSave(`it could not be read (${error?.message || error})`); }
  }

  function logEvent(text) {
    state.log.unshift(`R${state.round} · ${text}`);
    state.log = state.log.slice(0, 80);
    appendHistory(text);
  }

  function getFleet(coord, player) {
    return state.fleets[coord]?.[player] || null;
  }

  function ensureFleet(coord, player) {
    state.fleets[coord] = state.fleets[coord] || {};
    state.fleets[coord][player] = state.fleets[coord][player] || { settler: 0, explorer: 0, fleet: 0 };
    if (state.fleets[coord][player].explorer === undefined) state.fleets[coord][player].explorer = 0;
    return state.fleets[coord][player];
  }

  function fleetCount(fleet) {
    return fleet ? (fleet.settler || 0) + (fleet.explorer || 0) + (fleet.fleet || 0) : 0;
  }

  function fleetPower(fleet) {
    return fleet ? (fleet.settler || 0) + (fleet.explorer || 0) + (fleet.fleet || 0) * 3 : 0;
  }

  function fleetMove(fleet) {
    if (!fleet || !fleetCount(fleet)) return 0;
    return Math.min(...Object.entries(SHIP_STATS)
      .filter(([type]) => fleet[type] > 0).map(([,ship]) => ship.move));
  }

  function combatShipCount(fleet) {
    return fleet ? (fleet.settler || 0) + (fleet.fleet || 0) : 0;
  }

  function fleetControllersAt(coord) {
    return Object.entries(state.fleets[coord] || {})
      .filter(([,fleet]) => combatShipCount(fleet) > 0)
      .map(([playerId]) => Number(playerId));
  }

  // Rules #resources: an owned planet hex produces 1; in 32.37 a Harvester hex produces 2.
  function ownerProductionAmount(planet) {
    return planet.type==='moon' ? 0 : planet.upgrade==='harvester' ? HARVESTER_YIELD : 1;
  }

  function fleetGroup(fleet, group = 'all') {
    if (!fleet) return null;
    if (group === 'explorer') return { settler: 0, explorer: fleet.explorer || 0, fleet: 0 };
    if (group === 'ships') return { settler: fleet.settler || 0, explorer: 0, fleet: fleet.fleet || 0 };
    return clone(fleet);
  }

  // Rules #movement (33.38): a Move order moves any chosen units of one faction on one hex.
  // `units` counts each type; without it, `moveGroup` names the whole group (all combat
  // ships, or the Explorer team). Combat ships and Explorers never move in the same order.
  function moveSelection(fleet, options = {}) {
    if (!fleet) return null;
    const requested = options.units || fleetGroup(fleet, options.moveGroup || (combatShipCount(fleet) ? 'ships' : 'explorer'));
    const chosen = { settler: 0, explorer: 0, fleet: 0 };
    for (const type of Object.keys(SHIP_STATS)) {
      const amount = requested[type] ?? 0;
      if (!Number.isInteger(amount) || amount < 0 || amount > (fleet[type] || 0)) return null;
      chosen[type] = amount;
    }
    if (!fleetCount(chosen) || (chosen.explorer && combatShipCount(chosen))) return null;
    return chosen;
  }

  // A Move order is named by what it moves: Explorers travel apart from the rest, and the other
  // group is named for the Settlers and Fleets actually in it.
  function moveOrderLabel(units) {
    if (units?.explorer && !units.settler && !units.fleet) return 'Move Explorers';
    if (units?.settler && !units.fleet) return 'Move Settlers';
    if (units?.fleet && !units.settler) return 'Move Fleets';
    return 'Move Settlers & Fleets';
  }

  function formatFleet(fleet) {
    if (!fleet || !fleetCount(fleet)) return 'No ships';
    const parts = [];
    if (fleet.settler) parts.push(`${fleet.settler} Settler${fleet.settler === 1 ? '' : 's'}`);
    if (fleet.explorer) parts.push(`${fleet.explorer} Explorer${fleet.explorer === 1 ? '' : 's'}`);
    if (fleet.fleet) parts.push(`${fleet.fleet} Fleet${fleet.fleet === 1 ? '' : 's'}`);
    return parts.join(', ');
  }

  function resourceLimits(playerId) {
    return state.players[playerId].resourceLimits;
  }

  // This sum is report information, never a shared storage allowance.
  function playerCapacity(playerId) {
    return RESOURCES.reduce((sum,r)=>sum+resourceLimits(playerId)[r],0);
  }

  function resourceExcess(playerId, resources = state.players[playerId].resources) {
    return Object.fromEntries(RESOURCES.map(r=>[r,Math.max(0,resources[r]-resourceLimits(playerId)[r])]));
  }

  function totalResourceExcess(playerId) {
    return RESOURCES.reduce((sum,r)=>sum+resourceExcess(playerId)[r],0);
  }

  function storageAllocations(points = STORAGE_UPGRADE.capacity) {
    const options=[];
    for(let matter=0;matter<=points;matter++) for(let energy=0;energy<=points-matter;energy++) for(let biomass=0;biomass<=points-matter-energy;biomass++) options.push({matter,energy,biomass,data:points-matter-energy-biomass});
    return options;
  }

  function validStorageAllocation(allocation, points = STORAGE_UPGRADE.capacity) {
    return allocation && typeof allocation==='object' && !Array.isArray(allocation)
      && Object.keys(allocation).every(r=>RESOURCES.includes(r))
      && RESOURCES.every(r=>Number.isInteger(allocation[r])&&allocation[r]>=0&&allocation[r]<=points)
      && RESOURCES.reduce((sum,r)=>sum+allocation[r],0)===points;
  }

  function addStorageCapacity(playerId, allocation) {
    RESOURCES.forEach(r=>{state.players[playerId].resourceLimits[r]+=allocation[r]||0;});
  }

  function totalResources(player) {
    return RESOURCES.reduce((sum, resource) => sum + player.resources[resource], 0);
  }

  function canAfford(player, cost, discountData = 0, discountMatter = 0, discountEnergy = 0) {
    return RESOURCES.every(resource => {
      let required = cost[resource] || 0;
      if (resource === 'data') required = Math.max(0, required - discountData);
      if (resource === 'matter') required = Math.max(0, required - discountMatter);
      if (resource === 'energy') required = Math.max(0, required - discountEnergy);
      return player.resources[resource] >= required;
    });
  }

  function payCost(player, cost, discountData = 0, discountMatter = 0, discountEnergy = 0) {
    if (!canAfford(player, cost, discountData, discountMatter, discountEnergy)) return false;
    RESOURCES.forEach(resource => {
      let required = cost[resource] || 0;
      if (resource === 'data') required = Math.max(0, required - discountData);
      if (resource === 'matter') required = Math.max(0, required - discountMatter);
      if (resource === 'energy') required = Math.max(0, required - discountEnergy);
      player.resources[resource] -= required;
    });
    return true;
  }

  function resourceDot(resource, className = '') {
    return `<span class="resource-symbol ${resource} ${className}" aria-hidden="true">${RESOURCE_DETAILS[resource].icon}</span>`;
  }

  function resourceDots(cost) {
    const present = RESOURCES.filter(resource => cost?.[resource]);
    if (!present.length) return '<span class="resource-free">Free</span>';
    const label = present.map(resource => `${cost[resource]} ${RESOURCE_NAMES[resource]}`).join(', ');
    const chips = present.map(resource => `<span class="resource-chip ${resource}" title="${cost[resource]} ${RESOURCE_NAMES[resource]}">${resourceDot(resource)}<strong>${cost[resource]}</strong></span>`).join('');
    return `<span class="resource-dots" role="img" aria-label="${label}">${chips}</span>`;
  }

  // A card's effect in the vocabulary: the same sentence with its recurring ideas as glyphs.
  function iconText(text) {
    const count = word => COUNT_WORDS[String(word).toLowerCase()] || word;
    return resourceText(String(text)
      .replace(/This card enters discard and has no effect in hand; trash it later to remove it from your deck\./g, 'No effect in hand.')
      .replace(/When bought, gain (\d+) permanent Prestige\./g, (m, n) => `On purchase: +${n} @prestige@.`)
      .replace(/\bgain (\d+) (?:more )?permanent Prestige/gi, (m, n) => `+${n} @prestige@`)
      .replace(/\bgain (\d+) Prestige/gi, (m, n) => `+${n} @prestige@`)
      .replace(/\b(?:then )?draws? (one|two|three|four|five|\d+) cards?/gi, (m, w) => `+${count(w)} @draw@`)
      .replace(/\bdraw (one|two|three|\d+)\b(?! card)/gi, (m, w) => `+${count(w)} @draw@`)
      .replace(/\+(\d+) movement\b/gi, (m, n) => `+${n} @move@`)
      .replace(/\bBuild up to (two|three|\d+)(?: ships or structures)?/g, (m, w) => `@build@ up to ${count(w)}`)
      .replace(/\badd (\d+) hits/gi, (m, n) => `+${n} @hit@`)
      .replace(/\+(\d+) hits?(?: this volley)?/gi, (m, n) => `+${n} @hit@`)
      .replace(/\bprevent (\d+) hits?(?: this volley)?/gi, (m, n) => `${n} @miss@`)
      .replace(/\bMove (one|\d+) groups?/g, (m, w) => `@move@ ${count(w)} group`)
      .replace(/\braise each resource limit by (\d+)/gi, (m, n) => `+${n} @limit@ on each resource`)
      .replace(/\bRaise your (Matter|Energy|Life|Data) limit by (\d+)/g, (m, r, n) => `+${n} ${r} @limit@`)
      .replace(/\bamong your resource limits\b/g, 'among your @limit@')
      .replace(/\bBuild or commission\b/g, '@build@')
      .replace(/\bColonize\b/g, '@colonize@'))
      .replace(/@(prestige|draw|hit|miss|build|colonize|move|limit)@/g, (m, key) => VOCAB_ICONS[key]);
  }

  function resourceText(text) {
    return String(text).replace(/\b(Matter|Energy|Life|Data)\b/g, match => {
      const resource = RESOURCES.find(resource => RESOURCE_NAMES[resource] === match);
      return `<span class="inline-resource" role="img" aria-label="${match}" title="${match}">${resourceDot(resource)}</span>`;
    });
  }

  function addResources(player, gain, aiReserve = null) {
    const result = {added:{},lost:{},totalAdded:0,totalLost:0};
    for (const resource of RESOURCES) {
      const amount=Math.max(0,Number(gain?.[resource])||0);
      if (!amount) continue;
      const collected=player.resources[resource]+amount;
      const lost=Math.max(0,collected-resourceLimits(player.id)[resource]);
      player.resources[resource]=collected-lost;
      result.added[resource]=amount;result.totalAdded+=amount;
      if(lost){result.lost[resource]=lost;result.totalLost+=lost;}
    }
    if(result.totalLost) logEvent(`${player.name} automatically discarded ${RESOURCES.filter(r=>result.lost[r]).map(r=>`${result.lost[r]} ${RESOURCE_NAMES[r]}`).join(', ')} above the resource limits.`);
    return result;
  }

  // Current gains settle immediately. Retain these API hooks for shared viewers.
  function overflowPlayer() { return -1; }
  function discardOverflow() { return false; }

  function resourceGainTotal(gain) {
    return RESOURCES.reduce((sum,resource) => sum + Math.max(0,Number(gain?.[resource]) || 0),0);
  }

  function remainingResourceCapacity(playerId) {
    return RESOURCES.reduce((sum,r)=>sum+Math.max(0,resourceLimits(playerId)[r]-state.players[playerId].resources[r]),0);
  }

  function trimResourcesToCapacity(playerId, reserve = null) {
    const player = state.players[playerId];
    const amounts=aiOverflowAmounts(player.resources,resourceLimits(playerId),reserve || aiReserves(playerId));
    const removed=RESOURCES.reduce((n,r)=>n+amounts[r],0);
    RESOURCES.forEach(r=>player.resources[r]-=amounts[r]);
    return removed;
  }

  function overflowNote(result) {
    return result.totalLost ? ` ${result.totalLost} overflow resource${result.totalLost === 1 ? '' : 's'} were lost.` : '';
  }

  function movementRange(fleet, cardOrOptions = {}) {
    const tag = cardOrOptions.tag || ALL_CARDS[cardOrOptions.key]?.tag;
    return fleetMove(fleet) + (cardOrOptions.upgraded ? 1 : 0) + (tag === 'alienPhase' ? 3 : tag === 'alienAssault' ? 2 : CARD_BY_TAG[tag]?.range || 0);
  }

  // Move cards that cannot enter hostile hexes (Slipstream Charts).
  function avoidsHostile(tag) {
    return Boolean(CARD_BY_TAG[tag]?.pathfinder);
  }

  // One-line headlines for the hand's card tops; the full printed text stays on the raised card.
  const CARD_HEADLINES = {
    move: ['Move 1 group', 'Move 1 group · +1 range'],
    construct: ['Build or commission 1', 'Build up to 2'],
    colonize: ['Found a Colony', 'Found a Colony · +1 building'],
    probe: ['Locate or dig a relic', 'Locate or dig a relic'],
    excavate: ['Dig a relic · +2 Prestige', 'Dig a relic · +2 Prestige']
  };
  function cardHeadline(card) { const line = CARD_HEADLINES[card.key]?.[card.upgraded ? 1 : 0] || ''; return line && starterLevel(card) === 3 ? `${line} · draw 1` : line; }

  function upgradedOrderText(card) {
    if(card.key==='construct'&&card.starter&&starterLevel(card)===3)return 'Build up to two at full cost and draw one after the first, or draw one without building.';
    return {move:'+1 movement on this order.',construct:'Build up to two ships or structures at full cost; the second is optional.',colonize:'After colonizing, optionally pay for one adjacent building.'}[card.key] || '';
  }

  // resource: 'each' (every type in the cost -1) or 'free' (no cost), as printed on the
  // Construct card used. A single resource type is the archived Construct II discount.
  function discountedCost(cost, resource = null) {
    const result={...cost};
    if (resource==='free') return {};
    if (resource==='each') RESOURCES.forEach(r=>{ if (result[r]) result[r]=Math.max(0,result[r]-1); });
    if (RESOURCES.includes(resource) && result[resource]) result[resource]=Math.max(0,result[resource]-1);
    return result;
  }

  // The discount a Construct card allows: only its printed one (Prefab Yards, Orbital Foundry, World Engine).
  function buildDiscountOptions(card) {
    return [ALL_CARDS[card.key].buildDiscount || null];
  }

  function constructionCost(playerId, coord, kind, resource = null, fullCost = false) {
    const base=SHIP_STATS[kind]?.cost || STRUCTURES[kind]?.cost || {};
    return discountedCost(base,resource);
  }

  function constructAt(playerId, coord, kind, resource = null, dryRun = false, fullCost = false) {
    if (state.pendingCombat) return false;
    // 31.36: only a Construct card's printed discount ('each' or 'free') may reduce a cost.
    if (resource!==null && !['each','free'].includes(resource)) return false;
    if (STRUCTURES[kind]) return buildUpgrade(playerId,coord,kind,0,dryRun,resource,fullCost);
    if (SHIP_STATS[kind]) return buildShip(playerId,coord,kind,0,dryRun,resource);
    return false;
  }



  function canSecondConstruct(playerId, coord, kind) {
    return state.pendingConstruct?.playerId===playerId && state.activePlayer===playerId
      && state.phase==='operations' && state.winner===null && !state.pendingCombat
      && constructAt(playerId,coord,kind,null,true);
  }

  function finishConstruct(playerId, coord = null, kind = null) {
    if(state.pendingCombat || state.pendingConstruct?.playerId!==playerId || state.activePlayer!==playerId || state.phase!=='operations')return false;
    if(coord!==null && (!canSecondConstruct(playerId,coord,kind)||!constructAt(playerId,coord,kind)))return false;
    const message=coord===null?`${state.players[playerId].name} finished ${pendingBuildName()} after one build.`:`${state.players[playerId].name} completed ${pendingBuildName()} with ${STRUCTURES[kind]?.name||SHIP_STATS[kind].name} at ${nameForCoord(coord)}.`;
    state.pendingConstruct=null;
    if(state.pendingCombat){state.pendingBuildOrder={playerId,message};render();saveGame();return true;}
    completeAction(playerId,message);return true;
  }

  // Construct II and market Construct cards printed with a second build (Prefab Yards,
  // Orbital Foundry) open one optional full-price build after the first (rules #construct-two-builds).
  function offersSecondBuild(card) {
    return card.key==='construct' ? !!card.upgraded : !!ALL_CARDS[card.key]?.secondBuild;
  }
  function secondBuildName(card) {
    return card.key==='construct' ? `Construct ${card.level===3?'III':'II'}` : ALL_CARDS[card.key].name;
  }
  function pendingBuildName() {
    return state.pendingConstruct?.cardName || 'Construct II';
  }

  function performConstructOrder(playerId, coord, kind, card) {
    if(state.pendingCombat || state.pendingConstruct || state.pendingColonyBuild || state.pendingConsortium
      || state.phase!=='operations' || state.activePlayer!==playerId || state.winner!==null
      || !state.players[playerId].hand.some(c=>c.id===card?.id) || ALL_CARDS[card.key]?.order!=='construct')return false;
    const discount=ALL_CARDS[card.key].buildDiscount||null;
    if(!constructAt(playerId,coord,kind,discount))return false;
    applyBuildBonus(playerId,card);
    removeHandCard(state.players[playerId],card.id);
    drawStarterBonus(playerId,card);
    logEvent(`${state.players[playerId].name} built ${STRUCTURES[kind]?.name||SHIP_STATS[kind].name} at ${nameForCoord(coord)}.`);
    if(offersSecondBuild(card)) {
      const cardName=secondBuildName(card);
      clearAction();state.pendingConstruct={playerId,cardId:card.id,cardName};
      state.turnStage='construct-again';state.actionMode='construct';state.actionOptions={cardName};
      logEvent(`${state.players[playerId].name} may pay for one more build with ${cardName}, or finish after one.`);
      if(state.pendingCombat)state.pendingBuildOrder={playerId,second:true};
      render();saveGame();return true;
    }
    if(state.pendingCombat){state.pendingBuildOrder={playerId,second:false};render();saveGame();return true;}
    completeAction(playerId);return true;
  }

  // #construct-three-draw: this is an alternative to the whole build order.
  function canConstructDraw(playerId, cardId) {
    const player=state.players[playerId],card=player?.hand.find(c=>c.id===cardId);
    return !!card && card.key==='construct' && card.starter && starterLevel(card)===3
      && state.phase==='operations' && state.activePlayer===playerId && !player.passed && state.winner===null
      && !state.pendingCombat && !state.pendingCombatReport && !state.pendingMove && !state.pendingConstruct
      && !state.pendingColonyBuild && !state.pendingConsortium && overflowPlayer()<0;
  }

  function useConstructDraw(playerId, cardId) {
    if(!canConstructDraw(playerId,cardId))return false;
    const player=state.players[playerId],card=removeHandCard(player,cardId),before=player.hand.length;
    drawStarterBonus(playerId,card);
    const drawn=player.hand.length-before;
    completeAction(playerId,`${player.name} played Construct III without building and drew ${drawn} card${drawn===1?'':'s'}.`);
    return true;
  }

  // #seed-ark-choice: commit the card before drawing; this replaces colonizing.
  function canOrderDraw(playerId, cardId) {
    const player=state.players[playerId],card=player?.hand.find(c=>c.id===cardId);
    return !!card && card.key==='seedArk' && ALL_CARDS[card.key].fallbackDraw>0
      && state.phase==='operations' && state.activePlayer===playerId && !player.passed && state.winner===null
      && !state.pendingCombat && !state.pendingCombatReport && !state.pendingMove && !state.pendingConstruct
      && !state.pendingColonyBuild && !state.pendingConsortium && overflowPlayer()<0;
  }

  function useOrderDraw(playerId, cardId) {
    if(!canOrderDraw(playerId,cardId))return false;
    const player=state.players[playerId],card=removeHandCard(player,cardId),before=player.hand.length;
    drawCards(player,ALL_CARDS[card.key].fallbackDraw);
    const drawn=player.hand.length-before;
    completeAction(playerId,`${player.name} played ${ALL_CARDS[card.key].name} to draw ${drawn} card${drawn===1?'':'s'} instead of colonizing.`);
    return true;
  }

  function aiSecondConstruct(playerId) {
    const p=state.players[playerId],build=chooseAiBuild(playerId);
    if(build&&aiUseResources(p,null,constructionCost(playerId,build.coord,build.kind))&&finishConstruct(playerId,build.coord,build.kind))return;
    finishConstruct(playerId);
  }

  function canColonyBuild(playerId, coord, kind) {
    const pending=state.pendingColonyBuild;
    return !!pending && pending.playerId===playerId && state.activePlayer===playerId && state.phase==='operations'
      && state.winner===null && !!STRUCTURES[kind]
      && adjacentKeys(pending.colony).includes(coord) && canBuildStructureAt(playerId,coord)
      && constructAt(playerId,coord,kind,null,true,true);
  }

  function finishColonyBuild(playerId, coord = null, kind = null) {
    if (state.pendingColonyBuild?.playerId!==playerId || state.activePlayer!==playerId || state.phase!=='operations') return false;
    if (coord!==null) {
      if (!canColonyBuild(playerId,coord,kind) || !constructAt(playerId,coord,kind,null,false,true)) return false;
      logEvent(`${state.players[playerId].name} paid for an additional ${STRUCTURES[kind].name} after colonizing.`);
    }
    state.pendingColonyBuild=null;
    completeAction(playerId,coord===null?`${state.players[playerId].name} finished colonizing without an additional building.`:null);
    return true;
  }

  function aiColonyBuild(playerId) {
    const colony=state.pendingColonyBuild?.colony;
    if (!colony) return;
    const kinds=state.players[playerId].strategy==='military'?['starbase','harvester']:['harvester','starbase'];
    for (const kind of kinds) for (const coord of adjacentKeys(colony)) if (canColonyBuild(playerId,coord,kind)) { finishColonyBuild(playerId,coord,kind); return; }
    finishColonyBuild(playerId);
  }

  function applyColonizeOrder(playerId, coord, card) {
    if (state.pendingConstruct || !card || !state.players[playerId].hand.some(c=>c.id===card.id)) return false;
    if (!colonizePlanet(playerId,coord,{tag:ALL_CARDS[card.key].tag})) return false;
    removeHandCard(state.players[playerId],card.id,card.key==='colonize'?'trash':'inPlay');
    if (card.key==='colonize') logEvent(`${state.players[playerId].name} permanently trashed the used Colonize card.`);
    if (!card.upgraded) { completeAction(playerId,`${state.players[playerId].name} completed a colonization operation.`); return true; }
    clearAction();
    state.pendingColonyBuild={playerId,colony:coord};
    state.turnStage='bonus-build'; state.actionMode='colony-build';
    state.reachable=adjacentKeys(coord).filter(key=>canBuildStructureAt(playerId,key));
    logEvent(`${state.players[playerId].name} may build once beside its new Colony at full cost.`);
    render(); saveGame();
    if (!headless && playerId!==ME) aiColonyBuild(playerId);
    return true;
  }

  function canConvertCard(card) {
    return card?.starter===true && ['move','construct'].includes(card.key)
      && !card.upgraded && (card.level===undefined || card.level===1);
  }

  function cardResources(card) {
    return canConvertCard(card) ? { ...BASIC_CARDS[card.key].resource } : {};
  }

  function clusterForCoord(key) {
    const planet = state.planets[key];
    return planet ? state.clusters[planet.cluster] : null;
  }

  function isColonySite(coord) {
    const planet = state.planets[coord];
    return Boolean(planet && planet.type!=='moon' && state.clusters[planet.cluster]?.center === coord);
  }

  function clusterRevealed(cluster, playerId = 0) {
    return Boolean(cluster?.revealedBy?.includes(playerId));
  }

  function clusterKnown(cluster, playerId = 0) {
    return Boolean(cluster && (cluster.kind!=='moon' || clusterRevealed(cluster,playerId)));
  }

  function relicKnown(cluster, playerId = 0) {
    return clusterScanned(cluster,playerId);
  }

  function clusterScanned(cluster, playerId = 0) {
    return Boolean(cluster?.scannedBy?.includes(playerId));
  }

  function revealClusterAt(key, playerId) {
    const cluster = clusterForCoord(key);
    if (!cluster) return;
    if (!cluster.revealedBy.includes(playerId)) {
      cluster.revealedBy = [0,1,2,3];
      logEvent(`${state.players[playerId].name} surveyed ${cluster.kind==='moon'?'the moon':'the seven sectors of'} ${cluster.name}. Relic locations remain hidden until located.`);
    }
  }

  function adjacentKeys(key) {
    const [q,r] = parseCoord(key);
    return DIRECTIONS.map(([dq,dr]) => coordKey(q+dq,r+dr)).filter(k => boardHas(k));
  }

  function movementNeighbors(key) {
    return adjacentKeys(key);
  }

  function boardHas(key) {
    const [q,r] = parseCoord(key);
    return q >= -BOARD_RADIUS && q <= BOARD_RADIUS && r >= -BOARD_RADIUS && r <= BOARD_RADIUS && q + r >= -BOARD_RADIUS && q + r <= BOARD_RADIUS;
  }

  function hostileAt(coord, player) {
    const planet = state.planets[coord];
    if (planet?.upgrade==='starbase' && planet.owner!==null && planet.owner!==player) return true;
    const fleets = state.fleets[coord] || {};
    return Object.entries(fleets).some(([owner, fleet]) => Number(owner) !== player && fleetCount(fleet));
  }

  function portalExit(coord) { return state.portalLinks?.[coord] || null; }
  function movementEdges(coord, playerId = null) {
    const physical=playerId===null?movementNeighbors(coord):aiMovementNeighbors(coord,playerId);
    const edges=physical.map(coord=>({coord,cost:1,portal:false})),exit=portalExit(coord);
    if(exit)edges.push({coord:exit,cost:PORTAL_MOVEMENT_COST,portal:true});
    return edges;
  }

  // Positive integer costs: buckets settle the cheapest route before expanding it.
  // A cost-2 portal must never become a one-step shortcut or hide a cheaper route.
  function travelSearch(source, edges, range=Infinity, canEnter=()=>true, canLeave=()=>true) {
    const routes=new Map([[source,{cost:0,previous:null,portals:0}]]),buckets=[[source]];
    for(let cost=0;cost<buckets.length&&cost<=range;cost++) for(const current of buckets[cost]||[]) {
      const route=routes.get(current);
      if(route.cost!==cost||!canLeave(current))continue;
      for(const edge of edges(current)) {
        const nextCost=cost+edge.cost;
        if(nextCost>range||!canEnter(edge.coord)||routes.get(edge.coord)?.cost<=nextCost)continue;
        routes.set(edge.coord,{cost:nextCost,previous:current,portals:route.portals+(edge.portal?1:0)});
        (buckets[nextCost]??=[]).push(edge.coord);
      }
    }
    return routes;
  }
  function movementRoutes(source,player,range,cannotAttack=false) {
    return travelSearch(source,movementEdges,range,next=>!cannotAttack||!hostileAt(next,player),current=>current===source||!hostileAt(current,player));
  }
  function reachableFrom(source,player,range,cannotAttack=false,movingFleet=null) {
    return [...movementRoutes(source,player,range,cannotAttack).keys()];
  }
  // Public travel distance for planning only. Probe keeps ordinary hex distance.
  let travelMetricLinks=null,travelMetricCache=new Map();
  function travelDistance(a,b) {
    if(travelMetricLinks!==state.portalLinks){travelMetricLinks=state.portalLinks;travelMetricCache.clear();}
    const pair=[a,b].sort().join("|");if(travelMetricCache.has(pair))return travelMetricCache.get(pair);
    let best=hexDistance(a,b);
    for(const [entry,exit] of Object.entries(state.portalLinks||{}))best=Math.min(best,hexDistance(a,entry)+PORTAL_MOVEMENT_COST+hexDistance(exit,b));
    travelMetricCache.set(pair,best);return best;
  }

  // Every newly acquired card enters discard; draws and returns of owned cards
  // are separate operations and keep their normal printed timing.
  function gainCard(player, card) {
    player.discard.push(card);
  }

  function drawCards(player, amount) {
    for (let i = 0; i < amount; i += 1) {
      if (!player.deck.length && player.discard.length) {
        player.deck = shuffled(player.discard,`deck:${player.id}`);
        player.discard = [];
      }
      if (!player.deck.length) break;
      player.hand.push(player.deck.pop());
    }
  }

  function removeHandCard(player, cardId, destination = 'inPlay') {
    const index = player.hand.findIndex(c => c.id === cardId);
    if (index < 0) return null;
    const [card] = player.hand.splice(index, 1);
    if (destination === 'inPlay') player.inPlay.push(card);
    else if (destination === 'discard') player.discard.push(card);
    return card;
  }

  // Rules #market: the face-up market lists Expensive, Medium, then Cheap cards, three slots
  // each. Each tier refills only from its own deck; an empty deck leaves its slots empty.
  function fillMarket() {
    MARKET_TIERS.forEach(tier => {
      const deck = state.marketDecks[tier.id];
      while (deck.length && state.market.filter(card => marketTier(card.key) === tier.id).length < MARKET_TIER_SLOTS) {
        const order = MARKET_TIERS.indexOf(tier);
        const at = state.market.filter(card => MARKET_TIERS.findIndex(t => t.id === marketTier(card.key)) <= order).length;
        state.market.splice(at, 0, deck.pop());
      }
    });
  }

  function catalogMarketEnabled() { return options.headless === true && options.simulationCatalogMarket === true && !network && !replayMode; }
  function marketOffers() {
    if (!catalogMarketEnabled()) return state.market;
    const supply=[...state.market,...Object.values(state.marketDecks).flat()];
    return Object.keys(MARKET_CARDS).map(key=>supply.find(card=>card.key===key)).filter(Boolean);
  }
  function marketCopiesRemaining(key) { return [...state.market,...Object.values(state.marketDecks).flat()].filter(card=>card.key===key).length; }

  function controlledPlanets(playerId) {
    return Object.entries(state.planets).filter(([,p]) => p.owner === playerId);
  }

  function colonyPlanets(playerId) {
    return controlledPlanets(playerId).filter(([,planet]) => planet.hasColony);
  }

  function hasBuilding(planet) {
    return Boolean(planet && (planet.hasColony || planet.upgrade));
  }

  function clusterHasColony(playerId, clusterId) {
    return colonyPlanets(playerId).some(([,planet]) => planet.cluster === clusterId);
  }

  function canClaimStructureHex(playerId, coord) {
    const planet = state.planets[coord];
    if (!planet || planet.owner !== null || hasBuilding(planet) || !clusterHasColony(playerId,planet.cluster)) return false;
    return adjacentKeys(coord).some(neighbor => state.planets[neighbor]?.cluster === planet.cluster && state.planets[neighbor]?.owner === playerId);
  }

  function canBuildStructureAt(playerId, coord, kind = null) {
    const planet = state.planets[coord];
    if (!planet) return false;
    if (planet.type==='moon') return clusterKnown(state.clusters[planet.cluster],playerId) && !!fleetCount(getFleet(coord,playerId)) && planet.owner===null && !hasBuilding(planet) && !hostileAt(coord,playerId);
    // #building: a captured world permits paid Harvester replacement, not free transfer.
    if (planet.owner !== null && planet.owner !== playerId && planet.upgrade==='harvester'
      && !planet.hasColony && clusterHasColony(playerId,planet.cluster)) return kind===null || kind==='harvester';
    return (planet.owner === playerId && !hasBuilding(planet)) || canClaimStructureHex(playerId,coord);
  }



  function strongestFleet(playerId) {
    let best = 0;
    Object.values(state.fleets).forEach(group => { best = Math.max(best, fleetPower(group[playerId])); });
    return best;
  }

  function prestigeBreakdown(playerId, position = state) {
    const colonies = Object.values(position.planets).filter(planet=>planet.owner===playerId && planet.hasColony).length;
    const expansionBonus = 0;
    const relics = position.players[playerId].relicsExcavated || 0;
    const combat = position.players[playerId].combatVictories || 0;
    const cards = position.players[playerId].cardPrestige || 0;
    // Rules #victory: each decisive combat victory scores 2 Prestige (1 before this package).
    return {colonies:3*colonies,expansionBonus,relics:2*relics,combat:COMBAT_VICTORY_PRESTIGE*combat,cards,total:3*colonies+2*relics+COMBAT_VICTORY_PRESTIGE*combat+cards};
  }

  function victoryTarget(position = state) {
    return position?.victoryTarget || 40; // Legacy saves without a target retain their original goal.
  }

  // A purchase's price after this Buy turn's discounts: Trade Syndicate's, plus one
  // pending Procurement Hub discount (rules #buy). Each discount is 1 of each resource.
  function purchaseDiscount(player) {
    return (player.buyDiscountEach > 0 ? 1 : 0) + ((player.buyHubDiscounts || 0) > 0 ? 1 : 0);
  }
  function purchaseCost(player, key) {
    const cost = { ...(ALL_CARDS[key]?.cost || {}) }, discount = purchaseDiscount(player);
    if (discount > 0) RESOURCES.forEach(r => { if (cost[r]) cost[r] = Math.max(0, cost[r] - discount); });
    return cost;
  }

  function calculatePrestige(playerId) {
    return prestigeBreakdown(playerId).total;
  }

  function excavatedRelicCount(playerId) {
    return state.players[playerId].relicsExcavated || 0;
  }

  function homeCoord(playerId) {
    const start = HOME_STARTS.find(({ owner }) => owner === playerId);
    return start ? state.clusters[start.cluster].coords[start.colonySector] : null;
  }

  function canLaunchExplorer(playerId, coord) {
    const planet = state.planets[coord];
    if (!planet || planet.owner !== playerId) return false;
    return planet.upgrade === 'starbase';
  }





  function produceAll() {
    const gains = state.players.map(()=>({ matter: 0, energy: 0, biomass: 0, data: 0 }));
    state.players.forEach((player, playerId) => {
      controlledPlanets(playerId).forEach(([,planet]) => {
        if (!RESOURCES.includes(planet.type)) return;
        gains[playerId][planet.type] += ownerProductionAmount(planet);
      });
    });
    Object.entries(state.planets).forEach(([coord,planet]) => {
      fleetControllersAt(coord).forEach(playerId => {
        if (RESOURCES.includes(planet.type)) gains[playerId][planet.type] += 1;
      });
    });
    const overflow = state.players.map((player,playerId)=>addResources(player,gains[playerId])).reduce((sum,result)=>sum+result.totalLost,0);
    logEvent(`Controlled planets produced normally; every combat fleet on a planet hex also secured 1 local resource.${overflow ? ` ${overflow} overflow resource${overflow === 1 ? '' : 's'} were lost.` : ''}`);
  }

  function resetRoundFlags() {
    state.players.forEach(player => {
      player.passed = false;
      player.tradeUsed = false;
      player.bought = 0;
      player.buyDiscountEach = 0;
      player.buyHubDiscounts = 0;
      player.buyStartDiscardIds = [];
      player.buyStartInPlayIds = [];
      player.buyStartHandIds = [];
      player.combatBonus = 0;
    });
  }

  function beginRound() {
    clearTimeout(aiTimer);
    resetRoundFlags();
    state.phase = 'production';
    state.activePlayer = state.firstPlayer;
    state.turnStage = 'waiting';
    produceAll();
    state.phase = 'operations';
    state.activePlayer = state.firstPlayer;
    startOperationsTurn();
  }

  function startOperationsTurn() {
    turnSerial += 1;
    clearAction();
    if (state.players.every(player => player.passed)) {
      logEvent('All factions have passed. Operations are complete.');
      cleanupRound();
      return;
    }
    let guard = 0;
    while (state.players[state.activePlayer].passed && guard < 4) {
      state.activePlayer = (state.activePlayer + 1) % 4;
      guard += 1;
    }
    state.turnStage = state.activePlayer === ME ? 'prep' : 'ai';
    appendHistory(`${state.players[state.activePlayer].name} began an Operations turn.`,{kind:'turn',actor:state.activePlayer});
    if (state.activePlayer === ME) {
      captureHumanTurn(`Operations turn in Round ${state.round}`);
      if (!headless) switchTab('hand');
    }
    render();
    saveGame();
    if (state.activePlayer === ME && autoPassIfHandEmpty()) return;
    if (state.activePlayer !== ME) scheduleAiTurn('operations', runAiOperation, 650);
  }

  // Interface automation only: with no cards in hand and no trade offer awaiting an
  // answer, Pass is the only way forward except posting a trade, so the browser passes
  // for the player. Undo restores the Operations turn, so no legal choice is lost.
  function autoPassIfHandEmpty() {
    if (headless || replayMode || options.paused?.() || state.phase !== 'operations' || state.activePlayer !== ME || !['prep','action'].includes(state.turnStage)) return false;
    const player = state.players[ME];
    if (player.passed || player.hand.length || state.pendingCombat || state.pendingCombatReport || state.pendingConstruct || state.pendingColonyBuild || state.pendingConsortium || overflowPlayer() >= 0 || state.winner !== null) return false;
    if (state.tradeOffers.some(offer => tradeResponseAllowed(ME, offer))) return false;
    autoTurn = true;
    try {
      autoNotice = 'No cards left: moved to Buy.';
      logEvent('You had no cards left, so the table passed you to Buy.');
      return passOperations(ME);
    } finally { autoTurn = false; }
  }

  // True when the player's Buy turn offers any choice besides finishing: a card to buy,
  // a starter to upgrade, a Buy effect, a card to trash, capacity, or a bank exchange.
  // Mirrors the Buy section of the adapter's legal actions.
  function humanBuyHasChoice() {
    const player = state.players[ME];
    if (marketOffers().some(card => canAfford(player, purchaseCost(player, card.key)))) return true;
    if ([...player.hand,...player.discard,...player.inPlay].some(card=>card.starter&&starterLevel(card)<3&&RESOURCES.some(r=>player.resources[r]>=upgradePrice(card)))) return true;
    if(player.hand.some(canConvertCard)&&canConvertCards())return true;
    if (player.hand.some(card => ALL_CARDS[card.key].buyEffect || canPlayExchange(ME,card.id))) return true;
    if (RESOURCES.some(resource => player.resources[resource] >= 3) && trashEligibleCards(player).length) return true;
    if (canBuyCapacity(ME)) return true;
    return RESOURCES.some(give => RESOURCES.some(get => canBankTrade(ME, give, get)));
  }

  function autoSkipBuy() {
    if (headless || replayMode || options.paused?.() || state.phase !== 'buy' || state.activePlayer !== ME || overflowPlayer() >= 0 || state.pendingCombat || state.winner !== null || humanBuyHasChoice()) return false;
    const wasAuto = autoTurn;
    autoTurn = true;
    try {
      autoNotice = `${autoNotice ? autoNotice + ' ' : ''}Nothing affordable: Buy finished automatically.`;
      // Keep Undo pointed at the Operations turn that led here.
      turnHistory.pending = null; saveTurnHistory();
      logEvent('You had nothing to buy, upgrade, trash or exchange, so Buy finished automatically.');
      toast(autoNotice);
      nextBuyPlayer();
      return true;
    } finally { autoTurn = wasAuto; }
  }

  function scheduleAiTurn(phase, action, delay) {
    if (headless || state.pendingCombat || state.pendingCombatReport) return;
    clearTimeout(aiTimer);
    if (overflowPlayer() >= 0) return;
    const expectedPlayer = state.activePlayer;
    if (TUTORIAL) delay = Math.min(delay, 200);
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (state.pendingCombat || state.pendingCombatReport || overflowPlayer() >= 0 || options.paused?.() || state.phase !== phase || state.activePlayer !== expectedPlayer || state.winner !== null) return;
      try {
        action();
      } catch (error) {
        console.error(`AI ${phase} turn failed for player ${expectedPlayer}.`, error);
        if (phase === 'operations') {
          logEvent(`${state.players[expectedPlayer].name} could not complete an action and passed.`);
          passOperations(expectedPlayer);
        } else {
          logEvent(`${state.players[expectedPlayer].name} could not complete its Buy turn.`);
          nextBuyPlayer();
        }
      }
    }, delay);
  }

  function nextOperationsPlayer() {
    const chain=state.chainedActions;
    if(chain?.playerId===state.activePlayer&&chain.remaining>1){chain.remaining--;startOperationsTurn();return;}
    state.chainedActions=null;
    state.activePlayer = (state.activePlayer + 1) % 4;
    startOperationsTurn();
  }

  function passOperations(playerId) {
    if (state.pendingCombat || state.pendingRelic || state.phase !== 'operations' || state.activePlayer !== playerId || state.pendingConstruct || state.pendingColonyBuild || state.pendingConsortium) return false;
    const player = state.players[playerId];
    if (!player || player.passed) return false;
    if (playerId === ME) completeHumanTurn();
    if(state.chainedActions?.playerId===playerId)state.chainedActions=null;
    player.passed = true;
    logEvent(`${player.name} passed for the rest of Operations.`);
    if (playerId === ME) toast(autoTurn ? autoNotice : 'You passed. Take your Buy turn now.');
    if (state.players.every(p => p.passed)) expireTrades();
    startBuyPhase();
    return true;
  }

  function clearAction() {
    state.actionMode = null;
    state.actionCardId = null;
    state.actionOptions = {};
    state.moveSource = null;
    state.reachable = [];
  }

  function completeAction(playerId, message) {
    if (state.pendingCombat || state.pendingMove) return;
    state.pendingColonyBuild = null;
    state.pendingConstruct = null;
    if (message) logEvent(message);
    if (playerId === ME) completeHumanTurn();
    clearAction();
    if (playerId === ME) state.turnStage = 'waiting';
    saveGame();
    nextOperationsPlayer();
  }

  function conversionGain(card) {
    return cardResources(card);
  }

  function canConvertCards() {
    return canManageResources(ME);
  }

  function convertAllResources() {
    if (!canConvertCards()) return;
    const player = state.players[ME];
    let converted = 0;
    for (const card of [...player.hand]) {
      if (playResourceMode(card.id, false)) converted++;
      if (overflowPlayer() >= 0) break;
    }
    if(state.activePlayer===ME&&!state.players[ME].hand.length&&!state.pendingConstruct&&!state.pendingColonyBuild&&!state.pendingConsortium&&!state.pendingCombat){clearAction();state.turnStage='prep';autoPassIfHandEmpty();}
    toast(`Converted ${converted} card${converted === 1 ? '' : 's'}.`);
    render();
    saveGame();
  }

  function convertCard(playerId,cardId) {
    if (!canManageResources(playerId)) return false;
    const player=state.players[playerId],card=player.hand.find(c=>c.id===cardId);
    if (!canConvertCard(card)) return false;
    const gain=conversionGain(card);
    removeHandCard(player,cardId);
    addResources(player,gain);
    logEvent(`${player.name} converted ${ALL_CARDS[card.key].name} into resources.`);
    return true;
  }
  function drawStarterBonus(playerId,card) {
    // Called only after committing an order, before any draw can reshuffle it.
    const amount=card?.starter&&card.level===3?1:ALL_CARDS[card?.key]?.orderDraw||0;
    if(amount)drawCards(state.players[playerId],amount);
  }
  function starterLevel(card) { return card.level===3?3:card.upgraded?2:1; }
  function upgradePrice(card) { return starterLevel(card)===1?2:3; }
  function playResourceMode(cardId, refresh = true) {
    const player = state.players[ME];
    if (!canConvertCards()) return false;
    const card = player.hand.find(item => item.id === cardId);
    if (!canConvertCard(card)) return false;
    const definition = ALL_CARDS[card.key];
    const gain = conversionGain(card);
    const canceledSelectedOrder = state.actionCardId === cardId;
    if (canceledSelectedOrder) clearAction();
    if (!convertCard(ME,cardId)) return false;
    if(canceledSelectedOrder)logEvent('The selected order was canceled by conversion.');
    if (refresh) {
      if(state.activePlayer===ME&&!state.players[ME].hand.length&&!state.pendingConstruct&&!state.pendingColonyBuild&&!state.pendingConsortium&&!state.pendingCombat){clearAction();state.turnStage='prep';autoPassIfHandEmpty();}
      if (canceledSelectedOrder) toast('Order canceled and card converted to resources.');
      render();
      saveGame();
    }
    return true;
  }

  function playOrder(cardId, mode = null) {
    const player = state.players[ME];
    if (state.phase === 'buy' && canPlayExchange(ME,cardId)) {
      const exchange=player.hand.find(card=>card.id===cardId);
      resolveHumanSpecial(exchange,ALL_CARDS[exchange.key],ME);return;
    }
    if (state.pendingCombat || state.pendingRelic || state.phase !== 'operations' || state.activePlayer !== ME || !['prep','action'].includes(state.turnStage)) return;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    if (state.actionCardId === cardId && state.actionMode && (!mode || state.actionMode===mode)) {
      clearAction();
      toast('Order canceled. Choose another order, trade, or pass.');
      render();
      saveGame();
      return;
    }
    const baseDefinition = ALL_CARDS[card.key];
    const definition = card.key==='probe' && mode==='excavate' ? {...baseDefinition,order:'excavate'} : baseDefinition;
    if (definition.reaction || definition.buyEffect) { toast('That card waits for its printed timing.'); return; }
    state.turnStage = 'action';

    if (definition.order === 'special') {
      resolveHumanSpecial(card, definition);
      return;
    }
    state.actionMode = definition.order;
    state.actionCardId = cardId;
    state.actionOptions = { tag: definition.tag || null, cardName: definition.name, upgraded: !!card.upgraded, discountResource: definition.order==='construct' ? definition.buildDiscount || null : null };
    state.moveSource = null;
    state.reachable = [];
    if (definition.order==='probe') {
      const origins=Object.keys(state.fleets).filter(coord=>getFleet(coord,ME)?.explorer);
      const status=network ? state.probeStatus : probeStatus(ME);
      if (origins.length && ['all_discovered','none_remaining'].includes(status)) {clearAction();toast(probeUnavailableMessage());render();return;}
      const origin=origins.includes(state.selected)?state.selected:origins.length===1?origins[0]:null;
      if (origin) {
        if (!probeRelic(ME,origin,cardId)) {clearAction();toast(probeUnavailableMessage());render();}
        return;
      }
    }
    if (definition.order==='excavate') openExcavationRewards();
    toast(definition.order === 'move' ? 'Select a hex with your units. Untick any you want to leave behind.' : definition.order === 'construct' ? 'Select an empty planet hex adjacent to your Colony, an existing structure, or a Shipyard.' : definition.order === 'probe' ? 'Select one of your Explorers anywhere on the map to locate its closest undiscovered relic.' : definition.order === 'excavate' ? 'Select your Explorer’s located relic site, then choose a reward in the Relics tab.' : 'Select an eligible planet containing your Settler.');
    render();
    saveGame();
  }

  function hexDistance(a,b) {
    const [aq,ar]=parseCoord(a); const [bq,br]=parseCoord(b);
    return (Math.abs(aq-bq)+Math.abs(ar-br)+Math.abs((aq+ar)-(bq+br)))/2;
  }

  function relicCoordInCluster(cluster) {
    return cluster?.coords.find(coord => state.planets[coord]?.special === 'relic') || null;
  }

  function nearestUnscannedRelicCluster(playerId, revealWorld = false) {
    const origins=[...new Set([
      ...controlledPlanets(playerId).map(([coord])=>coord),
      ...Object.entries(state.fleets).filter(([,group])=>fleetCount(group[playerId])).map(([coord])=>coord)
    ])];
    return state.clusters.filter(cluster=>(!revealWorld||cluster.kind!=='moon')&&relicCoordInCluster(cluster)&&!relicKnown(cluster,playerId)).sort((a,b)=>{
      const da=Math.min(...origins.map(origin=>hexDistance(origin,revealWorld?a.center:relicCoordInCluster(a)||a.center)));
      const db=Math.min(...origins.map(origin=>hexDistance(origin,revealWorld?b.center:relicCoordInCluster(b)||b.center)));
      return da-db||a.id-b.id;
    })[0]||null;
  }

  // Canonical relic commands: UI, shared authority and browser rivals use these same choices.
  const RELIC_SHIP_CAPS = {settler:8, explorer:5, fleet:10};
  function relicGroups(fleet) {
    const groups=[];
    for(let settler=fleet?.settler||0;settler>=0;settler--)for(let ships=fleet?.fleet||0;ships>=0;ships--)
      if(settler+ships)groups.push({settler,explorer:0,fleet:ships});
    for(let explorer=fleet?.explorer||0;explorer>0;explorer--)groups.push({settler:0,explorer,fleet:0});
    return groups;
  }
  function sameRelicCommand(a,b) {
    const stable=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(stable):Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]))):x;
    return JSON.stringify(stable(a))===JSON.stringify(stable(b));
  }
  function relicOperations(seat, cardId=null) {
    const p=state.players[seat];
    if(!p||p.passed||state.winner!==null||state.phase!=='operations'||state.activePlayer!==seat||state.pendingCombat||state.pendingRelic||state.pendingConstruct||state.pendingColonyBuild||state.pendingConsortium||overflowPlayer()>=0)return [];
    const actions=[], coords=Object.keys(state.planets);
    for(const card of p.hand) {
      if(cardId&&card.id!==cardId)continue;
      const def=ALL_CARDS[card.key],ability=def?.relicAbility;
      if(!ability||def.battleRelic)continue;
      const add=choice=>actions.push({type:'relic',card:card.id,ability,...choice});
      if(ability==='echoes') {
        const ids=p.inPlay.filter(c=>c.id!==card.id).map(c=>c.id).sort();
        add({cards:[]});
        ids.forEach((id,i)=>{add({cards:[id]});ids.slice(i+1).forEach(other=>add({cards:[id,other]}));});
      } else if(ability==='hourglass') {
        if(p.hourglassRound!==state.round)add({});
      } else if(ability==='reservoir') {
        if(RESOURCES.some(r=>resourceLimits(seat)[r]>Math.max(STARTING_LIMIT,p.resources[r])))add({});
      } else if(ability==='keepers'||ability==='oracle') {
        const offers=ability==='keepers'?state.market:Object.values(state.marketDecks).flat();
        // Sort before deduplication: neither command order nor ids expose deck order.
        const distinct=[...offers].filter(c=>MARKET_CARDS[c.key]).sort((a,b)=>a.key.localeCompare(b.key)||a.id.localeCompare(b.id)).filter((c,i,a)=>!i||a[i-1].key!==c.key);
        for(const offer of distinct) {
          const cost=purchaseCost(p,offer.key);
          const discounts=ability==='keepers'?storageAllocations(Math.min(2,RESOURCES.reduce((n,r)=>n+(cost[r]||0),0))):[Object.fromEntries(RESOURCES.map(r=>[r,0]))];
          for(const discount of discounts)if(RESOURCES.every(r=>discount[r]<=(cost[r]||0))&&canAfford(p,Object.fromEntries(RESOURCES.map(r=>[r,(cost[r]||0)-discount[r]]))))add({purchase:offer.id,key:offer.key,discount});
        }
      } else if(ability==='worldseed') {
        if(canAfford(p,{biomass:COLONY_LIFE_COST}))for(const coord of coords) {
          const planet=state.planets[coord];
          if(isColonySite(coord)&&planet.owner===null&&!hasBuilding(planet)&&!Object.values(state.fleets[coord]||{}).some(fleetCount))add({destination:coord});
        }
      } else if(ability==='compass'||ability==='horizon') {
        const destinations=ability==='compass'?remainingRelicSites().filter(site=>relicKnown(site.cluster,seat)).map(site=>site.coord)
          :coords.filter(at=>!hostileAt(at,seat)&&(fleetCount(getFleet(at,seat))||state.planets[at].owner===seat&&(state.planets[at].hasColony||state.planets[at].upgrade==='starbase')));
        for(const [source,group] of Object.entries(state.fleets))for(const units of relicGroups(group[seat])) {
          if(ability==='compass'&&!units.explorer)continue;
          for(const destination of destinations)if(source!==destination&&(ability==='compass'||hexDistance(source,destination)<=6))add({source,destination,units});
        }
      } else if(ability==='gravity') {
        const destinations=coords.filter(at=>!hasBuilding(state.planets[at])&&!Object.values(state.fleets[at]||{}).some(fleetCount));
        for(const [source,group] of Object.entries(state.fleets))for(const [owner,fleet] of Object.entries(group)) {
          if(+owner===seat||!fleetCount(fleet))continue;
          for(const destination of destinations)if(source!==destination&&hexDistance(source,destination)<=3)add({owner:+owner,source,destination});
        }
      }
    }
    return actions;
  }
  function relicDraftActions(seat) {
    const draft=state.pendingRelic,p=state.players[seat];
    if(!draft||draft.playerId!==seat)return [];
    const actions=[{type:'relic_cancel'}];
    if(!p.hand.some(c=>c.id===draft.card)||!draft.limits||Object.keys(draft.limits).length!==RESOURCES.length
      ||!RESOURCES.every(r=>Number.isSafeInteger(draft.limits[r])&&draft.limits[r]>=Math.max(STARTING_LIMIT,p.resources[r]))
      ||RESOURCES.reduce((sum,r)=>sum+draft.limits[r],0)!==playerCapacity(seat))return actions;
    actions.unshift({type:'relic_confirm'});
    for(const giveType of RESOURCES)for(const getType of RESOURCES)if(giveType!==getType) {
      const max=draft.limits[giveType]-Math.max(STARTING_LIMIT,p.resources[giveType]);
      for(let amount=1;amount<=max;amount++)actions.push({type:'relic_shift',giveType,getType,amount});
    }
    return actions;
  }
  function acquireRelicPurchase(seat,action) {
    const p=state.players[seat],pool=action.ability==='keepers'?state.market:state.marketDecks[marketTier(action.key)];
    const index=pool.findIndex(c=>c.id===action.purchase),[card]=pool.splice(index,1),def=ALL_CARDS[card.key];
    const cost=purchaseCost(p,card.key);
    payCost(p,Object.fromEntries(RESOURCES.map(r=>[r,(cost[r]||0)-action.discount[r]])));
    if(action.ability==='keepers')fillMarket();
    if(def.military)p.military.push(card);else if(action.ability==='oracle')p.hand.push(card);else gainCard(p,card);
    p.cardsPurchased=(p.cardsPurchased||0)+1;p.bought++;
    p.buyDiscountEach=0;if(p.buyHubDiscounts>0)p.buyHubDiscounts--;
    if(def.gainPrestige)p.cardPrestige=(p.cardPrestige||0)+def.gainPrestige;
    logEvent(`${p.name} acquired ${def.name} with ${ALL_CARDS[p.inPlay[p.inPlay.length-1]?.key]?.name||'a relic'}.`);
  }
  function applyRelicAction(seat,action) {
    const draft=state.pendingRelic;
    const choices=draft?relicDraftActions(seat):relicOperations(seat);
    if(!choices.some(a=>sameRelicCommand(a,action)))return false;
    const p=state.players[seat];
    if(draft) {
      if(action.type==='relic_shift') {draft.limits[action.giveType]-=action.amount;draft.limits[action.getType]+=action.amount;render();saveGame();return true;}
      state.pendingRelic=null;
      if(action.type==='relic_cancel'){render();saveGame();return true;}
      p.resourceLimits=clone(draft.limits);removeHandCard(p,draft.card);
      completeAction(seat,`${p.name} redistributed its capacity with Prismatic Reservoir.`);render();return true;
    }
    const card=p.hand.find(c=>c.id===action.card),def=ALL_CARDS[card.key];
    if(action.ability==='reservoir'){state.pendingRelic={playerId:seat,card:card.id,limits:clone(resourceLimits(seat))};clearAction();render();saveGame();return true;}
    removeHandCard(p,card.id);
    if(action.ability==='echoes')for(const id of action.cards){const at=p.inPlay.findIndex(c=>c.id===id);p.hand.push(...p.inPlay.splice(at,1));}
    else if(action.ability==='hourglass'){p.hourglassRound=state.round;state.chainedActions={playerId:seat,remaining:3};}
    else if(action.ability==='keepers'||action.ability==='oracle')acquireRelicPurchase(seat,action);
    else if(action.ability==='worldseed') {
      payCost(p,{biomass:COLONY_LIFE_COST});
      Object.assign(state.planets[action.destination],{owner:seat,originalFounder:seat,hasColony:true,conquest:false});
      revealClusterAt(action.destination,seat);
    } else if(action.ability==='gravity') {
      const units=clone(getFleet(action.source,action.owner));
      const target=ensureFleet(action.destination,action.owner);for(const type of Object.keys(SHIP_STATS))target[type]+=units[type]||0;
      delete state.fleets[action.source][action.owner];if(!Object.keys(state.fleets[action.source]).length)delete state.fleets[action.source];revealClusterAt(action.destination,action.owner);
    } else if(action.ability==='compass'||action.ability==='horizon') {
      state.pendingMove={playerId:seat,source:action.source,destination:action.destination,cardId:card.id,message:`${p.name} used ${def.name} to bring ${formatFleet(action.units)} to ${nameForCoord(action.destination)}.`};
      executeMove(seat,action.source,action.destination,{units:action.units,moveGroup:action.units.explorer?'explorer':'ships',tag:def.tag});
      finishMoveOrder();render();saveGame();return true;
    }
    completeAction(seat,`${p.name} used ${def.name}.`);render();saveGame();return true;
  }
  function battleRelicActions(seat) {
    const b=state.pendingCombat,side=combatSide(seat),p=state.players[seat];
    if(!b||!side||!p)return [];
    const other=side==='attacker'?'defender':'attacker',actions=[];
    for(const card of p.hand) {
      const ability=ALL_CARDS[card.key]?.relicAbility;
      const add=choice=>actions.push({type:'combat_relic',card:card.id,ability,...choice});
      if(b.stage==='opening'&&!b.relicDone?.[side]) {
        if(ability==='crown'&&canPlaceShip(seat,'fleet')&&aliveCombatPieces(b[`${other}Pieces`]).some(piece=>piece.type==='fleet'))add({});
        if(ability==='eclipse')for(const tactic of Object.keys(b.hands[other]).sort())if(b.hands[other][tactic]>0)add({tactic});
        if(ability==='horizon'&&side==='defender')for(const [source,group] of Object.entries(state.fleets))if(source!==b.coord&&hexDistance(source,b.coord)<=6)
          for(const units of relicGroups(group[seat]))add({source,units});
      } else if(b.stage==='tactic'&&b.commitments[side]===null) {
        if(ability==='warsong')for(const tactic of [...new Set(b.used[side])].sort())add({tactic});
        if(ability==='silent'&&!b.silent?.[side])add({});
      } else if(b.stage==='aftermath'&&!b.aftermathDone?.[side]&&ability==='phoenix') {
        const lost=Object.fromEntries(Object.keys(SHIP_STATS).map(type=>[type,b[`${side}Pieces`].filter(piece=>piece.type===type&&piece.damage>=piece.hull).length]));
        const available=type=>Math.min(3,lost[type],RELIC_SHIP_CAPS[type]-countPlacedShips(seat,type));
        for(const [destination,planet] of Object.entries(state.planets))if(planet.owner===seat&&planet.upgrade==='starbase'&&!hostileAt(destination,seat))
          for(let fleet=0;fleet<=available('fleet');fleet++)for(let explorer=0;explorer<=available('explorer');explorer++)for(let settler=0;settler<=available('settler');settler++)
            if(fleet+explorer+settler>0&&fleet+explorer+settler<=3)add({destination,units:{settler,explorer,fleet}});
      }
    }
    return actions;
  }
  function advanceBattleRelics() {
    const b=state.pendingCombat;if(!b)return;
    const field=b.stage==='opening'?'relicDone':b.stage==='aftermath'?'aftermathDone':null;
    if(!field)return;
    b[field] ||= {attacker:false,defender:false};
    for(const side of ['attacker','defender'])if(!battleRelicActions(b[`${side}Id`]).length)b[field][side]=true;
    if(b[field].attacker&&b[field].defender) {
      if(b.stage==='opening'){if(!aliveCombatPieces(b.attackerPieces).length||!aliveCombatPieces(b.defenderPieces).length)finishCombat();else b.stage='escape';}else finalizeCombat();
    }
  }
  function useBattleRelic(seat,action) {
    const b=state.pendingCombat,side=combatSide(seat),other=side==='attacker'?'defender':'attacker';
    if(!battleRelicActions(seat).some(a=>sameRelicCommand(a,action)))return false;
    const p=state.players[seat],card=removeHandCard(p,action.card),def=ALL_CARDS[card.key];
    if(action.ability==='crown') {
      const at=b[`${other}Pieces`].findIndex(piece=>piece.type==='fleet'&&piece.damage<piece.hull);
      b[`${side}Pieces`].push(b[`${other}Pieces`].splice(at,1)[0]);
      syncCombatPieces(b[`${other}Id`],b.coord,b[`${other}Pieces`]);syncCombatPieces(seat,b.coord,b[`${side}Pieces`]);
    } else if(action.ability==='eclipse') {b.hands[other][action.tactic]--;b.hands[side][action.tactic]=(b.hands[side][action.tactic]||0)+1;}
    else if(action.ability==='warsong') {b.used[side].splice(b.used[side].indexOf(action.tactic),1);b.hands[side][action.tactic]=(b.hands[side][action.tactic]||0)+1;}
    else if(action.ability==='silent'){b.silent ||= {};b.silent[side]=true;}
    else if(action.ability==='horizon') {
      const origin=getFleet(action.source,seat);
      for(const type of Object.keys(SHIP_STATS)){origin[type]-=action.units[type];for(let i=0;i<action.units[type];i++)b[`${side}Pieces`].push({type,hull:SHIP_STATS[type].defendingHull||SHIP_STATS[type].hull,power:SHIP_STATS[type].power,damage:0});}
      if(!fleetCount(origin)){delete state.fleets[action.source][seat];if(!Object.keys(state.fleets[action.source]).length)delete state.fleets[action.source];}
      syncCombatPieces(seat,b.coord,b[`${side}Pieces`]);
    } else if(action.ability==='phoenix') {
      const fleet=ensureFleet(action.destination,seat);for(const type of Object.keys(SHIP_STATS))fleet[type]+=action.units[type];
      b.aftermathDone[side]=true;
    }
    b.summary.push(`${p.name} played ${def.name}${action.tactic?` (${MILITARY_CARDS[action.tactic].name})`:''}.`);
    appendHistory(b.summary[b.summary.length-1],{kind:'combat-relic',actor:seat,action:clone(action),coordinate:b.coord});
    advanceBattleRelics();
    return true;
  }
  function relicActionLabel(action) {
    const p=state.players[ME],def=action.card&&ALL_CARDS[p?.hand.find(c=>c.id===action.card)?.key];
    const at=coord=>`${nameForCoord(coord)} (${coord})`;
    if(action.type==='relic_shift')return `Move ${action.amount} capacity: ${RESOURCE_NAMES[action.giveType]} → ${RESOURCE_NAMES[action.getType]}`;
    if(action.type==='relic_confirm')return 'Confirm capacity redistribution';
    if(action.type==='relic_cancel')return 'Cancel redistribution';
    const title=def?.name||'Relic';
    if(action.cards)return `${title}: ${action.cards.length?action.cards.map(id=>{const c=p.inPlay.find(c=>c.id===id);return `${ALL_CARDS[c.key].name}${c.starter&&starterLevel(c)>1?starterLevel(c)===3?' III':' II':''}`;}).join(' + '):'return no cards'}`;
    if(action.purchase){const cost=purchaseCost(p,action.key);return `${title}: ${ALL_CARDS[action.key].name} · pay ${RESOURCES.filter(r=>(cost[r]||0)>action.discount[r]).map(r=>`${cost[r]-action.discount[r]} ${RESOURCE_NAMES[r]}`).join(' + ')||'nothing'}${action.ability==='keepers'?` · reduce ${RESOURCES.filter(r=>action.discount[r]).map(r=>`${action.discount[r]} ${RESOURCE_NAMES[r]}`).join(' + ')}`:''}`;}
    if(action.tactic)return `${title}: ${MILITARY_CARDS[action.tactic].name}`;
    if(action.source)return `${title}: ${action.units?formatFleet(action.units):state.players[action.owner].name} from ${at(action.source)}${action.destination?` → ${at(action.destination)}`:' → this battle'}`;
    if(action.destination)return `${title}: ${action.units?formatFleet(action.units)+' → ':''}${at(action.destination)}`;
    return title;
  }

  function relicDraftPotential(seat,limits) {
    const p=state.players[seat],income=aiIncome(seat),target=aiTargetCard(seat),cost=target?purchaseCost(p,target.key):{};
    return RESOURCES.reduce((n,r)=>n+Math.min(limits[r],Math.max(STARTING_LIMIT,p.resources[r],Math.min(income[r]*2,12),cost[r]||0))*4,0);
  }
  function relicAiValue(seat,a) {
    const p=state.players[seat];
    if(a.type==='relic_shift') {
      const limits=state.pendingRelic.limits,next={...limits,[a.giveType]:limits[a.giveType]-a.amount,[a.getType]:limits[a.getType]+a.amount};
      return relicDraftPotential(seat,next)-relicDraftPotential(seat,limits);
    }
    if(a.type==='relic_confirm')return .1;
    if(a.type==='relic_cancel')return -1;
    if(a.ability==='echoes')return a.cards.reduce((n,id)=>{const c=p.inPlay.find(c=>c.id===id),d=ALL_CARDS[c.key];return n+(d.relicAbility?12:d.effect?.draw?d.effect.draw*4:d.order==='colonize'?countPlacedShips(seat,'settler')?12:0:d.order==='construct'?8:d.order==='move'?6:1)+(starterLevel(c)===3?3:0);},0);
    if(a.ability==='worldseed')return 65-aiThreat(seat,{settler:0,explorer:0,fleet:0},a.destination)*25;
    if(a.ability==='hourglass')return p.hand.filter(c=>c.id!==a.card&&ALL_CARDS[c.key].order&&!ALL_CARDS[c.key].battleRelic).length>=2?30:0;
    if(a.ability==='keepers'||a.ability==='oracle')return aiCardUtility(seat,a.key)-Object.values(ALL_CARDS[a.key].cost).reduce((n,x)=>n+x,0)*1.5+(a.ability==='keepers'?5:2);
    if(a.ability==='compass')return state.planets[a.source]?.special==='relic'&&relicKnown(state.clusters[state.planets[a.source].cluster],seat)?0:42-a.units.explorer;
    if(a.ability==='horizon') {
      const sourceThreat=aiThreat(seat,a.units,a.source),destinationThreat=aiThreat(seat,a.units,a.destination);
      return (sourceThreat-destinationThreat)*25+(state.planets[a.destination].hasColony?3:0)-hexDistance(a.source,a.destination)*.1;
    }
    if(a.ability==='gravity') {
      const homes=colonyPlanets(seat).map(([at])=>at),distance=at=>Math.min(...homes.map(home=>hexDistance(at,home)),20);
      return Math.max(0,distance(a.destination)-distance(a.source))*5;
    }
    if(a.ability==='reservoir') {
      const limits=resourceLimits(seat),before=relicDraftPotential(seat,limits);
      for(const give of RESOURCES)for(const get of RESOURCES)if(give!==get&&limits[give]>Math.max(STARTING_LIMIT,p.resources[give]))
        if(relicDraftPotential(seat,{...limits,[give]:limits[give]-1,[get]:limits[get]+1})>before)return 12;
    }
    return 0;
  }
  function runAiRelic(seat,draft=false) {
    const actions=draft?relicDraftActions(seat):relicOperations(seat);
    let best=null,value=0;
    for(const a of actions){const score=relicAiValue(seat,a);if(score>value){best=a;value=score;}}
    return best?applyRelicAction(seat,best):false;
  }

  let relicChoiceCard=null,relicChoiceBattle=false,relicChoiceChosen=false,reservoirCommitting=false;
  let relicCardPick=null,relicCardReturns=[],relicCardPayment=null;
  function relicCardMode(cardId) {
    if(replayMode||!document.body.classList.contains('background-stars')||state.phase!=='operations'||state.activePlayer!==ME||!canManageResources(ME))return null;
    const card=state.players[ME].hand.find(c=>c.id===cardId),ability=card&&ALL_CARDS[card.key].relicAbility;
    return ['oracle','keepers','echoes'].includes(ability)?ability:null;
  }
  function closeRelicCards() {
    const dialog=$('#relic-card-dialog');
    if(dialog?.open){dialog.dataset.card='';dialog.close();}
  }
  function relicCardAction(mode,actions) {
    if(mode==='echoes') {
      const ids=state.players[ME].inPlay.map(c=>c.id).filter(id=>relicCardReturns.includes(id)).sort();
      return actions.find(a=>a.cards&&a.cards.length===ids.length&&a.cards.every((id,i)=>id===ids[i]));
    }
    return actions.find((a,i)=>a.key===relicCardPick&&(mode==='oracle'||i===relicCardPayment));
  }
  function updateRelicCardSelection() {
    const mode=relicCardMode(relicChoiceCard),actions=availableRelicChoices();
    if(!mode)return;
    const payment=$('#relic-card-payment'),paymentLabel=$('#relic-card-payment-label');
    paymentLabel.hidden=mode!=='keepers'||!relicCardPick;
    if(!paymentLabel.hidden) {
      const plans=actions.map((a,i)=>({a,i})).filter(({a})=>a.key===relicCardPick);
      if(!plans.some(({i})=>i===relicCardPayment))relicCardPayment=plans[0]?.i??null;
      payment.innerHTML=plans.map(({a,i})=>`<option value="${i}">${esc(relicActionLabel(a).replace(/^.*? · pay /,'Pay '))}</option>`).join('');
      payment.value=String(relicCardPayment);
    }
    const action=relicCardAction(mode,actions);
    $('#relic-card-dialog').querySelectorAll('[data-relic-card]').forEach(button=>{
      const chosen=mode==='echoes'?relicCardReturns.includes(button.dataset.relicCard):button.dataset.relicCard===relicCardPick;
      button.setAttribute('aria-pressed',String(chosen));
      button.classList.toggle('card-choice-selected',chosen);
      if(mode==='echoes')button.disabled=!chosen&&relicCardReturns.length>=2;
      if(chosen&&mode==='keepers'&&action){
        const cost=purchaseCost(state.players[ME],action.key);
        button.querySelector('.card-footer').innerHTML=`<small>Buy</small>${marketCostDots(state.players[ME],Object.fromEntries(RESOURCES.map(r=>[r,(cost[r]||0)-action.discount[r]])))}`;
      }
    });
    $('#relic-card-confirm').disabled=!action;
    $('#relic-card-confirm').textContent=mode==='echoes'?`Return ${relicCardReturns.length} card${relicCardReturns.length===1?'':'s'}`:action?`Buy ${ALL_CARDS[action.key].name}`:'Choose a card';
    $('#relic-card-status').textContent=mode==='echoes'?`${relicCardReturns.length} of 2 selected`:'Select a card, then confirm its purchase.';
  }
  function renderRelicCards(mode,actions) {
    const dialog=$('#relic-card-dialog'),player=state.players[ME],card=player.hand.find(c=>c.id===relicChoiceCard);
    const oldPositions=new Map([...dialog.querySelectorAll('.card-choice-row')].map(row=>[row.dataset.row,row.scrollLeft]));
    dialog.dataset.card=relicChoiceCard;dialog.dataset.mode=mode;
    $('#relic-card-title').textContent=ALL_CARDS[card.key].name;
    $('#relic-card-help').textContent=mode==='oracle'?'Browse all market designs. Buy one available deck copy at normal cost; normal cards enter your hand.':mode==='keepers'?'Choose a face-up market card, then choose how to reduce its price by two.':'Select up to two other cards In play to return to your hand.';
    const offers=mode==='oracle'?Object.keys(MARKET_CARDS).map(key=>({key})):mode==='keepers'?[...new Map(state.market.map(c=>[c.key,c])).values()]:player.inPlay.filter(c=>c.id!==relicChoiceCard);
    const tiers=mode==='echoes'?[{id:'in-play',name:'In play'}]:MARKET_TIERS;
    $('#relic-card-options').innerHTML=tiers.map(tier=>{
      const cards=offers.filter(c=>mode==='echoes'||marketTier(c.key)===tier.id);
      const markup=cards.map(c=>{
        let cost=mode==='echoes'?null:purchaseCost(player,c.key);
        const legal=actions.filter(a=>mode==='echoes'?a.cards?.includes(c.id):a.key===c.key);
        if(mode==='keepers') {
          const discounts=legal.length?legal.map(a=>a.discount):storageAllocations(Math.min(2,RESOURCES.reduce((n,r)=>n+(cost[r]||0),0))).filter(d=>RESOURCES.every(r=>d[r]<=(cost[r]||0)));
          const discount=discounts[0];if(discount)cost=Object.fromEntries(RESOURCES.map(r=>[r,(cost[r]||0)-discount[r]]));
        }
        const enabled=mode==='echoes'||legal.length>0,reason=cost?marketBlockReason(player,cost,true):{};
        const why=enabled?'':reason.card||'No copy remains in the eligible market supply.';
        return marketCardMarkup(c,tier,cost,enabled,why,`data-relic-card="${esc(mode==='echoes'?c.id:c.key)}" aria-pressed="false"`);
      }).join('')||'<p class="card-choice-empty">No cards here.</p>';
      const name=tier.id==='medium'?'Moderate':tier.name,id=`relic-cards-${tier.id}`;
      return `<section class="card-choice-tier" aria-label="${name} cards"><span class="card-choice-tier-label">${name}</span><button type="button" class="button card-choice-page" data-card-page="-1" data-card-row="${tier.id}" aria-label="Previous ${name} cards" aria-controls="${id}">‹</button><div class="card-choice-row" data-row="${tier.id}" id="${id}" tabindex="0" role="group" aria-label="${name}: ${cards.length} cards">${markup}</div><button type="button" class="button card-choice-page" data-card-page="1" data-card-row="${tier.id}" aria-label="Next ${name} cards" aria-controls="${id}">›</button></section>`;
    }).join('');
    $$('[data-relic-card]').forEach(button=>button.addEventListener('click',()=>{
      if(mode==='echoes') {
        const id=button.dataset.relicCard;
        relicCardReturns=relicCardReturns.includes(id)?relicCardReturns.filter(v=>v!==id):relicCardReturns.length<2?[...relicCardReturns,id]:relicCardReturns;
      } else {relicCardPick=button.dataset.relicCard;relicCardPayment=null;}
      updateRelicCardSelection();
    }));
    const rows=[...dialog.querySelectorAll('.card-choice-row')];
    const syncPages=()=>dialog.querySelectorAll('[data-card-page]').forEach(button=>{
      const row=rows.find(r=>r.dataset.row===button.dataset.cardRow);
      button.disabled=Number(button.dataset.cardPage)<0?row.scrollLeft<=1:row.scrollLeft+row.clientWidth>=row.scrollWidth-1;
    });
    dialog.querySelectorAll('[data-card-page]').forEach(button=>button.addEventListener('click',()=>{
      const row=rows.find(r=>r.dataset.row===button.dataset.cardRow);
      row.scrollBy({left:Number(button.dataset.cardPage)*(row.clientWidth+12),behavior:'smooth'});
    }));
    rows.forEach(row=>{row.scrollLeft=oldPositions.get(row.dataset.row)||0;row.addEventListener('scroll',syncPages);});
    updateRelicCardSelection();if(!dialog.open)dialog.showModal();if(typeof requestAnimationFrame==='function')requestAnimationFrame(syncPages);
  }
  function availableRelicChoices() {
    if(relicChoiceBattle)return combatActions(ME).filter(a=>a.type==='combat_relic');
    const actions=network?(serverHints.relics||[]):state.pendingRelic?relicDraftActions(ME):relicOperations(ME);
    return state.pendingRelic?actions:actions.filter(a=>a.card===relicChoiceCard);
  }
  function openRelicChoice(cardId=null,battle=false) {
    relicChoiceCard=cardId;relicChoiceBattle=battle;relicChoiceChosen=false;
    relicCardPick=null;relicCardReturns=[];relicCardPayment=null;
    const input=$('#relic-choice-filter');if(input)input.value='';
    if(!availableRelicChoices().length&&!relicCardMode(cardId)){relicChoiceCard=null;relicChoiceBattle=false;toast('No eligible choice for this relic right now.');return;}
    renderRelicChoice();
  }
  function renderRelicChoice() {
    if(headless||replayMode)return;
    const dialog=$('#relic-action-dialog');if(!dialog)return;
    if(state.pendingRelic?.playerId===ME){relicChoiceCard=state.pendingRelic.card;relicChoiceBattle=false;}
    if(!relicChoiceBattle&&!relicChoiceCard){if(dialog.open)dialog.close();closeRelicCards();return;}
    const actions=availableRelicChoices();
    const cardMode=!relicChoiceBattle&&relicCardMode(relicChoiceCard);
    if(cardMode){if(dialog.open)dialog.close();renderRelicCards(cardMode,actions);return;}
    closeRelicCards();
    if(!actions.length){relicChoiceCard=null;relicChoiceBattle=false;if(dialog.open)dialog.close();if(storageAllocationDraft?.redistribute)$('#storage-allocation-dialog').close();return;}
    const card=state.players[ME].hand.find(c=>c.id===relicChoiceCard),def=card&&ALL_CARDS[card.key];
    if(!relicChoiceBattle&&def?.relicAbility==='reservoir'&&document.body.classList.contains('background-stars')) {
      if(dialog.open)dialog.close();
      if(!reservoirCommitting) {
        if(storageAllocationDraft?.cardId===card.id&&storageAllocationDraft.redistribute)updateStorageAllocation();
        else openStorageAllocation(card.id);
      }
      return;
    }
    if(storageAllocationDraft?.redistribute){storageAllocationDraft=null;$('#storage-allocation-dialog').close();}
    $('#relic-choice-title').textContent=relicChoiceBattle?'Play a battle relic':def?.name||'Choose a relic action';
    $('#relic-choice-help').textContent=state.pendingRelic?`Capacity draft: ${RESOURCES.map(r=>`${RESOURCE_NAMES[r]} ${state.pendingRelic.limits[r]}`).join(' · ')}. Confirm to play the card, or cancel to keep it.`:def?.text||'Choose a held relic and its target. This does not replace your normal tactic.';
    const filter=$('#relic-choice-filter').value.toLowerCase(),select=$('#relic-choice-options'),previous=relicChoiceChosen?select.value:'';
    select.innerHTML=actions.map((a,index)=>({a,index,label:relicActionLabel(a).replace(def?`${def.name}: `:'\u0000','')})).filter(x=>x.label.toLowerCase().includes(filter)||state.pendingRelic&&['relic_confirm','relic_cancel'].includes(x.a.type)).map(x=>`<option value="${x.index}">${esc(x.label)}</option>`).join('');
    select.selectedIndex=-1;
    if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;
    else if(actions.length===1&&select.options.length)select.selectedIndex=0;
    $('#relic-choice-confirm').disabled=select.selectedIndex<0;
    $('#relic-choice-confirm').textContent=state.pendingRelic?'Apply choice':'Play relic';
    $('#relic-choice-cancel').textContent=state.pendingRelic?'Cancel redistribution':'Cancel';
    renderRelicChoiceDetail();
    if(!dialog.open)dialog.showModal();
  }
  function renderRelicChoiceDetail() {
    const select=$('#relic-choice-options'),detail=$('#relic-choice-detail'),a=select.selectedIndex<0?null:availableRelicChoices()[Number(select.value)];
    $('#relic-choice-confirm').disabled=!a;
    detail.hidden=!a?.purchase&&!a?.tactic;
    if(a?.purchase){const cost=purchaseCost(state.players[ME],a.key);detail.innerHTML=`<strong>${esc(ALL_CARDS[a.key].name)}</strong> · Pay ${resourceDots(Object.fromEntries(RESOURCES.map(r=>[r,(cost[r]||0)-a.discount[r]])))}<br>${esc(ALL_CARDS[a.key].text)}`;}
    else if(a?.tactic)detail.textContent=MILITARY_CARDS[a.tactic].text;
    else detail.textContent='';
  }
  function cancelRelicChoice() {
    const draft=state.pendingRelic?.playerId===ME;
    relicChoiceCard=null;relicChoiceBattle=false;$('#relic-action-dialog').close();closeRelicCards();
    if(draft)applyRelicAction(ME,{type:'relic_cancel'});
  }

  function resolveAlienSpecial(playerId, card, definition, allocation = null) {
    const player = state.players[playerId];
    if (!['alienSurvey','alienEchoes','alienSignals','alienLoom','alienWorldweaver','alienCradle'].includes(definition.tag) || !player.hand.some(c=>c.id===card.id)) return false;
    if (definition.tag==='alienCradle' && !validStorageAllocation(allocation,RELIC_STORAGE_POINTS)) {
      if (!headless && playerId===ME && canManageResources(ME)) openStorageAllocation(card.id);
      return false;
    }
    if (!removeHandCard(player,card.id)) return false;
    if (definition.tag === 'alienSurvey') {
      for (let i=0;i<2;i++) {
        const world=nearestUnscannedRelicCluster(playerId,true);
        if (world) world.scannedBy=[0,1,2,3];
      }
    } else if (definition.tag === 'alienEchoes') drawCards(player,3);
    else if (definition.tag === 'alienSignals') {
      state.clusters.forEach(world=>{
        const coord=relicCoordInCluster(world);
        if (coord && !state.planets[coord].relicClaimed && !world.scannedBy.includes(playerId)) world.scannedBy.push(playerId);
      });
      drawCards(player,1);
    } else if (definition.tag === 'alienLoom') { addResources(player,{matter:4,biomass:2}); drawCards(player,1); }
    else if (definition.tag === 'alienWorldweaver') {
      const planets=controlledPlanets(playerId).filter(([,planet])=>RESOURCES.includes(planet.type)).slice(0,2);
      const gains={};
      planets.forEach(([,planet])=>{gains[planet.type]=(gains[planet.type]||0)+1;});
      addResources(player,gains);drawCards(player,1);
    } else if (definition.tag === 'alienCradle') {
      addStorageCapacity(playerId,allocation);player.storageUpgrades+=1;addResources(player,{biomass:2});drawCards(player,1);
    } else return false;
    completeAction(playerId,`${player.name} awakened ${definition.name}.`);
    return true;
  }

  // Archive Purge (rules #cards): the level I starters in your discard pile it may trash.
  function archivePurgeTargets(playerId) {
    return state.players[playerId].discard.filter(c=>c.starter && !c.upgraded);
  }
  // Every legal Archive Purge choice: up to `max` of those cards, listed in discard order
  // so one choice has exactly one spelling (shared tables match commands field by field).
  function archivePurgeChoices(playerId, max = 2) {
    const ids = archivePurgeTargets(playerId).map(c=>c.id), choices = [[]];
    const extend = (start, picked) => {
      if (picked.length >= max) return;
      for (let i = start; i < ids.length; i += 1) { const next = [...picked, ids[i]]; choices.push(next); extend(i + 1, next); }
    };
    extend(0, []);
    return choices;
  }
  function validArchivePurgeChoice(playerId, trash, max = 2) {
    if (!Array.isArray(trash) || trash.length > max) return false;
    const ids = archivePurgeTargets(playerId).map(c=>c.id), at = trash.map(id=>ids.indexOf(id));
    return at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]));
  }
  // Rival choice: trash only surplus starters, keeping at least 3 Move-order and
  // 2 Construct-order cards across all piles (Move and Construct are not sold).
  function aiArchivePurgeChoice(playerId, max = 2) {
    const keep = { move: 3, construct: 2 }, owned = { move: aiOrderCount(playerId,'move'), construct: aiOrderCount(playerId,'construct') };
    const trash = [];
    for (const card of archivePurgeTargets(playerId)) {
      if (trash.length >= max) break;
      if (keep[card.key] !== undefined && owned[card.key] > keep[card.key]) { trash.push(card.id); owned[card.key] -= 1; }
    }
    return trash;
  }

  // One-step special orders of the 31.36 market (rules #cards). Order: limits, trash,
  // production, gains, Prestige, then draws. Archive Purge's trash is the only choice:
  // `choice` lists the chosen discard card ids.
  // #exchange-orders: held exchange cards may also play during their owner's Buy.
  function canPlayExchange(playerId, cardId) {
    const player=state.players[playerId],card=player?.hand.find(c=>c.id===cardId);
    return Boolean(card && ALL_CARDS[card.key]?.effect?.bankRate && state.activePlayer===playerId
      && canManageResources(playerId) && !state.pendingConstruct && !state.pendingColonyBuild && !state.pendingMove
      && (state.phase==='buy' || state.phase==='operations'&&!player.passed));
  }

  function resolveCardEffect(playerId, card, definition, choice = null) {
    const player = state.players[playerId], effect = definition.effect;
    if (state.pendingCombat || !player.hand.some(c=>c.id===card.id)) return false;
    if(effect.bankRate && !canPlayExchange(playerId,card.id))return false;
    if(effect.bankRate && !RESOURCES.includes(choice)) { if(!headless&&playerId===ME)openExchangeResource(card.id);return false; }
    if (effect.trashStarters && !validArchivePurgeChoice(playerId,choice,effect.trashStarters)) {
      if (!headless && playerId===ME) openArchivePurge(card.id);
      return false;
    }
    // Capacity Module (rules #storage-allocation): `choice` is the chosen split of its points.
    if (effect.allocate && !validStorageAllocation(choice,effect.allocate)) {
      if (!headless && playerId===ME && canManageResources(ME)) openStorageAllocation(card.id);
      return false;
    }
    const played = removeHandCard(player,card.id,effect.trashSelf||effect.store?'trash':'inPlay');
    // Capacity Module: the card and its chosen split stay in the permanent Storage pile.
    if (effect.store) player.storage.push({...played, allocation: {...choice}});
    const notes = [];
    if(effect.bankRate){player.bankExchangeResources=[...new Set([...(player.bankExchangeResources||[]),choice])];notes.push(`enabled 2:1 ${RESOURCE_NAMES[choice]} bank exchanges until its Buy ends`);}
    if (effect.allocate) { addStorageCapacity(playerId,choice); player.storageUpgrades += 1; notes.push(`added ${effect.allocate} capacity points (${RESOURCES.filter(r=>choice[r]).map(r=>`+${choice[r]} ${RESOURCE_NAMES[r]}`).join(', ')}) and stored the card`); }
    if (effect.limits) { addStorageCapacity(playerId,effect.limits); notes.push(`raised its limits (${RESOURCES.filter(r=>effect.limits[r]).map(r=>`+${effect.limits[r]} ${RESOURCE_NAMES[r]}`).join(', ')})`); }
    if (effect.trashStarters) {
      const targets = choice.map(id=>player.discard.find(c=>c.id===id));
      targets.forEach(target=>player.discard.splice(player.discard.indexOf(target),1));
      notes.push(targets.length ? `trashed ${targets.map(c=>ALL_CARDS[c.key].name).join(' and ')}` : 'trashed no starter');
    }
    if (effect.produce) { const gain = aiIncome(playerId); addResources(player,gain); notes.push('collected its round production again'); }
    if (effect.gain) addResources(player,effect.gain);
    if (effect.prestige) { player.cardPrestige = (player.cardPrestige || 0) + effect.prestige; notes.push(`gained ${effect.prestige} permanent Prestige`); }
    if (effect.draw) drawCards(player,effect.draw);
    const message=`${player.name} used ${definition.name}${notes.length ? ` and ${notes.join(', ')}` : ''}.`;
    if (effect.bankRate && state.phase==='buy') { logEvent(message);render();saveGame(); }
    else completeAction(playerId,message);
    return true;
  }

  // Construct cards with a printed bonus (Orbital Foundry) pay it after a successful build.
  function applyBuildBonus(playerId, card) {
    const gain = card && ALL_CARDS[card.key]?.buildGain;
    if (gain) addResources(state.players[playerId],gain);
  }

  function resolveHumanSpecial(card, definition, playerId = 0, allocation = null) {
    if(definition.relicAbility){if(!headless&&playerId===ME)openRelicChoice(card.id);return false;}
    if (state.pendingCombat) return false;
    const player = state.players[playerId];
    if (definition.effect) return resolveCardEffect(playerId,card,definition,allocation);
    if (definition.kind === 'Alien Relic') return resolveAlienSpecial(playerId,card,definition,allocation);
    if (!['surge','foresight','brokerage','uplink','bankTrade'].includes(definition.tag) || !player.hand.some(c=>c.id===card.id)) return false;
    if (definition.tag !== 'bankTrade') removeHandCard(player,card.id);
    if (definition.tag === 'surge') {
      const byCluster = new Map();
      controlledPlanets(playerId).forEach(([key,planet]) => {
          if (!byCluster.has(planet.cluster)) byCluster.set(planet.cluster, []);
        byCluster.get(planet.cluster).push(planet);
      });
      const best = [...byCluster.values()].sort((a,b) => b.length - a.length)[0] || [];
      const gain = {};
      best.slice(0,3).forEach(planet => { gain[planet.type] = (gain[planet.type] || 0) + 1; });
      const result = addResources(player,gain);
      completeAction(playerId, `${player.name} used Industrial Surge on ${Math.min(3,best.length)} planets.${overflowNote(result)}`);
    } else if (definition.tag === 'foresight') {
      drawCards(player, 3);
      if (player.hand.length) player.discard.push(player.hand.shift());
      completeAction(playerId, `${player.name} used Tactical Foresight to reshape ${playerId===ME&&!headless?'your':'its'} hand.`);
    } else if (definition.tag === 'brokerage') {
      const trashTarget = player.discard.find(c => BASIC_CARDS[c.key]);
      if (trashTarget) player.discard.splice(player.discard.indexOf(trashTarget),1);
      drawCards(player,2);
      completeAction(playerId, `${player.name} used Data Brokerage${trashTarget ? ` and removed ${ALL_CARDS[trashTarget.key].name}` : ''}.`);
    } else if (definition.tag === 'uplink') {
      const basic = player.discard.find(c => BASIC_CARDS[c.key]);
      if (basic) {
        player.discard.splice(player.discard.indexOf(basic),1);
        player.hand.push(basic);
      }
      completeAction(playerId, `${player.name} activated Command Uplink${basic ? ` and recovered ${ALL_CARDS[basic.key].name}` : ''}.`);
    } else if (definition.tag === 'bankTrade') {
      if (state.pendingConsortium || state.phase !== 'operations' || state.activePlayer !== playerId || !player.hand.some(c=>c.id===card.id)) return false;
      clearAction();
      state.pendingConsortium = { playerId, cardId: card.id, trades: 0 };
      state.turnStage = 'consortium';
      render(); saveGame(); renderConsortium();
      return true;
    }
  }

  function consortiumPending(playerId) {
    const pending = state.pendingConsortium;
    return !replayMode && state.winner === null && state.phase === 'operations' && state.activePlayer === playerId
      && pending?.playerId === playerId && (pending.trades ? state.players[playerId].inPlay : state.players[playerId].hand).some(c=>c.id===pending.cardId && c.key==='tradeConsortium') ? pending : null;
  }

  function canConsortiumGain(playerId, resource) {
    const pending = consortiumPending(playerId);
    return Boolean(pending && pending.trades === 0 && RESOURCES.includes(resource));
  }

  function canConsortiumExchange(playerId, giveType, getType) {
    const pending = consortiumPending(playerId);
    return Boolean(pending && pending.trades < 2 && RESOURCES.includes(giveType) && RESOURCES.includes(getType)
      && giveType !== getType && state.players[playerId].resources[giveType] >= 2);
  }

  function finishConsortium(playerId, cancel = false) {
    const pending = consortiumPending(playerId);
    if (!pending || (cancel ? pending.trades !== 0 : pending.trades === 0)) return false;
    state.pendingConsortium = null;
    if (!headless && $('#consortium-dialog').open) $('#consortium-dialog').close();
    if (cancel) { state.turnStage = playerId === ME ? 'prep' : 'ai'; render(); saveGame(); }
    else { completeAction(playerId,`${state.players[playerId].name} finished Trade Consortium.`); }
    return true;
  }

  function consortiumGain(playerId, resource) {
    if (!canConsortiumGain(playerId,resource)) return false;
    removeHandCard(state.players[playerId],state.pendingConsortium.cardId);
    addResources(state.players[playerId],{[resource]:1});
    logEvent(`${state.players[playerId].name} used Trade Consortium to gain 1 ${RESOURCE_NAMES[resource]}.`);
    // The first successful choice commits the card before resolving its effect.
    state.pendingConsortium.trades = 1;
    return finishConsortium(playerId);
  }

  function consortiumExchange(playerId, giveType, getType) {
    if (!canConsortiumExchange(playerId,giveType,getType)) return false;
    const player = state.players[playerId];
    if (state.pendingConsortium.trades === 0) removeHandCard(player,state.pendingConsortium.cardId);
    player.resources[giveType] -= 2; addResources(player,{[getType]:1});
    state.pendingConsortium.trades++;
    logEvent(`${player.name} used Trade Consortium: 2 ${RESOURCE_NAMES[giveType]} → 1 ${RESOURCE_NAMES[getType]}.`);
    if (state.pendingConsortium.trades === 2) finishConsortium(playerId);
    else { render(); saveGame(); renderConsortium(); }
    return true;
  }

  function renderConsortium() {
    if (headless || replayMode || !consortiumPending(ME)) return;
    const pending = state.pendingConsortium;
    $('#consortium-status').textContent = pending.trades ? 'One exchange complete. Choose a second exchange, or finish your order.' : 'Choose one resource to gain, OR make up to two exchanges. Nothing changes until you choose.';
    $('#consortium-gains').innerHTML = RESOURCES.map(resource=>`<button type="button" class="button" data-consortium-gain="${resource}" ${canConsortiumGain(ME,resource)?'':'disabled'}>Gain ${resourceDots({[resource]:1})}</button>`).join('');
    $$('[data-consortium-gain]').forEach(button=>button.addEventListener('click',()=>consortiumGain(ME,button.dataset.consortiumGain)));
    const give = $('#consortium-give').value, get = $('#consortium-get').value;
    $('#consortium-exchange-preview').innerHTML = `${resourceDots({[give]:2})} → ${resourceDots({[get]:1})}`;
    $('#consortium-exchange-button').disabled = !canConsortiumExchange(ME,give,get);
    $('#consortium-finish').hidden = pending.trades === 0;
    $('#consortium-cancel').hidden = pending.trades !== 0;
    if (!$('#consortium-dialog').open) $('#consortium-dialog').showModal();
  }

  function runAiConsortium() {
    const id = state.activePlayer, player = state.players[id];
    if (!consortiumPending(id)) return;
    const scarce = [...RESOURCES].sort((a,b)=>player.resources[a]-player.resources[b])[0];
    if (canConsortiumGain(id,scarce)) consortiumGain(id,scarce);
    else {
      const give = [...RESOURCES].sort((a,b)=>player.resources[b]-player.resources[a]).find(type=>canConsortiumExchange(id,type,scarce));
      if (give) { consortiumExchange(id,give,scarce); if (consortiumPending(id)) finishConsortium(id); }
      else finishConsortium(id,state.pendingConsortium.trades===0);
    }
  }

  function openExcavationRewards() {
    const site=state.planets[state.selected];
    if (headless || replayMode || state.pendingCombat || state.phase!=='operations' || state.activePlayer!==ME || state.actionMode!=='excavate'
      || !site || site.special!=='relic' || site.relicClaimed || !relicKnown(state.clusters[site.cluster],ME) || !getFleet(state.selected,ME)?.explorer) return false;
    switchTab('relics');
    globalThis.galacticReachMaxUI?.requestRelics?.();
    const scan=$('#sector-popover');
    if (scan.matches(':popover-open')) scan.hidePopover();
    $('#console').scrollIntoView?.({block:'nearest'});
    return true;
  }

  function humanSelectHex(key) {
    state.selected = key;
    if (state.phase === 'operations' && state.activePlayer === ME && state.turnStage === 'action' && state.actionMode) {
      if (state.actionMode === 'move') handleHumanMoveSelection(key);
      else if (state.actionMode === 'probe' && !probeRelic(ME,key,state.actionCardId)) toast(getFleet(key,ME)?.explorer ? probeUnavailableMessage() : 'Select your Explorer’s hex. Probe can locate a relic from empty space, a home world or a Shipyard.');
    }
    const opened=openExcavationRewards();
    render();
    saveGame();
    return opened;
  }

  function handleHumanMoveSelection(key) {
    if (state.moveSource && state.reachable.includes(key)) {
      const card=state.players[ME].hand.find(c=>c.id===state.actionCardId);
      performMoveOrder(ME,state.moveSource,key,card,state.actionOptions);
      return;
    }
    if (state.moveSource===key) return;
    // Rules #movement: selecting one of your hexes chooses it as the source, with every
    // combat ship ticked (or the Explorer team when no combat ship is there).
    if (!fleetCount(getFleet(key,ME))) {
      toast(state.moveSource ? 'That destination is outside the chosen units’ range.' : 'Select a hex containing one of your fleets.');
      return;
    }
    prepareHumanMove(key);
  }

  // Ticks `units` (counts per type, or a whole 'ships'/'explorer' group; default: all
  // combat ships, else the Explorer team)
  // at `key` and highlights where they can reach at the slowest chosen unit's speed.
  function prepareHumanMove(key, units = null) {
    if (state.pendingCombat) return false;
    const fleet = getFleet(key,ME);
    const moving = moveSelection(fleet,typeof units === 'string' ? {moveGroup:units} : units ? {units} : {});
    if (!moving) return false;
    state.moveSource = key;
    state.actionOptions.units = moving;
    state.actionOptions.moveGroup = moving.explorer ? 'explorer' : 'ships';
    const range = movementRange(moving,state.actionOptions);
    state.reachable = reachableFrom(key,ME,range,avoidsHostile(state.actionOptions.tag),moving);
    toast(`${formatFleet(moving)} has ${range} movement. Portal crossing costs 2. Select a highlighted destination, or untick units in Sector Scan.`);
    render();
    return true;
  }

  // Ticks or unticks one unit type's count in the chosen group. Choosing an Explorer
  // clears the combat ships and vice versa: Explorers travel as their own team.
  function setMoveUnits(type, amount) {
    const fleet=getFleet(state.moveSource,ME), current=state.actionOptions.units;
    if (!fleet || !current || !SHIP_STATS[type]) return false;
    const active=document.activeElement;
    const focusSelector=active?.dataset?.moveUnit===type ? `[data-move-unit="${type}"]` : active?.dataset?.moveCount===type ? `[data-move-count="${type}"]` : null;
    const restoreFocus=()=>{if(focusSelector)document.querySelector(focusSelector)?.focus();};
    const next={...current,[type]:Math.max(0,Math.min(fleet[type]||0,amount))};
    if (type==='explorer' && next.explorer) { next.settler=0; next.fleet=0; }
    if (type!=='explorer' && next[type]) next.explorer=0;
    if (!fleetCount(next)) { toast('Keep at least one unit ticked, or cancel the order.'); render(); restoreFocus(); return false; }
    const prepared=prepareHumanMove(state.moveSource,next);
    restoreFocus();
    return prepared;
  }

  // Sector Scan checklist: one row per unit type at the chosen source. The box ticks the
  // whole type; with several units of a type, the number sets how many of them move.
  function moveUnitPicker(key) {
    const fleet=getFleet(key,ME), chosen=state.actionOptions.units;
    if (!fleet || !chosen) return null;
    const box=document.createElement('fieldset');
    box.className='move-picker';
    const range=movementRange(chosen,state.actionOptions);
    box.innerHTML=`<legend>Units moving · speed ${range}</legend><p class="muted">Untick units to leave them here. The group moves at its slowest chosen unit’s speed. Explorers travel as their own team.</p>`;
    for (const type of Object.keys(SHIP_STATS)) {
      const total=fleet[type]||0;
      if (!total) continue;
      const row=document.createElement('div');
      row.className='move-picker-row';
      const label=document.createElement('label');
      const tick=document.createElement('input');
      tick.type='checkbox';
      tick.checked=chosen[type]>0;
      tick.dataset.moveUnit=type;
      tick.addEventListener('change',()=>setMoveUnits(type,tick.checked?total:0));
      label.append(tick,` ${SHIP_STATS[type].name}${total===1?'':'s'} · speed ${SHIP_STATS[type].move}`);
      row.appendChild(label);
      if (total>1) {
        // A select commits on choice; a number field would wait for blur and lose a quick map click.
        const count=document.createElement('select');
        for (let n=1;n<=total;n++) count.add(new Option(String(n),String(n),false,n===(chosen[type]||total)));
        count.disabled=!chosen[type];
        count.dataset.moveCount=type;
        count.setAttribute('aria-label',`${SHIP_STATS[type].name}s moving, of ${total}`);
        count.addEventListener('change',()=>setMoveUnits(type,Number(count.value)));
        const of=document.createElement('span');
        of.className='muted'; of.textContent=`of ${total}`;
        row.append(count,of);
      }
      box.appendChild(row);
    }
    return box;
  }

  function discardActionCard(playerId) {
    const player = state.players[playerId];
    if (state.actionCardId) removeHandCard(player,state.actionCardId);
  }

  function nameForCoord(key) {
    return state.planets[key]?.name || 'empty space';
  }

  function executeMove(playerId, source, destination, options = {}) {
    const sourceFleet = getFleet(source,playerId);
    const sourceSnapshot = options.units ? moveSelection(sourceFleet,options) : fleetGroup(sourceFleet,options.moveGroup || 'all');
    if (!sourceSnapshot) return false;
    if (state.pendingCombat || !sourceFleet || !fleetCount(sourceSnapshot)) return false;
    Object.keys(SHIP_STATS).forEach(type => { sourceFleet[type] = Math.max(0,(sourceFleet[type] || 0) - (sourceSnapshot[type] || 0)); });
    if (!fleetCount(sourceFleet)) {
      delete state.fleets[source][playerId];
      if (!Object.keys(state.fleets[source]).length) delete state.fleets[source];
    }
    const target = ensureFleet(destination,playerId);
    Object.keys(sourceSnapshot).forEach(type => { target[type] += sourceSnapshot[type]; });
    if (fleetCount(sourceSnapshot)) revealClusterAt(destination,playerId);
    if (hostileAt(destination,playerId)) resolveCombat(playerId,destination,source,options);
    return true;
  }

  function combatPieces(playerId, coord, includeStarbase, defending = false) {
    const pieces = [];
    const fleet = getFleet(coord,playerId);
    if (fleet) Object.keys(SHIP_STATS).forEach(type => {
      for (let i=0;i<fleet[type];i+=1) pieces.push({ type, hull: defending ? SHIP_STATS[type].defendingHull || SHIP_STATS[type].hull : SHIP_STATS[type].hull, power: SHIP_STATS[type].power, damage: 0 });
    });
    if (includeStarbase) {
      pieces.push({ type:'starbase', hull:3, power:3, damage:0 });
    }
    return pieces;
  }

  function findDefender(coord, attacker) {
    const fleets = state.fleets[coord] || {};
    const fleetOwner = Object.keys(fleets).map(Number).find(owner => owner !== attacker && fleetCount(fleets[owner]));
    if (fleetOwner !== undefined) return fleetOwner;
    const planet = state.planets[coord];
    return planet?.upgrade==='starbase' && planet.owner!==null && planet.owner!==attacker ? planet.owner : null;
  }

  function aliveCombatPieces(pieces) {
    return pieces.filter(piece => piece.damage < piece.hull);
  }

  function combatPower(pieces) {
    return aliveCombatPieces(pieces).reduce((sum,piece) => sum + (piece.power || 0),0);
  }

  function useReaction(playerId, reaction, pieces = null) {
    const player = state.players[playerId];
    const index = player.hand.findIndex(card => {
      const definition = ALL_CARDS[card.key];
      return definition.reaction === reaction && (!definition.requiresFleet || pieces?.some(p=>p.type==='fleet' && p.damage<p.hull));
    });
    if (index < 0) return null;
    const card = removeHandCard(player,player.hand[index].id);
    return ALL_CARDS[card.key];
  }

  function reactionStrength(playerId, reaction, fallback, pieces) {
    const definition=useReaction(playerId,reaction,pieces);
    return definition ? definition.strength || fallback : 0;
  }

  function applyCombatHits(pieces, hits) {
    const order = { fleet:0, settler:1, explorer:2, starbase:3 };
    const destroyed = [];
    for (let i=0;i<hits;i+=1) {
      const alive = aliveCombatPieces(pieces).sort((a,b) => order[a.type]-order[b.type] || (a.hull-a.damage)-(b.hull-b.damage));
      if (!alive.length) break;
      alive[0].damage += 1;
      if (alive[0].damage >= alive[0].hull) destroyed.push(alive[0]);
    }
    return destroyed;
  }

  function syncCombatPieces(playerId, coord, pieces) {
    const fleet = ensureFleet(coord,playerId);
    for (const type of Object.keys(SHIP_STATS)) fleet[type] = pieces.filter(p=>p.type===type && p.damage<p.hull).length;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    const planet = state.planets[coord];
    if (planet && planet.owner === playerId && planet.upgrade === 'starbase' && pieces.some(p=>p.type==='starbase') && !pieces.some(p => p.type === 'starbase' && p.damage < p.hull)) {
      planet.upgrade = null;
      planet.owner = null; // #destroyed-shipyards: ordinary claim/build rules apply again.
    }
  }

  function findRetreat(coord, playerId, preferred = null) {
    const count=fleetCount(getFleet(coord,playerId));
    const legal=key=>adjacentKeys(coord).includes(key) && !hostileAt(key,playerId);
    if (preferred && legal(preferred)) return preferred;
    return adjacentKeys(coord).find(legal) || null;
  }

  function retreatFleet(coord, destination, playerId) {
    const fleet = getFleet(coord,playerId);
    if (!fleet || !destination || !adjacentKeys(coord).includes(destination) || hostileAt(destination,playerId)) return false;
    const target = ensureFleet(destination,playerId);
    Object.keys(SHIP_STATS).forEach(type => { target[type] += fleet[type]; });
    delete state.fleets[coord][playerId];
    if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    revealClusterAt(destination,playerId);
    return true;
  }

  function combatActor() {
    const battle=state.pendingCombat;
    if (!battle) return null;
    if(battle.stage==='opening'||battle.stage==='aftermath'){const field=battle.stage==='opening'?'relicDone':'aftermathDone';const side=['attacker','defender'].find(side=>!battle[field]?.[side]);return side?battle[`${side}Id`]:null;}
    for (const side of ['attacker','defender']) {
      if (battle.stage==='escape' ? !battle.escapeDone[side] : battle.commitments[side]===null) return battle[`${side}Id`];
    }
    return null;
  }

  function combatSide(seat) {
    const battle=state.pendingCombat;
    return battle && (seat===battle.attackerId?'attacker':seat===battle.defenderId?'defender':null);
  }

  // The only combat information supplied to policies and live observations. In
  // particular, a pending opponent commitment is never copied into this view.
  function combatView(seat) {
    const battle=state.pendingCombat;
    if (!battle) return null;
    const own=combatSide(seat);
    return clone({coord:battle.coord,origin:battle.origin,stage:battle.stage,volley:battle.volley+1,actor:combatActor(),side:own,
      attackerId:battle.attackerId,defenderId:battle.defenderId,tag:battle.options.tag || null,
      sides:Object.fromEntries(['attacker','defender'].map(side=>[side,{
        playerId:battle[`${side}Id`],pieces:battle[`${side}Pieces`],used:battle.used[side],available:battle.hands[side],
        remaining:Object.values(battle.hands[side]).reduce((sum,n)=>sum+n,0),committed:battle.commitments[side]!==null,
        escapeDone:battle.escapeDone[side],...(side===own?{hand:battle.hands[side],choice:battle.commitments[side]}:{})
      }])),summary:battle.summary,volleys:battle.volleys});
  }

  function combatActions(seat) {
    const battle=state.pendingCombat, side=combatSide(seat);
    if (!battle || combatActor()!==seat || !side) return [];
    if(battle.stage==='opening'||battle.stage==='aftermath')return [...battleRelicActions(seat),{type:'combat_continue'}];
    if (battle.stage==='tactic') return [...battleRelicActions(seat),...Object.keys(MILITARY_CARDS).filter(key=>battle.hands[side][key]>0).map(tactic=>({type:'combat_tactic',tactic}))];
    const actions=[{type:'combat_stay'}];
    const explorers=aliveCombatPieces(battle[`${side}Pieces`]).filter(p=>p.type==='explorer').length;
    for (const destination of adjacentKeys(battle.coord)) {
      if (hostileAt(destination,seat)) continue;
      const max=Math.min(explorers,state.players[seat].resources.energy);
      for (let amount=1;amount<=max;amount++) actions.push({type:'combat_escape',destination,amount});
    }
    return actions;
  }

  function finishMoveOrder() {
    const pending=state.pendingMove;
    if (!pending || state.pendingCombat) return;
    state.pendingMove=null;
    completeAction(pending.playerId,pending.message);
  }

  function finishCombat() {
    const b=state.pendingCombat;
    if (!b) return;
    if(b.resolved){advanceBattleRelics();return;}
    const {attackerId,defenderId,coord,origin}=b, planet=state.planets[coord];
    syncCombatPieces(attackerId,coord,b.attackerPieces);
    syncCombatPieces(defenderId,coord,b.defenderPieces);
    let outcome;
    const attackers=fleetCount(getFleet(coord,attackerId));
    const defenders=aliveCombatPieces(b.defenderPieces).length;
    if (!attackers) outcome=attackerId===ME&&!headless?'You have no attacking ships left on the hex.':`${state.players[attackerId].name} has no attacking ships left on the hex.`;
    else if (!defenders) {
      outcome=`${state.players[attackerId].name} won the battle.`;
    } else {
      const retreat=findRetreat(coord,attackerId,origin);
      if (retreatFleet(coord,retreat,attackerId)) outcome=`${state.players[attackerId].name} retreated to ${nameForCoord(retreat)}.`;
      else {
        b.destroyedCount+=attackers;
        b.attackerPieces.forEach(piece=>{piece.damage=piece.hull;});
        syncCombatPieces(attackerId,coord,b.attackerPieces);
        outcome=`${attackerId===ME&&!headless?'You could not retreat, and your':`${state.players[attackerId].name} could not retreat, and its`} ${attackers} surviving ship${attackers===1?' was':'s were'} destroyed.`;
      }
    }
    let prestigeWinner=null;
    const survivingAttackers=aliveCombatPieces(b.attackerPieces).length;
    const survivingDefenders=aliveCombatPieces(b.defenderPieces).length;
    const winnerSide=survivingAttackers && !survivingDefenders ? 'attacker' : survivingDefenders && !survivingAttackers ? 'defender' : null;
    if (winnerSide) {
      const loserSide=winnerSide==='attacker'?'defender':'attacker';
      const enemyUnits=b[`${loserSide}Pieces`].filter(piece=>SHIP_STATS[piece.type]);
      if (enemyUnits.length && enemyUnits.every(piece=>piece.damage>=piece.hull) && b.escapedUnits?.[loserSide]===0) {
        prestigeWinner=b[`${winnerSide}Id`];
        const player=state.players[prestigeWinner];
        player.combatVictories=(player.combatVictories||0)+1;
        b.summary.push(`${player.name} gained ${COMBAT_VICTORY_PRESTIGE} Prestige for destroying all opposing units without an enemy escape or retreat.`);
      }
    }
    // Military-deck cards with after-battle effects (Boarding Marines, Victory Doctrine).
    for (const side of ['attacker','defender']) {
      const player=state.players[b[`${side}Id`]];
      for (const key of b.played?.[side]||b.used[side]) {
        const tactic=MILITARY_CARDS[key];
        if (tactic.loot) { addResources(player,tactic.loot); b.summary.push(`${player.name} gained ${RESOURCES.filter(r=>tactic.loot[r]).map(r=>`${tactic.loot[r]} ${RESOURCE_NAMES[r]}`).join(' and ')} from ${tactic.name}.`); }
        if (tactic.victoryPrestige && prestigeWinner===b[`${side}Id`]) { player.cardPrestige=(player.cardPrestige||0)+tactic.victoryPrestige; b.summary.push(`${player.name} gained ${tactic.victoryPrestige} more Prestige from ${tactic.name}.`); }
      }
    }
    if (b.destroyedCount) for (const id of [attackerId,defenderId]) {
      const salvage=useReaction(id,'salvage');
      if (salvage) addResources(state.players[id],{matter:Math.min(salvage.salvageCap||3,b.destroyedCount),data:salvage.bonusData||0});
    }
    b.resolved=true;b.outcome=outcome;b.prestigeWinner=prestigeWinner;b.stage='aftermath';b.aftermathDone={attacker:false,defender:false};
    advanceBattleRelics();
    if(state.pendingCombat){render();saveGame();scheduleCombatAi();}
  }

  function finalizeCombat() {
    const b=state.pendingCombat;if(!b)return;
    const {attackerId,defenderId,coord,outcome,prestigeWinner}=b;
    state.lastCombat={attackerId,defenderId,coord,summary:b.summary,volleys:b.volleys,outcome,prestigeWinner,system:'secret-fixed-hand'};
    state.pendingCombat=null;
    if (!headless && (attackerId===ME || defenderId===ME)) state.pendingCombatReport=state.lastCombat;
    logEvent(`${state.players[attackerId].name} attacked ${state.players[defenderId].name} at ${nameForCoord(coord)}. ${outcome}`);
    if (prestigeWinner!==null) logEvent(`${state.players[prestigeWinner].name} gained ${COMBAT_VICTORY_PRESTIGE} Prestige for a decisive combat victory.`);
    if (!headless && $('#combat-dialog').open) $('#combat-dialog').close();
    finishMoveOrder();
    if(state.pendingBuildOrder){const pending=state.pendingBuildOrder;state.pendingBuildOrder=null;if(!pending.second)completeAction(pending.playerId,pending.message);else state.turnStage=pending.playerId===ME?'construct-again':'ai';}
    render();saveGame();
    // Resume an optional second build after a rival-versus-rival commissioning battle.
    // Human battles resume after the report; headless callers drive their own decisions.
    if(!headless && state.pendingConstruct && state.activePlayer!==ME && !state.pendingCombatReport) scheduleAiTurn('operations',runAiOperation,650);
  }

  function resolveCombatVolley() {
    const b=state.pendingCombat, sides=['attacker','defender'];
    const results={};
    // Read all pre-volley survivors and reactions before applying either damage.
    for (const side of sides) {
      const pieces=b[`${side}Pieces`], id=b[`${side}Id`], key=b.commitments[side], tactic=MILITARY_CARDS[key];
      b.played ||= {attacker:[...b.used.attacker],defender:[...b.used.defender]};
      b.hands[side][key]--;b.used[side].push(key);b.played[side].push(key);
      const base=combatPower(pieces), reaction=reactionStrength(id,'targeting',1,pieces);
      const order=side==='attacker' && b.volley===0 ? b.options.tag==='alienAssault' && aliveCombatPieces(pieces).some(p=>p.type==='fleet') ? 2 : CARD_BY_TAG[b.options.tag]?.assault||0:0;
      results[side]={tactic:key,base,bonus:tactic.attack+reaction+order,shields:tactic.shield+reactionStrength(id,'prevent',2,pieces),pierce:!!tactic.pierce};
    }
    // Phase Lance: the opponent's shields prevent none of this side's hits.
    results.attacker.damage=Math.max(0,results.attacker.base+results.attacker.bonus-(results.attacker.pierce?0:results.defender.shields));
    results.defender.damage=Math.max(0,results.defender.base+results.defender.bonus-(results.defender.pierce?0:results.attacker.shields));
    for(const side of sides)if(b.silent?.[side]){const r=results[side==='attacker'?'defender':'attacker'];r.preventedByRelic=r.damage;r.damage=0;}
    b.silent={};
    b.destroyedCount+=applyCombatHits(b.attackerPieces,results.defender.damage).length+applyCombatHits(b.defenderPieces,results.attacker.damage).length;
    const number=b.volley+1;
    b.volleys.push({number,...results});
    b.summary.push(`Volley ${number}: ${sides.map(side=>{const r=results[side],enemy=results[side==='attacker'?'defender':'attacker'];return `${state.players[b[`${side}Id`]].name} revealed ${MILITARY_CARDS[r.tactic].name}: ${r.base} base + ${r.bonus} bonus − ${r.pierce?`0 shields (pierced ${enemy.shields})`:`${enemy.shields} shields`} = ${r.damage} damage${r.preventedByRelic?` (${r.preventedByRelic} prevented by The Silent Hour)`: ''}`;}).join('; ')}.`);
    b.volley++;
    syncCombatPieces(b.attackerId,b.coord,b.attackerPieces);syncCombatPieces(b.defenderId,b.coord,b.defenderPieces);
    appendHistory(b.summary[b.summary.length-1],{kind:'combat-volley',coordinate:b.coord,volley:number,results:clone(results)});
    if (!aliveCombatPieces(b.attackerPieces).length || !aliveCombatPieces(b.defenderPieces).length || b.volley>=3) {finishCombat();return;}
    if (b.options.tag!=='overdrive' && combatPower(b.attackerPieces)<combatPower(b.defenderPieces)*.55 && useReaction(b.attackerId,'jump')) {
      b.destroyedCount+=applyCombatHits(b.attackerPieces,1).length;
      b.summary.push(`${state.players[b.attackerId].name} made an Emergency Jump and suffered one extra hit.`);
      finishCombat();return;
    }
    b.commitments={attacker:null,defender:null};
  }

  function applyCombatAction(seat,action) {
    const match=combatActions(seat).find(legal=>sameRelicCommand(legal,action));
    if (!match) return false;
    const b=state.pendingCombat, side=combatSide(seat);
    if(action.type==='combat_relic'){useBattleRelic(seat,action);render();saveGame();scheduleCombatAi();return true;}
    if(action.type==='combat_continue'){b[b.stage==='opening'?'relicDone':'aftermathDone'][side]=true;advanceBattleRelics();render();saveGame();scheduleCombatAi();return true;}
    appendHistory(`${state.players[seat].name} chose ${action.type==='combat_tactic'?MILITARY_CARDS[action.tactic].name:action.type==='combat_escape'?'Explorer escape':'to stay for combat'}.`,{kind:'combat-choice',actor:seat,action:clone(action),coordinate:b.coord,volley:b.volley+1});
    if (action.type==='combat_tactic') {
      b.commitments[side]=action.tactic;
      if (b.commitments.attacker!==null && b.commitments.defender!==null) resolveCombatVolley();
    } else {
      if (action.type==='combat_escape') {
        state.players[seat].resources.energy-=action.amount;
        if (b.escapedUnits) b.escapedUnits[side]+=action.amount;
        let count=action.amount;
        b[`${side}Pieces`]=b[`${side}Pieces`].filter(piece=>!(piece.type==='explorer' && count-->0));
        const destination=ensureFleet(action.destination,seat);destination.explorer+=action.amount;
        syncCombatPieces(seat,b.coord,b[`${side}Pieces`]);revealClusterAt(action.destination,seat);
        b.summary.push(`${state.players[seat].name} paid ${action.amount} Energy to escape with ${action.amount} Explorer${action.amount===1?'':'s'} to ${nameForCoord(action.destination)}.`);
      }
      b.escapeDone[side]=true;
      if (!aliveCombatPieces(b.attackerPieces).length || !aliveCombatPieces(b.defenderPieces).length) finishCombat();
      else if (b.escapeDone.attacker && b.escapeDone.defender) b.stage='tactic';
    }
    render();saveGame();scheduleCombatAi();
    return true;
  }

  // This chooser accepts the same sanitized view as an external policy. It
  // cannot consult a hidden opponent commitment, regular hand, or draw order.
  function chooseCombatAction(view,actions) {
    if (!view || !actions.length) return null;
    const me=view.sides[view.side],enemy=view.sides[view.side==='attacker'?'defender':'attacker'];
    const alive=side=>side.pieces.filter(p=>p.damage<p.hull), power=side=>alive(side).reduce((n,p)=>n+p.power,0), hull=side=>alive(side).reduce((n,p)=>n+p.hull-p.damage,0);
    const relics=actions.filter(a=>a.type==='combat_relic');
    const weight=t=>{const c=MILITARY_CARDS[t];return (c?.attack||0)+(c?.shield||0)*.85+(c?.pierce?3:0)+(c?.victoryPrestige||0);};
    const worth=a=>a.ability==='crown'?30:a.ability==='horizon'||a.ability==='phoenix'?Object.entries(a.units).reduce((n,[type,count])=>n+count*(type==='fleet'?10:type==='settler'?5:3),0):a.ability==='eclipse'?weight(a.tactic)*2:a.ability==='silent'?power(enemy)>0?20:0:a.ability==='warsong'?weight(a.tactic)-Math.max(0,...actions.filter(x=>x.type==='combat_tactic').map(x=>weight(x.tactic))):0;
    const bestRelic=relics.sort((a,b)=>worth(b)-worth(a))[0];
    if(bestRelic&&worth(bestRelic)>0)return bestRelic;
    if(view.stage==='opening'||view.stage==='aftermath')return actions.find(a=>a.type==='combat_continue');
    actions=actions.filter(a=>a.type!=='combat_relic');
    if (view.stage==='escape') {
      const exits=actions.filter(a=>a.type==='combat_escape');
      if (exits.length && (power(enemy)>=hull(me) || alive(me).every(p=>p.type==='explorer'))) return exits.sort((a,b)=>b.amount-a.amount)[0];
      return actions.find(a=>a.type==='combat_stay');
    }
    const score=action=>{
      const card=MILITARY_CARDS[action.tactic];
      const enemyFire=2-enemy.used.filter(key=>key==='concentratedFire').length, enemyScreen=2-enemy.used.filter(key=>key==='defensiveScreen').length;
      const probability=enemyFire/(enemyFire+enemyScreen), shield=(1-probability)*2;
      const dealt=Math.max(0,power(me)+card.attack-(card.pierce?0:shield)), received=Math.max(0,power(enemy)+probability-card.shield);
      return dealt-received*.75+(dealt>=hull(enemy)?8:0)-(received>=hull(me)?10:0)+(view.volley===3 && view.side==='defender'?card.shield:0);
    };
    return [...actions].sort((a,b)=>score(b)-score(a))[0];
  }

  function runAiCombat() {
    const seat=combatActor();
    if (seat===null || seat===ME) return;
    const action=chooseCombatAction(combatView(seat),combatActions(seat));
    if (action) applyCombatAction(seat,action);
  }

  function scheduleCombatAi() {
    if (headless || !state.pendingCombat) return;
    clearTimeout(aiTimer);
    const battle=state.pendingCombat,seat=combatActor(),stage=battle.stage,volley=battle.volley;
    if (seat===ME || seat===null) return;
    aiTimer=setTimeout(()=>{
      aiTimer=null;
      if (options.paused?.()) {scheduleCombatAi();return;}
      if (state.pendingCombat!==battle || combatActor()!==seat || battle.stage!==stage || battle.volley!==volley) return;
      runAiCombat();
    },600);
  }

  // Rules #combat: the four basic tactics plus every card in the faction's military deck.
  function tacticHand(playerId) {
    const hand = { ...BASIC_TACTIC_HAND };
    for (const card of state.players[playerId].military || []) hand[card.key] = (hand[card.key] || 0) + 1;
    return hand;
  }

  function resolveCombat(attackerId, coord, origin, options = {}) {
    const defenderId = findDefender(coord,attackerId);
    if (defenderId === null || state.pendingCombat) return;
    const planet=state.planets[coord];
    state.pendingCombat={attackerId,defenderId,coord,origin,options:clone(options),
      attackerPieces:combatPieces(attackerId,coord,false),
      defenderPieces:combatPieces(defenderId,coord,Boolean(planet && planet.owner===defenderId && planet.upgrade==='starbase'),true),
      hands:{attacker:tacticHand(attackerId),defender:tacticHand(defenderId)},
      used:{attacker:[],defender:[]},commitments:{attacker:null,defender:null},escapeDone:{attacker:false,defender:false},escapedUnits:{attacker:0,defender:0},
      stage:'opening',relicDone:{attacker:false,defender:false},volley:0,summary:[],volleys:[],destroyedCount:0};
    advanceBattleRelics();
    if (!state.pendingCombat)return;
    if (!state.pendingCombat.attackerPieces.length || !state.pendingCombat.defenderPieces.length) finishCombat();
    else {render();saveGame();scheduleCombatAi();}
  }

  function performMoveOrder(playerId,source,destination,card,options={}) {
    if (state.pendingConstruct || state.pendingCombat || state.pendingMove || state.phase!=='operations' || state.activePlayer!==playerId || overflowPlayer()>=0 || !state.players[playerId].hand.some(c=>c.id===card?.id) || ALL_CARDS[card.key].order!=='move') return false;
    const moving=moveSelection(getFleet(source,playerId),options);
    if (!moving) return false;
    const route=movementRoutes(source,playerId,movementRange(moving,card),avoidsHostile(options.tag)).get(destination);
    if(!route)return false;
    state.pendingMove={playerId,source,destination,cardId:card.id,movementCost:route.cost,portalCrossings:route.portals,message:source===destination?`${state.players[playerId].name} spent Move to stay at ${nameForCoord(source)}${hostileAt(source,playerId)?' and fight again':''}.`:`${state.players[playerId].name} moved ${formatFleet(moving)} from ${nameForCoord(source)} to ${nameForCoord(destination)}${route.portals?' via the corner portal (2 movement to cross)':''}.`};
    removeHandCard(state.players[playerId],card.id);
    drawStarterBonus(playerId,card);
    executeMove(playerId,source,destination,{...options,units:moving});
    finishMoveOrder();
    return true;
  }

  // Life price and Settler use of a colonize order (rules #orders, #cards).
  function colonyTerms(tag, capture) {
    const def = CARD_BY_TAG[tag];
    if (tag === 'alienGenesis') return { biomass: 0, keepSettler: true, prestige: 0 };
    if (def) return { biomass: Math.min(def.colonyCost ?? COLONY_LIFE_COST, capture ? 1 : COLONY_LIFE_COST), keepSettler: !!def.keepSettler, prestige: def.colonyPrestige || 0 };
    return { biomass: capture ? 1 : COLONY_LIFE_COST, keepSettler: false, prestige: 0 };
  }

  // A capture's escort (rules #combat): at least one of your Fleets on the enemy center.
  function captureFleetAt(coord, playerId) {
    return (getFleet(coord,playerId)?.fleet || 0) > 0;
  }

  // Whether your Settler and Fleet here could capture this enemy Colony center.
  function canCaptureAt(coord, playerId) {
    const planet = state.planets[coord];
    return !!planet && isColonySite(coord) && planet.owner !== null && planet.owner !== playerId
      && !hostileAt(coord,playerId) && getFleet(coord,playerId)?.settler > 0 && captureFleetAt(coord,playerId);
  }

  function colonizePlanet(playerId, coord, options = {}, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || !fleet || fleet.settler < 1 || !isColonySite(coord)) return false;
    const capture = planet.owner !== null && planet.owner !== playerId && !hostileAt(coord,playerId);
    if (planet.owner !== null && !capture) return false;
    // Rules #combat: a capture also needs one of your Fleets on the center; the Fleet stays.
    if (capture && !captureFleetAt(coord,playerId)) return false;
    if (planet.owner === null && hasBuilding(planet)) return false;
    const terms = colonyTerms(options.tag, capture);
    const cost = { biomass: terms.biomass };
    if (!canAfford(player,cost)) return false;
    if (dryRun) return true;
    payCost(player,cost);
    if (!terms.keepSettler) fleet.settler -= 1;
    if (terms.prestige) { player.cardPrestige = (player.cardPrestige || 0) + terms.prestige; logEvent(`${player.name} gained ${terms.prestige} permanent Prestige from ${CARD_BY_TAG[options.tag].name}.`); }
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    if (capture) {
      planet.owner = playerId;
      if (options.tag === 'alienGenesis') addResources(player,{matter:2});
      planet.hasColony = true;
      planet.upgrade = null;
      planet.upgradeLevel = 0;
      planet.conquest = true;
      logEvent(`${player.name} captured ${planet.name}.`);
    } else {
      planet.owner = playerId;
      planet.originalFounder = playerId;
      if (options.tag === 'alienGenesis') addResources(player,{matter:2});
      planet.hasColony = true;
      planet.conquest = false;
      logEvent(`${player.name} colonized ${planet.name}.`);
    }
    return true;
  }

  function countPlacedShips(playerId,type) {
    return Object.values(state.fleets).reduce((sum,group)=>sum+(group[playerId]?.[type]||0),0);
  }

  function canPlaceShip(playerId,type) {
    const limits = { settler:8, explorer:5, fleet:10 };
    return countPlacedShips(playerId,type) < limits[type];
  }

  function buildUpgrade(playerId, coord, type, discountMatter = 0, dryRun = false, discountResource = null, fullCost = false) {
    if (!STRUCTURES[type]) return false;
    const player = state.players[playerId];
    const planet = state.planets[coord];
    if (!planet || (planet.type==='moon' && type!=='starbase')) return false;
    if (!canBuildStructureAt(playerId,coord,type)) return false;
    const cost = discountedCost(STRUCTURES[type].cost,discountResource);
    if (!canAfford(player,cost,0,discountMatter)) return false;
    if (dryRun) return true;
    payCost(player,cost,0,discountMatter);
    if (planet.owner !== playerId) {
      planet.owner = playerId;
      planet.originalFounder = null;
      planet.conquest = false;
    }
    planet.hasColony = false;
    planet.upgrade = type;
    planet.upgradeLevel = 1;
    if (type==='starbase' && !player.initialShipyardCoord) player.initialShipyardCoord=coord;
    return true;
  }

  function remainingRelicSites() {
    return state.clusters.map(cluster=>({cluster,coord:relicCoordInCluster(cluster)}))
      .filter(site=>site.coord&&!state.planets[site.coord].relicClaimed);
  }

  function probeStatus(playerId) {
    const sites=remainingRelicSites();
    if (!sites.length) return 'none_remaining';
    return sites.some(site=>!relicKnown(site.cluster,playerId)) ? 'available' : 'all_discovered';
  }

  function probeUnavailableMessage(playerId = ME) {
    const status=network ? state.probeStatus : probeStatus(playerId);
    return status==='all_discovered' ? 'You have already discovered all remaining relics. Your card and action are kept.'
      : status==='none_remaining' ? 'No relics remain. Your card and action are kept.'
      : 'No new relic can be located right now. Your card and action are kept.';
  }

  function nearestProbeRelic(playerId, source) {
    return remainingRelicSites().filter(site=>!relicKnown(site.cluster,playerId))
      .sort((a,b)=>hexDistance(source,a.coord)-hexDistance(source,b.coord)||a.cluster.id-b.cluster.id)[0]||null;
  }

  function probeRelic(playerId, coord, cardId, dryRun = false) {
    const player=state.players[playerId];
    if (!player?.hand.some(c=>c.id===cardId&&c.key==='probe') || !boardHas(coord) || !getFleet(coord,playerId)?.explorer
      || player.passed || state.phase!=='operations' || state.activePlayer!==playerId || state.winner!==null || state.pendingCombat
      || state.pendingConstruct || state.pendingColonyBuild || state.pendingConsortium || overflowPlayer()>=0) return false;
    const site=nearestProbeRelic(playerId,coord);
    if (!site) { if(!dryRun&&!headless&&playerId===ME)toast(probeUnavailableMessage(playerId)); return false; }
    if (dryRun) return true;
    if(!site.cluster.scannedBy.includes(playerId))site.cluster.scannedBy.push(playerId);
    // 36.41 #orders: Probe keeps the combined card in play; only excavation trashes it.
    removeHandCard(player,cardId);
    completeAction(playerId,`${player.name} used Probe from an Explorer to privately locate its closest undiscovered relic. The combined card stays in play until cleanup.`);
    if (!headless&&playerId===ME) toast(`Relic signal located at ${site.coord}.${probeStatus(playerId)==='all_discovered' ? ' You have now discovered all remaining relics.' : ''}`);
    return true;
  }

  function excavate(playerId, coord, cardId, relicId, dryRun = false) {
    const player=state.players[playerId], planet=state.planets[coord];
    const card=player?.hand.find(item=>item.id===cardId && ['probe','excavate'].includes(item.key));
    const index=state.relicRow.findIndex(item=>item.id===relicId);
    if (!card || index<0 || state.phase!=='operations' || state.activePlayer!==playerId || state.winner!==null
      || state.pendingConstruct || state.pendingColonyBuild || state.pendingConsortium || overflowPlayer()>=0
      || !planet || planet.special!=='relic' || planet.relicClaimed || !relicKnown(state.clusters[planet.cluster],playerId) || !getFleet(coord,playerId)?.explorer
      || !canAfford(player,EXCAVATION_COST)) return false;
    if (dryRun) return true;
    payCost(player,EXCAVATION_COST);
    const fleet=getFleet(coord,playerId);
    fleet.explorer-=1;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    const [relic]=state.relicRow.splice(index,1);
    gainCard(player,relic);
    if (state.relicDeck.length) state.relicRow.splice(index,0,state.relicDeck.pop());
    planet.special=null; planet.relicClaimed=true;
    player.relicsExcavated+=1;
    removeHandCard(player,cardId,'trash');
    completeAction(playerId,`${player.name} excavated a relic at ${planet.name}, chose ${ALL_CARDS[relic.key].name} for discard, and gained 2 Prestige. One Explorer was consumed and Excavate was trashed.`);
    return true;
  }

  function contextExcavate(coord, relicId) {
    if (state.pendingCombat) return;
    if (state.actionMode!=='excavate') return;
    if (!excavate(ME,coord,state.actionCardId,relicId)) toast('Excavation needs your Explorer, an available relic card, and 1 Energy, 3 Data.');
  }

  function buildShip(playerId, coord, type, discountEnergy = 0, dryRun = false, discountResource = null) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || planet.owner !== playerId) return false;
    if (type === 'explorer' ? !canLaunchExplorer(playerId,coord) : planet.upgrade !== 'starbase') return false;
    if (!canPlaceShip(playerId,type) || !canAfford(player,discountedCost(SHIP_STATS[type].cost,discountResource),0,0,discountEnergy)) return false;
    if (dryRun) return true;
    payCost(player,discountedCost(SHIP_STATS[type].cost,discountResource),0,0,discountEnergy);
    ensureFleet(coord,playerId)[type] += 1;
    // 36.41: an Explorer brings one combined Probe / Excavate card.
    const bundled=type==='settler'?['colonize']:type==='explorer'?['probe']:[];
    for (const key of bundled) gainCard(player,makeCard(key));
    if (hostileAt(coord,playerId)) resolveCombat(playerId,coord,coord);
    if (bundled.length) logEvent(`${player.name} commissioned ${SHIP_STATS[type].name} and gained ${bundled.map(key=>BASIC_CARDS[key].name).join(' and ')} in discard.`);
    return true;
  }

  function contextBuild(kind, coord) {
    if (state.pendingCombat || state.actionMode!=='construct' || state.activePlayer!==ME)return;
    if(state.pendingConstruct) {if(!finishConstruct(ME,coord,kind))toast('That second build is not legal or affordable.');return;}
    const card=state.players[ME].hand.find(c=>c.id===state.actionCardId);
    if(!performConstructOrder(ME,coord,kind,card))toast('That build is not legal or affordable.');
  }

  function contextColonize(coord) {
    if (state.pendingCombat) return;
    if (state.actionMode !== 'colonize' || state.activePlayer !== ME) return;
    const card=state.players[ME].hand.find(c=>c.id===state.actionCardId);
    if (!applyColonizeOrder(ME,coord,card)) toast('You need an eligible Settler on the world’s center hex and the required resources.');
  }



  // `reserve` (rivals only) steers give-types away from funds kept for the next unit; it never blocks a plan.
  function bankPlanForCost(player, cost, reserve = {}) {
    const resources = {...player.resources}, plan = [];
    if (RESOURCES.some(r=>(cost[r]||0)>player.resourceLimits[r])) return null;
    const spare = type => resources[type] - (cost[type] || 0);
    for (const getType of RESOURCES) {
      while (resources[getType] < (cost[getType] || 0)) {
        const givers = [...RESOURCES].filter(type => type !== getType && spare(type) >= bankTradeRate(player.id,type));
        const keepsReserve = givers.filter(type => spare(type) - (reserve[type] || 0) >= bankTradeRate(player.id,type));
        const giveType = (keepsReserve.length ? keepsReserve : givers)
          .sort((a,b) => bankTradeRate(player.id,a)-bankTradeRate(player.id,b) || spare(b) - (reserve[b] || 0) - (spare(a) - (reserve[a] || 0)) || spare(b) - spare(a))[0];
        if (!giveType) return null;
        resources[giveType] -= bankTradeRate(player.id,giveType); resources[getType]++;
        plan.push({giveType,getType});
      }
    }
    return plan;
  }

  function aiCards(playerId) {
    const p=state.players[playerId];
    // Order inside an owned pile never participates in a policy decision.
    return [...p.hand,...p.deck,...p.discard,...p.inPlay];
  }

  function aiCompareCoords(a, b, playerId) {
    const [hq,hr]=parseCoord(aiHomeCluster(playerId)?.center||'-9,0');
    const orient=key=>{const [q,r]=parseCoord(key);return hq<0?[q,r]:hr<0?[r,q]:hq>0?[-q,-r]:[-r,-q];};
    const [aq,ar]=orient(a),[bq,br]=orient(b);return aq-bq||ar-br;
  }

  function aiOrderCount(playerId, order) {
    return aiCards(playerId).filter(c=>ALL_CARDS[c.key].order===order).length;
  }

  function aiRelicsRemain() {
    return state.relicRow.length>0;
  }

  function aiInvestmentHorizon() {
    const leader=Math.max(...state.players.map((_,id)=>calculatePrestige(id)));
    const pace=Math.max(2,(leader-3)/Math.max(1,state.round-1));
    return Math.max(0,Math.min(6,Math.ceil((victoryTarget()-leader)/pace)));
  }

  // Protect a concrete scoring/defense opportunity, rather than reserving a full
  // excavation payment indefinitely for an Explorer many turns from any known site.
  function aiImmediateProtection(playerId) {
    const p=state.players[playerId],keep={matter:0,energy:0,biomass:0,data:0};
    const colony=findColonizeTarget(playerId);
    if(colony&&aiCards(playerId).some(c=>ALL_CARDS[c.key].order==='colonize'))keep.biomass=state.planets[colony].owner===null?COLONY_LIFE_COST:1;
    if(Object.entries(state.planets).some(([coord,planet])=>planet.special==='relic'&&!planet.relicClaimed&&getFleet(coord,playerId)?.explorer&&relicKnown(state.clusters[planet.cluster],playerId)))Object.assign(keep,EXCAVATION_COST,{biomass:keep.biomass});
    if(aiColonyDefense(playerId).some(d=>d.needed>0))RESOURCES.forEach(r=>{keep[r]=Math.max(keep[r],SHIP_STATS.fleet.cost[r]||0);});
    if(!controlledPlanets(playerId).some(([,planet])=>planet.upgrade==='starbase'))Object.assign(keep,STRUCTURES.starbase.cost);
    return keep;
  }

  function aiStorageProtection(playerId) {
    if (!controlledPlanets(playerId).some(([,p])=>p.upgrade==='starbase')) return {...STRUCTURES.starbase.cost};
    const settlers=countPlacedShips(playerId,'settler'),explorers=countPlacedShips(playerId,'explorer');
    if (!settlers&&!explorers) return {...SHIP_STATS.settler.cost};
    return {matter:explorers?(EXCAVATION_COST.matter||0):0,energy:explorers?(EXCAVATION_COST.energy||0):0,biomass:settlers?COLONY_LIFE_COST:0,data:explorers?(EXCAVATION_COST.data||0):0};
  }

  function aiStorageBudget(playerId, extraGain = {}) {
    const leader=Math.max(...state.players.map((_,id)=>calculatePrestige(id)));
    if (leader>=victoryTarget()) return null;
    const cost=storageUpgradeCost(playerId),income=aiIncome(playerId),limits=resourceLimits(playerId);
    const production=RESOURCES.reduce((n,r)=>n+income[r],0);
    const pressure=RESOURCES.reduce((n,r)=>n+Math.max(0,state.players[playerId].resources[r]+income[r]+(extraGain[r]||0)-limits[r]),0);
    const horizon=Math.min(4,Math.max(1,Math.ceil((victoryTarget()-leader)/4)));
    const value=Math.min(STORAGE_UPGRADE.capacity,pressure)*horizon;
    if (value<=RESOURCES.reduce((n,r)=>n+cost[r],0)) return null;
    return {cost,protection:aiStorageProtection(playerId),production,pressure,horizon,value};
  }

  function aiReserves(playerId) {
    const yards=controlledPlanets(playerId).some(([,p])=>p.upgrade==='starbase');
    const base=yards?{matter:2,energy:2,biomass:countPlacedShips(playerId,'settler')?COLONY_LIFE_COST:(SHIP_STATS.settler.cost.biomass||0),data:aiRelicsRemain()?(EXCAVATION_COST.data||0):1}:{matter:6,energy:2,biomass:SHIP_STATS.settler.cost.biomass||0,data:1};
    // Save toward the target market card, up to current limits (31.36 Capacity Cards).
    const target=yards&&state.market?aiTargetCard(playerId):null;
    if (target) {
      const cost=ALL_CARDS[target.key].cost,limits=resourceLimits(playerId),needsRoom=RESOURCES.some(r=>(cost[r]||0)>limits[r]);
      const price=storageUpgradeCost(playerId).matter;
      RESOURCES.forEach(r=>{base[r]=Math.min(limits[r],Math.max(base[r]||0,cost[r]||0,needsRoom?price:0));});
    }
    const plan=aiStorageBudget(playerId);
    if (!plan) return Object.fromEntries(RESOURCES.map(r=>[r,Math.min(base[r]||0,resourceLimits(playerId)[r])]));
    const desired=Object.fromEntries(RESOURCES.map(r=>[r,plan.cost[r]+(plan.protection[r]||0)]));
    const reserve=Object.fromEntries(RESOURCES.map(r=>[r,Math.max(base[r],desired[r])]));
    if (RESOURCES.every(r=>reserve[r]<=resourceLimits(playerId)[r])) return reserve;
    if (RESOURCES.every(r=>desired[r]<=resourceLimits(playerId)[r])) return desired;
    return Object.fromEntries(RESOURCES.map(r=>[r,Math.min(base[r]||0,resourceLimits(playerId)[r])]));
  }

  function aiStorageAllocation(playerId, points, extraGain = {}, payment = {}) {
    const player=state.players[playerId],limits=resourceLimits(playerId),income=aiIncome(playerId),protection=aiStorageProtection(playerId);
    const allocation=Object.fromEntries(RESOURCES.map(r=>[r,0]));
    const nextPrice=storageUpgradeCost(playerId).matter;
    for(let n=0;n<points;n++) {
      const score=r=>{
        const limit=limits[r]+allocation[r],need=player.resources[r]-(payment[r]||0)+(extraGain[r]||0)+income[r]*2-limit;
        const nextPayment=Math.max(0,nextPrice+(protection[r]||0)-limit);
        return (nextPayment>0?100:0)+Math.min(1,Math.max(0,need))*10+income[r]/(limit+1)+1/(limit+1);
      };
      const resource=[...RESOURCES].sort((a,b)=>score(b)-score(a)||RESOURCES.indexOf(a)-RESOURCES.indexOf(b))[0];allocation[resource]++;
    }
    return allocation;
  }

  function aiOverflowAmounts(resources, limits) {
    return Object.fromEntries(RESOURCES.map(r=>[r,Math.max(0,resources[r]-limits[r])]));
  }

  function aiFundingPlan(player, exceptCardId, desiredCost) {
    const limits=resourceLimits(player.id);
    if (RESOURCES.some(r=>(desiredCost[r]||0)>limits[r])) return null;
    const cards=player.hand.filter(c=>c.id!==exceptCardId&&canConvertCard(c)),gains=cards.map(conversionGain);
    const retention=cards.map(card=>{
      const def=ALL_CARDS[card.key],order=def.order;
      if (def.effect?.draw>=2) return 8;
      if (card.starter && starterLevel(card)===3) return 1;
      if (order==='colonize'&&findColonizeTarget(player.id))return 6;
      if (order==='excavate'||order==='probe')return 3;
      if (order==='move'&&cards.filter(c=>ALL_CARDS[c.key].order==='move').length===1)return 2;
      return 0;
    });
    let frontier=[{funds:{...player.resources},available:cards.map((_,i)=>i),steps:[],penalty:0}];
    const seen=new Set();
    const key=node=>RESOURCES.map(r=>node.funds[r]).join(',')+'|'+node.available.join(',');
    const rank=node=>RESOURCES.reduce((n,r)=>n+Math.max(0,(desiredCost[r]||0)-node.funds[r]),0)*20+node.penalty+node.steps.length*.1;
    for(let depth=0;depth<=cards.length+8 && frontier.length;depth++) {
      const next=[];
      for(const node of frontier) {
        if (canAfford({resources:node.funds},desiredCost)) return {steps:node.steps,cards:node.steps.filter(s=>s.type==='convert').map(s=>s.card),bank:node.steps.filter(s=>s.type==='bank')};
        for(const index of node.available) {
          const funds={...node.funds};RESOURCES.forEach(r=>funds[r]=Math.min(limits[r],funds[r]+(gains[index][r]||0)));
          if(RESOURCES.every(r=>funds[r]===node.funds[r]))continue;
          const candidate={funds,available:node.available.filter(i=>i!==index),steps:[...node.steps,{type:'convert',card:cards[index].id}],penalty:node.penalty+retention[index]};
          const marker=key(candidate);if(!seen.has(marker)){seen.add(marker);next.push(candidate);}
        }
        for(const giveType of RESOURCES) if(node.funds[giveType]>=bankTradeRate(player.id,giveType)) for(const getType of RESOURCES) {
          if(getType===giveType||node.funds[getType]>=(desiredCost[getType]||0)||node.funds[getType]>=limits[getType])continue;
          const funds={...node.funds,[giveType]:node.funds[giveType]-bankTradeRate(player.id,giveType),[getType]:node.funds[getType]+1};
          const candidate={funds,available:node.available,steps:[...node.steps,{type:'bank',giveType,getType}],penalty:node.penalty+bankTradeRate(player.id,giveType)/8};
          const marker=key(candidate);if(!seen.has(marker)){seen.add(marker);next.push(candidate);}
        }
      }
      frontier=next.sort((a,b)=>rank(a)-rank(b)).slice(0,48);
    }
    return null;
  }

  function aiIncome(playerId) {
    const income=Object.fromEntries(RESOURCES.map(r=>[r,0]));
    for (const [coord,p] of Object.entries(state.planets)) if (RESOURCES.includes(p.type)) {
      if (p.owner===playerId) income[p.type]+=ownerProductionAmount(p);
      if (fleetControllersAt(coord).includes(playerId)) income[p.type]++;
    }
    return income;
  }

  // Enumerate the six legal three-volley sequences from the fixed four-card hand.
  // This uses public base pieces only: reactions and enemy commitments stay private.
  const aiBattleCache = new Map();
  function aiBattleEstimate(attacking, defending, yard = false) {
    const key = JSON.stringify([attacking.settler||0,attacking.explorer||0,attacking.fleet||0,defending.settler||0,defending.explorer||0,defending.fleet||0,yard]);
    if (aiBattleCache.has(key)) return aiBattleCache.get(key);
    const pieces=(group,defense)=>Object.keys(SHIP_STATS).flatMap(type=>Array.from({length:group[type]||0},()=>({type,power:SHIP_STATS[type].power,hull:defense?(SHIP_STATS[type].defendingHull||SHIP_STATS[type].hull):SHIP_STATS[type].hull,damage:0})));
    const sequences=[[0,0,1],[0,1,0],[0,1,1],[1,0,0],[1,0,1],[1,1,0]]; // 0=Fire, 1=Screen.
    let wins=0,losses=0;
    for (const a of sequences) for (const d of sequences) {
      const own=pieces(attacking,false),other=pieces(defending,true);
      if (yard) other.push({type:'starbase',power:3,hull:3,damage:0});
      for (let volley=0;volley<3&&combatPower(own)&&combatPower(other);volley++) {
        const out=Math.max(0,combatPower(own)+(a[volley]?0:1)-(d[volley]?2:0));
        const incoming=Math.max(0,combatPower(other)+(d[volley]?0:1)-(a[volley]?2:0));
        applyCombatHits(other,out);applyCombatHits(own,incoming);
      }
      if (combatPower(own)>0 && !combatPower(other)) wins++;
      if (!combatPower(own)) losses++;
    }
    const result={win:wins/36,loss:losses/36};aiBattleCache.set(key,result);return result;
  }

  function aiCanFight(playerId, moving, target) {
    const defender=findDefender(target,playerId);
    if (defender===null) return true;
    const other=state.fleets[target]?.[defender]||{},p=state.planets[target];
    const yard=p?.owner===defender&&p.upgrade==='starbase';
    const estimate=aiBattleEstimate(moving,other,yard);
    // A Settler needs an escort that reliably survives; avoid speculative attacks.
    return estimate.win>=.85 && estimate.loss===0;
  }

  function aiThreat(playerId, moving, destination, source = null) {
    const own={...moving},standing=destination===source?{}:state.fleets[destination]?.[playerId]||{};
    for (const type of Object.keys(SHIP_STATS)) own[type]=(own[type]||0)+(standing[type]||0);
    const p=state.planets[destination],yard=p?.owner===playerId&&p.upgrade==='starbase';
    let risk=0;
    for (const [at,groups] of Object.entries(state.fleets)) for (const [owner,enemy] of Object.entries(groups)) {
      if (+owner===playerId || !enemy.fleet) continue;
      // Move II is public card content, but an opponent's current hand is not.
      const range=3; // An enemy Fleet can leave its slower Settlers behind.
      if (travelDistance(at,destination)>range) continue;
      const attacker=fleetGroup(enemy,'ships'),estimate=aiBattleEstimate(attacker,own,yard);
      risk=Math.max(risk,estimate.win);
    }
    return risk;
  }

  // Public approaches to Colony centers, rather than only enemies near a Shipyard.
  function aiColonyDefense(playerId) {
    return colonyPlanets(playerId).map(([coord])=>{
      let attackers=0;
      for (const [at,groups] of Object.entries(state.fleets)) for (const [owner,enemy] of Object.entries(groups)) {
        if (+owner!==playerId && enemy.fleet && travelDistance(at,coord)<=3) attackers=Math.max(attackers,enemy.fleet);
      }
      const guards=state.fleets[coord]?.[playerId]?.fleet||0;
      return {coord,attackers,guards,needed:attackers?Math.max(0,attackers+1-guards):0};
    });
  }

  function aiPath(source,goal,playerId,moving,cannotAttack,maxStep=Infinity,routeCache=null) {
    // A route tree covers every destination for this exact group and movement rule.
    // The caller owns the cache for one unchanged decision, never across actions.
    const cacheKey=routeCache&&JSON.stringify([source,playerId,...Object.keys(SHIP_STATS).map(type=>moving[type]||0),Boolean(cannotAttack),maxStep]);
    let routes=routeCache?.get(cacheKey);
    if(!routes){
      routes=travelSearch(source,coord=>movementEdges(coord,playerId).filter(edge=>edge.cost<=maxStep),Infinity,
        next=>!hostileAt(next,playerId)||!cannotAttack&&aiCanFight(playerId,moving,next));
      routeCache?.set(cacheKey,routes);
    }
    if(!routes.has(goal))return null;
    const path=[];for(let at=goal;at!==source;at=routes.get(at).previous)path.unshift(at);
    return path;
  }
  function pathMovementCost(source,path) {
    let cost=0,previous=source;
    for(const next of path){cost+=portalExit(previous)===next?PORTAL_MOVEMENT_COST:1;previous=next;}
    return cost;
  }

  function aiStockpile(playerId) {
    const p=state.players[playerId];
    const before=new Set(p.hand.map(c=>c.id));
    for (const card of p.hand.filter(canConvertCard)) {
      let reserve=aiReserves(playerId);
      const gain=conversionGain(card),def=ALL_CARDS[card.key];
      if (def.reaction || def.buyEffect) continue;
      if (!RESOURCES.some(r=>(gain[r]||0)>0&&p.resources[r]<reserve[r])) continue;
      aiManageStorage(playerId,gain);reserve=aiReserves(playerId);
      convertCard(playerId,card.id);
      if (overflowPlayer()===playerId) discardOverflow(playerId,aiOverflowAmounts(p.resources,resourceLimits(playerId),reserve));
    }
    return p.hand.some(c=>!before.has(c.id));
  }

  // A concrete trade from held stock; production arriving next round cannot fund it.
  // Public/own information only. A goal is legal except for its payment; no state is changed.
  function aiTradeGoals(playerId) {
    const p=state.players[playerId],goals=[];
    if(!p||state.activePlayer!==playerId||state.winner!==null||state.pendingCombat||state.pendingCombatReport||state.pendingMove||state.pendingColonyBuild||state.pendingConsortium)return goals;
    if(state.phase==='operations'&&!p.passed&&!state.pendingConstruct){
      for(const [coord,planet] of Object.entries(state.planets)){
        const group=getFleet(coord,playerId);if(!group)continue;
        const capture=planet.owner!==null&&planet.owner!==playerId&&!hostileAt(coord,playerId);
        if(group.settler&&isColonySite(coord)&&(planet.owner===null&&!hasBuilding(planet)||capture&&captureFleetAt(coord,playerId))){
          for(const card of p.hand.filter(c=>ALL_CARDS[c.key].order==='colonize')){
            const terms=colonyTerms(ALL_CARDS[card.key].tag,capture);
            goals.push({kind:'colonize',coord,key:card.key,cost:{biomass:terms.biomass},priority:150+terms.prestige*3});
          }
        }
        if(group.explorer&&relicKnown(state.clusters[planet.cluster],playerId)&&planet.special==='relic'&&!planet.relicClaimed&&state.relicRow.length&&p.hand.some(c=>['probe','excavate'].includes(c.key)))goals.push({kind:'excavate',coord,cost:{...EXCAVATION_COST},priority:145});
      }
    }
    if(state.phase==='operations'&&!p.passed&&(state.pendingConstruct||aiConstructCard(p))){
      for(const build of chooseAiBuild(playerId,true).filter(b=>b.score>=28))goals.push({kind:'build',build:build.kind,coord:build.coord,cost:build.cost,priority:85+Math.min(85,build.score)*.3});
    }
    if(state.pendingConstruct)return goals;
    if(controlledPlanets(playerId).some(([,planet])=>planet.upgrade==='starbase')){
      const keep=aiImmediateProtection(playerId);
      for(const card of marketOffers()){
        const value=aiBuyValue(playerId,card.key),def=ALL_CARDS[card.key];
        goals.push({kind:'market',key:card.key,utility:value,cost:purchaseCost(p,card.key),keep,priority:70+Math.min(60,value)*.25+(def.gainPrestige||0)*4});
      }
      if(state.capacitySupply>0&&!aiUnplayedModules(playerId)&&aiInvestmentHorizon()>=3&&(aiStorageBudget(playerId)||(()=>{const target=aiTargetCard(playerId);return target&&RESOURCES.some(r=>(purchaseCost(p,target.key)[r]||0)>resourceLimits(playerId)[r]);})()))goals.push({kind:'capacity',cost:storageUpgradeCost(playerId),keep,priority:80});
    }
    return goals;
  }

  function aiGoalTradePlan(playerId) {
    const p=state.players[playerId],limits=resourceLimits(playerId),income=aiIncome(playerId),rates=Object.fromEntries(RESOURCES.map(r=>[r,bankTradeRate(playerId,r)]));
    const canEnable=p.hand.some(c=>canPlayExchange(playerId,c.id));
    let best=null;
    for(const goal of aiTradeGoals(playerId)){
      if(goal.kind==='market'&&goal.utility<18)continue;
      const budget=Object.fromEntries(RESOURCES.map(r=>[r,(goal.cost[r]||0)+((goal.cost[r]||0)>0?(goal.keep?.[r]||0):Math.min(goal.keep?.[r]||0,p.resources[r]))]));
      if(RESOURCES.some(r=>budget[r]>limits[r]))continue;
      for(const enable of [null,...(canEnable?RESOURCES.filter(r=>rates[r]>2):[])]){
        const funds={...p.resources},plan=[],trial={...rates,...(enable?{[enable]:2}:{})};let lost=0;
        for(const get of RESOURCES){
          while(funds[get]<budget[get]){
            const give=RESOURCES.filter(r=>r!==get&&funds[r]-budget[r]>=trial[r]).sort((a,b)=>trial[a]-trial[b]||Math.max(0,funds[b]+income[b]-limits[b])-Math.max(0,funds[a]+income[a]-limits[a])||funds[b]-budget[b]-(funds[a]-budget[a]))[0];
            if(!give)break;
            funds[give]-=trial[give];funds[get]++;lost+=trial[give]-1;plan.push({giveType:give,getType:get});
          }
        }
        if(RESOURCES.some(r=>funds[r]<budget[r])||enable&&!plan.some(t=>t.giveType===enable))continue;
        const score=goal.priority-lost*1.5-plan.length*2-(enable?3:0);
        if(!best||score>best.score)best={goal,score,enable,steps:plan};
      }
    }
    return best;
  }

  function aiExchangeResource(playerId) {
    return aiGoalTradePlan(playerId)?.enable||null;
  }
  function aiTryExchange(playerId) {
    const card=state.players[playerId].hand.find(c=>ALL_CARDS[c.key].effect?.bankRate),resource=card&&aiExchangeResource(playerId);
    return Boolean(resource&&resolveHumanSpecial(card,ALL_CARDS[card.key],playerId,resource));
  }

  function maxBotLate(playerId) {
    return state.players[playerId].strategy==='maxbot' && (state.round>=10
      || Math.max(...state.players.map((_,id)=>calculatePrestige(id)))>=victoryTarget()*.65);
  }

  function maxBotWarehouse(playerId) {
    return aiCards(playerId).some(c=>c.key==='foldedWarehouse');
  }

  function aiCardUtility(playerId, key) {
    const p=state.players[playerId],def=ALL_CARDS[key],cards=aiCards(playerId),effect=def.effect||{};
    const horizon=Math.max(1,Math.min(5,Math.ceil((victoryTarget()-Math.max(...state.players.map((_,id)=>calculatePrestige(id))))/5)));
    const fallbackDraw=def.fallbackDraw||0,draw=Math.max(effect.draw||def.orderDraw||(def.tag==='alienEchoes'?3:0),fallbackDraw),fleets=countPlacedShips(playerId,'fleet');
    const acquisition=Math.min(1,Math.max(0,horizon-Math.ceil(p.deck.length/5))/horizon);
    const drawValue=acquisition*draw*(7+Math.min(cards.length,18)*.25)*Math.min(1,horizon/2);
    let value=6+(def.gainPrestige||0)*9+(effect.prestige||0)*Math.min(4,horizon)*8;
    value+=drawValue;
    if(effect.bankRate){const income=aiIncome(playerId);value-=cards.filter(c=>ALL_CARDS[c.key].effect?.bankRate).length*10;value+=Math.max(...RESOURCES.map(r=>RESOURCES.some(get=>get!==r&&p.resources[get]+income[get]*2<resourceLimits(playerId)[get])?Math.min(3,Math.max(0,Math.min(resourceLimits(playerId)[r],p.resources[r]+income[r]*2)-2)/2):0))*4*Math.min(3,horizon*5/Math.max(5,cards.length));}
    if (effect.limits) value+=RESOURCES.reduce((n,r)=>n+Math.min(2,effect.limits[r]||0),0)*1.5;
    if (def.order==='construct') value+=aiOrderCount(playerId,'construct')<3?15:5;
    if (def.order==='move') value+=countPlacedShips(playerId,'settler')+countPlacedShips(playerId,'explorer')+fleets?aiOrderCount(playerId,'move')<4?12:3:0;
    const uses=Math.min(3,horizon*5/Math.max(5,cards.length));
    if(def.order==='move')value+=(def.range||0)*2+(fleets?Math.min(4,def.assault||0)*2:0);
    if(def.order==='construct'&&def.buildDiscount)value+=(def.buildDiscount==='free'?8:6)*uses*acquisition+(def.secondBuild?3:0);
    if (def.order==='colonize') {
      const opportunities=state.clusters.some(c=>c.kind==='world'&&state.planets[c.center].owner!==playerId);
      let colonyValue=!opportunities||!countPlacedShips(playerId,'settler')?-15:Math.max(0,16-aiOrderCount(playerId,'colonize')*8);
      if(opportunities&&countPlacedShips(playerId,'settler'))colonyValue+=((def.keepSettler?6:0)+Math.max(0,COLONY_LIFE_COST-(def.colonyCost??COLONY_LIFE_COST))*2+(def.colonyPrestige||0)*6)*uses;
      value+=fallbackDraw?Math.max(0,colonyValue-drawValue):colonyValue;
    }
    if(def.buyEffect&&horizon>1){const saving=Math.max(0,...marketOffers().filter(c=>c.key!==key&&!ALL_CARDS[c.key].buyEffect).map(c=>RESOURCES.filter(r=>(ALL_CARDS[c.key].cost[r]||0)>0).length));value+=saving*Math.min(3,(horizon-1)*5/Math.max(5,cards.length))*2;}
    if(effect.limits){const income=aiIncome(playerId),limits=resourceLimits(playerId);value+=RESOURCES.reduce((n,r)=>n+Math.min(effect.limits[r]||0,Math.max(0,p.resources[r]+income[r]*horizon-limits[r]))*2,0)*acquisition;}
    if(effect.trashSelf)value+=4*acquisition;
    if(def.tag==='alienSignals'&&aiRelicsRemain())value+=24;
    if(def.relicAbility){const bonus={echoes:28,warsong:fleets?28:8,compass:countPlacedShips(playerId,'explorer')&&aiRelicsRemain()?28:2,horizon:fleets?24:8,keepers:28,reservoir:12,hourglass:28,crown:fleets?40:12,phoenix:fleets?32:8,worldseed:state.clusters.some(c=>c.kind==='world'&&state.planets[c.center].owner===null)?45:0,silent:fleets?35:8,gravity:24,eclipse:fleets?32:8,oracle:32};value+=(bonus[def.relicAbility]||0)*acquisition;}
    if (def.military) {
      if (!fleets) return -20;
      const power=c=>(c.attack||0)+(c.shield||0)*.8+(c.pierce?2:0)+(c.victoryPrestige||0)*1.5;
      const current=p.military.map(c=>power(ALL_CARDS[c.key])).sort((a,b)=>b-a);
      const improvement=power(def)-(current[2]||1);
      value=10+improvement*5+(p.strategy==='military'?4:0);
      if (current.length>=3&&improvement<=0) value-=18;
    } else {
      const owned=cards.filter(c=>c.key===key).length;
      value-=owned*(draw>=2?9:12);
      if (!draw&&!def.gainPrestige) value-=Math.max(0,cards.length-10)*1.3;
      if (horizon===1&&!def.gainPrestige) value-=15;
    }
    if(p.strategy==='maxbot') {
      if(key==='foldedWarehouse'&&!maxBotWarehouse(playerId))value+=80;
      if(def.gainPrestige)value+=maxBotLate(playerId)?30:5;
      if(effect.draw>=2 && cards.filter(c=>ALL_CARDS[c.key].effect?.draw>=2).length>=2)value-=20;
      if(effect.bankRate && cards.some(c=>ALL_CARDS[c.key].effect?.bankRate))value-=25;
    }
    return value;
  }

  // Value useful effects and opportunity cost, not a high price in itself.
  function aiBuyValue(playerId, key) {
    const p=state.players[playerId],def=ALL_CARDS[key];
    if (!def?.cost || !controlledPlanets(playerId).some(([,planet])=>planet.upgrade==='starbase')) return -1;
    const income=aiIncome(playerId),limits=resourceLimits(playerId);
    let value=aiCardUtility(playerId,key);
    value-=RESOURCES.reduce((n,r)=>n+(def.cost[r]||0)*(.5+1/(income[r]+1))+Math.max(0,(def.cost[r]||0)-limits[r])*3,0);
    const favored={market:['Economy','Capacity','Deckcraft','Buy','Industry'],military:['Military','Movement'],economy:['Economy','Capacity','Deckcraft','Buy','Industry'],expansion:['Expansion','Movement','Capacity']}[p.strategy]||[];
    if (favored.includes(def.kind)) value+=3;
    return value;
  }

  // The market card a rival is saving toward: its best-valued card, if any is worth buying.
  function aiTargetCard(playerId) {
    const p=state.players[playerId],income=aiIncome(playerId),limits=resourceLimits(playerId);
    return marketOffers().map(card=>{
      const cost=purchaseCost(p,card.key),room=RESOURCES.reduce((n,r)=>n+Math.max(0,(cost[r]||0)-limits[r]),0);
      const saving=Math.max(...RESOURCES.map(r=>Math.max(0,(cost[r]||0)-p.resources[r])/Math.max(.5,income[r])));
      const delay=saving+(room?Math.ceil(room/4)*2:0);
      return {card,score:aiBuyValue(playerId,card.key)/(1+delay*.55)};
    }).filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score||a.card.id.localeCompare(b.card.id))[0]?.card||null;
  }

  // Rules #rival-cards: during its own Buy a rival buys a Capacity Module toward the limits
  // its target card needs, unless it already holds an unplayed one.
  function aiCapacityForTarget(playerId) {
    const target=aiTargetCard(playerId);
    if (!target || aiUnplayedModules(playerId) || aiInvestmentHorizon()<3) return false;
    const cost=purchaseCost(state.players[playerId],target.key),limits=resourceLimits(playerId);
    if (!RESOURCES.some(r=>(cost[r]||0)>limits[r])) return false;
    const p=state.players[playerId],moduleCost=storageUpgradeCost(playerId),keep=aiImmediateProtection(playerId);
    return RESOURCES.every(r=>p.resources[r]-(moduleCost[r]||0)>=Math.min(keep[r]||0,p.resources[r]))&&buyCapacity(playerId);
  }

  function aiUseResources(player, exceptCardId, desiredCost = {}) {
    const plan=aiFundingPlan(player,exceptCardId,desiredCost);
    if (!plan) return false;
    for (const step of plan.steps) {
      if(step.type==='bank') {if(!bankTrade(player.id,step.giveType,step.getType))return false;continue;}
      const card=player.hand.find(c=>c.id===step.card);
      convertCard(player.id,card.id);
    }
    return canAfford(player,desiredCost);
  }

  function findColonizeTarget(playerId) {
    return Object.keys(state.planets).find(coord => {
      const planet = state.planets[coord];
      const fleet = getFleet(coord,playerId);
      return isColonySite(coord) && fleet?.settler > 0 && ((planet.owner === null && !hasBuilding(planet)) || canCaptureAt(coord,playerId));
    }) || null;
  }

  function aiHomeCluster(playerId) {
    // The original home stays fixed through conquest and is independent of seat order.
    return state.clusters.slice(0,4).find(cluster=>state.planets[cluster.center]?.originalFounder===playerId)
      || state.clusters[HOME_STARTS.find(start=>start.owner===playerId)?.cluster];
  }

  function aiInitialShipyard(playerId) {
    return aiHomeCluster(playerId)?.coords.slice(1).sort((a,b)=>hexDistance(a,'0,0')-hexDistance(b,'0,0'))[0];
  }

  function aiMovementNeighbors(coord, playerId) {
    const home=aiHomeCluster(playerId);
    const [hq,hr]=parseCoord(home?.center || ['-1,0','0,-1','1,0','0,1'][playerId]);
    const physical=hq<0?0:hr<0?1:hq>0?2:3;
    const transform=([q,r])=>physical===0?[q,r]:physical===1?[r,q]:physical===2?[-q,-r]:[-r,-q];
    const [q,r]=parseCoord(coord);
    return DIRECTIONS.map(transform).map(([dq,dr])=>coordKey(q+dq,r+dr)).filter(boardHas);
  }

  // Best Construct card in hand: a free build, then -1 of each (with a second build), then Construct II.
  function aiConstructCard(player) {
    const rank=c=>({free:3,each:2}[ALL_CARDS[c.key].buildDiscount]||0)+(c.upgraded?1:0)+(c.key==='construct'&&c.starter&&starterLevel(c)===3?.1:0);
    return player.hand.filter(c=>ALL_CARDS[c.key].order==='construct').sort((a,b)=>rank(b)-rank(a))[0]||null;
  }

  function chooseAiBuild(playerId, goalsOnly = false) {
    const p=state.players[playerId],military=p.strategy==='military'||maxBotLate(playerId),economy=['economy','market','maxbot'].includes(p.strategy),expansion=['expansion','maxbot'].includes(p.strategy),maxbot=p.strategy==='maxbot';
    const yards=controlledPlanets(playerId).filter(([,p])=>p.upgrade==='starbase'),income=aiIncome(playerId);
    const horizon=aiInvestmentHorizon(),limits=resourceLimits(playerId);
    const targets={matter:Math.min(limits.matter,5),energy:Math.min(limits.energy,4),biomass:Math.min(limits.biomass,expansion?4:3),data:Math.min(limits.data,aiRelicsRemain()?4:3)},options=[];
    if(maxbot)for(const r of RESOURCES)targets[r]=Math.min(limits[r],r==='biomass'?6:8);
    const settlers=countPlacedShips(playerId,'settler'),explorers=countPlacedShips(playerId,'explorer'),fleets=countPlacedShips(playerId,'fleet');
    const defense=aiColonyDefense(playerId),enemyFleets=Math.max(0,...Object.values(state.fleets).flatMap(g=>Object.entries(g).filter(([id])=>+id!==playerId).map(([,f])=>f.fleet||0)));
    const colonyGoals=state.clusters.some(c=>c.kind==='world' && state.planets[c.center].owner!==playerId);
    for (const [coord,planet] of Object.entries(state.planets)) if (canBuildStructureAt(playerId,coord)) {
      const shortage=Math.max(0,targets[planet.type]-income[planet.type]);
      const useful=Math.min(planet.owner===playerId?1:HARVESTER_YIELD,Math.max(0,targets[planet.type]-income[planet.type]));
      const payback=useful*Math.max(0,horizon-1);
      options.push({kind:'harvester',coord,score:planet.type==='data'&&!income.data&&state.round<=2?53:shortage&&payback>=3?(maxbot?28:10)+shortage*(maxbot?3:7)+(economy?4:0):maxbot?-1:1});
      const localYard=maxbot&&clusterHasColony(playerId,planet.cluster)&&!yards.some(([,yard])=>yard.cluster===planet.cluster);
      const forward=yards.length<2 && colonyPlanets(playerId).some(([center])=>state.planets[center].cluster===planet.cluster) && yards.every(([y])=>hexDistance(y,coord)>6);
      if (canBuildStructureAt(playerId,coord,'starbase')) options.push({kind:'starbase',coord,score:!yards.length?50+(!p.initialShipyardCoord&&coord===aiInitialShipyard(playerId)? .1:0):localYard?58:forward?military?15:10:0});
    }
    for (const [coord] of yards) {
      const group=state.fleets[coord]?.[playerId]||{};
      if (canPlaceShip(playerId,'settler') && !group.settler && colonyGoals && settlers<(expansion?2:1)) options.push({kind:'settler',coord,score:settlers?22:32+(expansion?3:0)});
      if (aiRelicsRemain() && canPlaceShip(playerId,'explorer') && !group.explorer && explorers<1) options.push({kind:'explorer',coord,score:maxbot&&!maxBotWarehouse(playerId)?48:28+(economy?2:0)});
      const urgent=defense.filter(d=>d.needed>0&&travelDistance(coord,d.coord)<=6).sort((a,b)=>travelDistance(coord,a.coord)-travelDistance(coord,b.coord))[0];
      const desired=maxbot&&maxBotLate(playerId)?8:military?5:enemyFleets?Math.min(3,colonyPlanets(playerId).length):0;
      const alreadyStaging=urgent&&(group.fleet||0)>=urgent.attackers+1;
      if (canPlaceShip(playerId,'fleet') && (urgent&&!alreadyStaging||fleets<desired)) options.push({kind:'fleet',coord,score:urgent&&!alreadyStaging?85-travelDistance(coord,urgent.coord)*3:military?30:27});
    }
    const card=aiConstructCard(p),fundingByCost=new Map();
    if(goalsOnly)return options.map(build=>({...build,cost:constructionCost(playerId,build.coord,build.kind,!state.pendingConstruct&&card?ALL_CARDS[card.key].buildDiscount||null:null)}));
    for (const build of options) {
      build.discount=!state.pendingConstruct&&card?ALL_CARDS[card.key].buildDiscount||null:null;build.cost=constructionCost(playerId,build.coord,build.kind,build.discount);
      // Player, hand, excluded order, stock and limits stay fixed in this decision.
      const costKey=RESOURCES.map(r=>build.cost[r]||0).join(',');
      if(!fundingByCost.has(costKey))fundingByCost.set(costKey,aiFundingPlan(p,state.pendingConstruct?null:card?.id,build.cost));
      build.funding=fundingByCost.get(costKey);
    }
    const ranked=options.filter(b=>b.score>2).sort((a,b)=>b.score-a.score||aiCompareCoords(a.coord,b.coord,playerId));
    return (!yards.length?ranked[0]:ranked.find(b=>b.funding)||ranked[0])||null;
  }

  function nearestGoal(source, playerId, military) {
    const queue = [source];
    const came = new Map([[source,null]]);
    let goal = null;
    while (queue.length && !goal) {
      const current = queue.shift();
      const planet = state.planets[current];
      if (current !== source && planet && (military ? planet.owner !== null && planet.owner !== playerId : isColonySite(current) && planet.owner === null && !hasBuilding(planet))) { goal = current; break; }
      for (const next of aiMovementNeighbors(current,playerId)) if (!came.has(next)) { came.set(next,current); queue.push(next); }
    }
    if (!goal) return null;
    const path = [goal];
    while (came.get(path[0]) && came.get(path[0]) !== source) path.unshift(came.get(path[0]));
    return path;
  }

  function pathToCoord(source, goal, playerId) {
    const queue = [source];
    const came = new Map([[source,null]]);
    while (queue.length && !came.has(goal)) {
      const current = queue.shift();
      for (const next of aiMovementNeighbors(current,playerId)) if (!came.has(next)) { came.set(next,current); queue.push(next); }
    }
    if (!came.has(goal)) return null;
    const path = [goal];
    while (came.get(path[0]) && came.get(path[0]) !== source) path.unshift(came.get(path[0]));
    return path;
  }

  function chooseAiMove(playerId, card = {}, routeCache = new Map()) {
    const p=state.players[playerId],military=p.strategy==='military'||maxBotLate(playerId),expansion=['expansion','maxbot'].includes(p.strategy),economy=['economy','market','maxbot'].includes(p.strategy);
    const groups=Object.entries(state.fleets).filter(([,g])=>fleetCount(g[playerId]));
    const targets=[],defense=aiColonyDefense(playerId);
    const add=(source,moving,goal,value,moveGroup,cannotAttack)=>{
      if (source===goal) return;
      const range=movementRange(moving,card),path=aiPath(source,goal,playerId,moving,cannotAttack,range,routeCache);
      if (!path?.length) return;
      const segment=[];let spent=0,previous=source;
      for(const at of path){const cost=portalExit(previous)===at?PORTAL_MOVEMENT_COST:1;if(spent+cost>range)break;segment.push(at);spent+=cost;previous=at;if(hostileAt(at,playerId))break;}
      if(!segment.length)return;
      const destination=segment[segment.length-1],pathCost=pathMovementCost(source,path);
      const risk=moveGroup==='ships'?aiThreat(playerId,moving,destination,source):0;
      const current=moveGroup==='ships'?aiThreat(playerId,moving,source,source):0;
      if (moving.settler && risk>.6 && risk>=current) return;
      const home=defense.find(d=>d.coord===source&&d.attackers),remaining=(state.fleets[source]?.[playerId]?.fleet||0)-(moving.fleet||0);
      const abandon=home&&remaining<home.attackers+1&&home.guards>=home.attackers+1?80:0;
      targets.push({source,destination,moveGroup,units:fleetGroup(moving,moveGroup),score:value-2*Math.ceil(pathCost/range)+(pathCost<=range?4:0)-risk*(moving.settler?55:35)-abandon,goal});
    };
    for (const [source,g] of groups) {
      const f=g[playerId],ships=fleetGroup(f,'ships'),explorers=fleetGroup(f,'explorer');
      // 33.38 #movement: Fleets may leave their Settlers behind, but only Settlers that are
      // safe on their own; with no Settler here the hunters are simply all the Fleets.
      const settlersSafe=f.settler && f.fleet && aiThreat(playerId,{settler:f.settler,explorer:0,fleet:0},source,source)<=.3;
      // 34.39 #combat: on an enemy center this group can capture, one Fleet stays with the Settler.
      const guard=f.settler && canCaptureAt(source,playerId) ? 1 : 0;
      const hunters=f.fleet>guard && (!f.settler || guard || settlersSafe) ? {settler:0,explorer:0,fleet:f.fleet-guard} : null;
      const danger=aiThreat(playerId,ships,source,source);
      if (f.fleet) for (const d of defense.filter(d=>d.needed&&d.coord!==source)) {
        const held=defense.find(x=>x.coord===source&&x.attackers),spare=held?Math.max(0,f.fleet-held.attackers-1):f.fleet;
        if (!spare) continue;
        add(source,{settler:0,explorer:0,fleet:Math.min(spare,d.needed)},d.coord,100,'ships',false);
      }
      if (fleetCount(ships) && danger>.6) {
        // Retreat is a normal Move. Prefer a defended hex or merging with allies.
        for (const destination of reachableFrom(source,playerId,movementRange(ships,card),false,ships)) {
          if (hostileAt(destination,playerId) || aiThreat(playerId,ships,destination,source)>=danger-.3) continue;
          const allied=state.fleets[destination]?.[playerId]?.fleet||0;
          const owned=state.planets[destination]?.owner===playerId;
          add(source,ships,destination,63+allied*3+(owned?3:0),'ships',true);
        }
      }
      if (hunters) for (const [at,other] of groups) {
        const ally=other[playerId];
        if (at===source || !(ally.fleet||ally.settler)) continue;
        const enemies=Object.entries(state.fleets).flatMap(([coord,fs])=>Object.entries(fs).filter(([id,x])=>+id!==playerId&&x.fleet).map(([,x])=>({coord,fleet:x.fleet})));
        const needsMass=enemies.some(x=>x.fleet>=(f.fleet||0));
        const escort=ally.settler && aiThreat(playerId,ally,at,at)>.3;
        if (escort || needsMass && ally.fleet && !ally.settler) add(source,hunters,at,escort?52:military?39:32,'ships',true);
      }
      if (f.settler && !(isColonySite(source) && (state.planets[source].owner===null||canCaptureAt(source,playerId)))) {
        for (const c of state.clusters.filter(c=>c.kind==='world')) {
          const planet=state.planets[c.center];
          if (planet.owner===playerId || planet.owner===null&&hasBuilding(planet)) continue;
          const capture=planet.owner!==null;
          // A capture needs a Fleet on the center too: one moving with the Settler or already waiting there.
          if (capture && !ships.fleet && !captureFleetAt(c.center,playerId)) continue;
          if (capture && !military && calculatePrestige(planet.owner)<victoryTarget()*.8 && state.clusters.some(w=>w.kind==='world'&&state.planets[w.center].owner===null)) continue;
          if (groups.some(([at,other])=>at!==source&&other[playerId].settler&&travelDistance(at,c.center)<travelDistance(source,c.center))) continue;
          add(source,ships,c.center,42+(expansion?5:0)+(capture?military?8:2:0),'ships',avoidsHostile(card.tag||ALL_CARDS[card.key]?.tag));
        }
      } else if (hunters) {
        for (const [at,other] of Object.entries(state.fleets)) {
          const enemy=Object.entries(other).find(([id,fleet])=>+id!==playerId&&fleetCount(fleet));if (!enemy) continue;
          const [owner,fleet]=enemy,canEscape=fleet.explorer && state.players[owner].resources.energy>=fleet.explorer;
          if (canEscape || !aiCanFight(playerId,hunters,at)) continue;
          add(source,hunters,at,military?39:29,'ships',avoidsHostile(card.tag||ALL_CARDS[card.key]?.tag));
        }
        if (countPlacedShips(playerId,'settler')) for (const c of state.clusters.filter(c=>c.kind==='world'&&state.planets[c.center].owner!==null&&state.planets[c.center].owner!==playerId&&state.planets[c.center].occupiedBy!==playerId)) {
          add(source,hunters,c.center,military?26:22,'ships',avoidsHostile(card.tag||ALL_CARDS[card.key]?.tag));
        }
      }
      if (f.explorer && aiRelicsRemain()) {
        const here=state.planets[source];
        if (here?.special==='relic' && relicKnown(state.clusters[here.cluster],playerId)) continue;
        const known=state.clusters.filter(c=>relicKnown(c,playerId)).map(relicCoordInCluster).filter(Boolean);
        const goals=known;
        for (const goal of goals) {
          if (groups.some(([at,other])=>at!==source&&other[playerId].explorer&&travelDistance(at,goal)<travelDistance(source,goal))) continue;
          add(source,explorers,goal,known.length?(p.strategy==='maxbot'&&!maxBotWarehouse(playerId)?56:economy?44:39):29,'explorer',true);
        }

      }
    }
    return targets.filter(t=>t.score>0).sort((a,b)=>b.score-a.score||aiCompareCoords(a.source,b.source,playerId)||aiCompareCoords(a.goal,b.goal,playerId))[0]||null;
  }

  function aiPlayCard(player, card) {
    removeHandCard(player,card.id);
  }

  function runAiOperation() {
    if (!headless || options.browserPolicy !== true) {
      if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;
    } else if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;
    if (overflowPlayer()>=0) return;
    // Learn to play: the rivals hold still so each lesson's position stays as staged.
    if (TUTORIAL) { passOperations(state.activePlayer); return; }
    if (state.pendingRelic) {runAiRelic(state.activePlayer,true);return;}
    if (state.pendingConsortium) {runAiConsortium();return;}
    if (state.pendingConstruct) {aiSecondConstruct(state.activePlayer);return;}
    if (state.pendingColonyBuild) {aiColonyBuild(state.activePlayer);return;}
    const id=state.activePlayer,p=state.players[id];
    aiManageStorage(id);
    if(aiTryExchange(id))return;
    const colonyRank=c=>{const t=colonyTerms(ALL_CARDS[c.key].tag,false);return (t.keepSettler?10:0)+t.prestige*3-t.biomass;};
    const colonize=p.hand.filter(c=>ALL_CARDS[c.key].order==='colonize').sort((a,b)=>colonyRank(b)-colonyRank(a))[0];
    const target=findColonizeTarget(id);
    if (colonize&&target) {
      const cost={biomass:colonyTerms(ALL_CARDS[colonize.key].tag,state.planets[target].owner!==null).biomass};
      if (aiUseResources(p,colonize.id,cost)&&applyColonizeOrder(id,target,colonize)) return;
    }
    // Pure-gain orders first: permanent Prestige, permanent capacity, and big draws.
    const boost=(p.strategy==='maxbot'&&p.hand.find(c=>c.key==='foldedWarehouse'))||p.hand.find(c=>{const effect=ALL_CARDS[c.key].effect;return effect&&(effect.prestige||effect.limits||effect.allocate||effect.draw>=2);});
    if (boost&&resolveCardEffect(id,boost,ALL_CARDS[boost.key],ALL_CARDS[boost.key].effect.allocate?aiModuleAllocation(id,ALL_CARDS[boost.key].effect.allocate):null)) return;
    const excavation=p.hand.find(c=>['probe','excavate'].includes(c.key));
    if (excavation) {
      const site=Object.entries(state.planets).find(([coord,planet])=>planet.special==='relic'&&state.fleets[coord]?.[id]?.explorer&&relicKnown(state.clusters[planet.cluster],id));
      if (site&&state.relicRow.length&&aiUseResources(p,excavation.id,EXCAVATION_COST)) {
        const affinity=p.strategy==='military'?'Military':p.strategy==='expansion'?'Exploration':'Settlement';
        const value=c=>aiCardUtility(id,c.key)+(RELIC_CARDS[c.key].affinity===affinity?3:0);
        const reward=[...state.relicRow].sort((a,b)=>value(b)-value(a)||a.id.localeCompare(b.id))[0];
        if (excavate(id,site[0],excavation.id,reward.id)) return;
      }
    }
    const probe=p.hand.find(c=>c.key==='probe');
    if (probe) {
      const origin=Object.keys(state.fleets).sort((a,b)=>aiCompareCoords(a,b,id)).find(coord=>probeRelic(id,coord,probe.id,true)&&!state.clusters.some(c=>relicKnown(c,id)&&relicCoordInCluster(c)));
      if (origin && probeRelic(id,origin,probe.id)) return;
    }
    if(runAiRelic(id))return;
    aiRespondToTrades(id);
    // These caches end before any card, payment or order changes the position.
    const moveCards=p.hand.filter(c=>ALL_CARDS[c.key].order==='move'),movePlans=new Map(),routeCache=new Map();
    const moves=moveCards.map(card=>{
      const key=JSON.stringify([card.key,Boolean(card.upgraded),card.tag||null]);
      if(!movePlans.has(key))movePlans.set(key,chooseAiMove(id,card,routeCache));
      return {card,move:movePlans.get(key)};
    }).filter(x=>x.move).sort((a,b)=>b.move.score-a.move.score),best=moves[0];
    const construct=aiConstructCard(p),build=construct&&chooseAiBuild(id);
    const moveNow=()=>best&&performMoveOrder(id,best.move.source,best.move.destination,best.card,{tag:ALL_CARDS[best.card.key].tag,moveGroup:best.move.moveGroup,units:best.move.units});
    if (best&&(!build?.funding||best.move.score>=build.score)&&moveNow()) return;
    if (build&&aiUseResources(p,construct.id,constructionCost(id,build.coord,build.kind,build.discount))&&performConstructOrder(id,build.coord,build.kind,construct)) {if(state.pendingConstruct)aiSecondConstruct(id);return;}
    if (best&&p.hand.some(c=>c.id===best.card.id)&&moveNow()) return;
    const special=p.hand.find(c=>!ALL_CARDS[c.key].relicAbility&&!ALL_CARDS[c.key].effect?.bankRate && ALL_CARDS[c.key].order==='special' && (RELIC_CARDS[c.key]||ALL_CARDS[c.key].effect));
    if (special) {
      if (ALL_CARDS[special.key].tag==='surge') {
        // Preserve the recorded AI-specific Surge effect while changing policy.
        const gain={};controlledPlanets(id).filter(([,p])=>true).slice(0,3).forEach(([,planet])=>{gain[planet.type]=(gain[planet.type]||0)+1;});
        const result=addResources(p,gain);aiPlayCard(p,special);completeAction(id,`${p.name} triggered an Industrial Surge.${overflowNote(result)}`);
      } else {const def=ALL_CARDS[special.key];resolveHumanSpecial(special,def,id,def.tag==='alienCradle'?aiStorageAllocation(id,RELIC_STORAGE_POINTS,{biomass:2}):def.effect?.allocate?aiModuleAllocation(id,def.effect.allocate):def.effect?.trashStarters?aiArchivePurgeChoice(id,def.effect.trashStarters):null);if (state.pendingConsortium)runAiConsortium();}
      return;
    }
    const alternateDraw=p.hand.find(c=>canOrderDraw(id,c.id));
    if(alternateDraw && p.deck.length+p.discard.length>0 && useOrderDraw(id,alternateDraw.id))return;
    // Use the draw-only order after useful builds and movement, then reassess next turn.
    const drawOnly=p.hand.find(c=>canConstructDraw(id,c.id));
    if(drawOnly && p.deck.length+p.discard.length>0 && useConstructDraw(id,drawOnly.id))return;
    if (aiStockpile(id)) {runAiOperation();return;}
    aiManageStorage(id);
    if (aiOfferTrade(id)) return;
    passOperations(id);
  }

  function startBuyPhase() {
    state.phase = 'buy';
    const player = state.players[state.activePlayer];
    player.buyStartDiscardIds = player.discard.map(card => card.id);
    player.buyStartInPlayIds = player.inPlay.map(card => card.id);
    player.buyStartHandIds = player.hand.map(card => card.id);
    clearAction();
    startBuyTurn();
  }

  function startBuyTurn() {
    turnSerial += 1;
    const player = state.players[state.activePlayer];
    state.turnStage = state.activePlayer === ME ? 'buy' : 'ai-buy';
    appendHistory(`${player.name} began a Buy turn.`,{kind:'turn',actor:state.activePlayer});
    if (state.activePlayer === ME) {
      captureHumanTurn(`Buy turn in Round ${state.round}`);
      if (!headless) switchTab('market');
    }
    render();
    saveGame();
    if (state.activePlayer === ME && autoSkipBuy()) return;
    if (state.activePlayer !== ME) scheduleAiTurn('buy', runAiBuy, 550);
  }

  function nextBuyPlayer() {
    if (state.phase !== 'buy' || overflowPlayer() >= 0) return;
    state.players[state.activePlayer].bankExchangeResources=[];
    state.phase = 'operations';
    nextOperationsPlayer();
  }

  function buyCard(playerId, source, indexOrKey) {
    const player = state.players[playerId];
    // 31.36: basic cards are not sold. Besides the market, the Upgrades tray sells Capacity Modules.
    if (source === 'capacity') return indexOrKey === 'capacityModule' && buyCapacity(playerId);
    if (!['market','catalog'].includes(source) || source==='catalog'&&!catalogMarketEnabled() || state.phase !== 'buy' || state.activePlayer !== playerId) return false;
    const card = source==='catalog'?marketOffers().find(c=>c.key===indexOrKey):state.market[indexOrKey];
    if (!card) return false;
    const definition = ALL_CARDS[card.key];
    if (!payCost(player,purchaseCost(player,card.key))) return false;
    // Rules #market: the bought slot refills in place from its own tier's deck, or stays empty.
    const refill = state.marketDecks[marketTier(card.key)], visible=state.market.findIndex(c=>c.id===card.id);
    if (visible>=0) { if (refill.length) state.market.splice(visible,1,refill.pop()); else state.market.splice(visible,1); }
    else { const at=refill.findIndex(c=>c.id===card.id); if(at<0)throw Error('Catalog stock changed');refill.splice(at,1); }
    // Rules #buy: a military card joins your military deck; any other card enters discard.
    if (definition.military) player.military.push(card);
    else gainCard(player,card);
    player.bought += 1;
    player.cardsPurchased = (player.cardsPurchased || 0) + 1;
    player.buyDiscountEach = 0;
    if (player.buyHubDiscounts > 0) player.buyHubDiscounts -= 1;
    if (definition.gainPrestige) player.cardPrestige = (player.cardPrestige || 0) + definition.gainPrestige;
    logEvent(`${player.name} acquired ${definition.name}${definition.military ? ' for its military deck' : ''}${definition.gainPrestige ? ` and gained ${definition.gainPrestige} permanent Prestige` : ''}.`);
    return true;
  }

  function applyBuyEffect(player, definition) {
    // #buy: purchases are unlimited; Procurement Hub discounts one purchase.
    if (definition.buyEffect === 'hubDiscount') player.buyHubDiscounts = (player.buyHubDiscounts || 0) + 1;
    if (definition.buyEffect === 'discountEach') player.buyDiscountEach = 1;
  }

  function useBuyEffect(cardId, playerId = 0) {
    const player = state.players[playerId];
    const card = player.hand.find(c=>c.id===cardId);
    const definition = card && ALL_CARDS[card.key];
    if (!definition?.buyEffect || state.phase !== 'buy' || state.activePlayer !== playerId) return;
    applyBuyEffect(player, definition);
    removeHandCard(player,card.id);
    logEvent(`${player.name} activated ${definition.name} during Buy.`);
    render(); saveGame();
  }

  // Rules #buy: trash a card that was in your hand, discard or in play when your Buy turn
  // began and is still there. Cards gained, drawn, discarded or put in play during this
  // Buy are ineligible. Saves from before hand trashing have no buyStartHandIds.
  const TRASH_PILES = ['discard','inPlay','hand'];
  const BUY_START_IDS = { discard: 'buyStartDiscardIds', inPlay: 'buyStartInPlayIds', hand: 'buyStartHandIds' };
  function trashEligible(player, card, pile) {
    return (player[BUY_START_IDS[pile]] || []).includes(card.id);
  }
  function trashEligibleCards(player) {
    return TRASH_PILES.flatMap(pile => player[pile].filter(card => trashEligible(player, card, pile)));
  }
  function decommission(playerId, cardId, resource) {
    const player = state.players[playerId];
    if (!player || overflowPlayer() >= 0 || !RESOURCES.includes(resource) || state.phase !== 'buy' || state.activePlayer !== playerId || player.resources[resource] < 3) return false;
    const pile = TRASH_PILES.find(name => player[name].some(card => card.id === cardId && trashEligible(player, card, name)));
    if (!pile) return false;
    const index = player[pile].findIndex(card => card.id === cardId);
    const [card] = player[pile].splice(index, 1);
    player.resources[resource] -= 3;
    logEvent(`${player.name} trashed ${ALL_CARDS[card.key].name} for 3 ${RESOURCE_NAMES[resource]}.`);
    return true;
  }

  function upgradeStarter(playerId,cardId,resource) {
    const player=state.players[playerId];
    if(!canManageResources(playerId)||state.activePlayer!==playerId||state.phase!=='buy'||!RESOURCES.includes(resource))return false;
    const card=[...player.hand,...player.discard,...player.inPlay].find(c=>c.id===cardId);
    if(!card?.starter||!['move','construct'].includes(card.key)||starterLevel(card)>=3||player.resources[resource]<upgradePrice(card))return false;
    const price=upgradePrice(card),level=starterLevel(card)+1;
    player.resources[resource]-=price;card.upgraded=true;card.level=level;
    logEvent(`${player.name} upgraded ${ALL_CARDS[card.key].name} to level ${level===3?'III':'II'} for ${price} ${RESOURCE_NAMES[resource]}.`);
    return true;
  }

  function runAiBuy() {
    if (TUTORIAL) { nextBuyPlayer(); return; }
    const id=state.activePlayer,p=state.players[id];
    while (aiTryExchange(id)) {}
    aiManageStorage(id);
    const reserve=aiReserves(id);
    for (const card of p.hand.filter(c=>ALL_CARDS[c.key].buyEffect)) {applyBuyEffect(p,ALL_CARDS[card.key]);removeHandCard(p,card.id);logEvent(`${p.name} activated ${ALL_CARDS[card.key].name} during Buy.`);}
    const surplus=()=>[...RESOURCES].sort((a,b)=>(p.resources[b]-reserve[b])-(p.resources[a]-reserve[a]));
    const yard=controlledPlanets(id).some(([,p])=>p.upgrade==='starbase');
    // Upgrade the real current level, including II -> III in hand, discard or play.
    const immediate=aiImmediateProtection(id);
    const preservesPayment=choice=>{
      if (!choice.bank) return false;
      const funds={...p.resources},cost=purchaseCost(p,choice.key);
      for (const trade of choice.bank) {funds[trade.giveType]-=bankTradeRate(id,trade.giveType);funds[trade.getType]+=1;}
      return RESOURCES.every(r=>funds[r]-(cost[r]||0)>=Math.min(immediate[r]||0,funds[r]));
    };
    const marketChoices=()=>marketOffers().map((card,index)=>({source:catalogMarketEnabled()?'catalog':'market',index,key:card.key})).map(x=>({...x,score:aiBuyValue(id,x.key),bank:bankPlanForCost(p,purchaseCost(p,x.key),immediate)})).filter(x=>x.score>0&&preservesPayment(x)).sort((a,b)=>b.score-a.score||a.bank.length-b.bank.length);
    const purchase=choice=>choice&&choice.bank.every(t=>bankTrade(id,t.giveType,t.getType))&&buyCard(id,choice.source,choice.source==='catalog'?choice.key:choice.index);
    const horizon=victoryTarget()-Math.max(...state.players.map((_,i)=>calculatePrestige(i)));
    const early=marketChoices()[0],marketFirst=['market','maxbot'].includes(p.strategy);
    const established=aiCards(id).some(c=>c.starter&&c.key==='construct'&&starterLevel(c)>=2);
    if(yard&&early&&(marketFirst?established&&early.score>=18:established&&early.score>=24))purchase(early);
    if(marketFirst&&established)aiCapacityForTarget(id);
    for(let n=0;yard&&n<(p.strategy==='maxbot'?2:4)&&horizon>3;n++) {
      const candidates=[...p.hand,...p.discard,...p.inPlay].filter(c=>c.starter&&starterLevel(c)<3);
      const rank=c=>starterLevel(c)===2?40:c.key==='construct'&&!aiCards(id).some(c=>c.key==='construct'&&c.upgraded)?45:c.key==='construct'?25:20;
      const upgrade=candidates.sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id)).find(c=>RESOURCES.some(r=>p.resources[r]>=upgradePrice(c)+(immediate[r]||0)));
      if(!upgrade)break;
      const resource=surplus().find(r=>p.resources[r]>=upgradePrice(upgrade)+(immediate[r]||0));
      if(!upgradeStarter(id,upgrade.id,resource))break;
    }
    // 31.36: then raise the limits the target market card needs (cheap starter upgrades come first).
    aiCapacityForTarget(id);
    while(state.market.length){while(aiTryExchange(id)){}const choice=marketChoices()[0];if(!purchase(choice))break;}
    for (let n=0;n<2;n++) {
      const cards=aiCards(id),moves=aiOrderCount(id,'move'),constructs=aiOrderCount(id,'construct'),colonize=aiOrderCount(id,'colonize'),excavateCount=aiOrderCount(id,'excavate');
      // #buy: trash candidates are cards in discard, in play or in hand when Buy began.
      const removable=trashEligibleCards(p).find(c=>BASIC_CARDS[c.key]&&!c.upgraded&&(c.key==='construct'?constructs>2:c.key==='move'?moves>6:c.key==='colonize'?colonize>Math.max(2,countPlacedShips(id,'settler')+1):c.key==='excavate'?!aiRelicsRemain()||excavateCount>Math.max(1,countPlacedShips(id,'explorer')+1):c.key==='probe'?!aiRelicsRemain()||aiOrderCount(id,'probe')>Math.max(1,countPlacedShips(id,'explorer')+1):false));
      const give=surplus().find(r=>p.resources[r]>=reserve[r]+3);
      if (!removable||!give||cards.length<=8) break;
      if (!decommission(id,removable.id,give)) break;
    }
    aiManageStorage(id);nextBuyPlayer();
  }

  function finishHumanBuy() {
    if (state.phase !== 'buy' || state.activePlayer !== ME || overflowPlayer() >= 0) return;
    completeHumanTurn();
    nextBuyPlayer();
  }

  function cleanupRound() {
    state.phase = 'cleanup';
    state.players.forEach(player => {
      player.discard.push(...player.hand,...player.inPlay);
      player.hand = [];
      player.inPlay = [];
    });
    finishRound();
  }



  // The resource directive must be answered before the round can end, so a closed or
  // reloaded dialog reopens instead of leaving the game parked in that phase.
  function resumePendingChoice() {
    if (state.winner !== null) return;
    renderCombat();scheduleCombatAi();
    renderOverflow();
    if (overflowPlayer() < 0 && state.pendingConsortium) renderConsortium();
  }



  // Rules #round: the next hand is drawn during Cleanup, so the step reads "Cleanup & draw".
  function phaseLabel(phase) {
    if (phase === 'cleanup' && state.winner === null) return 'Cleanup & draw';
    return phase[0].toUpperCase()+phase.slice(1);
  }

  function victoryTitle() {
    const name = state.players[state.winner].name;
    return name === 'You' ? 'You win' : `${name} wins`;
  }

  function finishRound() {
    state.phase = 'cleanup';
    const contenders = state.players.map((_,id)=>({id,prestige:calculatePrestige(id),colonies:colonyPlanets(id).length,resources:totalResources(state.players[id])})).filter(p=>p.prestige>=victoryTarget()).sort((a,b)=>b.prestige-a.prestige||b.colonies-a.colonies||b.resources-a.resources);
    if (contenders.length) {
      state.winner = contenders[0].id;
      logEvent(`${state.players[state.winner].name} won with ${contenders[0].prestige} Prestige at the end of Round ${state.round}.`);
      render(); saveGame();
      showMessage('GAME COMPLETE',victoryTitle(),`${contenders[0].prestige} Prestige (target ${victoryTarget()}) · ${contenders[0].colonies} Colonies · ${contenders[0].resources} stored resources. Rate the cards you played in the Card gallery (header) so the next set improves.`);
      return;
    }
    // Rules #round, Cleanup & draw: only a continuing game deals the next hands.
    state.players.forEach(player => drawCards(player, 5));
    logEvent('Every faction drew its next five cards.');
    state.round += 1;
    state.firstPlayer = (state.firstPlayer + 1) % 4;
    logEvent(`Round ${state.round-1} ended. The first-player marker rotated.`);
    beginRound();
  }

  function canManageResources(playerId) {
    if (state.pendingCombat || state.pendingRelic || state.pendingCombatReport || replayMode || overflowPlayer() >= 0 || state.pendingConsortium || state.winner !== null || !state.players[playerId]) return false;
    if (state.phase === 'buy') return true;
    return state.phase === 'operations' && (state.activePlayer!==playerId || headless || playerId!==ME || ['prep','action','bonus-build','construct-again'].includes(state.turnStage));
  }

  function storageUpgradeCost(playerId) {
    // Rules #capacity-module: every module costs 1 of each, regardless of stored modules.
    const price = 1;
    return Object.fromEntries(RESOURCES.map(resource => [resource,price]));
  }

  // Rules #storage-allocation: buy a Capacity Module on your own Buy turn. Market
  // discounts neither apply to it nor get used by it, and it never refills the market.
  function canBuyCapacity(playerId) {
    const player = state.players[playerId];
    return !!player && state.phase === 'buy' && state.activePlayer === playerId && !replayMode && overflowPlayer() < 0
      && !state.pendingCombat && state.winner === null && (state.capacitySupply || 0) > 0 && canAfford(player,storageUpgradeCost(playerId));
  }

  function buyCapacity(playerId) {
    if (!canBuyCapacity(playerId)) return false;
    const player = state.players[playerId];
    payCost(player,storageUpgradeCost(playerId));
    state.capacitySupply -= 1;
    gainCard(player,makeCard('capacityModule'));
    player.storagePurchases = (player.storagePurchases || 0) + 1;
    player.bought += 1;
    player.cardsPurchased = (player.cardsPurchased || 0) + 1;
    logEvent(`${player.name} bought a Capacity Module (${state.capacitySupply} left in the pile).`);
    return true;
  }

  // Capacity Modules a rival owns but has not played yet (hand, deck or discard).
  function aiUnplayedModules(playerId) {
    const player = state.players[playerId];
    return [...player.hand,...player.deck,...player.discard].filter(card=>card.key==='capacityModule').length;
  }

  // A rival buys one Capacity Module when its storage plan is worthwhile and it holds no
  // unplayed module; it plays the module from hand during Operations (runAiOperation).
  function aiManageStorage(playerId, extraGain = {}) {
    if (!canBuyCapacity(playerId) || aiUnplayedModules(playerId)) return false;
    const plan=aiStorageBudget(playerId,extraGain),player=state.players[playerId];
    if (!plan || !RESOURCES.every(r=>player.resources[r]-plan.cost[r]>=Math.min(player.resources[r],plan.protection[r]||0))) return false;
    return buyCapacity(playerId);
  }

  // Where a rival puts a played module's points: first toward the limits its target
  // market card needs, then by its usual storage pressure.
  function aiModuleAllocation(playerId, points = STORAGE_UPGRADE.capacity) {
    const target=aiTargetCard(playerId);
    const cost=target?purchaseCost(state.players[playerId],target.key):{},limits=resourceLimits(playerId);
    if (!RESOURCES.some(r=>(cost[r]||0)>limits[r])) return aiStorageAllocation(playerId,points);
    const allocation=Object.fromEntries(RESOURCES.map(r=>[r,0]));
    const fallback=aiStorageAllocation(playerId,1),spare=RESOURCES.find(r=>fallback[r])||'data';
    for (let n=0;n<points;n++) {
      const need=r=>(cost[r]||0)-limits[r]-allocation[r];
      const resource=[...RESOURCES].sort((a,b)=>need(b)-need(a)||RESOURCES.indexOf(a)-RESOURCES.indexOf(b))[0];
      allocation[need(resource)>0?resource:spare]++;
    }
    return allocation;
  }

  function discardResources(playerId, resource, amount) {
    if (state.activePlayer!==playerId || !canManageResources(playerId) || !RESOURCES.includes(resource) || !Number.isInteger(amount) || amount < 1) return false;
    const player = state.players[playerId];
    if (amount > player.resources[resource]) return false;
    player.resources[resource] -= amount;
    logEvent(`${player.name} discarded ${amount} ${RESOURCE_NAMES[resource]} to free storage.`);
    render(); saveGame();
    return true;
  }

  function bankTradeRate(playerId, resource) { return (state.players[playerId]?.bankExchangeResources||[]).includes(resource)?2:4; }

  function canBankTrade(playerId, giveType, getType) {
    return canManageResources(playerId) && RESOURCES.includes(giveType) && RESOURCES.includes(getType)
      && giveType !== getType && state.players[playerId].resources[giveType] >= bankTradeRate(playerId,giveType);
  }

  function bankTrade(playerId, giveType, getType) {
    if (!canBankTrade(playerId, giveType, getType)) return false;
    const player = state.players[playerId];
    // Each resource has its own limit; this gain may need an overflow choice.
    const rate=bankTradeRate(playerId,giveType);
    player.resources[giveType] -= rate;
    addResources(player,{[getType]:1});
    logEvent(`${player.name} exchanged ${rate} ${RESOURCE_NAMES[giveType]} for 1 ${RESOURCE_NAMES[getType]} with the bank.`);
    render(); saveGame();
    return true;
  }

  function canOfferTrade(playerId, terms) {
    const p = state.players[playerId];
    return !state.pendingCombat && !state.pendingRelic && state.chainedActions?.playerId!==playerId && !!p && state.winner === null && state.phase === 'operations' && state.activePlayer === playerId
      && !p.passed && !p.tradeUsed && !state.pendingConstruct && !state.pendingColonyBuild && !state.pendingConsortium && (headless || playerId !== ME || ['prep','action'].includes(state.turnStage))
      && RESOURCES.includes(terms.giveType) && RESOURCES.includes(terms.getType) && terms.giveType !== terms.getType
      && [terms.giveAmount,terms.getAmount].every(n=>Number.isInteger(n) && n>=1 && n<=5)
      && p.resources[terms.giveType] >= terms.giveAmount
      && state.players.some(other=>other.id!==playerId && !other.passed);
  }

  function offerTrade(playerId, terms) {
    if (!canOfferTrade(playerId,terms)) return false;
    const offer = {id:state.nextTradeOfferId++,from:playerId,round:state.round,status:'open',
      giveType:terms.giveType,giveAmount:terms.giveAmount,getType:terms.getType,getAmount:terms.getAmount,
      responses:state.players.map(p=>p.id===playerId?'author':p.passed?'passed':'pending')};
    state.tradeOffers.push(offer);
    state.tradeOffers = state.tradeOffers.slice(-40);
    state.players[playerId].tradeUsed = true;
    completeAction(playerId,`${state.players[playerId].name} offered ${offer.giveAmount} ${RESOURCE_NAMES[offer.giveType]} for ${offer.getAmount} ${RESOURCE_NAMES[offer.getType]} to all factions.`);
    return true;
  }

  function tradeResponseAllowed(playerId, offer) {
    return !state.pendingCombat && !state.pendingConsortium && !!offer && state.winner === null && state.phase === 'operations' && state.activePlayer === playerId
      && offer.status === 'open' && offer.round === state.round && offer.from !== playerId
      && offer.responses[playerId] === 'pending' && !state.players[playerId].passed;
  }

  function tradeBlockReason(playerId, offer) {
    if (!tradeResponseAllowed(playerId,offer)) return 'Respond during your Operations turn.';
    const from=state.players[offer.from], to=state.players[playerId];
    if (from.resources[offer.giveType]<offer.giveAmount) return 'The offering faction no longer has those resources.';
    if (to.resources[offer.getType]<offer.getAmount) return `You need ${offer.getAmount} ${RESOURCE_NAMES[offer.getType]} to accept.`;
    const fromAfter={...from.resources,[offer.giveType]:from.resources[offer.giveType]-offer.giveAmount,[offer.getType]:from.resources[offer.getType]+offer.getAmount};
    const toAfter={...to.resources,[offer.getType]:to.resources[offer.getType]-offer.getAmount,[offer.giveType]:to.resources[offer.giveType]+offer.giveAmount};
    if (RESOURCES.some(r=>resourceExcess(offer.from,fromAfter)[r]>0||resourceExcess(playerId,toAfter)[r]>0)) return 'The exchange would exceed a resource’s storage limit.';
    return '';
  }

  function respondTrade(playerId, id, response) {
    const offer=state.tradeOffers.find(o=>o.id===id);
    if (!tradeResponseAllowed(playerId,offer) || !['accept','reject'].includes(response)) return false;
    if (response==='accept') {
      if (tradeBlockReason(playerId,offer)) return false;
      const from=state.players[offer.from], to=state.players[playerId];
      // Recheck live balances, then settle once before any rendering or turn changes.
      from.resources[offer.giveType]-=offer.giveAmount; to.resources[offer.giveType]+=offer.giveAmount;
      to.resources[offer.getType]-=offer.getAmount; from.resources[offer.getType]+=offer.getAmount;
      offer.status='accepted'; offer.acceptedBy=playerId;
      from.tradesWith[playerId]++; to.tradesWith[offer.from]++;
      logEvent(`${to.name} accepted ${from.name}’s open offer.`);
    } else {
      logEvent(`${state.players[playerId].name} rejected ${state.players[offer.from].name}’s offer.`);
    }
    offer.responses[playerId]=response==='accept'?'accepted':'rejected';
    if (offer.status==='open' && !offer.responses.includes('pending')) offer.status='rejected';
    render(); saveGame();
    return true;
  }

  function cancelTrade(playerId, id) {
    if (state.pendingCombat) return false;
    const offer=state.tradeOffers.find(o=>o.id===id);
    if (state.pendingConsortium || !offer || offer.from!==playerId || offer.status!=='open' || state.activePlayer!==playerId || state.phase!=='operations') return false;
    offer.status='withdrawn'; logEvent(`${state.players[playerId].name} withdrew an offer.`);
    render(); saveGame(); return true;
  }

  function expireTrades() {
    for (const offer of state.tradeOffers) if (offer.status==='open') offer.status='expired';
  }

  function aiRespondToTrades(id) {
    for (const offer of state.tradeOffers) {
      if (!tradeResponseAllowed(id,offer)) continue;
      const p=state.players[id];
      const fair=offer.giveAmount*(p.resources[offer.giveType]<2?1.45:1)>=offer.getAmount*(p.resources[offer.getType]<2?1.4:1);
      respondTrade(id,offer.id,!tradeBlockReason(id,offer)&&fair?'accept':'reject');
    }
  }

  function aiOfferTrade(id) {
    const p=state.players[id];
    const giveType=RESOURCES.find(r=>p.resources[r]>=3);
    const getType=RESOURCES.find(r=>p.resources[r]<2 && state.players.some(o=>o.id!==id && !o.passed && o.resources[r]>=2));
    return giveType && getType && offerTrade(id,{giveType,getType,giveAmount:1,getAmount:1});
  }

  function submitTrade(event) {
    event.preventDefault();
    const terms={giveType:$('#trade-give-type').value,getType:$('#trade-get-type').value,
      giveAmount:Number($('#trade-give-amount').value),getAmount:Number($('#trade-get-amount').value)};
    $('#trade-response').textContent=offerTrade(ME,terms)
      ?'Offer published. Other factions can respond on their turns. First acceptance completes the trade.'
      :'Choose different resources and whole amounts from 1 to 5 that you can supply. Publish during your action, once per round.';
  }

  function showMessage(kicker,title,body) {
    if (headless) return;
    $('#message-kicker').textContent = kicker;
    $('#message-title').textContent = title;
    $('#message-body').textContent = body;
    const dialog = $('#message-dialog');
    if (!dialog.open) dialog.showModal();
  }

  function toast(message, cost = null, suffix = '') {
    if (headless) return;
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role','status');
    if (cost) node.innerHTML = `<span>${message}</span>${resourceDots(cost)}${suffix ? `<span>${suffix}</span>` : ''}`;
    else node.textContent = message;
    document.body.appendChild(node);
    setTimeout(()=>node.remove(),2600);
  }

  function boardIcon(type, count = 1) {
    // Hex labels already announce each unit's type and quantity. Keep the
    // separate visual badges from concatenating into a false label like "22".
    return `<span class="board-icon" aria-hidden="true">${BOARD_ICONS[type]}${count > 1 ? `<b class="board-icon-count" data-count="${count}"></b>` : ''}</span>`;
  }

  function fleetSymbolsAt(key) {
    return Object.entries(state.fleets[key] || {}).filter(([,fleet]) => fleetCount(fleet)).map(([owner,fleet]) => {
      const symbols = Object.keys(SHIP_STATS).filter(type => fleet[type] > 0).map(type => boardIcon(type,fleet[type])).join('');
      return `<span class="hex-fleet-group" style="--fleet-owner:${playerColor(Number(owner))}">${symbols}</span>`;
    }).join('');
  }

  function fleetAriaAt(key) {
    return Object.entries(state.fleets[key] || {}).filter(([,fleet]) => fleetCount(fleet)).map(([owner,fleet]) => {
      const ships = Object.keys(SHIP_STATS).filter(type => fleet[type] > 0).map(type => `${fleet[type]} ${SHIP_STATS[type].name}${fleet[type] === 1 ? '' : 's'}`).join(', ');
      return `${state.players[Number(owner)].name}: ${ships}`;
    }).join('; ');
  }

  function buildingSymbols(planet) {
    if (!planet) return '';
    if (planet.hasColony) return boardIcon('colony');
    if (planet.upgrade) return boardIcon(planet.upgrade);
    return '';
  }

  function playerColor(playerId) {
    return state.players[playerId]?.color||PLAYER_COLORS[playerId];
  }

  // The Sector Scan names what a hex holds with the map's own glyphs and owner colours, one
  // symbol per fact that matters; each carries its words as a tooltip and accessible name.
  const PORTAL_GLYPH = '<svg class="board-glyph" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><polygon points="50,3 97,30 97,86 50,113 3,86 3,30" stroke-width="10"></polygon></svg>';
  function scanSymbol(label, html, className, owner = null) {
    const color = owner === null ? '' : ` style="--scan-owner:${playerColor(owner)}"`;
    return `<span class="scan-symbol ${className}" role="img" aria-label="${esc(label)}" title="${esc(label)}"${color}>${html}</span>`;
  }
  function scanFleetSymbols(key) {
    return Object.entries(state.fleets[key] || {}).filter(([,fleet]) => fleetCount(fleet)).map(([owner,fleet]) => {
      const ships = Object.keys(SHIP_STATS).filter(type => fleet[type] > 0).map(type => `<span class="scan-ship">${BOARD_ICONS[type]}${fleet[type] > 1 ? `<b>${fleet[type]}</b>` : ''}</span>`).join('');
      return scanSymbol(`${state.players[owner].name}: ${formatFleet(fleet)}`, ships, 'scan-fleet', Number(owner));
    }).join('');
  }
  // Facts for a charted planet: its owner, then its building, or else that a Colony may be founded here.
  function scanPlanetSymbols(key, planet) {
    const parts = [];
    if (planet.owner !== null) parts.push(scanSymbol(`Owner: ${state.players[planet.owner].name}`, '<i></i>', 'scan-owner', planet.owner));
    if (hasBuilding(planet)) parts.push(scanSymbol(buildingLabel(planet), buildingSymbols(planet), 'scan-building', planet.owner));
    else if (isColonySite(key)) parts.push(scanSymbol('Colony site: a Settler can found a Colony here', VOCAB_ICONS.colonize, 'scan-site'));
    return parts.join('');
  }

  // A planet's territory belongs to whoever holds its center: the Colony on a
  // world, or the building on a moon. Neutral planets have no territory.
  function territoryOwner(cluster) {
    return cluster ? state.planets[cluster.center]?.owner ?? null : null;
  }

  // Edge i of a pointy-top hex faces DIRECTIONS[i], in the 100×115.47 hex box.
  const HEX_EDGES = [[100,28.87,100,86.6],[50,0,100,28.87],[0,28.87,50,0],[0,86.6,0,28.87],[50,115.47,0,86.6],[100,86.6,50,115.47]];
  const TERRITORY_SVG = `<svg class="territory-edge" viewBox="0 0 100 115.47" preserveAspectRatio="none" aria-hidden="true" focusable="false">${HEX_EDGES.map(([x1,y1,x2,y2],i)=>`<line class="territory-casing" data-edge="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`).join('')}${HEX_EDGES.map(([x1,y1,x2,y2],i)=>`<line class="territory-line" data-edge="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`).join('')}</svg>`;

  const TERRITORY_SWATCH = `<span class="territory-swatch" aria-hidden="true">${PLAYER_COLORS.map(color=>`<i style="--territory:${color}"></i>`).join('')}</span>`;

  function territoryEdges(key, cluster) {
    const [q,r] = key.split(',').map(Number);
    return DIRECTIONS.map(([dq,dr]) => state.planets[coordKey(q+dq,r+dr)]?.cluster !== cluster.id);
  }

  function buildingLabel(planet) {
    if (planet.hasColony) return 'Colony';
    if (planet.upgrade === 'starbase') return 'Shipyard';
    if (planet.upgrade) return STRUCTURES[planet.upgrade].name;
    return 'Open site';
  }

  function renderSymbolLegend() {
    $('#resource-legend').innerHTML = `<strong class="legend-heading">Map key</strong>${RESOURCES.map(resource=>`<span>${resourceDot(resource)}${RESOURCE_NAMES[resource]}</span>`).join('')}<span>${TERRITORY_SWATCH}Owner’s colour rings each held planet and marks its buildings</span><span>◈ Located relic</span><span>● Gray moon · no production</span><span>Worlds are public · Moons and relics start hidden</span>`;
    const entries = [
      ['settler','Settler'],['explorer','Explorer'],['fleet','Fleet'],
      ['colony','Colony'],['harvester','Harvester'],['starbase','Shipyard']
    ];
    // A short key beside the map, with each piece's price and the Excavate cost, so the board
    // teaches itself without opening the Map key. The Map key dialog opens with the same list (an
    // upright tablet has no corner key), then the full descriptions.
    const corner = $('#map-legend-corner');
    const pieceCost = type => type === 'colony' ? { biomass: COLONY_LIFE_COST } : SHIP_STATS[type]?.cost || STRUCTURES[type]?.cost;
    // One printed resource symbol per unit paid, by the card corners' rule (rules #card-corners).
    const costRow = (kind, icon, label, cost) => `<div class="legend-cost-row" data-cost-kind="${kind}"><dt class="legend-cost-name">${icon}<b>${label}</b></dt><dd>${costClusters(cost)}</dd></div>`;
    const costList = `<dl class="legend-cost-list" aria-label="Resource costs">`
      + entries.map(([type,label]) => costRow(type, BOARD_ICONS[type], label, pieceCost(type))).join('')
      + costRow('excavate', '<span class="legend-icon">◈</span>', 'Excavate', EXCAVATION_COST) + '</dl>';
    if (corner) corner.innerHTML = costList + `<span class="legend-vocab">${VOCAB_LABELS.map(([key,label]) => `<span>${VOCAB_ICONS[key]}${label}</span>`).join('')}</span>`;
    $('#symbol-legend').innerHTML = `<strong class="legend-heading">Costs</strong>${costList}<strong class="legend-heading">Units &amp; buildings</strong>${entries.map(([type,label]) =>
      `<span class="tooltip-anchor symbol-legend-item" role="group" tabindex="0" data-tooltip="${LEGEND_TOOLTIPS[type]}" aria-label="${label}. ${LEGEND_TOOLTIPS[type]}"><span class="symbol-legend-name">${BOARD_ICONS[type]}${label}</span><span class="symbol-legend-description">${LEGEND_TOOLTIPS[type]}</span></span>`
    ).join('')}<strong class="legend-heading">Card icons</strong><span class="legend-vocab symbol-vocab">${VOCAB_LABELS.map(([key,label]) => `<span>${VOCAB_ICONS[key]}${label}</span>`).join('')}</span>`;
  }

  // Replays reveal every faction's information, so fog never applies there.
  function knownToViewer(cluster) {
    return replayMode || revealEntireMap || clusterKnown(cluster,viewSeat);
  }

  function relicKnownToViewer(planet) {
    return Boolean(planet?.special==='relic' && (replayMode || revealEntireMap || relicKnown(state.clusters[planet.cluster],viewSeat)));
  }

  function selectHex(key) {
    if (!replayMode) return humanSelectHex(key);
    state.selected = key;
    options.onSelect?.(key);
    render();
  }

  function renderBoard() {
    const board = $('#galaxy-board');
    if (!board.dataset.built) {
      board.style.setProperty('--hex-width', `${100/(BOARD_RADIUS*2+1)}%`);
      board.style.setProperty('--row-overlap', `${-100/(BOARD_RADIUS*2+1)*Math.sqrt(3)/8}%`);
      for (let r=-BOARD_RADIUS;r<=BOARD_RADIUS;r+=1) {
        const row = document.createElement('div'); row.className = 'map-row';
        const qMin = Math.max(-BOARD_RADIUS,-BOARD_RADIUS-r); const qMax = Math.min(BOARD_RADIUS,BOARD_RADIUS-r);
        const rowScreenX = qMin + r/2;
        row.style.transform = `translateX(${((rowScreenX+BOARD_RADIUS)/(BOARD_RADIUS*2+1))*100}%)`;
        for (let q=qMin;q<=qMax;q+=1) {
          const key = coordKey(q,r);
          const button = document.createElement('button');
          button.type='button'; button.className='hex'; button.dataset.coord=key;
          button.addEventListener('click',event=>{if(!selectHex(key))showSectorScan(event.detail===0);});
          // Pointing at (or focusing) a hex raises the hand cards that could start an order there.
          button.addEventListener('pointerenter',()=>pointAtHex(key));
          button.addEventListener('focus',()=>pointAtHex(key));
          button.addEventListener('pointerleave',()=>pointAtHex(null,key));
          button.addEventListener('blur',()=>pointAtHex(null,key));
          button.innerHTML=TERRITORY_SVG+'<svg class="portal-ring" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><polygon class="portal-ring-base" points="50,3 97,30 97,86 50,113 3,86 3,30"></polygon><polygon class="portal-ring-line" points="50,3 97,30 97,86 50,113 3,86 3,30"></polygon></svg><span class="hex-pieces"><span class="hex-fleets"></span><span class="hex-buildings"></span><span class="special"></span></span>';
          row.appendChild(button);
        }
        board.appendChild(row);
      }
      board.dataset.built='1';
    }
    $$('.hex').forEach(hex => {
      const key = hex.dataset.coord;
      const planet = state.planets[key];
      const cluster = planet ? state.clusters[planet.cluster] : null;
      const known = knownToViewer(cluster);
      const relicSignal = relicKnownToViewer(planet);
      hex.className = `hex ${planet ? (known ? planet.type : relicSignal ? 'fog scanned relic-signal' : 'space') : 'space'}`;
      if (portalExit(key)) hex.classList.add('portal-entry');
      if (state.selected && portalExit(state.selected)===key) hex.classList.add('portal-pair');
      if (state.selected === key) hex.classList.add('selected');
      if (state.moveSource === key) hex.classList.add('source');
      if (state.reachable.includes(key)) hex.classList.add('target');
      const fleets = hex.querySelector('.hex-fleets'); const buildings = hex.querySelector('.hex-buildings'); const special = hex.querySelector('.special');
      const shipMarkers=Object.values(state.fleets[key]||{}).reduce((n,fleet)=>n+Object.keys(SHIP_STATS).filter(type=>fleet[type]>0).length,0);
      const markers=shipMarkers+(planet&&known&&hasBuilding(planet)?1:0)+(relicSignal?1:0);
      const columns=markers<=1?1:markers<=4?2:Math.ceil(Math.sqrt(markers));
      hex.dataset.markers=String(markers);
      hex.style.setProperty('--marker-columns',columns);
      hex.style.setProperty('--marker-rows',Math.ceil(markers/columns)||1);
      const territory = known ? territoryOwner(cluster) : null;
      const edges = territory === null ? [] : territoryEdges(key,cluster);
      hex.classList.toggle('territory',territory !== null);
      hex.style.setProperty('--territory',territory === null ? '' : playerColor(territory));
      hex.querySelectorAll('.territory-edge line').forEach(line => line.classList.toggle('outer',Boolean(edges[Number(line.dataset.edge)])));
      const builder = known && hasBuilding(planet) && planet.owner !== null ? planet.owner : null;
      buildings.classList.toggle('owned',builder !== null);
      buildings.style.setProperty('--building-owner',builder === null ? '' : playerColor(builder));
      fleets.innerHTML = fleetSymbolsAt(key);
      if (planet) {
        buildings.innerHTML = known ? buildingSymbols(planet) : '';
        special.textContent = relicSignal ? (planet.relicClaimed?'◇':'◈') : '';
        const buildingText = hasBuilding(planet) ? `, ${buildingLabel(planet)}` : '';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',known?`${planet.name}, ${planet.type}, ${planet.owner===null?'unclaimed':state.players[planet.owner].name}${buildingText}${fleetText ? `, fleet ${fleetText}` : ''}${relicSignal?', relic site':''}`:relicSignal?`Alien relic signal at ${key}; surrounding terrain unknown${fleetText?', fleet '+fleetText:''}`:`Space ${key}${fleetText?', fleet '+fleetText:''}`);
      } else {
        buildings.innerHTML = ''; special.textContent='';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',`Space ${key}${fleetText?', fleet '+fleetText:''}`);
      }
      if (portalExit(key)) hex.setAttribute('aria-label',hex.getAttribute('aria-label')+`, corner portal to ${portalExit(key)}, crossing costs 2 movement`);
    });
  }

  function showPrestigeBreakdown(playerId) {
    const points = prestigeBreakdown(playerId);
    $('#prestige-title').textContent = `${state.players[playerId].name} · ${points.total} Prestige`;
    const player = state.players[playerId], colonies = colonyPlanets(playerId).length;
    $('#prestige-stats').textContent = `${state.activePlayer===playerId && state.winner===null ? 'Acting' : player.passed ? 'Passed' : 'Ready'} · ${colonies} ${colonies===1?'colony':'colonies'} · ${player.cardsPurchased||0} cards bought · ${strongestFleet(playerId)} fleet power`;
    $('#prestige-breakdown').innerHTML = [
      ['Colonies · 3 each',points.colonies],
      ['Excavated relics · 2 each',points.relics],[`Decisive combat victories · ${COMBAT_VICTORY_PRESTIGE} each`,points.combat],['Card Prestige',points.cards]
    ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    const dialog = $('#prestige-dialog');
    if (!dialog.open) dialog.showModal();
  }

  // The standings beside the race (public information only, rules #shared-board): one row per
  // faction, level with its lane, under one row of icon headings.
  const STANDINGS_COLUMNS = [
    ['settler', 'Settlers', 'Settlers on the map: move 1, colonize and capture', () => BOARD_ICONS.settler],
    ['explorer', 'Explorers', 'Explorers on the map: move 3, probe and excavate relics', () => BOARD_ICONS.explorer],
    ['fleet', 'Fleets', 'Fleets on the map: move 2, 3 attack and 7 hull each', () => BOARD_ICONS.fleet],
    ['power', 'Strongest fleet power', 'Strongest fleet power: the most attack the faction has together on one hex', () => VOCAB_ICONS.hit],
    ['colony', 'Colonies', 'Colonies: 3 Prestige each', () => BOARD_ICONS.colony],
    ['harvester', 'Harvesters', 'Harvesters: each produces 2 of its hex’s resource per round', () => BOARD_ICONS.harvester],
    ['starbase', 'Shipyards', 'Shipyards: commission ships and defend their hex', () => BOARD_ICONS.starbase],
    ['relics', 'Excavated relics', 'Excavated relics: 2 Prestige each', () => '<span class="standings-glyph" aria-hidden="true">◈</span>'],
    ['cards', 'Cards bought', 'Cards bought from the market (normal and military)', () => VOCAB_ICONS.draw],
  ];
  function standingsRow(id) {
    const units = { settler: 0, explorer: 0, fleet: 0 };
    Object.values(state.fleets).forEach(group => Object.keys(units).forEach(type => { units[type] += group[id]?.[type] || 0; }));
    const owned = Object.values(state.planets).filter(planet => planet.owner === id);
    return { ...units, power: strongestFleet(id), colony: owned.filter(planet => planet.hasColony).length,
      harvester: owned.filter(planet => planet.upgrade === 'harvester').length, starbase: owned.filter(planet => planet.upgrade === 'starbase').length,
      relics: excavatedRelicCount(id), cards: state.players[id].cardsPurchased || 0 };
  }
  function standingsTable(tag) {
    const head = STANDINGS_COLUMNS.map(([key, label, help, icon]) => `<span role="columnheader" class="standings-head" data-col="${key}" title="${esc(help)}" aria-label="${esc(label)}">${icon()}</span>`).join('');
    const rows = state.players.map((player, id) => {
      const row = standingsRow(id);
      return `<div role="row" class="standings-row" style="--player:${player.color}"><span role="rowheader" class="standings-faction" title="${esc(player.name)}"><span class="sr-only">${esc(player.name)}</span><b aria-hidden="true">${esc(tag(player, id))}</b></span>${STANDINGS_COLUMNS.map(([key, label]) => `<span role="cell" class="standings-cell${row[key] ? '' : ' zero'}" data-col="${key}" title="${esc(player.name)}: ${row[key]} ${esc(label.toLowerCase())}">${row[key]}</span>`).join('')}</div>`;
    }).join('');
    return `<div class="standings-stats" role="table" aria-label="Standings: units, worlds, relics and cards bought per faction" style="--stat-cols:${STANDINGS_COLUMNS.length}"><div role="row" class="standings-row standings-header"><span role="columnheader" class="standings-faction"><span class="sr-only">Faction</span></span>${head}</div>${rows}</div>`;
  }

  // The race to the Prestige goal: one lane per faction, in seat order, so every marker sits exactly
  // at its score. Each marker opens that faction's point breakdown; pointing at it or focusing it
  // shows an overview of its points and stats. The acting faction's marker glows.
  function renderScoreboard() {
    const target = victoryTarget();
    const ticks = [1,2,3].map(step => Math.round(target * step / 4)).map(value => `<span class="prestige-tick" style="--at:${value / target * 100}%"><span>${value}</span></span>`).join('');
    const tag = (player,id) => id===ME && !replayMode ? 'You' : player.name.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0,3).toUpperCase();
    const lanes = state.players.map((player,id) => {
      const active = state.activePlayer===id && state.winner===null;
      const status = active ? 'Acting' : player.passed ? 'Passed' : 'Ready';
      const elo = state.replayElo?.[id];
      const eloText = elo ? ` · Elo ${Math.round(elo.before)} → ${Math.round(elo.after)} (${elo.after>=elo.before?'+':''}${(elo.after-elo.before).toFixed(1)})` : '';
      const colonies = colonyPlanets(id).length, breakdown = prestigeBreakdown(id), points = breakdown.total, at = Math.min(100, points / target * 100);
      const sources = [['Colonies', breakdown.colonies], ['Relics', breakdown.relics], ['Battles', breakdown.combat], ['Cards', breakdown.cards]];
      const overview = `<div class="score-overview" id="score-overview-${id}" role="tooltip"><strong class="score-overview-title"><span>${esc(player.name)} <i>${status}</i></span><b>${points} of ${target}★</b></strong><dl>${sources.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}★</dd></div>`).join('')}</dl><p>${colonies} ${colonies===1?'colony':'colonies'} · ${player.cardsPurchased||0} cards bought · ${strongestFleet(id)} fleet power${eloText}</p></div>`;
      const label = `${esc(player.name)}, ${status}: ${points} of ${target} Prestige. Show point breakdown`;
      return `<div class="prestige-lane${at>70?' flip':''}" style="--player:${player.color};--at:${at}%"><button type="button" class="prestige-marker${active?' acting':''}${replayMode&&id===viewSeat?' viewing':''}" data-score-player="${id}" aria-label="${label}" aria-describedby="score-overview-${id}" aria-haspopup="dialog"><b>${points}</b><span class="prestige-name">${esc(tag(player,id))}</span></button>${overview}</div>`;
    }).join('');
    // Each lane starts with its faction's name (the first word; the full name on hover and in the
    // standings table's row header for screen readers).
    const names = state.players.map((player,id) => `<span class="prestige-lane-name${state.activePlayer===id && state.winner===null?' acting':''}" style="--player:${player.color}" title="${esc(player.name)}">${esc(id===ME && !replayMode ? 'You' : player.name.split(/\s+/)[0])}</span>`).join('');
    $('#prestige-track').innerHTML = `<span class="prestige-track-goal">${target}★</span><div class="prestige-names" aria-hidden="true">${names}</div><div class="prestige-line">${ticks}${lanes}</div>${standingsTable(tag)}`;
    $('.app-shell')?.style.setProperty('--lanes', state.players.length);
    $$('[data-score-player]').forEach(button=>button.addEventListener('click',()=>showPrestigeBreakdown(Number(button.dataset.scorePlayer))));
    renderHistoryStatus();
  }

  function renderResourceTools() {
    $('#resource-tools').hidden = replayMode;
    if (replayMode) return;
    const enabled = canManageResources(ME);
    const player = state.players[ME];
    $('#resource-tools-help').textContent = enabled ? 'Trade with the bank during Operations or Buy, including off turn.' : 'Available during Operations or Buy, including off turn.';
    for (const side of ['give','get']) for (const resource of RESOURCES) {
      const button = $(`#bank-${side}-${resource}`);
      button.disabled = !enabled;
      button.setAttribute('aria-pressed', String(bankSelection[side] === resource));
      button.setAttribute('aria-label',`${side==='give'?'Give '+bankTradeRate(ME,resource):'Receive 1'} ${RESOURCE_NAMES[resource]}`);
    }
    const {give,get} = bankSelection,rate=bankTradeRate(ME,give);
    $('#bank-give-rate').textContent=`Give ${rate}`;
    $('#bank-exchange-preview').innerHTML = give && get
      ? `${resourceDots({[give]:rate})}<span aria-hidden="true">→</span>${resourceDots({[get]:1})}${give===get?'<span>Choose two different resources.</span>':enabled&&player.resources[give]<rate?`<span>You need ${rate} ${RESOURCE_NAMES[give]}.</span>`:''}`
      : '<span>Choose one resource on each side.</span>';
    $('#bank-exchange-button').disabled = !canBankTrade(ME,give,get);
  }


  // Both themes share one bank control and the same values. CSS switches the classic
  // green mat and combined star-background circles immediately with the background toggle.
  const MAT_SLOTS = 20;
  const matSeen = {};
  let matPick = null;
  function renderResources() {
    const player = state.players[viewSeat];
    const production = aiIncome(viewSeat);
    const stored = totalResources(player);
    renderResourceTools();
    if (replayMode) $('#command-eyebrow').textContent = `${player.name.toUpperCase()} · COMMAND`;
    $('#capacity-value').textContent = `${stored} stored · four separate limits`;
    const limits = resourceLimits(viewSeat);
    const before = matSeen[viewSeat] || {};
    const mine = !replayMode && viewSeat === ME;
    // The green mat is a track: slot i stands for the value i (0 to MAT_SLOTS), and each row has one
    // piece on the slot for its value, which pops in when the value changes. Every fifth slot from
    // 0 has a brighter rim; a value past the track stays on the last slot and is printed beside it.
    const pips = (value, from, extra = () => '') => Array.from({ length: MAT_SLOTS + 1 }, (_, i) => `<i class="${i === Math.min(value, MAT_SLOTS) ? `full${value !== from ? ' new' : ''}` : ''}${i && i % 5 === 0 ? ' five' : ''}${extra(i)}"></i>`).join('') + (value > MAT_SLOTS ? `<b class="mat-lap">${value}</b>` : '');
    $('#resource-grid').innerHTML = `<div class="mat-head mat-classic" aria-hidden="true"><span class="mat-key rate"><i></i>Rate</span><span class="mat-key now"><i></i>Now</span><span class="mat-key cap"><i></i>Capacity</span></div><div class="mat-head ring-key mat-stars" aria-hidden="true"><span class="mat-key production"><i></i>Production</span><span class="mat-key now"><i></i>Available</span><span class="mat-key unavailable"><i></i>Unavailable</span>${mine ? '<span class="mat-hint">Drag one resource onto another to trade at its current bank rate</span>' : ''}</div>` + RESOURCES.map(resource => {
      const have = player.resources[resource], cap = limits[resource], next = production[resource];
      const fill = have > cap ? 'over-cap' : have >= cap ? 'at-cap' : have + next > cap ? 'will-cap' : '';
      const was = before[resource] || { have, cap, next };
      const capAt = Math.min(cap, MAT_SLOTS), capFrom = Math.min(was.cap, MAT_SLOTS);
      const classicRow = pips(have, was.have, i => `${i === capAt ? ` cap${capAt !== capFrom ? ' moved' : ''}` : i > cap ? (i === Math.min(have, MAT_SLOTS) ? ' over' : ' shut') : ''}`);
      const ringRow = Array.from({ length: MAT_SLOTS + 1 }, (_, i) => `<i aria-hidden="true" class="${i < have ? 'full' : ''}${i < have && i >= was.have ? ' new' : ''}${i < next ? ' producing' : ''}${i >= cap ? (i < have ? ' over' : ' shut') : ''}"></i>`).join('')
        + (Math.max(have, cap, next) > MAT_SLOTS + 1 ? `<b class="mat-lap" aria-hidden="true">${have}/${cap} · +${next}</b>` : '');
      const nowRow = `<span class="mat-classic mat-stock" aria-hidden="true">${classicRow}</span><span class="mat-stars mat-stock" aria-hidden="true">${ringRow}</span>`;
      const label = `${RESOURCE_NAMES[resource]}: ${have} of ${cap}, +${next} per round`;
      return `
      <article class="resource-box ${resource} mat-rings${matPick === resource ? ' mat-picked' : ''}" style="--resource:var(--${resource})" data-resource="${resource}"${fill?` data-fill="${fill}"`:''} aria-label="${label}${fill==='over-cap'?', above the limit':fill==='at-cap'?', full':fill==='will-cap'?', next round would pass the limit':''}">
        ${resourceDot(resource)}
        <span class="resource-name">${RESOURCE_NAMES[resource]}</span>
        <span class="mat-pips rate mat-classic" aria-hidden="true">${pips(next, was.next)}</span>
        <span class="resource-production" aria-hidden="true">+${next}</span>
        ${mine ? `<button type="button" class="mat-pips now" data-mat-trade="${resource}" aria-label="${label}. Trade ${bankTradeRate(ME,resource)} ${RESOURCE_NAMES[resource]} with the bank: choose this, then the resource to receive, or Discard">${nowRow}</button>` : `<span class="mat-pips now" aria-hidden="true">${nowRow}</span>`}
        <strong class="resource-amount" aria-hidden="true">${have}</strong><span class="resource-limit" aria-hidden="true">/${cap}</span>
      </article>`;
    }).join('');
    matSeen[viewSeat] = Object.fromEntries(RESOURCES.map(resource => [resource, { have: player.resources[resource], cap: limits[resource], next: production[resource] }]));

  }

  function availableContextOrders(coord, onlyCard = null) {
    if (state.pendingCombat || replayMode || state.winner !== null || state.phase !== 'operations' || state.activePlayer !== ME
      || !['prep','action'].includes(state.turnStage) || state.pendingColonyBuild || state.pendingConstruct) return [];
    const planet = state.planets[coord], fleet = getFleet(coord,ME);
    const known = planet && clusterKnown(state.clusters[planet.cluster],ME);
    const relicSignal = planet?.special === 'relic' && relicKnown(state.clusters[planet.cluster],ME);
    const orders = [], seen = new Set();
    for (const card of state.players[ME].hand.filter(item => !onlyCard || item.id === onlyCard)) {
      const def = ALL_CARDS[card.key], signature = `${card.key}:${starterLevel(card)}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const name = `${def.name}${starterLevel(card)===3?' III':card.upgraded?' II':''}`;
      const add = (type,label,group=null) => orders.push({card:card.id,type,group,label:`${label} · ${name}`,action:label,name});
      if (def.order === 'move' && fleetCount(fleet)) {
        for (const group of ['ships','explorer']) {
          const moving = fleetGroup(fleet,group);
          if (fleetCount(moving) && reachableFrom(coord,ME,movementRange(moving,card),avoidsHostile(def.tag),moving).length)
            add('move',moveOrderLabel(moving),group);
        }
      }
      const canRecoverHere = relicSignal && !planet.relicClaimed && fleet?.explorer > 0;
      const canBuildHere = known && (canBuildStructureAt(ME,coord)
        || canLaunchExplorer(ME,coord) || planet.owner === ME && planet.upgrade === 'starbase');
      if (def.order === 'construct' && canBuildHere) add('construct','Build / commission');
      if (['probe','excavate'].includes(def.order) && canRecoverHere) add('excavate','Excavate relic','excavate');
      if (def.order === 'probe' && probeRelic(ME,coord,card.id,true)) add('probe','Probe nearest relic','probe');
      if (known && def.order === 'colonize' && isColonySite(coord) && fleet?.settler > 0
        && (planet.owner === null && !hasBuilding(planet) || canCaptureAt(coord,ME)))
        add('colonize',planet.owner === null ? 'Found Colony' : 'Capture Colony');
    }
    return orders;
  }

  function startContextOrder(cardId, coord, group = null) {
    const order = availableContextOrders(coord,cardId).find(item => item.group === group);
    if (!order) return false;
    state.selected = coord;
    if (state.actionCardId !== cardId || state.actionMode!==order.type) playOrder(cardId,order.type);
    if (state.actionCardId !== cardId || !state.actionMode) return false;
    if (order.type === 'move') prepareHumanMove(coord,group);
    if (order.type === 'excavate') openExcavationRewards();
    if (order.type === 'probe') probeRelic(ME,coord,cardId);
    render(); saveGame();
    return true;
  }

  function renderContextOrders(actions, coord) {
    const orders = availableContextOrders(coord);
    if (!orders.length) {
      if (network?.tabletop) {
        const note=document.createElement('p'); note.className='tabletop-requirement';
        note.textContent=state.activePlayer!==ME || state.phase!=='operations'
          ? 'Inspect and plan now. Choose map orders on your Operations turn.'
          : 'No order in your hand starts here. Choose a sector with your units or an eligible building site.';
        actions.appendChild(note);
      }
      return;
    }
    if (state.actionMode) {
      actions.appendChild(actionButton('Choose another order',()=>{const excavation=state.actionMode==='excavate';clearAction();if(excavation)switchTab('hand');render();saveGame();}));
      return;
    }
    const list = document.createElement('div');
    list.className = 'context-order-list';
    const title = document.createElement('strong');
    title.textContent = 'Orders from your hand';
    list.appendChild(title);
    const hand = state.players[ME].hand;
    for (const order of orders) {
      // The card's own picture beside what it does here; choosing it starts the order exactly as
      // Use order or a drag would. Pointing at it raises that card in your hand.
      const def = ALL_CARDS[hand.find(card => card.id === order.card)?.key];
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button scan-order'; button.dataset.scanOrderCard = order.card;
      button.setAttribute('aria-label', order.label);
      if (def?.accent) button.style.setProperty('--card-accent', def.accent);
      button.innerHTML = `<span class="scan-order-art">${def ? cardIllustration(def) : ''}</span><span class="scan-order-text"><strong>${esc(order.action)}</strong><small>${esc(order.name)}</small></span>`;
      button.addEventListener('click', () => startContextOrder(order.card, coord, order.group));
      for (const type of ['pointerenter', 'focus']) button.addEventListener(type, () => { pointedOrderCard = order.card; syncPlaysHere(); });
      for (const type of ['pointerleave', 'blur']) button.addEventListener(type, () => { if (pointedOrderCard === order.card) { pointedOrderCard = null; syncPlaysHere(); } });
      list.appendChild(button);
    }
    actions.appendChild(list);
  }

  // The board teaches what to play: while you point at, focus or choose a hex, the hand cards whose
  // order can start there rise and glow, as a card does while it aims at hexes (Use order or a
  // drag). Pointing at one of the Sector Scan's orders narrows it to that card. Presentation only.
  let pointedHex = null, pointedOrderCard = null;
  function pointAtHex(key, leaving = null) {
    if (leaving && pointedHex !== leaving) return;
    pointedHex = key;
    syncPlaysHere();
  }
  function syncPlaysHere() {
    if (headless) return;
    const scanOpen = $('#sector-popover')?.matches?.(':popover-open');
    const coord = pointedHex || (scanOpen ? state.selected : null);
    const busy = state.actionMode || state.pendingMove || document.body.classList.contains('cf-drag-active') || document.body.classList.contains('cf-aim-active');
    const ids = new Set();
    if (coord && !busy) {
      if (pointedOrderCard && scanOpen && coord === state.selected) ids.add(pointedOrderCard);
      else for (const card of state.players[ME].hand) if (availableContextOrders(coord, card.id).length) ids.add(card.id);
    }
    for (const card of $$('#hand-row > .game-card')) card.classList.toggle('cf-plays-here', ids.has(card.dataset.cardId));
  }

  function renderInspector() {
    const key = state.selected;
    const title = $('#inspect-title'); const scanKind = $('#inspect-kind'); const detail = $('#inspect-detail'); const facts = $('#inspect-facts'); const actions = $('#context-actions');
    actions.innerHTML=''; scanKind.innerHTML=''; detail.textContent=''; facts.innerHTML='';
    const discount=!replayMode&&state.actionMode==='construct'&&!state.pendingConstruct?state.actionOptions.discountResource??null:null;
    const buildButton=(label,kind)=>actionButton(label,()=>contextBuild(kind,key),constructAt(ME,key,kind,discount,true),constructionCost(ME,key,kind,discount));
    if (!key) { title.textContent='Select a hex'; detail.textContent='Choose a planet or space hex to inspect fleets, control, and possible actions.'; return; }
    renderContextOrders(actions,key);
    const actualPlanet = state.planets[key];
    const planet = actualPlanet && (knownToViewer(state.clusters[actualPlanet.cluster]) || relicKnownToViewer(actualPlanet)) ? actualPlanet : null;
    const exit=portalExit(key),portalFact=exit?scanSymbol(`Corner portal: aligned exit ${exit}, crossing costs 2 movement`,PORTAL_GLYPH,'scan-portal'):'';
    const relicFact=planet&&relicKnownToViewer(planet)?scanSymbol(knownToViewer(state.clusters[planet.cluster])?'Relic site: available':'Relic site: located privately, available','◈','scan-relic'):'';
    if (planet && !knownToViewer(state.clusters[planet.cluster])) {
      title.textContent = 'Alien relic signal';
      detail.textContent = 'The surrounding terrain remains unknown.';
      facts.innerHTML = relicFact+scanFleetSymbols(key)+portalFact;
      return;
    }
    if (planet) {
      title.textContent=planet.name;
      const kindLabel=planet.type==='moon'?'Gray moon: no production':`${RESOURCE_NAMES[planet.type]} world`;
      scanKind.innerHTML=`<span class="scan-kind-symbol" role="img" aria-label="${kindLabel}" title="${kindLabel}">${planet.type==='moon'?'<b class="scan-moon" aria-hidden="true">●</b>':resourceDot(planet.type,'resource-dot-large')}</span>`;
      facts.innerHTML=scanPlanetSymbols(key,planet)+relicFact;
    } else {
      // Uncharted terrain reads as space too, so the scan never reveals a hidden moon.
      title.textContent='Empty Space';
    }
    facts.innerHTML+=scanFleetSymbols(key)+portalFact;
    if (replayMode) {
      // Recorded decisions replace the live action buttons.
      const pending = state.pendingColonyBuild;
      const notes = [];
      if (pending && state.reachable.includes(key)) notes.push(['Colonize II', `${esc(state.players[pending.playerId].name)} may build here at full cost`]);
      if (state.replayDecision?.coords?.includes(key)) notes.push(['This decision', esc(state.replayDecision.text)]);
      if (state.lastCombat?.coord === key) notes.push(['Last combat', esc(state.lastCombat.outcome)]);
      detail.insertAdjacentHTML('beforeend', notes.map(([label,text])=>`<div class="fact"><span>${label}</span><strong>${text}</strong></div>`).join(''));
      return;
    }
    if(state.pendingConstruct?.playerId===ME) actions.appendChild(actionButton('Finish after one build',()=>finishConstruct(ME)));
    if(state.pendingColonyBuild?.playerId===ME) {
      for(const kind of Object.keys(STRUCTURES)) {
        if(adjacentKeys(state.pendingColonyBuild.colony).includes(key) && canBuildStructureAt(ME,key))
          actions.appendChild(actionButton(`Build ${STRUCTURES[kind].name}`,()=>finishColonyBuild(ME,key,kind),canColonyBuild(ME,key,kind),constructionCost(ME,key,kind,null,true)));
      }
      actions.appendChild(actionButton('Finish without building',()=>finishColonyBuild(ME)));
    }
    if (!state.pendingCombat && state.phase==='operations' && state.activePlayer===ME && ['action','construct-again'].includes(state.turnStage)) {
      if (state.actionMode==='move' && state.moveSource===key) {
        const picker=moveUnitPicker(key);
        if (picker) actions.appendChild(picker);
        actions.appendChild(actionButton(hostileAt(key,ME)?'Fight again here · use Move':'Stay here · use Move',()=>humanSelectHex(key),state.reachable.includes(key)));
        if (exit&&state.reachable.includes(exit)) actions.appendChild(actionButton('Cross portal · 2 movement',()=>{
          humanSelectHex(exit);
          $(`.hex[data-coord="${exit}"]`)?.scrollIntoView?.({block:'center',inline:'center'});
          if(!state.pendingCombat)showSectorScan(true);
        }));
      }
      if (state.actionMode==='construct' && planet) {
        if (canBuildStructureAt(ME,key)) Object.keys(STRUCTURES).filter(kind=>canBuildStructureAt(ME,key,kind)).forEach(kind=>actions.appendChild(buildButton(`Build ${STRUCTURES[kind].name}`,kind)));
        if (canLaunchExplorer(ME,key)) actions.appendChild(buildButton('Commission Explorer + Probe / Excavate','explorer'));
        if (planet.upgrade==='starbase') Object.keys(SHIP_STATS).filter(kind=>kind!=='explorer').forEach(kind=>actions.appendChild(buildButton(`Commission ${SHIP_STATS[kind].name}${kind==='settler'?' + Colonize':''}`,kind)));
      }

      if (state.actionMode==='colonize' && planet) {
        const capture=planet.owner!==null&&planet.owner!==ME&&!hostileAt(key,ME);
        const eligible=isColonySite(key)&&((planet.owner===null&&!hasBuilding(planet))||capture&&captureFleetAt(key,ME))&&getFleet(key,ME)?.settler>0;
        const colonizeCost={ biomass: colonyTerms(state.actionOptions.tag,capture).biomass };
        if (eligible) actions.appendChild(actionButton(capture?'Capture planet':'Found Colony',()=>contextColonize(key),state.players[ME].resources.biomass>=colonizeCost.biomass,colonizeCost));
      }
    }
  }

  function actionButton(label,handler,enabled=true,cost=null) {
    const button=document.createElement('button'); button.type='button'; button.className='button'; button.innerHTML=cost?`<span>${label}</span>${resourceDots(cost)}`:label; button.disabled=!enabled;
    if (network?.tabletop && !enabled && cost) {
      const missing=RESOURCES.filter(r=>(cost[r]||0)>state.players[ME].resources[r]).map(r=>`${cost[r]-state.players[ME].resources[r]} ${RESOURCE_NAMES[r]}`);
      const note=document.createElement('small'); note.className='tabletop-requirement';
      note.textContent=missing.length?`Need ${missing.join(', ')}`:'Requires an eligible site or unit.';
      button.appendChild(note);button.title=note.textContent;
    }
    button.addEventListener('click',handler); return button;
  }



  // The comms feed reads at a glance: who acted (faction colour), what kind of event (icon),
  // resource and Prestige amounts as chips, and a divider per round. The full sentence stays
  // in the entry for screen readers and on hover.
  // Comms feed: one drawn symbol per kind of event (checked in order), so entries read at a glance.
  const LOG_KINDS = [
    ['production', /produced|production|harvest/i],
    ['battle', /attack|battle|combat|destroy|captured|retreat|escape|volley/i],
    ['trade', /trade|offer|exchanged|bank/i],
    ['upgrade', /upgraded/i],
    ['trash', /trash|decommission/i],
    ['buy', /bought|acquired|purchase|activated .* during Buy/i],
    ['convert', /converted|discarded .*(Matter|Energy|Life|Biomass|Data)|to free storage/i],
    ['relic', /relic|excavat|probe|surveyed|located/i],
    ['colonize', /coloniz|colony/i],
    ['build', /built|commission|shipyard|starbase|build/i],
    ['move', /moved|move|jump|portal/i],
    ['draw', /drew|draw/i],
    ['prestige', /prestige|won with/i],
    ['pass', /passed|could not/i],
  ];
  const LOG_ICONS = {
    production: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6"/>',
    battle: '<path d="M4 4l11 11M20 4 9 15M13 17l4-4M11 17l-4-4M16.5 16.5 20 20M7.5 16.5 4 20"/>',
    trade: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
    upgrade: '<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    buy: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
    convert: '<path d="M19 9a7.5 7.5 0 0 0-13.4-2M5 15a7.5 7.5 0 0 0 13.4 2"/><path d="M5.6 3v4h4M18.4 21v-4h-4"/>',
    relic: '<path d="M7 4h10l4 5-9 11L3 9zM3 9h18M12 20 9 9l3-5 3 5z"/>',
    colonize: '<path d="M6 21V4M6 4h12l-3 4.5 3 4.5H6"/>',
    build: '<path d="M4 20h16M6 20V10l6-5 6 5v10M10 20v-5h4v5"/>',
    move: '<path d="M3 12h16M13 6l6 6-6 6"/>',
    draw: '<rect x="9" y="3" width="11" height="15" rx="2"/><path d="M6 6.5 4.6 7a2 2 0 0 0-1.2 2.5l3.6 10.2a2 2 0 0 0 2.6 1.2L15 19"/>',
    prestige: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    pass: '<path d="M9 5v14M15 5v14"/>',
    event: '<circle cx="12" cy="12" r="3.5"/>',
  };
  const logIcon = kind => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LOG_ICONS[kind]}</svg>`;
  const LOG_RESOURCE = { Matter:'matter', Energy:'energy', Life:'biomass', Biomass:'biomass', Data:'data' };
  function logVisual(text) {
    return esc(text)
      .replace(/(\d+) (?:permanent )?Prestige/g, (_, n) => `<span class="log-prestige">${n}★</span>`)
      .replace(/(\d+) (Matter|Energy|Life|Biomass|Data)\b/g, (_, n, name) => `<span class="log-res ${LOG_RESOURCE[name]}">${resourceDot(LOG_RESOURCE[name])}<b>${n}</b></span>`);
  }
  // On the table the log is a small card of the latest LOG_RECENT entries until it is opened.
  const LOG_RECENT = 3;
  function renderLog() {
    const parts = [];
    let lastRound = null;
    state.log.slice(0,18).forEach((item,index) => {
      const match = /^R(\d+) · ([\s\S]*)$/.exec(item), round = match ? match[1] : null, text = match ? match[2] : item;
      // A wide table shows two more entries (log-more) on the comms card.
      const recent = index < LOG_RECENT ? ' log-recent' : index < LOG_RECENT + 2 ? ' log-recent log-more' : '';
      if (round && round !== lastRound) { parts.push(`<li class="log-round${recent}" aria-hidden="true"><span>Round ${round}</span></li>`); lastRound = round; }
      const player = state.players.find(candidate => text.startsWith(candidate.name) && !/^[\p{L}\p{N}]/u.test(text.slice(candidate.name.length)));
      const [kind] = LOG_KINDS.find(([,pattern]) => pattern.test(text)) || ['event'];
      const who = player ? `<span class="log-who" style="--player:${player.color}">${esc(player.name.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0,3).toUpperCase())}</span>` : '<span class="log-who log-table">✦</span>';
      parts.push(`<li class="log-entry log-kind-${kind}${index===0?' log-latest':''}${recent}"><span class="sr-only">${esc(item)}</span><span class="log-line" aria-hidden="true">${who}<span class="log-icon">${logIcon(kind)}</span><span class="log-text">${logVisual(player ? text.slice(player.name.length).trimStart() : text)}</span></span></li>`);
    });
    $('#game-log').innerHTML = parts.join('');
  }

  // Printed emblems reuse the board's unit vocabulary. They are decorative;
  // the card text and existing action buttons remain the source of its effect.
  // Each card design shows one public-domain artwork from the National Gallery of Art
  // (card-art/<card key>.webp; card-art/manifest.json and the card gallery credit them).
  // Like the emblem, the picture never changes what a card does (rulebook #card-art).
  // Supply cards (the Capacity Module) have no artwork yet and keep their emblem.
  const CARD_ART_KEYS = new Map(Object.entries({ ...ALL_CARDS, ...BASIC_TACTICS }).filter(([key, def]) => !SUPPLY_CARDS[key] && !def.newRelic).map(([key, def]) => [def, key]));
  function cardIllustration(definition) {
    const motif = definition.kind === 'Military' || definition.affinity === 'Military' ? 'fleet'
      : {move:'fleet',construct:'starbase',colonize:'colony',probe:'explorer',excavate:'harvester'}[definition.order]
      || (definition.kind === 'Expansion' || definition.affinity === 'Settlement' ? 'colony' : 'starbase');
    const art = CARD_ART_KEYS.get(definition);
    if (art) return `<span class="card-art has-picture" aria-hidden="true"><img class="card-picture" src="card-art/${art}.webp" alt="" loading="lazy" decoding="async" draggable="false"><span class="card-emblem">${BOARD_ICONS[motif]}</span></span>`;
    return `<span class="card-art" aria-hidden="true"><span class="card-orbit"></span>${BOARD_ICONS[motif]}<span class="card-registration">HEIRS AD ASTRA</span></span>`;
  }

  function cardMarkup(card, location) {
    const definition=ALL_CARDS[card.key];
    const isHumanOps=!replayMode&&state.phase==='operations'&&state.activePlayer===ME;
    const canResource=location==='hand'&&canConvertCards()&&canConvertCard(card);
    const canStoreCard=overflowPlayer()<0;
    const buyExchange=location==='hand'&&state.phase==='buy'&&canPlayExchange(ME,card.id);
    const canOrder=location==='hand'&&(isHumanOps&&['prep','action'].includes(state.turnStage)||buyExchange)&&definition.order&&!definition.battleRelic&&!definition.reaction&&!definition.buyEffect;
    const isSelectedOrder=canOrder&&state.actionCardId===card.id&&Boolean(state.actionMode);
    const canBuyEffect=location==='hand'&&!replayMode&&state.phase==='buy'&&state.activePlayer===ME&&definition.buyEffect;
    const canTrash=location==='hand'&&!replayMode&&state.phase==='buy'&&state.activePlayer===ME&&card.id&&trashEligible(state.players[ME],card,'hand');
    // The corners are the card's two actions (rules #card-corners): its effect symbols use the
    // order, its conversion symbol converts. An order with no symbols keeps its text button.
    const parts=cardEffectParts(definition,card), effectLabel=parts.length?cardEffectLabel(parts):'';
    const iconOrder=canOrder&&parts.length>0&&!buyExchange&&card.key!=='probe';
    const orderPressed=isSelectedOrder&&state.actionMode!=='excavate';
    const effectCorner=!parts.length?'':iconOrder?`<button type="button" class="card-symbols corner-button${orderPressed?' pressed':''}" data-order-card="${card.id}" aria-pressed="${orderPressed}" aria-label="${orderPressed?'Cancel order':'Use order'}: ${effectLabel}" title="${orderPressed?'Cancel order':'Use order'}: ${effectLabel}">${cardSymbolGroups(parts)}</button>`:cardSymbols(definition,card);
    const gain=canConvertCard(card)?conversionGain(card):null, gainText=gain?RESOURCES.filter(r=>gain[r]).map(r=>`${gain[r]} ${RESOURCE_NAMES[r]}`).join(', '):'';
    const convertCorner=!gain?'':canResource?`<button type="button" class="card-footer corner-button" data-resource-card="${card.id}" aria-label="Convert to ${gainText}${canStoreCard?'':' (choose excess resources first)'}" title="${canStoreCard?`Convert to ${gainText}`:'Choose excess resources first'}" ${canStoreCard?'':'disabled'}>${cornerDots(gain,'Converts to')}</button>`:`<div class="card-footer">${cornerDots(gain,'Converts to')}</div>`;
    const textButtons=location!=='hand'?'':`${canOrder&&!iconOrder?`<button class="button ${isSelectedOrder?'button-danger':'button-primary'}" data-order-card="${card.id}" ${card.key==='probe'?'data-order-mode="probe"':''} aria-pressed="${isSelectedOrder&&state.actionMode!=='excavate'}">${isSelectedOrder&&state.actionMode!=='excavate'?'Cancel order':buyExchange?'Use 2:1':card.key==='probe'?'Probe':'Use order'}</button>`:''}${canOrder&&canConstructDraw(ME,card.id)?`<button class="button button-primary" data-construct-draw="${card.id}" aria-label="Play Construct III to draw one card without building">Draw 1 only</button>`:''}${canOrder&&canOrderDraw(ME,card.id)?`<button class="button button-primary" data-order-draw="${card.id}" aria-label="Play Seed Ark to draw two cards instead of colonizing">Draw 2 instead</button>`:''}${canOrder&&card.key==='probe'?`<button class="button button-primary" data-order-card="${card.id}" data-order-mode="excavate" aria-pressed="${isSelectedOrder&&state.actionMode==='excavate'}">${isSelectedOrder&&state.actionMode==='excavate'?'Cancel Excavate':'Excavate'}</button>`:''}${canBuyEffect?`<button class="button button-primary" data-buy-effect="${card.id}">Use in Buy</button>`:''}${canTrash?`<button class="button" data-trash-hand="${card.id}" aria-label="Trash ${esc(definition.name)}: choose a payment">Trash…</button>`:''}${definition.battleRelic?'<span class="muted">Play during battle</span>':definition.reaction&&isHumanOps?'<span class="muted">Automatic reaction</span>':''}`;
    return `<article class="game-card ${definition.kind==='Alien Relic'?'alien-relic':''} ${card.upgraded?'upgraded':''} ${isSelectedOrder?'order-selected':''}${parts.length?' has-symbols':''}${gain?' has-corner-dots':''}${textButtons?' has-buttons':''}${cardHeadline(card)&&!parts.length?' has-headline':''}" style="--card-accent:${definition.accent}"${card.id?` data-card-id="${card.id}"`:''}${location==='hand'&&definition.order?` data-order="${definition.order}"`:''}>${effectCorner}<span class="card-name">${definition.name}${starterLevel(card)===3?' III':card.upgraded?' II':''}</span>${convertCorner}${cardHeadline(card)&&!parts.length?`<span class="card-headline"><span aria-hidden="true">${iconText(cardHeadline(card))}</span><span class="sr-only">${cardHeadline(card)}</span></span>`:''}${cardIllustration(definition)}${definition.lore?`<span class="card-lore">${esc(definition.lore)}</span>`:''}<span class="card-effect">${resourceText(definition.text)}${card.upgraded?` ${starterLevel(card)===3?'III':'II'}: ${upgradedOrderText(card)}${starterLevel(card)===3&&card.key!=='construct'?' Draw one card when using the order.':''}`:''}</span>${textButtons?`<div class="card-buttons">${textButtons}</div>`:''}</article>`;

  }

  function deckContents(player) {
    const groups=new Map();
    for (const card of player.deck) {
      const key=`${card.key}:${starterLevel(card)}:${card.starter?1:0}`;
      if (!groups.has(key)) groups.set(key,{key:card.key,upgraded:!!card.upgraded,level:starterLevel(card),starter:!!card.starter,count:0});
      groups.get(key).count++;
    }
    return [...groups.values()].sort((a,b)=>{
      const an=ALL_CARDS[a.key].name, bn=ALL_CARDS[b.key].name;
      return (an<bn?-1:an>bn?1:0) || Number(a.upgraded)-Number(b.upgraded) || Number(b.starter)-Number(a.starter);
    });
  }

  function renderDeck() {
    const player=state.players[viewSeat];
    $('#deck-button').disabled=replayMode;
    $('#deck-button').title=replayMode?'Replays record deck size only.':'Inspect remaining cards without revealing draw order.';
    if (replayMode) return;
    $('#deck-dialog-count').textContent=player.deck.length;
    $('#deck-row').innerHTML=deckContents(player).map(group=>`<div class="deck-card-group"><strong class="deck-card-count">${group.count}×</strong>${cardMarkup(group,'deck')}</div>`).join('') || '<p class="muted discard-empty">Your draw pile is empty. Discarded cards shuffle in when you next need to draw.</p>';
  }

  // A pile looks like a stack of cards: its edge thickens with the count; discard and in
  // play show their top card face up (a replay knows only the discard's size: face down).
  function renderPile(pile, count, top) {
    const button = $(`#${pile}-button`);
    button.style.setProperty('--depth', `${Math.min(6, Math.ceil(count / 3))}px`);
    button.dataset.empty = String(!count);
    const face = button.querySelector('.pile-card');
    if (!face) return;
    const definition = top && ALL_CARDS[top.key];
    face.classList.toggle('face-up', !!definition);
    face.style.setProperty('--card-accent', definition?.accent || 'transparent');
    const topName = definition ? `${definition.name}${starterLevel(top)===3?' III':top.upgraded?' II':''}` : '';
    face.innerHTML = topName ? `<span class="pile-name">${topName}</span>` : '';
    button.dataset.title ||= button.title;
    button.title = topName ? `${button.dataset.title}. Top card: ${topName}.` : button.dataset.title;
  }

  function renderHand() {
    const player=state.players[viewSeat];
    // Replays record pile sizes, not the order or contents of deck and discard.
    const discardCount=replayMode?player.discardCount:player.discard.length;
    $('#hand-title').dataset.count=player.hand.length;
    $('#deck-count').textContent=replayMode?player.deckCount:player.deck.length;
    renderDeck();
    $('#hand-pile-count').textContent=player.hand.length;
    $('#discard-count').textContent=discardCount;
    $('#in-play-count').textContent=player.inPlay.length;
    // Rules #storage-allocation: the permanent Storage pile beside the mat.
    const stored=player.storage||[];
    $('#storage-pile-count').textContent=stored.length;
    $('#storage-pile').setAttribute('aria-label',`Storage pile: ${stored.length} Capacity Module${stored.length===1?'':'s'}`);
    $('#storage-pile').title=stored.length?`Storage pile: ${stored.map(c=>RESOURCES.filter(r=>c.allocation?.[r]).map(r=>`+${c.allocation[r]} ${RESOURCE_NAMES[r]}`).join(', ')).join(' · ')}. Never reshuffled; the next Capacity Module costs 1 of each resource.`:'Storage pile: played Capacity Modules stay here. Your next one costs 1 of each resource.';
    renderPile('deck', replayMode?player.deckCount:player.deck.length, null);
    renderPile('discard', discardCount, replayMode?null:player.discard.at(-1));
    renderPile('in-play', player.inPlay.length, player.inPlay.at(-1));
    $('#in-play-dialog-count').textContent=player.inPlay.length;
    $('#in-play-row').innerHTML=player.inPlay.length?player.inPlay.map(card=>cardMarkup(card,'inPlay')).join(''):'<p class="muted discard-empty">No cards in play. Used cards stay here until the shared round cleanup.</p>';
    $('#discard-dialog-count').textContent=discardCount;
    $('#hand-row').innerHTML=player.hand.length?player.hand.map(card=>cardMarkup(card,'hand')).join(''):`<p class="muted">${replayMode?`${esc(player.name)}’s hand is empty.`:'Your hand is empty.'}</p>`;
    $('#discard-row').innerHTML=replayMode?'<p class="muted discard-empty">Replays record discard pile size, not its cards.</p>':player.discard.length?[...player.discard].reverse().map(card=>cardMarkup(card,'discard')).join(''):'<p class="muted discard-empty">Your discard pile is empty.</p>';
    $$('[data-resource-card]').forEach(button=>button.addEventListener('click',()=>playResourceMode(button.dataset.resourceCard)));
    $$('[data-order-card]').forEach(button=>button.addEventListener('click',()=>{
      playOrder(button.dataset.orderCard,button.dataset.orderMode);
      if (['move','construct','colonize','probe'].includes(state.actionMode)) $('#table-board')?.scrollIntoView?.({block:'start'});
    }));
    $$('[data-construct-draw]').forEach(button=>button.addEventListener('click',()=>useConstructDraw(ME,button.dataset.constructDraw)));
    $$('[data-order-draw]').forEach(button=>button.addEventListener('click',()=>useOrderDraw(ME,button.dataset.orderDraw)));
    $$('[data-buy-effect]').forEach(button=>button.addEventListener('click',()=>useBuyEffect(button.dataset.buyEffect,ME)));
    $$('[data-trash-hand]').forEach(button=>button.addEventListener('click',()=>$('#open-trash').click()));
    const prep=state.phase==='operations'&&state.activePlayer===ME&&state.turnStage==='prep';
    const convertAll = $('#convert-all-button');
    // Shown only when it can do something: you may convert now and hold a level I starter.
    convertAll.hidden = !canConvertCards() || !player.hand.some(canConvertCard);
    convertAll.disabled = convertAll.hidden;
    convertAll.innerHTML = `<span>Convert level I starters</span><span class="conversion-symbols" aria-hidden="true">${['matter','energy'].map(resource => resourceDot(resource)).join('')}</span>`;
    $('#finish-construct').hidden=replayMode || !state.pendingConstruct || state.activePlayer!==ME;
    $('#skip-colony-build').hidden=replayMode || !state.pendingColonyBuild || state.activePlayer!==ME;
    if (replayMode) {
      $('#hand-title').textContent=`${player.name}’s hand`;
      $('#hand-help').textContent=state.pendingColonyBuild?.playerId===viewSeat?'Colonize II: this faction may build once beside its new Colony at full cost, or finish without building.':'Every card this faction holds at this decision. Upgraded starter cards are marked II.';
      return;
    }
    $('#hand-help').textContent=state.pendingConstruct?.playerId===ME?`${pendingBuildName()}: choose a second full-cost build, convert cards if needed, or finish after one.`:state.pendingColonyBuild&&state.activePlayer===ME?'Colonize II: choose an adjacent hex for one building at full cost, convert cards if needed, or finish without building.':prep?'Use an order directly on a card, or convert cards for resources.':state.turnStage==='action'&&state.actionMode?`${state.actionOptions.cardName||'Order'} selected. You may still convert cards, cancel it, trade, or pass.`:state.turnStage==='action'?'Convert cards as needed, play one order card, make a Trade action, or pass.':'Keep Buy cards for your Buy turn and reactions for later attacks. Used cards stay in play; remaining hands and cards in play are discarded at shared round cleanup, then everyone draws five.';
  }

  // The Market and card-selection prompts share the same printed card and cost marks.
  function marketCardMarkup(card,tier,cost,enabled,why,attributes='') {
    const def=ALL_CARDS[card.key],player=state.players[ME],disabled=!enabled;
    const level=card.starter&&starterLevel(card)>1?` ${starterLevel(card)===3?'III':'II'}`:'';
    const text=def.text+(level?` ${level.trim()}: ${upgradedOrderText(card)}${starterLevel(card)===3&&card.key!=='construct'?' Draw one card when using the order.':''}`:'');
    const note=cost?marketBlockReason(player,cost,true).note:'';
    return `<button type="button" class="game-card ${def.military?'military-market-card':''} ${disabled?'unavailable':''}${cardEffectParts(def,card).length?' has-symbols':''}" style="--card-accent:${def.accent}" ${attributes} ${disabled?`disabled title="${esc(why)}"`:''} aria-label="${esc(tier.name)}: ${esc(def.code||'')} ${esc(def.name+level)}${def.military?', military deck':''}${disabled?`. Unavailable: ${esc(why)}`:''}">${cardSymbols(def,card)}<span class="card-name">${def.name}${level}</span>${def.resource?`<span class="card-gain" title="Converts for">${eachResourceGain(def.resource)?`<span class="gain-each">${eachResourceGain(def.resource)} each</span>`:resourceDots(def.resource)}</span>`:''}${cardIllustration(def)}<span class="card-effect">${resourceText(text)}</span><span class="card-icons" aria-hidden="true">${iconText(text)}</span><span class="card-footer"><small>${cost?'Buy':'In play'}</small>${cost?marketCostDots(player,cost):''}</span>${note?`<span class="card-limit-note">${esc(note)}</span>`:''}</button>`;
  }

  function renderMarket() {
    const humanBuy=!replayMode&&state.phase==='buy'&&state.activePlayer===ME;
    const me0=state.players[ME];
    $('#market-help').textContent=replayMode?`${state.players[viewSeat].name} purchased ${state.players[viewSeat].cardsPurchased||0} cards.`:`Buy as many cards as you can afford in your Buy turn${purchaseDiscount(me0)?` (${[me0.buyDiscountEach?'Trade Syndicate':'',me0.buyHubDiscounts?'Procurement Hub':''].filter(Boolean).join(' + ')}: ${purchaseDiscount(me0)} less of each resource on your next purchase)`:''}; military cards join your military deck. Rows: Expensive, Medium, Cheap. Starter upgrades are paid separately.`;
    $('#basic-market').innerHTML='';
    // Rules #market: three slots per tier, Expensive then Medium then Cheap; a slot whose deck ran out shows empty.
    const slots=MARKET_TIERS.flatMap(tier=>{
      const cards=state.market.map((card,index)=>({card,index,tier})).filter(slot=>marketTier(slot.card.key)===tier.id);
      return [...cards,...Array.from({length:Math.max(0,MARKET_TIER_SLOTS-cards.length)},()=>({tier}))];
    });
    $('#market-row').innerHTML=replayMode?'<p class="muted">Replays record purchases in the game log, not the market row.</p>':slots.map(({card,index,tier})=>{
      if(!card)return `<div class="game-card unavailable market-empty" data-market-tier="${tier.id}" role="note" aria-label="${tier.name} deck empty: this slot stays empty"><span class="card-type">${tier.name}</span><span class="card-name">Deck empty</span></div>`;
      const cost=purchaseCost(me0,card.key);
      const disabled=!humanBuy||!canAfford(me0,cost);
      const reason=marketBlockReason(me0,cost,humanBuy);
      const why=disabled?[reason.turn,reason.card].filter(Boolean).join(' ')||'You cannot buy this card now.':'';
      return marketCardMarkup(card,{...tier,name:tier.name+' market'},cost,!disabled,why,`data-buy-market="${index}" data-market-tier="${tier.id}" data-card-id="${card.id}"`);
    }).join('');
    $$('[data-buy-market]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(ME,'market',Number(button.dataset.buyMarket))){render();saveGame();}}));
    $('#finish-buy-button').hidden=!humanBuy;
    $('#hand-finish-buy-button').hidden=!humanBuy;
    for (const id of ['turn-notice','market-notice']) { const notice=$(`#${id}`); notice.hidden=replayMode||!autoNotice; notice.textContent=replayMode?'':autoNotice; }
    if (replayMode) { $('#decommission-area').innerHTML=''; renderUpgradeOffers(false); return; }
    const eligible=trashEligibleCards(state.players[ME]);
    const selectedResource = $('#trash-resource')?.value;
    // Keep the chosen payment while it can still pay; otherwise offer one that can.
    const canPayTrash = resource => state.players[ME].resources[resource]>=3;
    const trashResource = RESOURCES.includes(selectedResource) && (canPayTrash(selectedResource) || !RESOURCES.some(canPayTrash)) ? selectedResource : RESOURCES.find(canPayTrash) || 'matter';
    const trashOptions = RESOURCES.map(resource =>
      `<option value="${resource}" ${resource===trashResource?'selected':''}>${RESOURCE_NAMES[resource]}</option>`
    ).join('');
    const trashButtons = eligible.map(card => `
      <button class="button" data-trash="${card.id}" ${state.players[ME].resources[trashResource]<3?'disabled':''}>
        ${ALL_CARDS[card.key].name}${starterLevel(card)===3?' III':card.upgraded?' II':''}${card.starter?' · starter':''} <small>${state.players[ME].inPlay.includes(card)?'in play':state.players[ME].hand.includes(card)?'in hand':'in discard'}</small>
      </button>`).join('');
    $('#open-trash').hidden=!humanBuy;
    $('#open-trash').textContent=`Trash a card${eligible.length?` (${eligible.length} eligible)`:''}`;
    if (!humanBuy && $('#trash-dialog').open) $('#trash-dialog').close();
    $('#decommission-area').innerHTML = humanBuy ? `
      <div class="decommission-list">
        <strong>Trash a card</strong>
        <label>Pay 3 <select id="trash-resource">${trashOptions}</select></label>
        ${trashButtons || '<span class="muted">No eligible cards in hand, discard or in play</span>'}
      </div>` : '';
    $('#trash-resource')?.addEventListener('change',renderMarket);
    $$('[data-trash]').forEach(button=>button.addEventListener('click',()=>{if(decommission(ME,button.dataset.trash,$('#trash-resource').value)){render();saveGame();}}));
    renderUpgradeOffers(humanBuy);
    tierMarket();
  }


  // Why a market card cannot be bought now, read from the same cost, limit and purchase
  // state the engine's buyCard checks: turn is the shared reason, card is this card's own.
  // A gain of the same amount of every resource reads as "+1 each" on a compact card top.
  function eachResourceGain(gain) {
    const amounts=RESOURCES.map(resource=>gain[resource]||0);
    return amounts[0]>0 && amounts.every(amount=>amount===amounts[0]) ? amounts[0] : 0;
  }
  // Market prices mark each resource you cannot pay yet: a padlock where the price is above
  // that resource's limit (raise capacity first), a faded chip where you hold too little.
  const LOCK_ICON = '<svg class="chip-lock" viewBox="0 0 12 14" aria-hidden="true" focusable="false"><path d="M3 6V4.5a3 3 0 0 1 6 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1" y="6" width="10" height="7.5" rx="1.6" fill="currentColor"/></svg>';
  function marketCostDots(player,cost) {
    const present=RESOURCES.filter(resource=>cost?.[resource]);
    if (!present.length) return resourceDots(cost);
    const limits=resourceLimits(ME);
    const mark=resource=>cost[resource]>limits[resource]?'locked':cost[resource]>player.resources[resource]?'short':'';
    const marks=Object.fromEntries(present.map(resource=>[resource,{mark:mark(resource),label:mark(resource)==='locked'?`, above your limit of ${limits[resource]}`:'',
      title:`${cost[resource]} ${RESOURCE_NAMES[resource]}${mark(resource)==='locked'?` · your limit is ${limits[resource]}`:mark(resource)==='short'?` · you hold ${player.resources[resource]}`:''}`,icon:mark(resource)==='locked'?LOCK_ICON:''}]));
    return cornerDots(cost,'',marks);
  }
  function marketBlockReason(player,cost,humanBuy) {
    const limits=resourceLimits(ME);
    const turn=!humanBuy?'Buy during your Buy turn.':'';
    const tooSmall=RESOURCES.filter(r=>(cost[r]||0)>limits[r]);
    const short=RESOURCES.filter(r=>(cost[r]||0)>player.resources[r]);
    const card=tooSmall.length?`Raise ${tooSmall.map(r=>`${RESOURCE_NAMES[r]} capacity to ${cost[r]}`).join(' and ')}.`
      :!canAfford(player,cost)&&short.length?`Needs ${short.map(r=>`${cost[r]-player.resources[r]} more ${RESOURCE_NAMES[r]}`).join(' and ')}.`:'';
    const brief=tooSmall.length?`Limit: ${tooSmall.map(r=>`${RESOURCE_NAMES[r]} ${cost[r]}`).join(', ')}`:card;
    return {turn,card,note:brief.replace(/\.$/,'')};
  }
  // Rules #buy: original starters upgrade from hand, discard or in play during your Buy turn.
  // Each starter's next level is offered beside the market like a card; choosing it asks
  // which copy to upgrade and which resource pays. Level I -> II costs 2, II -> III costs 3.
  let upgradeChoiceKey = null;
  const UPGRADE_STARTERS = ['move','construct'];
  const upgradePile = (player,card) => player.hand.includes(card)?'in hand':player.inPlay.includes(card)?'in play':'in discard';
  function upgradeableStarters(player,key) {
    return [...player.hand,...player.discard,...player.inPlay].filter(card=>card.key===key&&card.starter&&starterLevel(card)<3);
  }
  const LEVEL_NAMES = ['','I','II','III'];
  // The market's rows run from the most expensive cards (just under the relics) to the cheapest,
  // three cards to a row.
  // Rules #market-tiers: each card, or an empty-deck slot, lies in its own price row
  // (Expensive, Medium, Cheap) as the engine dealt it, three to a row.
  function tierMarket() {
    [...($('#market-row')?.children || [])].forEach((card, place) => {
      const row = MARKET_TIERS.findIndex(tier => tier.id === card.dataset?.marketTier);
      if (row < 0) return;
      card.dataset.tier = MARKET_TIERS[row].id;
      card.style.setProperty('--tier-row', String(row + 1));
      card.style.setProperty('--tier-span', '4');
      card.style.setProperty('order', String(place));
    });
  }
  function renderUpgradeOffers(humanBuy) {
    const me=state.players[ME], area=$('#upgrade-market');
    area.hidden=replayMode;
    if (replayMode) { area.innerHTML=''; return; }
    area.innerHTML=UPGRADE_STARTERS.flatMap(key=>[2,3].map(level=>{
      // Level II upgrades a level I copy for 2 of one resource; level III a level II copy for 3.
      const def=ALL_CARDS[key], ready=upgradeableStarters(me,key).filter(card=>starterLevel(card)===level-1), price=level===2?2:3;
      const inDeck=me.deck.filter(card=>card.key===key&&card.starter&&starterLevel(card)===level-1).length;
      const note=[ready.length?`${ready.length} ready`:'',inDeck?`${inDeck} in deck`:''].filter(Boolean).join(' · ')||`No level ${LEVEL_NAMES[level-1]} copy`;
      const canPay=RESOURCES.some(resource=>me.resources[resource]>=price);
      const reason=!humanBuy?'Upgrade during your Buy turn.':!ready.length?`No level ${LEVEL_NAMES[level-1]} ${def.name} in hand, discard or in play.`:!canPay?`Needs ${price} of one resource.`:'';
      // The printed text of the copy you get, in the card vocabulary. A card with no conversion box
      // cannot convert, so it says nothing about conversion.
      const copy={key,starter:true,upgraded:true,level}, extraDraw=level===3&&key!=='construct';
      const effect=iconText(`${upgradedOrderText(copy)}${extraDraw?' Draws one card when used as an order.':''}`);
      return `<button class="game-card upgrade-offer ${reason?'unavailable':''}${cardEffectParts(def,copy).length?' has-symbols':''}" style="--card-accent:${def.accent}" data-upgrade-offer="${key}" data-upgrade-level="${level}" ${reason?`disabled title="${reason}"`:''} aria-label="Upgrade ${esc(def.name)} to level ${LEVEL_NAMES[level]} for ${price} of one resource; does not use a purchase${reason?`. Unavailable: ${reason}`:''}">${cardSymbols(def,copy)}<span class="card-name">${def.name} ${LEVEL_NAMES[level]}</span>${cardIllustration(def)}<span class="card-effect">${effect}</span><span class="card-footer"><small>Upgrade</small><span class="upgrade-price pay-options" aria-hidden="true"><strong>${price}</strong>${RESOURCES.map(resource=>`<span class="pay-chip ${me.resources[resource]>=price?'can':'cannot'}" data-pay="${resource}">${resourceDot(resource)}</span>`).join('')}</span><span class="sr-only">${price} of one resource</span></span><span class="card-limit-note">${note}</span></button>`;
    })).join('')+capacityOffer(humanBuy)+trashPile(humanBuy);
    $$('[data-upgrade-offer]').forEach(button=>button.addEventListener('click',event=>openUpgradeChoice(button.dataset.upgradeOffer,event.target.closest?.('.pay-chip.can')?.dataset.pay)));
    $$('[data-capacity-offer]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(ME,'capacity','capacityModule')){render();saveGame();}}));
    $('[data-trash-pile]')?.addEventListener('click',()=>$('#open-trash')?.click());
    if ($('#upgrade-dialog').open) renderUpgradeChoice();
  }
  // The Trash pile lies with the upgrades: during your Buy turn it opens the trash choice.
  function trashPile(humanBuy) {
    const label=($('#open-trash')?.textContent||'Trash a card').replace('Trash a card','').trim();
    return `<button class="game-card upgrade-offer trash-pile ${humanBuy?'':'unavailable'}" type="button" data-trash-pile ${humanBuy?'':'disabled title="Trash a card during your Buy turn."'} aria-label="Trash pile: pay 3 of one resource per card to trash from your deck${humanBuy?'':'. Unavailable: during your Buy turn only.'}"><span class="card-name">Trash pile</span><span class="card-effect">Pay 3 of one resource per card. Remove a card${label?` ${label}`:''}.</span></button>`;
  }
  // Rules #capacity-module: the shared Capacity Module pile lies with the starter upgrades,
  // showing the fixed price (1 of each resource). Choosing it buys one.
  function capacityOffer(humanBuy) {
    const me=state.players[ME],def=SUPPLY_CARDS.capacityModule,left=state.capacitySupply||0,cost=storageUpgradeCost(ME),stored=(me.storage||[]).length;
    const reason=!humanBuy?'Buy during your Buy turn.':!left?'The capacity pile is empty.':!canAfford(me,cost)?`Needs ${cost.matter} of each resource.`:'';
    return `<button class="game-card upgrade-offer capacity-offer ${reason?'unavailable':''}" style="--card-accent:${def.accent}" data-capacity-offer="capacityModule" ${reason?`disabled title="${reason}"`:''} aria-label="Buy a Capacity Module for ${cost.matter} of each resource (${stored} in your Storage pile); ${left} left in the pile${reason?`. Unavailable: ${reason}`:''}"><span class="card-type">${left} left</span><span class="card-name">${def.name}</span><span class="card-effect">${iconText('Play in Operations: split 4 points among your resource limits, then store this card.')}</span><span class="card-footer"><small>${stored} stored</small><span class="upgrade-price pay-options" aria-hidden="true"><strong>${cost.matter}</strong>${RESOURCES.map(resource => `<span class="pay-chip ${me.resources[resource]>=cost[resource]?'can':'cannot'}">${resourceDot(resource)}</span>`).join('')}</span><span class="sr-only">${cost.matter} of each resource</span></span></button>`;
  }
  function openUpgradeChoice(key, pay) {
    upgradeChoiceKey=key;
    const me=state.players[ME], select=$('#upgrade-resource');
    const price=Math.min(3,...upgradeableStarters(me,key).map(upgradePrice));
    if (RESOURCES.includes(pay) && me.resources[pay]>=price) select.value=pay;
    if (!RESOURCES.includes(select.value) || me.resources[select.value]<price) select.value=RESOURCES.find(resource=>me.resources[resource]>=price) || 'matter';
    renderUpgradeChoice();
    if (!$('#upgrade-dialog').open) $('#upgrade-dialog').showModal();
  }
  function renderUpgradeChoice() {
    const key=upgradeChoiceKey, me=state.players[ME];
    if (!key) return;
    const humanBuy=!replayMode&&state.phase==='buy'&&state.activePlayer===ME;
    const resource=$('#upgrade-resource').value, name=ALL_CARDS[key].name;
    const cards=upgradeableStarters(me,key).sort((x,y)=>starterLevel(x)-starterLevel(y));
    const turnReason=!humanBuy?'Upgrade during your Buy turn.':'';
    $('#upgrade-dialog-title').textContent=`Upgrade ${name}`;
    $('#upgrade-dialog-status').textContent=turnReason || `Level I → II costs 2 ${RESOURCE_NAMES[resource]}; II → III costs 3. Purchases are not affected.`;
    $('#upgrade-options').innerHTML=cards.length?cards.map(card=>{
      const level=starterLevel(card), price=upgradePrice(card), short=me.resources[resource]<price;
      return `<button class="button" type="button" data-upgrade-card="${card.id}" ${turnReason||short?'disabled':''} ${short&&!turnReason?`title="Needs ${price} ${RESOURCE_NAMES[resource]}"`:''}>${name} ${LEVEL_NAMES[level]} → ${LEVEL_NAMES[level+1]} · ${price} ${RESOURCE_NAMES[resource]} <small>${upgradePile(me,card)}</small></button>`;
    }).join(''):`<p class="muted">No upgradeable ${name} is in your hand, discard or in play.</p>`;
    $$('[data-upgrade-card]').forEach(button=>button.addEventListener('click',()=>{
      if (upgradeStarter(ME,button.dataset.upgradeCard,$('#upgrade-resource').value)) { $('#upgrade-dialog').close(); render(); saveGame(); }
    }));
  }
  // Rules #military-deck: military cards you bought, a pile of their own beside Deck and In play.
  // It is never drawn, shuffled or discarded; every battle each card is one extra tactic, used once
  // and back for the next battle. During your battle the pile counts the military tactics still
  // unused in it, and its inspect view marks the used ones.
  function battleSideOf(playerId) {
    const battle = state.pendingCombat;
    if (!battle) return null;
    return battle.attackerId === playerId ? 'attacker' : battle.defenderId === playerId ? 'defender' : null;
  }
  function renderMilitaryPile() {
    const button = $('#military-button');
    if (!button) return;
    const player = state.players[viewSeat], owned = player.military || [];
    const side = battleSideOf(viewSeat), left = side ? state.pendingCombat.hands?.[side] : null;
    const counts = {};
    for (const card of owned) counts[card.key] = (counts[card.key] || 0) + 1;
    const unused = left ? Object.keys(counts).reduce((n, key) => n + Math.min(counts[key], left[key] ?? counts[key]), 0) : owned.length;
    const total = Object.values(BASIC_TACTIC_HAND).reduce((n, c) => n + c, 0) + owned.length;
    $('#military-count').textContent = unused;
    renderPile('military', unused, null);
    button.classList.toggle('in-battle', !!left);
    const who = replayMode ? `${player.name}’s` : 'Your';
    button.setAttribute('aria-label', `${who} military deck: ${owned.length} military card${owned.length === 1 ? '' : 's'}${left ? `, ${unused} unused in this battle` : ''}. Inspect`);
    $('#military-dialog-count').textContent = owned.length;
    $('#military-dialog-help').textContent = `${left ? `In this battle: ${Object.values(left).reduce((n, c) => n + c, 0)} of ${total} tactics left. ` : ''}Military cards you bought. They never enter your hand, draw pile or discard. Each battle you hold 2 Concentrated Fire, 2 Defensive Screen and every card here (${total} tactics), each usable once; used tactics return for the next battle.`;
    const usedOf = key => left ? Math.max(0, (key in BASIC_TACTIC_HAND ? BASIC_TACTIC_HAND[key] : counts[key] || 0) - (left[key] || 0)) : 0;
    const usedNote = key => usedOf(key) ? `<small class="military-used">${usedOf(key)} used this battle</small>` : '';
    $('#military-row').innerHTML = Object.entries(counts).map(([key, count]) => `<div class="deck-card-group${left && !left[key] ? ' spent' : ''}"><strong class="deck-card-count">${count}×</strong>${cardMarkup({ key }, 'military')}${usedNote(key)}</div>`).join('')
      || `<p class="muted discard-empty">${replayMode ? `${esc(player.name)} owns` : 'You own'} no military cards yet. Military cards bought from the market join this deck.</p>`;
    $('#military-basic-row').innerHTML = Object.entries(BASIC_TACTIC_HAND).map(([key, count]) => {
      const card = MILITARY_CARDS[key];
      const stats = [card.attack ? `Attack +${card.attack}` : '', card.shield ? `Shield ${card.shield}` : ''].filter(Boolean).join(' · ');
      return `<article class="military-card${left && !left[key] ? ' spent' : ''}"><strong>${count}× ${card.name}</strong><span>${resourceText(card.text)}</span><small>Basic tactic · ${stats}</small>${usedNote(key)}</article>`;
    }).join('');
  }

  function renderTrade() {
    ['give','get'].forEach((side,index)=>{
      const select=$(`#trade-${side}-type`);
      if (!select.options.length) {
        select.innerHTML=RESOURCES.map(r=>`<option value="${r}">${RESOURCE_NAMES[r]}</option>`).join('');
        select.value=RESOURCES[index];
      }
    });
    $('#trade-form').hidden=replayMode;
    $('#trade-form').querySelector('button').disabled=!(!replayMode&&state.phase==='operations'&&state.activePlayer===ME&&['prep','action'].includes(state.turnStage)&&!state.players[ME].tradeUsed);
    const offers=state.tradeOffers.filter(o=>o.round===state.round || o.status==='open');
    $('#trade-offers').innerHTML=offers.length?[...offers].reverse().map(o=>{
      const canRespond=!replayMode&&tradeResponseAllowed(ME,o), reason=canRespond&&tradeBlockReason(ME,o);
      const status=o.status==='accepted'?`Accepted by ${esc(state.players[o.acceptedBy].name)}`:o.status==='open'?'Open to all factions':o.status[0].toUpperCase()+o.status.slice(1);
      return `<article class="trade-offer"><div class="trade-offer-heading"><strong>${esc(state.players[o.from].name)}</strong><span class="offer-status">${status}</span></div>
        <div class="trade-terms"><span>Offers ${resourceDots({[o.giveType]:o.giveAmount})}</span><span aria-hidden="true">→</span><span>Asks for ${resourceDots({[o.getType]:o.getAmount})}</span></div>
        <p>${o.responses.map((r,id)=>id===o.from?'':`${esc(state.players[id].name)}: ${r==='pending'&&o.status!=='open'?'no response':r}`).filter(Boolean).join(' · ')}</p>
        ${canRespond?`<div class="trade-offer-actions"><button class="button button-primary" data-trade-accept="${o.id}" ${reason?'disabled':''}>Accept offer</button><button class="button button-ghost" data-trade-reject="${o.id}">Reject offer</button></div>${reason?`<p>${reason}</p>`:''}`:''}
        ${!replayMode&&o.from===ME&&o.status==='open'?`<button class="button button-ghost" data-trade-cancel="${o.id}" ${state.activePlayer!==ME?'disabled':''}>Withdraw offer</button>`:''}</article>`;
    }).join(''):'<p class="muted">No offers this round. Publish one to open negotiations.</p>';
    for (const response of ['accept','reject','cancel']) $$(`[data-trade-${response}]`).forEach(button=>button.addEventListener('click',()=>{
      const id=Number(button.getAttribute(`data-trade-${response}`));
      if (response==='cancel') cancelTrade(ME,id); else respondTrade(ME,id,response);
    }));
    const pending=state.tradeOffers.filter(o=>o.status==='open'&&(replayMode||o.from!==ME&&o.responses[ME]==='pending')).length;
    $('#open-trade').textContent=pending?`Trade (${pending} open)`:'Trade';
    $('#trade-ledger').innerHTML=state.players.filter(player=>player.id!==viewSeat).map(player=>`<div><span>${esc(player.name)}</span><strong>${state.players[viewSeat].tradesWith[player.id]} completed</strong></div>`).join('');
  }

  // Board edges: the round's phases and the primary action.
  // Rules #round: the next hand is drawn at cleanup, so there is no separate Draw step.
  const STEPPER_PHASES = ['production','operations','buy','cleanup'];
  function renderBoardEdges() {
    $('#stepper-round').textContent = `Round ${state.round}`;
    const steps = $('#phase-stepper-steps');
    steps.innerHTML = STEPPER_PHASES.map(phase => `<li class="${phase===state.phase?'current':''}" ${phase===state.phase?'aria-current="step"':''}>${phaseLabel(phase)}</li>`).join('');
  }
  function renderBoardPrimary() {
    const primary = $('#board-primary');
    const pass = !$('#pass-button').hidden, finish = !$('#hand-finish-buy-button').hidden;
    primary.hidden = replayMode || !(pass || finish);
    primary.textContent = pass ? 'Pass & buy' : 'Finish Buy';
    primary.className = `button board-primary ${pass ? 'button-danger' : 'button-primary'}`;
    primary.dataset.target = pass ? 'pass-button' : 'hand-finish-buy-button';
  }

  function renderHeader() {
    $('#round-value').textContent=state.round;
    $('#phase-value').textContent=phaseLabel(state.phase);
    $('#active-value').textContent=state.winner!==null?'Game over':state.players[state.activePlayer].name;
    renderBoardEdges();
    if (replayMode) { renderReplayDecision(); return; }
    const humanTurn=state.activePlayer===ME&&state.winner===null;
    // On your turn your hand glows and gently pulses instead of a 'Your turn' banner; the turn title
    // stays for screen readers.
    document.body?.classList?.toggle('my-turn', humanTurn && !replayMode);
    const otherHuman=state.players[state.activePlayer]?.controller==='human';
    $('#turn-dot').style.background=state.players[state.activePlayer]?.color||'var(--cyan)';
    $('#turn-title').textContent=state.winner!==null?`${state.players[state.winner].name} won`:humanTurn?'Your turn':`${state.players[state.activePlayer].name} is acting`;
    let instruction='';
    if(state.phase==='operations')instruction=humanTurn?(state.turnStage==='prep'?'Use an order on a card, convert resources, trade, or pass.':'Choose one order, Trade action, or pass.'):otherHuman?`${state.players[state.activePlayer].name} is choosing an order…`:'Computer rival is evaluating the board…';
    else if(state.phase==='buy')instruction=humanTurn?'Buy now, upgrade or trash cards, then finish to let remaining factions continue.':otherHuman?`${state.players[state.activePlayer].name} is shopping the market…`:'Computer rival is shopping the market…';
    else instruction='Resolving automatic bookkeeping…';
    $('#report-button').hidden=!state.lastCombat || !!state.pendingCombat;
    $('#turn-instruction').textContent=state.pendingConstruct?.playerId===ME?`${pendingBuildName()}: build one more thing at full cost, or finish after one.`:state.pendingCombat?'Battle pending: finish escape and secret tactic choices.':state.pendingConsortium?'Choose your Trade Consortium gain or exchanges.':state.pendingColonyBuild?.playerId===ME?'Colonize II: choose an adjacent building at full cost, or finish without building.':instruction;
    $('#pass-button').hidden=!!state.pendingCombat || !(state.phase==='operations'&&humanTurn&&(state.turnStage==='prep'||state.turnStage==='action'));
    const undoButton=$('#undo-turn-button');
    undoButton.disabled=!!state.pendingConstruct || !!state.pendingCombatReport || !!state.pendingCombat || !turnHistory.undo;
    undoButton.title=turnHistory.undo?`Restore the start of your ${turnHistory.undo.label}`:'Available after you complete a turn';
    if (network) {
      // Shared tables: the table service decides how far back this turn can go.
      undoButton.disabled=!serverUndo.available || network.busy();
      undoButton.title=serverUndo.available
        ? (serverUndo.stop ? `Take back your choices since ${serverUndo.stop} (Undo cannot go back past that).` : 'Restore your latest turn and any later bot turns, until another human acts.')
        : serverUndo.reason || 'Available until another human acts.';
    }
  }

  // Names a recorded decision with the same labels as the live table's buttons.
  // `before` is the replay observer state the decision was made from.
  function describeDecision(seat, action, before, names) {
    const place = coord => `${before.planets[coord]?.name || 'Empty space'} (${coord})`;
    const amount = (n, type) => `${n} ${RESOURCE_NAMES[type]}`;
    const gains = gain => RESOURCES.filter(type => gain?.[type]).map(type => amount(gain[type],type)).join(', ');
    const held = before.players[seat]?.hand?.find(card => card.id === action.card);
    const cardName = (fallback) => held ? `${ALL_CARDS[held.key].name}${held.upgraded ? ' II' : ''}` : ALL_CARDS[action.key]?.name || fallback;
    const order = `Use order · ${cardName('Order')}`;
    const offer = before.tradeOffers?.find(o => o.id === action.offer);
    switch (action.type) {
      case 'combat_tactic': return {text:`Commit ${MILITARY_CARDS[action.tactic].name}`,coords:[before.pendingCombat?.coord].filter(Boolean)};
      case 'combat_stay': return {text:'Keep Explorers in battle'};
      case 'combat_escape': return {text:`Pay ${action.amount} Energy: escape with ${action.amount} Explorers to ${place(action.destination)}`,coords:[action.destination]};
      case 'pass': return { text: 'Pass & buy' };
      case 'consortium_gain': return { text: `Trade Consortium · Gain ${amount(1,action.resource)}` };
      case 'consortium_exchange': return { text: `Trade Consortium · ${amount(2,action.giveType)} → ${amount(1,action.getType)}` };
      case 'finish_consortium': return { text: 'Finish Trade Consortium after one exchange' };
      case 'cancel_consortium': return { text: 'Cancel Trade Consortium without using the card' };
      case 'bank_trade': return { text: `Bank exchange · ${amount((before.players[seat]?.bankExchangeResources||[]).includes(action.giveType)?2:4,action.giveType)} → ${amount(1,action.getType)}` };
      case 'increase_storage': return { text: `Buy 4 capacity points · ${RESOURCES.filter(r=>action.allocation?.[r]).map(r=>`+${action.allocation[r]} ${RESOURCE_NAMES[r]}`).join(', ')}` };
      case 'discard_resources': return { text: `Discard ${amount(action.amount,action.resource)} to free storage` };
      case 'resource': return { text: `Convert to resources · ${cardName('Card')} → ${gains(action.gain)}` };
      case 'move': return { text: `${order} · ${action.units ? moveOrderLabel(action.units) : action.moveGroup === 'explorer' ? 'Move Explorers' : 'Move Settlers & Fleets'} from ${place(action.source)} to ${place(action.destination)}`, coords: [action.source, action.destination], source: action.source };
      case 'build': {
        const planet = before.planets[action.coord];
        const label = STRUCTURES[action.kind] ? `Build ${STRUCTURES[action.kind].name}`
          : action.kind === 'explorer' ? 'Recruit Explorer' : `Commission ${SHIP_STATS[action.kind]?.name || action.kind}`;
        const discount = action.discountResource === 'free' ? ' · No resource cost' : action.discountResource === 'each' ? ' · −1 of each resource' : '';
        return { text: `${order} · ${label} at ${place(action.coord)}${discount}`, coords: [action.coord] };
      }
      case 'colonize': {
        const planet = before.planets[action.coord];
        const capture = planet?.owner !== null && planet?.owner !== undefined && planet.owner !== seat;
        return { text: `${order} · ${capture ? 'Capture planet' : 'Found Colony'} at ${place(action.coord)}`, coords: [action.coord] };
      }
      case 'colony_build': return { text: `Colonize II · Build ${STRUCTURES[action.kind]?.name || action.kind} at ${place(action.coord)} at full cost`, coords: [action.coord] };
      case 'construct_draw': return {text:'Construct III · Draw 1 without building'};
      case 'order_draw': return {text:'Seed Ark · Draw 2 instead of colonizing'};
      case 'finish_construct': return {text:`Finish ${before.pendingConstruct?.cardName||'Construct II'} after one build`};
      case 'second_build': return {text:`${before.pendingConstruct?.cardName||'Construct II'} second build · ${STRUCTURES[action.kind]?.name||SHIP_STATS[action.kind]?.name} at ${place(action.coord)}`,coords:[action.coord]};
      case 'finish_colony_build': return { text: 'Colonize II · Finish without building' };
      case 'probe': return { text: `${order} · Probe ${place(action.coord)} for a private relic location`, coords:[action.coord] };
      case 'excavate': return { text: `${order} · Excavate at ${place(action.coord)} · Choose ${ALL_CARDS[before.relicRow?.find(card=>card.id===action.relic)?.key]?.name || 'alien relic'}`, coords:[action.coord] };
      case 'special': return { text: `${order}${action.resource?' · 2:1 '+RESOURCE_NAMES[action.resource]+' until Buy ends':''}${action.allocation?' · '+RESOURCES.filter(r=>action.allocation[r]).map(r=>`+${action.allocation[r]} ${RESOURCE_NAMES[r]} capacity`).join(', '):''}${action.trash?' · Trash '+(action.trash.map(id=>ALL_CARDS[before.players[seat]?.discard?.find(c=>c.id===id)?.key]?.name||'a starter').join(' and ')||'nothing'):''}` };
      case 'trade_offer': return { text: `Publish open offer · Offers ${amount(action.giveAmount,action.giveType)} → Asks for ${amount(action.getAmount,action.getType)}` };
      case 'trade_accept': return { text: `Accept offer${offer ? ` from ${names[offer.from]}` : ''}` };
      case 'trade_reject': return { text: `Reject offer${offer ? ` from ${names[offer.from]}` : ''}` };
      case 'trade_cancel': return { text: 'Withdraw offer' };
      case 'buy': return { text: `Buy ${ALL_CARDS[action.key]?.name || 'a card'}${action.source === 'market' ? ' from the market' : ''}` };
      case 'finish_buy': return { text: 'Finish Buy' };
      case 'upgrade': return { text: `Upgrade starter · ${cardName('a starter card')} → II · ${amount(2,action.resource)}` };
      case 'buy_effect': return { text: `Use in Buy · ${cardName('Card')}` };
      case 'decommission': { const p = before.players[seat], trashed = [...(p?.hand||[]), ...(p?.discard||[]), ...(p?.inPlay||[])].find(card => card.id === action.card); return { text: `Trash ${trashed ? `${ALL_CARDS[trashed.key].name}${trashed.upgraded ? ' II' : ''}` : 'a card'} · ${amount(3,action.resource)}` }; }
      case 'discard_overflow': return { text: `Discard excess resources · ${amount(action.amount,action.resource)}` };

      default: return { text: String(action.type || 'Decision') };
    }
  }

  // Fills the live state shape from a recorded observer state. Fields replays do not
  // record (market, deck order, military decks) stay empty and their panels say so.
  function replayState(view, extra) {
    const pending = extra.pendingColonyBuild || null;
    const decision = extra.decision || null;
    state = {
      round: view.round, phase: view.phase, activePlayer: view.active ?? 0, winner: view.winner ?? null, firstPlayer: 0, victoryTarget: view.victoryTarget,
      players: view.players.map((p, id) => ({ ...p, id, inPlay:p.inPlay || [], military:p.military || [], name: extra.names[id], color: PLAYER_COLORS[id], cardsPurchased: extra.cardsPurchased[id], tradesWith: extra.tradesWith[id] })),
      planets: view.planets, clusters: view.clusters, fleets: view.fleets, relicRow: view.relicRow || [], relicDeck: [], relicDeckCount: view.relicDeckCount || 0, pendingConsortium: view.pendingConsortium || null,
      pendingCombat: view.pendingCombat || null, log: view.log || [], lastCombat: view.lastCombat || null, tradeOffers: view.tradeOffers || [], market: [],
      selected: extra.selected || null, actionMode: null, actionOptions: {}, turnStage: 'waiting', pendingColonyBuild: pending, pendingConstruct: view.pendingConstruct || extra.pendingConstruct || null,
      moveSource: decision?.source || null, reachable: [], replayDecision: decision, replayElo: extra.elo || null
    };
    if (pending) state.reachable = adjacentKeys(pending.colony).filter(key => canBuildStructureAt(pending.playerId,key));
    else if (decision?.coords) state.reachable = decision.coords.filter(key => key !== decision.source);
    return state;
  }

  function renderReplayDecision() {
    const decision = state.replayDecision;
    const seat = decision ? decision.seat : state.activePlayer;
    $('#turn-dot').style.background = state.players[seat]?.color || 'var(--cyan)';
    $('#turn-title').textContent = state.winner !== null ? `${state.players[state.winner].name} won` : decision ? state.players[decision.seat].name : 'Opening position';
    const pending = state.pendingColonyBuild ? ` Colonize II: ${state.players[state.pendingColonyBuild.playerId].name} may build once beside its new Colony at full cost.` : '';
    $('#turn-instruction').textContent = `${decision ? decision.text : 'Before the first decision.'}${pending}`;
    $('#pass-button').hidden = true;
    const report = $('#report-button');
    report.hidden = !(state.winner !== null || decision?.combat);
    report.textContent = state.winner !== null ? 'Final standings' : 'Combat report';
  }

  function showReplayReport() {
    if (state.winner === null) {
      const combat = state.lastCombat;
      if (combat) showMessage('COMBAT REPORT', nameForCoord(combat.coord), [...combat.summary,combat.outcome].join(' '));
      return;
    }
    const standings = state.players.map((player,id) => ({ player, id, prestige: calculatePrestige(id), colonies: colonyPlanets(id).length, resources: totalResources(player) }))
      .sort((a,b) => b.prestige-a.prestige || b.colonies-a.colonies || b.resources-a.resources);
    showMessage('GAME COMPLETE', victoryTitle(), standings.map(({player,id,prestige,colonies,resources},rank) => {
      const elo = state.replayElo?.[id];
      return `${rank+1}. ${player.name}: ${prestige} Prestige · ${colonies} Colonies · ${resources} stored resources${elo ? ` · Elo ${Math.round(elo.before)} → ${Math.round(elo.after)}` : ''}`;
    }).join('\n'));
  }

  function storageAllocationValues() {
    return Object.fromEntries(RESOURCES.map(r=>{const value=$(`#storage-points-${r}`).value;return [r,value===''?NaN:Number(value)];}));
  }
  // Use the existing start/shift/confirm commands, including at shared tables.
  // This is a different way to choose the same legal redistribution, not a new action.
  function reservoirCommands(limits) {
    const pending=state.pendingRelic,p=state.players[ME],base=resourceLimits(ME);
    if(!RESOURCES.every(r=>Number.isSafeInteger(limits[r])&&limits[r]>=Math.max(STARTING_LIMIT,p.resources[r]))
      ||RESOURCES.reduce((n,r)=>n+limits[r]-base[r],0)!==0)return null;
    const actions=network?(serverHints.relics||[]):pending?relicDraftActions(ME):relicOperations(ME);
    const commands=[];
    if(pending) {
      if(pending.playerId!==ME||pending.card!==storageAllocationDraft?.cardId||!actions.some(a=>a.type==='relic_confirm'))return null;
    } else {
      const start=actions.find(a=>a.ability==='reservoir'&&a.card===storageAllocationDraft?.cardId);
      if(!start)return null;
      commands.push(start);
    }
    const current=pending?.limits||base,remaining=Object.fromEntries(RESOURCES.map(r=>[r,limits[r]-current[r]]));
    for(const giveType of RESOURCES)for(const getType of RESOURCES) {
      if(remaining[giveType]>=0||remaining[getType]<=0)continue;
      const amount=Math.min(-remaining[giveType],remaining[getType]);
      commands.push({type:'relic_shift',giveType,getType,amount});
      remaining[giveType]+=amount;remaining[getType]-=amount;
    }
    commands.push({type:'relic_confirm'});
    return commands;
  }
  function commitReservoirAllocation(commands) {
    reservoirCommitting=true;
    try {
      for(const command of commands)if(!applyRelicAction(ME,command))return false;
      return true;
    } finally {reservoirCommitting=false;render();}
  }
  function updateStorageAllocation() {
    if (!storageAllocationDraft) return;
    const allocation=storageAllocationValues();
    const total=RESOURCES.reduce((n,r)=>n+allocation[r],0);
    if(storageAllocationDraft.redistribute) {
      const base=storageAllocationDraft.base,limits=Object.fromEntries(RESOURCES.map(r=>[r,base[r]+allocation[r]]));
      RESOURCES.forEach(r=>{$(`#storage-limit-${r}`).textContent=`Current ${base[r]} → ${Number.isSafeInteger(limits[r])?limits[r]:'—'}`;});
      const sameBase=RESOURCES.every(r=>base[r]===resourceLimits(ME)[r]);
      const valid=sameBase&&!!reservoirCommands(limits);
      $('#storage-allocation-status').textContent=!Number.isSafeInteger(total)?'Enter whole-number changes.':`Net change: ${total>0?'+':''}${total}${valid?' · Balanced':total!==0?' · Must be 0':' · Keep every limit at least 4 and high enough for your resources.'}`;
      $('#storage-allocation-confirm').disabled=!valid;
      return;
    }
    RESOURCES.forEach(r=>{$(`#storage-limit-${r}`).textContent=`Current ${resourceLimits(ME)[r]} → ${resourceLimits(ME)[r]+(Number.isInteger(allocation[r])&&allocation[r]>=0?allocation[r]:0)}`;});
    $('#storage-allocation-status').textContent=`${Number.isFinite(total)?total:0} of ${storageAllocationDraft.points} points assigned`;
    $('#storage-allocation-confirm').disabled=!validStorageAllocation(allocation,storageAllocationDraft.points);
  }

  function openStorageAllocation(cardId = null) {
    if (headless || replayMode) return false;
    const card=cardId?state.players[ME].hand.find(c=>c.id===cardId):null;
    // Rules #storage-allocation: a played Capacity Module or Cradle of Lost Suns chooses a split.
    const definition=card&&ALL_CARDS[card.key],cradle=definition?.tag==='alienCradle';
    const redistribute=definition?.relicAbility==='reservoir'&&document.body.classList.contains('background-stars');
    if(!canManageResources(ME)&&!(redistribute&&state.pendingRelic?.playerId===ME&&state.pendingRelic.card===cardId))return false;
    if (state.phase!=='operations'||!card||!(cradle||definition.effect?.allocate||redistribute)) return false;
    if(redistribute) {
      const base=clone(resourceLimits(ME)),p=state.players[ME],total=RESOURCES.reduce((n,r)=>n+base[r],0);
      storageAllocationDraft={cardId,redistribute:true,base};
      $('#storage-allocation-title').textContent='Redistribute capacity';
      $('#storage-allocation-help').textContent='Move capacity between resources. Positive and negative changes must add to zero. Keep each limit at least 4 and high enough for the resources you hold.';
      $('#storage-allocation-cost').textContent=`Prismatic Reservoir · ${total} total capacity · uses your Operations action.`;
      $('#storage-allocation-confirm').textContent='Play Prismatic Reservoir';
      $('#storage-allocation-options').innerHTML=RESOURCES.map(r=>{
        const min=Math.max(STARTING_LIMIT,p.resources[r])-base[r],max=total-RESOURCES.filter(other=>other!==r).reduce((n,other)=>n+Math.max(STARTING_LIMIT,p.resources[other]),0)-base[r];
        const value=(state.pendingRelic?.limits[r]??base[r])-base[r];
        return `<label class="storage-allocation-option" for="storage-points-${r}">${resourceDot(r)}<span>${RESOURCE_NAMES[r]}<small id="storage-limit-${r}"></small></span><input id="storage-points-${r}" aria-label="${RESOURCE_NAMES[r]} capacity change" aria-describedby="storage-limit-${r}" type="number" min="${min}" max="${max}" step="1" value="${value}" required></label>`;
      }).join('');
      RESOURCES.forEach(r=>{const input=$(`#storage-points-${r}`);input.value=String((state.pendingRelic?.limits[r]??base[r])-base[r]);input.addEventListener('input',updateStorageAllocation);});
      updateStorageAllocation();$('#storage-allocation-dialog').showModal();return true;
    }
    storageAllocationDraft={cardId,points:cradle?RELIC_STORAGE_POINTS:definition.effect.allocate};
    $('#storage-allocation-title').textContent='Allocate capacity';
    $('#storage-allocation-help').textContent=`Assign all ${storageAllocationDraft.points} points. Each point raises one chosen resource limit by 1. You may put several points into the same resource.`;
    $('#storage-allocation-cost').innerHTML=cradle?'Cradle of Lost Suns · no resource payment. Gain 2 Life and draw one card after confirming.':'Capacity Module · uses your Operations action. After confirming, the card goes to your Storage pile.';
    $('#storage-allocation-confirm').textContent=cradle?'Play relic and add capacity':'Play Capacity Module';
    $('#storage-allocation-options').innerHTML=RESOURCES.map(r=>`<label class="storage-allocation-option" for="storage-points-${r}">${resourceDot(r)}<span>${RESOURCE_NAMES[r]}<small id="storage-limit-${r}"></small></span><input id="storage-points-${r}" aria-label="${RESOURCE_NAMES[r]} capacity points" aria-describedby="storage-limit-${r}" type="number" min="0" max="${storageAllocationDraft.points}" step="1" value="1" required></label>`).join('');
    RESOURCES.forEach(r=>{const input=$(`#storage-points-${r}`);input.value='1';input.addEventListener('input',updateStorageAllocation);});
    updateStorageAllocation();$('#storage-allocation-dialog').showModal();return true;
  }



  // Rules #solo-seating: name the rival sharing your physical half of the map.
  function logNeighbor() {
    const seat=neighborSeat(state.homeOrder||DEFAULT_HOME_ORDER);
    const [neighbor,...far]=[seat,...[1,2,3].filter(id=>id!==seat)].map(id=>{const p=state.players[id];return `${p.name} (${STRATEGY_NAMES[p.strategy]||p.strategy})`;});
    logEvent(`Your neighbor this game is ${neighbor}, sharing your half of the map. Across the map: ${far.join(' and ')}.`);
  }

  // Archive Purge (rules #cards): choose up to two level I starters in your discard pile.
  // With none to choose, the card resolves at once and only draws.
  function openExchangeResource(cardId) {
    const card=state.players[ME].hand.find(c=>c.id===cardId);
    if(!canPlayExchange(ME,cardId))return false;
    $('#exchange-resource-options').innerHTML=RESOURCES.map(r=>`<button type="button" class="button" data-exchange-resource="${r}">Give 2 ${RESOURCE_NAMES[r]} for 1 other</button>`).join('');
    $$('[data-exchange-resource]').forEach(button=>button.addEventListener('click',()=>{const resource=button.dataset.exchangeResource;$('#exchange-resource-dialog').close();resolveHumanSpecial(card,ALL_CARDS[card.key],ME,resource);}));
    $('#exchange-resource-dialog').showModal();return true;
  }
  function openArchivePurge(cardId) {
    if (headless || replayMode) return false;
    const card=state.players[ME].hand.find(c=>c.id===cardId), max=card&&ALL_CARDS[card.key].effect?.trashStarters;
    if (!max) return false;
    const targets=archivePurgeTargets(ME);
    if (!targets.length) return resolveHumanSpecial(card,ALL_CARDS[card.key],ME,[]);
    archivePurgeCardId=cardId;
    $('#archive-purge-options').innerHTML=targets.map((c,i)=>`<label class="archive-purge-option" for="archive-purge-${i}"><input type="checkbox" id="archive-purge-${i}" value="${esc(c.id)}"><span>${esc(ALL_CARDS[c.key].name)}<small>Level I starter · converts for ${RESOURCES.filter(r=>cardResources(c)[r]).map(r=>`${cardResources(c)[r]} ${RESOURCE_NAMES[r]}`).join(', ')}</small></span></label>`).join('');
    $('#archive-purge-options').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>updateArchivePurge(max)));
    updateArchivePurge(max);$('#archive-purge-dialog').showModal();return true;
  }
  function archivePurgeSelection() {
    return [...$('#archive-purge-options').querySelectorAll('input:checked')].map(input=>input.value);
  }
  function updateArchivePurge(max) {
    const chosen=archivePurgeSelection().length;
    $('#archive-purge-options').querySelectorAll('input').forEach(input=>{input.disabled=!input.checked&&chosen>=max;});
    $('#archive-purge-status').textContent=chosen?`${chosen} of ${max} chosen.`:`None chosen: Archive Purge will only draw a card. You may choose up to ${max}.`;
    $('#archive-purge-confirm').textContent=chosen?`Trash ${chosen} and draw`:'Trash none and draw';
  }

  function renderCombatReport() {
    if (headless || replayMode || !state.pendingCombatReport || state.pendingCombat || overflowPlayer()>=0) return;
    const report=state.pendingCombatReport;
    displayingCombatReport=true;
    showMessage('COMBAT REPORT',nameForCoord(report.coord),[...report.summary,report.outcome].join('\n\n'));
  }

  function acknowledgeCombatReport() {
    if (!displayingCombatReport) return;
    displayingCombatReport=false;state.pendingCombatReport=null;saveGame();render();
    if (state.pendingCombat) scheduleCombatAi();
    else if (state.activePlayer!==ME && state.phase==='operations') scheduleAiTurn('operations',runAiOperation,650);
    else if (state.activePlayer!==ME && state.phase==='buy') scheduleAiTurn('buy',runAiBuy,650);
  }

  // Presentation only (#combat-table). Derive both inventories from the public
  // military deck and revealed tactics, never from an opponent's pending hand or choice.
  let combatTableUi = { key: null, tactic: null, inspect: null, escape: 0 };
  function combatTableInventory(force) {
    const counts = { ...BASIC_TACTIC_HAND }, used = {};
    for (const card of state.players[force.playerId].military || []) {
      if (MILITARY_CARDS[card.key]) counts[card.key] = (counts[card.key] || 0) + 1;
    }
    for (const key of force.used) used[key] = (used[key] || 0) + 1;
    if(force.available)for(const key of new Set([...Object.keys(counts),...Object.keys(force.available)]))counts[key]=(force.available[key]||0)+(used[key]||0);
    return Object.entries(counts).filter(([,count])=>count>0).map(([key, count]) => ({ key, count, used: used[key] || 0, left: Math.max(0, count - (used[key] || 0)) }));
  }

  function combatTableUnits(force) {
    const groups = new Map();
    for (const piece of force.pieces) {
      const key = [piece.type, piece.hull, piece.damage, piece.power].join(':');
      if (groups.has(key)) groups.get(key).count += 1;
      else groups.set(key, { ...piece, count: 1 });
    }
    const shown=document.body.classList.contains('background-stars')?force.pieces.map(piece=>({...piece,count:1})):[...groups.values()];
    return `<div class="combat-units">${shown.map(piece => {
      const name = SHIP_STATS[piece.type]?.name || 'Shipyard', hull = Math.max(0, piece.hull - piece.damage), destroyed = hull === 0;
      const label = `${piece.count > 1 ? `${piece.count} × ` : ''}${name}: ${destroyed ? 'destroyed' : `${piece.power} attack, ${hull}/${piece.hull} hull${piece.count > 1 ? ' each' : ''}`}`;
      return `<figure class="combat-unit${destroyed ? ' destroyed' : ''}" aria-label="${esc(label)}">${boardIcon(piece.type)}<figcaption><strong>${esc(name)}${piece.count > 1 ? ` ×${piece.count}` : ''}</strong><span>${destroyed ? 'Destroyed' : `<b>${piece.power}</b> attack · <b>${hull}/${piece.hull}</b> hull${piece.count > 1 ? ' each' : ''}`}</span></figcaption><span class="combat-hull" aria-hidden="true"><span style="width:${100 * hull / piece.hull}%"></span></span></figure>`;
    }).join('') || '<p class="muted">No units remain.</p>'}</div>`;
  }

  function combatTableCards(force, own, actions) {
    const inventory = combatTableInventory(force), total = inventory.reduce((n, card) => n + card.count, 0);
    return `<div class="combat-hand"><div class="combat-hand-heading"><h3>${own ? 'Your tactics' : 'Enemy tactics'}</h3><span>${force.remaining} of ${total} available</span></div><div class="combat-card-row">${inventory.map(card => {
      const definition = MILITARY_CARDS[card.key], selected = own && (force.committed ? force.choice : combatTableUi.tactic) === card.key;
      const legal = own && actions.some(action => action.type === 'combat_tactic' && action.tactic === card.key);
      const stats = [definition.attack ? `+${definition.attack} hit${definition.attack === 1 ? '' : 's'}` : '', definition.shield ? `Block ${definition.shield}` : ''].filter(Boolean).join(' · ');
      const extra = definition.pierce ? 'Pierces shields' : definition.victoryPrestige ? `Decisive win: +${definition.victoryPrestige} Prestige` : '';
      const label = `${definition.name}: ${card.left} available, ${card.used} used. ${definition.text}`;
      return `<button type="button" class="combat-tactic${!card.left ? ' spent' : ''}${selected ? ' selected' : ''}" style="--tactic-accent:${definition.shield && !definition.attack ? 'var(--cyan)' : 'var(--red)'}" ${own ? `data-combat-tactic="${card.key}" aria-pressed="${selected}" ${legal ? '' : 'disabled'}` : `data-combat-inspect="${card.key}"`} aria-label="${esc(label)}"><strong>${esc(definition.name)}</strong><span class="combat-tactic-stats">${esc(stats)}${extra ? ` · ${esc(extra)}` : ''}</span><span class="combat-tactic-count">${card.left} available${card.used ? ` · ${card.used} used` : ''}${selected ? ' · Selected' : ''}</span></button>`;
    }).join('')}</div></div>`;
  }

  function combatTableSide(view, side, own, actions) {
    const force = view.sides[side], player = state.players[force.playerId];
    const units = `<div class="combat-fleet"><header><div class="combat-faction"><span class="combat-faction-dot" aria-hidden="true"></span><h3>${esc(player.name)}</h3></div><span class="combat-role">${own ? 'You' : 'Enemy'} · ${side === 'attacker' ? 'Attacking' : 'Defending'}</span><span class="combat-power"><b>${combatPower(force.pieces)}</b> base attack</span></header>${combatTableUnits(force)}</div>`;
    const cards = combatTableCards(force, own, actions);
    return `<section class="combat-side ${own ? 'combat-own' : 'combat-enemy'}" style="--combat-owner:${playerColor(force.playerId)}" aria-label="${own ? 'Your' : 'Enemy'} forces and tactics">${own ? units + cards : cards + units}</section>`;
  }

  function renderCombat() {
    if (headless || replayMode) return;
    const dialog=$('#combat-dialog'),b=state.pendingCombat;
    if (!b || (b.attackerId!==ME && b.defenderId!==ME)) {combatTableUi.key=null;if(dialog.open)dialog.close();return;}
    const view=combatView(ME),actor=combatActor(),actions=combatActions(ME),mine=view.sides[view.side],enemy=view.sides[view.side==='attacker'?'defender':'attacker'];
    const key = [state.round, b.coord, b.origin, b.attackerId, b.defenderId, b.volley, b.stage].join(':');
    if (combatTableUi.key !== key) combatTableUi = { key, tactic: null, inspect: null, escape: 0 };
    if (combatTableUi.tactic && !actions.some(action => action.type==='combat_tactic' && action.tactic===combatTableUi.tactic)) combatTableUi.tactic=null;
    dialog.classList.add('card-table-battle');
    dialog.classList.toggle('combat-many-ships',document.body.classList.contains('background-stars')&&Math.max(mine.pieces.length,enemy.pieces.length)>8);
    dialog.classList.toggle('combat-dense', Math.max(combatTableInventory(mine).length, combatTableInventory(enemy).length)>6);
    $('#combat-volley').hidden=false;
    $('#combat-volley').textContent=view.stage==='opening'?'Opening relics':view.stage==='aftermath'?'After battle':view.stage==='escape'?'Before combat':`Volley ${view.volley} of 3`;
    $('#combat-title').textContent=`Battle at ${nameForCoord(b.coord)}`;
    $('#combat-status').textContent=['opening','aftermath'].includes(view.stage)?actor===ME?'Choose a relic or continue.':'Waiting for the other faction’s relic decision.':view.stage==='escape' ? actor===ME?'Escape with Explorers or stay and fight.':'Waiting for the enemy’s escape decision.' : actor===ME?'Select a tactic, then commit. Both sides reveal together.':mine.committed?'Your tactic is committed. Waiting for the enemy.':'Waiting for the enemy to commit.';
    const enemySide=view.side==='attacker'?'defender':'attacker';
    const commitment=force=>['opening','aftermath'].includes(view.stage)?'Relic decisions':view.stage==='escape'?(force.escapeDone?'Ready':'Escape decision pending'):(force.committed?'Committed · face down':'Not committed');
    $('#combat-forces').innerHTML=combatTableSide(view,enemySide,false,actions)+`<div class="combat-table-divider"><span>Enemy: ${commitment(enemy)}</span><span>${view.stage==='escape'?'Prepare for combat':'Reveal together'}</span><span>You: ${commitment(mine)}</span></div>`+combatTableSide(view,view.side,true,actions);
    const inspected=MILITARY_CARDS[combatTableUi.inspect || combatTableUi.tactic];
    $('#combat-help').textContent=inspected?`${inspected.name}: ${inspected.text}`:view.stage==='tactic'?'Damage is simultaneous. Tap any enemy tactic to read its effect; their committed choice stays hidden.':'Only the chosen Explorers escape. Other units stay. Pay 1 Energy for each escaping Explorer.';
    if(['opening','aftermath'].includes(view.stage)&&actions.length){
      $('#combat-options').innerHTML=`<label class="combat-escape-picker" for="battle-relic-option">Relic action<select id="battle-relic-option">${actions.map((a,i)=>`<option value="${i}">${esc(a.type==='combat_continue'?view.stage==='opening'?'Continue to escapes':'Finish recovery':relicActionLabel(a))}</option>`).join('')}</select></label><button class="button button-primary" id="battle-relic-confirm" type="button">Confirm choice</button>`;
      $('#battle-relic-confirm').addEventListener('click',()=>{const a=actions[Number($('#battle-relic-option').value)];if(a)applyCombatAction(ME,a);});
    } else if (view.stage==='escape' && actions.length) {
      const label=action=>action.type==='combat_stay'?'Stay and fight':`Escape ${action.amount} Explorer${action.amount===1?'':'s'} → ${nameForCoord(action.destination)} (${action.destination}) · ${action.amount} Energy`;
      if (!actions[combatTableUi.escape]) combatTableUi.escape=0;
      $('#combat-options').innerHTML=`${actions.length>1?`<label class="combat-escape-picker" for="combat-escape-option">Explorers<select id="combat-escape-option">${actions.map((action,index)=>`<option value="${index}" ${index===combatTableUi.escape?'selected':''}>${esc(label(action))}</option>`).join('')}</select></label>`:'<span class="combat-action-note">No paid escape is available.</span>'}<button class="button button-primary" type="button" data-combat-action="${combatTableUi.escape}">${actions[combatTableUi.escape].type==='combat_stay'?'Stay and fight':'Confirm escape'}</button>`;
      if (actions.length>1) $('#combat-escape-option').addEventListener('change',event=>{combatTableUi.escape=Number(event.target.value);renderCombat();$('#combat-escape-option').focus();});
    } else if (actions.length) {
      const index=actions.findIndex(action=>action.tactic===combatTableUi.tactic);
      $('#combat-options').innerHTML=`<span class="combat-action-note">${index<0?'Choose one available tactic above.':'Your selection is private until you commit.'}</span><button class="button button-primary" type="button" data-combat-action="${index}" ${index<0?'disabled':''}>${index<0?'Select a tactic':`Commit ${esc(MILITARY_CARDS[combatTableUi.tactic].name)}`}</button>`;
    } else $('#combat-options').innerHTML='<span class="combat-action-note">Waiting for the other faction. Your choices are saved.</span>';
    if(view.stage==='tactic'&&actions.some(a=>a.type==='combat_relic')){const button=document.createElement('button');button.type='button';button.className='button';button.textContent='Play a battle relic';button.addEventListener('click',()=>openRelicChoice(null,true));$('#combat-options').prepend(button);}
    const historyOpen=$('#combat-history').querySelector('details')?.open;
    $('#combat-history').innerHTML=view.summary.length?`<details ${historyOpen?'open':''}><summary>Previous volleys (${view.volleys.length})</summary>${view.summary.map(line=>`<p>${esc(line)}</p>`).join('')}</details>`:'';
    $$('[data-combat-tactic]').forEach(button=>button.addEventListener('click',()=>{combatTableUi.tactic=button.dataset.combatTactic;combatTableUi.inspect=null;renderCombat();$(`[data-combat-tactic="${combatTableUi.tactic}"]`)?.focus();}));
    $$('[data-combat-inspect]').forEach(button=>button.addEventListener('click',()=>{combatTableUi.inspect=button.dataset.combatInspect;renderCombat();$(`[data-combat-inspect="${combatTableUi.inspect}"]`)?.focus();}));
    $$('[data-combat-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=actions[Number(button.dataset.combatAction)];
      if(action) {button.disabled=true;applyCombatAction(ME,action);}
    }));
    // The Sector Scan that started the move must not lie over the battle's tactics.
    if (!dialog.open) { if ($('#sector-popover')?.matches?.(':popover-open')) $('#sector-popover').hidePopover(); dialog.showModal(); }
  }

  function renderOverflow() {}

  function renderRelicRow() {
    const row=$('#relic-row');
    const choosing=!replayMode && !state.pendingCombat && state.phase==='operations' && state.activePlayer===ME && state.actionMode==='excavate';
    row.innerHTML=state.relicRow.map(relic=>{
      const allowed=choosing && excavate(ME,state.selected,state.actionCardId,relic.id,true);
      return `<div>${cardMarkup(relic,'relic-row')}${choosing?`<button class="button button-primary" data-excavate-relic="${relic.id}" ${allowed?'':'disabled'}>Choose ${esc(ALL_CARDS[relic.key].name)}</button>`:''}</div>`;
    }).join('') || '<p class="muted">All alien relic cards have been recovered.</p>';
    const relicDeck=replayMode?state.relicDeckCount:state.relicDeck.length;
    $('#relic-deck-count').textContent=`${relicDeck} in deck`;
    $('#relic-deck-count').dataset.count=relicDeck;
    $('#relic-cost').innerHTML=resourceDots(EXCAVATION_COST);
    $('#cancel-excavate').hidden=!choosing;
    const site=state.planets[state.selected],atSite=site?.special==='relic' && relicKnown(state.clusters[site.cluster],viewSeat) && !site.relicClaimed && getFleet(state.selected,ME)?.explorer;
    $('#relic-row-help').textContent=!choosing?'Browse the shared rewards anytime. Use Excavate with your Explorer at a relic site to choose one.':!atSite?'Use Probe to locate a relic, then select its hex containing your Explorer. Choose a reward here.':!canAfford(state.players[ME],EXCAVATION_COST)?'You need 1 Energy and 3 Data. Convert cards from your hand on the board; your order stays selected.':'Choose one reward into discard. Pay 1 Energy and 3 Data; consume one Explorer, trash Excavate, and gain 2 Prestige.';
    $$('[data-excavate-relic]').forEach(button=>button.addEventListener('click',()=>contextExcavate(state.selected,button.dataset.excavateRelic)));
  }

  // Card feel (card-feel.js) animates what changed between renders, so it sees the table
  // just before and just after each one. It never changes the game state itself.
  function cardFeelView() {
    const player=state.players[viewSeat];
    const producers=replayMode?[]:Object.entries(state.planets).filter(([coord,planet])=>RESOURCES.includes(planet.type)
      && knownToViewer(state.clusters[planet.cluster]) && (planet.owner===viewSeat || fleetControllersAt(coord).includes(viewSeat))).map(([coord,planet])=>({coord,resource:planet.type}));
    return { replay: replayMode, round: state.round, phase: state.phase, resources: {...player.resources}, limits: resourceLimits(viewSeat),
      deck: replayMode?player.deckCount:player.deck.length, discard: replayMode?player.discardCount:player.discard.length,
      inPlay: player.inPlay.length, military: player.military?.length||0, producers };
  }

  function render() {
    if (headless) return;
    fitTable();
    drawEach({ 'card feel (before)': () => cardFeel?.beforeRender?.() });
    const targetText=$('#victory-target-text');
    if (targetText) targetText.textContent=`${victoryTarget()} Prestige`;
    $('#round-goal').textContent=`${victoryTarget()} Prestige`;
    // Each part of the table draws on its own: one failing part must never blank the market,
    // the relics or the turn's buttons. Failures are logged, shown once, and fail the checks.
    drawEach({renderHeader, renderScoreboard, renderBoard, renderResources, renderInspector, renderLog, renderHand, renderMarket, renderMilitaryPile, renderTrade, renderRelicRow, renderOverflow, renderCombat, renderCombatReport, renderRelicChoice, renderBoardPrimary});
    drawEach({fitMarket, stackLeft, fitMap});
    settleFit();
    drawEach({syncPlaysHere, positionSectorScan, settleSectorScan});
    drawEach({ 'card feel': () => cardFeel?.rendered?.(cardFeelView()), drawers: followTurnWithDrawer, guide: () => guide?.rendered?.(guidePort()) });
  }

  // Guidance (guide.js) is presentation only: it reads the table through these questions,
  // the same ones the hand, Sector Scan and market ask, and never changes the game. Only the
  // Learn to play walkthrough may stage a lesson's position, under its own save keys.
  let guidePortCache = null;
  function guidePort() {
    if (guidePortCache) return guidePortCache;
    const me = () => state.players[ME];
    guidePortCache = {
      get state() { return state; }, me: ME, tutorial: TUTORIAL, cards: ALL_CARDS, resources: RESOURCES, ships: SHIP_STATS, structures: STRUCTURES,
      excavationCost: EXCAVATION_COST, colonyCost: COLONY_LIFE_COST, colonyTerms, turnSerial: () => turnSerial,
      ordersAt: (coord, cardId = null) => availableContextOrders(coord, cardId),
      canAfford: cost => canAfford(me(), cost), purchaseCost: key => purchaseCost(me(), key),
      canConvertCards, canConvertCard, canBuyCapacity: () => canBuyCapacity(ME), capacityCost: () => storageUpgradeCost(ME),
      starterLevel, upgradePrice, canBankTrade: (give, get) => canBankTrade(ME, give, get), overflow: () => overflowPlayer(),
      limits: () => resourceLimits(ME), prestige: id => calculatePrestige(id), victoryTarget, trashEligible: () => trashEligibleCards(me()),
      relicKnown: cluster => relicKnown(cluster, ME), clusterKnown: cluster => clusterKnown(cluster, ME), canConstructDraw: card => canConstructDraw(ME, card),
      stage: TUTORIAL ? (change, message) => {
        if (state.pendingCombat || state.pendingCombatReport) return false;
        change({ ...headlessPort(), state, makeCard, ensureFleet, drawCards, logEvent, revealClusterAt, clusterForCoord, homeCoord });
        if (message) logEvent(message);
        clearTurnHistory(); saveGame(); render();
        return true;
      } : null
    };
    return guidePortCache;
  }

  // Bank trades on the mat: drag from one resource's Now row onto another resource (4 for 1, the
  // same bankTrade the bank form used). Tap or Enter on a Now row, then on the target, does the
  // same without dragging. Legality is exactly bankTrade's.
  function matTradeCheck(give, get) {
    const me = state.players[ME];
    if (!canManageResources(ME)) return { ok: false, text: 'Trade with the bank during Operations or Buy' };
    if (!get || get === give) return { ok: false, text: '' };
    if (me.resources[give] < bankTradeRate(ME,give)) return { ok: false, text: `Needs ${bankTradeRate(ME,give)} ${RESOURCE_NAMES[give]} (you have ${me.resources[give]})` };
    const full = me.resources[get] >= resourceLimits(ME)[get];
    return { ok: canBankTrade(ME, give, get), text: `${bankTradeRate(ME,give)} ${RESOURCE_NAMES[give]} → 1 ${RESOURCE_NAMES[get]}${full ? ` · ${RESOURCE_NAMES[get]} is full, so the 1 would be discarded` : ''}`, warn: full };
  }
  function matTradeDo(give, get) {
    const check = matTradeCheck(give, get);
    if (!check.ok) { if (check.text) toast(check.text); return false; }
    return bankTrade(ME, give, get);
  }
  function matTargetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    return hit?.closest('#resource-grid .resource-box')?.dataset.resource || null;
  }
  function matMarkTargets(give) {
    $$('#resource-grid .resource-box').forEach(box => {
      const check = matTradeCheck(give, box.dataset.resource);
      box.classList.toggle('mat-target', box.dataset.resource !== give && check.ok);
      box.classList.toggle('mat-blocked', box.dataset.resource !== give && !check.ok);
    });
  }
  function matClear() {
    $$('#resource-grid .mat-target, #resource-grid .mat-blocked, #resource-grid .mat-hover, #resource-grid .mat-picked').forEach(el => el.classList.remove('mat-target', 'mat-blocked', 'mat-hover', 'mat-picked'));
    document.querySelector('.mat-trade-label')?.remove();
    document.querySelector('.mat-trade-ghost')?.remove();
    matPick = null;
  }
  function matLabel(text, x, y) {
    let label = document.querySelector('.mat-trade-label');
    if (!label) { label = document.createElement('div'); label.className = 'mat-trade-label'; label.setAttribute('role', 'status'); document.body.append(label); }
    label.textContent = text; label.hidden = !text;
    if (x != null) { label.style.left = `${Math.max(8, Math.min(innerWidth - label.offsetWidth - 8, x + 14))}px`; label.style.top = `${Math.max(8, y - 40)}px`; }
    return label;
  }
  function setupMatTrades() {
    const grid = $('#resource-grid');
    if (!grid?.addEventListener) return;
    let press = null, dragging = false;
    grid.addEventListener('pointerdown', event => {
      const row = event.target.closest?.('[data-mat-trade]');
      if (!row || event.button > 0) return;
      press = { give: row.dataset.matTrade, x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging = false;
    });
    document.addEventListener('pointermove', event => {
      if (!press || event.pointerId !== press.id) return;
      if (!dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 8) return;
      if (!dragging) {
        dragging = true; matClear(); matPick = press.give;
        $(`#resource-grid .resource-box[data-resource="${press.give}"]`)?.classList.add('mat-picked');
        matMarkTargets(press.give);
        const ghost = document.createElement('div'); ghost.className = 'mat-trade-ghost'; ghost.style.setProperty('--resource', `var(--${press.give})`); ghost.innerHTML = '<i></i>'.repeat(bankTradeRate(ME,press.give)); document.body.append(ghost);
      }
      const ghost = document.querySelector('.mat-trade-ghost');
      if (ghost) ghost.style.transform = `translate(${event.clientX - 14}px, ${event.clientY - 30}px)`;
      const target = matTargetAt(event.clientX, event.clientY);
      $$('#resource-grid .mat-hover').forEach(el => el.classList.remove('mat-hover'));
      (target ? $(`#resource-grid .resource-box[data-resource="${target}"]`) : null)?.classList.add('mat-hover');
      matLabel(target && target !== press.give ? matTradeCheck(press.give, target).text : '', event.clientX, event.clientY);
    });
    const finish = event => {
      if (!press || event.pointerId !== press.id) return;
      const give = press.give; press = null;
      if (!dragging) return;
      dragging = false;
      const target = matTargetAt(event.clientX, event.clientY);
      matClear();
      if (target && target !== give) matTradeDo(give, target);
      grid.dataset.dragged = '1';
    };
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', () => { press = null; if (dragging) { dragging = false; matClear(); } });
    // Tap or keyboard: choose a Now row, then the resource to receive.
    grid.addEventListener('click', event => {
      if (grid.dataset.dragged) { delete grid.dataset.dragged; return; }
      const row = event.target.closest?.('[data-mat-trade]');
      // Once a resource is chosen, a tap anywhere on another resource's band receives it.
      const band = event.target.closest?.('#resource-grid .resource-box');
      if (!row && matPick && band && band.dataset.resource !== matPick) { const from = matPick; matClear(); matTradeDo(from, band.dataset.resource); return; }
      if (row) {
        const give = row.dataset.matTrade;
        if (!matPick) { matPick = give; row.closest('.resource-box').classList.add('mat-picked'); matMarkTargets(give); matLabel(`Trade from ${RESOURCE_NAMES[give]}: choose the resource to receive`); return; }
        if (matPick === give) { matClear(); return; }
        const from = matPick; matClear(); matTradeDo(from, give); return;
      }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && matPick) matClear(); });
  }

  // Phone drawers (Hand, Supply, Mat, Comms, Table). Your Buy turn opens the Supply drawer and
  // your Operations turn the Hand drawer, once each time the phase changes.
  const phoneLayout = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 599px), (max-height: 599px)').matches;
  let drawerPhase = null;
  function setDrawer(name) {
    if (typeof document === 'undefined' || !document.body?.dataset) return;
    document.body.dataset.drawer = name || '';
    $$('.phone-drawers [data-drawer]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.drawer === name)));
  }
  function setupLogCard() {
    const panel = $('.log-panel'), toggle = $('#log-toggle');
    if (!panel?.addEventListener || !toggle?.addEventListener || typeof document === 'undefined') return;
    const show = open => {
      panel.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('small').textContent = open ? 'Show less' : 'Show all';
    };
    toggle.addEventListener('click', event => { event.stopPropagation(); show(!panel.classList.contains('open')); });
    panel.addEventListener('click', () => { if (!panel.classList.contains('open')) show(true); });
    document.addEventListener('click', event => { if (panel.classList.contains('open') && !panel.contains(event.target)) show(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel.classList.contains('open')) { show(false); toggle.focus(); } });
  }
  // Trade pulls out from the table's left edge: its handle opens and tucks it back, as do Close
  // and Escape. It is not modal, so the map stays in play beside it.
  function setupTradeDrawer() {
    const drawer = $('#trade-drawer'), handle = $('#open-trade');
    if (!drawer?.classList || !handle?.addEventListener) return;
    // Kept dev engines still open #trade-dialog against this shared markup.
    // Only the current engine moves its controls into the non-modal drawer.
    const panel = $('#trade-panel'), dialog = $('#trade-dialog');
    if (panel?.append && dialog?.childNodes) panel.append(...dialog.childNodes);
    drawer.classList.add('ready');
    handle.setAttribute('aria-controls', 'trade-panel');
    handle.removeAttribute?.('aria-haspopup');
    const show = open => {
      if (open) renderTrade();
      drawer.classList.toggle('open', open);
      handle.setAttribute('aria-expanded', String(open));
    };
    handle.addEventListener('click', () => show(!drawer.classList.contains('open')));
    $('#close-trade').addEventListener('click', () => { show(false); handle.focus?.(); });
    if (typeof document !== 'undefined') document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawer.classList.contains('open') && !document.querySelector?.('dialog[open]')) { show(false); handle.focus?.(); }
    });
  }
  function setupPhoneCardSheet() {
    const row = $('#hand-row');
    if (!row?.addEventListener || typeof document === 'undefined' || !document.createElement || typeof document.body?.append !== 'function') return;
    const sheet = document.createElement('div');
    sheet.className = 'phone-card-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Card');
    document.body.append(sheet);
    const close = () => { sheet.hidden = true; sheet.innerHTML = ''; };
    row.addEventListener('click', event => {
      if (!phoneLayout() || event.target.closest('button')) return;
      const card = event.target.closest('.game-card');
      if (!card) return;
      sheet.innerHTML = `<button type="button" class="phone-card-close" aria-label="Close">×</button>${card.outerHTML}`;
      sheet.hidden = false;
      sheet.querySelector('.phone-card-close').focus();
    });
    sheet.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.classList.contains('phone-card-close')) { if (button || event.target === sheet) close(); return; }
      const keys = [...button.attributes].filter(attr => attr.name.startsWith('data-')).map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
      const original = keys && $(`#hand-row ${keys}`);
      close();
      original?.click();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !sheet.hidden) close(); });
  }
  function followTurnWithDrawer() {
    const key = `${state.round}:${state.phase}:${state.activePlayer}`;
    if (phoneLayout() && !replayMode && key !== drawerPhase) {
      drawerPhase = key;
      if (state.activePlayer === ME && state.phase === 'operations') setDrawer('hand');
    }
    // Choosing a relic for Excavate needs the relics on screen.
    needMarket('excavate', !replayMode && state.phase === 'operations' && state.activePlayer === ME && state.actionMode === 'excavate' ? 'relics' : null);
    showMarket();
  }

  // The market drawer (rules #shared-board). The supply (the relics, the market and the Upgrades)
  // is closed by default and the map takes its room; the Market handle on the table's right edge
  // opens it as the side panel and closes it again, and that choice stays until you change it. Your
  // Buy turn brings the market forward as whole cards over the map (Smaller and the handle still
  // shrink or close it), and when the turn ends it is back as you left it. A task outside your Buy
  // turn that needs the supply (choosing a relic for Excavate, a note about a supply card) opens
  // it while the task lasts, unless you close it yourself. On a phone the same rules move the
  // Supply drawer.
  const MARKET_VIEWS = ['closed', 'side', 'full'], MARKET_PREF = 'galactic-reach-market-view', MARKET_MOVE_MS = 200;
  let marketPref = 'closed', marketBuyKey = null, marketBuyView = null, marketShown = null, marketColumn = 'closed', marketStep = 0;
  let phoneMarket = null, phoneMarketFrom = '';
  const marketNeeds = new Map(), marketDeclined = new Set();
  if (!headless && typeof window !== 'undefined') try { const saved = window.localStorage?.getItem(MARKET_PREF); if (MARKET_VIEWS.includes(saved)) marketPref = saved; } catch { /* storage blocked: closed */ }
  const marketDrawerOn = () => !headless && typeof window !== 'undefined' && !!document.documentElement?.classList && tableLayout()
    && !document.body.classList.contains('background-stars');
  // An upright table (an iPad held upright) has the supply as a band under the map: open or closed,
  // with no whole-card sheet, so the Buy turn opens the band.
  const marketUpright = () => typeof window !== 'undefined' && !window.matchMedia?.('(orientation: landscape)').matches;
  const myBuyTurn = () => !replayMode && state.winner === null && state.phase === 'buy' && state.activePlayer === ME;
  // need: 'relics' (only the side panel shows the relics), 'market' (any open view) or null (done).
  function needMarket(reason, need) {
    if (!need) { if (marketNeeds.delete(reason) | marketDeclined.delete(reason)) showMarket(); return; }
    if (marketDeclined.has(reason) || marketNeeds.get(reason) === need) return;
    marketNeeds.set(reason, need);
    showMarket();
  }
  function marketTarget() {
    const key = myBuyTurn() ? `${state.round}` : null;
    if (key !== marketBuyKey) { marketBuyKey = key; marketBuyView = key ? 'full' : null; }
    let view = key ? marketBuyView : marketPref;
    const needs = [...marketNeeds.values()];
    if (needs.includes('relics')) view = 'side';
    else if (needs.includes('market') && view === 'closed') view = 'side';
    return view === 'full' && marketUpright() ? 'side' : view;
  }
  // The player's own choice: it outranks any task's need until that task is over.
  function chooseMarketView(view) {
    for (const reason of marketNeeds.keys()) marketDeclined.add(reason);
    marketNeeds.clear();
    if (marketBuyKey) marketBuyView = view;
    else { marketPref = view; try { window.localStorage?.setItem(MARKET_PREF, view); } catch { /* not kept */ } }
    showMarket();
  }
  function labelMarketHandles(view) {
    const handle = $('#market-handle'), size = $('#market-size');
    if (!handle?.setAttribute || !size) return;
    const open = view !== 'closed';
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? 'Close the market' : 'Open the market');
    handle.title = open ? 'Close the market' : marketBuyKey ? 'Open the market: your Buy turn' : 'Open the market';
    handle.dataset.buying = String(Boolean(marketBuyKey));
    size.hidden = !open || marketUpright();
    size.firstElementChild.textContent = view === 'full' ? 'Smaller' : 'Larger';
    size.setAttribute('aria-label', view === 'full' ? 'Smaller market: the side panel' : 'Larger market: whole cards');
  }
  // A column that opens or closes starts its extra width afresh; the whole-card sheet keeps the column under it as it is.
  function refitMarketTable(columnChanged = true) { if (columnChanged) supplyExtra = 0; fitMarket(); stackLeft(); fitMap(); balanceSupply(); settleFit(); }
  function showMarket() {
    if (typeof document === 'undefined' || !document.documentElement?.classList || !document.body?.classList) return;
    if (phoneLayout()) followMarketOnPhone();
    const root = document.documentElement, handles = $('#market-handles');
    if (!marketDrawerOn()) {
      if (handles) handles.hidden = true;
      if (!root.classList.contains('market-drawer')) return;
      clearTimeout(marketStep);
      root.classList.remove('market-drawer', 'market-closed', 'market-side', 'market-full', 'market-in', 'market-out', 'market-moving', 'market-no-column');
      marketShown = null; marketColumn = 'closed';
      refitMarketTable();
      return;
    }
    root.classList.add('market-drawer');
    if (handles) handles.hidden = false;
    const view = marketTarget();
    labelMarketHandles(view);
    if (view === marketShown) return;
    const from = marketShown;
    marketShown = view;
    clearTimeout(marketStep);
    root.classList.remove('market-in', 'market-out');
    // The whole cards lie over the map, so the column under them (and the map) stays as it was.
    const place = next => {
      root.classList.remove('market-closed', 'market-side', 'market-full');
      root.classList.add(`market-${next}`);
      const columnChanged = next !== 'full' && next !== marketColumn;
      if (next !== 'full') marketColumn = next;
      root.classList.toggle('market-no-column', marketColumn === 'closed');
      refitMarketTable(columnChanged);
    };
    // Notes and the guide wait for this: nothing on the table is placed against a moving panel.
    const settled = () => { root.classList.remove('market-moving', 'market-in', 'market-out'); window.dispatchEvent(new Event('gr-market-settled')); };
    const still = from === null || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('market-moving');
    if (still) { place(view); settled(); return; }
    if (view === 'closed') {
      // Roll it back to the edge first (from the clip it has while moving); the column closes, and
      // the map re-fits, once it has gone.
      void root.offsetWidth;
      requestAnimationFrame(() => root.classList.add('market-out'));
      marketStep = setTimeout(() => { place(view); requestAnimationFrame(() => requestAnimationFrame(settled)); }, MARKET_MOVE_MS + 34);
      return;
    }
    place(view);
    root.classList.add('market-in');
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove('market-in'));
    marketStep = setTimeout(settled, MARKET_MOVE_MS + 34);
  }
  // Phones: your Buy turn opens the Supply drawer on the market and its end returns the drawer you
  // had; a task that needs the supply opens it the same way.
  function followMarketOnPhone() {
    if (replayMode) return;
    const needs = [...marketNeeds.values()], want = myBuyTurn() ? 'buy' : needs.length ? needs.includes('relics') ? 'relics' : 'market' : null;
    if (want === phoneMarket) return;
    const was = phoneMarket;
    phoneMarket = want;
    if (want) {
      if (!was) phoneMarketFrom = document.body.dataset.drawer || '';
      setDrawer('supply');
      switchTab(want === 'relics' ? 'relics' : 'market');
    } else if (document.body.dataset.drawer === 'supply') setDrawer(phoneMarketFrom);
  }
  function setupMarketDrawer() {
    const handle = $('#market-handle'), size = $('#market-size');
    if (!handle?.addEventListener || !size?.addEventListener || typeof document === 'undefined') return;
    handle.addEventListener('click', () => chooseMarketView(marketShown === 'closed' ? (marketBuyKey ? 'full' : 'side') : 'closed'));
    size.addEventListener('click', () => chooseMarketView(marketShown === 'full' ? 'side' : 'full'));
    // Escape from inside the open market (or on its handles) closes it and returns to the handle.
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !marketShown || marketShown === 'closed' || document.querySelector?.('dialog[open]')) return;
      if (!event.target?.closest?.('#relics-panel, #market-panel, #upgrade-group, #market-handles')) return;
      chooseMarketView('closed'); handle.focus?.();
    });
    // On a phone, choosing another drawer is the player's own choice too.
    $$('.phone-drawers [data-drawer]').forEach(button => button.addEventListener('click', () => {
      if (!phoneMarket || button.dataset.drawer === 'supply') return;
      for (const reason of marketNeeds.keys()) marketDeclined.add(reason);
      marketNeeds.clear();
      phoneMarket = myBuyTurn() ? 'buy' : null;
    }));
    window.addEventListener('resize', () => { mapFitFor = null; showMarket(); });
    globalThis.galacticReachMarket = { need: needMarket, view: () => marketShown };
    // A card design whose picture is missing shows its text in the picture's place.
    document.addEventListener('error', event => { if (event.target?.matches?.('img.card-picture')) event.target.parentElement?.classList.remove('has-picture'); }, true);
  }
  const renderErrors = [];
  function drawEach(parts) {
    const failed = [];
    for (const [name, draw] of Object.entries(parts)) {
      try { draw(); } catch (error) { failed.push([name, error]); }
    }
    if (!failed.length) return;
    for (const [name, error] of failed) {
      console.error(`Heirs Ad Astra could not draw ${name}:`, error);
      const message = `${name}: ${error?.message || error}`;
      if (!renderErrors.includes(message)) { renderErrors.push(message); toast(`Part of the table failed to draw (${message}). Please report it with an exported game report.`); }
    }
    if (typeof window !== 'undefined') window.galacticReachRenderErrors = renderErrors;
    // Under Node (the test suites) a drawing failure is still a test failure.
    if (typeof window === 'undefined' || globalThis.process?.versions?.node) throw failed[0][1];
  }

  // The desktop table is laid out at one logical size, 1600 units wide by at least 900 tall, and
  // the whole table is scaled uniformly to the window: every component keeps one physical scale.
  // A wide window lays the table out 1600 units wide; a squarer one (an iPad in landscape) 1300;
  // a portrait window (an iPad held upright) 1000, with the table arranged in a column.
  const tableSize = (width, height) => height > width ? [1000, 1300] : width / height >= 1.55 ? [1600, 900] : [1300, 900];
  function fitTable() {
    if (typeof document === 'undefined' || !document.documentElement?.style) return;
    const root = document.documentElement, shell = document.querySelector('.app-shell');
    if (!tableLayout() || !shell) { ['--table-zoom','--table-w','--table-h'].forEach(name => root.style.removeProperty(name)); root.classList.remove('table-wide'); return; }
    // Restoring the green supply after Max’s UI can briefly widen an iPad’s overflow
    // viewport. Fit to the layout viewport, which keeps the actual device dimensions.
    const width = root.clientWidth || window.innerWidth, height = Math.max(1, (root.clientHeight || window.innerHeight) - Math.max(0, shell.getBoundingClientRect().top));
    const [tableW, tableH] = tableSize(width, height);
    // Wide tables have room for supply cards in real card proportions; squarer ones keep wider
    // cards so the map stays big.
    root.classList.toggle('table-wide', tableW === 1600);
    // The pieces keep their natural size in CSS pixels and only shrink when the window is too
    // small to hold the table; they never grow to fill a large window. So browser zoom works:
    // zooming in makes the pieces larger and leaves the map (which fills what is left) smaller,
    // and zooming out does the reverse.
    let zoom = Math.min(1, width / tableW, height / tableH), layoutW = width / zoom;
    const apply = () => {
      root.style.setProperty('--table-zoom', String(zoom));
      root.style.setProperty('--table-w', `${layoutW}px`);
      root.style.setProperty('--table-h', `${height / zoom}px`);
    };
    apply();
    // Whatever the window's shape or the content, the table never runs past the window's width:
    // if something would, the same layout is scaled down until its widest part fits.
    for (let pass = 0; pass < 2; pass++) {
      const wide = shell.scrollWidth;
      if (!(wide > shell.clientWidth + 1)) break;
      zoom = Math.min(zoom, width / wide);
      apply();
    }
  }

  // The map fills the space the other pieces leave: on a landscape table it may reach into the
  // left strip, as long as no hex runs under the Prestige track, the round's phases, the comms
  // card, the fleets, the map tools or the map key (with any notice over it), which lie in the
  // hexagon's empty corners.
  // Hex positions scale with the map's width, so they are measured once and the largest width
  // that clears every corner piece is found by scanning down from the largest.
  let fitMapLog = null;
  let fitMapFrom = 0, mapFitFor = null;
  function fitMap() {
    if (typeof document === 'undefined' || !document.documentElement?.style) return;
    const root = document.documentElement, region = $('.board-map-region'), board = $('#galaxy-board');
    const landscape = tableLayout() && (window.matchMedia?.('(orientation: landscape)').matches || document.body.classList.contains('background-stars')) && !$('.board-stage.map-zoomed');
    if (!landscape || !region?.getBoundingClientRect || !board) { ['--map-w', '--map-top'].forEach(name => root.style.removeProperty(name)); return; }
    // The market's whole cards lie over the map: it keeps the place it has beside the column under
    // them (see showMarket), fitted once for that column at the table's current size.
    const sheet = root.classList.contains('market-drawer') && root.classList.contains('market-full');
    const fitKey = r => `${marketColumn}:${Math.round(r.width)}x${Math.round(r.height)}`;
    if (sheet && mapFitFor === fitKey(region.getBoundingClientRect())) return;
    const zoom = Number(root.style.getPropertyValue('--table-zoom')) || 1;
    const box = region.getBoundingClientRect(), b = board.getBoundingClientRect();
    if (!b.width || !box.width) return;
    const hexes = [...board.querySelectorAll('.hex')].map(hex => { const r = hex.getBoundingClientRect(); return [(r.left - b.left) / b.width, (r.top - b.top) / b.width, (r.right - b.left) / b.width, (r.bottom - b.top) / b.width]; });
    // The outermost hexes are the ones that meet a panel, so they are tried first: most sizes fail
    // on the first few hexes instead of after hundreds.
    hexes.sort((a, z) => Math.hypot(z[0] + z[2] - 1, (z[1] + z[3]) / 2 - b.height / b.width / 2) - Math.hypot(a[0] + a[2] - 1, (a[1] + a[3]) / 2 - b.height / b.width / 2));
    const ratio = b.height / b.width, gap = 6 * zoom;
    const rect = (element, [l, t, r, bottom] = [0, 0, 0, 0]) => { const e = element?.getBoundingClientRect?.(); return e && e.width ? [e.left - l * zoom, e.top - t * zoom, e.right + r * zoom, e.bottom + bottom * zoom] : null; };
    const track = rect($('#prestige-track'), [6, 4, 6, 5]);

    // An open comms log lies over the map on purpose; the map keeps clear of the closed card.
    if (!$('.log-panel.open')) fitMapLog = rect($('.log-panel'));
    const log = fitMapLog;
    // The bottom band's pieces too: the map reaches down between your hand, piles, buttons and mat.
    const band = [...document.querySelectorAll('#hand-row, .pile-stats > button[id], #resource-grid, #hand-panel .hand-tools > :not([hidden]), .table-menu-button')].map(e => rect(e));
    // The race line and its goal stick out past the track's box on the right (the counts sit before them).
    const blocks = [track, rect($('.standings-stats'), [0, 4, 6, 5]), rect($('.prestige-line'), [0, 4, 6, 5]), rect($('.prestige-track-goal'), [0, 4, 6, 5]), log, rect($('.phase-stepper')), rect($('#max-bank-nav')), rect($('.map-tools')), rect($('#guide-switch')), rect($('#map-legend-corner')), sheet ? null : rect($('#market-handles')), ...band].filter(Boolean);
    const clear = (width, top, left) => hexes.every(([l, t, r, bottom]) => blocks.every(([bl, bt, br, bb]) => left + r * width <= bl - gap || left + l * width >= br + gap || top + bottom * width <= bt - gap || top + t * width >= bb + gap));
    // The map lies against the supply. A map shorter than its space may also slide up or down
    // (centred first) so its empty corners take the panels above and below. With the market
    // closed (see showMarket) it is centred, or as near the middle as its corners allow.
    const centred = document.body.classList.contains('background-stars'), closed = root.classList.contains('market-drawer') && marketColumn === 'closed';
    const fits = width => {
      const slack = box.height - width * ratio, tops = [slack / 2, ...Array.from({ length: 33 }, (_, i) => slack * i / 32)];
      const side = box.width - width, lefts = closed ? Array.from({ length: 33 }, (_, i) => box.left + side / 2 + (i % 2 ? 1 : -1) * side / 2 * Math.ceil(i / 2) / 16) : [centred ? box.left + side / 2 : box.right - width];
      for (const left of lefts) { const dy = tops.find(dy => clear(width, box.top + dy, left)); if (dy !== undefined) return { dy, dx: left - box.left }; }
      return undefined;
    };
    // Hexes are discrete, so a corner piece can clear a larger map and touch a smaller one: scan
    // down from the largest size in 1% steps and take the first that fits.
    const high = Math.min(box.width, box.height / ratio);
    const width = Array.from({ length: 61 }, (_, step) => high * (1 - step / 100)).find(w => fits(w) !== undefined);
    if (!width) { ['--map-w', '--map-top', '--map-left'].forEach(name => root.style.removeProperty(name)); return; }
    const place = fits(width);
    root.style.setProperty('--map-w', `${Math.floor(width / zoom)}px`);
    root.style.setProperty('--map-top', `${Math.floor(place.dy / zoom)}px`);
    if (closed) root.style.setProperty('--map-left', `${Math.floor(place.dx / zoom)}px`); else root.style.removeProperty('--map-left');
    fitMapFrom = b.width;
    mapFitFor = fitKey(box);
  }

  // On the table the supply is six rows of three cards, all one size: the relics, the market's
  // expensive, medium and cheap rows, then the Upgrades (Move II, Construct II, Add capacity /
  // Move III, Construct III, Trash), filling the supply column's height. A card is at least
  // CARD_MIN_W wide, so names and effects wrap between words, and has about CARD_TEXT_AREA square
  // units to show its name, cost and effect whole, so the shorter a card, the wider it is; cards
  // keep real card proportions (63:88) where that already leaves them that room (tall windows).
  // The column's width follows from the card size.
  // On a wide table the map is as tall as the window allows and the width left over would be bare
  // felt between the left-hand panels and the map: balanceSupply hands it to the supply instead
  // (wider cards, more of their pictures), up to cards 1.5 times as wide as tall, and the map,
  // which lies against the supply, moves left into the space.
  let supplyExtra = 0, supplyRoom = 0;
  function balanceSupply() {
    if (typeof window === 'undefined' || !document.documentElement?.style || !tableLayout() || !window.matchMedia?.('(orientation: landscape)').matches || $('.board-stage.map-zoomed')) return;
    if (document.documentElement.classList.contains('market-drawer') && marketColumn !== 'side') return;
    const board = $('#galaxy-board')?.getBoundingClientRect?.();
    if (!board?.width) return;
    const zoom = Number(document.documentElement.style.getPropertyValue('--table-zoom')) || 1;
    const right = Math.max(0, ...['#prestige-track', '.phase-stepper', '.log-panel:not(.open)', '#map-legend-corner'].map(sel => $(sel)?.getBoundingClientRect?.()).filter(r => r?.width).map(r => r.right));
    const slack = (board.left - right) / zoom - 16;
    const next = Math.max(0, Math.min(supplyRoom, supplyExtra + Math.floor(slack / 3)));
    if (Math.abs(next - supplyExtra) < 3) return;
    supplyExtra = next;
    fitMarket(); stackLeft(); fitMap();
  }
  const CARD_GAP = 6, SUPPLY_ROWS = 6, CARD_MIN_W = 150, CARD_TEXT_AREA = 170 * 127;
  function fitMarket() {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return;
    const root = typeof document !== 'undefined' ? document.documentElement : null, shell = $('.app-shell');
    const landscape = tableLayout() && window.matchMedia?.('(orientation: landscape)').matches;
    if (!root?.style || !shell?.getBoundingClientRect || !landscape) { ['--card-h', '--card-w', '--supply-w'].forEach(name => root?.style?.removeProperty?.(name)); fitMarketRows(); return; }
    $('#market-row')?.style?.removeProperty?.('--mrow-h');
    const zoom = Number(root.style.getPropertyValue('--table-zoom')) || 1, box = shell.getBoundingClientRect();
    const front = parseFloat(getComputedStyle(shell).getPropertyValue('--band-h')) || 178;
    const pad = parseFloat(getComputedStyle(shell).paddingTop) || 8;
    const height = box.height / zoom - 2 * pad - front - 12;
    if (height < 200) return;
    const cardH = Math.floor((height - (SUPPLY_ROWS - 1) * CARD_GAP) / SUPPLY_ROWS), baseW = Math.max(Math.floor(cardH * 63 / 88), CARD_MIN_W, Math.ceil(CARD_TEXT_AREA / cardH));
    supplyRoom = Math.max(0, Math.floor(cardH * 1.5) - baseW);
    // The market drawer (see showMarket): closed, the supply has no column; its whole cards lie on
    // a sheet over the map, and the column under the sheet keeps the width it had.
    const drawer = root.classList.contains('market-drawer'), full = drawer && root.classList.contains('market-full');
    if (!drawer || marketColumn === 'side') supplyExtra = Math.min(supplyExtra, supplyRoom); else supplyExtra = 0;
    const cardW = baseW + supplyExtra;
    root.style.setProperty('--card-h', `${cardH}px`);
    root.style.setProperty('--card-w', `${cardW}px`);
    root.style.setProperty('--supply-w', drawer && marketColumn === 'closed' ? '0px' : `${cardW * 3 + CARD_GAP * 2}px`);
    if (full) fitMarketSheet(box.width / zoom, height);
  }
  // The whole-card sheet: the market's three rows of three cards in real card proportions (63:88)
  // as tall as the column allows, the Upgrades in two columns beside them; on a narrower table the
  // cards shrink so the sheet leaves the left-hand column and a strip of the map uncovered.
  // The strip it leaves beside it is wide enough for a guidance note (SHEET_NOTE_ROOM window pixels)
  // unless that would shrink the cards below SHEET_CARD_MIN units; then the note narrows to the strip
  // (--sheet-note-w, at least 200 pixels) rather than lie over the cards.
  const SHEET_PAD = 12, SHEET_SPLIT = 18, SHEET_GAP = 8, SHEET_NOTE_ROOM = 350, SHEET_CARD_MIN = 128;
  function fitMarketSheet(tableW, height) {
    const root = document.documentElement, shell = $('.app-shell'), style = getComputedStyle(shell);
    const left = parseFloat(style.getPropertyValue('--left-w')) || 250, side = parseFloat(style.paddingRight) || 16, gapX = parseFloat(style.columnGap) || 14;
    const zoom = Number(root.style.getPropertyValue('--table-zoom')) || 1;
    // The sheet starts right of the left-hand panels (the map key and comms card are wider than
    // their column); --sheet-inset is that distance into the map's column.
    const start = shell.getBoundingClientRect().left + (side + left + gapX) * zoom;
    const reach = Math.max(0, ...['#prestige-track', '.phase-stepper', '.log-panel:not(.open)', '#map-legend-corner'].map(sel => $(sel)?.getBoundingClientRect?.()).filter(r => r?.width).map(r => r.right));
    const inset = Math.max(0, Math.ceil((reach - start) / zoom) + 10);
    root.style.setProperty('--sheet-inset', `${inset}px`);
    const room = tableW - 2 * side - left - gapX - inset, frame = 2 * SHEET_PAD + SHEET_SPLIT + 3 * SHEET_GAP;
    let cardH = Math.floor((height - 2 * SHEET_PAD - 2 * SHEET_GAP) / 3), cardW = Math.floor(cardH * 63 / 88);
    const withNote = Math.floor((room - SHEET_NOTE_ROOM / zoom - frame) / 5), widest = Math.floor((room - frame) / 5);
    const fitW = Math.min(cardW, widest, Math.max(withNote, SHEET_CARD_MIN));
    if (fitW < cardW) { cardW = fitW; cardH = Math.floor(cardW * 88 / 63); }
    const strip = (room - 5 * cardW - frame) * zoom;
    root.style.setProperty('--sheet-note-w', `${Math.max(200, Math.min(320, Math.floor(strip - 24)))}px`);
    root.style.setProperty('--card-h', `${cardH}px`);
    root.style.setProperty('--card-w', `${cardW}px`);
    root.style.setProperty('--card-gap', `${SHEET_GAP}px`);
    root.style.setProperty('--sheet-pad', `${SHEET_PAD}px`);
    root.style.setProperty('--sheet-split', `${SHEET_SPLIT}px`);
    root.style.setProperty('--sheet-w', `${5 * cardW + 3 * SHEET_GAP + SHEET_SPLIT + 2 * SHEET_PAD}px`);
  }
  // On a portrait table the market's three cost rows share the market panel's height (each row's
  // own height follows its cards, so the space is measured down to the panel's bottom).
  function fitMarketRows() {
    const row = $('#market-row'), root = document.documentElement;
    if (!row?.getBoundingClientRect || !tableLayout()) { row?.style?.removeProperty?.('--mrow-h'); return; }
    const zoom = Number(root.style.getPropertyValue('--table-zoom')) || 1, box = row.getBoundingClientRect();
    const panel = row.closest('#market-panel')?.getBoundingClientRect() || box;
    const height = (panel.bottom - box.top) / zoom - 2, gap = 5;
    if (height < 60) return;
    row.style.setProperty('--mrow-h', `${Math.floor((height - 2 * gap) / 3)}px`);
  }
  // The map key's place follows the stack and can land a frame after a fit, so fit the map once
  // more on the next frame (one pending pass at a time).
  let settleFrame = 0;
  function settleFit() {
    if (typeof requestAnimationFrame !== 'function' || typeof document === 'undefined') return;
    cancelAnimationFrame(settleFrame);
    settleFrame = requestAnimationFrame(() => { stackLeft(); fitMap(); });
  }
  // The left column: each piece lies under the one before it, in order (standings, round, comms).
  const LEFT_STACK = ['#prestige-track', '.phase-stepper', '.log-panel'];
  function stackLeft(depth = 0) {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function' || !document.documentElement?.style) return;
    const landscape = tableLayout() && (window.matchMedia?.('(orientation: landscape)').matches || document.body.classList.contains('background-stars'));
    const zoom = Number(document.documentElement?.style?.getPropertyValue('--table-zoom')) || 1;
    let top = 0;
    const maxUI = document.body.classList.contains('background-stars');
    // Kept engines that predate this layout retain their original reference rails.
    document.body.classList.toggle('max-reference-rails', maxUI);
    const stack = [...LEFT_STACK, ...(maxUI ? ['#map-legend-corner'] : [])];
    for (const sel of stack) {
      const el = $(sel);
      if (!el?.style || !el.getBoundingClientRect || !el.matches) continue;
      if (!landscape) { el.style.removeProperty('--stack-top'); continue; }
      el.style.setProperty('--stack-top', `${top}px`);
      // An open comms log lies over the pieces below it; they keep their places.
      const h = el.matches('.log-panel.open') ? (Number(el.dataset.closedH) || 0) : el.getBoundingClientRect().height / zoom;
      if (el.matches('.log-panel') && !el.matches('.open')) el.dataset.closedH = String(h);
      if (h) top += h + (document.body.classList.contains('background-stars') ? (sel === '#prestige-track' ? 36 : 16) : 8);
    }
    const root = document.documentElement, legend = $('#map-legend-corner'), last = $(stack.at(-1));
    legend?.setAttribute('aria-hidden', String(!maxUI));
    const bankButtons = maxUI && landscape ? $('#max-bank-nav')?.getBoundingClientRect?.() : null;
    if (bankButtons?.height) root.style.setProperty('--max-bank-stack-h', `${Math.ceil(bankButtons.height / zoom) + 18}px`);
    else root.style.removeProperty('--max-bank-stack-h');
    // Max's cost key now occupies the left stack; the bank buttons live on the right.
    if (maxUI) {
      const key = landscape ? legend?.getBoundingClientRect?.() : null;
      const handleH = $('#open-trade')?.getBoundingClientRect?.().height || 0;
      if (key?.height) {
        root.style.setProperty('--max-notice-top', `${Math.round(key.top)}px`);
        root.style.setProperty('--trade-top', `${Math.round(key.bottom + 16 * zoom + handleH / 2)}px`);
      } else ['--max-notice-top', '--trade-top'].forEach(name => root.style.removeProperty(name));
      return;
    }
    root.style.removeProperty('--max-notice-top');
    // The map key lies in the middle of the column's free height (between the stack and your piles
    // and hand), so the column has no long bare stretch.
    const end = last?.getBoundingClientRect?.(), track = $('#prestige-track')?.getBoundingClientRect?.(), keyBox = legend?.getBoundingClientRect?.();
    const floor = Math.min(...[...document.querySelectorAll('#hand-row, .pile-stats > button[id]')].map(e => e.getBoundingClientRect()).filter(r => r.height).map(r => r.top));
    if (landscape && end?.height && track?.height && keyBox?.height && Number.isFinite(floor)) {
      const areaTop = track.top - 4 * zoom, from = end.bottom + 8 * zoom, free = floor - 8 * zoom - from;
      // A little below the middle: the hexagon's lower-left edge leaves the wider gap below.
      const top = from + Math.max(0, (free - keyBox.height) * 0.56);
      root.style.setProperty('--legend-top', `${Math.round((top - areaTop) / zoom)}px`);
    } else root.style.removeProperty('--legend-top');
    // Notices lie over the top of the map key (reference text the map keeps clear of), at the
    // table's scale so they never run past it.
    const key = landscape ? legend?.getBoundingClientRect?.() : null;
    if (key?.height) root.style.setProperty('--notice-top', `${Math.round(key.top)}px`);
    else root.style.removeProperty('--notice-top');
    // Trade's handle lies on the table's left edge in the gap between the comms card and the map key,
    // ending above the key where notices appear (in a tight column it may overlap the comms card).
    const stackBottom = landscape ? last?.getBoundingClientRect?.() : null, handleH = $('#open-trade')?.getBoundingClientRect?.().height || 0;
    // It ends at least 12 units above the notices' place, which a notice entering from above can reach.
    if (key?.height && stackBottom?.height) root.style.setProperty('--trade-top', `${Math.round(Math.min((stackBottom.bottom + key.top) / 2, key.top - 12 * zoom - handleH / 2))}px`);
    else root.style.removeProperty('--trade-top');
    // When the stack and the map key cannot both fit above your piles and hand, tighten the column
    // once (the latest comms entry only) and stack again; a second step drops the icon list from
    // the key (the Map key button lists them). At most two steps, whatever the class list reports.
    const step = ['left-tight', 'left-tighter'].find(name => !root.classList.contains(name));
    const stackEnd = last?.getBoundingClientRect?.(), keyNow = legend?.getBoundingClientRect?.();
    if (depth < 2 && landscape && step && stackEnd?.height && keyNow?.height && Number.isFinite(floor)
      && stackEnd.bottom + 8 * zoom + keyNow.height > floor - 4 * zoom) { root.classList.add(step); stackLeft(depth + 1); }
  }

  // On a desktop window the market and relics lie on the table together.
  const tableLayout = () => typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 600px) and (min-height: 600px)').matches;
  function switchTab(name) {
    // The hand is always on the board and Trade is a dialog, so their old tabs show the market.
    if (name==='hand' || name==='trade' || name==='fleet') name='market';
    $$('.console-tab[data-tab]').forEach(tab=>{const active=tab.dataset.tab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    $$('.tab-panel').forEach(panel=>{const active=panel.dataset.panel===name;panel.classList.toggle('active',active);panel.hidden=!active;});
  }

  function positionSectorScan() {
    const panel=$('#sector-popover');
    if (!panel?.matches(':popover-open') || !state.selected) return;
    const hex=$(`.hex[data-coord="${state.selected}"]`);
    if (!hex) return;
    // The guide's bubble: beside the hex with its arrow aimed at it, never over it. It also stays
    // clear of a Move's reachable hexes (#movement keeps them clickable), the raised hand cards
    // this hex lights up, the turn’s main button, a guide note and a notice (toast).
    globalThis.galacticReachGuide?.anchorBubble?.(panel, hex, $$('#hand-row > .game-card.cf-plays-here, #board-primary:not([hidden]), #gr-coach:not([hidden]), .toast'));
  }
  // The map refits just after a render and may move the hex: follow it for a few frames.
  let scanSettling = 0;
  function settleSectorScan() {
    const already = scanSettling > 0;
    scanSettling = 20;
    if (already || typeof requestAnimationFrame !== 'function') return;
    const step = () => { positionSectorScan(); if (--scanSettling > 0) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function showSectorScan(keyboard=false) {
    const panel=$('#sector-popover');
    // A move that started a battle opens the battle window: the scan must not reopen over it.
    if (document.querySelector('dialog[open]:modal')) return;
    if (!panel.matches(':popover-open')) panel.showPopover();
    syncPlaysHere();
    positionSectorScan(); settleSectorScan();
    if (keyboard) $('#close-sector-scan').focus();
  }

  function wireUi() {
    $('#development-tools').hidden=!developmentMode;
    // Drag a hand card onto the map: the same context orders the Sector Scan offers.
    cardFeel?.attach?.({
      dropTargets(cardId) {
        if (replayMode) return [];
        return $$('.hex').flatMap(hex => {
          const orders = availableContextOrders(hex.dataset.coord, cardId);
          return orders.length ? [{ coord: hex.dataset.coord, type: orders[0].type, label: orders[0].label }] : [];
        });
      },
      // The hand card whose chosen order waits for its first hex (Use order clicked, nothing chosen
      // on the map yet): the card feel aims it exactly as a drag would.
      aimCard() {
        if (replayMode || !['move','construct','colonize'].includes(state.actionMode) || state.moveSource || state.pendingMove || state.pendingConstruct) return null;
        return state.actionCardId || null;
      },
      playAt(cardId, coord) {
        const order = availableContextOrders(coord, cardId)[0];
        if (!order || !startContextOrder(cardId, coord, order.group)) return false;
        // A dropped Move shows its units in the Sector Scan too, as choosing the hex after Use order does.
        if (['construct','colonize','move'].includes(order.type)) showSectorScan(false);
        return true;
      },
    });
    $('#reveal-entire-map').addEventListener('change',event=>{
      if (!developmentMode) return;
      revealEntireMap=event.target.checked;
      render();
    });
    for (const side of ['give','get']) {
      $(`#bank-${side}-options`).innerHTML = RESOURCES.map(resource => `<button class="bank-resource-button" id="bank-${side}-${resource}" type="button" style="--resource:var(--${resource})" aria-label="${side==='give'?'Give 4':'Receive 1'} ${RESOURCE_NAMES[resource]}" aria-pressed="false">${resourceDot(resource)}<span>${RESOURCE_NAMES[resource]}</span></button>`).join('');
      for (const resource of RESOURCES) $(`#bank-${side}-${resource}`).addEventListener('click',()=>{
        bankSelection[side] = resource;
        renderResourceTools();
      });
    }
    setupMatTrades();
    setupPhoneCardSheet();
    setupLogCard();
    setupTradeDrawer();
    setupMarketDrawer();
    $('#bank-trade-form').addEventListener('submit',event => {
      event.preventDefault();
      bankTrade(ME,bankSelection.give,bankSelection.get);
    });
    window.addEventListener('resize',positionSectorScan);
    // Closing the scan (Escape, a click elsewhere, Close) lowers the cards it raised.
    $('#sector-popover').addEventListener('toggle',()=>{ pointedOrderCard=null; syncPlaysHere(); });
    fitTable();
    window.addEventListener('resize',fitTable);
    window.addEventListener('resize',()=>{
      if(state.pendingRelic||storageAllocationDraft?.redistribute||relicCardMode(relicChoiceCard))renderRelicChoice();
      if(state.pendingCombat)renderCombat();
    });
    window.addEventListener('resize',fitMarket);
    // A resized window starts the column untightened, so a window that grows gets it back.
    window.addEventListener('resize',() => { document.documentElement.classList.remove('left-tight', 'left-tighter'); stackLeft(); });
    window.addEventListener('resize',() => fitMap());
    // A resized window balances the supply afresh, from its narrowest cards.
    window.addEventListener('resize',() => { supplyExtra = 0; fitMarket(); stackLeft(); fitMap(); balanceSupply(); });
    // Late layout (web fonts, panels settling) re-fits the market and the map; their own sizing
    // does not change the panels' sizes, so this cannot loop.
    if (typeof ResizeObserver === 'function') {
      const refit = new ResizeObserver(() => { fitMarket(); stackLeft(); fitMap(); balanceSupply(); settleFit(); });
      ['.app-shell', '#market-panel', '#relics-panel', '.board-map-region'].forEach(sel => { const el = $(sel); if (el) refit.observe(el); });
      // Max’s round labels may wrap as fonts settle; keep every item below them in place.
      const refitMaxLeft = new ResizeObserver(() => {
        if (document.body.classList.contains('background-stars')) { stackLeft(); fitMap(); settleFit(); }
      });
      ['#prestige-track', '.phase-stepper', '.log-panel', '#map-legend-corner', '#max-bank-nav'].forEach(sel => { const el = $(sel); if (el) refitMaxLeft.observe(el); });
      // Hex positions are measured as fractions of the board, and a hex's fixed-size parts shift
      // those fractions a little with scale. When a fit has resized the board (a frame later), fit
      // once more at the new size; a fit that keeps the size ends it, so this cannot loop.
      const board = $('#galaxy-board');
      if (board) new ResizeObserver(() => { const now = board.getBoundingClientRect().width; if (fitMapFrom && Math.abs(now - fitMapFrom) > 0.02 * fitMapFrom) { stackLeft(); fitMap(); } }).observe(board);
    }
    document.fonts?.ready?.then?.(() => { fitMarket(); stackLeft(); fitMap(); balanceSupply(); settleFit(); });
    document.addEventListener('scroll',event=>{if(!$('#sector-popover').contains(event.target))positionSectorScan();},true);
    $('#open-map-key').addEventListener('click',()=>$('#map-key-dialog').showModal());
    $('#close-map-key').addEventListener('click',()=>$('#map-key-dialog').close());
    $('#map-zoom').addEventListener('click',()=>{
      const stage=$('.board-stage'); const zoomed=stage.classList.toggle('map-zoomed'); fitMap();
      $('#map-zoom').textContent=zoomed?'Fit map':'Zoom map';
      $('#map-zoom').setAttribute('aria-pressed',String(zoomed));
      if (zoomed) {
        const hex=$(`.hex[data-coord="${state.selected||state.clusters[0].center}"]`);
        const region=$('.board-map-region');
        const viewport=region && region.scrollWidth>region.clientWidth ? region : stage;
        const a=viewport.getBoundingClientRect(), b=hex.getBoundingClientRect();
        viewport.scrollLeft+=b.left-a.left-viewport.clientWidth/2; viewport.scrollTop+=b.top-a.top-viewport.clientHeight/2;
      }
    });
    renderSymbolLegend();
    $('#export-game-report').hidden=replayMode;
    $('#export-game-report').addEventListener('click',downloadGameReport);
    $('#close-prestige').addEventListener('click',()=>$('#prestige-dialog').close());
    $('#undo-turn-button').addEventListener('click',undoLastTurn);
    $('#rules-button').addEventListener('click',()=>$('#rules-dialog').showModal());
    $('#close-rules').addEventListener('click',()=>$('#rules-dialog').close());
    $('#message-continue').addEventListener('click',()=>$('#message-dialog').close());
    $('#message-dialog').addEventListener('close',acknowledgeCombatReport);
    $('#report-button').addEventListener('click',showReplayReport);
    $('#deck-button').addEventListener('click',()=>{if(!replayMode){renderDeck();$('#deck-dialog').showModal();}});
    $('#close-deck').addEventListener('click',()=>$('#deck-dialog').close());
    $('#discard-button').addEventListener('click',()=>$('#discard-dialog').showModal());
    $('#close-discard').addEventListener('click',()=>$('#discard-dialog').close());
    $('#in-play-button').addEventListener('click',()=>$('#in-play-dialog').showModal());
    $('#military-button').addEventListener('click',()=>{renderMilitaryPile();$('#military-dialog').showModal();});
    $('#close-military').addEventListener('click',()=>$('#military-dialog').close());
    $('#storage-pile').addEventListener('click',()=>toast($('#storage-pile').title));
    $('#close-in-play').addEventListener('click',()=>$('#in-play-dialog').close());
    $('#new-game-button').addEventListener('click',()=>{
      if (options.newTable) { options.newTable(); return; }
      const select=$('#new-game-target');
      select.innerHTML=VICTORY_TARGET_CHOICES.map(n=>`<option value="${n}" ${n===victoryTarget()?'selected':''}>${n} Prestige${n===DEFAULT_VICTORY_TARGET?' (default)':''}</option>`).join('');
      // Rules #solo-seating: deal physical homes and preview the rival sharing your half.
      newGameLineup=validLineup(options.lineup) ? [...options.lineup] : rollLineup();
      newGameHomeOrder=validHomeOrder(options.homeOrder) ? [...options.homeOrder] : TUTORIAL ? [...DEFAULT_HOME_ORDER] : rollHomeOrder();
      $('#new-game-maxbot').checked=state.players.some(p=>p.strategy==='maxbot');
      const {neighbor,far}=lineupText(newGameLineup,newGameHomeOrder,$('#new-game-maxbot').checked);
      $('#new-game-neighbor').innerHTML=`<strong>Your neighbor: ${esc(neighbor)}.</strong> It shares your half of the map. Across the map: ${esc(far)}.`;
      $('#new-game-dialog').showModal();
    });
    $('#new-game-maxbot').addEventListener('change',()=>{
      const {neighbor,far}=lineupText(newGameLineup,newGameHomeOrder,$('#new-game-maxbot').checked);
      $('#new-game-neighbor').textContent=`Your neighbor: ${neighbor}. It shares your half of the map. Across the map: ${far}.`;
    });
    $('#new-game-dialog').addEventListener('close',()=>{
      if ($('#new-game-dialog').returnValue!=='start') return;
      newGameSettings={victoryTarget:Number($('#new-game-target').value),lineup:newGameLineup,homeOrder:newGameHomeOrder,maxbot:$('#new-game-maxbot').checked};
      clearTurnHistory();
      state=newState(); fillMarket(); logEvent(`The four factions entered the Reach and drew their opening five cards. First to ${victoryTarget()} Prestige at a round's end wins.`); logNeighbor(); saveGame(); render(); beginRound();
    });
    $('#finish-construct').addEventListener('click',()=>finishConstruct(ME));
    $('#skip-colony-build').addEventListener('click',()=>finishColonyBuild(ME));
    $('#finish-buy-button').addEventListener('click',finishHumanBuy);
    $('#hand-finish-buy-button').addEventListener('click',finishHumanBuy);
    $('#pass-button').addEventListener('click',()=>{
      passOperations(ME);
      if (state.phase==='buy' && state.activePlayer===ME) $('#console').scrollIntoView?.({block:'start'});
    });
    $('#open-relic-catalog').addEventListener('click',()=>{
      $('#relic-catalog-grid').innerHTML=Object.keys(RELIC_CARDS).map(key=>cardMarkup({key},'catalog')).join('');
      $('#relic-catalog-dialog').showModal();
    });
    $('#close-relic-catalog').addEventListener('click',()=>$('#relic-catalog-dialog').close());
    $('#cancel-excavate').addEventListener('click',()=>{if(state.actionMode!=='excavate' || state.pendingCombat)return;clearAction();switchTab('hand');render();saveGame();});
    $('#storage-allocation-cancel').addEventListener('click',()=>$('#storage-allocation-dialog').close());
    $('#storage-allocation-dialog').addEventListener('close',()=>{
      const draft=storageAllocationDraft;storageAllocationDraft=null;
      if(draft?.redistribute) {
        relicChoiceCard=null;relicChoiceBattle=false;
        if(state.pendingRelic?.playerId===ME&&state.pendingRelic.card===draft.cardId)applyRelicAction(ME,{type:'relic_cancel'});
      }
    });
    $('#exchange-resource-cancel').addEventListener('click',()=>$('#exchange-resource-dialog').close());
    $('#archive-purge-cancel').addEventListener('click',()=>$('#archive-purge-dialog').close());
    $('#archive-purge-dialog').addEventListener('close',()=>{archivePurgeCardId=null;});
    $('#archive-purge-form').addEventListener('submit',event=>{
      event.preventDefault();
      const card=state.players[ME].hand.find(c=>c.id===archivePurgeCardId);
      if(!card)return;
      // Keep discard order, the single spelling a shared table accepts.
      const picked=new Set(archivePurgeSelection()),trash=archivePurgeTargets(ME).map(c=>c.id).filter(id=>picked.has(id));
      $('#archive-purge-dialog').close();
      resolveHumanSpecial(card,ALL_CARDS[card.key],ME,trash);
    });
    $('#storage-allocation-form').addEventListener('submit',event=>{
      event.preventDefault();if(!storageAllocationDraft)return;
      const allocation=storageAllocationValues();
      if(storageAllocationDraft.redistribute) {
        const base=storageAllocationDraft.base;
        if(!RESOURCES.every(r=>base[r]===resourceLimits(ME)[r])||network?.busy())return;
        const commands=reservoirCommands(Object.fromEntries(RESOURCES.map(r=>[r,base[r]+allocation[r]])));
        if(!commands)return;
        storageAllocationDraft=null;relicChoiceCard=null;relicChoiceBattle=false;
        $('#storage-allocation-dialog').close();
        if(!commitReservoirAllocation(commands))toast('The table changed. Choose your capacity changes again.');
        return;
      }
      if(!validStorageAllocation(allocation,storageAllocationDraft.points)||!canManageResources(ME))return;
      const card=state.players[ME].hand.find(c=>c.id===storageAllocationDraft.cardId);
      if(!card)return;
      storageAllocationDraft=null;$('#storage-allocation-dialog').close();
      resolveHumanSpecial(card,ALL_CARDS[card.key],ME,allocation);
    });
    $('#convert-all-button').addEventListener('click',convertAllResources);
    $('#trade-form').addEventListener('submit',submitTrade);
    $('#relic-choice-filter').addEventListener('input',renderRelicChoice);
    $('#relic-choice-options').addEventListener('change',()=>{relicChoiceChosen=true;renderRelicChoiceDetail();});
    $('#relic-choice-cancel').addEventListener('click',cancelRelicChoice);
    $('#relic-card-close').addEventListener('click',cancelRelicChoice);
    $('#relic-card-dialog').addEventListener('close',()=>{
      if(relicChoiceCard===$('#relic-card-dialog').dataset.card){relicChoiceCard=null;relicChoiceBattle=false;}
    });
    $('#relic-card-payment').addEventListener('change',()=>{relicCardPayment=Number($('#relic-card-payment').value);updateRelicCardSelection();});
    $('#relic-card-confirm').addEventListener('click',()=>{
      const mode=relicCardMode(relicChoiceCard),action=mode&&relicCardAction(mode,availableRelicChoices());
      if(!action)return;
      relicChoiceCard=null;relicChoiceBattle=false;closeRelicCards();applyRelicAction(ME,action);
    });
    $('#relic-action-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelRelicChoice();});
    $('#relic-choice-confirm').addEventListener('click',()=>{const a=availableRelicChoices()[Number($('#relic-choice-options').value)];if(!a)return;const battle=relicChoiceBattle;relicChoiceCard=null;relicChoiceBattle=false;relicChoiceChosen=false;$('#relic-action-dialog').close();if(battle)applyCombatAction(ME,a);else applyRelicAction(ME,a);});
    const combatDialog=$('#combat-dialog');
    combatDialog.addEventListener('cancel',event=>event.preventDefault());
    combatDialog.addEventListener('close',renderCombat);


    const consortiumDialog = $('#consortium-dialog');
    consortiumDialog.addEventListener('cancel',event=>event.preventDefault());
    consortiumDialog.addEventListener('close',()=>renderConsortium());
    for (const [selector,initial] of [['#consortium-give','matter'],['#consortium-get','data']]) {
      $(selector).innerHTML = RESOURCES.map(type=>`<option value="${type}">${RESOURCE_NAMES[type]}</option>`).join('');
      $(selector).value = initial;
      $(selector).addEventListener('change',renderConsortium);
    }
    $('#upgrade-resource').innerHTML = RESOURCES.map(type=>`<option value="${type}">${RESOURCE_NAMES[type]}</option>`).join('');
    $('#upgrade-resource').addEventListener('change',renderUpgradeChoice);
    $('#upgrade-dialog').addEventListener('close',()=>{upgradeChoiceKey=null;});
    $('#open-trash').addEventListener('click',()=>{renderMarket();if(!$('#trash-dialog').open)$('#trash-dialog').showModal();});
    $('#close-trash').addEventListener('click',()=>$('#trash-dialog').close());
    $('#close-upgrade').addEventListener('click',()=>$('#upgrade-dialog').close());
    const menuButton=$('#table-menu-button');
    const setMenu=open=>{document.body.classList.toggle('menu-open',open);menuButton.setAttribute('aria-expanded',String(open));};
    menuButton.addEventListener('click',()=>setMenu(!document.body.classList.contains('menu-open')));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('menu-open')){setMenu(false);menuButton.focus();}});
    document.addEventListener('click',event=>{if(document.body.classList.contains('menu-open')&&!event.target.closest('.topbar, .playtest-changes, .personal-report, #table-menu-button'))setMenu(false);});
    $$('.topbar .header-actions').forEach(actions=>actions.addEventListener('click',event=>{if(event.target.closest('button, a'))setMenu(false);}));
    $('#board-primary').addEventListener('click',()=>{ const target=$(`#${$('#board-primary').dataset.target}`); if (target && !target.hidden) target.click(); });
    $('#consortium-form').addEventListener('submit',event=>{event.preventDefault();consortiumExchange(ME,$('#consortium-give').value,$('#consortium-get').value);});
    $('#consortium-cancel').addEventListener('click',()=>finishConsortium(ME,true));
    $('#consortium-finish').addEventListener('click',()=>finishConsortium(ME));
    const consoleTabs=$$('.console-tab[data-tab]');
    consoleTabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>switchTab(tab.dataset.tab));
      tab.addEventListener('keydown',event=>{
        if(tableLayout())return;
        let next=index;
        if(event.key==='ArrowRight')next=(index+1)%consoleTabs.length;
        else if(event.key==='ArrowLeft')next=(index-1+consoleTabs.length)%consoleTabs.length;
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=consoleTabs.length-1;
        else return;
        event.preventDefault();
        switchTab(consoleTabs[next].dataset.tab);
        consoleTabs[next].focus();
      });
    });
    // On a phone the map fills the screen and the rest of the table slides up in drawers.
    $$('.phone-drawers [data-drawer]').forEach(button=>button.addEventListener('click',()=>setDrawer(document.body.dataset.drawer===button.dataset.drawer?'':button.dataset.drawer)));
    setDrawer(phoneMarket ? 'supply' : 'hand');
    // At the table the bank lies open at the foot of the comms feed; its heading is a label.
    const bankTools=$('#resource-tools'), bankLabel=bankTools?.querySelector('summary');
    if(bankTools&&bankLabel&&tableLayout()){bankTools.open=true;bankLabel.tabIndex=-1;bankLabel.addEventListener('click',event=>{if(tableLayout())event.preventDefault();});}
  }

  // Shared table client. The server's table service owns the game; each human
  // choice below becomes one seat command (an object the adapter lists as legal),
  // and every seat then receives its own private view through adoptServerView.
  // Locally the engine only renders and runs the dry-run checks the controls use.
  let serverHints = {};
  let serverUndo = {available: false};
  let autoSentAt = null;
  function installNetworkClient() {
    const send = (...intents) => intents.length > 0 && network.act(intents) !== false;
    const mine = id => id === ME;
    const checkExcavate = excavate;
    passOperations = id => mine(id) && state.phase === 'operations' && state.activePlayer === ME && send({type:'pass'});
    finishHumanBuy = () => { if (state.phase === 'buy' && state.activePlayer === ME && overflowPlayer() < 0) send({type:'finish_buy'}); };
    nextBuyPlayer = () => state.phase === 'buy' && state.activePlayer === ME && send({type:'finish_buy'});
    playResourceMode = cardId => canConvertCards() && state.players[ME].hand.some(c => c.id === cardId&&canConvertCard(c)) && send({type:'resource',card:cardId});
    convertAllResources = () => { if (canConvertCards()) send(...state.players[ME].hand.filter(canConvertCard).map(c => ({type:'resource',card:c.id}))); };
    resolveHumanSpecial = (card, definition, id = ME, allocation = null) => {
      if(definition.relicAbility){if(mine(id))openRelicChoice(card.id);return false;}
      if (!mine(id) || !card || state.pendingCombat) return false;
      if(definition.effect?.bankRate){if(!canPlayExchange(id,card.id))return false;if(!RESOURCES.includes(allocation)){openExchangeResource(card.id);return false;}return send({type:'special',card:card.id,resource:allocation});}
      if (definition.tag === 'alienCradle' || definition.effect?.allocate) {
        if (!validStorageAllocation(allocation,definition.effect?.allocate || RELIC_STORAGE_POINTS)) { if (canManageResources(ME)) openStorageAllocation(card.id); return false; }
        return send({type:'special',card:card.id,allocation});
      }
      if (definition.effect?.trashStarters) {
        if (!validArchivePurgeChoice(ME,allocation,definition.effect.trashStarters)) { openArchivePurge(card.id); return false; }
        return send({type:'special',card:card.id,trash:allocation});
      }
      return send({type:'special',card:card.id});
    };
    // Locating the closest unknown relic needs hidden relic sectors. The server
    // sends legal origins and a private availability status, never a target.
    probeRelic = (id, coord, cardId, dryRun = false) => {
      const legal = mine(id) && (serverHints.probe || []).some(p => p.coord === coord && p.card === cardId);
      return dryRun || !legal ? legal : send({type:'probe',card:cardId,coord});
    };
    excavate = (id, coord, cardId, relicId, dryRun = false) => {
      const legal = mine(id) && checkExcavate(id,coord,cardId,relicId,true);
      return dryRun || !legal ? legal : send({type:'excavate',card:cardId,coord,relic:relicId});
    };
    // 33.38 #movement: the chosen units travel with the command (rules #shared-tables).
    performMoveOrder = (id, source, destination, card, opts = {}) => {
      const units = mine(id) && !!card && moveSelection(getFleet(source,ME),opts);
      return !!units && send({type:'move',card:card.id,source,destination,moveGroup:units.explorer?'explorer':'ships',units});
    };
    performConstructOrder = (id, coord, kind, card) => mine(id) && !!card && !state.pendingConstruct && constructAt(ME,coord,kind,null,true)
      && send({type:'build',card:card.id,coord,kind});
    useConstructDraw = (id,cardId) => mine(id) && canConstructDraw(id,cardId) && send({type:'construct_draw',card:cardId,key:'construct'});
    useOrderDraw = (id,cardId) => mine(id) && canOrderDraw(id,cardId) && send({type:'order_draw',card:cardId,key:'seedArk'});
    finishConstruct = (id, coord = null, kind = null) => mine(id) && state.pendingConstruct?.playerId === ME
      && (coord === null ? send({type:'finish_construct'}) : canSecondConstruct(ME,coord,kind) && send({type:'second_build',coord,kind}));
    applyColonizeOrder = (id, coord, card) => mine(id) && !!card && colonizePlanet(ME,coord,{tag:ALL_CARDS[card.key].tag},true) && send({type:'colonize',card:card.id,coord});
    finishColonyBuild = (id, coord = null, kind = null) => mine(id) && state.pendingColonyBuild?.playerId === ME
      && (coord === null ? send({type:'finish_colony_build'}) : canColonyBuild(ME,coord,kind) && send({type:'colony_build',coord,kind}));
    consortiumGain = (id, resource) => canConsortiumGain(id,resource) && send({type:'consortium_gain',resource});
    consortiumExchange = (id, giveType, getType) => canConsortiumExchange(id,giveType,getType) && send({type:'consortium_exchange',giveType,getType});
    finishConsortium = (id, cancel = false) => !!consortiumPending(id) && send({type:cancel ? 'cancel_consortium' : 'finish_consortium'});
    discardResources = (id, resource, amount) => mine(id) && canManageResources(ME) && send({type:'discard_resources',resource,amount});
    bankTrade = (id, giveType, getType) => mine(id) && canBankTrade(ME,giveType,getType) && send({type:'bank_trade',giveType,getType});
    offerTrade = (id, terms) => mine(id) && canOfferTrade(ME,terms) && send({type:'trade_offer',giveType:terms.giveType,getType:terms.getType,giveAmount:terms.giveAmount,getAmount:terms.getAmount});
    respondTrade = (id, offer, response) => mine(id) && send({type:response === 'accept' ? 'trade_accept' : 'trade_reject',offer});
    cancelTrade = (id, offer) => mine(id) && send({type:'trade_cancel',offer});
    buyCard = (id, source, indexOrKey) => mine(id) && send(source === 'market' ? {type:'buy',source,index:indexOrKey} : {type:'buy',source,key:indexOrKey});
    upgradeStarter = (id, card, resource) => mine(id) && send({type:'upgrade',card,resource});
    useBuyEffect = (card, id = ME) => { if (mine(id)) send({type:'buy_effect',card}); };
    decommission = (id, card, resource) => mine(id) && send({type:'decommission',card,resource});
    applyRelicAction = (id, action) => mine(id) && send(action);
    commitReservoirAllocation = commands => send(...commands);
    applyCombatAction = (id, action) => mine(id) && send(action);
    // Shared-table Undo: the server rolls the whole table back and every seat refreshes.
    undoLastTurn = () => { if (serverUndo.available && !network.busy()) network.undo(); };
    scheduleAiTurn = () => {};
    scheduleCombatAi = () => {};
    captureHumanTurn = () => {};
    renderHistoryStatus = () => { $('#history-status').textContent = 'The table service keeps the full history. The game report opens when the game ends.'; };
    downloadGameReport = () => network.report?.();
  }

  // Replaces the local position with the server's private view for this seat,
  // keeping only interface choices (selected hex, a half-chosen order) that still apply.
  function adoptServerView(view) {
    const previous = state, next = view.state;
    serverHints = view.hints || {};
    serverUndo = view.undo || {available: false};
    const myTurn = next.winner === null && next.activePlayer === ME;
    const sameTurn = !!previous && myTurn && previous.winner === null && previous.activePlayer === ME && previous.phase === next.phase && previous.round === next.round;
    const keepOrder = sameTurn && !!previous.actionCardId && previous.turnStage === 'action' && !next.pendingConsortium && !next.pendingColonyBuild && !next.pendingConstruct
      && next.players[ME].hand.some(card => card.id === previous.actionCardId);
    next.selected = previous?.selected ?? null;
    for (const key of ['actionMode','actionCardId','actionOptions','moveSource','reachable']) next[key] = keepOrder ? previous[key] : null;
    next.actionOptions = next.actionOptions || {};
    next.reachable = next.reachable || [];
    const combat = next.lastCombat && previous && JSON.stringify(next.lastCombat) !== JSON.stringify(previous.lastCombat)
      && [next.lastCombat.attackerId,next.lastCombat.defenderId].includes(ME);
    next.pendingCombatReport = combat ? next.lastCombat : previous?.pendingCombatReport || null;
    next.turnStage = !myTurn ? 'waiting' : next.phase === 'buy' ? 'buy' : next.pendingConsortium ? 'consortium'
      : next.pendingConstruct?.playerId === ME ? 'construct-again'
      : next.pendingColonyBuild?.playerId === ME ? 'bonus-build' : keepOrder ? 'action' : 'prep';
    state = next;
    if (state.turnStage === 'construct-again') { state.actionMode = 'construct'; state.actionOptions = {cardName:pendingBuildName()}; }
    if (state.turnStage === 'bonus-build') {
      state.actionMode = 'colony-build';
      state.reachable = adjacentKeys(state.pendingColonyBuild.colony).filter(key => canBuildStructureAt(ME,key));
    }
    if (myTurn && !sameTurn) {
      switchTab(state.phase === 'buy' ? 'market' : 'hand');
      if (!autoTurn) autoNotice = '';
    }
    if (!keepOrder && $('#consortium-dialog').open && !state.pendingConsortium) $('#consortium-dialog').close();
    render();
    resumePendingChoice();
    if (previous?.probeStatus==='available' && next.probeStatus==='all_discovered') toast('You have now discovered all remaining relics.');
    // The same interface automation as solo play: an empty hand passes, an empty Buy finishes.
    if (myTurn && autoSentAt !== view.seq && !network.busy()) {
      autoSentAt = view.seq;
      if (!autoPassIfHandEmpty()) autoSkipBuy();
    }
  }

  // The rule primitives the headless adapter (adapter.js) works through.
  function headlessPort() {
    return {
      get state() { return state; }, get turnSerial() { return turnSerial; }, get cardSerial() { return cardSerial; },
      runAiOperation, runAiBuy, chooseCombatAction, aiIncome, relicOperations, relicDraftActions, applyRelicAction,
      clone, deckContents, canPlayExchange, COLONY_LIFE_COST, colonyTerms, aiTradeGoals, aiGoalTradePlan, aiExchangeResource, aiTryExchange, catalogMarketEnabled, marketOffers, marketCopiesRemaining, bankTradeRate, ALL_CARDS, MARKET_TIERS, marketTier, BASIC_CARDS, RELIC_CARDS, STRUCTURES, SHIP_STATS, RESOURCES, STORAGE_UPGRADE, RELIC_STORAGE_POINTS, CAPACITY_SUPPLY, SUPPLY_CARDS, storageUpgradeCost, EXCAVATION_COST, nearestProbeRelic,
      canAfford, canConvertCard, cardResources, resourceGainTotal, remainingResourceCapacity, addResources,
      removeHandCard, passOperations, completeAction, nextBuyPlayer, buyCard, upgradeStarter,
      decommission, trashEligibleCards, excavatedRelicCount, useBuyEffect, resolveHumanSpecial,
      colonizePlanet, buildUpgrade, probeStatus, probeRelic, excavate, buildShip, getFleet, fleetCount,
      BOARD_RADIUS, PORTAL_MOVEMENT_COST, portalExit, movementRoutes, travelDistance, fleetGroup, moveSelection, fleetMove, fleetPower, reachableFrom, executeMove, performMoveOrder, combatActor, combatView, combatActions, applyCombatAction, nearestUnscannedRelicCluster,
      clusterKnown, clusterRevealed, clusterScanned, relicKnown, relicCoordInCluster, calculatePrestige, colonyPlanets,
      totalResources, playerCapacity, resourceLimits, resourceExcess, totalResourceExcess, storageAllocations, validStorageAllocation, overflowPlayer, discardOverflow,
      canConsortiumGain, canConsortiumExchange, consortiumGain, consortiumExchange, finishConsortium,
      canOrderDraw, useOrderDraw, canConstructDraw, useConstructDraw, performConstructOrder, canSecondConstruct, finishConstruct, movementRange, constructionCost, constructAt, applyColonizeOrder, canColonyBuild, finishColonyBuild,
      canBuyCapacity, buyCapacity, canManageResources, convertCard, drawStarterBonus, starterLevel, upgradePrice, discardResources, canBankTrade, bankTrade,
      canOfferTrade, offerTrade, tradeResponseAllowed, tradeBlockReason, respondTrade, cancelTrade,
      purchaseCost, buildDiscountOptions, avoidsHostile, applyBuildBonus, victoryTarget, tacticHand, MARKET_CARDS, HARVESTER_YIELD,
      archivePurgeChoices, MILITARY_CARDS, COMBAT_VICTORY_PRESTIGE
    };
  }

  // A shared table resumes from its stored snapshot, as a solo save loads: any
  // save-compatible build of these rules can continue it (docs/shared-tables.md).
  if (headless && options.resume) {
    const saved = options.resume;
    if (saved.state?.version !== SAVE_FORMAT_VERSION || saved.state?.rulesRevision !== RULES_REVISION)
      throw new Error('This snapshot belongs to other rules.');
    state = clone(saved.state);
    cardSerial = saved.cardSerial;
    turnSerial = saved.turnSerial;
    const port = headlessPort();
    return createGalacticAdapter(port);
  }

  if (headless) {
    state = newState();
    fillMarket();
    logEvent('Every faction drew its opening five cards.');
    beginRound();
    return createGalacticAdapter(headlessPort());
  }

  if (replayMode) {
    wireUi();
    // Stepping from the replay toolbar must not dismiss the Sector Scan.
    const scan = $('#sector-popover');
    scan.popover = 'manual';
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && scan.matches(':popover-open')) scan.hidePopover(); });
    return {
      describe: describeDecision,
      show(view, extra) { viewSeat = extra.viewSeat ?? 0; replayState(view, extra); render(); }
    };
  }

  if (network) {
    if (network.rules !== RULES_ID)
      throw new Error(`This shared table plays rules ${network.rules}, which this page cannot show.`);
    installNetworkClient();
    wireUi();
    $('#new-game-button').hidden = true;
    adoptServerView(network.initial);
    return {
      sync: adoptServerView, seat: ME,
      inspectSector(coord) {
        if (!boardHas(coord) || state.actionMode || state.pendingCombat) return false;
        state.selected=coord;render();showSectorScan(true);return true;
      },
      selectedSector:()=>state.selected,
      cardName(id) { const card=state.players[ME].hand.find(c=>c.id===id);return card?`${ALL_CARDS[card.key].name}${starterLevel(card)>1?' '+starterLevel(card):''}`:'Card no longer in hand'; },
      describeChoice(intent) {
        const held=state.players[ME].hand.find(c=>c.id===intent.card);
        if(intent.type==='upgrade' && held)return `Upgrade ${ALL_CARDS[held.key].name} to level ${starterLevel(held)+1} · ${upgradePrice(held)} ${RESOURCE_NAMES[intent.resource]}`;
        const action={...intent,...(held?{gain:cardResources(held)}:{})};
        return describeDecision(ME,action,state,state.players.map(p=>p.name)).text;
      }
    };
  }

  wireUi();
  loadTurnHistory();
  if (!loadGame()) {
    if (options.requireSave) throw new Error("The saved table could not be loaded. Your server save has been preserved.");
    clearTurnHistory();
    state=newState();
    fillMarket();
    logEvent(`The four factions entered the Reach and drew their opening five cards. First to ${victoryTarget()} Prestige at a round's end wins.`);
    logNeighbor();
    saveGame();
    render();
    beginRound();
  } else {
    fillMarket();
    render();
    resumePendingChoice();
    if (state.phase === 'buy' && state.activePlayer === ME) switchTab('market');
    else openExcavationRewards();
    scheduleCombatAi();
    if (state.winner === null && state.activePlayer !== ME && state.phase === 'operations') scheduleAiTurn('operations', runAiOperation, 650);
    if (state.winner === null && state.activePlayer !== ME && state.phase === 'buy') scheduleAiTurn('buy', runAiBuy, 650);
  }
 }
// The browser storage keys this engine reads and writes on this page (dev pages add their
// revision, docs/release.md#dev-channel). Builds no game, so it touches no DOM or storage.
createGalacticReach.storageKeys = () => createGalacticReach({storageKeys:true});
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticReach;
else if (typeof document !== 'undefined' && !globalThis.drawingBoardTableBoot) createGalacticReach(globalThis.galacticReachTutorial?.engineOptions?.() || {});
