const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function game() {
  const context = vm.createContext({});
  for (const name of ['adapter.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'prototypes/galactic-reach', name), 'utf8'), context);
  }
  let engine;
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = value => { engine = value; return factory(value); };
  let seed = 17;
  context.createGalacticReach({ headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  return { e: engine, s: engine.state, p: engine.state.players[0], adapter: () => factory(engine) };
}

{
  const { e, s, adapter } = game();
  assert.equal(adapter().rulesVersion, 'galactic-reach/26.31');
  assert.equal(s.version, 26);
  assert.equal(s.rulesRevision, 31);
  assert(!('awards' in s));
  assert(!('DIRECTIVES' in e));
  const score = e.calculatePrestige(0);
  s.awards = { fleet: 0, reach: 0, occupation: 0 };
  assert.equal(e.calculatePrestige(0), score, 'Removed awards never contribute Prestige');
}

for (const type of ['settler', 'fleet', 'explorer']) {
  const { e, s, p, adapter } = game();
  const target = s.clusters[4].center;
  const [q, r] = target.split(',').map(Number);
  const source = `${q - 1},${r}`;
  s.fleets = { [source]: { 0: { settler: 0, fleet: 0, explorer: 0, [type]: 1 } } };
  p.hand = [{ key: 'move', id: 'discover' }];
  assert(e.clusterKnown(s.clusters[4], 0));
  assert(!e.clusterRevealed(s.clusters[4], 0));
  const a = adapter();
  const action = a.legalActions(0).find(item => item.type === 'move' && item.destination === target && item.moveGroup === (type === 'explorer' ? 'explorer' : 'ships'));
  assert(action, `${type} can survey a public world`);
  a.applyAction(0, action);
  assert.deepEqual(plain(s.clusters[4].revealedBy), [0, 1, 2, 3], `${type} surveys the world and reveals its relic to everyone`);
}

{
  const { e, s } = game();
  s.players.forEach(player => { player.resources = { matter: 0, energy: 0, biomass: 0, data: 0 }; player.hand = []; });
  for (let seat = 0; seat < 4; seat++) {
    assert.equal(s.activePlayer, seat);
    e.passOperations(seat);
    assert.equal(s.phase, 'buy');
    e.nextBuyPlayer();
  }
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'operations');
  assert.equal(s.firstPlayer, 1);
  for (const player of s.players) assert.deepEqual(plain(player.resources), { matter: 1, energy: 0, biomass: 0, data: 0 });
}

for (const resource of ['matter', 'energy', 'biomass', 'data']) {
  const { e, s, p, adapter } = game();
  s.phase = 'buy';
  p.resources = { matter: 0, energy: 0, biomass: 0, data: 0, [resource]: 3 };
  p.discard = [{ key: 'construct', id: 'trash', starter: true }];
  p.buyStartDiscardIds = ['trash'];
  const a = adapter();
  const action = a.legalActions(0).find(item => item.type === 'decommission');
  assert.equal(action.resource, resource);
  a.applyAction(0, action);
  assert.equal(p.resources[resource], 0);
  assert.equal(p.discard.length, 0);
}

{
  const { e, s, p, adapter } = game();
  s.phase = 'buy';
  p.resources = { matter: 2, energy: 2, biomass: 0, data: 0 };
  p.discard = [{ key: 'construct', id: 'trash' }];
  p.buyStartDiscardIds = ['trash'];
  const before = JSON.stringify(s);
  assert(!e.decommission(0, 'trash', 'matter'));
  assert(!e.decommission(0, 'trash', 'energy'));
  assert.equal(JSON.stringify(s), before);
  assert(!adapter().legalActions(0).some(item => item.type === 'decommission'), 'Mixed resources cannot pay the trash cost');
  p.resources.matter = 3;
  const a = adapter();
  const unchanged = JSON.stringify(s);
  assert.throws(() => a.applyAction(0, { type: 'decommission', card: 'trash', resource: 'energy' }), /Illegal/);
  assert.equal(JSON.stringify(s), unchanged);
}

{
  const { e, s, p, adapter } = game();
  p.resources = { matter: 8, energy: 2, biomass: 0, data: 0 };
  const result = e.addResources(p, { data: 3 });
  assert.equal(result.totalAdded, 3);
  assert.equal(result.totalLost, 0);
  assert.equal(p.resources.data, 3);
  assert.equal(e.totalResources(p), 13);
  const a = adapter();
  assert(a.legalActions(0).every(item => item.type === 'discard_overflow'));
  assert.equal(a.legalActions(1).length, 0);
  const before = JSON.stringify(s);
  assert.throws(() => a.applyAction(0, { type: 'pass' }), /Illegal/);
  assert(!e.discardOverflow(0, { matter: -1, data: 4 }));
  assert(!e.discardOverflow(0, { matter: 4 }));
  assert(!e.discardOverflow(0, { unknown: 3 }));
  assert.equal(JSON.stringify(s), before);
  a.applyAction(0, { type: 'discard_overflow', resource: 'matter', amount: 3 });
  assert.deepEqual(plain(p.resources), { matter: 5, energy: 2, biomass: 0, data: 3 });
  assert.equal(e.overflowPlayer(), -1);
  assert.equal(a.activeSeat(), s.activePlayer);
}

{
  const { e, s, p, adapter } = game();
  p.resources = { matter: 9, energy: 1, biomass: 0, data: 0 };
  p.hand = [{ key: 'move', id: 'convert' }, { key: 'construct', id: 'keep' }];
  const a = adapter();
  const action = a.legalActions(0).find(item => item.type === 'resource' && item.card === 'convert');
  assert(action, 'A full store can collect a card conversion');
  a.applyAction(0, action);
  assert.equal(p.resources.energy, 2);
  assert.equal(p.hand.length, 1);
  assert(a.legalActions(0).every(item => item.type === 'discard_overflow'));
  a.applyAction(0, { type: 'discard_overflow', resource: 'matter', amount: 1 });
  assert.equal(s.activePlayer, 0);
  assert.equal(s.phase, 'operations');
  assert(a.legalActions(0).some(item => item.type === 'resource' && item.card === 'keep'));
}

{
  const { e, s, adapter } = game();
  s.players.forEach(player => { player.resources = { matter: 10, energy: 0, biomass: 0, data: 0 }; player.hand = []; });
  for (let seat = 0; seat < 4; seat++) { e.passOperations(seat); e.nextBuyPlayer(); }
  assert.equal(s.round, 2);
  assert.equal(s.activePlayer, 1);
  const a = adapter();
  for (let seat = 0; seat < 4; seat++) {
    assert.equal(a.activeSeat(), seat, 'Production excess is resolved before normal turns');
    assert.equal(s.players[seat].resources.matter, 11);
    a.applyAction(seat, { type: 'discard_overflow', resource: 'matter', amount: 1 });
  }
  assert.equal(a.activeSeat(), 1);
  assert.equal(s.phase, 'operations');
}

for (const key of ['salvageCrews', 'naniteOssuary']) {
  const { e, s, adapter } = game();
  s.planets = {};
  s.fleets = {
    '0,0': { 0: { settler: 0, explorer: 0, fleet: 1 } },
    '1,0': { 1: { settler: 0, explorer: 0, fleet: 1 } }
  };
  for (const seat of [0, 1]) {
    s.players[seat].resources = { matter: 0, energy: 0, biomass: 0, data: 10 };
    s.players[seat].hand = [{ key, id: `salvage-${seat}` }];
  }
  assert(e.executeMove(0, '0,0', '1,0', { moveGroup: 'ships' }));
  while(s.pendingCombat) { const seat=e.combatActor(); assert(e.applyCombatAction(seat,s.pendingCombat.stage==='escape'?{type:'combat_stay'}:{type:'combat_tactic',tactic:'concentratedFire'})); }
  const excess = key === 'naniteOssuary' ? 4 : 2;
  const a = adapter();
  for (const seat of [0, 1]) {
    assert.equal(s.players[seat].resources.matter, 2, 'Both factions collect the full combat salvage');
    assert.equal(e.totalResources(s.players[seat]), 10 + excess, 'Combat cleanup preserves excess resources');
    assert.equal(a.activeSeat(), seat);
    a.applyAction(seat, { type: 'discard_overflow', resource: 'data', amount: excess });
    assert.equal(s.players[seat].resources.matter, 2, 'The chosen discard preserves the collected salvage');
  }
  assert.equal(e.overflowPlayer(), -1);
}

console.log('Streamlined rules: all-ship discovery, removed awards/directives, atomic three-of-one-type trash costs, full resource collection, forced discard choices, and production interruptions passed.');
