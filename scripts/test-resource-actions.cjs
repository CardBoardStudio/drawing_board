const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
function engine(archive = null) {
  const base = archive ? `crates/galactic-reach/rules/v${archive}-` : 'prototypes/galactic-reach/';
  const context = vm.createContext({});
  vm.runInContext(read(base+'adapter.js')+read(base+'app.js'),context);
  const original = context.createGalacticAdapter; let port, seed=73;
  context.createGalacticAdapter = e => {port=e;return original(e);};
  const adapter=context.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  return {port,adapter};
}
const plain = value => JSON.parse(JSON.stringify(value));
function act(g,type,condition=()=>true) {
  const seat=g.adapter.activeSeat(), action=g.adapter.legalActions(seat).find(a=>a.type===type&&condition(a));
  assert(action,`Expected legal ${type}`);g.adapter.applyAction(seat,action);return action;
}
for(const phase of ['operations','buy']) {
  const g=engine(),s=g.port.state,p=s.players[0];s.phase=phase;p.resources={matter:2,energy:8,biomass:0,data:0};
  const beforeTracks=JSON.stringify(p.tracks),beforeHand=JSON.stringify(p.hand),beforeStage=s.turnStage;
  const bank=act(g,'bank_trade',a=>a.giveType==='energy'&&a.getType==='data');
  assert.deepEqual(plain(p.resources),{matter:2,energy:4,biomass:0,data:1});
  assert.equal(g.port.totalResources(p),7,'4:1 frees storage even when initially full');
  assert.equal(s.activePlayer,0);assert.equal(s.phase,phase);assert.equal(s.turnStage,beforeStage);
  assert.equal(JSON.stringify(p.tracks),beforeTracks);assert.equal(JSON.stringify(p.hand),beforeHand);assert(!p.tradeUsed);
  act(g,'bank_trade',a=>a.giveType==='energy'&&a.getType==='data');
  assert.equal(p.resources.data,2);assert.equal(p.resources.energy,0);
  assert.throws(()=>g.adapter.applyAction(0,bank),/Illegal action/,'An exhausted trade cannot be replayed');
  act(g,'discard_resources',a=>a.resource==='matter'&&a.amount===2);
  assert.equal(p.resources.matter,0);assert.equal(p.resources.data,2);
  assert.equal(s.activePlayer,0);assert.equal(s.phase,phase);
}
{
  const g=engine(),s=g.port.state,p=s.players[0];p.resources={matter:2,energy:2,biomass:0,data:0};
  assert(!g.adapter.legalActions(0).some(a=>a.type==='bank_trade'),'Four must all be the same resource');
  const before=JSON.stringify(s);
  for(const args of [[0,'energy','energy'],[0,'energy','data'],[1,'matter','data'],[0,'bad','data'],[0,'matter','bad']]) assert(!g.port.bankTrade(...args));
  for(const amount of [0,-1,1.5,NaN,Infinity,3,'1']) assert(!g.port.discardResources(0,'energy',amount));
  assert(!g.port.discardResources(1,'energy',1));assert(!g.port.discardResources(0,'__proto__',1));
  assert.equal(JSON.stringify(s),before,'Invalid resource operations are atomic');
  assert.throws(()=>g.adapter.applyAction(1,{type:'discard_resources',resource:'energy',amount:1}),/Illegal action/);
  assert.throws(()=>g.adapter.applyAction(0,{type:'bank_trade',giveType:'energy',getType:'data',giveAmount:2}),/Illegal action/);
}
for(const phase of ['production','draw','cleanup','policy','directive','finished']) {
  const g=engine(),s=g.port.state;s.phase=phase;s.players[0].resources.energy=8;
  const before=JSON.stringify(s);assert(!g.port.bankTrade(0,'energy','data'));assert(!g.port.discardResources(0,'energy',1));
  assert.equal(JSON.stringify(s),before);
}
{
  const g=engine();g.port.state.winner=1;assert(!g.port.discardResources(0,'biomass',1));
}
for(const version of [6,7]) {
  const old=engine(version);assert(!old.adapter.legalActions(0).some(a=>['bank_trade','discard_resources'].includes(a.type)));
  act(old,'pass');assert.equal(old.port.state.phase,version===6?'operations':'buy');
}
// Multiple paid trashes, preserving start-of-Buy eligibility.
{
  const g=engine(),s=g.port.state,p=s.players[0];
  p.hand=[];p.discard=[{id:'trash1',key:'move',starter:true},{id:'trash2',key:'construct',starter:true,upgraded:true},{id:'trash3',key:'excavate'}];
  p.resources={matter:0,energy:0,biomass:0,data:6};act(g,'pass');
  act(g,'decommission',a=>a.card==='trash1');act(g,'decommission',a=>a.card==='trash2');
  assert.equal(p.resources.data,0);assert.deepEqual(plain(p.discard.map(c=>c.id)),['trash3']);
  assert(!g.adapter.legalActions(0).some(a=>a.type==='decommission'));assert.equal(s.phase,'buy');
}
function consortiumGame(resources={matter:4,energy:0,biomass:0,data:0}) {
  const g=engine(),p=g.port.state.players[0];p.hand=[{id:'consortium',key:'tradeConsortium'}];p.resources=resources;
  act(g,'special');assert.equal(p.hand.length,1);assert.equal(g.adapter.activeSeat(),0);return g;
}
{
  const g=consortiumGame(),s=g.port.state,p=s.players[0],initial=JSON.stringify(p.resources),tracks=JSON.stringify(p.tracks);
  assert.equal(initial,JSON.stringify({matter:4,energy:0,biomass:0,data:0}),'Opening the choice changes no resources');
  assert(g.adapter.legalActions(0).every(a=>/consortium/.test(a.type)),'Other actions wait for the choice');
  assert(!g.port.bankTrade(0,'matter','data'));assert(!g.port.discardResources(0,'matter',1));assert(!g.port.passOperations(0));
  const unchanged=JSON.stringify(s);
  assert(!g.port.consortiumExchange(0,'matter','matter'));assert(!g.port.consortiumExchange(1,'matter','data'));
  assert(!g.port.consortiumGain(0,'bad'));assert(!g.port.finishConsortium(0));assert.equal(JSON.stringify(s),unchanged);
  act(g,'consortium_exchange',a=>a.giveType==='matter'&&a.getType==='energy');
  assert.deepEqual(plain(p.resources),{matter:2,energy:1,biomass:0,data:0});assert.equal(p.hand.length,1);
  assert(!g.port.finishConsortium(0,true));assert(!g.port.consortiumGain(0,'data'));
  act(g,'consortium_exchange',a=>a.giveType==='matter'&&a.getType==='biomass');
  assert.deepEqual(plain(p.resources),{matter:0,energy:1,biomass:1,data:0});
  assert.equal(p.hand.length,0);assert.equal(p.discard.filter(c=>c.id==='consortium').length,1);assert.equal(s.activePlayer,1);
  assert.equal(s.pendingConsortium,null);assert.equal(JSON.stringify(p.tracks),tracks);assert(!p.tradeUsed);
  assert(!g.port.consortiumExchange(0,'energy','data'));
}
for(const resource of ['matter','energy','biomass','data']) {
  const g=consortiumGame({matter:0,energy:0,biomass:0,data:0}),p=g.port.state.players[0];
  act(g,'consortium_gain',a=>a.resource===resource);assert.equal(p.resources[resource],1);assert.equal(p.hand.length,0);assert.equal(g.adapter.activeSeat(),1);
}
{
  const g=consortiumGame({matter:10,energy:0,biomass:0,data:0});
  assert(g.adapter.legalActions(0).some(a=>a.type==='consortium_gain'));
  act(g,'consortium_exchange',a=>a.giveType==='matter'&&a.getType==='data');act(g,'finish_consortium');
  assert.equal(g.port.state.players[0].resources.matter,8);assert.equal(g.port.state.players[0].resources.data,1);
}
{
  const g=consortiumGame();act(g,'cancel_consortium');assert.equal(g.port.state.players[0].hand.length,1);assert.equal(g.adapter.activeSeat(),0);
  act(g,'special');act(g,'consortium_gain',a=>a.resource==='data');
}
// Browser shortcuts exercise actual private rule functions, not a duplicate engine.
const source=read('prototypes/galactic-reach/app.js');
const boot=source.indexOf('\n  if (headless) {\n    state = newState();');assert(boot>0);
const storage=new Map(),tabs=[];
const context=vm.createContext({console,setTimeout:()=>0,clearTimeout:()=>{},document:{querySelector:()=>({open:false}),querySelectorAll:()=>[]}});
vm.runInContext(source.slice(0,boot)+`
  render=()=>{};toast=()=>{};showMessage=()=>{};scheduleAiTurn=()=>{};switchTab=name=>options.onTab(name);
  return {get state(){return state;},set state(s){state=s;},newState,makeCard,availableContextOrders,startContextOrder,humanSelectHex,
    bankTrade,discardResources,playResourceMode, discardOverflow,bankPlanForCost,runAiBuy,passOperations,nextBuyPlayer,startOperationsTurn,
    saveGame,loadGame,SAVE_KEY,describeDecision,constructAt};
}`,context);
const r=context.createGalacticReach({onTab:name=>tabs.push(name),storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
function fresh(){r.state=r.newState();r.state.phase='operations';r.state.activePlayer=0;r.state.turnStage='prep';return r.state;}
function card(key,upgraded=false){return {...r.makeCard(key,true),upgraded};}
{
  const s=fresh(),p=s.players[0],move=card('move');s.planets={};s.fleets={'0,0':{0:{settler:1,explorer:1}}};p.hand=[move,card('move')];
  let options=r.availableContextOrders('0,0');assert.equal(options.length,2,'One shortcut per group; identical cards are not duplicated');
  assert(r.startContextOrder(move.id,'0,0','ships'));assert.equal(s.moveSource,'0,0');assert.equal(s.actionCardId,move.id);
  assert.equal(s.actionOptions.moveGroup,'ships');assert.equal(p.hand.length,2,'Selecting an order does not consume it');
  const beforePending=JSON.stringify({mode:s.actionMode,id:s.actionCardId,source:s.moveSource,options:s.actionOptions,reachable:s.reachable});
  p.resources={matter:0,energy:8,biomass:0,data:0};assert(r.bankTrade(0,'energy','data'));assert(r.discardResources(0,'energy',1));
  assert.equal(JSON.stringify({mode:s.actionMode,id:s.actionCardId,source:s.moveSource,options:s.actionOptions,reachable:s.reachable}),beforePending);
  const target=s.reachable.find(coord=>coord==='1,0');assert(target);r.humanSelectHex(target);
  assert.equal(s.fleets['1,0'][0].settler,1);assert.equal(s.fleets['0,0'][0].explorer,1);assert.equal(p.hand.length,1);assert.equal(s.activePlayer,1);
}
{
  const s=fresh(),p=s.players[0],construct=card('construct',true);p.hand=[construct];p.resources={matter:0,energy:0,biomass:0,data:0};
  const yard=s.clusters[0].coords[1];s.planets[yard].owner=0;s.planets[yard].upgrade='starbase';s.planets[yard].upgradeLevel=1;
  assert(r.availableContextOrders(yard).some(a=>a.type==='construct'));
  assert(r.startContextOrder(construct.id,yard));assert.equal(s.actionMode,'construct');assert.equal(s.actionOptions.upgraded,true);
  assert(!r.constructAt(0,yard,'settler','matter',true),'Popup does not bypass construction costs');
  assert.equal(p.hand.length,1);assert.equal(s.activePlayer,0);
  p.hand=[];assert(!r.startContextOrder(construct.id,yard),'Stale card shortcuts cannot create an order');
}
{
  const s=fresh(),p=s.players[0],world=s.clusters[4],colonize=card('colonize');p.hand=[colonize];
  s.fleets[world.center]={0:{settler:1}};world.revealedBy=[0];
  assert(r.availableContextOrders(world.center).some(a=>a.type==='colonize'));
  assert(r.startContextOrder(colonize.id,world.center));assert.equal(s.actionMode,'colonize');assert.equal(s.selected,world.center);
  s.activePlayer=1;assert.equal(r.availableContextOrders(world.center).length,0);assert(!r.startContextOrder(colonize.id,world.center));
}
{
  const s=fresh(),p=s.players[0],world=s.clusters[4];p.hand=[card('excavate'),card('move')];
  const relic=world.coords.find(k=>s.planets[k].special==='relic');assert(relic);
  s.fleets[relic]={0:{explorer:1}};world.revealedBy=[];world.scannedBy=[];
  assert(!r.availableContextOrders(relic).some(a=>a.type==='excavate'),'Unknown relics do not leak relic recovery choices');
  world.scannedBy=[0];assert(r.availableContextOrders(relic).some(a=>a.type==='excavate'),'A located relic permits the Explorer shortcut');
  s.pendingColonyBuild={playerId:0,colony:s.clusters[0].center};s.turnStage='bonus-build';
  assert.equal(r.availableContextOrders(relic).length,0,'Finish Colonize II before starting a new order');
  p.resources={matter:0,energy:4,biomass:0,data:0};assert(r.bankTrade(0,'energy','data'));assert(r.discardResources(0,'data',1));assert(s.pendingColonyBuild);
}
{
  const s=fresh(),p=s.players[0];p.resources={matter:9,energy:0,biomass:0,data:1};const gain=card('construct',true);p.hand=[gain];
  assert(r.playResourceMode(gain.id));assert.equal(p.hand.length,0);assert.equal(p.resources.matter,11);
  r.saveGame();const pending=JSON.stringify(s);fresh();assert(r.loadGame());assert.equal(JSON.stringify(r.state),pending);
  assert(r.discardOverflow(0,{matter:2}));assert.equal(r.state.players[0].resources.matter,9);
  r.saveGame();const expected=JSON.stringify(r.state);fresh();assert(r.loadGame());assert.equal(JSON.stringify(r.state),expected);
  storage.set('galactic-reach-save-v7','parent-game');r.saveGame();assert.equal(storage.get('galactic-reach-save-v7'),'parent-game');
}
{
  const s=fresh(),p=s.players[0];p.resources={matter:0,energy:5,biomass:0,data:0};
  assert.deepEqual(plain(r.bankPlanForCost(p,{energy:1,data:1})),[{giveType:'energy',getType:'data'}]);
  assert.equal(r.bankPlanForCost(p,{energy:2,data:1}),null,'Reserve resources needed for the purchase');
  s.phase='buy';p.passed=true;s.market=[];s.advancedDeck=[];s.marketDiscard=[];r.runAiBuy();
  assert.equal(p.bought,1);assert.equal(p.resources.data,0);assert.equal(p.resources.energy,0,'AI paid the same 4:1 exchange and card price');
}
{
  const s=fresh();tabs.length=0;r.startOperationsTurn();assert.equal(tabs.at(-1),'hand');
  r.passOperations(0);assert.equal(tabs.at(-1),'market');
  r.nextBuyPlayer();s.activePlayer=0;s.players[0].passed=false;r.startOperationsTurn();assert.equal(tabs.at(-1),'hand');
  const names=['You','A','B','C'];
  assert.match(r.describeDecision(0,{type:'bank_trade',giveType:'energy',getType:'data'},s,names).text,/4 Energy → 1 Data/);
  assert.match(r.describeDecision(0,{type:'discard_resources',resource:'matter',amount:2},s,names).text,/Discard 2 Matter/);
}
console.log('Resource actions: atomic 4:1 trades, voluntary discards, phases, storage, popup orders, fog, AI purchases, reload, and archived rules passed.');
