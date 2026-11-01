// Golden state hashes were captured from the unchanged browser rules at cb97f8b.
// This checks the shared rule extraction against that independent prior version.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '..');
const adapterSource = fs.readFileSync(path.join(root, 'prototypes/galactic-reach/adapter.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'prototypes/galactic-reach/app.js'), 'utf8');
function random() { let n = 1729; return () => ((n = (Math.imul(n,1664525)+1013904223)>>>0) / 2**32); }
function engine() {
  const context = vm.createContext({});
  vm.runInContext(adapterSource + source, context);
  // Test instrumentation only: capture the private rule port. Never exported to policies.
  const realAdapter = context.createGalacticAdapter;
  let port;
  context.createGalacticAdapter = e => { port = e; return realAdapter(e); };
  const adapter = context.createGalacticReach({ headless: true, random: random() });
  return { port, adapter };
}
function hash(state) { return createHash('sha256').update(JSON.stringify(state)).digest('hex'); }
function scenarios(port) {
  const results = { initial: hash(port.state) };
  const p = port.state.players[0];
  p.resources = {matter:20, energy:20, biomass:20, data:20};
  assert.equal(port.buildShip(0,'-7,0','frigate'),true);
  assert.equal(port.buildShip(0,'-8,0','researcher'),true);
  assert.equal(port.buildUpgrade(0,'-8,-1','warehouse'),true);
  assert.equal(port.buildUpgrade(0,'-8,-1','warehouse'),true);
  results.builds = hash(port.state);
  port.state.fleets['0,0'] = {0:{scout:1,researcher:0,frigate:0,dreadnought:0}};
  assert.equal(port.colonizePlanet(0,'0,0'),true);
  assert.equal(port.colonizePlanet(0,'0,0'),false);
  results.colony = hash(port.state);
  port.state.phase = 'buy';
  assert.equal(port.buyCard(0,'market',0),true);
  assert.equal(port.upgradeStarter(0,p.hand.find(c=>c.starter).id),true);
  results.buy = hash(port.state);
  return results;
}
if (require.main === module) {
  assert.deepEqual(scenarios(engine().port), JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/galactic-reach-v4.json'),'utf8')));
  const {port,adapter} = engine();
  const before = hash(port.state);
  adapter.legalActions(0); adapter.observe(0);
  assert.equal(hash(port.state),before,'Legal-action discovery must not mutate rules or resources');
  const action = adapter.legalActions(0).find(a=>a.type==='resource');
  if (action) {
    const forged = JSON.parse(JSON.stringify(action)); forged.gain.data = 100;
    assert.throws(()=>adapter.applyAction(0,forged),/Illegal action/);
    assert.equal(hash(port.state),before);
  }
  console.log('Galactic Reach: v4 rule conformance and non-mutating legality passed.');
}
module.exports = {scenarios,random};
