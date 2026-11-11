// Browser UI and authoritative adapter share these exact rules.
'use strict';
function createGalacticReach(options = {}) {
  const headless = options.headless === true;
  // Replay viewer: the live table's renderers over recorded observer states. No rules run.
  const replayMode = options.replay === true;
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

  const SAVE_FORMAT_VERSION = 13;
  const RULES_REVISION = 18;
  const SAVE_KEY = `galactic-reach-save-v${SAVE_FORMAT_VERSION}`;
  const TURN_HISTORY_KEY = `galactic-reach-turn-history-v${SAVE_FORMAT_VERSION}`;
  const RESOURCES = ['matter', 'energy', 'biomass', 'data'];
  const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Biomass', data: 'Data' };
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
  const BOARD_RADIUS = 12;
  const VICTORY_TARGET = 20;
  const CARDS_PER_PRESTIGE = 8;
  const HOME_STARTS = [
    { cluster: 0, owner: 0, colonySector: 0, inwardSector: 1 },
    { cluster: 1, owner: 1, colonySector: 0, inwardSector: 6 },
    { cluster: 2, owner: 2, colonySector: 0, inwardSector: 4 },
    { cluster: 3, owner: 3, colonySector: 0, inwardSector: 3 }
  ];
  const HOME_CLUSTER_OWNERS = HOME_STARTS.map(({ cluster, owner }) => [cluster, owner]);
  const RELIC_SECTORS = [[4,2],[5,5],[6,1],[7,4],[8,6],[9,3],[10,2],[11,5]];
  const SHIP_STATS = {
    settler: { name: 'Settler', move: 1, power: 1, hull: 1, cost: { matter: 1, energy: 1 } },
    explorer: { name: 'Explorer', move: 3, power: 0, hull: 1, civilian: true, cost: { energy: 1, data: 2 } },
    fleet: { name: 'Fleet', move: 2, power: 2, hull: 2, cost: { matter: 2, energy: 1, biomass: 1 } },
  };
  const MILITARY_CARDS = {
    concentratedFire: { name: 'Concentrated Fire', attack: 1, shield: 0, text: '+1 hit.' },
    defensiveScreen: { name: 'Defensive Screen', attack: 0, shield: 2, text: 'Prevent 2 hits.' },
    flankingRun: { name: 'Flanking Run', attack: 1, shield: 0, tag: 'light', text: '+2 hits with a surviving Settler or Fleet; otherwise +1.' },
    heavyBarrage: { name: 'Heavy Barrage', attack: 1, shield: 0, tag: 'heavy', text: '+2 hits with a surviving Shipyard; otherwise +1.' },
    electronicWarfare: { name: 'Electronic Warfare', attack: 1, shield: 1, pierce: 1, text: '+1 hit, prevent 1, and ignore 1 enemy shield.' },
    tacticalWithdrawal: { name: 'Tactical Withdrawal', attack: 0, shield: 1, retreat: true, text: 'Prevent 1 hit, then retreat if any combat ships survive.' }
  };
  const MILITARY_DECK_LIST = [
    'concentratedFire','concentratedFire','concentratedFire',
    'defensiveScreen','defensiveScreen',
    'flankingRun','flankingRun',
    'heavyBarrage','heavyBarrage',
    'electronicWarfare',
    'tacticalWithdrawal','tacticalWithdrawal'
  ];
  const STRUCTURES = {
    harvester: { name: 'Harvester', code: 'H', cost: { matter: 1, energy: 1, biomass: 1 }, upgradeCost: { matter: 2, energy: 1, biomass: 1 } },
    starbase: { name: 'Shipyard', code: 'S', cost: { matter: 2, energy: 1, biomass: 1, data: 1 }, upgradeCost: { matter: 2, energy: 2, data: 2 } },
  };
  const STORAGE_UPGRADE = { cost: { matter: 2, energy: 1, data: 1 }, capacity: 5 };
  const EXCAVATION_COST = { matter: 1, energy: 1, data: 2 };
  const LEGEND_TOOLTIPS = {
    settler: 'Colony ship. Base movement 1; Move II adds 1. It has 1 combat power, reveals worlds by entering them, and is required to colonize. Commission at a Shipyard to receive a Colonize card.',
    explorer: 'Civilian explorer. Reveals worlds by entering them. Base movement 3; Move II adds 1. Commission at a Shipyard to receive Excavate directly in hand. Play it at a relic, pay 1 Matter, 1 Energy, and 2 Data, and choose a relic card. Keep the Explorer; trash Excavate.',
    fleet: 'Reveals worlds by entering them. Base movement 2 (3 with Move II), with 2 combat power and 2 hull.',
    colony: 'Claims a seven-hex world. Colonies must occupy the world’s center hex.',
    harvester: 'Adds 1 resource to this planet’s production.',
    starbase: 'Commissions ships and contributes 3–4 defensive combat power.',
  };
  const BASIC_TOOLTIPS = {
    colonize: 'Use a Settler on the center hex of an eligible world to found or capture its Colony.',
    construct: 'Build one structure on any empty planet hex adjacent to your Colony, upgrade one building, or commission one ship at a Shipyard.',
    move: 'Move ships or Explorers up to the selected group’s speed.',
    excavate: 'With an Explorer at a relic, pay 1 Matter, 1 Energy, and 2 Data. Choose a relic card into hand, gain 1 Prestige, remove the relic, and trash Excavate. Keep the Explorer.'
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
    colonize: { name: 'Colonize', kind: 'Basic', accent: 'var(--biomass)', resource: { biomass: 1 }, order: 'colonize', text: 'Establish a Colony with a Settler on a world’s center hex.' },
    construct: { name: 'Construct', kind: 'Basic', accent: 'var(--matter)', resource: { matter: 1 }, order: 'construct', text: 'Build on any empty planet hex adjacent to your Colony, upgrade a building, or commission one ship.', cost: { matter: 1, data: 1 } },
    move: { name: 'Move', kind: 'Basic', accent: 'var(--energy)', resource: { energy: 1 }, order: 'move', text: 'Move one ship group or Explorer team at its own speed.', cost: { energy: 1, data: 1 } },
    excavate: { name: 'Excavate', kind: 'Basic', accent: 'var(--data)', resource: { data: 1 }, order: 'excavate', text: 'At your Explorer’s relic, pay 1 Matter, 1 Energy, and 2 Data. Choose a relic card into hand and gain 1 Prestige. Remove the relic and trash this card; keep the Explorer.' }
  };

  const BASIC_MARKET = ['move', 'construct'];

  const ADVANCED_CARDS = {
    surveyDrones: { name: 'Survey Drones', kind: 'Exploration', accent: 'var(--data)', resource: { data: 2 }, order: 'move', tag: 'settlerBoost', text: 'Move a fleet at its own speed.', cost: { energy: 1, data: 1 } },
    pathfinderNetwork: { name: 'Pathfinder Network', kind: 'Exploration', accent: 'var(--energy)', resource: { energy: 1, biomass: 1 }, order: 'move', tag: 'pathfinder', text: 'Move a fleet with +1 range; it cannot initiate combat.', cost: { energy: 1, biomass: 1, data: 1 } },
    dropColonyModules: { name: 'Drop Colony Modules', kind: 'Expansion', accent: 'var(--biomass)', resource: { biomass: 2 }, order: 'colonize', tag: 'dropColony', text: 'Colonize for 1 less Biomass without consuming the Settler.', cost: { matter: 1, biomass: 2, data: 1 } },
    modularConstruction: { name: 'Modular Construction', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 2 }, order: 'construct', tag: 'doubleBuild', text: 'Build upgrades on two different planets; second costs 1 less Matter.', cost: { matter: 2, energy: 1, data: 1 } },
    industrialSurge: { name: 'Industrial Surge', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 1, energy: 1 }, order: 'special', tag: 'surge', text: 'Immediately produce from up to three owned hexes in one world, chosen automatically. Rich adds 1; Harvesters add nothing.', cost: { matter: 2, energy: 2, biomass: 1 } },
    orbitalShipyards: { name: 'Orbital Shipyards', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 2 }, order: 'construct', tag: 'doubleShip', text: 'Commission up to two ships at one Shipyard; second costs 1 less Energy.', cost: { matter: 2, energy: 1, biomass: 1, data: 1 } },
    terraformingProtocols: { name: 'Terraforming Protocols', kind: 'Industry', accent: 'var(--biomass)', resource: { biomass: 2 }, order: 'special', tag: 'terraform', text: 'Pay 2 Biomass to make a controlled planet Rich.', cost: { matter: 2, energy: 1, biomass: 2, data: 1 } },
    tradeConsortium: { name: 'Trade Consortium', kind: 'Commerce', accent: 'var(--gold)', resource: { data: 1 }, wildcard: 1, order: 'special', tag: 'bankTrade', text: 'Choose 1 resource to gain, or choose up to two bank exchanges at 2:1.', cost: { matter: 1, energy: 1, biomass: 1, data: 1 } },
    fleetOverdrive: { name: 'Fleet Overdrive', kind: 'Military', accent: 'var(--energy)', resource: { energy: 2 }, order: 'move', tag: 'overdrive', text: 'Move a fleet with +2 range; an initiated battle cannot be retreated from early.', cost: { matter: 1, energy: 2 } },
    targetingAlgorithms: { name: 'Targeting Algorithms', kind: 'Reaction', accent: 'var(--data)', resource: { data: 2 }, reaction: 'targeting', text: 'Automatically add 1 hit to your next combat volley.', cost: { energy: 1, data: 2 } },
    ablativePlating: { name: 'Ablative Plating', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 2 }, reaction: 'prevent', text: 'Automatically prevent up to two hits in your next combat.', cost: { matter: 2, biomass: 1 } },
    emergencyJump: { name: 'Emergency Jump', kind: 'Reaction', accent: 'var(--energy)', resource: { energy: 1, data: 1 }, reaction: 'jump', text: 'Automatically retreat from a disastrous volley after suffering one hit.', cost: { energy: 2, data: 1 } },
    coordinatedAssault: { name: 'Coordinated Assault', kind: 'Military', accent: 'var(--red)', resource: { matter: 1, energy: 1 }, order: 'move', tag: 'assault', text: 'Move to attack with +1 hit in the first combat volley.', cost: { matter: 1, energy: 1, biomass: 1, data: 1 } },
    salvageCrews: { name: 'Salvage Crews', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 1, data: 1 }, reaction: 'salvage', text: 'After a battle, gain Matter for destroyed ships, maximum 3.', cost: { matter: 2, biomass: 1, data: 1 } },
    tacticalForesight: { name: 'Tactical Foresight', kind: 'Tactics', accent: 'var(--data)', resource: { data: 2 }, order: 'special', tag: 'foresight', text: 'Draw three cards, keep two, discard one.', cost: { energy: 1, data: 2 } },
    dataBrokerage: { name: 'Data Brokerage', kind: 'Deckcraft', accent: 'var(--data)', resource: { biomass: 1, data: 1 }, order: 'special', tag: 'brokerage', text: 'Trash the first basic card in discard (starters included), then draw two.', cost: { biomass: 1, data: 2 } },
    procurementNetwork: { name: 'Procurement Network', kind: 'Buy', accent: 'var(--gold)', resource: { data: 2 }, buyEffect: 'procurement', text: 'Buy up to two cards this Buy phase; second costs 1 less resource.', cost: { matter: 1, biomass: 1, data: 2 } },
    marketManipulation: { name: 'Market Manipulation', kind: 'Buy', accent: 'var(--gold)', resource: { energy: 1, data: 1 }, buyEffect: 'manipulation', text: 'Refresh up to two market cards; your next purchase costs 1 less Data.', cost: { energy: 1, biomass: 1, data: 2 } },
    commandUplink: { name: 'Command Uplink', kind: 'Tactics', accent: 'var(--data)', resource: { energy: 1, data: 1 }, order: 'special', tag: 'uplink', text: 'Return a basic order from discard to hand and play it immediately.', cost: { energy: 2, biomass: 1, data: 2 } }
  };

  const RELIC_CARDS = {
    "voidglassAstrolabe": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Voidglass Astrolabe",
        "affinity": "Exploration",
        "order": "special",
        "tag": "alienSurvey",
        "resource": {
            "energy": 2,
            "data": 2
        },
        "text": "Reveal the two nearest unexplored worlds to everyone.",
        "lore": "A lens that remembers stars before they were born."
    },
    "phaseShearDrive": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Phase-Shear Drive",
        "affinity": "Exploration",
        "order": "move",
        "tag": "alienPhase",
        "resource": {
            "energy": 3,
            "data": 1
        },
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
        "resource": {
            "data": 3
        },
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
        "resource": {
            "data": 2,
            "energy": 1
        },
        "text": "Privately locate every remaining relic, then draw one card. The surrounding worlds stay hidden.",
        "lore": "Twelve dead moons hum the same coordinates."
    },
    "genesisSeedVault": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Genesis Seed Vault",
        "affinity": "Settlement",
        "order": "colonize",
        "tag": "alienGenesis",
        "resource": {
            "biomass": 3,
            "matter": 1
        },
        "text": "Found or capture a Colony for zero Biomass without consuming the Settler. Gain 2 Matter after success.",
        "lore": "An entire lost biosphere sleeps inside one seed."
    },
    "precursorMatterLoom": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Precursor Matter Loom",
        "affinity": "Settlement",
        "order": "special",
        "tag": "alienLoom",
        "resource": {
            "matter": 3,
            "data": 1
        },
        "text": "Gain 4 Matter and 2 Biomass, subject to storage capacity.",
        "lore": "It weaves continents from the dust between suns."
    },
    "worldweaverSpore": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Worldweaver Spore",
        "affinity": "Settlement",
        "order": "special",
        "tag": "alienWorldweaver",
        "resource": {
            "biomass": 3,
            "data": 1
        },
        "text": "Make up to two of your unoccupied planets Rich, chosen automatically. Gain one of each changed planet's resource.",
        "lore": "The garden outlived its gods."
    },
    "cradleOfLostSuns": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Cradle of Lost Suns",
        "affinity": "Settlement",
        "order": "special",
        "tag": "alienCradle",
        "resource": {
            "biomass": 2,
            "energy": 2
        },
        "text": "Permanently add 5 storage, gain 2 Biomass, and draw one card.",
        "lore": "A pocket universe, still warm from its creation."
    },
    "obeliskOfAnnihilation": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Obelisk of Annihilation",
        "affinity": "Military",
        "order": "move",
        "tag": "alienAssault",
        "resource": {
            "matter": 2,
            "energy": 2
        },
        "text": "Move one group with +2 range. A battle you initiate gains +2 hits in its first volley.",
        "lore": "Its shadow arrives before its light."
    },
    "aegisOfSilentArchitects": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Aegis of the Silent Architects",
        "affinity": "Military",
        "reaction": "prevent",
        "strength": 4,
        "resource": {
            "matter": 3
        },
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
        "resource": {
            "energy": 2,
            "data": 1
        },
        "text": "Automatic reaction: add 3 hits to your next combat volley.",
        "lore": "The weapon is the song. Your fleet is its instrument."
    },
    "naniteOssuary": {
        "kind": "Alien Relic",
        "accent": "var(--gold)",
        "name": "Nanite Ossuary",
        "affinity": "Military",
        "reaction": "salvage",
        "salvageCap": 6,
        "bonusData": 2,
        "resource": {
            "matter": 2,
            "data": 2
        },
        "text": "After a battle with destroyed pieces, gain 1 Matter per destroyed piece, up to 6, plus 2 Data. Storage limits apply.",
        "lore": "The bones of alien war machines learn to live again."
    }
};

  const ALL_CARDS = { ...BASIC_CARDS, ...ADVANCED_CARDS, ...RELIC_CARDS };


  let cardSerial = 1;
  let state;
  let aiTimer = null;
  let turnHistory = { pending: null, undo: null };
  // Whose command panels (resources, hand) are shown. Live play is always seat 0.
  let viewSeat = 0;

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const coordKey = (q, r) => `${q},${r}`;
  const parseCoord = (key) => key.split(',').map(Number);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function makeCard(key, starter = false) {
    return { key, id: `${key}-${cardSerial++}`, starter, upgraded: false };
  }

  function shuffled(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function createMilitaryDeck() {
    return shuffled(MILITARY_DECK_LIST);
  }

  function randomInnerCenters(homeCenters) {
    const candidates = [];
    const innerRadius = BOARD_RADIUS - 3;
    for (let q = -innerRadius; q <= innerRadius; q += 1) {
      for (let r = -innerRadius; r <= innerRadius; r += 1) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q+r)) <= innerRadius) candidates.push([q,r]);
      }
    }
    const apart = (a,b) => hexDistance(coordKey(...a), coordKey(...b)) >= 4;
    // Leave at least one empty hex between worlds. Bound the rejection loop.
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const selected = [];
      for (const candidate of shuffled(candidates)) {
        if ([...homeCenters, ...selected].every(center => apart(center,candidate))) selected.push(candidate);
        if (selected.length === 8) return selected;
      }
    }
    // This pre-spaced lattice always has enough room, even with an adversarial RNG.
    // Shuffle its eligible sites so the fallback is still a fresh layout.
    return shuffled(candidates.filter(([q,r]) => q % 4 === 0 && r % 4 === 0)
      .filter(candidate => homeCenters.every(center => apart(center,candidate)))).slice(0,8);
  }

  function generateGalaxy() {
    // Seven-hex home worlds touch the rim; the starting shipyards face inward.
    const edge = BOARD_RADIUS - 1;
    const homeCenters = [[-edge,0],[0,-edge],[edge,0],[0,edge]];
    const centers = [...homeCenters, ...randomInnerCenters(homeCenters)];
    const names = ['Asterion','Borealis','Cygnus','Draco','Erebus','Fornax','Gemini','Helios','Icarus','Juno','Kepler','Lyra'];
    const homes = new Map(HOME_CLUSTER_OWNERS);
    const specials = new Map([[5,'rich'],[7,'rich'],[10,'rich']]);
    const relicSectors = new Map(RELIC_SECTORS);
    const resourceCycle = ['matter','energy','biomass','data'];
    const numerals = ['I','II','III','IV','V','VI','VII'];
    const planets = {};
    const clusters = [];
    centers.forEach(([q,r], clusterIndex) => {
      const coords = [[q,r], ...DIRECTIONS.map(([dq,dr]) => [q+dq,r+dr])];
      const homeOwner = homes.has(clusterIndex) ? homes.get(clusterIndex) : null;
      const homeStart = HOME_STARTS.find(start => start.cluster === clusterIndex);
      const types = homeOwner !== null
        ? ['matter','energy','biomass','data','matter','energy','data']
        : shuffled(Array.from({ length: 7 }, (_, index) => resourceCycle[(clusterIndex * 2 + index) % 4]));
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
          type, special: relicSectors.get(clusterIndex) === planetIndex ? 'relic' : planetIndex === 0 ? specials.get(clusterIndex) || null : null,
          owner, originalFounder: isHomeColony ? owner : null, hasColony: isHomeColony,
          upgrade: null, upgradeLevel: 0, rich: specials.get(clusterIndex) === 'rich' && planetIndex === 0,
          relicClaimed: false, occupiedBy: null, conquest: owner !== null ? false : null
        };
      });
    });
    // Single-hex moons must be at least two steps from every occupied terrain hex.
    const candidates = [];
    for (let q=-BOARD_RADIUS;q<=BOARD_RADIUS;q++) for (let r=-BOARD_RADIUS;r<=BOARD_RADIUS;r++) {
      const key=coordKey(q,r);
      if (boardHas(key) && !planets[key] && DIRECTIONS.every(([dq,dr])=>!planets[coordKey(q+dq,r+dr)])) candidates.push(key);
    }
    const moons=[];
    for (const key of shuffled(candidates)) {
      if (moons.every(coord=>hexDistance(key,coord)>=2)) moons.push(key);
      if (moons.length===4) break;
    }
    if (moons.length!==4) throw new Error('Galaxy has no room for four separated moons.');
    moons.forEach((key,index)=>{
      const id=clusters.length, [q,r]=parseCoord(key), name=`Moon ${index+1}`;
      clusters.push({id,kind:'moon',name,center:key,coords:[key],scannedBy:[],revealedBy:[]});
      planets[key]={q,r,cluster:id,name,type:'moon',special:'relic',owner:null,originalFounder:null,
        hasColony:false,upgrade:null,upgradeLevel:0,rich:false,relicClaimed:false,occupiedBy:null,conquest:null};
    });
    return { planets, clusters, homes };
  }

  function createPlayer(index) {
    const deck = [];
    for (let i = 0; i < 3; i += 1) deck.push(makeCard('move',true), makeCard('construct',true));
    return {
      id: index, name: PLAYER_NAMES[index], color: PLAYER_COLORS[index], strategy: PLAYER_STRATEGIES[index],
      resources: { matter: 0, energy: 0, biomass: 2, data: 0 }, deck: shuffled(deck), discard: [], hand: [],
      militaryDeck: createMilitaryDeck(), militaryDiscard: [],
      storageUpgrades: 0, cardsPurchased: 0, relicsExcavated: 0, passed: false, tradeUsed: false, bought: 0, buyLimit: 1,
      buyDiscountData: 0, marketManipulated: false, buyStartDiscardIds: [], combatBonus: 0,
      tradesWith: [0,0,0,0]
    };
  }

  function newState() {
    cardSerial = 1;
    const galaxy = generateGalaxy();
    const players = [0,1,2,3].map(createPlayer);
    const fleets = {};
    const advancedDeck = shuffled(Object.keys(ADVANCED_CARDS).flatMap(key => [makeCard(key), makeCard(key)]));
    const relicDeck = shuffled(Object.keys(RELIC_CARDS).map(key=>makeCard(key)));
    const relicRow = [relicDeck.pop(),relicDeck.pop(),relicDeck.pop()];
    return {
      version: SAVE_FORMAT_VERSION, round: 1, phase: 'production', firstPlayer: 0, activePlayer: 0, players,
      planets: galaxy.planets, clusters: galaxy.clusters, fleets, advancedDeck, market: [], marketDiscard: [],
      selected: null, actionMode: null, actionCardId: null, actionOptions: {}, moveSource: null, reachable: [],
      turnStage: 'waiting', log: [], winner: null,
      lastCombat: null, relicDeck, relicRow,
      tradeOffers: [], nextTradeOfferId: 1, pendingColonyBuild: null, pendingConsortium: null,
      visibilityRevision: 2, rulesRevision: RULES_REVISION
    };
  }

  function saveGame() {
    if (headless) return;
    try { storage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
    options.onSave?.({state, turnHistory});
  }

  function saveTurnHistory() {
    if (headless) return;
    try { storage.setItem(TURN_HISTORY_KEY, JSON.stringify(turnHistory)); } catch (_) {}
    options.onSave?.({state, turnHistory});
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
    turnHistory.pending = { state: clone(state), cardSerial, label };
    saveTurnHistory();
  }

  function completeHumanTurn() {
    if (!turnHistory.pending) return;
    turnHistory.undo = turnHistory.pending;
    turnHistory.pending = null;
    saveTurnHistory();
  }

  function undoLastTurn() {
    if (!turnHistory.undo) return;
    const snapshot = turnHistory.undo;
    clearTimeout(aiTimer);
    state = clone(snapshot.state);
    cardSerial = snapshot.cardSerial;
    turnHistory.undo = null;
    turnHistory.pending = { state: clone(state), cardSerial, label: snapshot.label };
    saveTurnHistory();
    const messageDialog = $('#message-dialog');
    if (messageDialog.open) messageDialog.close();
    $('#trade-response').textContent = '';
    saveGame();
    render();
    toast(`${snapshot.label} restored.`);
  }

  function loadGame() {
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_FORMAT_VERSION || parsed.rulesRevision !== RULES_REVISION) return false;
      state = parsed;
      cardSerial = Math.max(1, ...state.players.flatMap(p => [...p.deck, ...p.discard, ...p.hand].map(c => Number(String(c.id).split('-').pop()) || 0)), ...state.market.map(c => Number(String(c.id).split('-').pop()) || 0)) + 1;
      if (!state.visibilityRevision) {
        const everyone = [0,1,2,3];
        HOME_CLUSTER_OWNERS.forEach(([clusterIndex]) => {
          state.clusters[clusterIndex].scannedBy = [...everyone];
          state.clusters[clusterIndex].revealedBy = [...everyone];
        });
        state.clusters.forEach(cluster => {
          if (cluster.revealedBy?.length) cluster.revealedBy = [...everyone];
        });
        state.visibilityRevision = 2;
        clearTurnHistory();
        saveGame();
      }
      return true;
    } catch (_) { return false; }
  }

  function logEvent(text) {
    state.log.unshift(`R${state.round} · ${text}`);
    state.log = state.log.slice(0, 80);
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
    return fleet ? (fleet.settler || 0) + (fleet.fleet || 0) * 2 : 0;
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

  function ownerProductionAmount(planet) {
    return planet.type==='moon' ? 0 : 1 + (planet.rich ? 1 : 0) + (planet.upgrade === 'harvester' ? (planet.upgradeLevel || 1) : 0);
  }

  function fleetGroup(fleet, group = 'all') {
    if (!fleet) return null;
    if (group === 'explorer') return { settler: 0, explorer: fleet.explorer || 0, fleet: 0 };
    if (group === 'ships') return { settler: fleet.settler || 0, explorer: 0, fleet: fleet.fleet || 0 };
    return clone(fleet);
  }

  function formatFleet(fleet) {
    if (!fleet || !fleetCount(fleet)) return 'No ships';
    const parts = [];
    if (fleet.settler) parts.push(`${fleet.settler} Settler${fleet.settler === 1 ? '' : 's'}`);
    if (fleet.explorer) parts.push(`${fleet.explorer} Explorer${fleet.explorer === 1 ? '' : 's'}`);
    if (fleet.fleet) parts.push(`${fleet.fleet} Fleet${fleet.fleet === 1 ? '' : 's'}`);
    return parts.join(', ');
  }

  function playerCapacity(playerId) {
    return 10 + (state.players[playerId].storageUpgrades || 0) * STORAGE_UPGRADE.capacity;
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

  function resourceText(text) {
    return String(text).replace(/\b(Matter|Energy|Biomass|Data)\b/g, match => {
      const resource = match.toLowerCase();
      return `<span class="inline-resource" role="img" aria-label="${match}" title="${match}">${resourceDot(resource)}</span>`;
    });
  }

  function addResources(player, gain) {
    const result = { added: {}, lost: {}, totalAdded: 0, totalLost: 0 };
    RESOURCES.forEach(resource => {
      const amount = Math.max(0, Number(gain?.[resource]) || 0);
      if (amount) {
        player.resources[resource] += amount;
        result.added[resource] = amount;
        result.totalAdded += amount;
      }
    });
    if (!headless && player.id > 0) trimResourcesToCapacity(player.id);
    return result;
  }

  function overflowPlayer() {
    return state.players.findIndex((player, id) => totalResources(player) > playerCapacity(id));
  }

  function discardOverflow(playerId, amounts) {
    if (overflowPlayer() !== playerId || !amounts || typeof amounts !== 'object' || Array.isArray(amounts)) return false;
    if (Object.keys(amounts).some(resource => !RESOURCES.includes(resource))) return false;
    const player = state.players[playerId];
    const excess = totalResources(player) - playerCapacity(playerId);
    const values = RESOURCES.map(resource => amounts[resource] ?? 0);
    if (values.some((amount, index) => !Number.isInteger(amount) || amount < 0 || amount > player.resources[RESOURCES[index]])) return false;
    const total = values.reduce((sum, amount) => sum + amount, 0);
    if (total < 1 || total > excess) return false;
    RESOURCES.forEach((resource, index) => { player.resources[resource] -= values[index]; });
    logEvent(`${player.name} chose to discard ${total} excess resource${total === 1 ? '' : 's'}.`);
    render();
    saveGame();
    if (!headless && overflowPlayer() < 0) {
      resumePendingChoice();
      if (state.activePlayer !== 0 && state.phase === 'operations') scheduleAiTurn('operations', runAiOperation, 650);
      if (state.activePlayer !== 0 && state.phase === 'buy') scheduleAiTurn('buy', runAiBuy, 650);
    }
    return true;
  }

  function resourceGainTotal(gain) {
    return RESOURCES.reduce((sum,resource) => sum + Math.max(0,Number(gain?.[resource]) || 0),0);
  }

  function remainingResourceCapacity(playerId) {
    return Math.max(0,playerCapacity(playerId) - totalResources(state.players[playerId]));
  }

  function trimResourcesToCapacity(playerId) {
    const player = state.players[playerId];
    let excess = Math.max(0,totalResources(player) - playerCapacity(playerId));
    const removed = excess;
    [...RESOURCES].sort((a,b)=>player.resources[b]-player.resources[a]).forEach(resource=>{
      const amount = Math.min(excess,player.resources[resource]);
      player.resources[resource] -= amount;
      excess -= amount;
    });
    return removed;
  }

  function overflowNote(result) {
    return result.totalLost ? ` ${result.totalLost} overflow resource${result.totalLost === 1 ? '' : 's'} were lost.` : '';
  }

  function movementRange(fleet, cardOrOptions = {}) {
    const tag = cardOrOptions.tag || ALL_CARDS[cardOrOptions.key]?.tag;
    return fleetMove(fleet) + (cardOrOptions.upgraded ? 1 : 0) + (tag === 'alienPhase' ? 3 : tag === 'alienAssault' || tag === 'overdrive' ? 2 : tag === 'pathfinder' ? 1 : 0);
  }

  function upgradedOrderText(card) {
    return {move:'+1 movement on this order.',construct:'Reduce one chosen resource in the construction cost by 1.',colonize:'After colonizing, optionally pay for one adjacent building.'}[card.key] || '';
  }

  function discountedCost(cost, resource = null) {
    const result={...cost};
    if (RESOURCES.includes(resource) && result[resource]) result[resource]=Math.max(0,result[resource]-1);
    return result;
  }

  function constructionCost(playerId, coord, kind, resource = null, fullCost = false) {
    const planet=state.planets[coord];
    const improving=planet?.owner===playerId && planet?.upgrade===kind;
    const base=SHIP_STATS[kind]?.cost || (improving?STRUCTURES[kind]?.upgradeCost:STRUCTURES[kind]?.cost) || {};
    const cost=discountedCost(base,resource);
    return cost;
  }

  function constructAt(playerId, coord, kind, resource = null, dryRun = false, fullCost = false) {
    if (resource!==null && !RESOURCES.includes(resource)) return false;
    if (STRUCTURES[kind]) return buildUpgrade(playerId,coord,kind,0,dryRun,resource,fullCost);
    if (SHIP_STATS[kind]) return buildShip(playerId,coord,kind,0,dryRun,resource);
    return false;
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
    if (!card || !state.players[playerId].hand.some(c=>c.id===card.id)) return false;
    if (!colonizePlanet(playerId,coord,{tag:ALL_CARDS[card.key].tag})) return false;
    removeHandCard(state.players[playerId],card.id);
    if (!card.upgraded) { completeAction(playerId,`${state.players[playerId].name} completed a colonization operation.`); return true; }
    clearAction();
    state.pendingColonyBuild={playerId,colony:coord};
    state.turnStage='bonus-build'; state.actionMode='colony-build';
    state.reachable=adjacentKeys(coord).filter(key=>canBuildStructureAt(playerId,key));
    logEvent(`${state.players[playerId].name} may build once beside its new Colony at full cost.`);
    render(); saveGame();
    if (!headless && playerId!==0) aiColonyBuild(playerId);
    return true;
  }

  function cardResources(card) {
    const gain = { ...(ALL_CARDS[card.key]?.resource || {}) };
    if (card.upgraded) {
      const resource = RESOURCES.find(type => gain[type]) || 'data';
      gain[resource] = (gain[resource] || 0) + 1;
    }
    return gain;
  }

  function clusterForCoord(key) {
    const planet = state.planets[key];
    return planet ? state.clusters[planet.cluster] : null;
  }

  function isColonySite(coord) {
    const planet = state.planets[coord];
    return Boolean(planet && planet.type!=='moon' && state.clusters[planet.cluster]?.center === coord);
  }

  function clusterKnown(cluster, playerId = 0) {
    return Boolean(cluster?.revealedBy?.includes(playerId));
  }

  function clusterScanned(cluster, playerId = 0) {
    return Boolean(cluster?.scannedBy?.includes(playerId));
  }

  function revealClusterAt(key, playerId) {
    const cluster = clusterForCoord(key);
    if (!cluster) return;
    if (!cluster.scannedBy.includes(playerId)) cluster.scannedBy.push(playerId);
    if (!cluster.revealedBy.includes(playerId)) {
      cluster.revealedBy = [0,1,2,3];
      logEvent(`${state.players[playerId].name} explored ${cluster.kind==='moon'?'the moon':'the seven sectors of'} ${cluster.name}.`);
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
    if (planet && planet.owner !== null && planet.owner !== player && planet.occupiedBy !== player) return true;
    const fleets = state.fleets[coord] || {};
    return Object.entries(fleets).some(([owner, fleet]) => Number(owner) !== player && fleetCount(fleet));
  }

  function reachableFrom(source, player, range, cannotAttack = false, movingFleet = null) {
    const distances = new Map([[source,0]]);
    const queue = [source];
    while (queue.length) {
      const current = queue.shift();
      const distance = distances.get(current);
      if (distance >= range) continue;
      for (const next of movementNeighbors(current)) {
        if (distances.has(next)) continue;
        const destinationFleet = getFleet(next, player);
        if (destinationFleet && fleetCount(destinationFleet) + fleetCount(movingFleet || getFleet(source, player)) > 5) continue;
        if (cannotAttack && hostileAt(next, player)) continue;
        distances.set(next, distance + 1);
        if (!hostileAt(next, player)) queue.push(next);
      }
    }
    distances.delete(source);
    return [...distances.keys()];
  }

  function drawCards(player, amount) {
    for (let i = 0; i < amount; i += 1) {
      if (!player.deck.length && player.discard.length) {
        player.deck = shuffled(player.discard);
        player.discard = [];
      }
      if (!player.deck.length) break;
      player.hand.push(player.deck.pop());
    }
  }

  function removeHandCard(player, cardId, destination = 'discard') {
    const index = player.hand.findIndex(c => c.id === cardId);
    if (index < 0) return null;
    const [card] = player.hand.splice(index, 1);
    if (destination === 'discard') player.discard.push(card);
    return card;
  }

  function fillMarket() {
    while (state.market.length < 5) {
      if (!state.advancedDeck.length && state.marketDiscard.length) {
        state.advancedDeck = shuffled(state.marketDiscard);
        state.marketDiscard = [];
      }
      if (!state.advancedDeck.length) break;
      state.market.push(state.advancedDeck.pop());
    }
  }

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

  function canBuildStructureAt(playerId, coord) {
    const planet = state.planets[coord];
    if (!planet || planet.type==='moon' || planet.occupiedBy !== null) return false;
    return (planet.owner === playerId && !hasBuilding(planet)) || canClaimStructureHex(playerId,coord);
  }



  function strongestFleet(playerId) {
    let best = 0;
    Object.values(state.fleets).forEach(group => { best = Math.max(best, fleetPower(group[playerId])); });
    return best;
  }

  function calculatePrestige(playerId) {
    const colonies = colonyPlanets(playerId).length;
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase').length;
    const relics = state.players[playerId].relicsExcavated || 0;
        const frontierPrestige = Math.floor(Math.max(0,colonies - 1) / 2);
    return colonies + frontierPrestige + Math.floor(starbases / 2) + relics + deckPrestige(playerId);
  }

  function deckPrestige(playerId) {
    return Math.floor((state.players[playerId].cardsPurchased || 0) / CARDS_PER_PRESTIGE);
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
    if (!planet || planet.owner !== playerId || planet.occupiedBy !== null) return false;
    return planet.upgrade === 'starbase';
  }





  function produceAll() {
    const gains = state.players.map(()=>({ matter: 0, energy: 0, biomass: 0, data: 0 }));
    state.players.forEach((player, playerId) => {
      controlledPlanets(playerId).forEach(([,planet]) => {
        if (planet.occupiedBy !== null || !RESOURCES.includes(planet.type)) return;
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
      player.buyLimit = 1;
      player.buyDiscountData = 0;
      player.marketManipulated = false;
      player.buyStartDiscardIds = [];
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
    state.phase = 'draw';
    state.players.forEach(player => drawCards(player, 5));
    logEvent('All factions drew five cards.');
    state.phase = 'operations';
    state.activePlayer = state.firstPlayer;
    startOperationsTurn();
  }

  function startOperationsTurn() {
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
    state.turnStage = state.activePlayer === 0 ? 'prep' : 'ai';
    if (state.activePlayer === 0) {
      captureHumanTurn(`Operations turn in Round ${state.round}`);
      if (!headless) switchTab('hand');
    }
    render();
    saveGame();
    if (state.activePlayer !== 0) scheduleAiTurn('operations', runAiOperation, 650);
  }

  function scheduleAiTurn(phase, action, delay) {
    if (headless) return;
    clearTimeout(aiTimer);
    if (overflowPlayer() >= 0) return;
    const expectedPlayer = state.activePlayer;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (overflowPlayer() >= 0 || options.paused?.() || state.phase !== phase || state.activePlayer !== expectedPlayer || state.winner !== null) return;
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
    state.activePlayer = (state.activePlayer + 1) % 4;
    startOperationsTurn();
  }

  function passOperations(playerId) {
    if (state.phase !== 'operations' || state.activePlayer !== playerId || state.pendingColonyBuild || state.pendingConsortium) return false;
    const player = state.players[playerId];
    if (!player || player.passed) return false;
    if (playerId === 0) completeHumanTurn();
    player.passed = true;
    logEvent(`${player.name} passed for the rest of Operations.`);
    if (playerId === 0) toast('You passed. Take your Buy turn now.');
    if (state.players.every(p => p.passed)) expireTrades();
    startBuyPhase();
    return true;
  }

  function clearAction() {
    state.actionMode = null;
    state.actionCardId = null;
    state.actionOptions = {};
    state.moveSource = null;
    state.moveChoiceSource = null;
    state.reachable = [];
  }

  function completeAction(playerId, message) {
    state.pendingColonyBuild = null;
    if (playerId === 0) completeHumanTurn();
    if (message) logEvent(message);
    clearAction();
    if (playerId === 0) state.turnStage = 'waiting';
    saveGame();
    nextOperationsPlayer();
  }

  function conversionGain(card) {
    const gain = cardResources(card);
    const wildcard = ALL_CARDS[card.key].wildcard || 0;
    if (wildcard) gain.data = (gain.data || 0) + wildcard;
    return gain;
  }

  function canConvertCards() {
    return !replayMode && overflowPlayer() < 0 && state.phase === 'operations' && state.activePlayer === 0 && ['prep','action','bonus-build'].includes(state.turnStage);
  }

  function convertAllResources() {
    if (!canConvertCards()) return;
    const player = state.players[0];
    let converted = 0;
    for (const card of [...player.hand]) {
      if (playResourceMode(card.id, false)) converted++;
      if (overflowPlayer() >= 0) break;
    }
    toast(`Converted ${converted} card${converted === 1 ? '' : 's'}.`);
    render();
    saveGame();
  }

  function playResourceMode(cardId, refresh = true) {
    const player = state.players[0];
    if (!canConvertCards()) return false;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    const definition = ALL_CARDS[card.key];
    const gain = conversionGain(card);
    const canceledSelectedOrder = state.actionCardId === cardId;
    if (canceledSelectedOrder) clearAction();
    addResources(player, gain);
    removeHandCard(player, cardId);
    logEvent(`You converted ${definition.name} into resources.${canceledSelectedOrder ? ' Its selected order was canceled.' : ''}`);
    if (refresh) {
      if (canceledSelectedOrder) toast('Order canceled and card converted to resources.');
      render();
      saveGame();
    }
    return true;
  }

  function playOrder(cardId) {
    const player = state.players[0];
    if (state.phase !== 'operations' || state.activePlayer !== 0 || !['prep','action'].includes(state.turnStage)) return;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    if (state.actionCardId === cardId && state.actionMode) {
      clearAction();
      toast('Order canceled. Choose another order, trade, or pass.');
      render();
      saveGame();
      return;
    }
    const definition = ALL_CARDS[card.key];
    if (definition.reaction || definition.buyEffect) { toast('That card waits for its printed timing.'); return; }
    state.turnStage = 'action';

    if (definition.order === 'special') {
      resolveHumanSpecial(card, definition);
      return;
    }
    state.actionMode = definition.order;
    state.actionCardId = cardId;
    state.actionOptions = { tag: definition.tag || null, cardName: definition.name, upgraded: !!card.upgraded, discountResource: card.upgraded && definition.order==='construct'?'matter':null };
    state.moveSource = null;
    state.reachable = [];
    toast(definition.order === 'move' ? 'Select one of your fleets or Explorer teams.' : definition.order === 'construct' ? 'Select an empty planet hex adjacent to your Colony, an existing structure, or a Shipyard.' : definition.order === 'excavate' ? 'Select a relic with your Explorer, then choose a card from the relic row.' : 'Select an eligible planet containing your Settler.');
    render();
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
    return state.clusters.filter(cluster=>revealWorld?cluster.kind!=='moon'&&!clusterKnown(cluster,playerId):relicCoordInCluster(cluster)&&!clusterScanned(cluster,playerId)).sort((a,b)=>{
      const da=Math.min(...origins.map(origin=>hexDistance(origin,relicCoordInCluster(a)||a.center)));
      const db=Math.min(...origins.map(origin=>hexDistance(origin,relicCoordInCluster(b)||b.center)));
      return da-db||a.id-b.id;
    })[0]||null;
  }

  function resolveAlienSpecial(playerId, card, definition) {
    const player = state.players[playerId];
    if (definition.tag === 'alienSurvey') {
      for (let i=0;i<2;i++) {
        const world=nearestUnscannedRelicCluster(playerId,true);
        if (world) revealClusterAt(world.center,playerId);
      }
    } else if (definition.tag === 'alienEchoes') drawCards(player,3);
    else if (definition.tag === 'alienSignals') {
      state.clusters.forEach(world=>{
        const coord=relicCoordInCluster(world);
        if (coord && !state.planets[coord].relicClaimed && !world.scannedBy.includes(playerId)) world.scannedBy.push(playerId);
      });
      drawCards(player,1);
    } else if (definition.tag === 'alienLoom') addResources(player,{matter:4,biomass:2});
    else if (definition.tag === 'alienWorldweaver') {
      const planets=controlledPlanets(playerId).filter(([,planet])=>planet.occupiedBy===null&&!planet.rich).slice(0,2);
      const gains={};
      planets.forEach(([,planet])=>{planet.rich=true;gains[planet.type]=(gains[planet.type]||0)+1;});
      addResources(player,gains);
    } else if (definition.tag === 'alienCradle') {
      player.storageUpgrades+=1;addResources(player,{biomass:2});drawCards(player,1);
    } else return false;
    removeHandCard(player,card.id);
    completeAction(playerId,`${player.name} awakened ${definition.name}.`);
    return true;
  }

  function resolveHumanSpecial(card, definition, playerId = 0) {
    const player = state.players[playerId];
    if (definition.kind === 'Alien Relic' && resolveAlienSpecial(playerId,card,definition)) return true;
    if (definition.tag === 'surge') {
      const byCluster = new Map();
      controlledPlanets(playerId).forEach(([key,planet]) => {
        if (planet.occupiedBy !== null) return;
        if (!byCluster.has(planet.cluster)) byCluster.set(planet.cluster, []);
        byCluster.get(planet.cluster).push(planet);
      });
      const best = [...byCluster.values()].sort((a,b) => b.length - a.length)[0] || [];
      const gain = {};
      best.slice(0,3).forEach(planet => { gain[planet.type] = (gain[planet.type] || 0) + (planet.rich ? 2 : 1); });
      const result = addResources(player,gain);
      removeHandCard(player, card.id);
      completeAction(playerId, `You used Industrial Surge on ${Math.min(3,best.length)} planets.${overflowNote(result)}`);
    } else if (definition.tag === 'foresight') {
      drawCards(player, 3);
      if (player.hand.length) player.discard.push(player.hand.shift());
      removeHandCard(player, card.id);
      completeAction(playerId, 'You used Tactical Foresight to reshape your hand.');
    } else if (definition.tag === 'brokerage') {
      const trashTarget = player.discard.find(c => BASIC_CARDS[c.key]);
      if (trashTarget) player.discard.splice(player.discard.indexOf(trashTarget),1);
      drawCards(player,2);
      removeHandCard(player, card.id);
      completeAction(playerId, `You used Data Brokerage${trashTarget ? ` and removed ${ALL_CARDS[trashTarget.key].name}` : ''}.`);
    } else if (definition.tag === 'uplink') {
      const basic = player.discard.find(c => BASIC_CARDS[c.key]);
      if (basic) {
        player.discard.splice(player.discard.indexOf(basic),1);
        player.hand.push(basic);
      }
      removeHandCard(player, card.id);
      completeAction(playerId, `You activated Command Uplink${basic ? ` and recovered ${ALL_CARDS[basic.key].name}` : ''}.`);
    } else if (definition.tag === 'terraform') {
      state.actionMode = 'terraform';
      state.actionCardId = card.id;
      toast('Select a controlled planet and pay', { biomass: 2 }, 'to make it Rich.');
      render();
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
      && pending?.playerId === playerId && state.players[playerId].hand.some(c=>c.id===pending.cardId && c.key==='tradeConsortium') ? pending : null;
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
    const cardId = pending.cardId;
    state.pendingConsortium = null;
    if (!headless && $('#consortium-dialog').open) $('#consortium-dialog').close();
    if (cancel) { state.turnStage = playerId === 0 ? 'prep' : 'ai'; render(); saveGame(); }
    else { removeHandCard(state.players[playerId],cardId); completeAction(playerId,`${state.players[playerId].name} finished Trade Consortium.`); }
    return true;
  }

  function consortiumGain(playerId, resource) {
    if (!canConsortiumGain(playerId,resource)) return false;
    addResources(state.players[playerId],{[resource]:1});
    logEvent(`${state.players[playerId].name} used Trade Consortium to gain 1 ${RESOURCE_NAMES[resource]}.`);
    // Mark the order resolved before the shared finish consumes its card once.
    state.pendingConsortium.trades = 1;
    return finishConsortium(playerId);
  }

  function consortiumExchange(playerId, giveType, getType) {
    if (!canConsortiumExchange(playerId,giveType,getType)) return false;
    const player = state.players[playerId];
    player.resources[giveType] -= 2; player.resources[getType] += 1;
    state.pendingConsortium.trades++;
    logEvent(`${player.name} used Trade Consortium: 2 ${RESOURCE_NAMES[giveType]} → 1 ${RESOURCE_NAMES[getType]}.`);
    if (state.pendingConsortium.trades === 2) finishConsortium(playerId);
    else { render(); saveGame(); renderConsortium(); }
    return true;
  }

  function renderConsortium() {
    if (headless || replayMode || !consortiumPending(0)) return;
    const pending = state.pendingConsortium;
    $('#consortium-status').textContent = pending.trades ? 'One exchange complete. Choose a second exchange, or finish your order.' : 'Choose one resource to gain, OR make up to two exchanges. Nothing changes until you choose.';
    $('#consortium-gains').innerHTML = RESOURCES.map(resource=>`<button type="button" class="button" data-consortium-gain="${resource}" ${canConsortiumGain(0,resource)?'':'disabled'}>Gain ${resourceDots({[resource]:1})}</button>`).join('');
    $$('[data-consortium-gain]').forEach(button=>button.addEventListener('click',()=>consortiumGain(0,button.dataset.consortiumGain)));
    const give = $('#consortium-give').value, get = $('#consortium-get').value;
    $('#consortium-exchange-preview').innerHTML = `${resourceDots({[give]:2})} → ${resourceDots({[get]:1})}`;
    $('#consortium-exchange-button').disabled = !canConsortiumExchange(0,give,get);
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

  function humanSelectHex(key) {
    state.selected = key;
    if (state.phase === 'operations' && state.activePlayer === 0 && state.turnStage === 'action' && state.actionMode) {
      if (state.actionMode === 'move') handleHumanMoveSelection(key);
    }
    render();
    saveGame();
  }

  function handleHumanMoveSelection(key) {
    if (!state.moveSource) {
      const fleet = getFleet(key,0);
      if (!fleetCount(fleet)) { toast('Select a hex containing one of your fleets.'); return; }
      if ((fleet.explorer || 0) > 0 && combatShipCount(fleet) > 0) {
        state.moveChoiceSource = key;
        toast('Choose whether this Move sends the ships or the Explorer team.');
        return;
      }
      prepareHumanMove(key,(fleet.explorer || 0) > 0 ? 'explorer' : 'ships');
      return;
    }
    if (!state.reachable.includes(key)) { toast('That destination is outside this fleet’s range.'); return; }
    executeMove(0,state.moveSource,key,state.actionOptions);
    discardActionCard(0);
    completeAction(0, `You moved a fleet from ${nameForCoord(state.moveSource)} to ${nameForCoord(key)}.`);
  }

  function prepareHumanMove(key, group) {
    const moving = fleetGroup(getFleet(key,0),group);
    if (!fleetCount(moving)) return;
    state.moveChoiceSource = null;
    state.moveSource = key;
    state.actionOptions.moveGroup = group;
    const range = movementRange(moving,state.actionOptions);
    state.reachable = reachableFrom(key,0,range,state.actionOptions.tag === 'pathfinder',moving);
    toast(`This ${group==='explorer'?'Explorer team':'fleet'} can move up to ${range} hexes. Select a highlighted destination.`);
    render();
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
    const sourceSnapshot = fleetGroup(sourceFleet,options.moveGroup || 'all');
    if (!sourceFleet || !fleetCount(sourceSnapshot)) return false;
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

  function combatPieces(playerId, coord, includeStarbase) {
    const pieces = [];
    const fleet = getFleet(coord,playerId);
    if (fleet) Object.keys(SHIP_STATS).forEach(type => {
      for (let i=0;i<fleet[type];i+=1) pieces.push({ type, hull: SHIP_STATS[type].hull, power: SHIP_STATS[type].power, damage: 0 });
    });
    if (includeStarbase) {
      const level = state.planets[coord]?.upgradeLevel || 1;
      pieces.push({ type:'starbase', hull:2+level, power:2+level, damage:0 });
    }
    return pieces;
  }

  function findDefender(coord, attacker) {
    const fleets = state.fleets[coord] || {};
    const fleetOwner = Object.keys(fleets).map(Number).find(owner => owner !== attacker && fleetCount(fleets[owner]));
    if (fleetOwner !== undefined) return fleetOwner;
    const planet = state.planets[coord];
    return planet && planet.owner !== null && planet.owner !== attacker ? planet.owner : null;
  }

  function drawMilitaryCard(playerId) {
    const player = state.players[playerId];
    if (!player.militaryDeck?.length) {
      player.militaryDeck = shuffled(player.militaryDiscard?.length ? player.militaryDiscard : MILITARY_DECK_LIST);
      player.militaryDiscard = [];
    }
    const key = player.militaryDeck.pop();
    player.militaryDiscard.push(key);
    return { key, ...MILITARY_CARDS[key] };
  }

  function aliveCombatPieces(pieces) {
    return pieces.filter(piece => piece.damage < piece.hull);
  }

  function combatPower(pieces) {
    return aliveCombatPieces(pieces).reduce((sum,piece) => sum + (piece.power || 0),0);
  }

  function tacticAttack(card, pieces) {
    let attack = card.attack || 0;
    const alive = aliveCombatPieces(pieces);
    if (card.tag === 'light' && alive.some(piece => piece.type === 'settler' || piece.type === 'fleet')) attack += 1;
    if (card.tag === 'heavy' && alive.some(piece => piece.type === 'starbase')) attack += 1;
    return attack;
  }

  function baseCombatHits(pieces) {
    const power = combatPower(pieces);
    return power > 0 ? Math.max(1,Math.ceil(power / 4)) : 0;
  }

  function useReaction(playerId, reaction) {
    const player = state.players[playerId];
    const index = player.hand.findIndex(card => ALL_CARDS[card.key].reaction === reaction);
    if (index < 0) return null;
    const [card] = player.hand.splice(index,1);
    player.discard.push(card);
    return ALL_CARDS[card.key];
  }

  function reactionStrength(playerId, reaction, fallback) {
    const definition=useReaction(playerId,reaction);
    return definition ? definition.strength || fallback : 0;
  }

  function applyCombatHits(pieces, hits) {
    const order = { explorer:-1, settler:0, fleet:1, starbase:2 };
    const destroyed = [];
    for (let i=0;i<hits;i+=1) {
      const alive = pieces.filter(piece => piece.damage < piece.hull).sort((a,b) => (a.hull-a.damage)-(b.hull-b.damage) || order[a.type]-order[b.type]);
      if (!alive.length) break;
      alive[0].damage += 1;
      if (alive[0].damage >= alive[0].hull) destroyed.push(alive[0]);
    }
    return destroyed;
  }

  function syncCombatPieces(playerId, coord, pieces) {
    const fleet = ensureFleet(coord,playerId);
    fleet.settler = pieces.filter(p => p.type === 'settler' && p.damage < p.hull).length;
    fleet.explorer = pieces.filter(p => p.type === 'explorer' && p.damage < p.hull).length;
    fleet.fleet = pieces.filter(p => p.type === 'fleet' && p.damage < p.hull).length;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    const planet = state.planets[coord];
    if (planet && planet.owner === playerId && planet.upgrade === 'starbase' && !pieces.some(p => p.type === 'starbase' && p.damage < p.hull)) planet.upgrade = null;
  }

  function findRetreat(coord, playerId, preferred = null) {
    if (preferred && adjacentKeys(coord).includes(preferred) && !hostileAt(preferred,playerId)) return preferred;
    return adjacentKeys(coord).find(key => !hostileAt(key,playerId)) || null;
  }

  function retreatFleet(coord, destination, playerId) {
    const fleet = getFleet(coord,playerId);
    if (!fleet || !destination) return false;
    const target = ensureFleet(destination,playerId);
    if (fleetCount(target) + fleetCount(fleet) > 5) return false;
    Object.keys(SHIP_STATS).forEach(type => { target[type] += fleet[type]; });
    delete state.fleets[coord][playerId];
    if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    return true;
  }

  function resolveCombat(attackerId, coord, origin, options = {}) {
    const defenderId = findDefender(coord,attackerId);
    if (defenderId === null) return;
    const planet = state.planets[coord];
    let attackerPieces = combatPieces(attackerId,coord,false);
    let defenderPieces = combatPieces(defenderId,coord,Boolean(planet && planet.owner === defenderId && planet.upgrade === 'starbase'));
    let summary = [];
    const forcedAttack = options.tag === 'overdrive';
    let attackerWithdrawal = false;
    let defenderWithdrawal = false;
    let destroyedCount = 0;
    let volley = 0;
    for (; volley < 3 && aliveCombatPieces(attackerPieces).length && aliveCombatPieces(defenderPieces).length; volley += 1) {
      const attackerTactic = drawMilitaryCard(attackerId);
      const defenderTactic = drawMilitaryCard(defenderId);
      const attackerTargeting = reactionStrength(attackerId,'targeting',1);
      const defenderTargeting = reactionStrength(defenderId,'targeting',1);
      const attackHits = baseCombatHits(attackerPieces) + tacticAttack(attackerTactic,attackerPieces) + attackerTargeting + (volley === 0 ? options.tag === 'alienAssault' ? 2 : options.tag === 'assault' ? 1 : 0 : 0);
      const defendHits = baseCombatHits(defenderPieces) + tacticAttack(defenderTactic,defenderPieces) + defenderTargeting;
      const attackPrevent = (attackerTactic.shield || 0) + (reactionStrength(attackerId,'prevent',2));
      const defendPrevent = (defenderTactic.shield || 0) + (reactionStrength(defenderId,'prevent',2));
      const hitsOnAttacker = Math.max(0,defendHits - Math.max(0,attackPrevent - (defenderTactic.pierce || 0)));
      const hitsOnDefender = Math.max(0,attackHits - Math.max(0,defendPrevent - (attackerTactic.pierce || 0)));
      const attackerDestroyed = applyCombatHits(attackerPieces,hitsOnAttacker);
      const defenderDestroyed = applyCombatHits(defenderPieces,hitsOnDefender);
      destroyedCount += attackerDestroyed.length + defenderDestroyed.length;
      summary.push(`Volley ${volley+1}: ${state.players[attackerId].name} revealed ${attackerTactic.name} (${hitsOnDefender} hit${hitsOnDefender===1?'':'s'} through); ${state.players[defenderId].name} revealed ${defenderTactic.name} (${hitsOnAttacker} hit${hitsOnAttacker===1?'':'s'} through).`);
      const aAlive = aliveCombatPieces(attackerPieces);
      const dAlive = aliveCombatPieces(defenderPieces);
      if (!aAlive.length || !dAlive.length) break;
      if (attackerTactic.retreat && !forcedAttack && combatPower(attackerPieces) > 0) { attackerWithdrawal = true; summary.push(`${state.players[attackerId].name} ordered a Tactical Withdrawal.`); break; }
      if (defenderTactic.retreat && combatPower(defenderPieces) > 0) { defenderWithdrawal = true; summary.push(`${state.players[defenderId].name} ordered a Tactical Withdrawal.`); break; }
      const aPower = combatPower(attackerPieces);
      const dPower = combatPower(defenderPieces);
      const attackerJump = !forcedAttack && aPower < dPower * .55 && useReaction(attackerId,'jump');
      if (attackerJump) { applyCombatHits(attackerPieces,1); attackerWithdrawal = true; summary.push(`${state.players[attackerId].name} made an Emergency Jump.`); break; }
      const attackerRetreats = !forcedAttack && volley > 0 && aPower < dPower * .65;
      if (attackerRetreats) { attackerWithdrawal = true; break; }
    }
    syncCombatPieces(attackerId,coord,attackerPieces);
    syncCombatPieces(defenderId,coord,defenderPieces);
    if (defenderWithdrawal) {
      const defenderRetreat = findRetreat(coord,defenderId);
      if (retreatFleet(coord,defenderRetreat,defenderId)) summary.push(`${state.players[defenderId].name} withdrew to ${nameForCoord(defenderRetreat)}.`);
    }
    const attackerFleet = getFleet(coord,attackerId);
    const defenderFleet = getFleet(coord,defenderId);
    const starbaseStill = planet && planet.owner === defenderId && planet.upgrade === 'starbase';
    let outcome;
    if (!fleetCount(attackerFleet)) {
      outcome = attackerId === 0 ? 'Your fleet was destroyed.' : `${state.players[attackerId].name}'s fleet was destroyed.`;
    } else if (!fleetCount(defenderFleet) && !starbaseStill) {
      outcome = `${state.players[attackerId].name} seized the hex.`;
      if (planet && planet.owner !== null && planet.owner !== attackerId) planet.occupiedBy = attackerId;
    } else if (attackerWithdrawal || fleetCount(defenderFleet) || starbaseStill) {
      const retreat = findRetreat(coord,attackerId,origin);
      if (retreatFleet(coord,retreat,attackerId)) outcome = `${state.players[attackerId].name} retreated to ${nameForCoord(retreat)}.`;
      else outcome = `${state.players[attackerId].name} could not retreat and was lost.`;
    } else {
      outcome = `${state.players[attackerId].name} seized the hex.`;
    }
    if (destroyedCount) {
      for (const id of [attackerId,defenderId]) {
        const salvage=useReaction(id,'salvage');
        if (salvage) addResources(state.players[id],{matter:Math.min(salvage.salvageCap||3,destroyedCount),data:salvage.bonusData||0});
      }
    }
    state.lastCombat = { attackerId, defenderId, coord, summary, outcome, system: 'military-deck' };
    logEvent(`${state.players[attackerId].name} attacked ${state.players[defenderId].name} at ${nameForCoord(coord)}. ${outcome}`);
    if (attackerId === 0 || defenderId === 0) showMessage('COMBAT REPORT', nameForCoord(coord), [...summary,outcome].join(' '));
  }

  function colonizePlanet(playerId, coord, options = {}, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || !fleet || fleet.settler < 1 || !isColonySite(coord)) return false;
    const capture = planet.owner !== null && planet.owner !== playerId && planet.occupiedBy === playerId;
    if (planet.owner !== null && !capture) return false;
    if (planet.owner === null && hasBuilding(planet)) return false;
    const cost = { biomass: options.tag === 'alienGenesis' ? 0 : capture ? 1 : options.tag === 'dropColony' ? 1 : 2 };
    if (!canAfford(player,cost)) return false;
    if (dryRun) return true;
    payCost(player,cost);
    if (!['dropColony','alienGenesis'].includes(options.tag)) fleet.settler -= 1;
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
      planet.occupiedBy = null;
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
    const limits = { settler:8, explorer:5, fleet:6 };
    return countPlacedShips(playerId,type) < limits[type];
  }

  function buildUpgrade(playerId, coord, type, discountMatter = 0, dryRun = false, discountResource = null, fullCost = false) {
    if (!STRUCTURES[type]) return false;
    const player = state.players[playerId];
    const planet = state.planets[coord];
    if (!planet || planet.type==='moon' || planet.occupiedBy !== null) return false;
    const improving = planet.owner === playerId && planet.upgrade === type && (planet.upgradeLevel || 1) < 2;
    if (!improving && !canBuildStructureAt(playerId,coord)) return false;
    const cost = discountedCost(improving ? STRUCTURES[type].upgradeCost : STRUCTURES[type].cost,discountResource);
    if (!canAfford(player,cost,0,discountMatter)) return false;
    if (dryRun) return true;
    payCost(player,cost,0,discountMatter);
    if (planet.owner === null) {
      planet.owner = playerId;
      planet.originalFounder = null;
      planet.conquest = false;
    }
    planet.hasColony = false;
    planet.upgrade = type;
    planet.upgradeLevel = improving ? 2 : 1;
    return true;
  }

  function excavate(playerId, coord, cardId, relicId, dryRun = false) {
    const player=state.players[playerId], planet=state.planets[coord];
    const card=player?.hand.find(item=>item.id===cardId && item.key==='excavate');
    const index=state.relicRow.findIndex(item=>item.id===relicId);
    if (!card || index<0 || state.phase!=='operations' || state.activePlayer!==playerId || state.winner!==null
      || state.pendingColonyBuild || state.pendingConsortium || overflowPlayer()>=0
      || !planet || planet.special!=='relic' || planet.relicClaimed || !getFleet(coord,playerId)?.explorer
      || !canAfford(player,EXCAVATION_COST)) return false;
    if (dryRun) return true;
    payCost(player,EXCAVATION_COST);
    const [relic]=state.relicRow.splice(index,1);
    player.hand.push(relic);
    if (state.relicDeck.length) state.relicRow.splice(index,0,state.relicDeck.pop());
    planet.special=null; planet.relicClaimed=true;
    player.relicsExcavated+=1;
    removeHandCard(player,cardId,'trash');
    completeAction(playerId,`${player.name} excavated a relic at ${planet.name}, chose ${ALL_CARDS[relic.key].name}, and gained 1 Prestige. Excavate was trashed.`);
    return true;
  }

  function contextExcavate(coord, relicId) {
    if (state.actionMode!=='excavate') return;
    if (!excavate(0,coord,state.actionCardId,relicId)) toast('Excavation needs your Explorer, an available relic card, and 1 Matter, 1 Energy, 2 Data.');
  }

  function buildShip(playerId, coord, type, discountEnergy = 0, dryRun = false, discountResource = null) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || planet.owner !== playerId || planet.occupiedBy !== null) return false;
    if (type === 'explorer' ? !canLaunchExplorer(playerId,coord) : planet.upgrade !== 'starbase') return false;
    if (fleetCount(fleet) >= 5 || !canPlaceShip(playerId,type) || !canAfford(player,discountedCost(SHIP_STATS[type].cost,discountResource),0,0,discountEnergy)) return false;
    if (dryRun) return true;
    payCost(player,discountedCost(SHIP_STATS[type].cost,discountResource),0,0,discountEnergy);
    ensureFleet(coord,playerId)[type] += 1;
    const bundled=type==='settler'?'colonize':type==='explorer'?'excavate':null;
    if (bundled) {const destination=type==='explorer'?'hand':'discard';player[destination].push(makeCard(bundled));logEvent(`${player.name} commissioned ${SHIP_STATS[type].name} and gained ${BASIC_CARDS[bundled].name} in ${destination}.`);}
    return true;
  }

  function contextBuild(kind, coord) {
    if (state.actionMode !== 'construct' || state.activePlayer !== 0) return;
    const discount=state.actionOptions.upgraded?state.actionOptions.discountResource:null;
    const success=constructAt(0,coord,kind,discount);
    if (!success) { toast('That build is not currently legal or affordable.'); return; }
    const label = STRUCTURES[kind]?.name || SHIP_STATS[kind].name;
    discardActionCard(0);
    completeAction(0,`You built ${label} at ${nameForCoord(coord)}.`);
  }

  function contextColonize(coord) {
    if (state.actionMode !== 'colonize' || state.activePlayer !== 0) return;
    const card=state.players[0].hand.find(c=>c.id===state.actionCardId);
    if (!applyColonizeOrder(0,coord,card)) toast('You need an eligible Settler on the world’s center hex and the required resources.');
  }

  function contextTerraform(coord) {
    const planet = state.planets[coord];
    if (!planet || planet.owner !== 0 || planet.rich || state.players[0].resources.biomass < 2) { toast('That planet cannot be terraformed.'); return; }
    state.players[0].resources.biomass -= 2;
    planet.rich = true;
    discardActionCard(0);
    completeAction(0,`You terraformed ${planet.name} into a Rich world.`);
  }

  function bankPlanForCost(player, cost) {
    const resources = {...player.resources}, plan = [];
    for (const getType of RESOURCES) {
      while (resources[getType] < (cost[getType] || 0)) {
        const giveType = [...RESOURCES].filter(type => type !== getType && resources[type] - (cost[type] || 0) >= 4)
          .sort((a,b) => (resources[b] - (cost[b] || 0)) - (resources[a] - (cost[a] || 0)))[0];
        if (!giveType) return null;
        resources[giveType] -= 4; resources[getType]++;
        plan.push({giveType,getType});
      }
    }
    return plan;
  }

  function aiUseResources(player, exceptCardId, desiredCost = {}) {
    const cards = [...player.hand].filter(card => card.id !== exceptCardId && ALL_CARDS[card.key].resource);
    while (!canAfford(player,desiredCost) && cards.length) {
      const missing = [...RESOURCES].sort((a,b) => ((desiredCost[b]||0)-player.resources[b])-((desiredCost[a]||0)-player.resources[a]))[0];
      let index = cards.findIndex(card => (ALL_CARDS[card.key].resource[missing]||0) > 0);
      if (index < 0) index = 0;
      const [card] = cards.splice(index,1);
      const result = addResources(player,cardResources(card));
      if (!result.totalAdded) break;
      removeHandCard(player,card.id);
    }
    const plan = bankPlanForCost(player,desiredCost);
    if (plan) for (const trade of plan) bankTrade(player.id,trade.giveType,trade.getType);
  }

  function findColonizeTarget(playerId) {
    return Object.keys(state.planets).find(coord => {
      const planet = state.planets[coord];
      const fleet = getFleet(coord,playerId);
      return isColonySite(coord) && fleet?.settler > 0 && ((planet.owner === null && !hasBuilding(planet)) || (planet.owner !== playerId && planet.occupiedBy === playerId));
    }) || null;
  }

  function chooseAiBuild(playerId) {
    const player = state.players[playerId];
    const openPlanets = Object.entries(state.planets).filter(([coord]) => canBuildStructureAt(playerId,coord));
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase' && p.occupiedBy === null);
    const options = [];
    const expansionNeedsSettlers = countPlacedShips(playerId,'settler') < (player.strategy === 'expansion' ? 3 : 1);
    const generalShipScores = player.strategy === 'expansion'
      ? { settler: expansionNeedsSettlers ? 11 : 6, fleet: 5 }
      : player.strategy === 'economy'
        ? { settler: expansionNeedsSettlers ? 12 : 8, fleet: 5 }
        : { settler: expansionNeedsSettlers ? 12 : 6, fleet: 7 };
    if (player.strategy === 'military') {
      for (const [coord] of starbases) {
        for (const type of ['fleet','settler']) if (canPlaceShip(playerId,type) && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:type,coord,cost:SHIP_STATS[type].cost,score:type==='fleet'?8:5});
      }
    }
    for (const [coord,planet] of openPlanets) {
      options.push({kind:'harvester',coord,cost:STRUCTURES.harvester.cost,score:(planet.type==='data'?9:7)+(player.strategy==='economy'?3:0)});
      options.push({kind:'starbase',coord,cost:STRUCTURES.starbase.cost,score:starbases.length===0?16:5+(player.strategy==='military'?4:0)});
    }

    controlledPlanets(playerId).filter(([,p])=>p.upgrade&&(p.upgradeLevel||1)<2&&p.occupiedBy===null).forEach(([coord,planet])=>{
      options.push({kind:planet.upgrade,coord,cost:STRUCTURES[planet.upgrade].upgradeCost,score:player.strategy==='economy'?9:6});
    });
    controlledPlanets(playerId).filter(([coord])=>canLaunchExplorer(playerId,coord)).forEach(([coord])=>{
      if (canPlaceShip(playerId,'explorer') && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:'explorer',coord,cost:SHIP_STATS.explorer.cost,score:excavatedRelicCount(playerId)<3?11:3});
    });
    for (const [coord] of starbases) {
      for (const type of ['settler','fleet']) if (canPlaceShip(playerId,type) && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:type,coord,cost:SHIP_STATS[type].cost,score:generalShipScores[type]});
    }
    return options.sort((a,b)=>b.score-a.score)[0] || null;
  }

  function nearestGoal(source, playerId, military) {
    const queue = [source];
    const came = new Map([[source,null]]);
    let goal = null;
    while (queue.length && !goal) {
      const current = queue.shift();
      const planet = state.planets[current];
      if (current !== source && planet && (military ? planet.owner !== null && planet.owner !== playerId : isColonySite(current) && planet.owner === null && !hasBuilding(planet))) { goal = current; break; }
      for (const next of movementNeighbors(current)) if (!came.has(next)) { came.set(next,current); queue.push(next); }
    }
    if (!goal) return null;
    const path = [goal];
    while (came.get(path[0]) && came.get(path[0]) !== source) path.unshift(came.get(path[0]));
    return path;
  }

  function pathToCoord(source, goal) {
    const queue = [source];
    const came = new Map([[source,null]]);
    while (queue.length && !came.has(goal)) {
      const current = queue.shift();
      for (const next of movementNeighbors(current)) if (!came.has(next)) { came.set(next,current); queue.push(next); }
    }
    if (!came.has(goal)) return null;
    const path = [goal];
    while (came.get(path[0]) && came.get(path[0]) !== source) path.unshift(came.get(path[0]));
    return path;
  }

  function chooseAiMove(playerId, card = {}) {
    const military = state.players[playerId].strategy === 'military';
    const fleets = Object.entries(state.fleets).filter(([,group]) => fleetCount(group[playerId]));
    let best = null;
    fleets.forEach(([source,group]) => {
      const fleet = group[playerId];
      if (fleet.explorer) {
        const relicTargets = state.clusters.filter(cluster=>clusterKnown(cluster,playerId)||clusterScanned(cluster,playerId)).map(relicCoordInCluster).filter(Boolean);
        if (!relicTargets.length) relicTargets.push(...state.clusters.filter(cluster=>!clusterKnown(cluster,playerId)).map(cluster=>cluster.center));
        const relicGoal = relicTargets.sort((a,b)=>hexDistance(source,a)-hexDistance(source,b))[0];
        const path = relicGoal && pathToCoord(source,relicGoal);
        if (path?.length) {
          const explorers = fleetGroup(fleet,'explorer');
          const reachable = new Set(reachableFrom(source,playerId,movementRange(explorers,card),true,explorers));
          // Stop at blockers and use both movement points when the path is clear.
          const destination = path.slice(0,movementRange(explorers,card)).filter(coord => reachable.has(coord)).pop();
          const score = 20 - path.length * .1;
          if (destination && (!best || score > best.score)) best = { source,destination,score,moveGroup:'explorer' };
        }
      }
      if (combatShipCount(fleet)) {
        const path = nearestGoal(source,playerId,military);
        if (!path?.length) return;
        const ships = fleetGroup(fleet,'ships');
        const range = movementRange(ships,card);
        let destination = source;
        for (let i=0;i<Math.min(range,path.length);i+=1) {
          const candidate = path[i];
          destination = candidate;
          if (hostileAt(candidate,playerId)) break;
        }
        const score = (military ? fleetPower(ships) : ships.settler * 3) - path.length * .1;
        if (!best || score > best.score) best = { source,destination,score,moveGroup:'ships' };
      }
    });
    return best;
  }

  function aiPlayCard(player, card) {
    removeHandCard(player,card.id);
  }

  function runAiOperation() {
    if (state.phase !== 'operations' || state.activePlayer === 0 || state.winner !== null) return;
    if (overflowPlayer() >= 0) return;
    if (state.pendingConsortium) { runAiConsortium(); return; }
    if (state.pendingColonyBuild) { aiColonyBuild(state.activePlayer); return; }
    aiManageStorage(state.activePlayer);
    aiRespondToTrades(state.activePlayer);
    const id = state.activePlayer;
    const player = state.players[id];
    const colonizeCard = player.hand.find(card => ALL_CARDS[card.key].order === 'colonize');
    const target = findColonizeTarget(id);
    if (colonizeCard && target) {
      const definition = ALL_CARDS[colonizeCard.key];
      const planet = state.planets[target];
      const capture = planet.owner !== null;
      const cost = { biomass: definition.tag === 'alienGenesis' ? 0 : capture ? 1 : definition.tag === 'dropColony' ? 1 : 2 };
      aiUseResources(player,colonizeCard.id,cost);
      if (applyColonizeOrder(id,target,colonizeCard)) {
        return;
      }
    }
    const constructCard = player.hand.find(card => ALL_CARDS[card.key].order === 'construct');
    const build = chooseAiBuild(id);
    if (constructCard && build) {
      const discount=constructCard.upgraded?[...RESOURCES].filter(r=>build.cost[r]>0).sort((a,b)=>((build.cost[b]||0)-player.resources[b])-((build.cost[a]||0)-player.resources[a]))[0]||null:null;
      aiUseResources(player,constructCard.id,constructionCost(id,build.coord,build.kind,discount));
      const built=constructAt(id,build.coord,build.kind,discount);
      if (built) {
        aiPlayCard(player,constructCard);
        completeAction(id,`${player.name} built ${STRUCTURES[build.kind]?.name || SHIP_STATS[build.kind].name} at ${nameForCoord(build.coord)}.`);
        return;
      }
    }
    const excavation = player.hand.find(card=>card.key==='excavate');
    if (excavation) {
      const coord=Object.keys(state.planets).find(key=>state.planets[key].special==='relic' && getFleet(key,id)?.explorer);
      if (coord) {
        aiUseResources(player,excavation.id,EXCAVATION_COST);
        const relic=state.relicRow.find(card=>RELIC_CARDS[card.key].affinity===(player.strategy==='military'?'Military':player.strategy==='expansion'?'Exploration':'Settlement')) || state.relicRow[0];
        if (relic && excavate(id,coord,excavation.id,relic.id)) return;
      }
    }
    const moveCard = player.hand.find(card => ALL_CARDS[card.key].order === 'move');
    const move = chooseAiMove(id,moveCard);
    if (moveCard && move && move.destination !== move.source) {
      const definition = ALL_CARDS[moveCard.key];
      executeMove(id,move.source,move.destination,{tag:definition.tag,moveGroup:move.moveGroup});
      aiPlayCard(player,moveCard);
      completeAction(id,`${player.name} moved a fleet toward ${nameForCoord(move.destination)}.`);
      return;
    }
    const alien=player.hand.find(card=>RELIC_CARDS[card.key]?.order==='special');
    if (alien) {resolveHumanSpecial(alien,ALL_CARDS[alien.key],id);return;}
    const special = player.hand.find(card => ALL_CARDS[card.key].tag === 'surge');
    if (special) {
      const worlds = controlledPlanets(id).filter(([,p])=>p.occupiedBy===null).slice(0,3).map(([,p])=>p);
      const gain = {};
      worlds.forEach(planet=>{ gain[planet.type]=(gain[planet.type]||0)+(planet.rich?2:1); });
      const result = addResources(player,gain);
      aiPlayCard(player,special);
      completeAction(id,`${player.name} triggered an Industrial Surge.${overflowNote(result)}`);
      return;
    }
    const consortium = player.hand.find(card=>card.key==='tradeConsortium');
    if (consortium) { resolveHumanSpecial(consortium,ALL_CARDS[consortium.key],id); runAiConsortium(); return; }
    if (aiOfferTrade(id)) return;
    passOperations(id);
  }

  function startBuyPhase() {
    state.phase = 'buy';
    const player = state.players[state.activePlayer];
    player.buyStartDiscardIds = player.discard.map(card => card.id);
    clearAction();
    startBuyTurn();
  }

  function startBuyTurn() {
    const player = state.players[state.activePlayer];
    state.turnStage = state.activePlayer === 0 ? 'buy' : 'ai-buy';
    if (state.activePlayer === 0) {
      captureHumanTurn(`Buy turn in Round ${state.round}`);
      if (!headless) switchTab('market');
    }
    render();
    saveGame();
    if (state.activePlayer !== 0) scheduleAiTurn('buy', runAiBuy, 550);
  }

  function nextBuyPlayer() {
    if (state.phase !== 'buy' || overflowPlayer() >= 0) return;
    state.phase = 'operations';
    nextOperationsPlayer();
  }

  function buyCard(playerId, source, indexOrKey) {
    const player = state.players[playerId];
    if (source==='basic' && !BASIC_MARKET.includes(indexOrKey)) return false;
    if (state.phase !== 'buy' || state.activePlayer !== playerId || player.bought >= player.buyLimit) return false;
    const card = source === 'market' ? state.market[indexOrKey] : makeCard(indexOrKey);
    if (!card) return false;
    const definition = ALL_CARDS[card.key];
    const discount = player.buyDiscountData > 0 ? 1 : 0;
    if (!payCost(player,definition.cost,discount)) return false;
    if (source === 'market') state.market.splice(indexOrKey,1);
    player.discard.push(card);
    player.bought += 1;
    player.cardsPurchased = (player.cardsPurchased || 0) + 1;
    if (discount) player.buyDiscountData = 0;
    fillMarket();
    logEvent(`${player.name} acquired ${definition.name}.`);
    return true;
  }

  function useBuyEffect(cardId, playerId = 0) {
    const player = state.players[playerId];
    const card = player.hand.find(c=>c.id===cardId);
    const definition = card && ALL_CARDS[card.key];
    if (!definition?.buyEffect || state.phase !== 'buy' || state.activePlayer !== playerId) return;
    if (definition.buyEffect === 'procurement') player.buyLimit = 2;
    if (definition.buyEffect === 'manipulation' && !player.marketManipulated) {
      player.marketManipulated = true;
      const removed = state.market.splice(0,Math.min(2,state.market.length));
      state.marketDiscard.push(...removed);
      fillMarket();
      player.buyDiscountData = 1;
    }
    removeHandCard(player,card.id);
    logEvent(`You activated ${definition.name} during Buy.`);
    render(); saveGame();
  }

  function decommission(playerId, cardId, resource) {
    const player = state.players[playerId];
    if (!player || overflowPlayer() >= 0 || !RESOURCES.includes(resource) || state.phase !== 'buy' || state.activePlayer !== playerId || player.resources[resource] < 3 || !player.buyStartDiscardIds.includes(cardId)) return false;
    const index = player.discard.findIndex(card => card.id === cardId);
    if (index < 0) return false;
    const [card] = player.discard.splice(index, 1);
    player.resources[resource] -= 3;
    logEvent(`${player.name} trashed ${ALL_CARDS[card.key].name} for 3 ${RESOURCE_NAMES[resource]}.`);
    return true;
  }

  function upgradeStarter(playerId, cardId) {
    const player = state.players[playerId];
    if (state.phase !== 'buy' || state.activePlayer !== playerId || player.resources.data < 1) return false;
    const card = [...player.hand,...player.discard].find(item=>item.id===cardId);
    if (!card?.starter || card.upgraded) return false;
    player.resources.data -= 1;
    card.upgraded = true;
    logEvent(`${player.name} upgraded ${ALL_CARDS[card.key].name} to level II.`);
    return true;
  }

  function runAiBuy() {
    const id = state.activePlayer;
    aiManageStorage(id);
    const player = state.players[id];
    const upgradeCandidate = [...player.hand,...player.discard].find(card=>card.starter&&!card.upgraded);
    if (upgradeCandidate && player.resources.data >= 2) upgradeStarter(id,upgradeCandidate.id);
    const procurement = player.hand.find(card => ALL_CARDS[card.key].buyEffect === 'procurement');
    if (procurement) {
      player.buyLimit = 2;
      removeHandCard(player,procurement.id);
      logEvent(`${player.name} activated Procurement Network.`);
    }
    const manipulation = player.hand.find(card => ALL_CARDS[card.key].buyEffect === 'manipulation');
    if (manipulation && !player.marketManipulated) {
      player.marketManipulated = true;
      player.buyDiscountData = 1;
      state.marketDiscard.push(...state.market.splice(0,Math.min(2,state.market.length)));
      fillMarket();
      removeHandCard(player,manipulation.id);
      logEvent(`${player.name} manipulated the market.`);
    }
    const priorities = player.strategy === 'military' ? ['coordinatedAssault','targetingAlgorithms','ablativePlating','orbitalShipyards'] : player.strategy === 'economy' ? ['industrialSurge','modularConstruction','terraformingProtocols','dataBrokerage'] : ['dropColonyModules','surveyDrones','pathfinderNetwork','procurementNetwork'];
    while (player.bought < player.buyLimit) {
      const choices = state.market.map((card,index)=>({card,index,score:priorities.includes(card.key)?10-priorities.indexOf(card.key):2})).filter(option=>canAfford(player,ALL_CARDS[option.card.key].cost,player.buyDiscountData)).sort((a,b)=>b.score-a.score);
      if (choices[0]) buyCard(id,'market',choices[0].index);
      else {
        const basics = BASIC_MARKET.filter(key=>canAfford(player,BASIC_CARDS[key].cost,player.buyDiscountData));
        if (basics.length) buyCard(id,'basic',basics[0]);
        else {
          const costs = [...state.market.map(card=>ALL_CARDS[card.key].cost),...BASIC_MARKET.map(key=>BASIC_CARDS[key].cost)];
          const plans = costs.map(cost=>bankPlanForCost(player,discountedCost(cost,player.buyDiscountData>0?'data':null)))
            .filter(plan=>plan?.length).sort((a,b)=>a.length-b.length);
          if (!plans.length) break;
          for (const trade of plans[0]) bankTrade(id,trade.giveType,trade.getType);
        }
      }
    }
    const removable = player.discard.find(card=>BASIC_CARDS[card.key] && player.buyStartDiscardIds.includes(card.id));
    const trashResource = RESOURCES.find(resource => player.resources[resource] >= 3);
    if (removable && trashResource && player.deck.length + player.discard.length > 8) decommission(id,removable.id,trashResource);
    nextBuyPlayer();
  }

  function finishHumanBuy() {
    if (state.phase !== 'buy' || state.activePlayer !== 0 || overflowPlayer() >= 0) return;
    completeHumanTurn();
    nextBuyPlayer();
  }

  function cleanupRound() {
    state.phase = 'cleanup';
    state.players.forEach(player => {
      player.discard.push(...player.hand);
      player.hand = [];
    });
    finishRound();
  }



  // The resource directive must be answered before the round can end, so a closed or
  // reloaded dialog reopens instead of leaving the game parked in that phase.
  function resumePendingChoice() {
    if (state.winner !== null) return;
    renderOverflow();
    if (overflowPlayer() < 0 && state.pendingConsortium) renderConsortium();
  }



  function finishRound() {
    state.phase = 'cleanup';
    const contenders = state.players.map((_,id)=>({id,prestige:calculatePrestige(id),colonies:colonyPlanets(id).length,resources:totalResources(state.players[id])})).filter(p=>p.prestige>=VICTORY_TARGET).sort((a,b)=>b.prestige-a.prestige||b.colonies-a.colonies||b.resources-a.resources);
    if (contenders.length) {
      state.winner = contenders[0].id;
      render(); saveGame();
      showMessage('GAME COMPLETE',`${state.players[state.winner].name} wins`,`${contenders[0].prestige} Prestige · ${contenders[0].colonies} Colonies · ${contenders[0].resources} stored resources`);
      return;
    }
    state.round += 1;
    state.firstPlayer = (state.firstPlayer + 1) % 4;
    logEvent(`Round ${state.round-1} ended. The first-player marker rotated.`);
    beginRound();
  }

  function canManageResources(playerId) {
    if (replayMode || overflowPlayer() >= 0 || state.pendingConsortium || state.winner !== null || state.activePlayer !== playerId || !state.players[playerId]) return false;
    if (state.phase === 'buy') return true;
    return state.phase === 'operations' && !state.players[playerId].passed
      && (headless || playerId !== 0 || ['prep','action','bonus-build'].includes(state.turnStage));
  }

  function canIncreaseStorage(playerId) {
    return canManageResources(playerId) && canAfford(state.players[playerId],STORAGE_UPGRADE.cost);
  }

  function increaseStorage(playerId) {
    if (!canIncreaseStorage(playerId)) return false;
    const player = state.players[playerId];
    payCost(player,STORAGE_UPGRADE.cost);
    player.storageUpgrades += 1;
    logEvent(`${player.name} paid to increase storage capacity to ${playerCapacity(playerId)}.`);
    render(); saveGame();
    return true;
  }

  function aiManageStorage(playerId) {
    if (totalResources(state.players[playerId]) >= playerCapacity(playerId)-2 && canIncreaseStorage(playerId)) increaseStorage(playerId);
  }

  function discardResources(playerId, resource, amount) {
    if (!canManageResources(playerId) || !RESOURCES.includes(resource) || !Number.isInteger(amount) || amount < 1) return false;
    const player = state.players[playerId];
    if (amount > player.resources[resource]) return false;
    player.resources[resource] -= amount;
    logEvent(`${player.name} discarded ${amount} ${RESOURCE_NAMES[resource]} to free storage.`);
    render(); saveGame();
    return true;
  }

  function canBankTrade(playerId, giveType, getType) {
    return canManageResources(playerId) && RESOURCES.includes(giveType) && RESOURCES.includes(getType)
      && giveType !== getType && state.players[playerId].resources[giveType] >= 4;
  }

  function bankTrade(playerId, giveType, getType) {
    if (!canBankTrade(playerId, giveType, getType)) return false;
    const player = state.players[playerId];
    // The fixed 4:1 payment frees three storage before the gain; no partial exchange.
    player.resources[giveType] -= 4;
    player.resources[getType] += 1;
    logEvent(`${player.name} exchanged 4 ${RESOURCE_NAMES[giveType]} for 1 ${RESOURCE_NAMES[getType]} with the bank.`);
    render(); saveGame();
    return true;
  }

  function canOfferTrade(playerId, terms) {
    const p = state.players[playerId];
    return !!p && state.winner === null && state.phase === 'operations' && state.activePlayer === playerId
      && !p.passed && !p.tradeUsed && !state.pendingColonyBuild && !state.pendingConsortium && (headless || playerId !== 0 || ['prep','action'].includes(state.turnStage))
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
    return !state.pendingConsortium && !!offer && state.winner === null && state.phase === 'operations' && state.activePlayer === playerId
      && offer.status === 'open' && offer.round === state.round && offer.from !== playerId
      && offer.responses[playerId] === 'pending' && !state.players[playerId].passed;
  }

  function tradeBlockReason(playerId, offer) {
    if (!tradeResponseAllowed(playerId,offer)) return 'Respond during your Operations turn.';
    const from=state.players[offer.from], to=state.players[playerId];
    if (from.resources[offer.giveType]<offer.giveAmount) return 'The offering faction no longer has those resources.';
    if (to.resources[offer.getType]<offer.getAmount) return `You need ${offer.getAmount} ${RESOURCE_NAMES[offer.getType]} to accept.`;
    if (totalResources(from)-offer.giveAmount+offer.getAmount>playerCapacity(offer.from)
      || totalResources(to)-offer.getAmount+offer.giveAmount>playerCapacity(playerId)) return 'The exchange would exceed storage capacity.';
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
    $('#trade-response').textContent=offerTrade(0,terms)
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
    if (cost) node.innerHTML = `<span>${message}</span>${resourceDots(cost)}${suffix ? `<span>${suffix}</span>` : ''}`;
    else node.textContent = message;
    document.body.appendChild(node);
    setTimeout(()=>node.remove(),2600);
  }

  function boardIcon(type, count = 1) {
    return `<span class="board-icon">${BOARD_ICONS[type]}${count > 1 ? `<b class="board-icon-count">${count}</b>` : ''}</span>`;
  }

  function fleetSymbolsAt(key) {
    return Object.entries(state.fleets[key] || {}).filter(([,fleet]) => fleetCount(fleet)).map(([owner,fleet]) => {
      const symbols = Object.keys(SHIP_STATS).filter(type => fleet[type] > 0).map(type => boardIcon(type,fleet[type])).join('');
      return `<span class="hex-fleet-group" style="--fleet-owner:${PLAYER_COLORS[Number(owner)]}">${symbols}</span>`;
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
    if (planet.upgrade) return boardIcon(planet.upgrade,planet.upgradeLevel||1);
    return '';
  }

  function buildingLabel(planet) {
    if (planet.hasColony) return 'Colony';
    if (planet.upgrade) return `${STRUCTURES[planet.upgrade].name} ${planet.upgradeLevel >= 2 ? 'II' : 'I'}`;
    return 'Open site';
  }

  function renderSymbolLegend() {
    $('#resource-legend').innerHTML = `<strong class="legend-heading">Map key</strong>${RESOURCES.map(resource=>`<span>${resourceDot(resource)}${RESOURCE_NAMES[resource]}</span>`).join('')}<span>★ Rich world</span><span>◈ Located relic</span><span>● Gray moon · no production</span><span>Fog = unvisited</span>`;
    const entries = [
      ['settler','Settler'],['explorer','Explorer'],['fleet','Fleet'],
      ['colony','Colony'],['harvester','Harvester'],['starbase','Shipyard']
    ];
    $('#symbol-legend').innerHTML = `<strong class="legend-heading">Units &amp; buildings</strong>${entries.map(([type,label]) => {
      const cost = type === 'colony' ? { biomass: 2 } : SHIP_STATS[type]?.cost || STRUCTURES[type]?.cost;
      return `<span class="tooltip-anchor symbol-legend-item" tabindex="0" data-tooltip="${LEGEND_TOOLTIPS[type]}" aria-label="${label}. ${LEGEND_TOOLTIPS[type]}"><span class="symbol-legend-name">${BOARD_ICONS[type]}${label}</span><span class="symbol-legend-cost">${resourceDots(cost)}</span><span class="symbol-legend-description">${LEGEND_TOOLTIPS[type]}</span></span>`;
    }).join('')}`;
  }

  // Replays reveal every faction's information, so fog never applies there.
  function knownToViewer(cluster) {
    return replayMode || revealEntireMap || clusterKnown(cluster,viewSeat);
  }

  function selectHex(key) {
    if (!replayMode) { humanSelectHex(key); return; }
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
          button.addEventListener('click',event=>{selectHex(key);showSectorScan(event.detail===0);});
          button.innerHTML='<span class="hex-fleets"></span><span class="hex-buildings"></span><span class="special"></span>';
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
      const scanned = clusterScanned(cluster,viewSeat);
      const relicSignal = Boolean(planet?.special === 'relic' && (scanned || planet.relicClaimed));
      hex.className = `hex ${planet ? (known ? planet.type : relicSignal ? 'fog scanned relic-signal' : 'space unknown-world') : 'space'}`;
      if (state.selected === key) hex.classList.add('selected');
      if (state.moveSource === key) hex.classList.add('source');
      if (state.reachable.includes(key)) hex.classList.add('target');
      const fleets = hex.querySelector('.hex-fleets'); const buildings = hex.querySelector('.hex-buildings'); const special = hex.querySelector('.special');
      const owners = new Set();
      if (known && planet?.owner !== null && planet?.owner !== undefined) owners.add(planet.owner);
      Object.entries(state.fleets[key]||{}).forEach(([fleetOwner,fleet])=>{if(fleetCount(fleet))owners.add(Number(fleetOwner));});
      const owner = [...owners][0];
      hex.style.setProperty('--owner',owner===undefined?'transparent':PLAYER_COLORS[owner]);
      fleets.innerHTML = fleetSymbolsAt(key);
      if (planet) {
        buildings.innerHTML = known ? buildingSymbols(planet) : '';
        special.textContent = known ? (planet.special==='rich'?'★':planet.special==='relic'?(planet.relicClaimed?'◇':'◈'):'') : (relicSignal?(planet.relicClaimed?'◇':'◈'):'');
        const buildingText = hasBuilding(planet) ? `, ${buildingLabel(planet)}` : '';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',known?`${planet.name}, ${planet.type}, ${planet.owner===null?'unclaimed':state.players[planet.owner].name}${buildingText}${fleetText ? `, fleet ${fleetText}` : ''}${planet.occupiedBy!==null?', occupied':''}`:relicSignal?`Alien relic signal at ${key}; surrounding terrain unknown${fleetText?', fleet '+fleetText:''}`:`Uncharted space ${key}${fleetText?', fleet '+fleetText:''}`);
      } else {
        buildings.innerHTML = ''; special.textContent='';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',`Space ${key}${fleetText?', fleet '+fleetText:''}`);
      }
    });
  }

  function renderScoreboard() {
    $('#score-ribbon').innerHTML = state.players.map((player,id)=>{
      const active = state.activePlayer===id && state.winner===null;
      const elo = state.replayElo?.[id];
      const eloText = elo ? `<span class="score-elo">Elo ${Math.round(elo.before)} → ${Math.round(elo.after)} (${elo.after>=elo.before?'+':''}${(elo.after-elo.before).toFixed(1)})</span>` : '';
      return `<article class="score-card ${active?'active':''} ${replayMode&&id===viewSeat?'viewing':''}" style="--player:${player.color}" title="Colonies: 1 each, plus 1 per two beyond home · Shipyards: 1 per pair · Excavated relics: 1 each · Deck: ${deckPrestige(id)}"><div class="score-top"><span class="score-name">${esc(player.name)}</span><span class="score-value">${calculatePrestige(id)}</span></div><div class="score-meta"><span>${colonyPlanets(id).length} colonies</span><span>${player.cardsPurchased||0} cards · ${deckPrestige(id)} Prestige</span><span>${strongestFleet(id)} fleet</span>${eloText}</div></article>`;
    }).join('');
  }

  function renderResourceTools() {
    $('#resource-tools').hidden = replayMode;
    if (replayMode) return;
    const enabled = canManageResources(0);
    const player = state.players[0];
    $('#resource-tools-help').textContent = enabled ? 'Free actions: exchange four of one kind for one different resource, or discard to make room.' : 'Available during your own Operations or Buy turn.';
    for (const selector of ['#bank-give-type','#bank-get-type','#discard-resource-type']) $(selector).disabled = !enabled;
    const give = $('#bank-give-type').value, get = $('#bank-get-type').value;
    $('#bank-exchange-preview').innerHTML = `${resourceDots({[give]:4})}<span aria-hidden="true">→</span>${resourceDots({[get]:1})}`;
    $('#bank-exchange-button').disabled = !canBankTrade(0,give,get);
    const resource = $('#discard-resource-type').value, amount = Number($('#discard-resource-amount').value);
    $('#discard-resource-amount').max = player.resources[resource] || 0;
    $('#discard-resource-amount').disabled = !enabled;
    $('#discard-resource-button').disabled = !enabled || !Number.isInteger(amount) || amount < 1 || amount > (player.resources[resource] || 0);
  }

  function renderResources() {
    const player = state.players[viewSeat];
    const stored = totalResources(player);
    const capacity = playerCapacity(viewSeat);
    renderResourceTools();
    if (replayMode) $('#command-eyebrow').textContent = `${player.name.toUpperCase()} · COMMAND`;
    $('#capacity-value').textContent = `${stored} of ${capacity} stored`;
    $('#capacity-meter').setAttribute('aria-valuenow', Math.min(stored,capacity));
    $('#capacity-meter').setAttribute('aria-valuemax', capacity);
    $('#capacity-meter').setAttribute('aria-label', `${stored} of ${capacity} resource storage used`);
    $('#capacity-fill').style.width = `${Math.min(100, stored / capacity * 100)}%`;
    $('#resource-grid').innerHTML = RESOURCES.map(resource => `
      <article class="resource-box ${resource}" style="--resource:var(--${resource})" aria-label="${RESOURCE_NAMES[resource]}: ${player.resources[resource]}">
        ${resourceDot(resource)}
        <span class="resource-name">${RESOURCE_NAMES[resource]}</span>
        <strong class="resource-amount">${player.resources[resource]}</strong>
      </article>`).join('');
    const upgrade = $('#upgrade-storage-button');
    upgrade.disabled = !canIncreaseStorage(0);
    upgrade.title = canManageResources(0) ? 'Pay 2 Matter, 1 Energy, and 1 Data for 5 permanent storage.' : 'Available during your Operations or Buy turn.';
    $('#storage-upgrade-cost').innerHTML = resourceDots(STORAGE_UPGRADE.cost);

  }

  function availableContextOrders(coord) {
    if (replayMode || state.winner !== null || state.phase !== 'operations' || state.activePlayer !== 0
      || !['prep','action'].includes(state.turnStage) || state.pendingColonyBuild) return [];
    const planet = state.planets[coord], fleet = getFleet(coord,0);
    const known = planet && clusterKnown(state.clusters[planet.cluster],0);
    const relicSignal = planet?.special === 'relic' && (known || clusterScanned(state.clusters[planet.cluster],0));
    const orders = [], seen = new Set();
    for (const card of state.players[0].hand) {
      const def = ALL_CARDS[card.key], signature = `${card.key}:${!!card.upgraded}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const name = `${def.name}${card.upgraded ? ' II' : ''}`;
      const add = (type,label,group=null) => orders.push({card:card.id,type,group,label:`${label} · ${name}`});
      if (def.order === 'move' && fleetCount(fleet)) {
        for (const group of ['ships','explorer']) {
          const moving = fleetGroup(fleet,group);
          if (fleetCount(moving) && reachableFrom(coord,0,movementRange(moving,card),def.tag==='pathfinder',moving).length)
            add('move',group === 'ships' ? 'Move ships' : 'Move Explorers',group);
        }
      }
      const canRecoverHere = relicSignal && !planet.relicClaimed && fleet?.explorer > 0;
      const canBuildHere = known && planet.occupiedBy === null && (canBuildStructureAt(0,coord)
        || planet.owner === 0 && planet.upgrade && (planet.upgradeLevel || 1) < 2
        || canLaunchExplorer(0,coord) || planet.owner === 0 && planet.upgrade === 'starbase');
      if (def.order === 'construct' && canBuildHere) add('construct','Build / upgrade');
      if (def.order === 'excavate' && canRecoverHere) add('excavate','Excavate relic');
      if (known && def.order === 'colonize' && isColonySite(coord) && fleet?.settler > 0
        && (planet.owner === null && !hasBuilding(planet) || planet.owner !== null && planet.owner !== 0 && planet.occupiedBy === 0))
        add('colonize',planet.owner === null ? 'Found Colony' : 'Capture Colony');
      if (known && def.tag === 'terraform' && planet.owner === 0 && !planet.rich) add('terraform','Terraform');
    }
    return orders;
  }

  function startContextOrder(cardId, coord, group = null) {
    const order = availableContextOrders(coord).find(item => item.card === cardId && item.group === group);
    if (!order) return false;
    state.selected = coord;
    if (state.actionCardId !== cardId || !state.actionMode) playOrder(cardId);
    if (state.actionCardId !== cardId || !state.actionMode) return false;
    if (order.type === 'move') prepareHumanMove(coord,group);
    render(); saveGame();
    return true;
  }

  function renderContextOrders(actions, coord) {
    const orders = availableContextOrders(coord);
    if (!orders.length) return;
    if (state.actionMode) {
      actions.appendChild(actionButton('Choose another order',()=>{clearAction();render();saveGame();}));
      return;
    }
    const list = document.createElement('div');
    list.className = 'context-order-list';
    const title = document.createElement('strong');
    title.textContent = 'Orders from your hand';
    list.appendChild(title);
    for (const order of orders) list.appendChild(actionButton(order.label,()=>startContextOrder(order.card,coord,order.group)));
    actions.appendChild(list);
  }

  function renderInspector() {
    const key = state.selected;
    const title = $('#inspect-title'); const coordinate = $('#inspect-coordinate'); const detail = $('#inspect-detail'); const facts = $('#inspect-facts'); const actions = $('#context-actions');
    actions.innerHTML='';
    const discount=!replayMode&&state.actionMode==='construct'&&state.actionOptions.upgraded?state.actionOptions.discountResource:null;
    $('#construction-discount-row').hidden=discount===null;
    if(discount!==null) $('#construction-discount').value=discount;
    const buildButton=(label,kind)=>actionButton(label,()=>contextBuild(kind,key),constructAt(0,key,kind,discount,true),constructionCost(0,key,kind,discount));
    if (!key) { title.textContent='Select a hex'; coordinate.textContent='—'; detail.textContent='Choose a planet or space hex to inspect fleets, control, and possible actions.'; facts.innerHTML=''; return; }
    renderContextOrders(actions,key);
    const planet = state.planets[key]; const fleets = state.fleets[key]||{};
    const fleetFacts=Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${esc(state.players[owner].name)}</span><strong>${formatFleet(f)}</strong></div>`).join('');
    coordinate.textContent=key;
    if (planet) {
      const cluster = state.clusters[planet.cluster];
      if (!knownToViewer(cluster)) {
        const relicSignal = planet.special === 'relic' && (clusterScanned(cluster,viewSeat) || planet.relicClaimed);
        title.textContent = relicSignal ? 'Alien relic signal' : 'Uncharted space';
        detail.textContent = relicSignal ? 'A relic signal was located here. The surrounding terrain remains unknown.' : 'Any ship can enter this region to reveal its seven-sector world.';
        facts.innerHTML = relicSignal ? `<div class="fact"><span>Signal</span><strong>Rosetta Stone</strong></div><div class="fact"><span>Relic</span><strong>Available</strong></div>` : '<div class="fact"><span>Status</span><strong>Unknown</strong></div>';

        facts.innerHTML+=fleetFacts;
        return;
      }
      title.textContent=planet.name;
      const owner = planet.owner===null?'Unclaimed':esc(state.players[planet.owner].name);
      detail.innerHTML=`${planet.type==='moon'?'Gray moon · no production':resourceDot(planet.type,'resource-dot-large')+' planet'} · ${owner}${planet.occupiedBy!==null?` · Occupied by ${esc(state.players[planet.occupiedBy].name)}`:''}`;
      const fleetIncome = (planet.type==='moon'?[]:fleetControllersAt(key)).map(playerId => `${esc(state.players[playerId].name)} +${resourceDots({ [planet.type]: 1 })}`).join(' · ');
      facts.innerHTML=`<div class="fact"><span>World hex</span><strong>${planet.type==='moon'?'Moon':isColonySite(key)?'Center · Colony site':'Outer'}</strong></div><div class="fact"><span>Owner production</span><strong>${planet.type==='moon'?'None':planet.owner===null?'Unclaimed':resourceDots({ [planet.type]: ownerProductionAmount(planet) })}</strong></div><div class="fact"><span>Fleet production</span><strong>${fleetIncome||'No combat fleet'}</strong></div><div class="fact"><span>Building</span><strong>${buildingLabel(planet)}</strong></div>${planet.special==='relic'?`<div class="fact"><span>Relic site</span><strong>Available</strong></div>`:''}${Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${esc(state.players[owner].name)}</span><strong>${formatFleet(f)}</strong></div>`).join('')}`;
    } else {
      title.textContent='Empty Space'; detail.textContent='Fleets may move, fight, and retreat here.';
      facts.innerHTML=Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${esc(state.players[owner].name)}</span><strong>${formatFleet(f)}</strong></div>`).join('')||'<div class="fact"><span>Status</span><strong>Vacant</strong></div>';
    }
    if (replayMode) {
      // Recorded decisions replace the live action buttons.
      const pending = state.pendingColonyBuild;
      const notes = [];
      if (pending && state.reachable.includes(key)) notes.push(['Colonize II', `${esc(state.players[pending.playerId].name)} may build here at full cost`]);
      if (state.replayDecision?.coords?.includes(key)) notes.push(['This decision', esc(state.replayDecision.text)]);
      if (state.lastCombat?.coord === key) notes.push(['Last combat', esc(state.lastCombat.outcome)]);
      facts.insertAdjacentHTML('beforeend', notes.map(([label,text])=>`<div class="fact"><span>${label}</span><strong>${text}</strong></div>`).join(''));
      return;
    }
    if(state.pendingColonyBuild?.playerId===0) {
      for(const kind of Object.keys(STRUCTURES)) {
        if(adjacentKeys(state.pendingColonyBuild.colony).includes(key) && canBuildStructureAt(0,key))
          actions.appendChild(actionButton(`Build ${STRUCTURES[kind].name}`,()=>finishColonyBuild(0,key,kind),canColonyBuild(0,key,kind),constructionCost(0,key,kind,null,true)));
      }
      actions.appendChild(actionButton('Finish without building',()=>finishColonyBuild(0)));
    }
    if (state.phase==='operations' && state.activePlayer===0 && state.turnStage==='action') {
      if (state.actionMode==='move' && state.moveChoiceSource===key) {
        actions.appendChild(actionButton('Move Explorers',()=>prepareHumanMove(key,'explorer')));
        actions.appendChild(actionButton('Move Ships',()=>prepareHumanMove(key,'ships')));
      }
      if (state.actionMode==='construct' && planet && planet.occupiedBy===null) {
        if (canBuildStructureAt(0,key)) Object.keys(STRUCTURES).forEach(kind=>actions.appendChild(buildButton(`Build ${STRUCTURES[kind].name}`,kind)));
        if (planet.owner===0 && planet.upgrade && (planet.upgradeLevel||1)<2) actions.appendChild(buildButton(`Upgrade ${STRUCTURES[planet.upgrade].name} to II`,planet.upgrade));
        if (canLaunchExplorer(0,key)) actions.appendChild(buildButton('Commission Explorer + Excavate','explorer'));
        if (planet.upgrade==='starbase') Object.keys(SHIP_STATS).filter(kind=>kind!=='explorer').forEach(kind=>actions.appendChild(buildButton(`Commission ${SHIP_STATS[kind].name}${kind==='settler'?' + Colonize':''}`,kind)));
      }

      if (state.actionMode==='colonize' && planet) {
        const capture=planet.owner!==null&&planet.owner!==0&&planet.occupiedBy===0;
        const eligible=isColonySite(key)&&((planet.owner===null&&!hasBuilding(planet))||capture)&&getFleet(key,0)?.settler>0;
        const colonizeCost={ biomass: capture?1:state.actionOptions.tag==='dropColony'?1:2 };
        if (eligible) actions.appendChild(actionButton(capture?'Capture planet':'Found Colony',()=>contextColonize(key),state.players[0].resources.biomass>=colonizeCost.biomass,colonizeCost));
      }
      if (state.actionMode==='terraform' && planet?.owner===0&&!planet.rich) actions.appendChild(actionButton('Terraform',()=>contextTerraform(key),state.players[0].resources.biomass>=2,{ biomass: 2 }));
    }
  }

  function actionButton(label,handler,enabled=true,cost=null) {
    const button=document.createElement('button'); button.type='button'; button.className='button'; button.innerHTML=cost?`<span>${label}</span>${resourceDots(cost)}`:label; button.disabled=!enabled; button.addEventListener('click',handler); return button;
  }



  function renderLog() {
    $('#game-log').innerHTML=state.log.slice(0,18).map(item=>`<li>${replayMode?esc(item):item}</li>`).join('');
  }

  function cardMarkup(card, location) {
    const definition=ALL_CARDS[card.key];
    const isHumanOps=!replayMode&&state.phase==='operations'&&state.activePlayer===0;
    const canResource=location==='hand'&&isHumanOps&&['prep','action','bonus-build'].includes(state.turnStage)&&definition.resource;
    const resourceGain=cardResources(card);
    if(definition.wildcard)resourceGain.data=(resourceGain.data||0)+definition.wildcard;
    const canStoreCard=overflowPlayer()<0;
    const canOrder=location==='hand'&&isHumanOps&&['prep','action'].includes(state.turnStage)&&definition.order&&!definition.reaction&&!definition.buyEffect;
    const isSelectedOrder=canOrder&&state.actionCardId===card.id&&Boolean(state.actionMode);
    const canBuyEffect=location==='hand'&&!replayMode&&state.phase==='buy'&&state.activePlayer===0&&definition.buyEffect&&!(definition.buyEffect==='manipulation'&&state.players[0].marketManipulated);
    return `<article class="game-card ${definition.kind==='Alien Relic'?'alien-relic':''} ${card.upgraded?'upgraded':''} ${isSelectedOrder?'order-selected':''}" style="--card-accent:${definition.accent}"><span class="card-type">${definition.kind}${definition.affinity?' · '+definition.affinity:''}${card.starter?' · STARTER':''}</span><span class="card-name">${definition.name}${card.upgraded?' II':''}</span>${definition.lore?`<span class="card-lore">${esc(definition.lore)}</span>`:''}<span class="card-effect">${resourceText(definition.text)}${card.upgraded?` II: ${upgradedOrderText(card)} Conversion gains one extra resource.`:''}</span><div class="card-footer"><span>${definition.resource?`<small>Gain</small>${resourceDots(conversionGain(card))}`:''}</span><span>${definition.cost?`<small>Buy</small>${resourceDots(definition.cost)}`:''}</span></div>${location==='hand'?`<div class="card-buttons">${canResource?`<button class="button" data-resource-card="${card.id}" ${canStoreCard?'':`disabled title="Choose excess resources first"`}>${canStoreCard?'Convert to resources':`Choose discards first`}</button>`:''}${canOrder?`<button class="button ${isSelectedOrder?'button-danger':'button-primary'}" data-order-card="${card.id}" aria-pressed="${isSelectedOrder}">${isSelectedOrder?'Cancel order':'Use order'}</button>`:''}${canBuyEffect?`<button class="button button-primary" data-buy-effect="${card.id}">Use in Buy</button>`:''}${definition.reaction&&isHumanOps?'<span class="muted">Automatic reaction</span>':''}</div>`:''}</article>`;
  }

  function renderHand() {
    const player=state.players[viewSeat];
    // Replays record pile sizes, not the order or contents of deck and discard.
    const discardCount=replayMode?player.discardCount:player.discard.length;
    $('#hand-count').textContent=player.hand.length;
    $('#deck-count').textContent=replayMode?player.deckCount:player.deck.length;
    $('#hand-pile-count').textContent=player.hand.length;
    $('#discard-count').textContent=discardCount;
    $('#discard-dialog-count').textContent=discardCount;
    $('#hand-row').innerHTML=player.hand.length?player.hand.map(card=>cardMarkup(card,'hand')).join(''):`<p class="muted">${replayMode?`${esc(player.name)}’s hand is empty.`:'Your hand is empty.'}</p>`;
    $('#discard-row').innerHTML=replayMode?'<p class="muted discard-empty">Replays record discard pile size, not its cards.</p>':player.discard.length?[...player.discard].reverse().map(card=>cardMarkup(card,'discard')).join(''):'<p class="muted discard-empty">Your discard pile is empty.</p>';
    $$('[data-resource-card]').forEach(button=>button.addEventListener('click',()=>playResourceMode(button.dataset.resourceCard)));
    $$('[data-order-card]').forEach(button=>button.addEventListener('click',()=>playOrder(button.dataset.orderCard)));
    $$('[data-buy-effect]').forEach(button=>button.addEventListener('click',()=>useBuyEffect(button.dataset.buyEffect)));
    const prep=state.phase==='operations'&&state.activePlayer===0&&state.turnStage==='prep';
    const convertAll = $('#convert-all-button');
    convertAll.hidden = !canConvertCards();
    convertAll.disabled = !canConvertCards() || !player.hand.length;
    convertAll.innerHTML = `<span>Convert all to resources</span><span class="conversion-symbols" aria-hidden="true">${RESOURCES.map(resource => resourceDot(resource)).join('')}</span>`;
    $('#skip-colony-build').hidden=replayMode || !state.pendingColonyBuild || state.activePlayer!==0;
    if (replayMode) {
      $('#hand-title').textContent=`${player.name}’s hand`;
      $('#hand-help').textContent=state.pendingColonyBuild?.playerId===viewSeat?'Colonize II: this faction may build once beside its new Colony at full cost, or finish without building.':'Every card this faction holds at this decision. Upgraded starter cards are marked II.';
      return;
    }
    $('#hand-help').textContent=state.pendingColonyBuild&&state.activePlayer===0?'Colonize II: choose an adjacent hex for one building at full cost, convert cards if needed, or finish without building.':prep?'Use an order directly on a card, or convert cards for resources.':state.turnStage==='action'&&state.actionMode?`${state.actionOptions.cardName||'Order'} selected. You may still convert cards, cancel it, trade, or pass.`:state.turnStage==='action'?'Convert cards as needed, play one order card, make a Trade action, or pass.':'Keep Buy cards for your Buy turn and reactions for later attacks. Remaining cards are discarded at round cleanup.';
  }

  function renderMarket() {
    const humanBuy=!replayMode&&state.phase==='buy'&&state.activePlayer===0;
    $('#market-help').textContent=replayMode?`Every ${CARDS_PER_PRESTIGE} purchased cards grant 1 Prestige. ${state.players[viewSeat].name} purchased: ${state.players[viewSeat].cardsPurchased||0} · Deck Prestige: ${deckPrestige(viewSeat)}.`:`Buy one card during your Buy turn. Every ${CARDS_PER_PRESTIGE} purchased cards grant 1 Prestige. Purchased: ${state.players[0].cardsPurchased||0} · Deck Prestige: ${deckPrestige(0)}.`;
    $('#basic-market').innerHTML=BASIC_MARKET.map(key=>[key,BASIC_CARDS[key]]).map(([key,def])=>`<span class="tooltip-anchor basic-market-item" data-tooltip="${BASIC_TOOLTIPS[key]}"><button class="button" data-buy-basic="${key}" aria-label="${def.name}. ${BASIC_TOOLTIPS[key]}" ${!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData)?'disabled':''}><span>${def.name}</span>${resourceDots(def.cost)}</button></span>`).join('');
    $('#market-row').innerHTML=replayMode?'<p class="muted">Replays record purchases in the game log, not the advanced market row.</p>':state.market.map((card,index)=>{
      const def=ALL_CARDS[card.key];
      const disabled=!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData);
      return `<button class="game-card" style="--card-accent:${def.accent}" data-buy-market="${index}" ${disabled?'disabled':''}><span class="card-type">${def.kind}</span><span class="card-name">${def.name}</span><span class="card-effect">${resourceText(def.text)}</span><span class="card-footer"><small>Buy</small>${resourceDots(def.cost)}</span></button>`;
    }).join('');
    $$('[data-buy-basic]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'basic',button.dataset.buyBasic)){render();saveGame();}}));
    $$('[data-buy-market]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'market',Number(button.dataset.buyMarket))){render();saveGame();}}));
    $('#finish-buy-button').hidden=!humanBuy;
    if (replayMode) { $('#decommission-area').innerHTML=''; return; }
    const eligible=state.players[0].discard.filter(card=>state.players[0].buyStartDiscardIds.includes(card.id));
    const selectedResource = $('#trash-resource')?.value;
    const trashResource = RESOURCES.includes(selectedResource) ? selectedResource : RESOURCES.find(resource=>state.players[0].resources[resource]>=3) || 'matter';
    const trashOptions = RESOURCES.map(resource =>
      `<option value="${resource}" ${resource===trashResource?'selected':''}>${RESOURCE_NAMES[resource]}</option>`
    ).join('');
    const trashButtons = eligible.map(card => `
      <button class="button" data-trash="${card.id}" ${state.players[0].resources[trashResource]<3?'disabled':''}>
        ${ALL_CARDS[card.key].name}${card.upgraded?' II':''}${card.starter?' · starter':''}
      </button>`).join('');
    $('#decommission-area').innerHTML = humanBuy ? `
      <div class="decommission-list">
        <strong>Trash a card</strong>
        <label>Pay 3 <select id="trash-resource">${trashOptions}</select></label>
        ${trashButtons || '<span class="muted">No eligible discarded cards</span>'}
      </div>` : '';
    $('#trash-resource')?.addEventListener('change',renderMarket);
    $$('[data-trash]').forEach(button=>button.addEventListener('click',()=>{if(decommission(0,button.dataset.trash,$('#trash-resource').value)){render();saveGame();}}));
    const upgradeable=[...state.players[0].hand,...state.players[0].discard].filter(card=>card.starter&&!card.upgraded);
    if(humanBuy) $('#decommission-area').insertAdjacentHTML('beforeend',`<div class="decommission-list upgrade-list"><strong>Upgrade starter ${resourceDots({ data: 1 })}</strong>${upgradeable.length?upgradeable.map(card=>`<button class="button" data-upgrade-card="${card.id}" ${state.players[0].resources.data<1?'disabled':''}>${ALL_CARDS[card.key].name} → II · ${upgradedOrderText(card)}</button>`).join(''):'<span class="muted">All starter cards upgraded</span>'}</div>`);
    $$('[data-upgrade-card]').forEach(button=>button.addEventListener('click',()=>{if(upgradeStarter(0,button.dataset.upgradeCard)){render();saveGame();}}));

  }

  function renderFleetSummary() {
    $('#fleet-summary').innerHTML=state.players.map((player,id)=>{
      const totals={settler:0,explorer:0,fleet:0};
      Object.values(state.fleets).forEach(group=>Object.keys(totals).forEach(type=>{totals[type]+=group[id]?.[type]||0;}));
      return `<div class="fleet-faction" style="--player:${player.color}"><strong>${esc(player.name)}</strong><span>${totals.settler} Settlers · ${totals.explorer} Explorers · ${totals.fleet} Fleets<br>${excavatedRelicCount(id)} excavated relics · ${strongestFleet(id)} strongest-fleet power</span></div>`;
    }).join('');
    const player=state.players[0];
    $('#military-deck-count').textContent=replayMode?'Every faction uses this deck':`${player.militaryDeck.length} ready · ${player.militaryDiscard.length} used`;
    const counts=MILITARY_DECK_LIST.reduce((result,key)=>{result[key]=(result[key]||0)+1;return result;},{});
    $('#military-card-grid').innerHTML=Object.entries(counts).map(([key,count])=>{
      const card=MILITARY_CARDS[key];
      const stats=[card.attack?`Attack +${card.attack}`:'',card.shield?`Shield ${card.shield}`:'',card.pierce?`Pierce ${card.pierce}`:'',card.retreat?'Withdrawal':''].filter(Boolean).join(' · ');
      return `<article class="military-card"><strong>${count}× ${card.name}</strong><span>${card.text}</span><small>${stats||'Tactical effect'}</small></article>`;
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
    $('#trade-form').querySelector('button').disabled=!(!replayMode&&state.phase==='operations'&&state.activePlayer===0&&['prep','action'].includes(state.turnStage)&&!state.players[0].tradeUsed);
    const offers=state.tradeOffers.filter(o=>o.round===state.round || o.status==='open');
    $('#trade-offers').innerHTML=offers.length?[...offers].reverse().map(o=>{
      const canRespond=!replayMode&&tradeResponseAllowed(0,o), reason=canRespond&&tradeBlockReason(0,o);
      const status=o.status==='accepted'?`Accepted by ${esc(state.players[o.acceptedBy].name)}`:o.status==='open'?'Open to all factions':o.status[0].toUpperCase()+o.status.slice(1);
      return `<article class="trade-offer"><div class="trade-offer-heading"><strong>${esc(state.players[o.from].name)}</strong><span class="offer-status">${status}</span></div>
        <div class="trade-terms"><span>Offers ${resourceDots({[o.giveType]:o.giveAmount})}</span><span aria-hidden="true">→</span><span>Asks for ${resourceDots({[o.getType]:o.getAmount})}</span></div>
        <p>${o.responses.map((r,id)=>id===o.from?'':`${esc(state.players[id].name)}: ${r==='pending'&&o.status!=='open'?'no response':r}`).filter(Boolean).join(' · ')}</p>
        ${canRespond?`<div class="trade-offer-actions"><button class="button button-primary" data-trade-accept="${o.id}" ${reason?'disabled':''}>Accept offer</button><button class="button button-ghost" data-trade-reject="${o.id}">Reject offer</button></div>${reason?`<p>${reason}</p>`:''}`:''}
        ${!replayMode&&o.from===0&&o.status==='open'?`<button class="button button-ghost" data-trade-cancel="${o.id}" ${state.activePlayer!==0?'disabled':''}>Withdraw offer</button>`:''}</article>`;
    }).join(''):'<p class="muted">No offers this round. Publish one to open negotiations.</p>';
    for (const response of ['accept','reject','cancel']) $$(`[data-trade-${response}]`).forEach(button=>button.addEventListener('click',()=>{
      const id=Number(button.getAttribute(`data-trade-${response}`));
      if (response==='cancel') cancelTrade(0,id); else respondTrade(0,id,response);
    }));
    const pending=state.tradeOffers.filter(o=>o.status==='open'&&(replayMode||o.from!==0&&o.responses[0]==='pending')).length;
    $('#trade-tab').textContent=pending?`Trade (${pending} open)`:'Trade';
    $('#trade-ledger').innerHTML=state.players.filter(player=>player.id!==viewSeat).map(player=>`<div><span>${esc(player.name)}</span><strong>${state.players[viewSeat].tradesWith[player.id]} completed</strong></div>`).join('');
  }

  function renderHeader() {
    $('#round-value').textContent=state.round;
    $('#phase-value').textContent=state.phase[0].toUpperCase()+state.phase.slice(1);
    $('#active-value').textContent=state.winner!==null?'Game over':state.players[state.activePlayer].name;
    if (replayMode) { renderReplayDecision(); return; }
    const humanTurn=state.activePlayer===0&&state.winner===null;
    $('#turn-dot').style.background=state.players[state.activePlayer]?.color||'var(--cyan)';
    $('#turn-title').textContent=state.winner!==null?`${state.players[state.winner].name} won`:humanTurn?'Your turn':`${state.players[state.activePlayer].name} is acting`;
    let instruction='';
    if(state.phase==='operations')instruction=humanTurn?(state.turnStage==='prep'?'Use an order on a card, convert resources, trade, or pass.':'Choose one order, Trade action, or pass.'):'Computer rival is evaluating the board…';
    else if(state.phase==='buy')instruction=humanTurn?'Buy now, upgrade or trash cards, then finish to let remaining factions continue.':'Computer rival is shopping the market…';
    else instruction='Resolving automatic bookkeeping…';
    $('#turn-instruction').textContent=state.pendingConsortium?'Choose your Trade Consortium gain or exchanges.':state.pendingColonyBuild?.playerId===0?'Colonize II: choose an adjacent building at full cost, or finish without building.':instruction;
    $('#pass-button').hidden=!(state.phase==='operations'&&humanTurn&&(state.turnStage==='prep'||state.turnStage==='action'));
    const undoButton=$('#undo-turn-button');
    undoButton.disabled=!turnHistory.undo;
    undoButton.title=turnHistory.undo?`Restore the start of your ${turnHistory.undo.label}`:'Available after you complete a turn';
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
      case 'pass': return { text: 'Pass & buy' };
      case 'consortium_gain': return { text: `Trade Consortium · Gain ${amount(1,action.resource)}` };
      case 'consortium_exchange': return { text: `Trade Consortium · ${amount(2,action.giveType)} → ${amount(1,action.getType)}` };
      case 'finish_consortium': return { text: 'Finish Trade Consortium after one exchange' };
      case 'cancel_consortium': return { text: 'Cancel Trade Consortium without using the card' };
      case 'bank_trade': return { text: `Bank exchange · ${amount(4,action.giveType)} → ${amount(1,action.getType)}` };
      case 'increase_storage': return { text: 'Pay 2 Matter, 1 Energy, and 1 Data to add 5 permanent storage' };
      case 'discard_resources': return { text: `Discard ${amount(action.amount,action.resource)} to free storage` };
      case 'resource': return { text: `Convert to resources · ${cardName('Card')} → ${gains(action.gain)}` };
      case 'move': return { text: `${order} · ${action.moveGroup === 'explorer' ? 'Move Explorers' : 'Move Ships'} from ${place(action.source)} to ${place(action.destination)}`, coords: [action.source, action.destination], source: action.source };
      case 'build': {
        const planet = before.planets[action.coord];
        const label = STRUCTURES[action.kind] ? (planet?.owner === seat && planet.upgrade === action.kind ? `Upgrade ${STRUCTURES[action.kind].name} to II` : `Build ${STRUCTURES[action.kind].name}`)
          : action.kind === 'explorer' ? 'Recruit Explorer' : `Commission ${SHIP_STATS[action.kind]?.name || action.kind}`;
        const discount = action.discountResource ? ` · Construct II: −1 ${RESOURCE_NAMES[action.discountResource]}` : '';
        return { text: `${order} · ${label} at ${place(action.coord)}${discount}`, coords: [action.coord] };
      }
      case 'colonize': {
        const planet = before.planets[action.coord];
        const capture = planet?.owner !== null && planet?.owner !== undefined && planet.owner !== seat;
        return { text: `${order} · ${capture ? 'Capture planet' : 'Found Colony'} at ${place(action.coord)}`, coords: [action.coord] };
      }
      case 'colony_build': return { text: `Colonize II · Build ${STRUCTURES[action.kind]?.name || action.kind} at ${place(action.coord)} at full cost`, coords: [action.coord] };
      case 'finish_colony_build': return { text: 'Colonize II · Finish without building' };
      case 'excavate': return { text: `${order} · Excavate at ${place(action.coord)} · Choose ${ALL_CARDS[before.relicRow?.find(card=>card.id===action.relic)?.key]?.name || 'alien relic'}`, coords:[action.coord] };
      case 'terraform': return { text: `${order} · Terraform ${place(action.coord)}`, coords: [action.coord] };
      case 'special': return { text: order };
      case 'trade_offer': return { text: `Publish open offer · Offers ${amount(action.giveAmount,action.giveType)} → Asks for ${amount(action.getAmount,action.getType)}` };
      case 'trade_accept': return { text: `Accept offer${offer ? ` from ${names[offer.from]}` : ''}` };
      case 'trade_reject': return { text: `Reject offer${offer ? ` from ${names[offer.from]}` : ''}` };
      case 'trade_cancel': return { text: 'Withdraw offer' };
      case 'buy': return { text: `Buy ${ALL_CARDS[action.key]?.name || 'a card'}${action.source === 'market' ? ' from the market' : ''}` };
      case 'finish_buy': return { text: 'Finish Buy' };
      case 'upgrade': return { text: `Upgrade starter · ${cardName('a starter card')} → II` };
      case 'buy_effect': return { text: `Use in Buy · ${cardName('Card')}` };
      case 'decommission': return { text: `Trash ${cardName('a discarded card')} · ${amount(3,action.resource)}` };
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
      round: view.round, phase: view.phase, activePlayer: view.active ?? 0, winner: view.winner ?? null, firstPlayer: 0,
      players: view.players.map((p, id) => ({ ...p, id, name: extra.names[id], color: PLAYER_COLORS[id], cardsPurchased: extra.cardsPurchased[id], tradesWith: extra.tradesWith[id] })),
      planets: view.planets, clusters: view.clusters, fleets: view.fleets, relicRow: view.relicRow || [], relicDeck: [], relicDeckCount: view.relicDeckCount || 0, pendingConsortium: view.pendingConsortium || null,
      log: view.log || [], lastCombat: view.lastCombat || null, tradeOffers: view.tradeOffers || [], market: [],
      selected: extra.selected || null, actionMode: null, actionOptions: {}, turnStage: 'waiting', pendingColonyBuild: pending,
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
    showMessage('GAME COMPLETE', `${state.players[state.winner].name} wins`, standings.map(({player,id,prestige,colonies,resources},rank) => {
      const elo = state.replayElo?.[id];
      return `${rank+1}. ${player.name}: ${prestige} Prestige · ${colonies} Colonies · ${resources} stored resources${elo ? ` · Elo ${Math.round(elo.before)} → ${Math.round(elo.after)}` : ''}`;
    }).join('\n'));
  }

  function updateOverflowSelection() {
    const excess = totalResources(state.players[0]) - playerCapacity(0);
    const chosen = RESOURCES.reduce((sum,resource)=>sum+Number($(`#overflow-${resource}`).value),0);
    $('#overflow-status').textContent = `${chosen} of ${excess} resources selected`;
    $('#overflow-confirm').disabled = chosen !== excess;
  }

  function renderOverflow() {
    if (headless || replayMode) return;
    const dialog = $('#overflow-dialog');
    const pending = overflowPlayer();
    if (pending !== 0) {
      if (dialog.open) dialog.close();
      return;
    }
    clearTimeout(aiTimer);
    const excess = totalResources(state.players[0]) - playerCapacity(0);
    $('#overflow-help').textContent = `Choose ${excess} resource${excess === 1 ? '' : 's'} to discard. You can choose resources you already had or just collected.`;
    if (!dialog.open) {
      $('#overflow-options').innerHTML = RESOURCES.map(resource=>`<label class="overflow-option">${resourceDot(resource)}<span>${RESOURCE_NAMES[resource]} <small>${state.players[0].resources[resource]} held</small></span><input id="overflow-${resource}" aria-label="${RESOURCE_NAMES[resource]} to discard" type="number" min="0" max="${Math.min(excess,state.players[0].resources[resource])}" step="1" value="0" required></label>`).join('');
      RESOURCES.forEach(resource=>$(`#overflow-${resource}`).addEventListener('input',updateOverflowSelection));
      dialog.showModal();
      updateOverflowSelection();
    }
  }

  function renderRelicRow() {
    const row=$('#relic-row');
    row.innerHTML=state.relicRow.map(relic=>{
      const selected=state.selected;
      const choose=!replayMode && state.actionMode==='excavate';
      const allowed=choose && excavate(0,selected,state.actionCardId,relic.id,true);
      return `<div>${cardMarkup(relic,'relic-row')}${choose?`<button class="button button-primary" data-excavate-relic="${relic.id}" ${allowed?'':'disabled'}>Choose ${esc(ALL_CARDS[relic.key].name)}</button>`:''}</div>`;
    }).join('') || '<p class="muted">All alien relic cards have been recovered.</p>';
    $('#relic-deck-count').textContent=`${replayMode?state.relicDeckCount:state.relicDeck.length} cards remaining in deck`;
    $('#relic-row-help').textContent=state.actionMode==='excavate'?'Select your Explorer’s relic hex, then choose a card below. Pay 1 Matter, 1 Energy, and 2 Data.':'Use Excavate with an Explorer at a relic to choose one of these cards.';
    $$('[data-excavate-relic]').forEach(button=>button.addEventListener('click',()=>contextExcavate(state.selected,button.dataset.excavateRelic)));
  }

  function render() {
    if (headless) return;
    renderHeader(); renderScoreboard(); renderBoard(); renderResources(); renderInspector(); positionSectorScan(); renderLog(); renderHand(); renderMarket(); renderFleetSummary(); renderTrade(); renderRelicRow(); renderOverflow();
  }

  function switchTab(name) {
    $$('.console-tab').forEach(tab=>{const active=tab.dataset.tab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    $$('.tab-panel').forEach(panel=>{const active=panel.dataset.panel===name;panel.classList.toggle('active',active);panel.hidden=!active;});
  }

  function positionSectorScan() {
    const panel=$('#sector-popover');
    if (!panel?.matches(':popover-open') || !state.selected) return;
    const hex=$(`.hex[data-coord="${state.selected}"]`);
    if (!hex) return;
    const vw=document.documentElement.clientWidth, vh=window.innerHeight, gap=12;
    panel.style.width=`${Math.min(370,vw-24)}px`;
    const rect=hex.getBoundingClientRect(), width=panel.offsetWidth, height=panel.offsetHeight;
    let left=rect.right+gap, top=rect.top;
    if (left+width>vw-gap) left=rect.left-width-gap;
    if (left<gap) { left=(vw-width)/2; top=rect.bottom+gap; if(top+height>vh-gap) top=rect.top-height-gap; }
    panel.style.left=`${Math.max(gap,Math.min(vw-width-gap,left))}px`;
    panel.style.top=`${Math.max(gap,Math.min(vh-height-gap,top))}px`;
  }

  function showSectorScan(keyboard=false) {
    const panel=$('#sector-popover');
    if (!panel.matches(':popover-open')) panel.showPopover();
    positionSectorScan();
    if (keyboard) $('#close-sector-scan').focus();
  }

  function wireUi() {
    $('#development-tools').hidden=!developmentMode;
    $('#reveal-entire-map').addEventListener('change',event=>{
      if (!developmentMode) return;
      revealEntireMap=event.target.checked;
      render();
    });
    for (const selector of ['#bank-give-type','#bank-get-type','#discard-resource-type']) {
      $(selector).innerHTML = RESOURCES.map(resource => `<option value="${resource}">${RESOURCE_NAMES[resource]}</option>`).join('');
      $(selector).addEventListener('change',renderResourceTools);
    }
    $('#bank-give-type').value = 'matter';
    $('#bank-get-type').value = 'data';
    $('#discard-resource-type').value = 'matter';
    $('#discard-resource-amount').addEventListener('input',renderResourceTools);
    $('#bank-trade-form').addEventListener('submit',event => {
      event.preventDefault();
      bankTrade(0,$('#bank-give-type').value,$('#bank-get-type').value);
    });
    $('#discard-resource-form').addEventListener('submit',event => {
      event.preventDefault();
      discardResources(0,$('#discard-resource-type').value,Number($('#discard-resource-amount').value));
    });
    window.addEventListener('resize',positionSectorScan);
    document.addEventListener('scroll',event=>{if(!$('#sector-popover').contains(event.target))positionSectorScan();},true);
    $('#open-map-key').addEventListener('click',()=>$('#map-key-dialog').showModal());
    $('#close-map-key').addEventListener('click',()=>$('#map-key-dialog').close());
    $('#map-zoom').addEventListener('click',()=>{
      const stage=$('.board-stage'); const zoomed=stage.classList.toggle('map-zoomed');
      $('#map-zoom').textContent=zoomed?'Fit map':'Zoom map';
      $('#map-zoom').setAttribute('aria-pressed',String(zoomed));
      if (zoomed) {
        const hex=$(`.hex[data-coord="${state.selected||state.clusters[0].center}"]`);
        const a=stage.getBoundingClientRect(), b=hex.getBoundingClientRect();
        stage.scrollLeft+=b.left-a.left-stage.clientWidth/2; stage.scrollTop+=b.top-a.top-stage.clientHeight/2;
      }
    });
    renderSymbolLegend();
    $('#undo-turn-button').addEventListener('click',undoLastTurn);
    $('#rules-button').addEventListener('click',()=>$('#rules-dialog').showModal());
    $('#close-rules').addEventListener('click',()=>$('#rules-dialog').close());
    $('#message-continue').addEventListener('click',()=>$('#message-dialog').close());
    $('#report-button').addEventListener('click',showReplayReport);
    $('#discard-button').addEventListener('click',()=>$('#discard-dialog').showModal());
    $('#close-discard').addEventListener('click',()=>$('#discard-dialog').close());
    $('#new-game-button').addEventListener('click',()=>{
      if (options.newTable) { options.newTable(); return; }
      if(!confirm('Start a new game and replace the current save?'))return;
      clearTurnHistory();
      state=newState(); fillMarket(); logEvent('The four factions entered the Reach.'); saveGame(); render(); beginRound();
    });
    $('#skip-colony-build').addEventListener('click',()=>finishColonyBuild(0));
    $('#construction-discount').addEventListener('change',event=>{state.actionOptions.discountResource=event.target.value;render();saveGame();});
    $('#finish-buy-button').addEventListener('click',finishHumanBuy);
    $('#pass-button').addEventListener('click',()=>passOperations(0));
    $('#open-relic-catalog').addEventListener('click',()=>{
      $('#relic-catalog-grid').innerHTML=Object.keys(RELIC_CARDS).map(key=>cardMarkup({key},'catalog')).join('');
      $('#relic-catalog-dialog').showModal();
    });
    $('#close-relic-catalog').addEventListener('click',()=>$('#relic-catalog-dialog').close());
    $('#upgrade-storage-button').addEventListener('click',()=>increaseStorage(0));
    $('#convert-all-button').addEventListener('click',convertAllResources);
    $('#trade-form').addEventListener('submit',submitTrade);
    const overflowDialog = $('#overflow-dialog');
    overflowDialog.addEventListener('cancel',event=>event.preventDefault());
    overflowDialog.addEventListener('close',renderOverflow);
    $('#overflow-form').addEventListener('submit',event=>{
      event.preventDefault();
      const amounts = Object.fromEntries(RESOURCES.map(resource=>[resource,Number($(`#overflow-${resource}`).value)]));
      const excess = totalResources(state.players[0]) - playerCapacity(0);
      if (RESOURCES.reduce((sum,resource)=>sum+amounts[resource],0) === excess) discardOverflow(0,amounts);
    });
    const consortiumDialog = $('#consortium-dialog');
    consortiumDialog.addEventListener('cancel',event=>event.preventDefault());
    consortiumDialog.addEventListener('close',()=>renderConsortium());
    for (const [selector,initial] of [['#consortium-give','matter'],['#consortium-get','data']]) {
      $(selector).innerHTML = RESOURCES.map(type=>`<option value="${type}">${RESOURCE_NAMES[type]}</option>`).join('');
      $(selector).value = initial;
      $(selector).addEventListener('change',renderConsortium);
    }
    $('#consortium-form').addEventListener('submit',event=>{event.preventDefault();consortiumExchange(0,$('#consortium-give').value,$('#consortium-get').value);});
    $('#consortium-cancel').addEventListener('click',()=>finishConsortium(0,true));
    $('#consortium-finish').addEventListener('click',()=>finishConsortium(0));
    const consoleTabs=$$('.console-tab');
    consoleTabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>switchTab(tab.dataset.tab));
      tab.addEventListener('keydown',event=>{
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
  }

  if (headless) {
    state = newState();
    fillMarket();
    beginRound();
    return createGalacticAdapter({
      get state() { return state; },
      clone, ALL_CARDS, BASIC_CARDS, BASIC_MARKET, RELIC_CARDS, STRUCTURES, SHIP_STATS, RESOURCES, STORAGE_UPGRADE, EXCAVATION_COST,
      canAfford, cardResources, resourceGainTotal, remainingResourceCapacity, addResources,
      removeHandCard, passOperations, completeAction, nextBuyPlayer, buyCard, upgradeStarter,
      decommission, excavatedRelicCount, useBuyEffect, resolveHumanSpecial,
      colonizePlanet, buildUpgrade, excavate, buildShip, getFleet, fleetCount,
      fleetGroup, fleetMove, fleetPower, reachableFrom, executeMove, nearestUnscannedRelicCluster,
      clusterKnown, clusterScanned, relicCoordInCluster, calculatePrestige, colonyPlanets,
      totalResources, playerCapacity, overflowPlayer, discardOverflow,
      canConsortiumGain, canConsortiumExchange, consortiumGain, consortiumExchange, finishConsortium,
      movementRange, constructionCost, constructAt, applyColonizeOrder, canColonyBuild, finishColonyBuild,
      canIncreaseStorage, increaseStorage, canManageResources, discardResources, canBankTrade, bankTrade,
      canOfferTrade, offerTrade, tradeResponseAllowed, tradeBlockReason, respondTrade, cancelTrade
    });
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

  wireUi();
  loadTurnHistory();
  if (!loadGame()) {
    if (options.requireSave) throw new Error("The saved table could not be loaded. Your server save has been preserved.");
    clearTurnHistory();
    state=newState();
    fillMarket();
    logEvent('The four factions entered the Reach.');
    saveGame();
    render();
    beginRound();
  } else {
    fillMarket();
    render();
    resumePendingChoice();
    if (state.phase === 'buy' && state.activePlayer === 0) switchTab('market');
    if (state.winner === null && state.activePlayer !== 0 && state.phase === 'operations') scheduleAiTurn('operations', runAiOperation, 650);
    if (state.winner === null && state.activePlayer !== 0 && state.phase === 'buy') scheduleAiTurn('buy', runAiBuy, 650);
  }
 }
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticReach;
else if (typeof document !== 'undefined' && !globalThis.drawingBoardTableBoot) createGalacticReach();
