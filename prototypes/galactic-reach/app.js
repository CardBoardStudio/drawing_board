// Browser UI and authoritative adapter share these exact rules.
'use strict';
function createGalacticReach(options = {}) {
  const headless = options.headless === true;
  const random = options.random || Math.random;
  const clearTimeout = headless ? () => {} : globalThis.clearTimeout.bind(globalThis);

  const SAVE_FORMAT_VERSION = 4;
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
      purpose: 'Power movement and fleets',
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
  const BOARD_RADIUS = 9;
  const VICTORY_TARGET = 10;
  const AWARD_PRESTIGE = { fleet: 2, reach: 1, occupation: 2 };
  const INFLUENCE_PER_PRESTIGE = 10;
  const CARDS_PER_PRESTIGE = 8;
  const AWARD_THRESHOLDS = { fleet: 8, reach: 3, occupation: 1 };
  const HOME_STARTS = [
    { cluster: 0, owner: 0, colonySector: 0, shipyardSector: 1 },
    { cluster: 1, owner: 1, colonySector: 0, shipyardSector: 6 },
    { cluster: 2, owner: 2, colonySector: 0, shipyardSector: 4 },
    { cluster: 3, owner: 3, colonySector: 0, shipyardSector: 3 }
  ];
  const HOME_CLUSTER_OWNERS = HOME_STARTS.map(({ cluster, owner }) => [cluster, owner]);
  const RELIC_SECTORS = [[4,2],[5,5],[6,1],[7,4],[8,6],[9,3]];
  const TRACKS = {
    expansion: { name: 'Expansionist', short: 'EXP', detail: '+1 per ship or structure built' },
    culture: { name: 'Culture', short: 'CUL', detail: '+1 per accepted player trade' },
    economy: { name: 'Economy', short: 'ECO', detail: '+1 per card purchased' },
    technology: { name: 'Technology', short: 'TEC', detail: '+1 per starter card upgraded' }
  };
  const SHIP_STATS = {
    scout: { name: 'Scout', move: 3, power: 1, hull: 1, cost: { matter: 1, energy: 1 } },
    researcher: { name: 'Researcher', move: 1, power: 0, hull: 1, civilian: true, cost: { energy: 1, data: 2 } },
    frigate: { name: 'Frigate', move: 2, power: 2, hull: 2, cost: { matter: 2, energy: 1, biomass: 1 } },
    dreadnought: { name: 'Dreadnought', move: 1, power: 4, hull: 3, cost: { matter: 3, energy: 2, biomass: 1, data: 1 } }
  };
  const MILITARY_CARDS = {
    concentratedFire: { name: 'Concentrated Fire', attack: 1, shield: 0, text: '+1 hit.' },
    defensiveScreen: { name: 'Defensive Screen', attack: 0, shield: 2, text: 'Prevent 2 hits.' },
    flankingRun: { name: 'Flanking Run', attack: 1, shield: 0, tag: 'light', text: '+2 hits with a surviving Scout or Frigate; otherwise +1.' },
    heavyBarrage: { name: 'Heavy Barrage', attack: 1, shield: 0, tag: 'heavy', text: '+2 hits with a surviving Dreadnought or Shipyard; otherwise +1.' },
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
    warehouse: { name: 'Warehouse', code: 'W', cost: { matter: 2, energy: 1, data: 1 }, upgradeCost: { matter: 2, data: 2 } },
    research: { name: 'Research Station', code: 'R', cost: { matter: 1, energy: 1, data: 2 }, upgradeCost: { energy: 2, data: 3 } }
  };
  const LEGEND_TOOLTIPS = {
    scout: 'Fast explorer. Moves up to 3 hexes, has 1 combat power, reveals worlds by entering them, and is required to colonize.',
    researcher: 'Slow civilian unit. Moves 1 hex and builds a Research Station when it reaches a probe-marked relic.',
    frigate: 'Balanced warship with 2 combat power and 2 hull.',
    dreadnought: 'Heavy warship with 4 combat power and 3 hull.',
    colony: 'Claims a seven-hex world. Colonies must occupy the world’s center hex.',
    harvester: 'Adds 1 resource to this planet’s production.',
    starbase: 'Commissions ships and contributes 3–4 defensive combat power.',
    warehouse: 'Raises your resource storage capacity by 5 per level.',
    research: 'Built by a Researcher on a Rosetta Stone. Three stations unlock Relic exchanges.'
  };
  const BASIC_TOOLTIPS = {
    colonize: 'Use a Scout on the center hex of an eligible world to found or capture its Colony.',
    construct: 'Build one structure on any empty planet hex adjacent to your Colony, upgrade one building, or commission one ship at a Shipyard.',
    move: 'Move ships or Researchers up to the selected group’s speed.',
    probe: 'Locate one alien relic. Its exact coordinate is marked, but the surrounding world remains unknown.'
  };
  const BOARD_ICONS = {
    scout: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>',
    researcher: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"></circle><path d="M4 21v-3a5 5 0 0 1 10 0v3"></path><path d="m15 11 2 2 4-5"></path></svg>',
    frigate: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"></path><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"></path></svg>',
    dreadnought: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>',
    colony: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
    harvester: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"></path><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"></path><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"></path><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"></path></svg>',
    starbase: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"></path><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"></path><circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="5" cy="19" r="2"></circle></svg>',
    warehouse: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path><path d="M12 22V12"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><path d="m7.5 4.27 9 5.15"></path></svg>',
    research: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v7M12 15v7M2 12h7M15 12h7"></path><path d="m5 5 5 5m4 4 5 5m0-14-5 5m-4 4-5 5"></path></svg>'
  };
  const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

  const BASIC_CARDS = {
    colonize: { name: 'Colonize', kind: 'Basic', accent: 'var(--biomass)', resource: { biomass: 1 }, order: 'colonize', text: 'Establish a Colony with a Scout on a world’s center hex.' , cost: { biomass: 1, data: 1 } },
    construct: { name: 'Construct', kind: 'Basic', accent: 'var(--matter)', resource: { matter: 1 }, order: 'construct', text: 'Build on any empty planet hex adjacent to your Colony, upgrade a building, or commission one ship.', cost: { matter: 1, data: 1 } },
    move: { name: 'Move', kind: 'Basic', accent: 'var(--energy)', resource: { energy: 1 }, order: 'move', text: 'Move one ship group or Researcher team at its own speed.', cost: { energy: 1, data: 1 } },
    probe: { name: 'Probe', kind: 'Basic', accent: 'var(--data)', resource: { data: 1 }, order: 'probe', text: 'Locate one alien relic without revealing its surrounding world.', cost: { energy: 1, data: 1 } }
  };

  const ADVANCED_CARDS = {
    surveyDrones: { name: 'Survey Drones', kind: 'Exploration', accent: 'var(--data)', resource: { data: 2 }, order: 'move', tag: 'scoutBoost', text: 'Move Scouts up to 3; scout at an unclaimed planet filters a card.', cost: { energy: 1, data: 1 } },
    pathfinderNetwork: { name: 'Pathfinder Network', kind: 'Exploration', accent: 'var(--energy)', resource: { energy: 1, biomass: 1 }, order: 'move', tag: 'pathfinder', text: 'Move a fleet with +1 range; it cannot initiate combat.', cost: { energy: 1, biomass: 1, data: 1 } },
    dropColonyModules: { name: 'Drop Colony Modules', kind: 'Expansion', accent: 'var(--biomass)', resource: { biomass: 2 }, order: 'colonize', tag: 'dropColony', text: 'Colonize for 1 less Biomass without consuming the Scout.', cost: { matter: 1, biomass: 2, data: 1 } },
    gateSynchronization: { name: 'Gate Synchronization', kind: 'Exploration', accent: 'var(--energy)', resource: { energy: 2 }, order: 'move', tag: 'gateMove', text: 'Move between Gates, then one additional hex.', cost: { energy: 2, data: 2 } },
    modularConstruction: { name: 'Modular Construction', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 2 }, order: 'construct', tag: 'doubleBuild', text: 'Build upgrades on two different planets; second costs 1 less Matter.', cost: { matter: 2, energy: 1, data: 1 } },
    industrialSurge: { name: 'Industrial Surge', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 1, energy: 1 }, order: 'special', tag: 'surge', text: 'Produce up to three controlled planets in one cluster; ignore Harvesters.', cost: { matter: 2, energy: 2, biomass: 1 } },
    orbitalShipyards: { name: 'Orbital Shipyards', kind: 'Industry', accent: 'var(--matter)', resource: { matter: 2 }, order: 'construct', tag: 'doubleShip', text: 'Commission up to two ships at one Shipyard; second costs 1 less Energy.', cost: { matter: 2, energy: 1, biomass: 1, data: 1 } },
    terraformingProtocols: { name: 'Terraforming Protocols', kind: 'Industry', accent: 'var(--biomass)', resource: { biomass: 2 }, order: 'special', tag: 'terraform', text: 'Pay 2 Biomass to make a controlled planet Rich.', cost: { matter: 2, energy: 1, biomass: 2, data: 1 } },
    tradeConsortium: { name: 'Trade Consortium', kind: 'Commerce', accent: 'var(--gold)', resource: { data: 1 }, wildcard: 1, order: 'special', tag: 'bankTrade', text: 'Gain any resource, or exchange with the bank at 2:1 twice.', cost: { matter: 1, energy: 1, biomass: 1, data: 1 } },
    fleetOverdrive: { name: 'Fleet Overdrive', kind: 'Military', accent: 'var(--energy)', resource: { energy: 2 }, order: 'move', tag: 'overdrive', text: 'Move a fleet with +2 range; an initiated battle cannot be retreated from early.', cost: { matter: 1, energy: 2 } },
    targetingAlgorithms: { name: 'Targeting Algorithms', kind: 'Reaction', accent: 'var(--data)', resource: { data: 2 }, reaction: 'targeting', text: 'Automatically add 1 hit to your next combat volley.', cost: { energy: 1, data: 2 } },
    ablativePlating: { name: 'Ablative Plating', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 2 }, reaction: 'prevent', text: 'Automatically prevent up to two hits in your next combat.', cost: { matter: 2, biomass: 1 } },
    emergencyJump: { name: 'Emergency Jump', kind: 'Reaction', accent: 'var(--energy)', resource: { energy: 1, data: 1 }, reaction: 'jump', text: 'Automatically retreat from a disastrous volley after suffering one hit.', cost: { energy: 2, data: 1 } },
    coordinatedAssault: { name: 'Coordinated Assault', kind: 'Military', accent: 'var(--red)', resource: { matter: 1, energy: 1 }, order: 'move', tag: 'assault', text: 'Move to attack with +1 hit in the first combat volley.', cost: { matter: 1, energy: 1, biomass: 1, data: 1 } },
    salvageCrews: { name: 'Salvage Crews', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 1, data: 1 }, reaction: 'salvage', text: 'After a battle, gain Matter for destroyed ships, maximum 3.', cost: { matter: 2, biomass: 1, data: 1 } },
    tacticalForesight: { name: 'Tactical Foresight', kind: 'Tactics', accent: 'var(--data)', resource: { data: 2 }, order: 'special', tag: 'foresight', text: 'Draw three cards, keep two, discard one.', cost: { energy: 1, data: 2 } },
    dataBrokerage: { name: 'Data Brokerage', kind: 'Deckcraft', accent: 'var(--data)', resource: { biomass: 1, data: 1 }, order: 'special', tag: 'brokerage', text: 'Trash one card from hand or discard, then draw two.', cost: { biomass: 1, data: 2 } },
    procurementNetwork: { name: 'Procurement Network', kind: 'Buy', accent: 'var(--gold)', resource: { data: 2 }, buyEffect: 'procurement', text: 'Buy up to two cards this Buy phase; second costs 1 less resource.', cost: { matter: 1, biomass: 1, data: 2 } },
    marketManipulation: { name: 'Market Manipulation', kind: 'Buy', accent: 'var(--gold)', resource: { energy: 1, data: 1 }, buyEffect: 'manipulation', text: 'Refresh up to two market cards; your next purchase costs 1 less Data.', cost: { energy: 1, biomass: 1, data: 2 } },
    commandUplink: { name: 'Command Uplink', kind: 'Tactics', accent: 'var(--data)', resource: { energy: 1, data: 1 }, order: 'special', tag: 'uplink', text: 'Return a basic order from discard to hand and play it immediately.', cost: { energy: 2, biomass: 1, data: 2 } }
  };

  const RELIC_CARDS = {
    foldEngine: { name: 'Fold Engine', kind: 'Alien Relic', accent: 'var(--gold)', resource: { energy: 3 }, order: 'move', tag: 'overdrive', text: 'Move with +2 range and commit fully to combat.' },
    precursorForge: { name: 'Precursor Forge', kind: 'Alien Relic', accent: 'var(--gold)', resource: { matter: 2, data: 2 }, order: 'construct', tag: 'doubleBuild', text: 'Build with a Matter discount from alien fabrication patterns.' },
    livingArchive: { name: 'Living Archive', kind: 'Alien Relic', accent: 'var(--gold)', resource: { biomass: 2, data: 2 }, order: 'special', tag: 'foresight', text: 'Draw three cards, keep two, and discard one.' }
  };
  const ALL_CARDS = { ...BASIC_CARDS, ...ADVANCED_CARDS, ...RELIC_CARDS };

  const DIRECTIVES = {
    expansion: { name: 'Frontier Mobilization', primary: { matter: 2, biomass: 1 }, secondary: { matter: 1 }, text: 'Stockpile materials for expansion.' },
    culture: { name: 'Cultural Exchange', primary: { biomass: 1, data: 2 }, secondary: { data: 1 }, text: 'Circulate knowledge through every faction.' },
    economy: { name: 'Commercial Stimulus', primary: { matter: 1, energy: 1, data: 1 }, secondary: { energy: 1 }, text: 'Inject flexible capital into the market.' },
    technology: { name: 'Research Initiative', primary: { data: 3 }, secondary: { data: 1 }, text: 'Accelerate every faction’s research.' }
  };

  const POLICY_PAIRS = [
    [
      { id: 'frontier_grants', name: 'Frontier Grants', track: 'expansion', text: 'Each faction’s first build each round costs 1 less Matter.' },
      { id: 'open_exchange', name: 'Open Exchange', track: 'culture', text: 'Accepted trades grant both parties 1 Data.' }
    ],
    [
      { id: 'market_stimulus', name: 'Market Stimulus', track: 'economy', text: 'Each faction’s first card purchase each round costs 1 less Data.' },
      { id: 'research_mandate', name: 'Research Mandate', track: 'technology', text: 'Upgrading a starter card gains 2 Technology instead of 1.' }
    ]
  ];
  let cardSerial = 1;
  let state;
  let aiTimer = null;
  let turnHistory = { pending: null, undo: null };

  const $ = (selector) => document.querySelector(selector);
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

  function generateGalaxy() {
    const centers = [[-8,0],[0,-8],[8,0],[0,8],[0,0],[-4,0],[4,0],[0,-4],[0,4],[-4,4],[4,-4]];
    const names = ['Asterion','Borealis','Cygnus','Draco','Erebus','Fornax','Gemini','Helios','Icarus','Juno','Kepler'];
    const homes = new Map(HOME_CLUSTER_OWNERS);
    const specials = new Map([[5,'rich'],[6,'gate'],[7,'rich'],[8,'gate'],[10,'rich']]);
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
      if (homeStart && types[homeStart.shipyardSector] !== 'energy') {
        const energySector = types.findIndex((type,index) => type === 'energy' && index !== homeStart.colonySector);
        [types[homeStart.shipyardSector],types[energySector]] = [types[energySector],types[homeStart.shipyardSector]];
      }
      clusters.push({
        id: clusterIndex, name: names[clusterIndex], center: coordKey(q,r),
        coords: coords.map(([cq,cr]) => coordKey(cq,cr)),
        scannedBy: homeOwner === null ? [] : [0,1,2,3], revealedBy: homeOwner === null ? [] : [0,1,2,3]
      });
      coords.forEach(([cq,cr], planetIndex) => {
        const isHomeColony = Boolean(homeStart && planetIndex === homeStart.colonySector);
        const isHomeShipyard = Boolean(homeStart && planetIndex === homeStart.shipyardSector);
        const owner = isHomeColony || isHomeShipyard ? homeOwner : null;
        const type = types[planetIndex];
        planets[coordKey(cq,cr)] = {
          q: cq, r: cr, cluster: clusterIndex, name: `${names[clusterIndex]} ${numerals[planetIndex]}`,
          type, special: relicSectors.get(clusterIndex) === planetIndex ? 'relic' : planetIndex === 0 ? specials.get(clusterIndex) || null : null,
          owner, originalFounder: isHomeColony ? owner : null, hasColony: isHomeColony,
          upgrade: isHomeShipyard ? 'starbase' : null, upgradeLevel: isHomeShipyard ? 1 : 0, rich: specials.get(clusterIndex) === 'rich' && planetIndex === 0,
          relicClaimed: false, researchStationOwner: null, occupiedBy: null, conquest: owner !== null ? false : null
        };
      });
    });
    return { planets, clusters, homes };
  }

  function createPlayer(index) {
    const deck = [];
    for (let i = 0; i < 2; i += 1) deck.push(makeCard('colonize',true), makeCard('construct',true), makeCard('move',true), makeCard('probe',true));
    deck.push(makeCard('move',true), makeCard('construct',true));
    return {
      id: index, name: PLAYER_NAMES[index], color: PLAYER_COLORS[index], strategy: PLAYER_STRATEGIES[index],
      resources: { matter: 0, energy: 0, biomass: 2, data: 0 }, deck: shuffled(deck), discard: [], hand: [],
      militaryDeck: createMilitaryDeck(), militaryDiscard: [],
      relics: 0, cardsPurchased: 0, passed: false, tradeUsed: false, bought: 0, buyLimit: 1, decommissioned: false,
      buyDiscountData: 0, marketManipulated: false, buyStartDiscardIds: [], combatBonus: 0,
      tracks: { expansion: 0, culture: 0, economy: 0, technology: 0 }, tradesWith: [0,0,0,0], policyBuildDiscountUsed: false
    };
  }

  function newState() {
    cardSerial = 1;
    const galaxy = generateGalaxy();
    const players = [0,1,2,3].map(createPlayer);
    const fleets = {};
    HOME_STARTS.forEach(({ cluster: clusterIndex, owner: player, shipyardSector }) => {
      const starbaseCoord = galaxy.clusters[clusterIndex].coords[shipyardSector];
      fleets[starbaseCoord] = fleets[starbaseCoord] || {};
      fleets[starbaseCoord][player] = { scout: 1, researcher: 0, frigate: 0, dreadnought: 0 };
    });
    const advancedDeck = shuffled(Object.keys(ADVANCED_CARDS).flatMap(key => [makeCard(key), makeCard(key)]));
    return {
      version: SAVE_FORMAT_VERSION, round: 1, phase: 'production', firstPlayer: 0, activePlayer: 0, players,
      planets: galaxy.planets, clusters: galaxy.clusters, fleets, advancedDeck, market: [], marketDiscard: [],
      selected: null, actionMode: null, actionCardId: null, actionOptions: {}, moveSource: null, reachable: [],
      turnStage: 'waiting', log: [], awards: { fleet: null, reach: null, occupation: null }, winner: null,
      lastCombat: null, relicDeck: shuffled(Object.keys(RELIC_CARDS).flatMap(key => [makeCard(key),makeCard(key),makeCard(key)])), activePolicy: null, policyCycle: 0, pendingCleanup: false,
      visibilityRevision: 2, rulesRevision: 9
    };
  }

  function saveGame() {
    if (headless) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function saveTurnHistory() {
    if (headless) return;
    try { localStorage.setItem(TURN_HISTORY_KEY, JSON.stringify(turnHistory)); } catch (_) {}
  }

  function loadTurnHistory() {
    try {
      const raw = localStorage.getItem(TURN_HISTORY_KEY);
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
    try { localStorage.removeItem(TURN_HISTORY_KEY); } catch (_) {}
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
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_FORMAT_VERSION) return false;
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
      if ((state.rulesRevision || 0) < 3) {
        Object.values(state.fleets).forEach(group => Object.values(group).forEach(fleet => { if (fleet.researcher === undefined) fleet.researcher = 0; }));
        Object.values(state.planets).forEach(planet => { if (planet.researchStationOwner === undefined) planet.researchStationOwner = null; });
        RELIC_SECTORS.forEach(([clusterIndex, sectorIndex]) => {
          const coord = state.clusters[clusterIndex]?.coords?.[sectorIndex];
          if (coord && state.planets[coord]) state.planets[coord].special = 'relic';
        });
        Object.values(state.planets).forEach(planet => {
          if (planet.upgrade === 'research') {
            planet.researchStationOwner = planet.owner;
            planet.upgrade = null;
            planet.upgradeLevel = 0;
          }
        });
        while ((state.relicDeck?.length || 0) < 6) Object.keys(RELIC_CARDS).forEach(key => state.relicDeck.push(makeCard(key)));
        state.relicDeck = shuffled(state.relicDeck);
        state.rulesRevision = 3;
        clearTurnHistory();
        saveGame();
      }
      if ((state.rulesRevision || 0) < 4) {
        state.players.forEach(player => {
          player.militaryDeck = createMilitaryDeck();
          player.militaryDiscard = [];
        });
        state.rulesRevision = 4;
        clearTurnHistory();
        saveGame();
      }
      if ((state.rulesRevision || 0) < 7) {
        HOME_STARTS.forEach(start => {
          const coords = state.clusters[start.cluster]?.coords || [];
          const shipyardCoord = coords[start.shipyardSector];
          if (!shipyardCoord || state.planets[shipyardCoord]?.type === 'energy') return;
          const energyCoord = coords.find((coord,index) => index !== start.colonySector && state.planets[coord]?.type === 'energy');
          if (!energyCoord) return;
          [state.planets[shipyardCoord].type,state.planets[energyCoord].type] = [state.planets[energyCoord].type,state.planets[shipyardCoord].type];
        });
        state.rulesRevision = 7;
        clearTurnHistory();
        saveGame();
      }
      if ((state.rulesRevision || 0) < 8) {
        state.players.forEach(player => { if (!Number.isFinite(player.cardsPurchased)) player.cardsPurchased = 0; });
        state.rulesRevision = 8;
        clearTurnHistory();
        saveGame();
      }
      if ((state.rulesRevision || 0) < 9) {
        const trimmed = state.players.map((_,playerId) => trimResourcesToCapacity(playerId));
        const removed = trimmed.reduce((sum,value) => sum + value,0);
        state.rulesRevision = 9;
        if (removed) logEvent(`Storage limits restored; ${removed} excess resource${removed === 1 ? '' : 's'} were removed.`);
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
    state.fleets[coord][player] = state.fleets[coord][player] || { scout: 0, researcher: 0, frigate: 0, dreadnought: 0 };
    if (state.fleets[coord][player].researcher === undefined) state.fleets[coord][player].researcher = 0;
    return state.fleets[coord][player];
  }

  function fleetCount(fleet) {
    return fleet ? (fleet.scout || 0) + (fleet.researcher || 0) + (fleet.frigate || 0) + (fleet.dreadnought || 0) : 0;
  }

  function fleetPower(fleet) {
    return fleet ? (fleet.scout || 0) + (fleet.frigate || 0) * 2 + (fleet.dreadnought || 0) * 4 : 0;
  }

  function fleetMove(fleet) {
    if (!fleet || !fleetCount(fleet)) return 0;
    if (fleet.researcher) return 1;
    if (fleet.dreadnought) return 1;
    if (fleet.frigate) return 2;
    return 3;
  }

  function combatShipCount(fleet) {
    return fleet ? (fleet.scout || 0) + (fleet.frigate || 0) + (fleet.dreadnought || 0) : 0;
  }

  function fleetControllersAt(coord) {
    return Object.entries(state.fleets[coord] || {})
      .filter(([,fleet]) => combatShipCount(fleet) > 0)
      .map(([playerId]) => Number(playerId));
  }

  function ownerProductionAmount(planet) {
    return 1 + (planet.rich ? 1 : 0) + (planet.upgrade === 'harvester' ? (planet.upgradeLevel || 1) : 0);
  }

  function fleetGroup(fleet, group = 'all') {
    if (!fleet) return null;
    if (group === 'researcher') return { scout: 0, researcher: fleet.researcher || 0, frigate: 0, dreadnought: 0 };
    if (group === 'ships') return { scout: fleet.scout || 0, researcher: 0, frigate: fleet.frigate || 0, dreadnought: fleet.dreadnought || 0 };
    return clone(fleet);
  }

  function formatFleet(fleet) {
    if (!fleet || !fleetCount(fleet)) return 'No ships';
    const parts = [];
    if (fleet.scout) parts.push(`${fleet.scout} Scout${fleet.scout === 1 ? '' : 's'}`);
    if (fleet.researcher) parts.push(`${fleet.researcher} Researcher${fleet.researcher === 1 ? '' : 's'}`);
    if (fleet.frigate) parts.push(`${fleet.frigate} Frigate${fleet.frigate === 1 ? '' : 's'}`);
    if (fleet.dreadnought) parts.push(`${fleet.dreadnought} Dreadnought${fleet.dreadnought === 1 ? '' : 's'}`);
    return parts.join(', ');
  }

  function playerCapacity(playerId) {
    const warehouseLevels = Object.values(state.planets).filter(p => p.owner === playerId && p.upgrade === 'warehouse' && p.occupiedBy === null).reduce((sum,p)=>sum+(p.upgradeLevel||1),0);
    return 10 + warehouseLevels * 5;
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
    const playerId = state.players.indexOf(player);
    let available = playerId >= 0 ? Math.max(0, playerCapacity(playerId) - totalResources(player)) : Infinity;
    const result = { added: {}, lost: {}, totalAdded: 0, totalLost: 0 };
    RESOURCES.forEach(resource => {
      const requested = Math.max(0, Number(gain?.[resource]) || 0);
      const added = Math.min(requested, available);
      const lost = requested - added;
      if (added) player.resources[resource] += added;
      if (added) result.added[resource] = added;
      if (lost) result.lost[resource] = lost;
      result.totalAdded += added;
      result.totalLost += lost;
      available -= added;
    });
    return result;
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
    return Boolean(planet && state.clusters[planet.cluster]?.center === coord);
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
      logEvent(`${state.players[playerId].name} explored the seven sectors of ${cluster.name}.`);
    }
  }

  function adjacentKeys(key) {
    const [q,r] = parseCoord(key);
    return DIRECTIONS.map(([dq,dr]) => coordKey(q+dq,r+dr)).filter(k => boardHas(k));
  }

  function movementNeighbors(key) {
    const neighbors = adjacentKeys(key);
    if (state.planets[key]?.special === 'gate') {
      Object.entries(state.planets).forEach(([other,planet]) => {
        if (other !== key && planet.special === 'gate') neighbors.push(other);
      });
    }
    return [...new Set(neighbors)];
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
    return Boolean(planet && (planet.hasColony || planet.upgrade || planet.researchStationOwner !== null));
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
    if (!planet || planet.occupiedBy !== null) return false;
    return (planet.owner === playerId && !hasBuilding(planet)) || canClaimStructureHex(playerId,coord);
  }

  function clusterCount(playerId) {
    return new Set(controlledPlanets(playerId).map(([,p]) => p.cluster)).size;
  }

  function conquestCount(playerId) {
    return controlledPlanets(playerId).filter(([,p]) => p.conquest).length;
  }

  function strongestFleet(playerId) {
    let best = 0;
    Object.values(state.fleets).forEach(group => { best = Math.max(best, fleetPower(group[playerId])); });
    return best;
  }

  function calculatePrestige(playerId) {
    const colonies = colonyPlanets(playerId).length;
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase').length;
    const relics = state.players[playerId].relics;
    const awards = Object.entries(state.awards).reduce((sum,[key,owner]) => sum + (owner === playerId ? AWARD_PRESTIGE[key] : 0),0);
    const frontierPrestige = Math.floor(Math.max(0,colonies - 1) / 2);
    return colonies + frontierPrestige + Math.floor(starbases / 2) + relics + awards + influencePrestige(playerId) + deckPrestige(playerId);
  }

  function influencePrestige(playerId) {
    const influence = Object.values(state.players[playerId].tracks).reduce((sum,value) => sum + value,0);
    return Math.floor(influence / INFLUENCE_PER_PRESTIGE);
  }

  function deckPrestige(playerId) {
    return Math.floor((state.players[playerId].cardsPurchased || 0) / CARDS_PER_PRESTIGE);
  }

  function researchStationCount(playerId) {
    return Object.values(state.planets).filter(planet => planet.researchStationOwner === playerId).length;
  }

  function homeCoord(playerId) {
    const start = HOME_STARTS.find(({ owner }) => owner === playerId);
    return start ? state.clusters[start.cluster].coords[start.colonySector] : null;
  }

  function canLaunchResearcher(playerId, coord) {
    const planet = state.planets[coord];
    if (!planet || planet.owner !== playerId || planet.occupiedBy !== null) return false;
    return coord === homeCoord(playerId) || (planet.upgradeLevel || 0) >= 2;
  }

  function updateAward(key, values, threshold) {
    const top = Math.max(...values);
    if (top < threshold) { state.awards[key] = null; return; }
    const leaders = values.map((value,index) => value === top ? index : -1).filter(index => index >= 0);
    if (leaders.length === 1) state.awards[key] = leaders[0];
    else if (!leaders.includes(state.awards[key])) state.awards[key] = null;
  }

  function evaluateAwards() {
    updateAward('fleet', state.players.map((_,i) => strongestFleet(i)), AWARD_THRESHOLDS.fleet);
    updateAward('reach', state.players.map((_,i) => clusterCount(i)), AWARD_THRESHOLDS.reach);
    updateAward('occupation', state.players.map((_,i) => conquestCount(i)), AWARD_THRESHOLDS.occupation);
  }

  function produceAll() {
    const gains = state.players.map(()=>({ matter: 0, energy: 0, biomass: 0, data: 0 }));
    state.players.forEach((player, playerId) => {
      controlledPlanets(playerId).forEach(([,planet]) => {
        if (planet.occupiedBy !== null) return;
        gains[playerId][planet.type] += ownerProductionAmount(planet);
      });
    });
    Object.entries(state.planets).forEach(([coord,planet]) => {
      fleetControllersAt(coord).forEach(playerId => {
        gains[playerId][planet.type] += 1;
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
      player.decommissioned = false;
      player.buyDiscountData = 0;
      player.marketManipulated = false;
      player.buyStartDiscardIds = [];
      player.combatBonus = 0;
      player.policyBuildDiscountUsed = false;
      if (state.activePolicy?.id === 'market_stimulus') player.buyDiscountData = 1;
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
      startBuyPhase();
      return;
    }
    let guard = 0;
    while (state.players[state.activePlayer].passed && guard < 4) {
      state.activePlayer = (state.activePlayer + 1) % 4;
      guard += 1;
    }
    state.turnStage = state.activePlayer === 0 ? 'prep' : 'ai';
    if (state.activePlayer === 0) captureHumanTurn(`Operations turn in Round ${state.round}`);
    render();
    saveGame();
    if (state.activePlayer !== 0) scheduleAiTurn('operations', runAiOperation, 650);
  }

  function scheduleAiTurn(phase, action, delay) {
    if (headless) return;
    clearTimeout(aiTimer);
    const expectedPlayer = state.activePlayer;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (state.phase !== phase || state.activePlayer !== expectedPlayer || state.winner !== null) return;
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

  function finishHumanPrep() {
    if (state.phase !== 'operations' || state.activePlayer !== 0 || state.turnStage !== 'prep') return;
    state.turnStage = 'action';
    render();
  }

  function passOperations(playerId) {
    if (state.phase !== 'operations' || state.activePlayer !== playerId) return false;
    const player = state.players[playerId];
    if (!player || player.passed) return false;
    if (playerId === 0) completeHumanTurn();
    player.passed = true;
    logEvent(`${player.name} passed for the rest of Operations.`);
    if (playerId === 0) toast('You passed. Remaining rivals will continue until they pass.');
    nextOperationsPlayer();
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
    if (playerId === 0) completeHumanTurn();
    if (message) logEvent(message);
    clearAction();
    if (playerId === 0) state.turnStage = 'waiting';
    saveGame();
    nextOperationsPlayer();
  }

  function playResourceMode(cardId) {
    const player = state.players[0];
    if (state.phase !== 'operations' || state.activePlayer !== 0 || !['prep','action'].includes(state.turnStage)) return;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    const definition = ALL_CARDS[card.key];
    const gain = cardResources(card);
    if (definition.wildcard) gain.data = (gain.data || 0) + definition.wildcard;
    const requiredStorage = resourceGainTotal(gain);
    if (remainingResourceCapacity(0) < requiredStorage) {
      toast(`You need ${requiredStorage} open storage to convert that card.`);
      return;
    }
    const canceledSelectedOrder = state.actionCardId === cardId;
    if (canceledSelectedOrder) clearAction();
    addResources(player, gain);
    removeHandCard(player, cardId);
    logEvent(`You converted ${definition.name} into resources.${canceledSelectedOrder ? ' Its selected order was canceled.' : ''}`);
    if (canceledSelectedOrder) toast('Order canceled and card converted to resources.');
    render();
    saveGame();
  }

  function playOrder(cardId) {
    const player = state.players[0];
    if (state.phase !== 'operations' || state.activePlayer !== 0 || state.turnStage !== 'action') return;
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
    if (definition.order === 'probe') {
      const cluster = nearestUnscannedRelicCluster(0);
      if (!cluster) { toast('Your probes have already located every alien relic signal.'); return; }
      cluster.scannedBy.push(0);
      removeHandCard(player,cardId);
      completeAction(0,`Your Probe pinpointed an alien relic in the ${cluster.name} region. The surrounding world remains unknown.`);
      return;
    }
    if (definition.order === 'special') {
      resolveHumanSpecial(card, definition);
      return;
    }
    state.actionMode = definition.order;
    state.actionCardId = cardId;
    state.actionOptions = { tag: definition.tag || null, cardName: definition.name };
    state.moveSource = null;
    state.reachable = [];
    toast(definition.order === 'move' ? 'Select one of your fleets or Researcher teams.' : definition.order === 'construct' ? 'Select an empty planet hex adjacent to your Colony, an existing structure, or a relic occupied by your Researcher.' : 'Select an eligible planet containing your Scout.');
    render();
  }

  function hexDistance(a,b) {
    const [aq,ar]=parseCoord(a); const [bq,br]=parseCoord(b);
    return (Math.abs(aq-bq)+Math.abs(ar-br)+Math.abs((aq+ar)-(bq+br)))/2;
  }

  function relicCoordInCluster(cluster) {
    return cluster?.coords.find(coord => state.planets[coord]?.special === 'relic') || null;
  }

  function nearestUnscannedRelicCluster(playerId) {
    const origins=[...new Set([
      ...controlledPlanets(playerId).map(([coord])=>coord),
      ...Object.entries(state.fleets).filter(([,group])=>fleetCount(group[playerId])).map(([coord])=>coord)
    ])];
    return state.clusters.filter(cluster=>relicCoordInCluster(cluster)&&!clusterScanned(cluster,playerId)).sort((a,b)=>{
      const da=Math.min(...origins.map(origin=>hexDistance(origin,relicCoordInCluster(a))));
      const db=Math.min(...origins.map(origin=>hexDistance(origin,relicCoordInCluster(b))));
      return da-db||a.id-b.id;
    })[0]||null;
  }

  function resolveHumanSpecial(card, definition, playerId = 0) {
    const player = state.players[playerId];
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
      const trashTarget = player.discard.find(c => BASIC_CARDS[c.key] && !c.starter);
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
      const abundant = [...RESOURCES].sort((a,b) => player.resources[b] - player.resources[a])[0];
      const scarce = [...RESOURCES].sort((a,b) => player.resources[a] - player.resources[b])[0];
      if (player.resources[abundant] >= 2) {
        player.resources[abundant] -= 2;
        addResources(player,{ [scarce]: 1 });
      } else {
        addResources(player,{ data: 1 });
      }
      removeHandCard(player, card.id);
      completeAction(playerId, 'You used the Trade Consortium network.');
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
      if ((fleet.researcher || 0) > 0 && combatShipCount(fleet) > 0) {
        state.moveChoiceSource = key;
        toast('Choose whether this Move sends the ships or the slower Researcher team.');
        return;
      }
      prepareHumanMove(key,(fleet.researcher || 0) > 0 ? 'researcher' : 'ships');
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
    let range = fleetMove(moving);
    if (state.actionOptions.tag === 'overdrive') range += 2;
    if (state.actionOptions.tag === 'pathfinder') range += 1;
    state.reachable = reachableFrom(key,0,range,state.actionOptions.tag === 'pathfinder',moving);
    toast(group === 'researcher' ? 'Researcher teams move 1 hex. Select a highlighted destination.' : 'Scouts explore up to 3 hexes. Select a highlighted destination.');
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
    if (sourceSnapshot.scout) revealClusterAt(destination,playerId);
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
    if (card.tag === 'light' && alive.some(piece => piece.type === 'scout' || piece.type === 'frigate')) attack += 1;
    if (card.tag === 'heavy' && alive.some(piece => piece.type === 'dreadnought' || piece.type === 'starbase')) attack += 1;
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

  function applyCombatHits(pieces, hits) {
    const order = { researcher:-1, scout:0, frigate:1, starbase:2, dreadnought:3 };
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
    fleet.scout = pieces.filter(p => p.type === 'scout' && p.damage < p.hull).length;
    fleet.researcher = pieces.filter(p => p.type === 'researcher' && p.damage < p.hull).length;
    fleet.frigate = pieces.filter(p => p.type === 'frigate' && p.damage < p.hull).length;
    fleet.dreadnought = pieces.filter(p => p.type === 'dreadnought' && p.damage < p.hull).length;
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
      const attackerTargeting = useReaction(attackerId,'targeting') ? 1 : 0;
      const defenderTargeting = useReaction(defenderId,'targeting') ? 1 : 0;
      const attackHits = baseCombatHits(attackerPieces) + tacticAttack(attackerTactic,attackerPieces) + attackerTargeting + (volley === 0 && options.tag === 'assault' ? 1 : 0);
      const defendHits = baseCombatHits(defenderPieces) + tacticAttack(defenderTactic,defenderPieces) + defenderTargeting;
      const attackPrevent = (attackerTactic.shield || 0) + (useReaction(attackerId,'prevent') ? 2 : 0);
      const defendPrevent = (defenderTactic.shield || 0) + (useReaction(defenderId,'prevent') ? 2 : 0);
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
      if (useReaction(attackerId,'salvage')) addResources(state.players[attackerId],{ matter: Math.min(3,destroyedCount) });
      if (useReaction(defenderId,'salvage')) addResources(state.players[defenderId],{ matter: Math.min(3,destroyedCount) });
    }
    const capacityLoss = trimResourcesToCapacity(attackerId) + trimResourcesToCapacity(defenderId);
    if (capacityLoss) summary.push(`${capacityLoss} resource${capacityLoss === 1 ? '' : 's'} were lost when storage capacity fell.`);
    state.lastCombat = { attackerId, defenderId, coord, summary, outcome, system: 'military-deck' };
    logEvent(`${state.players[attackerId].name} attacked ${state.players[defenderId].name} at ${nameForCoord(coord)}. ${outcome}`);
    if (attackerId === 0 || defenderId === 0) showMessage('COMBAT REPORT', nameForCoord(coord), [...summary,outcome].join(' '));
  }

  function colonizePlanet(playerId, coord, options = {}, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || !fleet || fleet.scout < 1 || !isColonySite(coord)) return false;
    const capture = planet.owner !== null && planet.owner !== playerId && planet.occupiedBy === playerId;
    if (planet.owner !== null && !capture) return false;
    if (planet.owner === null && hasBuilding(planet)) return false;
    const cost = { biomass: capture ? 1 : (options.tag === 'dropColony' ? 1 : 2) };
    if (!canAfford(player,cost)) return false;
    if (dryRun) return true;
    payCost(player,cost);
    if (options.tag !== 'dropColony') fleet.scout -= 1;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    if (capture) {
      planet.owner = playerId;
      planet.hasColony = true;
      planet.upgrade = null;
      planet.upgradeLevel = 0;
      planet.occupiedBy = null;
      planet.conquest = true;
      logEvent(`${player.name} captured ${planet.name}.`);
    } else {
      planet.owner = playerId;
      planet.originalFounder = playerId;
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
    const limits = { scout:8, researcher:5, frigate:6, dreadnought:3 };
    return countPlacedShips(playerId,type) < limits[type];
  }

  function buildUpgrade(playerId, coord, type, discountMatter = 0, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    if (type === 'research') return false;
    if (!planet || planet.occupiedBy !== null) return false;
    const improving = planet.owner === playerId && planet.upgrade === type && (planet.upgradeLevel || 1) < 2;
    if (!improving && !canBuildStructureAt(playerId,coord)) return false;
    const policyDiscount = state.activePolicy?.id === 'frontier_grants' && !player.policyBuildDiscountUsed ? 1 : 0;
    const cost = improving ? STRUCTURES[type].upgradeCost : STRUCTURES[type].cost;
    if (!canAfford(player,cost,0,discountMatter + policyDiscount)) return false;
    if (dryRun) return true;
    payCost(player,cost,0,discountMatter + policyDiscount);
    if (planet.owner === null) {
      planet.owner = playerId;
      planet.originalFounder = null;
      planet.conquest = false;
    }
    planet.hasColony = false;
    planet.upgrade = type;
    planet.upgradeLevel = improving ? 2 : 1;
    player.tracks.expansion += 1;
    if (policyDiscount) player.policyBuildDiscountUsed = true;
    return true;
  }

  function buildResearchStation(playerId, coord, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || planet.special !== 'relic' || hasBuilding(planet) || !fleet?.researcher) return false;
    if (!canAfford(player,STRUCTURES.research.cost)) return false;
    if (dryRun) return true;
    payCost(player,STRUCTURES.research.cost);
    fleet.researcher -= 1;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    planet.researchStationOwner = playerId;
    planet.relicClaimed = true;
    player.relics += 1;
    player.tracks.expansion += 1;
    logEvent(`${player.name} established a Research Station on a Rosetta Stone and recovered a 1-Prestige Relic.`);
    return true;
  }

  function exchangeRelic(playerId) {
    const player = state.players[playerId];
    if (researchStationCount(playerId) < 3 || player.relics < 1 || !state.relicDeck.length) return false;
    player.relics -= 1;
    const relicCard = state.relicDeck.pop();
    player.discard.push(relicCard);
    logEvent(`${player.name} exchanged a Relic for ${ALL_CARDS[relicCard.key].name}.`);
    return true;
  }

  function buildShip(playerId, coord, type, discountEnergy = 0, dryRun = false) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || planet.owner !== playerId || planet.occupiedBy !== null) return false;
    if (type === 'researcher' ? !canLaunchResearcher(playerId,coord) : planet.upgrade !== 'starbase') return false;
    const policyDiscount = state.activePolicy?.id === 'frontier_grants' && !player.policyBuildDiscountUsed ? 1 : 0;
    if (fleetCount(fleet) >= 5 || !canPlaceShip(playerId,type) || !canAfford(player,SHIP_STATS[type].cost,0,policyDiscount,discountEnergy)) return false;
    if (dryRun) return true;
    payCost(player,SHIP_STATS[type].cost,0,policyDiscount,discountEnergy);
    ensureFleet(coord,playerId)[type] += 1;
    player.tracks.expansion += 1;
    if (policyDiscount) player.policyBuildDiscountUsed = true;
    return true;
  }

  function contextBuild(kind, coord) {
    if (state.actionMode !== 'construct' || state.activePlayer !== 0) return;
    const player = state.players[0];
    let success = false;
    if (kind === 'research') success = buildResearchStation(0,coord);
    else if (STRUCTURES[kind]) success = buildUpgrade(0,coord,kind);
    if (SHIP_STATS[kind]) success = buildShip(0,coord,kind);
    if (!success) { toast('That build is not currently legal or affordable.'); return; }
    const label = STRUCTURES[kind]?.name || SHIP_STATS[kind].name;
    discardActionCard(0);
    completeAction(0,`You built ${label} at ${nameForCoord(coord)}.`);
  }

  function contextColonize(coord) {
    if (state.actionMode !== 'colonize' || state.activePlayer !== 0) return;
    if (!colonizePlanet(0,coord,state.actionOptions)) { toast('You need an eligible Scout on the world’s center hex and the required resources.'); return; }
    discardActionCard(0);
    completeAction(0,`You completed a colonization operation at ${nameForCoord(coord)}.`);
  }

  function contextTerraform(coord) {
    const planet = state.planets[coord];
    if (!planet || planet.owner !== 0 || planet.rich || state.players[0].resources.biomass < 2) { toast('That planet cannot be terraformed.'); return; }
    state.players[0].resources.biomass -= 2;
    planet.rich = true;
    discardActionCard(0);
    completeAction(0,`You terraformed ${planet.name} into a Rich world.`);
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
  }

  function findColonizeTarget(playerId) {
    return Object.keys(state.planets).find(coord => {
      const planet = state.planets[coord];
      const fleet = getFleet(coord,playerId);
      return isColonySite(coord) && fleet?.scout > 0 && ((planet.owner === null && !hasBuilding(planet)) || (planet.owner !== playerId && planet.occupiedBy === playerId));
    }) || null;
  }

  function chooseAiBuild(playerId) {
    const player = state.players[playerId];
    const openPlanets = Object.entries(state.planets).filter(([coord]) => canBuildStructureAt(playerId,coord));
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase' && p.occupiedBy === null);
    const options = [];
    const expansionNeedsScouts = player.strategy === 'expansion' && countPlacedShips(playerId,'scout') < 3;
    const generalShipScores = player.strategy === 'expansion'
      ? { scout: expansionNeedsScouts ? 11 : 6, frigate: 5, dreadnought: 4 }
      : player.strategy === 'economy'
        ? { scout: 8, frigate: 5, dreadnought: 4 }
        : { scout: 6, frigate: 7, dreadnought: 8 };
    if (player.strategy === 'military') {
      for (const [coord] of starbases) {
        for (const type of ['dreadnought','frigate','scout']) if (canPlaceShip(playerId,type) && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:type,coord,cost:SHIP_STATS[type].cost,score:type==='dreadnought'?10:type==='frigate'?8:5});
      }
    }
    for (const [coord,planet] of openPlanets) {
      options.push({kind:'harvester',coord,cost:STRUCTURES.harvester.cost,score:(planet.type==='data'?9:7)+(player.strategy==='economy'?3:0)});
      options.push({kind:'starbase',coord,cost:STRUCTURES.starbase.cost,score:5+(player.strategy==='military'?4:0)});
      options.push({kind:'warehouse',coord,cost:STRUCTURES.warehouse.cost,score:totalResources(player)>10?8:3});
    }
    Object.entries(state.planets).forEach(([coord,planet]) => {
      if (planet.special === 'relic' && !hasBuilding(planet) && getFleet(coord,playerId)?.researcher) options.push({kind:'research',coord,cost:STRUCTURES.research.cost,score:15});
    });
    controlledPlanets(playerId).filter(([,p])=>p.upgrade&&(p.upgradeLevel||1)<2&&p.occupiedBy===null).forEach(([coord,planet])=>{
      options.push({kind:planet.upgrade,coord,cost:STRUCTURES[planet.upgrade].upgradeCost,score:player.strategy==='economy'?9:6});
    });
    controlledPlanets(playerId).filter(([coord])=>canLaunchResearcher(playerId,coord)).forEach(([coord])=>{
      if (canPlaceShip(playerId,'researcher') && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:'researcher',coord,cost:SHIP_STATS.researcher.cost,score:researchStationCount(playerId)<3?11:3});
    });
    for (const [coord] of starbases) {
      for (const type of ['scout','frigate','dreadnought']) if (canPlaceShip(playerId,type) && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:type,coord,cost:SHIP_STATS[type].cost,score:generalShipScores[type]});
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

  function chooseAiMove(playerId) {
    const military = state.players[playerId].strategy === 'military';
    const fleets = Object.entries(state.fleets).filter(([,group]) => fleetCount(group[playerId]));
    let best = null;
    fleets.forEach(([source,group]) => {
      const fleet = group[playerId];
      if (fleet.researcher) {
        const relicTargets = state.clusters.filter(cluster=>clusterScanned(cluster,playerId)).map(relicCoordInCluster).filter(coord=>coord&&!hasBuilding(state.planets[coord]));
        const relicGoal = relicTargets.sort((a,b)=>hexDistance(source,a)-hexDistance(source,b))[0];
        const path = relicGoal && pathToCoord(source,relicGoal);
        if (path?.length) {
          const destination = path[0];
          const score = 20 - path.length * .1;
          if (!best || score > best.score) best = { source,destination,score,moveGroup:'researcher' };
        }
      }
      if (combatShipCount(fleet)) {
        const path = nearestGoal(source,playerId,military);
        if (!path?.length) return;
        const ships = fleetGroup(fleet,'ships');
        const range = fleetMove(ships);
        let destination = source;
        for (let i=0;i<Math.min(range,path.length);i+=1) {
          const candidate = path[i];
          destination = candidate;
          if (hostileAt(candidate,playerId)) break;
        }
        const score = (military ? fleetPower(ships) : ships.scout * 3) - path.length * .1;
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
    const id = state.activePlayer;
    const player = state.players[id];
    const colonizeCard = player.hand.find(card => ALL_CARDS[card.key].order === 'colonize');
    const target = findColonizeTarget(id);
    if (colonizeCard && target) {
      const definition = ALL_CARDS[colonizeCard.key];
      const planet = state.planets[target];
      const capture = planet.owner !== null;
      const cost = { biomass: capture ? 1 : definition.tag === 'dropColony' ? 1 : 2 };
      aiUseResources(player,colonizeCard.id,cost);
      if (colonizePlanet(id,target,{tag:definition.tag})) {
        aiPlayCard(player,colonizeCard);
        completeAction(id,`${player.name} completed a colonization operation.`);
        return;
      }
    }
    const constructCard = player.hand.find(card => ALL_CARDS[card.key].order === 'construct');
    const build = chooseAiBuild(id);
    if (constructCard && build) {
      aiUseResources(player,constructCard.id,build.cost);
      let built = build.kind === 'research' ? buildResearchStation(id,build.coord) : STRUCTURES[build.kind] ? buildUpgrade(id,build.coord,build.kind) : buildShip(id,build.coord,build.kind);
      if (built) {
        aiPlayCard(player,constructCard);
        completeAction(id,`${player.name} built ${STRUCTURES[build.kind]?.name || SHIP_STATS[build.kind].name} at ${nameForCoord(build.coord)}.`);
        return;
      }
    }
    const probe = player.hand.find(card => ALL_CARDS[card.key].order === 'probe');
    const unknown = nearestUnscannedRelicCluster(id);
    if (probe && unknown && Object.values(state.fleets).some(group=>group[id]?.researcher)) {
      unknown.scannedBy.push(id);
      aiPlayCard(player,probe);
      completeAction(id,`${player.name} pinpointed an alien relic signal.`);
      return;
    }
    const moveCard = player.hand.find(card => ALL_CARDS[card.key].order === 'move');
    const move = chooseAiMove(id);
    if (moveCard && move && move.destination !== move.source) {
      const definition = ALL_CARDS[moveCard.key];
      executeMove(id,move.source,move.destination,{tag:definition.tag,moveGroup:move.moveGroup});
      aiPlayCard(player,moveCard);
      completeAction(id,`${player.name} moved a fleet toward ${nameForCoord(move.destination)}.`);
      return;
    }
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
    const remainingProbe = player.hand.find(card => ALL_CARDS[card.key].order === 'probe');
    const remainingUnknown = nearestUnscannedRelicCluster(id);
    if (remainingProbe && remainingUnknown) {
      remainingUnknown.scannedBy.push(id);
      aiPlayCard(player,remainingProbe);
      completeAction(id,`${player.name} pinpointed an alien relic signal.`);
      return;
    }
    passOperations(id);
  }

  function startBuyPhase() {
    state.phase = 'buy';
    state.activePlayer = state.firstPlayer;
    state.players.forEach(player => { player.bought=0; player.buyLimit=1; player.decommissioned=false; player.buyStartDiscardIds=player.discard.map(c=>c.id); });
    clearAction();
    startBuyTurn();
  }

  function startBuyTurn() {
    const player = state.players[state.activePlayer];
    state.turnStage = state.activePlayer === 0 ? 'buy' : 'ai-buy';
    if (state.activePlayer === 0) captureHumanTurn(`Buy turn in Round ${state.round}`);
    render();
    saveGame();
    if (state.activePlayer !== 0) scheduleAiTurn('buy', runAiBuy, 550);
  }

  function nextBuyPlayer() {
    const relative = (state.activePlayer - state.firstPlayer + 4) % 4;
    if (relative === 3) { cleanupRound(); return; }
    state.activePlayer = (state.activePlayer + 1) % 4;
    startBuyTurn();
  }

  function buyCard(playerId, source, indexOrKey) {
    const player = state.players[playerId];
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
    player.tracks.economy += 1;
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

  function decommission(playerId, cardId) {
    const player = state.players[playerId];
    if (player.decommissioned || player.resources.data < 1 || !player.buyStartDiscardIds.includes(cardId)) return false;
    const index = player.discard.findIndex(c=>c.id===cardId);
    if (index < 0) return false;
    if (player.discard[index].starter) return false;
    const [card] = player.discard.splice(index,1);
    player.resources.data -= 1;
    player.decommissioned = true;
    logEvent(`${player.name} Decommissioned ${ALL_CARDS[card.key].name}.`);
    return true;
  }

  function upgradeStarter(playerId, cardId) {
    const player = state.players[playerId];
    if (state.phase !== 'buy' || state.activePlayer !== playerId || player.resources.data < 1) return false;
    const card = [...player.hand,...player.discard].find(item=>item.id===cardId);
    if (!card?.starter || card.upgraded) return false;
    player.resources.data -= 1;
    card.upgraded = true;
    player.tracks.technology += state.activePolicy?.id === 'research_mandate' ? 2 : 1;
    logEvent(`${player.name} upgraded ${ALL_CARDS[card.key].name} to level II.`);
    return true;
  }

  function runAiBuy() {
    const id = state.activePlayer;
    const player = state.players[id];
    if (researchStationCount(id) >= 3 && player.relics > 0) exchangeRelic(id);
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
        const basics = Object.keys(BASIC_CARDS).filter(key=>canAfford(player,BASIC_CARDS[key].cost,player.buyDiscountData));
        if (basics.length) buyCard(id,'basic',basics[0]);
        else break;
      }
    }
    const removable = player.discard.find(card=>BASIC_CARDS[card.key] && !card.starter && player.buyStartDiscardIds.includes(card.id));
    if (removable && player.resources.data >= 2 && player.deck.length + player.discard.length > 8) decommission(id,removable.id);
    nextBuyPlayer();
  }

  function finishHumanBuy() {
    if (state.phase !== 'buy' || state.activePlayer !== 0) return;
    completeHumanTurn();
    nextBuyPlayer();
  }

  function cleanupRound() {
    state.phase = 'cleanup';
    state.players.forEach(player => {
      player.discard.push(...player.hand);
      player.hand = [];
      const cap = playerCapacity(player.id);
      while (totalResources(player) > cap) {
        const most = [...RESOURCES].sort((a,b)=>player.resources[b]-player.resources[a])[0];
        player.resources[most] -= 1;
      }
    });
    evaluateAwards();
    state.pendingCleanup = true;
    if (state.round % 3 === 0) startPolicyVote();
    else startDirectiveChoice();
  }

  function startPolicyVote() {
    state.phase = 'policy';
    const choices = POLICY_PAIRS[state.policyCycle % POLICY_PAIRS.length];
    state.pendingPolicyChoices = choices.map(policy=>({ ...policy }));
    if (headless) { state.activePlayer = 0; state.arenaVotes = []; return; }
    const container = $('#policy-choices');
    container.innerHTML = choices.map((policy,index)=>`<label class="choice-card"><input type="radio" name="policy-choice" value="${index}" ${index===0?'checked':''}><span class="choice-kicker">${TRACKS[policy.track].name}</span><strong>${policy.name}</strong><small>${policy.text}</small><em>${state.players[0].tracks[policy.track]} points available</em></label>`).join('');
    const syncLimit = () => {
      const selected = Number($('#policy-form').elements['policy-choice'].value || 0);
      const available = state.players[0].tracks[choices[selected].track];
      $('#vote-power').max = available;
      $('#vote-power').value = Math.min(Number($('#vote-power').value)||0,available);
      $('#vote-limit').textContent = `${available} available on ${TRACKS[choices[selected].track].name}`;
    };
    container.querySelectorAll('input').forEach(input=>input.addEventListener('change',syncLimit));
    syncLimit();
    render(); saveGame();
    if (!$('#policy-dialog').open) $('#policy-dialog').showModal();
  }

  function resolvePolicyVote(humanChoice, humanBid) {
    const choices = state.pendingPolicyChoices;
    const totals = [0,0];
    const humanPolicy = choices[humanChoice];
    const legalHumanBid = Math.max(0,Math.min(humanBid,state.players[0].tracks[humanPolicy.track]));
    state.players[0].tracks[humanPolicy.track] -= legalHumanBid;
    totals[humanChoice] += legalHumanBid;
    state.players.slice(1).forEach(player=>{
      const preferredTrack = player.strategy === 'military' ? 'technology' : player.strategy === 'economy' ? 'economy' : 'expansion';
      let choice = choices.findIndex(policy=>policy.track===preferredTrack);
      if (choice < 0) choice = player.id % 2;
      const track = choices[choice].track;
      const bid = Math.min(player.tracks[track],1+Math.floor(state.round/6));
      player.tracks[track] -= bid;
      totals[choice] += bid;
    });
    enactPolicy(totals);
  }

  function enactPolicy(totals) {
    const choices = state.pendingPolicyChoices;
    let winner = totals[1] > totals[0] ? 1 : 0;
    if (totals[0] === totals[1]) winner = state.firstPlayer % 2;
    state.activePolicy = { ...choices[winner], enactedRound: state.round };
    state.policyCycle += 1;
    delete state.pendingPolicyChoices;
    logEvent(`${choices[winner].name} passed ${totals[winner]}–${totals[1-winner]}.`);
    startDirectiveChoice();
  }

  function startDirectiveChoice() {
    state.phase = 'directive';
    const chooser = state.firstPlayer;
    if (headless) { state.activePlayer = chooser; return; }
    if (chooser !== 0) {
      const strategy = state.players[chooser].strategy;
      const type = strategy === 'military' ? 'technology' : strategy === 'economy' ? 'economy' : 'expansion';
      applyDirective(type,chooser);
      return;
    }
    $('#directive-choices').innerHTML = Object.entries(DIRECTIVES).map(([type,directive])=>`<button class="choice-card" type="button" data-directive="${type}"><span class="choice-kicker">${TRACKS[type].name}</span><strong>${directive.name}</strong><small>${directive.text}</small><em>You: ${plainResourceText(directive.primary)} · Rivals: ${plainResourceText(directive.secondary)}</em></button>`).join('');
    $$('[data-directive]').forEach(button=>button.addEventListener('click',()=>applyDirective(button.dataset.directive,0)));
    render(); saveGame();
    if (!$('#directive-dialog').open) $('#directive-dialog').showModal();
  }

  function plainResourceText(resources) {
    return RESOURCES.filter(type=>resources[type]).map(type=>`${resources[type]} ${RESOURCE_NAMES[type]}`).join(', ');
  }

  function applyDirective(type, chooser) {
    const directive = DIRECTIVES[type];
    state.players.forEach((player,id)=>addResources(player,id===chooser?directive.primary:directive.secondary));
    if (!headless && $('#directive-dialog').open) $('#directive-dialog').close();
    logEvent(`${state.players[chooser].name} chose ${directive.name}; every faction received a benefit.`);
    finishRound();
  }

  function finishRound() {
    state.phase = 'cleanup';
    state.pendingCleanup = false;
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

  function submitTrade(event) {
    event.preventDefault();
    const human = state.players[0];
    if (state.phase !== 'operations' || state.activePlayer !== 0 || state.turnStage !== 'action' || human.tradeUsed) { toast('Trade is unavailable right now.'); return; }
    const rivalId = Number($('#trade-rival').value);
    const giveType = $('#trade-give-type').value;
    const getType = $('#trade-get-type').value;
    const giveAmount = Math.max(1,Number($('#trade-give-amount').value));
    const getAmount = Math.max(1,Number($('#trade-get-amount').value));
    const rival = state.players[rivalId];
    human.tradeUsed = true;
    let accepted = human.resources[giveType] >= giveAmount && rival.resources[getType] >= getAmount;
    let rejectionReason = '';
    if (accepted) {
      const humanFits = totalResources(human) - giveAmount + getAmount <= playerCapacity(0);
      const rivalFits = totalResources(rival) - getAmount + giveAmount <= playerCapacity(rivalId);
      if (!humanFits || !rivalFits) {
        accepted = false;
        rejectionReason = 'The exchange would exceed a faction’s storage capacity.';
      }
    }
    if (accepted) {
      const rivalNeed = rival.resources[giveType] < 2 ? 1.45 : 1;
      const humanNeed = rival.resources[getType] < 2 ? .7 : 1;
      accepted = giveAmount * rivalNeed >= getAmount * humanNeed * .9;
    }
    if (accepted) {
      human.resources[giveType] -= giveAmount; rival.resources[giveType] += giveAmount;
      rival.resources[getType] -= getAmount; human.resources[getType] += getAmount;
      human.tracks.culture += 1;
      rival.tracks.culture += 1;
      human.tradesWith[rivalId] += 1;
      rival.tradesWith[0] += 1;
      if (state.activePolicy?.id === 'open_exchange') { addResources(human,{ data: 1 }); addResources(rival,{ data: 1 }); }
      $('#trade-response').textContent = `${rival.name} accepted the exchange.`;
      completeAction(0,`${rival.name} accepted your trade.`);
    } else {
      $('#trade-response').textContent = rejectionReason || `${rival.name} rejected the offer.`;
      completeAction(0,`${rival.name} rejected your trade offer.`);
    }
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
    if (planet.researchStationOwner !== null) return boardIcon('research');
    return '';
  }

  function buildingLabel(planet) {
    if (planet.hasColony) return 'Colony';
    if (planet.upgrade) return `${STRUCTURES[planet.upgrade].name} ${planet.upgradeLevel >= 2 ? 'II' : 'I'}`;
    if (planet.researchStationOwner !== null) return 'Research Station';
    return 'Open site';
  }

  function renderSymbolLegend() {
    $('#resource-legend').innerHTML = `<strong class="legend-heading">Map key</strong>${RESOURCES.map(resource=>`<span>${resourceDot(resource)}${RESOURCE_NAMES[resource]}</span>`).join('')}<span>★ Rich world</span><span>◈ Located relic</span><span>⇄ Gate</span><span>Fog = unvisited</span>`;
    const entries = [
      ['scout','Scout'],['researcher','Researcher'],['frigate','Frigate'],['dreadnought','Dreadnought'],
      ['colony','Colony'],['harvester','Harvester'],['starbase','Shipyard'],['warehouse','Warehouse'],['research','Research Station']
    ];
    $('#symbol-legend').innerHTML = `<strong class="legend-heading">Units &amp; buildings</strong>${entries.map(([type,label]) => {
      const cost = type === 'colony' ? { biomass: 2 } : SHIP_STATS[type]?.cost || STRUCTURES[type]?.cost;
      return `<span class="tooltip-anchor symbol-legend-item" tabindex="0" data-tooltip="${LEGEND_TOOLTIPS[type]}" aria-label="${label}. ${LEGEND_TOOLTIPS[type]}"><span class="symbol-legend-name">${BOARD_ICONS[type]}${label}</span><span class="symbol-legend-cost">${resourceDots(cost)}</span></span>`;
    }).join('')}`;
  }

  function renderBoard() {
    const board = $('#galaxy-board');
    if (!board.dataset.built) {
      for (let r=-BOARD_RADIUS;r<=BOARD_RADIUS;r+=1) {
        const row = document.createElement('div'); row.className = 'map-row';
        const qMin = Math.max(-BOARD_RADIUS,-BOARD_RADIUS-r); const qMax = Math.min(BOARD_RADIUS,BOARD_RADIUS-r);
        const rowScreenX = qMin + r/2;
        row.style.transform = `translateX(${((rowScreenX+BOARD_RADIUS)/(BOARD_RADIUS*2+1))*100}%)`;
        for (let q=qMin;q<=qMax;q+=1) {
          const key = coordKey(q,r);
          const button = document.createElement('button');
          button.type='button'; button.className='hex'; button.dataset.coord=key;
          button.addEventListener('click',()=>humanSelectHex(key));
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
      const known = clusterKnown(cluster,0);
      const scanned = clusterScanned(cluster,0);
      const relicSignal = Boolean(planet?.special === 'relic' && (scanned || planet.researchStationOwner !== null));
      hex.className = `hex ${planet ? (known ? planet.type : relicSignal ? 'fog scanned relic-signal' : 'space unknown-world') : 'space'}`;
      if (state.selected === key) hex.classList.add('selected');
      if (state.moveSource === key) hex.classList.add('source');
      if (state.reachable.includes(key)) hex.classList.add('target');
      const fleets = hex.querySelector('.hex-fleets'); const buildings = hex.querySelector('.hex-buildings'); const special = hex.querySelector('.special');
      const owners = new Set();
      if (known && planet?.owner !== null && planet?.owner !== undefined) owners.add(planet.owner);
      if (planet?.researchStationOwner !== null && planet?.researchStationOwner !== undefined) owners.add(planet.researchStationOwner);
      Object.entries(state.fleets[key]||{}).forEach(([fleetOwner,fleet])=>{if(fleetCount(fleet)&&(known||Number(fleetOwner)===0))owners.add(Number(fleetOwner));});
      const owner = [...owners][0];
      hex.style.setProperty('--owner',owner===undefined?'transparent':PLAYER_COLORS[owner]);
      fleets.innerHTML = known || getFleet(key,0) ? fleetSymbolsAt(key) : '';
      if (planet) {
        buildings.innerHTML = known || planet.researchStationOwner !== null ? buildingSymbols(planet) : '';
        special.textContent = known ? (planet.special==='rich'?'★':planet.special==='relic'?'◈':planet.special==='gate'?'⇄':'') : (relicSignal?'◈':'');
        const buildingText = hasBuilding(planet) ? `, ${buildingLabel(planet)}` : '';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',known?`${planet.name}, ${planet.type}, ${planet.owner===null?'unclaimed':state.players[planet.owner].name}${buildingText}${planet.researchStationOwner!==null?`, ${state.players[planet.researchStationOwner].name} Research Station`:''}${fleetText ? `, fleet ${fleetText}` : ''}${planet.occupiedBy!==null?', occupied':''}`:relicSignal?`Alien relic signal at ${key}; surrounding world unknown`:`Uncharted space ${key}`);
      } else {
        buildings.innerHTML = ''; special.textContent='';
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',`Space ${key}${fleetText?', fleet '+fleetText:''}`);
      }
    });
  }

  function renderScoreboard() {
    $('#score-ribbon').innerHTML = state.players.map((player,id)=>{
      const active = state.activePlayer===id && !state.winner;
      const influence=Object.values(player.tracks).reduce((sum,value)=>sum+value,0);
      return `<article class="score-card ${active?'active':''}" style="--player:${player.color}" title="Colonies: 1 each, plus 1 per two beyond home · Shipyards: 1 per pair · Relics and awards: 1 each · Influence: ${influencePrestige(id)} · Deck: ${deckPrestige(id)}"><div class="score-top"><span class="score-name">${player.name}</span><span class="score-value">${calculatePrestige(id)}</span></div><div class="score-meta"><span>${colonyPlanets(id).length} colonies</span><span>${player.cardsPurchased||0} cards · ${deckPrestige(id)} Prestige</span><span>${strongestFleet(id)} fleet</span></div></article>`;
    }).join('');
  }

  function renderResources() {
    const player = state.players[0];
    const stored = totalResources(player);
    const capacity = playerCapacity(0);
    $('#capacity-value').textContent = `${stored} of ${capacity} stored`;
    $('#capacity-meter').setAttribute('aria-valuenow', stored);
    $('#capacity-meter').setAttribute('aria-valuemax', capacity);
    $('#capacity-meter').setAttribute('aria-label', `${stored} of ${capacity} resource storage used`);
    $('#capacity-fill').style.width = `${Math.min(100, stored / capacity * 100)}%`;
    $('#resource-grid').innerHTML = RESOURCES.map(resource=>`<article class="resource-box ${resource}" style="--resource:var(--${resource})" aria-label="${RESOURCE_NAMES[resource]}: ${player.resources[resource]}. ${RESOURCE_DETAILS[resource].purpose}."><div class="resource-box-main">${resourceDot(resource,'resource-symbol-large')}<div><span class="resource-name">${RESOURCE_NAMES[resource]}</span><strong class="resource-amount">${player.resources[resource]}</strong></div></div><p>${RESOURCE_DETAILS[resource].purpose}</p></article>`).join('');
  }

  function renderInspector() {
    const key = state.selected;
    const title = $('#inspect-title'); const coordinate = $('#inspect-coordinate'); const detail = $('#inspect-detail'); const facts = $('#inspect-facts'); const actions = $('#context-actions');
    actions.innerHTML='';
    if (!key) { title.textContent='Select a hex'; coordinate.textContent='—'; detail.textContent='Choose a planet or space hex to inspect fleets, control, and possible actions.'; facts.innerHTML=''; return; }
    const planet = state.planets[key]; const fleets = state.fleets[key]||{};
    coordinate.textContent=key;
    if (planet) {
      const cluster = state.clusters[planet.cluster];
      if (!clusterKnown(cluster,0)) {
        const relicSignal = planet.special === 'relic' && (clusterScanned(cluster,0) || planet.researchStationOwner !== null);
        title.textContent = relicSignal ? 'Alien relic signal' : 'Uncharted space';
        detail.textContent = relicSignal ? 'Your Probe pinpointed this Rosetta Stone. The planet and all surrounding sectors remain unknown.' : 'A Scout can enter this region blindly to reveal its seven-sector world.';
        facts.innerHTML = relicSignal ? `<div class="fact"><span>Signal</span><strong>Rosetta Stone</strong></div><div class="fact"><span>Research</span><strong>${planet.researchStationOwner===null?'No station':`${state.players[planet.researchStationOwner].name} station`}</strong></div>` : '<div class="fact"><span>Status</span><strong>Unknown</strong></div>';
        if (relicSignal && state.phase==='operations' && state.activePlayer===0 && state.turnStage==='action' && state.actionMode==='construct' && !hasBuilding(planet) && getFleet(key,0)?.researcher) actions.appendChild(actionButton('Establish Research Station',()=>contextBuild('research',key),canAfford(state.players[0],STRUCTURES.research.cost),STRUCTURES.research.cost));
        return;
      }
      title.textContent=planet.name;
      const owner = planet.owner===null?'Unclaimed':state.players[planet.owner].name;
      detail.innerHTML=`${resourceDot(planet.type,'resource-dot-large')} planet · ${owner}${planet.occupiedBy!==null?` · Occupied by ${state.players[planet.occupiedBy].name}`:''}`;
      const fleetIncome = fleetControllersAt(key).map(playerId => `${state.players[playerId].name} +${resourceDots({ [planet.type]: 1 })}`).join(' · ');
      facts.innerHTML=`<div class="fact"><span>World hex</span><strong>${isColonySite(key)?'Center · Colony site':'Outer'}</strong></div><div class="fact"><span>Owner production</span><strong>${planet.owner===null?'Unclaimed':resourceDots({ [planet.type]: ownerProductionAmount(planet) })}</strong></div><div class="fact"><span>Fleet production</span><strong>${fleetIncome||'No combat fleet'}</strong></div><div class="fact"><span>Building</span><strong>${buildingLabel(planet)}</strong></div>${planet.special==='relic'?`<div class="fact"><span>Rosetta Stone</span><strong>${planet.researchStationOwner===null?'Awaiting research':`${state.players[planet.researchStationOwner].name} station`}</strong></div>`:''}${Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${state.players[owner].name}</span><strong>${formatFleet(f)}</strong></div>`).join('')}`;
    } else {
      title.textContent='Empty Space'; detail.textContent='Fleets may move, fight, and retreat here.';
      facts.innerHTML=Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${state.players[owner].name}</span><strong>${formatFleet(f)}</strong></div>`).join('')||'<div class="fact"><span>Status</span><strong>Vacant</strong></div>';
    }
    if (state.phase==='operations' && state.activePlayer===0 && state.turnStage==='action') {
      if (state.actionMode==='move' && state.moveChoiceSource===key) {
        actions.appendChild(actionButton('Move Researchers',()=>prepareHumanMove(key,'researcher')));
        actions.appendChild(actionButton('Move Ships',()=>prepareHumanMove(key,'ships')));
      }
      if (state.actionMode==='construct' && planet && planet.occupiedBy===null) {
        if (canBuildStructureAt(0,key)) Object.keys(STRUCTURES).filter(kind=>kind!=='research').forEach(kind=>actions.appendChild(actionButton(`Build ${STRUCTURES[kind].name}`,()=>contextBuild(kind,key),canAfford(state.players[0],STRUCTURES[kind].cost),STRUCTURES[kind].cost)));
        if (planet.owner===0 && planet.upgrade && (planet.upgradeLevel||1)<2) actions.appendChild(actionButton(`Upgrade ${STRUCTURES[planet.upgrade].name} to II`,()=>contextBuild(planet.upgrade,key),canAfford(state.players[0],STRUCTURES[planet.upgrade].upgradeCost),STRUCTURES[planet.upgrade].upgradeCost));
        if (canLaunchResearcher(0,key)) actions.appendChild(actionButton('Recruit Researcher',()=>contextBuild('researcher',key),canAfford(state.players[0],SHIP_STATS.researcher.cost)&&fleetCount(getFleet(key,0))<5&&canPlaceShip(0,'researcher'),SHIP_STATS.researcher.cost));
        if (planet.upgrade==='starbase') Object.keys(SHIP_STATS).filter(kind=>kind!=='researcher').forEach(kind=>actions.appendChild(actionButton(`Commission ${SHIP_STATS[kind].name}`,()=>contextBuild(kind,key),canAfford(state.players[0],SHIP_STATS[kind].cost)&&fleetCount(getFleet(key,0))<5&&canPlaceShip(0,kind),SHIP_STATS[kind].cost)));
      }
      if (state.actionMode==='construct' && planet?.special==='relic' && !hasBuilding(planet) && getFleet(key,0)?.researcher) actions.appendChild(actionButton('Establish Research Station',()=>contextBuild('research',key),canAfford(state.players[0],STRUCTURES.research.cost),STRUCTURES.research.cost));
      if (state.actionMode==='colonize' && planet) {
        const capture=planet.owner!==null&&planet.owner!==0&&planet.occupiedBy===0;
        const eligible=isColonySite(key)&&((planet.owner===null&&!hasBuilding(planet))||capture)&&getFleet(key,0)?.scout>0;
        const colonizeCost={ biomass: capture?1:state.actionOptions.tag==='dropColony'?1:2 };
        if (eligible) actions.appendChild(actionButton(capture?'Capture planet':'Found Colony',()=>contextColonize(key),state.players[0].resources.biomass>=colonizeCost.biomass,colonizeCost));
      }
      if (state.actionMode==='terraform' && planet?.owner===0&&!planet.rich) actions.appendChild(actionButton('Terraform',()=>contextTerraform(key),state.players[0].resources.biomass>=2,{ biomass: 2 }));
    }
  }

  function actionButton(label,handler,enabled=true,cost=null) {
    const button=document.createElement('button'); button.type='button'; button.className='button'; button.innerHTML=cost?`<span>${label}</span>${resourceDots(cost)}`:label; button.disabled=!enabled; button.addEventListener('click',handler); return button;
  }

  function renderAwards() {
    const rows=[
      ['Fleet Supremacy',state.awards.fleet,`Strongest single fleet · minimum ${AWARD_THRESHOLDS.fleet} power · ${AWARD_PRESTIGE.fleet} Prestige`],
      ['Galactic Reach',state.awards.reach,`Most colonized clusters · minimum ${AWARD_THRESHOLDS.reach} · ${AWARD_PRESTIGE.reach} Prestige`],
      ['Occupation Mandate',state.awards.occupation,`Most conquest-marked Colonies · minimum ${AWARD_THRESHOLDS.occupation} · ${AWARD_PRESTIGE.occupation} Prestige`]
    ];
    $('#award-list').innerHTML=rows.map(([name,owner,desc])=>`<div class="award"><strong>${name}</strong><span>${owner===null?'Unclaimed':state.players[owner].name}</span><small>${desc}</small></div>`).join('');
  }

  function renderPolitics() {
    const player=state.players[0];
    $('#track-grid').innerHTML=Object.entries(TRACKS).map(([key,track])=>`<div class="track"><span>${track.short}</span><strong>${player.tracks[key]}</strong><small>${track.name}<br>${track.detail}</small></div>`).join('');
    $('#policy-status').textContent=state.activePolicy?.name||'No policy enacted';
    const policyText=state.activePolicy?.text||'Every third round, secretly spend track points to vote between two policies.';
    $('#policy-summary').textContent=`${policyText} Every ${INFLUENCE_PER_PRESTIGE} unspent influence is worth 1 Prestige.`;
  }

  function renderLog() {
    $('#game-log').innerHTML=state.log.slice(0,18).map(item=>`<li>${item}</li>`).join('');
  }

  function cardMarkup(card, location) {
    const definition=ALL_CARDS[card.key];
    const isHumanOps=state.phase==='operations'&&state.activePlayer===0;
    const canResource=location==='hand'&&isHumanOps&&['prep','action'].includes(state.turnStage)&&definition.resource;
    const resourceGain=cardResources(card);
    if(definition.wildcard)resourceGain.data=(resourceGain.data||0)+definition.wildcard;
    const resourceStorageNeeded=resourceGainTotal(resourceGain);
    const canStoreCard=!canResource||remainingResourceCapacity(0)>=resourceStorageNeeded;
    const canOrder=location==='hand'&&isHumanOps&&state.turnStage==='action'&&definition.order&&!definition.reaction&&!definition.buyEffect;
    const isSelectedOrder=canOrder&&state.actionCardId===card.id&&Boolean(state.actionMode);
    const canBuyEffect=location==='hand'&&state.phase==='buy'&&state.activePlayer===0&&definition.buyEffect&&!(definition.buyEffect==='manipulation'&&state.players[0].marketManipulated);
    return `<article class="game-card ${card.upgraded?'upgraded':''} ${isSelectedOrder?'order-selected':''}" style="--card-accent:${definition.accent}"><span class="card-type">${definition.kind}${card.starter?' · STARTER':''}</span><span class="card-name">${definition.name}${card.upgraded?' II':''}</span><span class="card-effect">${resourceText(definition.text)}${card.upgraded?' Upgraded: gain one extra resource.':''}</span><div class="card-footer"><span>${definition.resource?`<small>Gain</small>${resourceDots(cardResources(card))}`:''}</span><span>${definition.cost?`<small>Buy</small>${resourceDots(definition.cost)}`:''}</span></div>${location==='hand'?`<div class="card-buttons">${canResource?`<button class="button" data-resource-card="${card.id}" ${canStoreCard?'':`disabled title="Needs ${resourceStorageNeeded} open storage"`}>${canStoreCard?'Convert to resources':`Need ${resourceStorageNeeded} storage`}</button>`:''}${canOrder?`<button class="button ${isSelectedOrder?'button-danger':'button-primary'}" data-order-card="${card.id}" aria-pressed="${isSelectedOrder}">${isSelectedOrder?'Cancel order':'Use order'}</button>`:''}${canBuyEffect?`<button class="button button-primary" data-buy-effect="${card.id}">Use in Buy</button>`:''}${definition.reaction&&isHumanOps?'<span class="muted">Automatic reaction</span>':''}</div>`:''}</article>`;
  }

  function renderHand() {
    const player=state.players[0];
    $('#hand-count').textContent=player.hand.length;
    $('#deck-count').textContent=player.deck.length;
    $('#hand-pile-count').textContent=player.hand.length;
    $('#discard-count').textContent=player.discard.length;
    $('#discard-dialog-count').textContent=player.discard.length;
    $('#hand-row').innerHTML=player.hand.length?player.hand.map(card=>cardMarkup(card,'hand')).join(''):'<p class="muted">Your hand is empty.</p>';
    $('#discard-row').innerHTML=player.discard.length?[...player.discard].reverse().map(card=>cardMarkup(card,'discard')).join(''):'<p class="muted discard-empty">Your discard pile is empty.</p>';
    $$('[data-resource-card]').forEach(button=>button.addEventListener('click',()=>playResourceMode(button.dataset.resourceCard)));
    $$('[data-order-card]').forEach(button=>button.addEventListener('click',()=>playOrder(button.dataset.orderCard)));
    $$('[data-buy-effect]').forEach(button=>button.addEventListener('click',()=>useBuyEffect(button.dataset.buyEffect)));
    const prep=state.phase==='operations'&&state.activePlayer===0&&state.turnStage==='prep';
    $('#finish-prep-button').hidden=!prep;
    $('#hand-help').textContent=prep?'Convert any cards you want, then choose an order.':state.turnStage==='action'&&state.actionMode?`${state.actionOptions.cardName||'Order'} selected. You may still convert cards, cancel it, trade, or pass.`:state.turnStage==='action'?'Convert cards as needed, play one order card, make a Trade action, or pass.':'Your cards remain available through Buy, then all are discarded.';
  }

  function renderMarket() {
    const humanBuy=state.phase==='buy'&&state.activePlayer===0;
    $('#market-help').textContent=`Buy one card during your Buy turn. Every ${CARDS_PER_PRESTIGE} purchased cards grant 1 Prestige. Purchased: ${state.players[0].cardsPurchased||0} · Deck Prestige: ${deckPrestige(0)}.`;
    $('#basic-market').innerHTML=Object.entries(BASIC_CARDS).map(([key,def])=>`<span class="tooltip-anchor basic-market-item" data-tooltip="${BASIC_TOOLTIPS[key]}"><button class="button" data-buy-basic="${key}" aria-label="${def.name}. ${BASIC_TOOLTIPS[key]}" ${!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData)?'disabled':''}><span>${def.name}</span>${resourceDots(def.cost)}</button></span>`).join('');
    $('#market-row').innerHTML=state.market.map((card,index)=>{
      const def=ALL_CARDS[card.key];
      const disabled=!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData);
      return `<button class="game-card" style="--card-accent:${def.accent}" data-buy-market="${index}" ${disabled?'disabled':''}><span class="card-type">${def.kind}</span><span class="card-name">${def.name}</span><span class="card-effect">${resourceText(def.text)}</span><span class="card-footer"><small>Buy</small>${resourceDots(def.cost)}</span></button>`;
    }).join('');
    $$('[data-buy-basic]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'basic',button.dataset.buyBasic)){render();saveGame();}}));
    $$('[data-buy-market]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'market',Number(button.dataset.buyMarket))){render();saveGame();}}));
    $('#finish-buy-button').hidden=!humanBuy;
    const eligible=state.players[0].discard.filter(card=>state.players[0].buyStartDiscardIds.includes(card.id)&&!card.starter);
    $('#decommission-area').innerHTML=humanBuy?`<div class="decommission-list"><strong>Decommission ${resourceDots({ data: 1 })}</strong>${eligible.length?eligible.map(card=>`<button class="button" data-trash="${card.id}" ${state.players[0].decommissioned||state.players[0].resources.data<1?'disabled':''}>${ALL_CARDS[card.key].name}</button>`).join(''):'<span class="muted">No eligible discarded cards</span>'}</div>`:'';
    $$('[data-trash]').forEach(button=>button.addEventListener('click',()=>{if(decommission(0,button.dataset.trash)){render();saveGame();}}));
    const upgradeable=[...state.players[0].hand,...state.players[0].discard].filter(card=>card.starter&&!card.upgraded);
    if(humanBuy) $('#decommission-area').insertAdjacentHTML('beforeend',`<div class="decommission-list upgrade-list"><strong>Upgrade starter ${resourceDots({ data: 1 })}</strong>${upgradeable.length?upgradeable.map(card=>`<button class="button" data-upgrade-card="${card.id}" ${state.players[0].resources.data<1?'disabled':''}>${ALL_CARDS[card.key].name} → II</button>`).join(''):'<span class="muted">All starter cards upgraded</span>'}</div>`);
    $$('[data-upgrade-card]').forEach(button=>button.addEventListener('click',()=>{if(upgradeStarter(0,button.dataset.upgradeCard)){render();saveGame();}}));
    const stationCount=researchStationCount(0);
    if(humanBuy) $('#decommission-area').insertAdjacentHTML('beforeend',`<div class="decommission-list upgrade-list"><strong>Relic research ${stationCount}/3 stations</strong>${stationCount>=3&&state.players[0].relics>0&&state.relicDeck.length?`<button class="button button-primary" data-exchange-relic>Exchange 1 Relic for a relic-deck card</button>`:`<span class="muted">${stationCount<3?'Establish three Research Stations to unlock exchanges.':state.players[0].relics<1?'No basic Relics available.':'The relic deck is empty.'}</span>`}</div>`);
    $('[data-exchange-relic]')?.addEventListener('click',()=>{if(exchangeRelic(0)){render();saveGame();}});
  }

  function renderFleetSummary() {
    $('#fleet-summary').innerHTML=state.players.map((player,id)=>{
      const totals={scout:0,researcher:0,frigate:0,dreadnought:0};
      Object.values(state.fleets).forEach(group=>Object.keys(totals).forEach(type=>{totals[type]+=group[id]?.[type]||0;}));
      return `<div class="fleet-faction" style="--player:${player.color}"><strong>${player.name}</strong><span>${totals.scout} Scouts · ${totals.researcher} Researchers · ${totals.frigate} Frigates · ${totals.dreadnought} Dreadnoughts<br>${researchStationCount(id)} Research Stations · ${strongestFleet(id)} strongest-fleet power</span></div>`;
    }).join('');
    const player=state.players[0];
    $('#military-deck-count').textContent=`${player.militaryDeck.length} ready · ${player.militaryDiscard.length} used`;
    const counts=MILITARY_DECK_LIST.reduce((result,key)=>{result[key]=(result[key]||0)+1;return result;},{});
    $('#military-card-grid').innerHTML=Object.entries(counts).map(([key,count])=>{
      const card=MILITARY_CARDS[key];
      const stats=[card.attack?`Attack +${card.attack}`:'',card.shield?`Shield ${card.shield}`:'',card.pierce?`Pierce ${card.pierce}`:'',card.retreat?'Withdrawal':''].filter(Boolean).join(' · ');
      return `<article class="military-card"><strong>${count}× ${card.name}</strong><span>${card.text}</span><small>${stats||'Tactical effect'}</small></article>`;
    }).join('');
  }

  function renderTrade() {
    const selects=[$('#trade-give-type'),$('#trade-get-type')];
    selects.forEach((select,index)=>{
      if(!select.options.length) select.innerHTML=RESOURCES.map(r=>`<option value="${r}" style="color:var(--${r})" aria-label="${RESOURCE_NAMES[r]}" title="${RESOURCE_NAMES[r]}">●</option>`).join('');
      select.style.color=`var(--${select.value})`;
      select.setAttribute('aria-label',`${index===0?'You give':'You receive'}: ${RESOURCE_NAMES[select.value]}`);
      if(!select.dataset.resourceDots){
        select.dataset.resourceDots='true';
        select.addEventListener('change',()=>{
          select.style.color=`var(--${select.value})`;
          select.setAttribute('aria-label',`${index===0?'You give':'You receive'}: ${RESOURCE_NAMES[select.value]}`);
        });
      }
    });
    if(!$('#trade-rival').options.length)$('#trade-rival').innerHTML=state.players.slice(1).map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    $('#trade-form').querySelector('button').disabled=!(state.phase==='operations'&&state.activePlayer===0&&state.turnStage==='action'&&!state.players[0].tradeUsed);
    $('#trade-ledger').innerHTML=state.players.slice(1).map(player=>`<div><span>${player.name}</span><strong>${state.players[0].tradesWith[player.id]} trade${state.players[0].tradesWith[player.id]===1?'':'s'}</strong></div>`).join('');
  }

  function renderHeader() {
    $('#round-value').textContent=state.round;
    $('#phase-value').textContent=state.phase[0].toUpperCase()+state.phase.slice(1);
    $('#active-value').textContent=state.winner!==null?'Game over':state.phase==='policy'?'All factions':state.phase==='directive'?'Round leader':state.players[state.activePlayer].name;
    const humanTurn=state.activePlayer===0&&!state.winner;
    $('#turn-dot').style.background=state.players[state.activePlayer]?.color||'var(--cyan)';
    $('#turn-title').textContent=state.winner!==null?`${state.players[state.winner].name} won`:humanTurn?'Your turn':`${state.players[state.activePlayer].name} is acting`;
    let instruction='';
    if(state.phase==='operations')instruction=humanTurn?(state.turnStage==='prep'?'Prepare resources, then choose one action.':'Choose one order, Trade action, or pass.'):'Computer rival is evaluating the board…';
    else if(state.phase==='buy')instruction=humanTurn?'Buy up to your limit, optionally Decommission, then finish.':'Computer rival is shopping the market…';
    else if(state.phase==='policy')instruction='Commit political capital to a hidden policy ballot.';
    else if(state.phase==='directive')instruction='Choose a primary bonus; every rival gains its lesser benefit.';
    else instruction='Resolving automatic bookkeeping…';
    $('#turn-instruction').textContent=instruction;
    $('#pass-button').hidden=!(state.phase==='operations'&&humanTurn&&(state.turnStage==='prep'||state.turnStage==='action'));
    const undoButton=$('#undo-turn-button');
    undoButton.disabled=!turnHistory.undo;
    undoButton.title=turnHistory.undo?`Restore the start of your ${turnHistory.undo.label}`:'Available after you complete a turn';
  }

  function render() {
    if (headless) return;
    renderHeader(); renderScoreboard(); renderBoard(); renderResources(); renderInspector(); renderAwards(); renderPolitics(); renderLog(); renderHand(); renderMarket(); renderFleetSummary(); renderTrade();
  }

  function switchTab(name) {
    $$('.console-tab').forEach(tab=>{const active=tab.dataset.tab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
    $$('.tab-panel').forEach(panel=>{const active=panel.dataset.panel===name;panel.classList.toggle('active',active);panel.hidden=!active;});
  }

  function wireUi() {
    renderSymbolLegend();
    $('#undo-turn-button').addEventListener('click',undoLastTurn);
    $('#rules-button').addEventListener('click',()=>$('#rules-dialog').showModal());
    $('#close-rules').addEventListener('click',()=>$('#rules-dialog').close());
    $('#message-continue').addEventListener('click',()=>$('#message-dialog').close());
    $('#discard-button').addEventListener('click',()=>$('#discard-dialog').showModal());
    $('#close-discard').addEventListener('click',()=>$('#discard-dialog').close());
    $('#new-game-button').addEventListener('click',()=>{
      if(!confirm('Start a new game and replace the current save?'))return;
      clearTurnHistory();
      state=newState(); fillMarket(); logEvent('The four factions entered the Reach.'); saveGame(); render(); beginRound();
    });
    $('#finish-prep-button').addEventListener('click',finishHumanPrep);
    $('#finish-buy-button').addEventListener('click',finishHumanBuy);
    $('#pass-button').addEventListener('click',()=>passOperations(0));
    $('#trade-form').addEventListener('submit',submitTrade);
    $('#policy-form').addEventListener('submit',event=>{
      event.preventDefault();
      const choice=Number(event.currentTarget.elements['policy-choice'].value||0);
      const bid=Math.max(0,Number($('#vote-power').value)||0);
      $('#policy-dialog').close();
      resolvePolicyVote(choice,bid);
    });
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
      clone, ALL_CARDS, BASIC_CARDS, STRUCTURES, SHIP_STATS, DIRECTIVES, RESOURCES,
      canAfford, cardResources, resourceGainTotal, remainingResourceCapacity, addResources,
      removeHandCard, passOperations, completeAction, nextBuyPlayer, buyCard, upgradeStarter,
      decommission, exchangeRelic, researchStationCount, useBuyEffect, resolveHumanSpecial,
      colonizePlanet, buildUpgrade, buildResearchStation, buildShip, getFleet, fleetCount,
      fleetGroup, fleetMove, fleetPower, reachableFrom, executeMove, nearestUnscannedRelicCluster,
      clusterKnown, clusterScanned, relicCoordInCluster, calculatePrestige, colonyPlanets,
      totalResources, playerCapacity, applyDirective, enactPolicy
    });
  }

  wireUi();
  loadTurnHistory();
  if (!loadGame()) {
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
    if (!state.winner && state.activePlayer !== 0 && state.phase === 'operations') scheduleAiTurn('operations', runAiOperation, 650);
    if (!state.winner && state.activePlayer !== 0 && state.phase === 'buy') scheduleAiTurn('buy', runAiBuy, 650);
  }
 }
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticReach;
else if (typeof document !== 'undefined') createGalacticReach();
