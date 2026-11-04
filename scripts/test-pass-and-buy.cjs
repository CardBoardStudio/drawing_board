// Regression coverage for the 7.12 experiment and preservation of 6.11 behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'prototypes/galactic-reach/app.js'), 'utf8');
function engine(archived = false) {
  const context = vm.createContext({});
  const base = archived ? 'crates/galactic-reach/rules/v6-' : 'prototypes/galactic-reach/';
  vm.runInContext(fs.readFileSync(path.join(root, `${base}adapter.js`), 'utf8') + fs.readFileSync(path.join(root, `${base}app.js`), 'utf8'), context);
  const createAdapter = context.createGalacticAdapter;
  let port, seed = 79;
  context.createGalacticAdapter = e => { port = e; return createAdapter(e); };
  const adapter = context.createGalacticReach({headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32)});
  return {port, adapter};
}
function act(game, type, predicate = () => true) {
  const seat = game.adapter.activeSeat();
  const action = game.adapter.legalActions(seat).find(a => a.type === type && predicate(a));
  assert(action, `Seat ${seat} has legal ${type}`);
  game.adapter.applyAction(seat, action);
  return action;
}
for (const first of [0, 2]) {
  const g = engine(), s = g.port.state;
  s.firstPlayer = s.activePlayer = first;
  for (let i = 0; i < 4; i++) {
    const seat = (first + i) % 4, p = s.players[seat];
    act(g, 'pass');
    assert.equal(s.phase, 'buy'); assert.equal(s.activePlayer, seat);
    assert(p.passed); assert.equal(s.players.filter(p => p.passed).length, i + 1);
    assert(!g.adapter.legalActions(seat).some(a => ['pass', 'resource', 'move'].includes(a.type)));
    assert.throws(() => g.adapter.applyAction((seat + 1) % 4, {type: 'finish_buy'}), /Illegal action/);
    act(g, 'finish_buy');
    if (i < 3) { assert.equal(s.phase, 'operations'); assert.equal(s.activePlayer, (seat + 1) % 4); }
  }
  assert.equal(s.phase, 'directive', 'Only the final Buy triggers cleanup and the directive');
  assert(s.players.every(p => p.hand.length === 0));
  act(g, 'directive');
  assert.equal(s.round, 2); assert.equal(s.firstPlayer, (first + 1) % 4);
  assert(s.players.every(p => !p.passed && p.bought === 0 && !p.decommissioned));
}
// A faction finishing Buy is skipped while the others can still take orders.
{
  const g = engine(); g.port.state.players[1].hand = [{id: 'probe-2000', key: 'probe', starter: true}];
  act(g, 'pass'); act(g, 'finish_buy');
  act(g, 'probe'); assert.equal(g.adapter.activeSeat(), 2);
  act(g, 'pass'); act(g, 'finish_buy'); act(g, 'pass'); act(g, 'finish_buy');
  assert.equal(g.port.state.phase, 'operations'); assert.equal(g.adapter.activeSeat(), 1);
  act(g, 'pass'); act(g, 'finish_buy'); assert.equal(g.port.state.phase, 'directive');
}
// Decommission includes originals/upgrades, but excludes hand cards and this Buy's purchases.
for (const upgraded of [false, true]) {
  const g = engine(), p = g.port.state.players[0];
  const card = {id: 'original-1000', key: 'move', starter: true, upgraded};
  p.discard = [card]; p.resources = {matter: 1, energy: 1, biomass: 1, data: 5};
  assert(!g.port.decommission(0, card.id), 'Trashing is Buy-only');
  act(g, 'pass');
  assert(g.adapter.legalActions(0).some(a => a.type === 'decommission' && a.card === card.id));
  act(g, 'buy', a => a.source === 'basic' && a.key === 'move');
  const legal = g.adapter.legalActions(0).filter(a => a.type === 'decommission');
  assert.equal(legal.length, 1); assert.equal(legal[0].card, card.id);
  const before = p.resources.data; act(g, 'decommission');
  assert.equal(p.resources.data, before - 1); assert(!p.discard.some(c => c.id === card.id));
  assert(!g.adapter.legalActions(0).some(a => a.type === 'decommission'), 'No eligible cards remain; the new purchase is excluded');
}
{
  const g = engine(), p = g.port.state.players[0];
  p.hand = [{id: 'broker-1000', key: 'dataBrokerage'}];
  p.discard = [{id: 'original-1001', key: 'construct', starter: true, upgraded: true}];
  p.deck = [{id: 'draw-1002', key: 'move'}, {id: 'draw-1003', key: 'probe'}];
  act(g, 'special');
  assert.equal(p.hand.length, 2);
  assert(![...p.deck, ...p.hand, ...p.discard].some(c => c.id === 'original-1001'));
}
const old = engine(true);
act(old, 'pass'); assert.equal(old.port.state.phase, 'operations'); assert.equal(old.adapter.activeSeat(), 1);
assert.equal(old.adapter.rulesVersion, 'galactic-reach/6.11');
// Instrument only the browser entry point, so batch conversion uses production functions.
const boot = source.indexOf('\n  if (headless) {\n    state = newState();');
assert(boot > 0);
const memory = new Map(), context = vm.createContext({setTimeout: () => 0, clearTimeout: () => {}, document: {}, console});
vm.runInContext(source.slice(0, boot) + `
  render = () => {}; toast = () => {}; scheduleAiTurn = () => {}; switchTab = () => {};
  return {get state(){return state;}, set state(s){state=s;}, newState, makeCard, convertAllResources, playResourceMode, passOperations, nextBuyPlayer, saveGame, loadGame, SAVE_KEY, TURN_HISTORY_KEY};
}`, context);
const browser = context.createGalacticReach({storage: {getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k)}});
function fixture(cards, resources) {
  browser.state = browser.newState();
  const s = browser.state; s.phase = 'operations'; s.activePlayer = 0; s.turnStage = 'prep';
  s.players[0].hand = cards; s.players[0].resources = resources;
  return s;
}
const make = (key, upgraded = false) => ({...browser.makeCard(key, true), upgraded});
{
  const large = make('construct', true), small = make('probe');
  const s = fixture([large, small], {matter: 9, energy: 0, biomass: 0, data: 0});
  browser.convertAllResources();
  assert.equal(s.players[0].resources.data, 1, 'Skip a too-large card and still convert a later one that fits');
  assert.equal(s.players[0].hand.length, 1); assert.equal(s.players[0].hand[0].id, large.id);
  assert.equal(s.activePlayer, 0); assert.equal(s.phase, 'operations');
  browser.convertAllResources(); assert.equal(s.players[0].hand.length, 1, 'Full storage leaves cards untouched');
}
{
  const cards = [make('move'), make('tradeConsortium'), make('procurementNetwork')];
  const s = fixture(cards, {matter: 0, energy: 0, biomass: 0, data: 0});
  s.actionCardId = cards[0].id; s.actionMode = 'move'; s.turnStage = 'action';
  browser.convertAllResources();
  assert.equal(s.actionCardId, null); assert.equal(s.actionMode, null);
  assert.equal(s.players[0].hand.length, 0); assert.equal(s.players[0].discard.length, 3);
  assert.equal(s.players[0].resources.energy, 1); assert.equal(s.players[0].resources.data, 4, 'Include wildcard and Buy-card gains');
  assert.equal(s.activePlayer, 0, 'Batch conversion does not consume the action');
}
{
  const s = fixture([make('move')], {matter: 0, energy: 0, biomass: 0, data: 0});
  s.turnStage = 'bonus-build'; s.pendingColonyBuild = {playerId: 0, colony: s.clusters[0].center};
  browser.convertAllResources(); assert(s.pendingColonyBuild, 'Conversion preserves the pending optional build');
}
for (const phase of ['buy', 'directive', 'policy']) {
  const s = fixture([make('move')], {matter: 0, energy: 0, biomass: 0, data: 0}); s.phase = phase;
  const before = JSON.stringify(s); browser.convertAllResources(); assert.equal(JSON.stringify(s), before);
}
{
  const s = fixture([make('move')], {matter: 0, energy: 0, biomass: 0, data: 0}); s.activePlayer = 1;
  const before = JSON.stringify(s); browser.convertAllResources(); assert.equal(JSON.stringify(s), before);
}
{
  fixture([make('probe')], {matter: 0, energy: 0, biomass: 0, data: 0});
  browser.convertAllResources(); browser.passOperations(0);
  const expected = JSON.stringify(browser.state); browser.state = browser.newState();
  assert(browser.loadGame()); assert.equal(JSON.stringify(browser.state), expected, 'Reload retains Buy seat, passed flags, and trash eligibility');
  browser.nextBuyPlayer(); assert.equal(browser.state.phase, 'operations'); assert.equal(browser.state.activePlayer, 1);
  memory.set('galactic-reach-save-v6', 'previous-game'); browser.saveGame();
  assert.equal(memory.get('galactic-reach-save-v6'), 'previous-game');
}
console.log('Pass & Buy: interleaved turns, cleanup, starter trash, conversion limits, reload, and archived 6.11 passed.');
