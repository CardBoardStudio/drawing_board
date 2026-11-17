// Balance package: captures need a Fleet, decisive wins score 2, Wonder trim, cheap-card fixes,
// Archive Purge choice and the dealt solo lineup. Rules: rulebook #combat, #victory, #cards,
// #buy, #construct-two-builds, #setup, #rival-cards.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('prototypes/galactic-reach/app.js'), adapterSource = read('prototypes/galactic-reach/adapter.js');
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const plain = v => JSON.parse(JSON.stringify(v));

function game(options = {}) {
  const c = vm.createContext({});
  vm.runInContext(adapterSource + app.replace('      clone, deckContents,', '      runAiOperation, findColonizeTarget, chooseAiMove, clone, deckContents,'), c);
  let e; const factory = c.createGalacticAdapter; c.createGalacticAdapter = x => { e = x; return factory(x); };
  c.createGalacticReach({ headless: true, random: rng(39), ...options });
  return { e, s: e.state, p: e.state.players[0], adapter: () => factory(e) };
}
const legal = (g, seat = 0) => g.adapter().legalActions(seat);
function act(g, seat, type, match = () => true) {
  const a = g.adapter(), action = a.legalActions(seat).find(x => x.type === type && match(x));
  assert(action, `Expected a legal ${type}`); a.applyAction(seat, action); return action;
}
const ops = (g, seat = 0) => { g.s.phase = 'operations'; g.s.activePlayer = seat; g.s.pendingConstruct = null; };
const big = p => { p.resourceLimits = { matter: 30, energy: 30, biomass: 30, data: 30 }; p.resources = { matter: 20, energy: 20, biomass: 20, data: 20 }; };

// #combat: a capture needs your Settler and at least one of your Fleets on the enemy center.
for (const key of ['colonize', 'colonyPods']) {
  const g = game(), { s, p } = g; ops(g); big(p);
  const center = s.clusters[1].center; // Ember's home Colony
  assert.equal(s.planets[center].owner, 1);
  p.hand = [{ key, id: 'col' }];
  s.fleets[center] = { 0: { settler: 1, explorer: 0, fleet: 0 } };
  assert(!legal(g).some(a => a.type === 'colonize'), `${key}: a lone Settler cannot capture`);
  assert.equal(g.e.colonizePlanet(0, center, { tag: g.e.ALL_CARDS[key].tag }, true), false);
  s.fleets[center][0].fleet = 1;
  act(g, 0, 'colonize', a => a.coord === center && a.card === 'col');
  assert.equal(s.planets[center].owner, 0, `${key}: Settler and Fleet capture`);
  assert.equal(s.fleets[center][0].fleet, 1, 'The Fleet stays');
  assert.equal(s.fleets[center][0].settler, key === 'colonyPods' ? 1 : 0, 'Colonize consumes the Settler; Colony Pods keeps it');
}
// Founding a neutral Colony still needs only a Settler.
{
  const g = game(), { s, p } = g; ops(g); big(p);
  const world = s.clusters.find(c => c.kind === 'world' && s.planets[c.center].owner === null);
  p.hand = [{ key: 'colonize', id: 'col' }]; s.fleets[world.center] = { 0: { settler: 1, explorer: 0, fleet: 0 } };
  act(g, 0, 'colonize', a => a.coord === world.center); assert.equal(s.planets[world.center].owner, 0);
}
// Browser rivals: no capture target for a lone Settler; a Settler with a Fleet captures.
{
  const g = game(), { s, e } = g, bot = s.players[1]; big(bot);
  const center = s.clusters[0].center; s.fleets = { [center]: { 1: { settler: 1, explorer: 0, fleet: 0 } } };
  assert.equal(e.findColonizeTarget(1), null, 'No capture without a Fleet');
  s.fleets[center][1].fleet = 1; assert.equal(e.findColonizeTarget(1), center);
  bot.hand = [{ key: 'colonize', id: 'rival-col' }]; ops(g, 1); e.runAiOperation();
  assert.equal(s.planets[center].owner, 1, 'The rival captures with its escort');
}
// Split moves: a rival's last Fleet stays with a Settler that can capture where it stands.
{
  const g = game(), { s, e } = g; big(s.players[1]);
  const center = s.clusters[0].center; s.fleets = { [center]: { 1: { settler: 1, explorer: 0, fleet: 1 } } };
  const move = e.chooseAiMove(1, { key: 'move', id: 'mv' });
  assert(!move || move.source !== center || move.units?.fleet === 0, 'The escort stays on the capturable center');
}

// #victory: a decisive combat victory is worth 2 Prestige; the observation says so.
{
  const g = game(), { s, e } = g;
  assert.equal(e.COMBAT_VICTORY_PRESTIGE, 2);
  s.players[0].combatVictories = 3; assert.equal(plain(e.state.players[0]).combatVictories, 3);
  assert.equal(e.calculatePrestige(0), 3 + 6, 'Home Colony 3 + three decisive wins at 2');
  const view = g.adapter().observe(0);
  assert.equal(view.combatVictoryPrestige, 2); assert.equal(view.captureNeedsFleet, true);
}

