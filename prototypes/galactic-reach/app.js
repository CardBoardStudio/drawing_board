(() => {
  'use strict';

  const SAVE_KEY = 'galactic-reach-save-v1';
  const TURN_HISTORY_KEY = 'galactic-reach-turn-history-v1';
  const RESOURCES = ['matter', 'energy', 'biomass', 'data'];
  const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Biomass', data: 'Data' };
  const PLAYER_COLORS = ['#55d9f4', '#ff9f6e', '#a58cff', '#f2cf66'];
  const PLAYER_NAMES = ['You', 'Ember Directorate', 'Violet Assembly', 'Helios Compact'];
  const PLAYER_STRATEGIES = ['human', 'military', 'economy', 'expansion'];
  const SPACE_CUTOUTS = ['-4,6', '5,-5'];
  const HOME_CLUSTER_OWNERS = [[4,0],[8,1],[15,2],[19,3]];
  const SHIP_STATS = {
    scout: { name: 'Scout', move: 3, dice: 1, hull: 1, cost: { matter: 1, energy: 1 } },
    frigate: { name: 'Frigate', move: 2, dice: 2, hull: 2, cost: { matter: 2, energy: 1, biomass: 1 } },
    dreadnought: { name: 'Dreadnought', move: 1, dice: 4, hull: 3, cost: { matter: 3, energy: 2, biomass: 1, data: 1 } }
  };
  const STRUCTURES = {
    harvester: { name: 'Harvester', code: 'H', cost: { matter: 1, energy: 1, biomass: 1 } },
    starbase: { name: 'Shipyard', code: 'S', cost: { matter: 2, energy: 1, biomass: 1, data: 1 } },
    warehouse: { name: 'Warehouse', code: 'W', cost: { matter: 2, energy: 1, data: 1 } }
  };
  const LEGEND_TOOLTIPS = {
    scout: 'Fast explorer. Moves up to 3 hexes and is required to colonize.',
    frigate: 'Balanced warship that rolls 2 combat dice.',
    dreadnought: 'Heavy warship: slow, durable, and rolls 4 combat dice.',
    colony: 'Claims a planet and enables its resource production.',
    harvester: 'Adds 1 resource to this planet’s production.',
    starbase: 'Commissions ships and contributes 3 defense dice.',
    warehouse: 'Raises your resource storage capacity by 5.'
  };
  const BASIC_TOOLTIPS = {
    colonize: 'Use a Scout on an eligible planet to found or capture a Colony.',
    construct: 'Build one planet upgrade or commission one ship at a Shipyard.',
    move: 'Move one fleet up to its slowest ship’s movement.'
  };
  const BOARD_ICONS = {
    scout: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>',
    frigate: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"></path><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"></path></svg>',
    dreadnought: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>',
    colony: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
    harvester: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"></path><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"></path><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"></path><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"></path></svg>',
    starbase: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"></path><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"></path><circle cx="12" cy="12" r="3"></circle><circle cx="19" cy="5" r="2"></circle><circle cx="5" cy="19" r="2"></circle></svg>',
    warehouse: '<svg class="board-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path><path d="M12 22V12"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><path d="m7.5 4.27 9 5.15"></path></svg>'
  };
  const DIRECTIONS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

  const BASIC_CARDS = {
    colonize: { name: 'Colonize', kind: 'Basic', accent: 'var(--biomass)', resource: { biomass: 1 }, order: 'colonize', text: 'Establish a Colony with a Scout.' , cost: { biomass: 1, data: 1 } },
    construct: { name: 'Construct', kind: 'Basic', accent: 'var(--matter)', resource: { matter: 1 }, order: 'construct', text: 'Build one upgrade or commission one ship.', cost: { matter: 1, data: 1 } },
    move: { name: 'Move', kind: 'Basic', accent: 'var(--energy)', resource: { energy: 1 }, order: 'move', text: 'Move one fleet up to its slowest ship’s speed.', cost: { energy: 1, data: 1 } }
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
    targetingAlgorithms: { name: 'Targeting Algorithms', kind: 'Reaction', accent: 'var(--data)', resource: { data: 2 }, reaction: 'reroll', text: 'Automatically reroll up to two misses in your next combat.', cost: { energy: 1, data: 2 } },
    ablativePlating: { name: 'Ablative Plating', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 2 }, reaction: 'prevent', text: 'Automatically prevent up to two hits in your next combat.', cost: { matter: 2, biomass: 1 } },
    emergencyJump: { name: 'Emergency Jump', kind: 'Reaction', accent: 'var(--energy)', resource: { energy: 1, data: 1 }, reaction: 'jump', text: 'Automatically retreat from a disastrous volley after suffering one hit.', cost: { energy: 2, data: 1 } },
    coordinatedAssault: { name: 'Coordinated Assault', kind: 'Military', accent: 'var(--red)', resource: { matter: 1, energy: 1 }, order: 'move', tag: 'assault', text: 'Move to attack with +2 combat dice in the first volley.', cost: { matter: 1, energy: 1, biomass: 1, data: 1 } },
    salvageCrews: { name: 'Salvage Crews', kind: 'Reaction', accent: 'var(--matter)', resource: { matter: 1, data: 1 }, reaction: 'salvage', text: 'After a battle, gain Matter for destroyed ships, maximum 3.', cost: { matter: 2, biomass: 1, data: 1 } },
    tacticalForesight: { name: 'Tactical Foresight', kind: 'Tactics', accent: 'var(--data)', resource: { data: 2 }, order: 'special', tag: 'foresight', text: 'Draw three cards, keep two, discard one.', cost: { energy: 1, data: 2 } },
    dataBrokerage: { name: 'Data Brokerage', kind: 'Deckcraft', accent: 'var(--data)', resource: { biomass: 1, data: 1 }, order: 'special', tag: 'brokerage', text: 'Trash one card from hand or discard, then draw two.', cost: { biomass: 1, data: 2 } },
    procurementNetwork: { name: 'Procurement Network', kind: 'Buy', accent: 'var(--gold)', resource: { data: 2 }, buyEffect: 'procurement', text: 'Buy up to two cards this Buy phase; second costs 1 less resource.', cost: { matter: 1, biomass: 1, data: 2 } },
    marketManipulation: { name: 'Market Manipulation', kind: 'Buy', accent: 'var(--gold)', resource: { energy: 1, data: 1 }, buyEffect: 'manipulation', text: 'Refresh up to two market cards; your next purchase costs 1 less Data.', cost: { energy: 1, biomass: 1, data: 2 } },
    commandUplink: { name: 'Command Uplink', kind: 'Tactics', accent: 'var(--data)', resource: { energy: 1, data: 1 }, order: 'special', tag: 'uplink', text: 'Return a basic order from discard to hand and play it immediately.', cost: { energy: 2, biomass: 1, data: 2 } }
  };

  const ALL_CARDS = { ...BASIC_CARDS, ...ADVANCED_CARDS };
  let cardSerial = 1;
  let state;
  let aiTimer = null;
  let turnHistory = { pending: null, undo: null };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const coordKey = (q, r) => `${q},${r}`;
  const parseCoord = (key) => key.split(',').map(Number);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function makeCard(key) {
    return { key, id: `${key}-${cardSerial++}` };
  }

  function shuffled(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function generateGalaxy() {
    const seeds = [
      [0,-6,'up'],[2,-6,'down'],[5,-6,'up'],[7,-6,'down'],
      [-3,-3,'up'],[-1,-3,'down'],[2,-3,'up'],[4,-3,'down'],[7,-3,'up'],
      [-6,0,'down'],[-3,0,'up'],[-1,0,'down'],[2,0,'up'],[4,0,'down'],[7,0,'up'],
      [-6,3,'down'],[-3,3,'up'],[-1,3,'down'],[2,3,'up'],[4,3,'down'],
      [-6,6,'up'],[-4,6,'down'],[-1,6,'up'],[1,6,'down']
    ];
    const names = ['Asterion','Borealis','Cygnus','Draco','Erebus','Fornax','Gemini','Helios','Icarus','Juno','Kepler','Lyra','Meridian','Nyx','Orison','Praxis','Quillon','Rhea','Solace','Talos','Umbra','Vesper','Wayfarer','Zenith'];
    const homes = new Map(HOME_CLUSTER_OWNERS);
    const specials = new Map([[2,'rich'],[5,'ruin'],[9,'gate'],[12,'rich'],[14,'ruin'],[17,'gate'],[22,'rich']]);
    const resourceCycle = ['matter','energy','biomass','data'];
    const numerals = ['I','II','III'];
    const planets = {};
    const clusters = [];
    seeds.forEach(([q,r,orientation], clusterIndex) => {
      let coords = orientation === 'up' ? [[q,r],[q-1,r+1],[q,r+1]] : [[q,r],[q+1,r],[q,r+1]];
      if (clusterIndex === 3) coords = [[7,-6],[6,-5],[7,-5]];
      if (clusterIndex === 20) coords = [[-6,6],[-5,6],[-6,7]];
      clusters.push({ id: clusterIndex, name: names[clusterIndex], coords: coords.map(([cq,cr]) => coordKey(cq,cr)) });
      coords.forEach(([cq,cr], planetIndex) => {
        const homeOwner = homes.has(clusterIndex) ? homes.get(clusterIndex) : null;
        const owner = homeOwner !== null && planetIndex === 0 ? homeOwner : null;
        const type = homeOwner !== null ? ['matter','energy','data'][planetIndex] : resourceCycle[(clusterIndex * 3 + planetIndex) % 4];
        planets[coordKey(cq,cr)] = {
          q: cq, r: cr, cluster: clusterIndex, name: `${names[clusterIndex]} ${numerals[planetIndex]}`,
          type, special: planetIndex === 1 ? specials.get(clusterIndex) || null : null,
          owner, originalFounder: owner, upgrade: null, rich: specials.get(clusterIndex) === 'rich' && planetIndex === 1,
          relicClaimed: false, occupiedBy: null, conquest: owner !== null ? false : null
        };
      });
    });
    const galaxy = { planets, clusters, homes };
    applySpaceCutouts(galaxy);
    return galaxy;
  }

  function applySpaceCutouts(target) {
    SPACE_CUTOUTS.forEach(key => {
      delete target.planets?.[key];
      delete target.fleets?.[key];
      target.clusters?.forEach(cluster => { cluster.coords = cluster.coords.filter(coord => coord !== key); });
    });
    if (SPACE_CUTOUTS.includes(target.selected)) target.selected = null;
    if (SPACE_CUTOUTS.includes(target.moveSource)) target.moveSource = null;
    if (target.reachable) target.reachable = target.reachable.filter(key => !SPACE_CUTOUTS.includes(key));
  }

  function isPristineLegacyOpening(target) {
    if (target.round !== 1 || target.players.some(player => player.discard.length || player.bought)) return false;
    return HOME_CLUSTER_OWNERS.every(([clusterIndex,playerId]) => {
      const coords = target.clusters?.[clusterIndex]?.coords || [];
      const planets = coords.map(key => target.planets?.[key]);
      const fleet = target.fleets?.[coords[0]]?.[playerId];
      return planets.length === 3 && planets.every(planet => planet?.owner === playerId) && planets[0].upgrade === 'starbase' && planets[2].upgrade === 'warehouse' && fleet?.scout === 2 && fleet?.frigate === 1 && !fleet?.dreadnought;
    });
  }

  function applyLeanStartingSetup(target) {
    HOME_CLUSTER_OWNERS.forEach(([clusterIndex,playerId]) => {
      const coords = target.clusters[clusterIndex].coords;
      coords.forEach((key,index) => {
        const planet = target.planets[key];
        planet.owner = index === 0 ? playerId : null;
        planet.originalFounder = index === 0 ? playerId : null;
        planet.upgrade = null;
        planet.occupiedBy = null;
        planet.conquest = index === 0 ? false : null;
        delete target.fleets[key];
      });
      target.fleets[coords[0]] = { [playerId]: { scout: 1, frigate: 0, dreadnought: 0 } };
    });
    target.startingSetupRevision = 2;
  }

  function createPlayer(index) {
    const deck = [];
    for (let i = 0; i < 3; i += 1) deck.push(makeCard('colonize'), makeCard('construct'), makeCard('move'));
    deck.push(makeCard('move'));
    return {
      id: index, name: PLAYER_NAMES[index], color: PLAYER_COLORS[index], strategy: PLAYER_STRATEGIES[index],
      resources: { matter: 0, energy: 0, biomass: 2, data: 0 }, deck: shuffled(deck), discard: [], hand: [],
      relics: 0, passed: false, tradeUsed: false, bought: 0, buyLimit: 1, decommissioned: false,
      buyDiscountData: 0, marketManipulated: false, buyStartDiscardIds: [], combatBonus: 0
    };
  }

  function newState() {
    cardSerial = 1;
    const galaxy = generateGalaxy();
    const players = [0,1,2,3].map(createPlayer);
    const fleets = {};
    [...galaxy.homes.entries()].forEach(([clusterIndex, player]) => {
      const starbaseCoord = galaxy.clusters[clusterIndex].coords[0];
      fleets[starbaseCoord] = fleets[starbaseCoord] || {};
      fleets[starbaseCoord][player] = { scout: 1, frigate: 0, dreadnought: 0 };
    });
    const advancedDeck = shuffled(Object.keys(ADVANCED_CARDS).flatMap(key => [makeCard(key), makeCard(key)]));
    return {
      version: 1, startingDeckRevision: 2, mapRevision: 2, startingSetupRevision: 2, round: 1, phase: 'production', firstPlayer: 0, activePlayer: 0, players,
      planets: galaxy.planets, clusters: galaxy.clusters, fleets, advancedDeck, market: [], marketDiscard: [],
      selected: null, actionMode: null, actionCardId: null, actionOptions: {}, moveSource: null, reachable: [],
      turnStage: 'waiting', log: [], awards: { fleet: null, reach: null, occupation: null }, winner: null,
      lastCombat: null
    };
  }

  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function saveTurnHistory() {
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
      if (!parsed || parsed.version !== 1) return false;
      state = parsed;
      cardSerial = Math.max(1, ...state.players.flatMap(p => [...p.deck, ...p.discard, ...p.hand].map(c => Number(String(c.id).split('-').pop()) || 0)), ...state.market.map(c => Number(String(c.id).split('-').pop()) || 0)) + 1;
      if (!state.startingDeckRevision) {
        state.players.forEach(player => { player.deck = shuffled([...player.deck, makeCard('move')]); });
        state.startingDeckRevision = 2;
        clearTurnHistory();
        saveGame();
      }
      if (!state.mapRevision) {
        applySpaceCutouts(state);
        state.mapRevision = 2;
        clearTurnHistory();
        saveGame();
      }
      if (!state.startingSetupRevision && isPristineLegacyOpening(state)) {
        applyLeanStartingSetup(state);
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
    state.fleets[coord][player] = state.fleets[coord][player] || { scout: 0, frigate: 0, dreadnought: 0 };
    return state.fleets[coord][player];
  }

  function fleetCount(fleet) {
    return fleet ? fleet.scout + fleet.frigate + fleet.dreadnought : 0;
  }

  function fleetDice(fleet) {
    return fleet ? fleet.scout + fleet.frigate * 2 + fleet.dreadnought * 4 : 0;
  }

  function fleetMove(fleet) {
    if (!fleet || !fleetCount(fleet)) return 0;
    if (fleet.dreadnought) return 1;
    if (fleet.frigate) return 2;
    return 3;
  }

  function formatFleet(fleet) {
    if (!fleet || !fleetCount(fleet)) return 'No ships';
    const parts = [];
    if (fleet.scout) parts.push(`${fleet.scout} Scout${fleet.scout === 1 ? '' : 's'}`);
    if (fleet.frigate) parts.push(`${fleet.frigate} Frigate${fleet.frigate === 1 ? '' : 's'}`);
    if (fleet.dreadnought) parts.push(`${fleet.dreadnought} Dreadnought${fleet.dreadnought === 1 ? '' : 's'}`);
    return parts.join(', ');
  }

  function playerCapacity(playerId) {
    const warehouses = Object.values(state.planets).filter(p => p.owner === playerId && p.upgrade === 'warehouse' && p.occupiedBy === null).length;
    return 10 + warehouses * 5;
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
    return `<i class="resource-dot ${resource} ${className}" aria-hidden="true"></i>`;
  }

  function resourceDots(cost) {
    const present = RESOURCES.filter(resource => cost?.[resource]);
    if (!present.length) return '<span class="resource-free">Free</span>';
    const label = present.map(resource => `${cost[resource]} ${RESOURCE_NAMES[resource]}`).join(', ');
    const dots = present.map(resource => `<span class="resource-dot-group">${Array.from({ length: cost[resource] }, () => resourceDot(resource)).join('')}</span>`).join('');
    return `<span class="resource-dots" role="img" aria-label="${label}" title="${label}">${dots}</span>`;
  }

  function resourceText(text) {
    return String(text).replace(/\b(Matter|Energy|Biomass|Data)\b/g, match => {
      const resource = match.toLowerCase();
      return `<span class="inline-resource" role="img" aria-label="${match}" title="${match}">${resourceDot(resource)}</span>`;
    });
  }

  function addResources(player, gain) {
    RESOURCES.forEach(resource => { player.resources[resource] += gain[resource] || 0; });
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
    return q >= -6 && q <= 7 && r >= -6 && r <= 7 && q + r >= -6 && q + r <= 8;
  }

  function hostileAt(coord, player) {
    const planet = state.planets[coord];
    if (planet && planet.owner !== null && planet.owner !== player && planet.occupiedBy !== player) return true;
    const fleets = state.fleets[coord] || {};
    return Object.entries(fleets).some(([owner, fleet]) => Number(owner) !== player && fleetCount(fleet));
  }

  function reachableFrom(source, player, range, cannotAttack = false) {
    const distances = new Map([[source,0]]);
    const queue = [source];
    while (queue.length) {
      const current = queue.shift();
      const distance = distances.get(current);
      if (distance >= range) continue;
      for (const next of movementNeighbors(current)) {
        if (distances.has(next)) continue;
        const destinationFleet = getFleet(next, player);
        if (destinationFleet && fleetCount(destinationFleet) + fleetCount(getFleet(source, player)) > 5) continue;
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

  function clusterCount(playerId) {
    return new Set(controlledPlanets(playerId).map(([,p]) => p.cluster)).size;
  }

  function conquestCount(playerId) {
    return controlledPlanets(playerId).filter(([,p]) => p.conquest).length;
  }

  function strongestFleet(playerId) {
    let best = 0;
    Object.values(state.fleets).forEach(group => { best = Math.max(best, fleetDice(group[playerId])); });
    return best;
  }

  function calculatePrestige(playerId) {
    const colonies = controlledPlanets(playerId).length;
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase').length;
    const relics = state.players[playerId].relics;
    const awards = Object.values(state.awards).filter(owner => owner === playerId).length * 2;
    return colonies + starbases + relics + awards;
  }

  function updateAward(key, values, threshold) {
    const top = Math.max(...values);
    if (top < threshold) { state.awards[key] = null; return; }
    const leaders = values.map((value,index) => value === top ? index : -1).filter(index => index >= 0);
    if (leaders.length === 1) state.awards[key] = leaders[0];
    else if (!leaders.includes(state.awards[key])) state.awards[key] = null;
  }

  function evaluateAwards() {
    updateAward('fleet', state.players.map((_,i) => strongestFleet(i)), 10);
    updateAward('reach', state.players.map((_,i) => clusterCount(i)), 7);
    updateAward('occupation', state.players.map((_,i) => conquestCount(i)), 3);
  }

  function produceAll() {
    state.players.forEach((player, playerId) => {
      controlledPlanets(playerId).forEach(([,planet]) => {
        if (planet.occupiedBy !== null) return;
        let amount = 1;
        if (planet.rich) amount += 1;
        if (planet.upgrade === 'harvester') amount += 1;
        player.resources[planet.type] += amount;
      });
    });
    logEvent('Every controlled, unoccupied planet produced resources.');
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
    if (state.activePlayer !== 0) aiTimer = setTimeout(runAiOperation, 650);
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
    const player = state.players[playerId];
    if (playerId === 0) completeHumanTurn();
    player.passed = true;
    logEvent(`${player.name} passed for the rest of Operations.`);
    if (playerId === 0) toast('You have passed for this round.');
    nextOperationsPlayer();
  }

  function clearAction() {
    state.actionMode = null;
    state.actionCardId = null;
    state.actionOptions = {};
    state.moveSource = null;
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
    if (state.phase !== 'operations' || state.activePlayer !== 0 || state.turnStage !== 'prep') return;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    const definition = ALL_CARDS[card.key];
    addResources(player, definition.resource || {});
    if (definition.wildcard) player.resources.data += definition.wildcard;
    removeHandCard(player, cardId);
    logEvent(`You converted ${definition.name} into resources.`);
    render();
    saveGame();
  }

  function playOrder(cardId) {
    const player = state.players[0];
    if (state.phase !== 'operations' || state.activePlayer !== 0 || state.turnStage !== 'action') return;
    const card = player.hand.find(item => item.id === cardId);
    if (!card) return;
    const definition = ALL_CARDS[card.key];
    if (definition.reaction || definition.buyEffect) { toast('That card waits for its printed timing.'); return; }
    if (definition.order === 'special') {
      resolveHumanSpecial(card, definition);
      return;
    }
    state.actionMode = definition.order;
    state.actionCardId = cardId;
    state.actionOptions = { tag: definition.tag || null, cardName: definition.name };
    state.moveSource = null;
    state.reachable = [];
    toast(definition.order === 'move' ? 'Select one of your fleets.' : definition.order === 'construct' ? 'Select one of your controlled planets.' : 'Select an eligible planet containing your Scout.');
    render();
  }

  function resolveHumanSpecial(card, definition) {
    const player = state.players[0];
    if (definition.tag === 'surge') {
      const byCluster = new Map();
      controlledPlanets(0).forEach(([key,planet]) => {
        if (planet.occupiedBy !== null) return;
        if (!byCluster.has(planet.cluster)) byCluster.set(planet.cluster, []);
        byCluster.get(planet.cluster).push(planet);
      });
      const best = [...byCluster.values()].sort((a,b) => b.length - a.length)[0] || [];
      best.slice(0,3).forEach(planet => { player.resources[planet.type] += planet.rich ? 2 : 1; });
      removeHandCard(player, card.id);
      completeAction(0, `You used Industrial Surge on ${Math.min(3,best.length)} planets.`);
    } else if (definition.tag === 'foresight') {
      drawCards(player, 3);
      if (player.hand.length) player.discard.push(player.hand.shift());
      removeHandCard(player, card.id);
      completeAction(0, 'You used Tactical Foresight to reshape your hand.');
    } else if (definition.tag === 'brokerage') {
      const trashTarget = player.discard.find(c => BASIC_CARDS[c.key]);
      if (trashTarget) player.discard.splice(player.discard.indexOf(trashTarget),1);
      drawCards(player,2);
      removeHandCard(player, card.id);
      completeAction(0, `You used Data Brokerage${trashTarget ? ` and removed ${ALL_CARDS[trashTarget.key].name}` : ''}.`);
    } else if (definition.tag === 'uplink') {
      const basic = player.discard.find(c => BASIC_CARDS[c.key]);
      if (basic) {
        player.discard.splice(player.discard.indexOf(basic),1);
        player.hand.push(basic);
      }
      removeHandCard(player, card.id);
      completeAction(0, `You activated Command Uplink${basic ? ` and recovered ${ALL_CARDS[basic.key].name}` : ''}.`);
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
        player.resources[scarce] += 1;
      } else {
        player.resources.data += 1;
      }
      removeHandCard(player, card.id);
      completeAction(0, 'You used the Trade Consortium network.');
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
      state.moveSource = key;
      const definition = ALL_CARDS[state.players[0].hand.find(c => c.id === state.actionCardId)?.key];
      let range = fleetMove(fleet);
      if (state.actionOptions.tag === 'overdrive') range += 2;
      if (state.actionOptions.tag === 'pathfinder') range += 1;
      state.reachable = reachableFrom(key,0,range,state.actionOptions.tag === 'pathfinder');
      toast('Now select a highlighted destination.');
      return;
    }
    if (!state.reachable.includes(key)) { toast('That destination is outside this fleet’s range.'); return; }
    executeMove(0,state.moveSource,key,state.actionOptions);
    discardActionCard(0);
    completeAction(0, `You moved a fleet from ${nameForCoord(state.moveSource)} to ${nameForCoord(key)}.`);
  }

  function discardActionCard(playerId) {
    const player = state.players[playerId];
    if (state.actionCardId) removeHandCard(player,state.actionCardId);
  }

  function nameForCoord(key) {
    return state.planets[key]?.name || 'empty space';
  }

  function executeMove(playerId, source, destination, options = {}) {
    const moving = getFleet(source,playerId);
    if (!moving || !fleetCount(moving)) return false;
    const sourceSnapshot = clone(moving);
    delete state.fleets[source][playerId];
    if (!Object.keys(state.fleets[source]).length) delete state.fleets[source];
    const target = ensureFleet(destination,playerId);
    Object.keys(sourceSnapshot).forEach(type => { target[type] += sourceSnapshot[type]; });
    if (hostileAt(destination,playerId)) resolveCombat(playerId,destination,source,options);
    return true;
  }

  function combatPieces(playerId, coord, includeStarbase) {
    const pieces = [];
    const fleet = getFleet(coord,playerId);
    if (fleet) Object.keys(SHIP_STATS).forEach(type => {
      for (let i=0;i<fleet[type];i+=1) pieces.push({ type, hull: SHIP_STATS[type].hull, dice: SHIP_STATS[type].dice, damage: 0 });
    });
    if (includeStarbase) pieces.push({ type:'starbase', hull:3, dice:3, damage:0 });
    return pieces;
  }

  function findDefender(coord, attacker) {
    const fleets = state.fleets[coord] || {};
    const fleetOwner = Object.keys(fleets).map(Number).find(owner => owner !== attacker && fleetCount(fleets[owner]));
    if (fleetOwner !== undefined) return fleetOwner;
    const planet = state.planets[coord];
    return planet && planet.owner !== null && planet.owner !== attacker ? planet.owner : null;
  }

  function rollHits(dice) {
    let hits = 0;
    const rolls = [];
    for (let i=0;i<dice;i+=1) { const roll = 1 + Math.floor(Math.random()*6); rolls.push(roll); if (roll >= 5) hits += 1; }
    return { hits, rolls };
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
    const order = { scout:0, frigate:1, starbase:2, dreadnought:3 };
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
    let forcedAttack = options.tag === 'overdrive';
    let volley = 0;
    for (; volley < 3 && attackerPieces.some(p => p.damage < p.hull) && defenderPieces.some(p => p.damage < p.hull); volley += 1) {
      let attackerDice = attackerPieces.filter(p => p.damage < p.hull).reduce((s,p) => s+p.dice,0) + (volley === 0 && options.tag === 'assault' ? 2 : 0);
      let defenderDice = defenderPieces.filter(p => p.damage < p.hull).reduce((s,p) => s+p.dice,0);
      let attackRoll = rollHits(attackerDice);
      let defendRoll = rollHits(defenderDice);
      if (useReaction(attackerId,'reroll')) attackRoll.hits += Math.min(2, attackRoll.rolls.filter(r => r < 5).length) > 0 ? rollHits(Math.min(2, attackRoll.rolls.filter(r => r < 5).length)).hits : 0;
      if (useReaction(defenderId,'reroll')) defendRoll.hits += Math.min(2, defendRoll.rolls.filter(r => r < 5).length) > 0 ? rollHits(Math.min(2, defendRoll.rolls.filter(r => r < 5).length)).hits : 0;
      const attackPrevent = useReaction(attackerId,'prevent') ? 2 : 0;
      const defendPrevent = useReaction(defenderId,'prevent') ? 2 : 0;
      const attackerDestroyed = applyCombatHits(attackerPieces,Math.max(0,defendRoll.hits-attackPrevent));
      const defenderDestroyed = applyCombatHits(defenderPieces,Math.max(0,attackRoll.hits-defendPrevent));
      summary.push(`Volley ${volley+1}: ${state.players[attackerId].name} ${attackRoll.hits} hit${attackRoll.hits===1?'':'s'}, ${state.players[defenderId].name} ${defendRoll.hits} hit${defendRoll.hits===1?'':'s'}.`);
      const aAlive = attackerPieces.filter(p => p.damage < p.hull);
      const dAlive = defenderPieces.filter(p => p.damage < p.hull);
      if (!aAlive.length || !dAlive.length) break;
      const aPower = aAlive.reduce((s,p)=>s+p.dice,0);
      const dPower = dAlive.reduce((s,p)=>s+p.dice,0);
      const attackerJump = !forcedAttack && aPower < dPower * .55 && useReaction(attackerId,'jump');
      if (attackerJump) { applyCombatHits(attackerPieces,1); summary.push(`${state.players[attackerId].name} made an Emergency Jump.`); break; }
      const attackerRetreats = !forcedAttack && volley > 0 && aPower < dPower * .65;
      if (attackerRetreats) break;
    }
    syncCombatPieces(attackerId,coord,attackerPieces);
    syncCombatPieces(defenderId,coord,defenderPieces);
    const attackerFleet = getFleet(coord,attackerId);
    const defenderFleet = getFleet(coord,defenderId);
    const starbaseStill = planet && planet.owner === defenderId && planet.upgrade === 'starbase';
    let outcome;
    if (!fleetCount(attackerFleet)) {
      outcome = `${state.players[attackerId].name}'s fleet was destroyed.`;
    } else if (!fleetCount(defenderFleet) && !starbaseStill) {
      outcome = `${state.players[attackerId].name} seized the hex.`;
      if (planet && planet.owner !== null && planet.owner !== attackerId) planet.occupiedBy = attackerId;
    } else {
      const retreat = findRetreat(coord,attackerId,origin);
      if (retreatFleet(coord,retreat,attackerId)) outcome = `${state.players[attackerId].name} retreated to ${nameForCoord(retreat)}.`;
      else outcome = `${state.players[attackerId].name} could not retreat and was lost.`;
    }
    const destroyedCount = summary.join(' ').length ? 1 : 0;
    const salvage = useReaction(attackerId,'salvage') || useReaction(defenderId,'salvage');
    if (salvage && destroyedCount) {
      const owner = state.players.findIndex(p => p.discard.some(c => c.key === 'salvageCrews' && c === p.discard[p.discard.length-1]));
      if (owner >= 0) state.players[owner].resources.matter += 1;
    }
    state.lastCombat = { attackerId, defenderId, coord, summary, outcome };
    logEvent(`${state.players[attackerId].name} attacked ${state.players[defenderId].name} at ${nameForCoord(coord)}. ${outcome}`);
    if (attackerId === 0 || defenderId === 0) showMessage('COMBAT REPORT', nameForCoord(coord), [...summary,outcome].join(' '));
  }

  function colonizePlanet(playerId, coord, options = {}) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || !fleet || fleet.scout < 1) return false;
    const capture = planet.owner !== null && planet.owner !== playerId && planet.occupiedBy === playerId;
    if (planet.owner !== null && !capture) return false;
    const cost = { biomass: capture ? 1 : (options.tag === 'dropColony' ? 1 : 2) };
    if (!payCost(player,cost)) return false;
    if (options.tag !== 'dropColony') fleet.scout -= 1;
    if (!fleetCount(fleet)) {
      delete state.fleets[coord][playerId];
      if (!Object.keys(state.fleets[coord]).length) delete state.fleets[coord];
    }
    if (capture) {
      planet.owner = playerId;
      planet.upgrade = null;
      planet.occupiedBy = null;
      planet.conquest = true;
      logEvent(`${player.name} captured ${planet.name}.`);
    } else {
      planet.owner = playerId;
      planet.originalFounder = playerId;
      planet.conquest = false;
      if (planet.special === 'ruin' && !planet.relicClaimed) {
        planet.relicClaimed = true;
        player.relics += 1;
        logEvent(`${player.name} recovered a Relic at ${planet.name}.`);
      }
      logEvent(`${player.name} colonized ${planet.name}.`);
    }
    return true;
  }

  function countPlacedShips(playerId,type) {
    return Object.values(state.fleets).reduce((sum,group)=>sum+(group[playerId]?.[type]||0),0);
  }

  function canPlaceShip(playerId,type) {
    const limits = { scout:8, frigate:6, dreadnought:3 };
    return countPlacedShips(playerId,type) < limits[type];
  }

  function buildUpgrade(playerId, coord, type, discountMatter = 0) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    if (!planet || planet.owner !== playerId || planet.occupiedBy !== null || planet.upgrade) return false;
    if (!payCost(player,STRUCTURES[type].cost,0,discountMatter)) return false;
    planet.upgrade = type;
    return true;
  }

  function buildShip(playerId, coord, type, discountEnergy = 0) {
    const player = state.players[playerId];
    const planet = state.planets[coord];
    const fleet = getFleet(coord,playerId);
    if (!planet || planet.owner !== playerId || planet.upgrade !== 'starbase' || planet.occupiedBy !== null) return false;
    if (fleetCount(fleet) >= 5 || !canPlaceShip(playerId,type) || !payCost(player,SHIP_STATS[type].cost,0,0,discountEnergy)) return false;
    ensureFleet(coord,playerId)[type] += 1;
    return true;
  }

  function contextBuild(kind, coord) {
    if (state.actionMode !== 'construct' || state.activePlayer !== 0) return;
    const player = state.players[0];
    let success = false;
    if (STRUCTURES[kind]) success = buildUpgrade(0,coord,kind);
    if (SHIP_STATS[kind]) success = buildShip(0,coord,kind);
    if (!success) { toast('That build is not currently legal or affordable.'); return; }
    const label = STRUCTURES[kind]?.name || SHIP_STATS[kind].name;
    discardActionCard(0);
    completeAction(0,`You built ${label} at ${nameForCoord(coord)}.`);
  }

  function contextColonize(coord) {
    if (state.actionMode !== 'colonize' || state.activePlayer !== 0) return;
    if (!colonizePlanet(0,coord,state.actionOptions)) { toast('You need an eligible Scout and the required resources.'); return; }
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
      addResources(player,ALL_CARDS[card.key].resource);
      removeHandCard(player,card.id);
    }
  }

  function findColonizeTarget(playerId) {
    return Object.keys(state.planets).find(coord => {
      const planet = state.planets[coord];
      const fleet = getFleet(coord,playerId);
      return fleet?.scout > 0 && (planet.owner === null || (planet.owner !== playerId && planet.occupiedBy === playerId));
    }) || null;
  }

  function chooseAiBuild(playerId) {
    const player = state.players[playerId];
    const openPlanets = controlledPlanets(playerId).filter(([,p]) => !p.upgrade && p.occupiedBy === null);
    const starbases = controlledPlanets(playerId).filter(([,p]) => p.upgrade === 'starbase' && p.occupiedBy === null);
    const options = [];
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
    for (const [coord] of starbases) {
      for (const type of ['scout','frigate','dreadnought']) if (canPlaceShip(playerId,type) && fleetCount(getFleet(coord,playerId)) < 5) options.push({kind:type,coord,cost:SHIP_STATS[type].cost,score:type==='scout'?6:type==='frigate'?7:8});
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
      if (current !== source && planet && (military ? planet.owner !== null && planet.owner !== playerId : planet.owner === null)) { goal = current; break; }
      for (const next of movementNeighbors(current)) if (!came.has(next)) { came.set(next,current); queue.push(next); }
    }
    if (!goal) return null;
    const path = [goal];
    while (came.get(path[0]) && came.get(path[0]) !== source) path.unshift(came.get(path[0]));
    return path;
  }

  function chooseAiMove(playerId) {
    const military = state.players[playerId].strategy === 'military';
    const fleets = Object.entries(state.fleets).filter(([,group]) => fleetCount(group[playerId]));
    let best = null;
    fleets.forEach(([source,group]) => {
      const path = nearestGoal(source,playerId,military);
      if (!path?.length) return;
      const range = fleetMove(group[playerId]);
      let destination = source;
      for (let i=0;i<Math.min(range,path.length);i+=1) {
        const candidate = path[i];
        destination = candidate;
        if (hostileAt(candidate,playerId)) break;
      }
      const score = (military ? fleetDice(group[playerId]) : group[playerId].scout * 3) - path.length * .1;
      if (!best || score > best.score) best = { source,destination,score };
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
      let built = STRUCTURES[build.kind] ? buildUpgrade(id,build.coord,build.kind) : buildShip(id,build.coord,build.kind);
      if (built) {
        aiPlayCard(player,constructCard);
        completeAction(id,`${player.name} built ${STRUCTURES[build.kind]?.name || SHIP_STATS[build.kind].name} at ${nameForCoord(build.coord)}.`);
        return;
      }
    }
    const moveCard = player.hand.find(card => ALL_CARDS[card.key].order === 'move');
    const move = chooseAiMove(id);
    if (moveCard && move && move.destination !== move.source) {
      const definition = ALL_CARDS[moveCard.key];
      executeMove(id,move.source,move.destination,{tag:definition.tag});
      aiPlayCard(player,moveCard);
      completeAction(id,`${player.name} moved a fleet toward ${nameForCoord(move.destination)}.`);
      return;
    }
    const special = player.hand.find(card => ALL_CARDS[card.key].tag === 'surge');
    if (special) {
      const worlds = controlledPlanets(id).filter(([,p])=>p.occupiedBy===null).slice(0,3).map(([,p])=>p);
      worlds.forEach(planet=>{ player.resources[planet.type] += planet.rich?2:1; });
      aiPlayCard(player,special);
      completeAction(id,`${player.name} triggered an Industrial Surge.`);
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
    if (state.activePlayer !== 0) aiTimer = setTimeout(runAiBuy,550);
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
    if (discount) player.buyDiscountData = 0;
    fillMarket();
    logEvent(`${player.name} acquired ${definition.name}.`);
    return true;
  }

  function useBuyEffect(cardId) {
    const player = state.players[0];
    const card = player.hand.find(c=>c.id===cardId);
    const definition = card && ALL_CARDS[card.key];
    if (!definition?.buyEffect || state.phase !== 'buy' || state.activePlayer !== 0) return;
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
    const [card] = player.discard.splice(index,1);
    player.resources.data -= 1;
    player.decommissioned = true;
    logEvent(`${player.name} Decommissioned ${ALL_CARDS[card.key].name}.`);
    return true;
  }

  function runAiBuy() {
    const id = state.activePlayer;
    const player = state.players[id];
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
    const removable = player.discard.find(card=>BASIC_CARDS[card.key] && player.buyStartDiscardIds.includes(card.id));
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
    const contenders = state.players.map((_,id)=>({id,prestige:calculatePrestige(id),colonies:controlledPlanets(id).length,resources:totalResources(state.players[id])})).filter(p=>p.prestige>=15).sort((a,b)=>b.prestige-a.prestige||b.colonies-a.colonies||b.resources-a.resources);
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
    if (accepted) {
      const rivalNeed = rival.resources[giveType] < 2 ? 1.45 : 1;
      const humanNeed = rival.resources[getType] < 2 ? .7 : 1;
      accepted = giveAmount * rivalNeed >= getAmount * humanNeed * .9;
    }
    if (accepted) {
      human.resources[giveType] -= giveAmount; rival.resources[giveType] += giveAmount;
      rival.resources[getType] -= getAmount; human.resources[getType] += getAmount;
      $('#trade-response').textContent = `${rival.name} accepted the exchange.`;
      completeAction(0,`${rival.name} accepted your trade.`);
    } else {
      $('#trade-response').textContent = `${rival.name} rejected the offer.`;
      completeAction(0,`${rival.name} rejected your trade offer.`);
    }
  }

  function showMessage(kicker,title,body) {
    $('#message-kicker').textContent = kicker;
    $('#message-title').textContent = title;
    $('#message-body').textContent = body;
    const dialog = $('#message-dialog');
    if (!dialog.open) dialog.showModal();
  }

  function toast(message, cost = null, suffix = '') {
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
    if (!planet || planet.owner === null) return '';
    return boardIcon('colony') + (planet.upgrade ? boardIcon(planet.upgrade) : '');
  }

  function renderSymbolLegend() {
    const entries = [
      ['scout','Scout'],['frigate','Frigate'],['dreadnought','Dreadnought'],
      ['colony','Colony'],['harvester','Harvester'],['starbase','Shipyard'],['warehouse','Warehouse']
    ];
    $('#symbol-legend').innerHTML = entries.map(([type,label]) => {
      const cost = type === 'colony' ? { biomass: 2 } : SHIP_STATS[type]?.cost || STRUCTURES[type]?.cost;
      return `<span class="tooltip-anchor symbol-legend-item" tabindex="0" data-tooltip="${LEGEND_TOOLTIPS[type]}" aria-label="${label}. ${LEGEND_TOOLTIPS[type]}"><span class="symbol-legend-name">${BOARD_ICONS[type]}${label}</span><span class="symbol-legend-cost">${resourceDots(cost)}</span></span>`;
    }).join('');
  }

  function renderBoard() {
    const board = $('#galaxy-board');
    if (!board.dataset.built) {
      for (let r=-6;r<=7;r+=1) {
        const row = document.createElement('div'); row.className = 'map-row';
        const qMin = Math.max(-6,-6-r); const qMax = Math.min(7,8-r);
        const rowScreenX = qMin + r/2;
        row.style.transform = `translateX(${((rowScreenX+6)/14.5)*100}%)`;
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
      hex.className = `hex ${planet ? planet.type : 'space'}`;
      if (state.selected === key) hex.classList.add('selected');
      if (state.moveSource === key) hex.classList.add('source');
      if (state.reachable.includes(key)) hex.classList.add('target');
      const fleets = hex.querySelector('.hex-fleets'); const buildings = hex.querySelector('.hex-buildings'); const special = hex.querySelector('.special');
      const owners = new Set();
      if (planet?.owner !== null && planet?.owner !== undefined) owners.add(planet.owner);
      Object.entries(state.fleets[key]||{}).forEach(([owner,fleet])=>{if(fleetCount(fleet))owners.add(Number(owner));});
      const owner = [...owners][0];
      hex.style.setProperty('--owner',owner===undefined?'transparent':PLAYER_COLORS[owner]);
      fleets.innerHTML = fleetSymbolsAt(key);
      if (planet) {
        buildings.innerHTML = buildingSymbols(planet);
        special.textContent = planet.special==='rich'?'★':planet.special==='ruin'?'✦':planet.special==='gate'?'⇄':'';
        const buildingText = planet.owner === null ? '' : `, Colony${planet.upgrade ? `, ${STRUCTURES[planet.upgrade].name}` : ''}`;
        const fleetText = fleetAriaAt(key);
        hex.setAttribute('aria-label',`${planet.name}, ${planet.type}, ${planet.owner===null?'unclaimed':state.players[planet.owner].name}${buildingText}${fleetText ? `, fleet ${fleetText}` : ''}${planet.occupiedBy!==null?', occupied':''}`);
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
      return `<article class="score-card ${active?'active':''}" style="--player:${player.color}"><div class="score-top"><span class="score-name">${player.name}</span><span class="score-value">${calculatePrestige(id)}</span></div><div class="score-meta"><span>${controlledPlanets(id).length} colonies</span><span>${clusterCount(id)} clusters</span><span>${strongestFleet(id)} fleet</span></div></article>`;
    }).join('');
  }

  function renderResources() {
    const player = state.players[0];
    $('#capacity-value').textContent = `${totalResources(player)} / ${playerCapacity(0)}`;
    $('#resource-grid').innerHTML = RESOURCES.map(resource=>`<div class="resource-box" style="--resource:var(--${resource})" aria-label="${RESOURCE_NAMES[resource]}: ${player.resources[resource]}" title="${RESOURCE_NAMES[resource]}"><span>${resourceDot(resource)}</span><strong>${player.resources[resource]}</strong></div>`).join('');
  }

  function renderInspector() {
    const key = state.selected;
    const title = $('#inspect-title'); const coordinate = $('#inspect-coordinate'); const detail = $('#inspect-detail'); const facts = $('#inspect-facts'); const actions = $('#context-actions');
    actions.innerHTML='';
    if (!key) { title.textContent='Select a hex'; coordinate.textContent='—'; detail.textContent='Choose a planet or space hex to inspect fleets, control, and possible actions.'; facts.innerHTML=''; return; }
    const planet = state.planets[key]; const fleets = state.fleets[key]||{};
    coordinate.textContent=key;
    if (planet) {
      title.textContent=planet.name;
      const owner = planet.owner===null?'Unclaimed':state.players[planet.owner].name;
      detail.innerHTML=`${resourceDot(planet.type,'resource-dot-large')} planet · ${owner}${planet.occupiedBy!==null?` · Occupied by ${state.players[planet.occupiedBy].name}`:''}`;
      facts.innerHTML=`<div class="fact"><span>Production</span><strong>${resourceDots({ [planet.type]: 1+(planet.rich?1:0)+(planet.upgrade==='harvester'?1:0) })}</strong></div><div class="fact"><span>Upgrade</span><strong>${planet.upgrade?STRUCTURES[planet.upgrade].name:'Open slot'}</strong></div>${Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${state.players[owner].name}</span><strong>${formatFleet(f)}</strong></div>`).join('')}`;
    } else {
      title.textContent='Empty Space'; detail.textContent='Fleets may move, fight, and retreat here.';
      facts.innerHTML=Object.entries(fleets).filter(([,f])=>fleetCount(f)).map(([owner,f])=>`<div class="fact"><span>${state.players[owner].name}</span><strong>${formatFleet(f)}</strong></div>`).join('')||'<div class="fact"><span>Status</span><strong>Vacant</strong></div>';
    }
    if (state.phase==='operations' && state.activePlayer===0 && state.turnStage==='action') {
      if (state.actionMode==='construct' && planet?.owner===0 && planet.occupiedBy===null) {
        if (!planet.upgrade) Object.keys(STRUCTURES).forEach(kind=>actions.appendChild(actionButton(`Build ${STRUCTURES[kind].name}`,()=>contextBuild(kind,key),canAfford(state.players[0],STRUCTURES[kind].cost),STRUCTURES[kind].cost)));
        if (planet.upgrade==='starbase') Object.keys(SHIP_STATS).forEach(kind=>actions.appendChild(actionButton(`Commission ${SHIP_STATS[kind].name}`,()=>contextBuild(kind,key),canAfford(state.players[0],SHIP_STATS[kind].cost)&&fleetCount(getFleet(key,0))<5&&canPlaceShip(0,kind),SHIP_STATS[kind].cost)));
      }
      if (state.actionMode==='colonize' && planet) {
        const capture=planet.owner!==null&&planet.owner!==0&&planet.occupiedBy===0;
        const eligible=(planet.owner===null||capture)&&getFleet(key,0)?.scout>0;
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
      ['Fleet Supremacy',state.awards.fleet,'Strongest single fleet · minimum 10 dice'],
      ['Galactic Reach',state.awards.reach,'Most colonized clusters · minimum 7'],
      ['Occupation Mandate',state.awards.occupation,'Most conquest-marked Colonies · minimum 3']
    ];
    $('#award-list').innerHTML=rows.map(([name,owner,desc])=>`<div class="award"><strong>${name}</strong><span>${owner===null?'Unclaimed':state.players[owner].name}</span><small>${desc}</small></div>`).join('');
  }

  function renderLog() {
    $('#game-log').innerHTML=state.log.slice(0,18).map(item=>`<li>${item}</li>`).join('');
  }

  function cardMarkup(card, location) {
    const definition=ALL_CARDS[card.key];
    const isHumanOps=state.phase==='operations'&&state.activePlayer===0;
    const canResource=location==='hand'&&isHumanOps&&state.turnStage==='prep'&&definition.resource;
    const canOrder=location==='hand'&&isHumanOps&&state.turnStage==='action'&&definition.order&&!definition.reaction&&!definition.buyEffect;
    const canBuyEffect=location==='hand'&&state.phase==='buy'&&state.activePlayer===0&&definition.buyEffect&&!(definition.buyEffect==='manipulation'&&state.players[0].marketManipulated);
    return `<article class="game-card" style="--card-accent:${definition.accent}"><span class="card-type">${definition.kind}</span><span class="card-name">${definition.name}</span><span class="card-effect">${resourceText(definition.text)}</span><div class="card-footer"><span>${definition.resource?`<small>Gain</small>${resourceDots(definition.resource)}`:''}</span><span>${definition.cost?`<small>Buy</small>${resourceDots(definition.cost)}`:''}</span></div>${location==='hand'?`<div class="card-buttons">${canResource?`<button class="button" data-resource-card="${card.id}">Take resources</button>`:''}${canOrder?`<button class="button button-primary" data-order-card="${card.id}">Use order</button>`:''}${canBuyEffect?`<button class="button button-primary" data-buy-effect="${card.id}">Use in Buy</button>`:''}${definition.reaction&&isHumanOps?'<span class="muted">Automatic reaction</span>':''}</div>`:''}</article>`;
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
    $('#hand-help').textContent=prep?'Convert any cards you want, then choose an order.':state.turnStage==='action'?'Play one order card, make a Trade action, or pass.':'Your cards remain available through Buy, then all are discarded.';
  }

  function renderMarket() {
    const humanBuy=state.phase==='buy'&&state.activePlayer===0;
    $('#basic-market').innerHTML=Object.entries(BASIC_CARDS).map(([key,def])=>`<span class="tooltip-anchor basic-market-item" data-tooltip="${BASIC_TOOLTIPS[key]}"><button class="button" data-buy-basic="${key}" aria-label="${def.name}. ${BASIC_TOOLTIPS[key]}" ${!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData)?'disabled':''}><span>${def.name}</span>${resourceDots(def.cost)}</button></span>`).join('');
    $('#market-row').innerHTML=state.market.map((card,index)=>{
      const def=ALL_CARDS[card.key];
      const disabled=!humanBuy||state.players[0].bought>=state.players[0].buyLimit||!canAfford(state.players[0],def.cost,state.players[0].buyDiscountData);
      return `<button class="game-card" style="--card-accent:${def.accent}" data-buy-market="${index}" ${disabled?'disabled':''}><span class="card-type">${def.kind}</span><span class="card-name">${def.name}</span><span class="card-effect">${resourceText(def.text)}</span><span class="card-footer"><small>Buy</small>${resourceDots(def.cost)}</span></button>`;
    }).join('');
    $$('[data-buy-basic]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'basic',button.dataset.buyBasic)){render();saveGame();}}));
    $$('[data-buy-market]').forEach(button=>button.addEventListener('click',()=>{if(buyCard(0,'market',Number(button.dataset.buyMarket))){render();saveGame();}}));
    $('#finish-buy-button').hidden=!humanBuy;
    const eligible=state.players[0].discard.filter(card=>state.players[0].buyStartDiscardIds.includes(card.id));
    $('#decommission-area').innerHTML=humanBuy?`<div class="decommission-list"><strong>Decommission ${resourceDots({ data: 1 })}</strong>${eligible.length?eligible.map(card=>`<button class="button" data-trash="${card.id}" ${state.players[0].decommissioned||state.players[0].resources.data<1?'disabled':''}>${ALL_CARDS[card.key].name}</button>`).join(''):'<span class="muted">No eligible discarded cards</span>'}</div>`:'';
    $$('[data-trash]').forEach(button=>button.addEventListener('click',()=>{if(decommission(0,button.dataset.trash)){render();saveGame();}}));
  }

  function renderFleetSummary() {
    $('#fleet-summary').innerHTML=state.players.map((player,id)=>{
      const totals={scout:0,frigate:0,dreadnought:0};
      Object.values(state.fleets).forEach(group=>Object.keys(totals).forEach(type=>{totals[type]+=group[id]?.[type]||0;}));
      return `<div class="fleet-faction" style="--player:${player.color}"><strong>${player.name}</strong><span>${totals.scout} Scouts · ${totals.frigate} Frigates · ${totals.dreadnought} Dreadnoughts<br>${strongestFleet(id)} strongest-fleet dice</span></div>`;
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
  }

  function renderHeader() {
    $('#round-value').textContent=state.round;
    $('#phase-value').textContent=state.phase[0].toUpperCase()+state.phase.slice(1);
    $('#active-value').textContent=state.winner!==null?'Game over':state.players[state.activePlayer].name;
    const humanTurn=state.activePlayer===0&&!state.winner;
    $('#turn-dot').style.background=state.players[state.activePlayer]?.color||'var(--cyan)';
    $('#turn-title').textContent=state.winner!==null?`${state.players[state.winner].name} won`:humanTurn?'Your turn':`${state.players[state.activePlayer].name} is acting`;
    let instruction='';
    if(state.phase==='operations')instruction=humanTurn?(state.turnStage==='prep'?'Prepare resources, then choose one action.':'Choose one order, Trade action, or pass.'):'Computer rival is evaluating the board…';
    else if(state.phase==='buy')instruction=humanTurn?'Buy up to your limit, optionally Decommission, then finish.':'Computer rival is shopping the market…';
    else instruction='Resolving automatic bookkeeping…';
    $('#turn-instruction').textContent=instruction;
    $('#pass-button').hidden=!(state.phase==='operations'&&humanTurn&&(state.turnStage==='prep'||state.turnStage==='action'));
    const undoButton=$('#undo-turn-button');
    undoButton.disabled=!turnHistory.undo;
    undoButton.title=turnHistory.undo?`Restore the start of your ${turnHistory.undo.label}`:'Available after you complete a turn';
  }

  function render() {
    renderHeader(); renderScoreboard(); renderBoard(); renderResources(); renderInspector(); renderAwards(); renderLog(); renderHand(); renderMarket(); renderFleetSummary(); renderTrade();
  }

  function switchTab(name) {
    $$('.console-tab').forEach(tab=>{const active=tab.dataset.tab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));});
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
    $$('.console-tab').forEach(tab=>tab.addEventListener('click',()=>switchTab(tab.dataset.tab)));
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
    if (!state.winner && state.activePlayer!==0) aiTimer=setTimeout(state.phase==='operations'?runAiOperation:runAiBuy,650);
  }
})();
