// Exercise the browser's private rule functions without exporting a production debug API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach/app.js'),'utf8');
const boot = source.indexOf('\n  if (headless) {\n    state = newState();');
assert(boot > 0, 'Locate the browser bootstrap before instrumenting the rules');
const storage = new Map();
let seed = 1;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0) / 2**32);
const elements = new Map();
const element = selector => {
  if (!elements.has(selector)) elements.set(selector, {
    open:false,value:0,elements:{'policy-choice':{value:0}},
    querySelectorAll:()=>[], showModal(){this.open=true;}, close(){this.open=false;},
  });
  return elements.get(selector);
};
const context = vm.createContext({
  module:{exports:{}}, Math:math, document:{querySelector:element,querySelectorAll:()=>[]},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  setTimeout:()=>0,clearTimeout:()=>{},console,
});
vm.runInContext(source.slice(0,boot)+`
  render = () => {}; toast = () => {}; showMessage = () => {}; scheduleAiTurn = () => {};
  return {
    get state(){ return state; }, set state(value){ state=value; },
    newState, generateGalaxy, boardHas, hexDistance, fleetMove, reachableFrom,
    prepareHumanMove, chooseAiMove, calculatePrestige, finishRound, saveGame, loadGame,
    beginRound, passOperations, runAiOperation, runAiBuy, nextBuyPlayer, resolvePolicyVote, applyDirective,
    SAVE_KEY, TURN_HISTORY_KEY, VICTORY_TARGET, BOARD_RADIUS,
    canOfferTrade, offerTrade, respondTrade, cancelTrade, tradeBlockReason, startBuyPhase,
    playOrder, cardMarkup, makeCard,
  };
}
`,context);
const r = context.createGalacticReach({random:()=>math.random()});
const distance = key => r.hexDistance('0,0',key);
function fresh(n) { seed=n; r.state=r.newState(); return r.state; }
function assertGalaxy(s) {
  assert.equal(s.clusters.length,11);
  assert.equal(Object.keys(s.planets).length,77,'Worlds must never overwrite one another');
  for (const world of s.clusters) {
    assert.equal(world.coords.length,7);
    for (const key of world.coords) {
      assert(r.boardHas(key),'Every planet lies inside the expanded map');
      assert.equal(s.planets[key].cluster,world.id);
    }
    for (const other of s.clusters) {
      if (world.id!==other.id) assert(r.hexDistance(world.center,other.center)>=4,'Leave an empty hex between worlds');
    }
  }
  for (let id=0;id<4;id++) {
    const world=s.clusters[id];
    assert.equal(distance(world.center),11);
    assert(world.coords.some(key=>distance(key)===12),'Each home world touches the outer ring');
    const colony=s.planets[world.center];
    assert.equal(colony.owner,id); assert.equal(colony.hasColony,true);
    const yard=world.coords.find(key=>s.planets[key].upgrade==='starbase');
    assert.equal(distance(yard),10,'Shipyards point inward');
    assert.equal(s.planets[yard].type,'energy');
    assert.equal(s.fleets[yard][id].scout,1);
  }
  assert.equal(Object.values(s.planets).filter(p=>p.special==='relic').length,6);
  assert.equal(Object.values(s.planets).filter(p=>p.special==='gate').length,2);
}
const layouts=new Set();
for(let n=1;n<=1000;n++) {
  const s=fresh(n); assertGalaxy(s);
  layouts.add(s.clusters.slice(4).map(c=>c.center).join('|'));
}
assert.equal(layouts.size,1000,'Interior coordinates vary with each new game');
for(const constant of [0,0.5,1-Number.EPSILON]) {
  const saved=math.random; math.random=()=>constant;
  assertGalaxy(r.newState()); math.random=saved;
}
let cells=0;
for(let q=-13;q<=13;q++) for(let y=-13;y<=13;y++) if(r.boardHas(`${q},${y}`)) cells++;
assert.equal(cells,469); assert.equal(r.BOARD_RADIUS,12);
assert.equal(JSON.stringify(fresh(42)),JSON.stringify(fresh(42)),'A seeded fixture remains reproducible');
assert.equal(r.fleetMove({researcher:1}),2);
assert.equal(r.fleetMove({researcher:1,scout:1}),2);
assert.equal(r.fleetMove({researcher:1,dreadnought:1}),1);
assert.equal(r.fleetMove({scout:1}),3); assert.equal(r.fleetMove({frigate:1}),2);
assert.equal(r.fleetMove({}),0);
fresh(9); r.state.planets={}; r.state.fleets={'0,0':{0:{researcher:1}}};
r.prepareHumanMove('0,0','researcher');
assert.equal(r.state.reachable.length,18);
assert(r.state.reachable.includes('2,0')); assert(!r.state.reachable.includes('3,0'));
r.state.actionOptions={tag:'pathfinder'}; r.prepareHumanMove('0,0','researcher');
assert(r.state.reachable.includes('3,0')); assert(!r.state.reachable.includes('4,0'));
const atEdge=r.reachableFrom('-12,0',0,2,false,{researcher:1});
assert(atEdge.every(key=>distance(key)<=12));
// A real AI choice uses two steps toward a scanned relic, respecting hostile blockers.
r.state.planets={'5,0':{special:'relic',owner:null,upgrade:null,hasColony:false,researchStationOwner:null}};
r.state.clusters=[{id:4,coords:['5,0'],scannedBy:[1]}];
r.state.fleets={'0,0':{1:{researcher:1}}};
let move=r.chooseAiMove(1);
assert.equal(move.moveGroup,'researcher'); assert.equal(move.destination,'2,0');
r.state.fleets['1,0']={2:{frigate:1}};
assert(!r.chooseAiMove(1) || r.chooseAiMove(1).destination!=='2,0','Do not jump through a hostile fleet');
// The end-of-round rule must not end at the old target or one point below the new one.
for(const points of [10,19,20]) {
  const s=fresh(100); s.players[0].relics=points-1;
  assert.equal(r.calculatePrestige(0),points);
  r.finishRound();
  assert.equal(s.winner,points===20?0:null);
  assert.equal(s.round,points===20?1:2);
}
fresh(99); r.state.phase='operations'; r.state.activePlayer=0; r.state.turnStage='prep';
const order=r.makeCard('move'); r.state.players[0].hand=[order];
assert(r.cardMarkup(order,'hand').includes('Use order'),'Order action is available directly during prep');
r.playOrder(order.id); assert.equal(r.state.actionMode,'move'); assert.equal(r.state.turnStage,'action');
r.playOrder(order.id); assert.equal(r.state.actionMode,null,'Clicking again cancels without spending the card');
assert.equal(r.state.players[0].hand.length,1);
const old='untouched-v4-save'; storage.set('galactic-reach-save-v4',old);
assert.equal(r.SAVE_KEY,'galactic-reach-save-v5');
assert.equal(r.TURN_HISTORY_KEY,'galactic-reach-turn-history-v5');
const saved=JSON.stringify(fresh(123)); r.saveGame(); fresh(456);
assert(r.loadGame()); assert.equal(JSON.stringify(r.state),saved,'Reload retains randomized placement');
assert.equal(storage.get('galactic-reach-save-v4'),old);
const incompatible=JSON.parse(saved); incompatible.rulesRevision=9;
storage.set(r.SAVE_KEY,JSON.stringify(incompatible)); assert.equal(r.loadGame(),false);
console.log('Long Reach: 1,000 map layouts, 469 hexes, border starts, movement, 20-point victory, and save isolation passed.');
if(process.env.LONG_REACH_SIMULATE) {
  fresh(1729); r.beginRound();
  let steps=0;
  while(r.state.winner===null && steps++<12000) {
    const s=r.state;
    if(s.phase==='operations') s.activePlayer===0?r.passOperations(0):r.runAiOperation();
    else if(s.phase==='buy') s.activePlayer===0?r.nextBuyPlayer():r.runAiBuy();
    else if(s.phase==='policy') r.resolvePolicyVote(0,0);
    else if(s.phase==='directive') r.applyDirective('economy',s.firstPlayer);
    else throw Error(`Unexpected phase ${s.phase}`);
  }
  assert.notEqual(r.state.winner,null,'Reference rivals must finish a 20-point game');
  console.log(`Long-game smoke: faction ${r.state.winner} won in round ${r.state.round}, after ${steps} decisions, with ${r.calculatePrestige(r.state.winner)} Prestige.`);
}