// #cards: printed values of the trimmed Wonders and reworked cheap cards.
{
  const { e } = game(), C = e.ALL_CARDS;
  // Rebalance b2 (2026-11-16 card-evolution study) trims Dyson Lattice again, 5 -> 4.
  assert.equal(C.dysonLattice.gainPrestige, 4); assert.match(C.dysonLattice.text, /gain 4 permanent Prestige/);
  assert(!C.senateSeat);
  assert(!C.boardingMarines);
  assert(!C.miningCharter && !C.bioReactor);
  assert(C.prefabYards.secondBuild && !C.orbitalFoundry && !C.worldEngine.secondBuild);
  // Prices are unchanged by this package.
  assert.deepEqual(plain(C.dysonLattice.cost), { matter: 4, energy: 8, data: 2 });
  assert.deepEqual(plain(C.monumentOfAccord.cost), { matter: 6, biomass: 2, data: 2 });
}
// Buying a Wonder pays its new Prestige; server rivals read it from the observation.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; big(p);
  s.market = [{ key: 'monumentOfAccord', id: 'senate' }, { key: 'dysonLattice', id: 'dyson' }, { key: 'railBattery', id: 'marines' }];
  const view = g.adapter().observe(0);
  assert.deepEqual(plain(view.marketPrestige), [3, 4, 0]);
  assert.deepEqual(plain(view.tacticStats.railBattery), { attack: 2, shield: 0, pierce: false });
  assert.deepEqual(plain(view.tacticStats.phaseLance), { attack: 2, shield: 0, pierce: true });
  act(g, 0, 'buy', a => a.key === 'monumentOfAccord'); assert.equal(p.cardPrestige, 3);
}
// Prefab Yards: one discounted build, then you may build once more at full price.
{
  const g = game(), { s, p } = g; ops(g);
  const [, first, second] = s.clusters[0].coords;
  p.resourceLimits = { matter: 10, energy: 10, biomass: 10, data: 10 };
  p.resources = { matter: 1, energy: 1, biomass: 0, data: 1 }; p.hand = [{ key: 'prefabYards', id: 'yards' }];
  act(g, 0, 'build', a => a.card === 'yards' && a.coord === first && a.kind === 'harvester');
  assert.deepEqual(plain(p.resources), { matter: 1, energy: 1, biomass: 0, data: 1 }, 'The 1/1/1 Harvester was free at −1 of each');
  assert.equal(s.pendingConstruct.cardName, 'Prefab Yards'); assert.equal(s.activePlayer, 0, 'The turn waits for the second build');
  assert(p.inPlay.some(c => c.id === 'yards'));
  const seconds = legal(g).filter(a => a.type === 'second_build');
  assert(seconds.some(a => a.coord === second && a.kind === 'harvester'), 'A second Harvester at full price is affordable');
  act(g, 0, 'second_build', a => a.coord === second && a.kind === 'harvester');
  assert.deepEqual(plain(p.resources), { matter: 0, energy: 0, biomass: 0, data: 0 }, 'The second build paid full price');
  assert.equal(s.planets[second].upgrade, 'harvester'); assert.equal(s.pendingConstruct, null);
}
// World Engine still builds once.
{
  const g = game(), { s, p } = g; ops(g); p.hand = [{ key: 'worldEngine', id: 'engine' }];
  act(g, 0, 'build', a => a.card === 'engine' && a.kind === 'starbase'); assert.equal(s.pendingConstruct, null);
}
// Procurement Hub alone discounts one purchase; later affordable purchases remain legal.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; big(p);
  s.market = [{ key: 'ionThrusters', id: 'ion' }, { key: 'strategyCore', id: 'haven' }];
  p.hand = [{ key: 'procurementHub', id: 'hub' }];
  act(g, 0, 'buy', a => a.key === 'ionThrusters'); assert.equal(p.resources.energy, 15, 'First purchase at full price');
  act(g, 0, 'buy_effect', a => a.card === 'hub'); assert.equal(p.buyHubDiscounts, 1);
  assert.deepEqual(plain(g.e.purchaseCost(p, 'strategyCore')), { energy: 0, data: 4 });
  act(g, 0, 'buy', a => a.key === 'strategyCore'); assert.equal(p.resources.data, 16); assert.equal(p.buyHubDiscounts, 0);
  assert(legal(g).some(a => a.type === 'buy'), 'The discount is used up, but purchases are unlimited');
}

// #setup: headless games and shared tables keep the default seats; a lineup option deals rivals.
{
  const names = s => plain(s.players.map(p => p.name)), strategies = s => plain(s.players.map(p => p.strategy));
  const { s } = game();
  assert.deepEqual(names(s), ['You', 'Ember Directorate', 'Violet Assembly', 'Helios Compact']);
  const dealt = game({ lineup: [3, 1, 2] }).s;
  assert.deepEqual(names(dealt), ['You', 'Helios Compact', 'Ember Directorate', 'Violet Assembly']);
  assert.deepEqual(strategies(dealt), ['human', 'expansion', 'military', 'economy']);
  assert.equal(dealt.players[1].color, '#f2cf66', 'A faction keeps its colour');
  assert.deepEqual(plain(dealt.planets), plain(s.planets), 'The lineup is dealt after the map: same galaxy');
  assert.deepEqual(names(game({ lineup: [1, 1, 2] }).s), names(s), 'An invalid lineup falls back to the default');
}

console.log('Balance package: Fleet captures, combat 2, Wonder trim, card fixes, Hub discount, second builds and dealt lineups passed.');
