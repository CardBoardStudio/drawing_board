// Keep the previous Settlers/Alien Relics contracts verified on archived 11.16.
// Behavior regressions for the incompatible Settlers & Explorers ruleset.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function engine(seed = 1, archive = 11) {
  const base = archive ? `crates/galactic-reach/rules/v${archive}-` : 'prototypes/galactic-reach/';
  const context = vm.createContext({});
  vm.runInContext(['adapter.js', 'app.js'].map(file => fs.readFileSync(path.join(root, base + file), 'utf8')).join('\n'), context);
  const factory = context.createGalacticAdapter;
  let port;
  context.createGalacticAdapter = e => { port = e; return factory(e); };
  const adapter = context.createGalacticReach({headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32)});
  return {e: port, a: adapter};
}
const plain = value => JSON.parse(JSON.stringify(value));
for (let seed = 1; seed <= 100; seed++) {
  const {e, a} = engine(seed), s = e.state;
  assert.equal(a.rulesVersion, 'galactic-reach/11.16');
  assert.equal(s.version, 11);
  assert.equal(s.rulesRevision, 16);
  assert(!('activePolicy' in s) && !('policyVotes' in s));
  for (let seat = 0; seat < 4; seat++) {
    const colony = s.clusters[seat].center;
    assert.equal(s.planets[colony].owner, seat);
    assert.equal(s.planets[colony].hasColony, true);
    assert.equal(Object.values(s.planets).filter(p => p.owner === seat).length, 1);
    assert.equal(Object.values(s.planets).filter(p => p.upgrade).length, 0);
    assert.equal(Object.values(s.fleets).filter(group => group[seat]).length, 0);
    assert.deepEqual(plain(s.players[seat].resources), {matter: 1, energy: 0, biomass: 2, data: 0});
    assert(!('tracks' in s.players[seat]));
    assert(!('tracks' in a.observe(seat).players[seat]));
    assert.equal(e.calculatePrestige(seat), 1);
  }
}
{
  const {e} = engine();
  for (const [kind, speed] of [['settler', 1], ['fleet', 2], ['explorer', 3]]) {
    assert.equal(e.fleetMove({[kind]: 1}), speed);
    assert.equal(e.movementRange({[kind]: 1}, {key: 'move', upgraded: true}), speed + 1);
  }
  assert.equal(e.fleetMove({settler: 1, fleet: 1}), 1);
  assert.equal(e.fleetMove({explorer: 1, fleet: 1}), 2);
  assert.equal(e.fleetGroup({settler: 1, explorer: 1}, 'ships').explorer, 0);
  assert.equal(e.fleetGroup({settler: 1, explorer: 1}, 'explorer').settler, 0);
  assert(!e.SHIP_STATS.scout && !e.SHIP_STATS.researcher);
}
{
  const {e, a} = engine(), s = e.state, p = s.players[0], yard = s.clusters[0].coords[1];
  assert.equal(e.buildShip(0, yard, 'settler'), false, 'An empty home hex is not a Shipyard');
  p.hand = [{id: 'first-build', key: 'construct'}];
  p.resources = {matter: 2, energy: 1, biomass: 1, data: 1};
  const build = a.legalActions(0).find(action => action.type === 'build' && action.kind === 'starbase' && action.coord === yard);
  assert(build, 'The first Shipyard can be built beside the starting Colony');
  a.applyAction(0, build);
  assert.equal(s.planets[yard].upgrade, 'starbase');
  assert.deepEqual(plain(p.resources), {matter: 0, energy: 0, biomass: 0, data: 0});
  p.resources = {matter: 1, energy: 1, biomass: 0, data: 0};
  assert(e.buildShip(0, yard, 'settler'), 'A built Shipyard commissions Settlers');
  assert(!('tracks' in p));
}
{
  const {e} = engine(), s = e.state, p = s.players[0], home = s.clusters[0].center;
  p.resources = {matter: 0, energy: 1, biomass: 0, data: 2};
  assert(!e.buildShip(0, home, 'explorer'));
  const yard=s.clusters[0].coords[1];s.planets[yard].owner=0;s.planets[yard].upgrade='starbase';
  assert(e.buildShip(0,yard,'explorer'));
  const relic = Object.keys(s.planets).find(coord => s.planets[coord].special === 'relic');
  s.fleets[relic] = {0: {settler: 0, explorer: 1, fleet: 0}};
  p.resources = {matter: 1, energy: 1, biomass: 0, data: 2};
  assert(e.buildResearchStation(0, relic));
  assert.equal(s.planets[relic].researchStationOwner, 0);
  assert.equal(e.researchStationCount(0), 1);
  assert(!s.fleets[relic]?.[0], 'Recovering the relic consumes the Explorer');
}
{
  const {e} = engine(), s = e.state, p = s.players[0], target = s.clusters[4].center;
  s.fleets[target] = {0: {settler: 1, explorer: 0, fleet: 0}};
  p.resources = {matter: 0, energy: 0, biomass: 2, data: 0};
  assert(e.colonizePlanet(0, target));
  assert.equal(s.planets[target].owner, 0);
  assert(!s.fleets[target]?.[0], 'Colonizing consumes the Settler');
  const prestige = e.calculatePrestige(0);
  p.tracks = {expansion: 100, culture: 100, economy: 100, technology: 100};
  assert.equal(e.calculatePrestige(0), prestige, 'Influence never scores in this ruleset');
}
{
  const {e, a} = engine();
  for (let round = 1; round <= 6; round++) {
    assert.equal(e.state.round, round);
    let guard = 0;
    while (e.state.phase !== 'directive' && guard++ < 12) {
      const actions = a.legalActions(a.activeSeat());
      assert(!actions.some(action => action.type === 'vote'));
      const action = actions.find(action => action.type === (e.state.phase === 'operations' ? 'pass' : 'finish_buy'));
      assert(action, `The round must progress from ${e.state.phase}`);
      a.applyAction(a.activeSeat(), action);
    }
    assert.equal(e.state.phase, 'directive', `Round ${round} skips voting`);
    assert.equal(a.activeSeat(), e.state.firstPlayer);
    const directive = a.legalActions(a.activeSeat()).find(action => action.type === 'directive' && action.directive === 'economy');
    assert(directive);
    a.applyAction(a.activeSeat(), directive);
    assert(!('activePolicy' in e.state));
    assert(e.state.players.every(p => !('tracks' in p)));
  }
}
{
  const {e, a} = engine(1, 8);
  assert.equal(a.rulesVersion, 'galactic-reach/8.13');
  assert.equal(e.fleetMove({scout: 1}), 2);
  assert.equal(e.fleetMove({researcher: 1}), 1);
  assert.equal(e.fleetMove({frigate: 1}), 1);
  assert.equal(Object.values(e.state.planets).filter(p => p.upgrade === 'starbase').length, 4);
  assert('tracks' in e.state.players[0]);
  e.state.round = 3;
  e.startPolicyVote();
  assert(a.legalActions(a.activeSeat()).some(action => action.type === 'vote'), 'Archived 8.13 keeps its original politics');
}
console.log('Settlers: 100 starts, opening production, 1/2/3 movement, first Shipyard, relics, colonization, no influence scoring, six rounds without votes, and archived 8.13 passed.');
