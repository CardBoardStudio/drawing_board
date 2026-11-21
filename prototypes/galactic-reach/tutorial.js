// Learn to play (index.html?tutorial=1): a seeded game against rivals that hold still, taught
// through the real table one step at a time. Each step points at the real element to use and
// waits for the player's own action, read back from the game state (docs/rules/tutorial.md).
// Between lessons the walkthrough may stage a position (a supply of resources, a card into
// your hand, a unit moved ahead) and says so in the coach mark and the game log. Its game and
// progress use their own storage keys, so a guest save is never touched.
(() => {
  'use strict';
  const params = new URLSearchParams(globalThis.location?.search || '');
  if (params.get('tutorial') !== '1') { globalThis.galacticReachTutorial = { active: false }; return; }

  const RULES = 'galactic-reach/38.43';
  const PROGRESS = 'galactic-reach-tutorial-progress-v1';
  const SEED = 20261116;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const RES = ['matter', 'energy', 'biomass', 'data'];
  const NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Life', data: 'Data' };
  const costText = cost => RES.filter(r => cost[r]).map(r => `${cost[r]} ${NAMES[r]}`).join(', ');

  function seeded(seed) { let v = seed >>> 0; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 0x100000000; }; }
  // Choosing Learn to play resumes only a walkthrough left part-way: past its first step and not
  // finished, which is when the menu and welcome note offer "Continue Learn to play". Otherwise it
  // deals the practice game again, before app.js reads it, so a fresh Lesson 1 never sits on an
  // earlier practice table. A reload or Back/Forward stays in the same walkthrough. Unreadable
  // progress cannot be resumed and counts as not part-way; the guest save is never touched.
  function partWay() {
    try { const saved = JSON.parse(localStorage.getItem(PROGRESS) || 'null'); return Number.isInteger(saved?.step) && saved.step > 0 && saved.stepId !== 'finished'; } catch { return false; }
  }
  function entered() {
    try { return (globalThis.performance?.getEntriesByType?.('navigation')[0]?.type || 'navigate') === 'navigate'; } catch { return true; }
  }
  if (entered() && !partWay()) clearTutorial();
  // Another tab restarted the walkthrough or began a new one: follow it here, so this tab never
  // writes the earlier practice game or place back over it.
  globalThis.addEventListener?.('storage', event => { if (event.key === PROGRESS && event.newValue === null) location.reload(); });
  // Reviewing an earlier step (Back) is not a place: a reload returns to the current step.
  function loadProgress() {
    try { const saved = JSON.parse(localStorage.getItem(PROGRESS) || 'null'); if (saved && saved.rules === RULES && Number.isInteger(saved.step)) return { ...saved, view: saved.step }; } catch { /* fresh */ }
    return { rules: RULES, step: 0, view: 0, base: null, staged: {}, cardFirst: true };
  }
  let progress = loadProgress();
  function saveProgress() { try { localStorage.setItem(PROGRESS, JSON.stringify(progress)); } catch { /* not saved */ } }
  // A guest game already saved in this browser: finishing returns to it rather than dealing a new one.
  function guestGame() { try { return Object.keys(localStorage).some(key => /^galactic-reach-save-v\d+/.test(key)); } catch { return false; } }
  function clearTutorial() {
    try { for (const key of Object.keys(localStorage)) if (key.startsWith('galactic-reach-tutorial-')) localStorage.removeItem(key); } catch { /* nothing to clear */ }
  }

  // ---- Reading positions. ----
  const parse = key => key.split(',').map(Number);
  const distance = (a, b) => { const [q1, r1] = parse(a), [q2, r2] = parse(b); return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2; };
  const me = state => state.players[0];
  const colony = state => Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].hasColony && state.planets[c].cluster === 0)
    || Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].hasColony);
  const harvester = state => Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].upgrade === 'harvester') || null;
  // The empty Data hex next to your home Colony: the tutorial's first build.
  const dataSite = state => { const home = colony(state); return Object.keys(state.planets).find(c => state.planets[c].cluster === state.planets[home]?.cluster && distance(c, home) === 1 && state.planets[c].type === 'data' && !state.planets[c].upgrade) || null; };
  const shipyardSite = state => { const home = colony(state); return Object.keys(state.planets).find(c => state.planets[c].cluster === state.planets[home]?.cluster && distance(c, home) === 1 && !state.planets[c].upgrade && state.planets[c].type !== 'data') || null; };
  // Parts of the mat and the home world a step can light or label.
  const matRow = resource => $(`#resource-grid .resource-box[data-resource="${resource}"]`);
  const matPart = (resource, part) => matRow(resource)?.querySelector(part) || null;
  const homeHexes = state => { const home = colony(state); const cluster = state.planets[home]?.cluster; return Object.keys(state.planets).filter(c => state.planets[c].cluster === cluster).map(hexAt); };
  const yard = state => Object.keys(state.planets).find(c => state.planets[c].owner === 0 && state.planets[c].upgrade === 'starbase') || null;
  const unitsAt = (state, type, player = 0) => Object.entries(state.fleets || {}).filter(([, f]) => f?.[player]?.[type] > 0).map(([c]) => c);
  const unitCount = (state, type) => Object.values(state.fleets || {}).reduce((n, f) => n + (f?.[0]?.[type] || 0), 0);
  const allCards = p => [...p.hand, ...p.deck, ...p.discard, ...p.inPlay];
  const handHas = (state, key) => me(state).hand.find(c => c.key === key) || null;
  const coloniesOf = state => Object.values(state.planets).filter(p => p.owner === 0 && p.hasColony).length;
  const knownRelic = (state, port) => Object.keys(state.planets).find(c => { const p = state.planets[c]; return p.special === 'relic' && !p.relicClaimed && port.relicKnown(state.clusters[p.cluster]); }) || null;
  const purchases = p => (p.cardsPurchased || 0) - (p.storagePurchases || 0);
  const upgradedCount = p => allCards(p).filter(c => c.starter && c.upgraded).length;
  const modules = p => allCards(p).filter(c => c.key === 'capacityModule').length;
  const myOps = state => state.phase === 'operations' && state.activePlayer === 0 && state.winner === null;
  const myBuy = state => state.phase === 'buy' && state.activePlayer === 0;
  const modalOpen = selector => { const d = $(selector); return Boolean(d?.open && d.matches(':modal')); };
  const scanOpen = () => Boolean($('#sector-popover')?.matches(':popover-open'));
  function targetWorld(state) {
    const home = colony(state);
    return state.clusters.filter(c => c.kind === 'world' && state.planets[c.center].owner === null && !state.planets[c.center].hasColony)
      .sort((a, b) => distance(a.center, home) - distance(b.center, home) || a.id - b.id)[0] || null;
  }

  // ---- Staging: idempotent, explained in the log. Each receives app.js's stage port. ----
  function ensureResources(s, min) {
    const p = me(s.state), limits = s.resourceLimits(0);
    for (const r of RES) if ((min[r] || 0) > p.resources[r]) p.resources[r] = Math.min(limits[r], min[r]);
  }
  function setResources(s, values) { const p = me(s.state), limits = s.resourceLimits(0); for (const r of RES) p.resources[r] = Math.min(limits[r], values[r] || 0); }
  // Bring named cards into the hand from deck or discard, returning spare hand cards to where they came from.
  function ensureHand(s, keys, swap = false) {
    const p = me(s.state);
    const need = {}; for (const k of keys) need[k] = (need[k] || 0) + 1;
    const have = {}; for (const c of p.hand) have[c.key] = (have[c.key] || 0) + 1;
    for (const [key, count] of Object.entries(need)) {
      for (let i = have[key] || 0; i < count; i++) {
        let pile = p.deck, index = p.deck.findIndex(c => c.key === key);
        if (index < 0) { pile = p.discard; index = p.discard.findIndex(c => c.key === key); }
        if (index < 0) continue;
        const [card] = pile.splice(index, 1);
        const spareIndex = p.hand.findIndex(c => { const n = need[c.key] || 0; return p.hand.filter(x => x.key === c.key).length > n; });
        if (swap && p.hand.length >= 5 && spareIndex >= 0) pile.splice(index, 0, p.hand.splice(spareIndex, 1)[0]);
        p.hand.push(card);
      }
    }
  }
  function ensureOwned(s, key) { const p = me(s.state); if (!allCards(p).some(c => c.key === key)) p.discard.push(s.makeCard(key)); }
  function ensureShipyard(s) {
    if (yard(s.state)) return yard(s.state);
    const home = colony(s.state), cluster = s.state.clusters[s.state.planets[home].cluster];
    const site = cluster.coords.find(c => c !== home && !s.state.planets[c].upgrade && distance(c, home) === 1);
    Object.assign(s.state.planets[site], { owner: 0, hasColony: false, upgrade: 'starbase', upgradeLevel: 1, conquest: false });
    me(s.state).initialShipyardCoord ||= site;
    return site;
  }
  function ensureUnits(s, wanted) {
    const at = ensureShipyard(s);
    for (const [type, n] of Object.entries(wanted)) { const missing = n - unitCount(s.state, type); if (missing > 0) s.ensureFleet(at, 0)[type] += missing; }
  }
  function relocate(s, type, from, to) {
    const source = s.state.fleets[from]?.[0];
    if (!source || !source[type]) return;
    source[type] -= 1;
    s.ensureFleet(to, 0)[type] += 1;
  }

  // ---- Begin with the opening cards, then explain the table the player has used. ----
  const hand = key => state => globalThis.galacticReachGuide.handCard(handHas(state, key)?.id || '');
  const lastHand = key => state => { const cards = me(state).hand.filter(c => c.key === key); return globalThis.galacticReachGuide.handCard(cards.at(-1)?.id || ''); };
  // Only an open Sector Scan offers a choice (a closed one keeps its last buttons in the page).
  const scanButton = pattern => () => (scanOpen() && $$('#sector-popover button').find(b => !b.disabled && pattern.test(b.textContent.trim()))) || null;
  const hexAt = coord => coord && globalThis.galacticReachGuide.hex(coord);

  const LESSONS = [
    { id: 'resources', title: 'Resources', steps: [
      // The first thing to do is convert the Move, so the Move is the card that glows.
      { id: 'first-construct', title: 'Your first build', rule: 'resources',
        prepare: s => { ensureHand(s, ['move', 'move', 'construct', 'construct', 'construct'], true); },
        text: () => 'A Construct card can build a Data Harvester. You have the Matter and Data; first convert this Move for 1 Energy.',
        show: state => ({ spotlight: [$('#resource-grid'), hand('move')(state)], ghost: { from: hand('move')(state), to: matRow('energy') }, callouts: [{ el: matPart('energy', '.mat-pips.now'), label: 'Energy: +1' }] }),
        anchor: hand('move'), done: (state, base, port) => me(state).resources.energy >= port.structures.harvester.cost.energy },
    ] },
    { id: 'orders', title: 'Orders', steps: [
      { id: 'harvester-aim', title: 'Use an order', rule: 'orders', aimAt: state => dataSite(state),
        ensure: s => { if (harvester(s.state)) return false; ensureHand(s, ['construct']); ensureResources(s, { matter: 1, energy: 1, data: 1 }); return 'Supplied: a Construct card and the price of a Harvester.'; },
        needsEnsure: state => myOps(state) && !harvester(state) && (!handHas(state, 'construct') || RES.some(r => me(state).resources[r] < ({ matter: 1, energy: 1, data: 1 })[r])),
        text: () => 'Drag the marked Construct card onto the ringed Data hex: build a Data Harvester.',
        show: state => ({ spotlight: [hand('construct')(state), hexAt(dataSite(state)), $('#resource-grid')], ghost: { from: hand('construct')(state), to: hexAt(dataSite(state)) }, callouts: [{ el: hexAt(dataSite(state)), label: '+2 Data every round' }, { el: $('#resource-grid'), label: 'Costs 1 Matter, 1 Energy, 1 Data', side: 'left' }] }),
        anchor: hand('construct'), marks: state => [hexAt(dataSite(state))],
        done: state => Boolean(harvester(state)) || (scanOpen() && Boolean(scanButton(/Harvester/)())) },
      { id: 'harvester-build', title: 'Build a Harvester', rule: 'building',
        // Closed the Sector Scan, or built something else instead: go back to choosing the hex.
        fallback: state => !harvester(state) && !(scanOpen() && scanButton(/Harvester/)()),
        text: () => 'Choose Build Harvester. Data pays for Explorers, relics and upgrades.',
        show: () => ({ callouts: [{ el: scanButton(/Harvester/)(), label: 'This one' }] }),
        anchor: scanButton(/Harvester/), done: state => Boolean(harvester(state)) },
    ] },
    { id: 'table', title: 'Read the table', steps: [
      { id: 'track', title: 'The score track', rule: 'shared-board', info: true, followCallouts: true,
        text: s => `Race to ${s.victoryTarget || 40}★ on the score track. Your Colony already scores 3★.`,
        show: () => ({ spotlight: [$('#prestige-track')], callouts: [{ el: $('[data-score-player="0"]'), label: 'You: 3★', side: 'right' }, { el: $('.prestige-track-goal'), label: 'First to the goal wins', side: 'bottom' }] }),
        anchor: () => $('[data-score-player="0"]') },
      { id: 'home', title: 'Your home world', rule: 'shared-board', info: true, followCallouts: true,
        text: () => 'Your home world. Select any hex to see what is on it.',
        show: state => ({ spotlight: homeHexes(state), callouts: [{ el: hexAt(colony(state)), label: 'Your Colony (3★)' }] }),
        anchor: state => hexAt(colony(state)) },
      { id: 'mat', title: 'Your mat', rule: 'player-mat', info: true, followCallouts: true,
        text: () => 'Your mat has one row per resource.',
        show: state => ({ spotlight: [$('#resource-grid'), hexAt(colony(state))], callouts: [{ el: matPart('matter', '.mat-pips.now'), label: 'Now: the Matter you hold' }, { el: matPart('matter', '.mat-pips.rate'), label: 'Rate: Matter made each round' }, { el: matPart('matter', '.mat-pips.now i.cap'), label: 'Limit: 4 at most' }, { el: hexAt(colony(state)), label: 'Your Colony makes that +1' }] }),
        anchor: () => $('#resource-grid') },
      { id: 'convert-construct', title: 'Convert a card', rule: 'resources',
        text: () => 'Drag the marked Construct card onto your mat: +1 Matter.',
        show: state => ({ spotlight: [$('#resource-grid'), lastHand('construct')(state)], ghost: { from: lastHand('construct')(state), to: matRow('matter') }, callouts: [{ el: matPart('matter', '.mat-pips.now'), label: 'Lands here' }] }),
        anchor: lastHand('construct'), start: state => ({ matter: me(state).resources.matter }),
        done: (state, base) => me(state).resources.matter > base.matter },
    ] },
    { id: 'round', title: 'The round', steps: [
      { id: 'convert-rest', title: 'Convert first', rule: 'resources',
        text: () => 'Unused cards are discarded at round end: convert your leftover cards to resources first.',
        show: state => ({ ghost: { from: $('#hand-row .game-card'), to: matRow('matter') }, callouts: [{ el: $('#hand-row'), label: 'Discarded at round end if unused' }] }),
        anchor: () => $('#convert-all-button:not([hidden])') || $('#hand-row .game-card'),
        // Done when nothing convertible is left, or when converting would only waste resources at their limit.
        done: (state, base, port) => { const lim = port.limits(); return !me(state).hand.some(c => port.canConvertCard(c) && Object.keys(port.cards[c.key].resource || {}).some(r => me(state).resources[r] < lim[r])); } },
      { id: 'pass', title: 'Pass & buy', rule: 'round',
        text: () => 'Nothing else to afford: choose Pass & buy.',
        show: () => ({ spotlight: [$('#hand-row'), globalThis.galacticReachGuide.turnButton()], callouts: [{ el: $('#hand-row'), label: 'Left in hand = discarded at round end' }, { el: globalThis.galacticReachGuide.turnButton(), label: 'Ends your turns this round', side: 'left' }] }),
        anchor: () => globalThis.galacticReachGuide.turnButton(), start: state => ({ round: state.round }), done: (state, base) => me(state).passed || state.round > base.round },
      { id: 'buy-empty', buy: true, title: 'Finish Buy', rule: 'buy',
        text: () => 'Your Buy turn. Nothing to buy yet: choose Finish Buy.',
        show: () => ({ callouts: [{ el: $('#market-row'), label: 'The market: buy cards here', side: 'left' }, { el: globalThis.galacticReachGuide.turnButton(), label: 'Finish Buy', side: 'left' }] }),
        anchor: () => globalThis.galacticReachGuide.turnButton(), start: state => ({ round: state.round }), done: (state, base) => state.round > base.round },
      { id: 'deck', title: 'A new round', rule: 'cleanup-draw', info: true, followCallouts: true, wait: state => !myOps(state),
        text: () => 'A new round: a new hand. Your resources stayed; last round’s cards went to the discard pile.',
        show: state => ({ spotlight: [$('#hand-row'), $('#deck-button'), $('#discard-button'), $('#resource-grid')], callouts: [{ el: $('#hand-row'), label: 'New hand of 5' }, { el: $('#deck-button'), label: 'Cards left to draw' }, { el: $('#discard-button'), label: 'Last round’s cards', side: 'left' }, ...(harvester(state) ? [{ el: matPart('data', '.mat-pips.now'), label: '+2 Data from the Harvester', side: 'left' }] : [])] }),
        anchor: () => $('#deck-button') },
    ] },
    { id: 'units', title: 'Ships', steps: [
      { id: 'shipyard-aim', title: 'Build a Shipyard', rule: 'building', aimAt: state => shipyardSite(state), marks: state => [hexAt(shipyardSite(state))],
        prepare: s => { ensureHand(s, ['construct', 'construct', 'construct', 'move', 'move'], true); ensureResources(s, { matter: 3, energy: 3, biomass: 2, data: 3 }); return 'Supplied: resources for a Shipyard, a Settler and an Explorer.'; },
        ensure: s => { if (yard(s.state)) return false; ensureHand(s, ['construct']); ensureResources(s, s.STRUCTURES.starbase.cost); return 'Supplied: the cards and resources for a Shipyard.'; },
        needsEnsure: (state, port) => !yard(state) && (!handHas(state, 'construct') || !port.canAfford(port.structures.starbase.cost)),
        text: () => 'Drag the marked Construct card onto the ringed hex: build a Shipyard, which builds ships.',
        show: state => ({ spotlight: [hand('construct')(state), hexAt(shipyardSite(state))], ghost: { from: hand('construct')(state), to: hexAt(shipyardSite(state)) }, callouts: [{ el: hexAt(shipyardSite(state)), label: 'Shipyard here' }] }),
        anchor: hand('construct'), done: state => Boolean(yard(state)) || (scanOpen() && Boolean(scanButton(/Shipyard/)())) },
      { id: 'shipyard-build', title: 'Build a Shipyard', rule: 'building',
        // Closed the Sector Scan, or built something else instead: go back to choosing the hex.
        fallback: state => !yard(state) && !(scanOpen() && scanButton(/Shipyard/)()),
        text: () => 'Choose Build Shipyard.',
        show: () => ({ callouts: [{ el: scanButton(/Shipyard/)(), label: 'This one' }] }),
        anchor: scanButton(/Shipyard/), done: state => Boolean(yard(state)) },
      { id: 'settler', title: 'Commission a Settler', rule: 'building',
        prepare: s => { if (yard(s.state)) return null; ensureShipyard(s); return 'Supplied: a Shipyard next to your Colony.'; },
        ensure: s => { ensureHand(s, ['construct']); ensureResources(s, s.SHIP_STATS.settler.cost); return 'Supplied: a Construct card and the price of a Settler.'; },
        needsEnsure: (state, port) => myOps(state) && (!handHas(state, 'construct') || !port.canAfford(port.ships.settler.cost)),
        text: () => 'Drag a Construct card onto your Shipyard and choose Settler. Settlers found Colonies.',
        show: state => ({ ghost: scanOpen() ? null : { from: hand('construct')(state), to: hexAt(yard(state)) }, callouts: [{ el: scanButton(/Settler/)() || hexAt(yard(state)), label: scanOpen() ? 'This one' : 'Your Shipyard' }] }),
        anchor: state => scanButton(/Settler/)() || hand('construct')(state), aimAt: state => yard(state), done: state => unitCount(state, 'settler') > 0 },
      { id: 'explorer', title: 'Commission an Explorer', rule: 'building', aimAt: state => yard(state),
        ensure: s => { ensureHand(s, ['construct']); ensureResources(s, { energy: 1, data: 2 }); return 'Supplied: a Construct card and the price of an Explorer.'; },
        needsEnsure: state => myOps(state) && (!handHas(state, 'construct') || !(me(state).resources.energy >= 1 && me(state).resources.data >= 2)),
        text: () => 'Again, for an Explorer: it finds relics. Your Settler’s Colonize card went to the discard pile.',
        show: state => ({ ghost: scanOpen() ? null : { from: hand('construct')(state), to: hexAt(yard(state)) }, callouts: [{ el: scanButton(/Explorer/)() || $('#discard-button'), label: scanOpen() ? 'This one' : 'Colonize card: drawn later', side: 'left' }] }),
        anchor: state => scanButton(/Explorer/)() || hand('construct')(state), done: state => unitCount(state, 'explorer') > 0 },
    ] },
    { id: 'movement', title: 'Movement', steps: [
      { id: 'move-split', title: 'Split a move', rule: 'split-moves', aimAt: state => state.moveSource ? null : yard(state),
        prepare: s => { const fleet = unitCount(s.state, 'fleet') === 0; ensureUnits(s, { settler: 1, explorer: 1, fleet: 1 }); return fleet ? 'Supplied: a Fleet (warship, attack 3) at your Shipyard.' : null; },
        ensure: s => { ensureHand(s, ['move']); return 'Supplied: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ fleets: unitsAt(state, 'fleet').join('|') }),
        text: () => 'Drag a Move card onto your Shipyard. Untick the slow Settler, then fly the Fleet 2 hexes.',
        show: state => ({ ghost: state.moveSource || scanOpen() ? null : { from: hand('move')(state), to: hexAt(yard(state)) }, callouts: [{ el: $('#sector-popover [data-move-unit="settler"]')?.closest('label') || hexAt(yard(state)), label: scanOpen() ? 'Untick: Settlers move 1' : 'Fleet + Settler here' }] }),
        anchor: state => scanOpen() && $('#sector-popover [data-move-unit="settler"]')?.checked ? $('#sector-popover [data-move-unit="settler"]').closest('label') : hand('move')(state),
        done: (state, base) => unitsAt(state, 'fleet').join('|') !== base.fleets && !state.pendingMove },
      { id: 'move-explorer', title: 'Explorers fly alone', rule: 'movement', aimAt: state => state.moveSource ? null : unitsAt(state, 'explorer')[0],
        ensure: s => { ensureHand(s, ['move']); return 'Supplied: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ explorers: unitsAt(state, 'explorer').join('|') }),
        text: () => 'Drag your other Move card onto the Explorer. Explorers fly 3 hexes on their own.',
        show: state => ({ ghost: state.moveSource ? null : { from: hand('move')(state), to: hexAt(unitsAt(state, 'explorer')[0]) }, callouts: [{ el: hexAt(unitsAt(state, 'explorer')[0]), label: 'Explorer' }] }),
        anchor: hand('move'), done: (state, base) => unitsAt(state, 'explorer').join('|') !== base.explorers },
    ] },
    { id: 'relics', title: 'Relics', steps: [
      { id: 'probe', title: 'Probe for a relic', rule: 'movement', aimAt: state => unitsAt(state, 'explorer')[0], wait: state => !myOps(state),
        prepare: s => { ensureUnits(s, { explorer: 1 }); ensureOwned(s, 'probe'); ensureHand(s, ['probe', 'move', 'move']); },
        ensure: s => { ensureOwned(s, 'probe'); ensureHand(s, ['probe']); return 'Supplied: your Probe / Excavate card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'probe') && !me(state).inPlay.some(c => c.key === 'probe'),
        text: () => 'Drag the Probe / Excavate card onto your Explorer and choose Probe: it finds the nearest hidden relic.',
        show: state => ({ ghost: { from: hand('probe')(state), to: hexAt(unitsAt(state, 'explorer')[0]) }, callouts: [{ el: hexAt(unitsAt(state, 'explorer')[0]), label: 'Explorer' }] }),
        anchor: hand('probe'), done: (state, base, port) => Boolean(knownRelic(state, port)) },
      { id: 'reach-relic', title: 'Fly to the relic', rule: 'excavation', aimAt: (state, port) => state.moveSource ? knownRelic(state, port) : unitsAt(state, 'explorer')[0],
        ensure: s => { ensureHand(s, ['move']); return 'Supplied: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        text: () => 'Fly your Explorer onto the ◈ with a Move card. Far away? Get close, then use another.',
        show: (state, port) => ({ ghost: state.moveSource ? null : { from: hand('move')(state), to: hexAt(unitsAt(state, 'explorer')[0]) }, callouts: [{ el: hexAt(knownRelic(state, port)), label: '◈ the relic' }] }),
        anchor: (state, port) => (myOps(state) ? hand('move')(state) : null) || hexAt(knownRelic(state, port)),
        done: (state, base, port) => { const site = knownRelic(state, port); return !site || unitsAt(state, 'explorer').includes(site); } },
      { id: 'excavate', title: 'Excavate', rule: 'excavation', aimAt: state => unitsAt(state, 'explorer')[0],
        ensure: s => { ensureOwned(s, 'probe'); ensureHand(s, ['probe']); ensureResources(s, s.EXCAVATION_COST); return `Supplied: your Probe / Excavate card and the excavation cost (${costText(s.EXCAVATION_COST)}).`; },
        needsEnsure: (state, port) => myOps(state) && !me(state).inPlay.some(c => c.key === 'probe') && (!handHas(state, 'probe') || !port.canAfford(port.excavationCost)),
        text: state => me(state).inPlay.some(c => c.key === 'probe') && !handHas(state, 'probe') ? 'Your Probe / Excavate card is in play until the round ends. Finish this round: Pass & buy, then Finish Buy.' : `Drag Probe / Excavate onto your Explorer on the ◈ and choose Excavate (${costText(port.excavationCost)}).`,
        show: state => handHas(state, 'probe') ? { ghost: { from: hand('probe')(state), to: hexAt(unitsAt(state, 'explorer')[0]) }, callouts: [{ el: hexAt(unitsAt(state, 'explorer')[0]), label: 'Explorer on the ◈' }] } : { callouts: [{ el: $('#in-play-button'), label: 'Probe / Excavate: in play' }] },
        anchor: state => me(state).inPlay.some(c => c.key === 'probe') && !handHas(state, 'probe') ? globalThis.galacticReachGuide.turnButton() : (scanButton(/Excavate/)() || hand('probe')(state)),
        done: state => me(state).relicsExcavated > 0 || state.actionMode === 'excavate' },
      { id: 'choose-relic', title: 'Choose a relic card', rule: 'alien-relics',
        // Cancelled Excavate (or never chose a card): go back and play it again.
        fallback: state => me(state).relicsExcavated === 0 && state.actionMode !== 'excavate',
        text: () => 'Pick a relic card: +2★. It goes to your discard pile.',
        show: () => ({ callouts: [{ el: $('[data-excavate-relic]:not([disabled])'), label: 'Pick one' }] }),
        anchor: () => $('[data-excavate-relic]:not([disabled])') || $('#relic-row'), done: state => me(state).relicsExcavated > 0 },
    ] },
    { id: 'colonies', title: 'Colonies', steps: [
      { id: 'settler-center', title: 'Reach a world', rule: 'orders', aimAt: state => state.moveSource ? targetWorld(state)?.center : unitsAt(state, 'settler')[0],
        prepare: s => {
          ensureUnits(s, { settler: 1 });
          const world = targetWorld(s.state); if (!world) return null;
          const home = colony(s.state);
          const edge = world.coords.filter(c => c !== world.center).sort((a, b) => distance(a, home) - distance(b, home))[0];
          const from = unitsAt(s.state, 'settler')[0];
          if (from && from !== edge) relocate(s, 'settler', from, edge);
          ensureOwned(s, 'colonize'); ensureHand(s, ['move', 'colonize']); ensureResources(s, { biomass: s.COLONY_LIFE_COST });
          return `Fast-forward: your Settler reached ${world.name} (usually a few rounds).`;
        },
        ensure: s => { ensureHand(s, ['move']); return 'Supplied: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        text: state => `Move your Settler 1 hex onto the ringed center of ${targetWorld(state)?.name || 'the world'}.`,
        show: state => ({ ghost: state.moveSource ? null : { from: hand('move')(state), to: hexAt(unitsAt(state, 'settler')[0]) }, callouts: [{ el: hexAt(targetWorld(state)?.center), label: 'World center' }] }),
        anchor: state => (myOps(state) ? hand('move')(state) : null) || hexAt(targetWorld(state)?.center),
        done: state => { const w = targetWorld(state); return !w || unitsAt(state, 'settler').includes(w.center); } },
      { id: 'colonize', title: 'Found a Colony', rule: 'orders', aimAt: state => targetWorld(state)?.center,
        ensure: s => { ensureOwned(s, 'colonize'); ensureHand(s, ['colonize']); ensureResources(s, { biomass: s.COLONY_LIFE_COST }); return `Supplied: a Colonize card and ${s.COLONY_LIFE_COST} Life.`; },
        needsEnsure: (state, port) => myOps(state) && (!handHas(state, 'colonize') || me(state).resources.biomass < port.colonyCost),
        start: state => ({ colonies: coloniesOf(state) }),
        text: () => `Drag the Colonize card onto your Settler and choose Found Colony: ${port.colonyCost} Life, +3★.`,
        show: state => ({ ghost: scanOpen() ? null : { from: hand('colonize')(state), to: hexAt(targetWorld(state)?.center) }, callouts: [{ el: scanButton(/Found Colony/)() || hexAt(targetWorld(state)?.center), label: scanOpen() ? 'This one' : 'Your Settler' }] }),
        anchor: state => scanButton(/Found Colony/)() || hand('colonize')(state), done: (state, base) => coloniesOf(state) > base.colonies },
    ] },
    { id: 'bank', title: 'The bank', steps: [
      { id: 'bank-trade', buy: true, title: 'Trade 4 for 1', rule: 'trade',
        prepare: s => { ensureResources(s, { energy: 4 }); return 'Supplied: 4 Energy.'; },
        ensure: s => { ensureResources(s, { energy: 4 }); return 'Supplied: 4 Energy.'; },
        needsEnsure: state => (myOps(state) || myBuy(state)) && me(state).resources.energy < 4,
        start: state => ({ data: me(state).resources.data }),
        text: () => 'Trade at the bank: drag from your Energy row onto your Data row. 4 Energy become 1 Data.',
        show: () => ({ spotlight: [$('#resource-grid')], ghost: { from: matPart('energy', '.mat-pips.now'), to: matPart('data', '.mat-pips.now') }, callouts: [{ el: matPart('energy', '.mat-pips.now'), label: 'Give 4', side: 'left' }, { el: matPart('data', '.mat-pips.now'), label: 'Get 1', side: 'left' }] }),
        anchor: () => $('#resource-grid'), done: (state, base) => me(state).resources.data > base.data },
    ] },
    { id: 'buy', title: 'Your Buy turn', steps: [
      { id: 'pass-buy', buy: true, title: 'Start your Buy turn', rule: 'buy',
        prepare: s => { setResources(s, { matter: 4, energy: 4, biomass: 4, data: 4 }); return 'Supplied: 4 of each resource to spend in the market.'; },
        text: () => 'The tutorial filled your mat. Choose Pass & buy to shop.',
        show: () => ({ callouts: [{ el: globalThis.galacticReachGuide.turnButton(), label: 'Pass & buy', side: 'left' }, { el: $('#resource-grid'), label: '4 of each', side: 'left' }] }),
        anchor: () => globalThis.galacticReachGuide.turnButton(), done: state => myBuy(state) },
      { id: 'buy-card', buy: true, title: 'Buy a card', rule: 'market-tiers',
        ensure: s => { setResources(s, { matter: 4, energy: 4, biomass: 4, data: 4 }); return 'Supplied: 4 of each resource.'; },
        needsEnsure: (state, port) => myBuy(state) && !state.market.some(c => port.canAfford(port.purchaseCost(c.key))),
        start: state => ({ bought: purchases(me(state)) }),
        text: () => 'Buy the ringed card: like every card with a gold outline, you can afford it. It goes to your discard pile.',
        show: () => ({ spotlight: [$('#market-row')], callouts: [{ el: $('[data-buy-market]:not([disabled])'), label: 'You can afford this' }, { el: $('[data-market-tier="expensive"]'), label: 'Expensive', side: 'left' }, { el: $('[data-market-tier="cheap"]'), label: 'Cheap', side: 'left' }] }),
        anchor: (state, port) => $(`[data-buy-market]:not([disabled])`), done: (state, base) => purchases(me(state)) > base.bought },
      { id: 'upgrade', buy: true, title: 'Upgrade a starter', rule: 'buy',
        ensure: s => { ensureResources(s, { energy: 2 }); return 'Supplied: 2 Energy.'; },
        needsEnsure: state => myBuy(state) && !RES.some(r => me(state).resources[r] >= 2),
        start: state => ({ upgraded: upgradedCount(me(state)) }),
        dialogs: { '#upgrade-dialog': 'Pick any copy (they are the same card), and the resource that pays 2.' },
        text: () => 'Upgrade a starter card: choose Move II and pay 2 of one resource.',
        show: () => ({ callouts: [{ el: $('[data-upgrade-offer]:not([disabled])'), label: 'Stronger order, no converting' }] }),
        anchor: () => $('[data-upgrade-offer]:not([disabled])'), done: (state, base) => upgradedCount(me(state)) > base.upgraded },
      { id: 'capacity', title: 'A Capacity Module', buy: true, rule: 'capacity-module',
        ensure: s => { ensureResources(s, { matter: 1, energy: 1, biomass: 1, data: 1 }); return 'Supplied: 1 of each resource.'; },
        needsEnsure: (state, port) => myBuy(state) && !port.canBuyCapacity(),
        start: state => ({ modules: modules(me(state)) }),
        text: () => 'Buy a Capacity Module card. Played later, it raises your limits.',
        show: () => ({ callouts: [{ el: $('[data-capacity-offer]'), label: 'Raises limits by 4' }, { el: matPart('matter', '.mat-pips.now i.cap'), label: 'Limit', side: 'left' }] }),
        anchor: () => $('[data-capacity-offer]'), done: (state, base) => modules(me(state)) > base.modules },
      { id: 'trash', buy: true, title: 'Trash a card', rule: 'buy',
        ensure: s => { ensureResources(s, { biomass: 3 }); return 'Supplied: 3 Life.'; },
        needsEnsure: state => myBuy(state) && !RES.some(r => me(state).resources[r] >= 3),
        start: state => ({ cards: allCards(me(state)).length }),
        dialogs: { '#trash-dialog': 'Pick the resource that pays 3, then the card to remove for good.' },
        text: () => 'Remove a card for good: choose the Trash pile.',
        show: () => ({ callouts: [{ el: $('[data-trash-pile]:not([disabled])') || $('#open-trash'), label: '3 of one resource per card' }] }),
        anchor: () => $('[data-trash-pile]:not([disabled])') || $('#open-trash'), done: (state, base) => allCards(me(state)).length < base.cards },
      { id: 'finish-buy', buy: true, title: 'Finish Buy', rule: 'round',
        start: state => ({ round: state.round }),
        text: () => 'Choose Finish Buy. The next round brings a new hand.',
        show: () => ({ callouts: [{ el: globalThis.galacticReachGuide.turnButton(), label: 'Finish Buy', side: 'left' }] }),
        anchor: () => globalThis.galacticReachGuide.turnButton(), done: (state, base) => state.round > base.round },
    ] },
    { id: 'capacity', title: 'Capacity', steps: [
      { id: 'play-module', title: 'Raise your limits', rule: 'storage-allocation', wait: state => !myOps(state),
        prepare: s => { ensureOwned(s, 'capacityModule'); ensureHand(s, ['capacityModule']); },
        ensure: s => { ensureOwned(s, 'capacityModule'); ensureHand(s, ['capacityModule']); return 'Supplied: your Capacity Module card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'capacityModule') && !(me(state).storage || []).length,
        dialogs: { '#storage-allocation-dialog': 'Split the 4 points as you like, then choose Play Capacity Module. Each point raises that limit by 1, for good.' },
        text: () => 'Play your Capacity Module card: point at it and choose Use order.',
        show: state => ({ callouts: [{ el: hand('capacityModule')(state), label: 'Capacity Module' }, { el: $('#storage-pile'), label: 'It ends up here', side: 'left' }] }),
        anchor: hand('capacityModule'), done: state => (me(state).storage || []).length > 0 },
    ] },
    { id: 'combat', title: 'Combat', steps: [
      { id: 'attack', title: 'Attack', rule: 'combat', aimAt: state => state.moveSource ? unitsAt(state, 'explorer', 1)[0] : unitsAt(state, 'fleet')[0], wait: state => !myOps(state) && !state.pendingCombat,
        prepare: s => {
          ensureUnits(s, { fleet: 1 });
          const from = unitsAt(s.state, 'fleet')[0];
          const reach = s.reachableFrom(from, 0, 2, false, { fleet: 1, settler: 0, explorer: 0 }).filter(c => distance(c, from) === 2 && !s.state.fleets[c] && !s.state.planets[c]?.upgrade && !s.state.planets[c]?.hasColony);
          const at = reach[0];
          if (at) { s.ensureFleet(at, 1).explorer += 1; s.state.players[1].resources.energy = 0; }
          ensureHand(s, ['move', 'move']);
          return `Staged: an enemy Explorer near your Fleet.`;
        },
        ensure: s => { ensureHand(s, ['move']); return 'Supplied: a Move card.'; },
        needsEnsure: state => myOps(state) && !handHas(state, 'move'),
        start: state => ({ wins: me(state).combatVictories || 0 }),
        text: state => `Drag a Move card onto your Fleet and fly onto the enemy Explorer.`,
        show: state => ({ ghost: state.moveSource ? null : { from: hand('move')(state), to: hexAt(unitsAt(state, 'fleet')[0]) }, callouts: [{ el: hexAt(unitsAt(state, 'explorer', 1)[0]), label: 'Enemy Explorer' }, { el: hexAt(unitsAt(state, 'fleet')[0]), label: 'Your Fleet' }] }),
        anchor: state => { const enemy = unitsAt(state, 'explorer', 1)[0]; return (myOps(state) ? hand('move')(state) : null) || hexAt(enemy); },
        done: (state, base) => Boolean(state.pendingCombat) || (me(state).combatVictories || 0) > base.wins },
      { id: 'tactics', title: 'Choose tactics', rule: 'combat-tactics', dialog: '#combat-dialog',
        text: () => 'If asked, choose Stay and fight. Then pick a tactic: Fire adds 1 hit; Screen blocks 2. Fleets take hits before Settlers.',
        done: state => !state.pendingCombat },
      { id: 'report', title: 'Victory', rule: 'combat', dialog: '#message-dialog',
        start: state => ({ wins: me(state).combatVictories || 0 }),
        text: () => 'Every enemy unit destroyed: a decisive victory, +2★. Choose Continue.',
        done: state => !state.pendingCombatReport && !modalOpen('#message-dialog') },
    ] },
    { id: 'victory', title: 'Winning', steps: [
      { id: 'final-track', title: 'How to win', rule: 'victory', info: true, followCallouts: true,
        text: (state, port) => `You have ${port.prestige(0)}★. When a round ends with anyone at ${port.victoryTarget()}★ or more, the highest score wins.`,
        show: () => ({ spotlight: [$('#prestige-track')], callouts: [{ el: $('[data-score-player="0"]'), label: 'Your score', side: 'right' }, { el: $('.prestige-track-goal'), label: 'The goal', side: 'bottom' }] }),
        anchor: () => $('[data-score-player="0"]') },
    ] },
  ];
  const STEPS = LESSONS.flatMap((lesson, lessonIndex) => lesson.steps.map((step, index) => ({ ...step, lesson, lessonIndex, index })));

  // ---- Running the steps. ----
  let port = null, guide = null;
  function stage(change) {
    if (!port?.stage) return false;
    let message = null;
    const ok = port.stage(s => { message = change(s) || null; }, null);
    if (ok && message) port.stage(s => s.logEvent(message), null), toastNote(message);
    return ok;
  }
  let note = '';
  // A Sector Scan left open from the step before is closed once, as a new step begins.
  let scanClosedFor = -1;
  function toastNote(message) { note = message; }

  // Progress names its step, so a later edit to the lesson list resumes at the same step.
  function resolveProgress() {
    // Old opening saves have not built the Harvester yet. Resume them at the new opening;
    // later saved lessons retain their named step. This never touches the guest game's save.
    if (!progress.cardFirst) {
      if (progress.step <= 4) { progress.stepId = 'first-construct'; progress.step = 0; progress.view = 0; progress.base = null; }
      progress.cardFirst = true; saveProgress();
    }
    // Lesson 1's Move conversion is now part of its first step.
    if (progress.stepId === 'convert-move') progress.stepId = 'first-construct';
    if (!progress.stepId) return;
    const index = progress.stepId === 'finished' ? STEPS.length : STEPS.findIndex(s => s.id === progress.stepId);
    if (index >= 0 && index !== progress.step) { progress.step = index; progress.view = index; progress.base = null; }
  }
  function enter(index) {
    progress.step = Math.min(index, STEPS.length);
    progress.stepId = STEPS[progress.step]?.id || 'finished';
    progress.view = progress.step;
    progress.base = null;
    note = '';
    saveProgress();
  }

  function advance() {
    // Several steps may already be satisfied (an alternative solution, or a skipped lesson).
    for (let guard = 0; guard < STEPS.length && progress.step < STEPS.length; guard++) {
      const step = STEPS[progress.step];
      const state = port.state;
      if (step.prepare && !progress.staged[step.id]) {
        if (state.pendingCombat || state.pendingCombatReport || (step.wait && step.wait(state))) return;
        progress.staged[step.id] = true; saveProgress();
        stage(step.prepare);
      }
      if (!progress.base && step.start) { progress.base = step.start(port.state); saveProgress(); }
      if (!step.info && step.done(port.state, progress.base || {}, port)) { enter(progress.step + 1); continue; }
      // A choice the player abandoned (closed it, cancelled, or did something else) returns to the
      // step that opens it, with that step's top-up if the resources were spent elsewhere.
      if (step.fallback?.(port.state, port) && progress.step > 0) { enter(progress.step - 1); continue; }
      // A missing card or resource (spent elsewhere, or a step reached by Skip) is topped up once per turn.
      if (step.ensure && step.needsEnsure?.(port.state, port)) {
        const key = `${step.id}@${port.turnSerial()}`;
        if (!progress.staged[key]) { progress.staged[key] = true; saveProgress(); stage(step.ensure); }
      }
      return;
    }
  }

  function tip(nextPort, nextGuide) {
    port = nextPort; guide = nextGuide;
    resolveProgress();
    const state = port.state;
    // A new tutorial game (first visit, or its save was cleared) starts the lessons from the top.
    if (state.tutorialRules !== RULES && !state.pendingCombat) {
      if (progress.step > 0 || Object.keys(progress.staged).length) { progress = { rules: RULES, step: 0, view: 0, base: null, staged: {}, cardFirst: true }; saveProgress(); }
      port.stage(s => { s.state.tutorialRules = RULES; }, null);
    }
    // The current step's action still counts while you review an earlier one: doing it ends the review.
    advance();
    const finished = progress.step >= STEPS.length;
    if (finished) return {
      id: 'finished', eyebrow: 'Tutorial complete', title: 'You are ready',
      text: 'You have used every part of a turn: converting and orders, ships and movement, relics, Colonies, the bank, buying, capacity and combat. In a real game the three rivals play to win. Guidance stays on to help you.',
      rule: 'start', anchor: null,
      buttons: [{ action: 'play', label: guestGame() ? 'Back to your game' : 'Play a real game', primary: true }, { action: 'restart', label: 'Replay tutorial' }, { action: 'back', label: 'Back' }]
    };
    const reviewing = progress.view < progress.step;
    const step = STEPS[reviewing ? progress.view : progress.step];
    // A window this step does not use (left open, or opened to look around): say how to go on.
    const stray = !reviewing && !step.dialog && !Object.keys(step.dialogs || {}).some(modalOpen)
      && $$('dialog[open]').find(d => d.matches(':modal') && d.id);
    if (stray) return {
      id: `${step.id}-stray`, eyebrow: `Lesson ${step.lessonIndex + 1} of ${LESSONS.length} · ${step.lesson.title}`, title: step.title,
      text: `Close this window (Close, Done or Escape) to continue: ${typeof step.text === 'function' ? step.text(state, port) : step.text}`,
      rule: step.rule, inDialog: `#${stray.id}`, anchor: null,
      buttons: [{ action: 'back', label: 'Back', disabled: progress.view === 0 }, { action: 'exit', label: 'Exit tutorial' }]
    };
    const openDialog = Object.keys(step.dialogs || {}).find(modalOpen);
    const lesson = step.lesson;
    const eyebrow = `Lesson ${step.lessonIndex + 1} of ${LESSONS.length} · ${lesson.title} · step ${step.index + 1} of ${lesson.steps.length}${reviewing ? ' · done' : ''}`;
    // A step you have done, seen again with Back: its note only. Nothing on the table is lit,
    // ringed or shown being dragged, since its action is finished, and the note keeps its place.
    if (reviewing) {
      const modal = $$('dialog[open]').find(d => d.matches(':modal') && d.id);
      return {
        id: step.id, step: `${progress.step}:${progress.view}`, eyebrow, title: step.title, rule: step.rule,
        text: typeof step.text === 'function' ? step.text(state, port) : step.text,
        aside: 'Looking back at a step you have done: nothing to do here.',
        inDialog: modal ? `#${modal.id}` : null, anchor: null, hold: true,
        progress: { lessons: LESSONS.length, current: step.lessonIndex, finishedLessons: STEPS[progress.step]?.lessonIndex ?? LESSONS.length },
        buttons: [
          { action: 'back', label: 'Back', disabled: progress.view === 0 },
          { action: 'next', label: 'Next', primary: true },
          { action: 'resume', label: 'Return to current step', link: true },
          { action: 'exit', label: 'Exit tutorial', quiet: true },
          { action: 'skip', label: 'Skip lesson', link: true },
        ]
      };
    }
    let text = openDialog ? step.dialogs[openDialog] : typeof step.text === 'function' ? step.text(state, port) : step.text;

    if (!reviewing && !openDialog && !step.dialog && state.activePlayer !== 0 && state.phase === 'operations' && !state.pendingCombat) text = `Rivals are taking their turns… ${text}`;
    const buyDetour = !reviewing && !openDialog && !step.buy && myBuy(state);
    let anchor = null;
    try { anchor = openDialog || step.dialog ? null : step.anchor?.(state, port) || null; } catch { anchor = null; }
    // This step needs an Operations turn, but you are in Buy: finish it, then carry on next round.
    // The Sector Scan stays open after a build; when this step's control is elsewhere, close it first.
    if (!reviewing && !openDialog && scanOpen() && !buyDetour && !(anchor && anchor.closest?.('#sector-popover')) && !['scan-close'].includes(step.id) && !(['move', 'construct', 'colonize', 'excavate'].includes(state.actionMode)))
      { if (scanClosedFor !== progress.step) { scanClosedFor = progress.step; $('#sector-popover')?.hidePopover?.(); } }
    if (buyDetour) { anchor = globalThis.galacticReachGuide.turnButton(); if (!/Finish Buy/.test(text)) text = `You are in your Buy turn. Choose Finish Buy; the next round brings a new hand. Then: ${text}`; }
    // A card aimed with Use order waits for its hex: point at the lit hexes, whatever the step.
    const lit = coord => coord && $(`.hex.cf-drop-target[data-coord="${coord}"], .hex.target[data-coord="${coord}"]`);
    const choiceInScan = anchor?.closest?.('#sector-popover') && scanOpen();
    const aimed = !reviewing && !openDialog && !state.pendingCombat && !choiceInScan && ['move', 'construct', 'colonize'].includes(state.actionMode)
      && (lit(step.aimAt?.(state, port)) || $('.hex.cf-drop-target, .hex.target'));
    if (aimed) { anchor = aimed; text = `${state.moveSource ? 'Now choose a lit hex to move to.' : 'Now choose one of the lit hexes.'} (Escape cancels.) ${text}`; }
    return {
      id: step.id, step: `${progress.step}:${progress.view}`, eyebrow, title: step.title, text, rule: step.rule, aside: !reviewing && !openDialog ? note : '',
      revealOnInspect: !reviewing && !openDialog && !step.dialog && Boolean(anchor?.matches?.('#hand-row > .game-card')),
      bringIntoView: !reviewing,
      inDialog: openDialog || step.dialog || null, anchor, followCallouts: Boolean(step.followCallouts) && !reviewing, show: openDialog || step.dialog ? null : (() => { try { return step.show?.(state, port) || null; } catch { return null; } })(), avoid: [hexAt(step.aimAt?.(state, port))], marks: (() => { try { return step.marks?.(state, port) || []; } catch { return []; } })(), progress: { lessons: LESSONS.length, current: step.lessonIndex, finishedLessons: STEPS[progress.step]?.lessonIndex ?? LESSONS.length },
      buttons: [
        { action: 'back', label: 'Back', disabled: progress.view === 0 },
        // Reading steps go on with Next. A "do it yourself" step has no button that goes on or
        // finds the target for you: the lit card or control is the way forward, and doing it advances.
        ...(reviewing || step.info ? [{ action: 'next', label: 'Next', primary: true }] : []),
        { action: 'exit', label: 'Exit tutorial', quiet: true },
        ...(step.lessonIndex < LESSONS.length - 1 || reviewing ? [{ action: 'skip', label: 'Skip lesson', link: true }] : []),
      ]
    };
  }

  function coachAction(action) {
    if (action === 'back') { if (progress.step >= STEPS.length) progress.view = STEPS.length - 1; else progress.view = Math.max(0, progress.view - 1); saveProgress(); }
    else if (action === 'next') {
      if (progress.view < progress.step) progress.view = Math.min(progress.step, progress.view + 1);
      else if (STEPS[progress.step]?.info) enter(progress.step + 1);
      saveProgress();
    }
    else if (action === 'resume') { progress.view = progress.step; saveProgress(); }
    else if (action === 'skip') {
      const current = STEPS[progress.view]?.lessonIndex ?? 0;
      const next = STEPS.findIndex(s => s.lessonIndex > current);
      if (progress.view < progress.step) progress.view = Math.min(progress.step, next < 0 ? progress.step : next);
      else enter(next < 0 ? STEPS.length : next);
      saveProgress();
    } else if (action === 'exit') location.href = location.pathname;
    else if (action === 'play') location.href = location.pathname;
    else if (action === 'restart') { clearTutorial(); location.reload(); }
  }

  function init() {
    document.body.classList.add('tutorial-mode');
    const newGame = $('#new-game-button');
    if (newGame) newGame.hidden = true;
    const learn = $('#learn-to-play');
    if (learn) { learn.textContent = 'Restart tutorial'; learn.addEventListener('click', event => { event.preventDefault(); clearTutorial(); location.reload(); }); }
    document.title = `Learn to play · ${document.title}`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();

  globalThis.galacticReachTutorial = {
    active: true, rules: RULES, lessons: LESSONS, steps: STEPS,
    engineOptions: () => ({ tutorial: true, random: seeded(SEED), lineup: [1, 2, 3], victoryTarget: 40 }),
    tip, coachAction, progress: () => ({ ...progress })
  };
})();
