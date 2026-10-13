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
assert.equal(adapter.rulesVersion,'galactic-reach/6.11');
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
// Upgraded orders must be legal in exactly the same way for browser and arena.
function orderFixture(key,upgraded=true) {
  const f=engine();f.port.state.phase='operations';f.port.state.activePlayer=0;
  f.port.state.players[0].hand=[{id:'test-order',key,starter:true,upgraded}];return f;
}
for(const [kind,base] of [['scout',2],['researcher',1],['frigate',1],['dreadnought',1]]){
  for(const upgraded of [false,true]){
    const f=orderFixture('move',upgraded);f.port.state.planets={};f.port.state.fleets={'0,0':{0:{[kind]:1}}};
    const legal=f.adapter.legalActions(0).filter(a=>a.type==='move');
    assert(legal.some(a=>a.destination===`${base+(upgraded?1:0)},0`));
    assert(!legal.some(a=>a.destination===`${base+(upgraded?2:1)},0`));
  }
}
for(const upgraded of [false,true]){
  const f=orderFixture('probe',upgraded), target=f.port.nearestUnscannedRelicCluster(0,upgraded);
  f.adapter.applyAction(0,f.adapter.legalActions(0).find(a=>a.type==='probe'));
  assert(target.scannedBy.includes(0));assert.equal(target.revealedBy.includes(0),upgraded);
  if(upgraded)assert(target.coords.every(key=>!f.adapter.observe(0).planets[key].unknown));
}
for(const upgraded of [false,true]){
  const f=orderFixture('construct',upgraded),s=f.port.state,p=s.players[0],coord=s.clusters[0].coords[2];
  p.resources={matter:0,energy:1,biomass:1,data:0};
  const before=JSON.stringify(s),build=f.adapter.legalActions(0).find(a=>a.type==='build'&&a.kind==='harvester'&&a.coord===coord);
  assert.equal(JSON.stringify(s),before,'Discount legality is non-mutating');
  assert.equal(!!build,upgraded);
  if(build){assert.equal(build.discountResource,'matter');assert.throws(()=>f.adapter.applyAction(0,{...build,discountResource:'data'}),/Illegal action/);f.adapter.applyAction(0,build);assert.equal(p.resources.energy,0);assert.equal(p.resources.biomass,0);assert.equal(s.planets[coord].upgrade,'harvester');}
}
for(const finish of ['build','skip']){
  const f=orderFixture('colonize'),s=f.port.state,p=s.players[0],world=s.clusters[4];
  world.revealedBy=[0,1,2,3];s.fleets[world.center]={0:{scout:1}};p.resources={matter:1,energy:1,biomass:3,data:0};s.activePolicy={id:'frontier_grants'};
  const order=f.adapter.legalActions(0).find(a=>a.type==='colonize'&&a.coord===world.center);assert(order);f.adapter.applyAction(0,order);
  assert.equal(s.activePlayer,0);assert.equal(s.pendingColonyBuild.colony,world.center);assert.equal(p.hand.length,0);assert.equal(p.resources.biomass,1);
  const options=f.adapter.legalActions(0);assert(!options.some(a=>['pass','trade_offer','build'].includes(a.type)));
  const bonus=options.find(a=>a.type==='colony_build'&&a.kind==='harvester');assert(bonus);
  assert.throws(()=>f.adapter.applyAction(0,{...bonus,coord:s.clusters[0].coords[2]}),/Illegal action/);
  f.adapter.applyAction(0,finish==='build'?bonus:options.find(a=>a.type==='finish_colony_build'));
  assert.equal(s.pendingColonyBuild,null);assert.equal(s.activePlayer,1);
  if(finish==='build'){assert.equal(p.resources.matter,0,'Bonus building pays full cost even with Frontier Grants');assert.equal(p.resources.energy,0);assert.equal(p.resources.biomass,0);}
  else assert.equal(p.resources.matter,1);
}
const ranked=engine();ranked.port.state.winner=0;
ranked.port.state.players.forEach((p,i)=>{p.relics=i===0?20:10;p.resources={matter:i===3?0:1,energy:0,biomass:0,data:0};});
assert.equal(JSON.stringify(ranked.adapter.scores()),JSON.stringify([3,2,2,0]),'Prestige ranks, resource tiebreaks, and exact ties are reflected in terminal scores');
console.log('Upgraded orders: unit minimums, +1 range, full-world Probe, chosen construction discounts, optional paid colony building, and tied placements passed.');
