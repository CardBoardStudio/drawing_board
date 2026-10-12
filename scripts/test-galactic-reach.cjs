// Mechanic and transport checks for the intentionally incompatible Long Reach rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function engine() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8') + fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8'), context);
  const realAdapter = context.createGalacticAdapter;
  let port, seed=1729;
  context.createGalacticAdapter = e => {port=e;return realAdapter(e);};
  const adapter=context.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  return {port,adapter};
}
const {port,adapter}=engine();
assert.equal(adapter.rulesVersion,'galactic-reach/5.10');
const before=JSON.stringify(port.state);
adapter.legalActions(0);adapter.observe(0);
assert.equal(JSON.stringify(port.state),before,'Observation and legality must not mutate state');
const action=adapter.legalActions(0).find(a=>a.type==='resource');
assert(action);
assert.throws(()=>adapter.applyAction(0,{...action,gain:{data:100}}),/Illegal action/);
assert.equal(JSON.stringify(port.state),before);
// Retain direct coverage of construction, upgrades, colonization, and purchases.
const e=engine().port, home=e.state.clusters[0], p=e.state.players[0];
p.resources={matter:20,energy:20,biomass:20,data:20};
assert(e.buildShip(0,home.coords[1],'frigate'));
assert(e.buildShip(0,home.center,'researcher'));
assert(e.buildUpgrade(0,home.coords[2],'warehouse'));
assert(e.buildUpgrade(0,home.coords[2],'warehouse'));
const center=e.state.clusters[4].center;
e.state.fleets[center]={0:{scout:1,researcher:0,frigate:0,dreadnought:0}};
assert(e.colonizePlanet(0,center));assert(!e.colonizePlanet(0,center));
e.state.phase='buy';assert(e.buyCard(0,'market',0));assert(e.upgradeStarter(0,p.hand.find(c=>c.starter).id));
// Open offers and free responses use exactly the same rule functions in the arena.
const t=engine();
for (const player of t.port.state.players) player.resources={matter:3,energy:3,biomass:0,data:0};
const offer=t.adapter.legalActions(0).find(a=>a.type==='trade_offer'&&a.giveType==='matter'&&a.getType==='energy'&&a.giveAmount===2&&a.getAmount===1);
assert(offer);
t.adapter.applyAction(0,offer); assert.equal(t.adapter.activeSeat(),1);
assert.equal(t.adapter.observe(1).tradeOffers[0].status,'open');
const accept=t.adapter.legalActions(1).find(a=>a.type==='trade_accept');assert(accept);
assert.throws(()=>t.adapter.applyAction(2,accept),/Illegal action/);
t.adapter.applyAction(1,accept);
assert.equal(t.adapter.activeSeat(),1,'Responding does not consume an order');
assert.equal(t.port.state.players[1].resources.matter,5);
assert.throws(()=>t.adapter.applyAction(1,accept),/Illegal action/,'An accepted offer cannot settle twice');
assert(!t.adapter.legalActions(1).some(a=>a.type==='trade_accept'));
console.log('Galactic Reach: mechanics, non-mutating legality, forged commands, shared open trades, and single settlement passed.');
