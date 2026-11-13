const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = x => JSON.parse(JSON.stringify(x));
function game(version = null) {
  const base = version ? `crates/galactic-reach/rules/v${version}-` : 'prototypes/galactic-reach/';
  const c = vm.createContext({});
  vm.runInContext(['adapter.js', 'app.js'].map(n => fs.readFileSync(path.join(root, base + n), 'utf8')).join('\n'), c);
  const factory = c.createGalacticAdapter;
  let e, seed = 73;
  c.createGalacticAdapter = p => {e = p; return factory(p);};
  const a = c.createGalacticReach({headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32)});
  return {e, a, s: e.state, p: e.state.players[0], fresh: () => factory(e)};
}
for (const phase of ['operations', 'buy']) {
  const {e, a, s, p, fresh} = game();
  s.phase = phase;
  p.resources = {matter: 2, energy: 2, biomass: 2, data: 2};
  s.actionMode = 'move'; s.actionCardId = 'pending-order'; s.moveSource = s.clusters[0].center;
  const before = {map: JSON.stringify(s.planets), fleets: JSON.stringify(s.fleets), hand: JSON.stringify(p.hand), stage: s.turnStage};
  const upgrade = a.legalActions(0).find(x => x.type === 'increase_storage');
  assert(upgrade);
  assert.throws(() => a.applyAction(0, {...upgrade, capacity: 100}), /Illegal action/);
  a.applyAction(0, upgrade);
  assert.equal(e.playerCapacity(0), 15);
  assert.deepEqual(plain(p.resources), {matter: 1, energy: 1, biomass: 1, data: 1});
  assert.equal(p.storagePurchases,1);
  assert.throws(() => a.applyAction(0, upgrade), /Illegal action/);
  p.resources = {matter: 2, energy: 2, biomass: 2, data: 2};
  fresh().applyAction(0, upgrade);
  assert.equal(e.playerCapacity(0), 20);
  assert.deepEqual(plain(p.resources), {matter: 0, energy: 0, biomass: 0, data: 0});
  assert.equal(a.activeSeat(), 0); assert.equal(s.phase, phase); assert.equal(s.turnStage, before.stage);
  assert.equal(s.actionMode, 'move'); assert.equal(s.actionCardId, 'pending-order');
  assert.equal(p.bought, 0); assert.equal(JSON.stringify(p.hand), before.hand);
  assert.equal(JSON.stringify(s.planets), before.map); assert.equal(JSON.stringify(s.fleets), before.fleets);
  const after = JSON.stringify(s);
  assert.throws(() => a.applyAction(0, upgrade), /Illegal action/);
  assert.equal(JSON.stringify(s), after);
  Object.values(s.planets).forEach(planet => {planet.owner = 1; planet.occupiedBy = 2;});
  assert.equal(e.playerCapacity(0), 20, 'Capacity does not depend on territory or occupation');
}
for (const phase of ['production', 'draw', 'cleanup', 'directive', 'policy', 'finished']) {
  const {e, s, p} = game(); s.phase = phase; p.resources = {matter: 1, energy: 1, biomass: 1, data: 1};
  const before = JSON.stringify(s); assert(!e.increaseStorage(0)); assert.equal(JSON.stringify(s), before);
}
for (const resource of ['matter', 'energy', 'biomass', 'data']) {
  const {e, s, p} = game(); p.resources = {matter: 1, energy: 1, biomass: 1, data: 1}; p.resources[resource]--;
  const before = JSON.stringify(s); assert(!e.increaseStorage(0)); assert(!e.increaseStorage(1)); assert.equal(JSON.stringify(s), before);
}
{
  const {e, a, s, p, fresh} = game();
  assert.deepEqual(Object.keys(e.SHIP_STATS).sort(), ['explorer', 'fleet', 'settler']);
  assert.deepEqual(Object.keys(e.STRUCTURES).sort(), ['harvester', 'starbase']);
  assert(!e.ALL_CARDS.gateSynchronization);
  assert(Object.values(s.planets).every(x => x.special !== 'gate' && !('researchStationOwner' in x)));
  p.hand = [{id: 'construct', key: 'construct'}]; p.resources = {matter: 10, energy: 10, biomass: 10, data: 10};
  const before = JSON.stringify(s);
  for (const kind of ['warehouse', 'dreadnought', 'frigate']) {
    assert(!a.legalActions(0).some(x => x.kind === kind));
    assert.throws(() => a.applyAction(0, {type: 'build', card: 'construct', key: 'construct', kind, coord: s.clusters[0].center, discountResource: null}), /Illegal action/);
  }
  assert.equal(JSON.stringify(s), before);
  s.planets = {'0,0': {special: 'gate'}, '6,0': {special: 'gate'}};
  assert(!e.reachableFrom('0,0', 0, 2, false, {fleet: 1}).includes('6,0'), 'Movement never teleports');
}
{
  const {e, a, s, p} = game(10);
  const relics = Object.keys(s.planets).filter(k => s.planets[k].special === 'relic');
  for (let i = 0; i < 3; i++) {
    s.phase = 'operations'; s.activePlayer = 0;
    const coord = relics[i], planet = s.planets[coord];
    s.fleets[coord] = {0: {settler: 0, explorer: 1, fleet: 0}};
    p.hand = [{id: `recover-${i}`, key: 'construct', starter: true, upgraded: i === 0}];
    p.resources = {matter: 1, energy: 1, biomass: 0, data: i === 0 ? 1 : 2};
    // A new adapter prevents a manually edited test fixture from retaining cached commands.
    const c = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(root, 'crates/galactic-reach/rules/v10-adapter.js'), 'utf8'), c);
    const adapter = c.createGalacticAdapter(e);
    const action = adapter.legalActions(0).find(x => x.type === 'recover_relic' && x.coord === coord && x.discountResource === (i === 0 ? 'data' : null));
    assert(action, 'Construct and its chosen discount support direct recovery');
    adapter.applyAction(0, action);
    assert.equal(planet.relicClaimed, true); assert.equal(planet.relicRecoveredBy, 0);
    assert.equal(planet.owner, null); assert.equal(planet.upgrade, null); assert.equal(planet.hasColony, false);
    assert(!s.fleets[coord]?.[0]); assert.equal(p.hand.length, 0);
    assert.equal(e.relicRecoveryCount(0), i + 1); assert.equal(p.relics, i + 1);
    p.resources = {matter: 10, energy: 10, biomass: 0, data: 10}; s.fleets[coord] = {0: {explorer: 1}};
    const before = JSON.stringify(s); assert(!e.recoverRelic(0, coord)); assert.equal(JSON.stringify(s), before);
    if (i < 2) assert(!e.exchangeRelic(0));
  }
  s.phase = 'buy'; s.activePlayer = 0;
  assert(e.exchangeRelic(0)); assert.equal(p.relics, 2); assert.equal(p.relicRecoveries, 3);
  assert(e.exchangeRelic(0)); assert.equal(p.relicRecoveries, 3, 'Exchanges do not relock the milestone');
}
{
  const {e, a, s} = game(9);
  assert.equal(a.rulesVersion, 'galactic-reach/9.14');
  assert(e.SHIP_STATS.frigate && e.SHIP_STATS.dreadnought && e.STRUCTURES.warehouse && e.STRUCTURES.research);
  assert.equal(Object.values(s.planets).filter(p => p.special === 'gate').length, 2);
  assert(!a.legalActions(0).some(x => x.type === 'increase_storage'));
}
console.log('Capacity: paid repeatable +5 in Operations/Buy, atomic guards, preserved orders and purchases, no map building, removed components/Gates, direct discounted relic recovery, exchange milestone, and archived 9.14 passed.');