// Open offers persist independently of an action and settle against live balances once.
function tradeFixture(){
  fresh(300); r.state.phase='operations'; r.state.turnStage='prep';
  for(const p of r.state.players) p.resources={matter:3,energy:3,biomass:0,data:0};
}
const terms={giveType:'matter',getType:'energy',giveAmount:2,getAmount:1};
tradeFixture();
const balances=JSON.stringify(r.state.players.map(p=>p.resources));
assert(r.offerTrade(0,terms));
assert.equal(JSON.stringify(r.state.players.map(p=>p.resources)),balances,'Publishing does not move resources');
assert.equal(r.state.activePlayer,1); assert.equal(r.state.tradeOffers[0].status,'open');
r.saveGame(); fresh(1); assert(r.loadGame());
assert.equal(r.state.tradeOffers[0].status,'open','Offer survives save and reload');
assert(!r.respondTrade(2,1,'accept'),'Only the current responder may act');
assert(r.respondTrade(1,1,'reject')); assert.equal(r.state.tradeOffers[0].status,'open');
assert(!r.respondTrade(1,1,'accept'),'A rejected offer cannot be accepted by the same faction');
r.state.activePlayer=2;
assert(r.respondTrade(2,1,'accept'));
assert.equal(r.state.players[0].resources.matter,1); assert.equal(r.state.players[0].resources.energy,4);
assert.equal(r.state.players[2].resources.matter,5); assert.equal(r.state.players[2].resources.energy,2);
assert.equal(r.state.players[0].tracks.culture,1); assert.equal(r.state.players[2].tracks.culture,1);
assert.equal(r.state.players[0].tradesWith[2],1);
r.state.activePlayer=3;
const settled=JSON.stringify(r.state.players);
assert(!r.respondTrade(3,1,'accept')); assert.equal(JSON.stringify(r.state.players),settled);
tradeFixture(); assert(r.offerTrade(0,terms));
r.state.players[0].resources.matter=0;
assert(!r.respondTrade(1,1,'accept'),'Revalidate resources at settlement');
r.state.players[0].resources.matter=3; r.state.players[1].resources.data=4;
assert(!r.respondTrade(1,1,'accept'),'Revalidate storage capacity');
for(let id=1;id<4;id++){r.state.activePlayer=id;assert(r.respondTrade(id,1,'reject'));}
assert.equal(r.state.tradeOffers[0].status,'rejected');
tradeFixture();
for(const invalid of [0,-1,1.5,6,NaN,Infinity]) assert(!r.offerTrade(0,{...terms,giveAmount:invalid}));
assert(!r.offerTrade(0,{...terms,getType:'matter'})); assert(!r.offerTrade(0,{...terms,getType:'unknown'}));
assert(r.offerTrade(0,terms)); r.state.activePlayer=0;
assert(!r.offerTrade(0,terms),'Only one offer per round'); assert(r.cancelTrade(0,1));
assert.equal(r.state.tradeOffers[0].status,'withdrawn');
tradeFixture(); assert(r.offerTrade(0,terms)); r.startBuyPhase();
assert.equal(r.state.tradeOffers[0].status,'expired'); assert(!r.respondTrade(1,1,'accept'));
console.log('Open trades: publishing, rejection, atomic acceptance, stale balances, capacity, expiry, reload, and duplicate settlement passed.');
