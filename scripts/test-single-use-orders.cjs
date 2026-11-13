const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function game(prefix = 'prototypes/galactic-reach/', seat = 0) {
  const context = vm.createContext({});
  let engine, seed = 1729;
  const source = read(prefix + 'app.js').replace('      clone, deckContents,', '      drawCards, runAiOperation, clone, deckContents,');
  vm.runInContext(read(prefix + 'adapter.js') + source, context);
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = e => { engine = e; return factory(e); };
  const adapter = context.createGalacticReach({headless:true, random:() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)});
  const state = engine.state, player = state.players[seat];
  state.phase = 'operations'; state.activePlayer = seat;
  player.deck = []; player.discard = []; player.hand = [];
  return {engine, adapter, state, player, seat, fresh:()=>factory(engine)};
}
const cards = p => [...p.hand, ...p.deck, ...p.discard];
for (const seat of [0, 1]) {
  const g = game(undefined, seat), id = 'used-probe';
  g.state.fleets = {'2,2':{[seat]:{explorer:1}}};
  g.player.hand = [{id,key:'probe'}, {id:'spare-probe',key:'probe'}];
  const before = JSON.stringify(g.state);
  assert(g.engine.probeRelic(seat,'2,2',id,true));
  assert.equal(JSON.stringify(g.state),before,'Legal preview keeps the Probe');
  if (seat) g.engine.runAiOperation();
  else g.adapter.applyAction(seat,g.adapter.legalActions(seat).find(a=>a.type==='probe'&&a.card===id));
  assert(!cards(g.player).some(c=>c.id===id),'Successful Probe permanently leaves every card pile');
  assert(cards(g.player).some(c=>c.id==='spare-probe'),'Only the used copy is removed');
  assert.equal(g.state.fleets['2,2'][seat].explorer,1);
  assert.equal(g.state.activePlayer,(seat+1)%4);
  assert(g.state.log.some(line=>line.includes('Probe was permanently trashed')));
  g.player.discard.push(...g.player.hand); g.player.hand = [];
  g.engine.drawCards(g.player,5);
  assert.deepEqual(plain(g.player.hand.map(c=>c.id)),['spare-probe'],'Shuffle/draw cannot recover the used Probe');
  g.state.activePlayer = seat;
  assert(!g.engine.probeRelic(seat,'2,2',id),'The same card cannot be replayed');
}
for (const seat of [0,1]) for (const capture of [false,true]) {
  const g = game(undefined,seat), world = g.state.clusters[4], id = 'used-colonize';
  g.player.hand = [{id,key:'colonize'}];g.player.resources = {matter:0,energy:0,biomass:capture?1:2,data:0};
  const planet = g.state.planets[world.center];
  if (capture) Object.assign(planet,{owner:(seat+1)%4,hasColony:true,occupiedBy:seat});
  g.state.fleets = {[world.center]:{[seat]:{settler:1}}};
  const order = g.adapter.legalActions(seat).find(a=>a.type==='colonize'&&a.card===id&&a.coord===world.center);
  assert(order);g.adapter.applyAction(seat,order);
  assert.equal(planet.owner,seat);assert.equal(g.player.resources.biomass,0);
  assert(!cards(g.player).some(c=>c.id===id),'Founding and capture permanently trash Colonize');
  assert(!g.state.fleets[world.center]?.[seat]?.settler);
  assert.equal(g.state.activePlayer,(seat+1)%4);
}
for (const key of ['probe','colonize']) {
  const g = game();g.player.hand = [{id:'convert',key}];
  const action = g.adapter.legalActions(0).find(a=>a.type==='resource'&&a.card==='convert');assert(action);
  const before = plain(g.player.resources);g.adapter.applyAction(0,action);
  assert(g.player.discard.some(c=>c.id==='convert'),'Resource conversion still discards');
  assert.equal(g.player.resources[key==='probe'?'data':'biomass'],before[key==='probe'?'data':'biomass']+1);
  assert.equal(g.state.activePlayer,0,'Conversion is free');
}
for (const key of ['probe','colonize']) {
  const g = game();g.player.hand = [{id:'keep',key}];
  const at = g.state.clusters[4].center;
  g.state.fleets = {[at]:{0:{explorer:1,settler:1}}};
  g.player.resources = {matter:0,energy:0,biomass:0,data:0};
  for (const c of g.state.clusters)c.scannedBy=[0];
  const before=JSON.stringify(g.state);
  assert(!(key==='probe'?g.engine.probeRelic(0,at,'keep'):g.engine.applyColonizeOrder(0,at,g.player.hand[0])));
  assert.equal(JSON.stringify(g.state),before,'Failed searches and unpaid founding keep the card and action');
}
for (const key of ['dropColonyModules','genesisSeedVault']) {
  const g = game(), world = g.state.clusters[4];
  g.player.hand = [{id:'advanced',key}];g.player.resources = {matter:0,energy:0,biomass:1,data:0};
  g.state.fleets = {[world.center]:{0:{settler:1}}};
  assert(g.engine.applyColonizeOrder(0,world.center,g.player.hand[0]));
  assert(g.player.discard.some(c=>c.id==='advanced'),'Advanced colony cards retain their printed discard behavior');
  assert.equal(g.state.fleets[world.center][0].settler,1);
}
for (const key of ['probe','colonize']) {
  const old = game('crates/galactic-reach/rules/v25-'), at = key==='probe'?'2,2':old.state.clusters[4].center;
  old.player.hand = [{id:'old',key}];old.player.resources = {matter:0,energy:0,biomass:2,data:0};
  old.state.fleets = {[at]:{0:{explorer:1,settler:1}}};
  assert(key==='probe'?old.engine.probeRelic(0,at,'old'):old.engine.applyColonizeOrder(0,at,old.player.hand[0]));
  assert(old.player.discard.some(c=>c.id==='old'),'Pinned25.30 keeps the old discard rule');
}
// Faction Fleet capacity is separate from per-hex and other unit limits.
for (const seat of [0,1]) {
 const g=game(undefined,seat),yard=g.state.clusters[seat].coords[1];
 Object.assign(g.state.planets[yard],{owner:seat,upgrade:'starbase',occupiedBy:null});
 g.player.storageUpgrades=100;g.player.resources={matter:100,energy:100,biomass:100,data:100};
 g.player.hand=[{id:'commission',key:'construct'}];
 g.state.fleets={'0,0':{[seat]:{fleet:5}},'1,0':{[seat]:{fleet:1}},'2,0':{[seat]:{settler:5}},'3,0':{[seat]:{settler:3}},'4,0':{[seat]:{explorer:5}}};
 assert(g.adapter.legalActions(seat).some(a=>a.type==='build'&&a.kind==='fleet'&&a.coord===yard),'A seventh Fleet is offered normally');
 for(let total=7;total<=10;total++)assert(g.engine.buildShip(seat,yard,'fleet'),'Can commission Fleet'+total);
 let before=JSON.stringify(g.state);assert(!g.engine.buildShip(seat,yard,'fleet'));assert.equal(JSON.stringify(g.state),before,'An eleventh Fleet spends nothing');
 assert(!g.engine.buildShip(seat,yard,'settler'),'Settler limit remains8');
 assert(!g.engine.buildShip(seat,yard,'explorer'),'Explorer limit remains5');
 assert(!g.fresh().legalActions(seat).some(a=>a.type==='build'&&a.kind==='fleet'));
 g.state.fleets['0,0'][seat].fleet--; // A destroyed unit frees its faction slot.
 assert(g.engine.buildShip(seat,yard,'fleet'));
 g.state.fleets['0,0'][seat].fleet--;before=JSON.stringify(g.state);
 assert(!g.engine.buildShip(seat,yard,'fleet'));assert.equal(JSON.stringify(g.state),before,'A full five-unit Shipyard still blocks commissions below the global cap');
}
{
 const old=game('crates/galactic-reach/rules/v25-'),yard=old.state.clusters[0].coords[1];
 Object.assign(old.state.planets[yard],{owner:0,upgrade:'starbase',occupiedBy:null});old.player.resources={matter:3,energy:2,biomass:1,data:0};
 old.state.fleets={'0,0':{0:{fleet:5}},'1,0':{0:{fleet:1}}};
 assert(!old.engine.buildShip(0,yard,'fleet'),'Pinned25.30 retains the six-Fleet cap');
}
for (const [file,hash] of Object.entries(JSON.parse(read('scripts/single-use-orders-archive-hashes.json')))) {
  let text=read(file);if(file.endsWith('.rs'))text=text.slice(text.indexOf('#[derive(Clone, Copy, Debug)]')).trim();
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),hash,'Archived25.30/native21 bytes remain unchanged');
}
console.log('Single-use orders: human/rival Probe, neutral founding/capture, permanent removal across draw/shuffle, conversion, failed-action atomicity, advanced-card behavior ten-Fleet capacity, independent unit/hex caps and frozen25.30/native21 passed.');
