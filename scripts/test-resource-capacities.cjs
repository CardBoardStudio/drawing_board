const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const types=['matter','energy','biomass','data'],zero=()=>Object.fromEntries(types.map(r=>[r,0]));
function game(old=false) {
 const prefix=old?'crates/galactic-reach/rules/v27-':'prototypes/galactic-reach/';let e,seed=1729,calls=0;
 const context=vm.createContext({});let source=read(prefix+'app.js').replace('      clone, deckContents,','      produceAll, ownerProductionAmount, aiIncome, aiFundingPlan, aiUseResources, aiManageStorage, aiStorageAllocation, clone, deckContents,');
 if(old)source=source.replace('aiStorageAllocation, ','');
 vm.runInContext(read(prefix+'adapter.js')+source,context);const factory=context.createGalacticAdapter;context.createGalacticAdapter=port=>{e=port;return factory(port);};
 context.createGalacticReach({headless:true,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 return {e,s:e.state,p:e.state.players[0],adapter:()=>factory(e),calls:()=>calls};
}
function act(g,type,filter=()=>true,seat=g.adapter().activeSeat()) {const adapter=g.adapter(),action=adapter.legalActions(seat).find(a=>a.type===type&&filter(a));assert(action,`Missing legal ${type}`);adapter.applyAction(seat,action);return action;}
{
 const g=game();assert.equal(g.s.version,28);assert.equal(g.s.rulesRevision,33);assert.equal(g.adapter().rulesVersion,'galactic-reach/28.33');
 for(const p of g.s.players)assert.deepEqual(plain(p.resourceLimits),{matter:4,energy:4,biomass:4,data:4});
 assert.deepEqual(plain(g.p.resources),{matter:1,energy:0,biomass:2,data:0});assert.equal(g.e.calculatePrestige(0),3);
 assert.deepEqual(plain(g.adapter().observe(1).players[0].resourceLimits),{matter:4,energy:4,biomass:4,data:4});
 assert.equal(g.e.ownerProductionAmount({type:'data',upgrade:'harvester',upgradeLevel:1}),1);
 assert.equal(g.e.ownerProductionAmount({type:'data',upgrade:'harvester',upgradeLevel:2}),1);
 assert.equal(g.e.ownerProductionAmount({type:'matter',upgrade:null}),1);assert.equal(g.e.ownerProductionAmount({type:'moon',upgrade:'harvester',upgradeLevel:2}),0);
}
{
 const g=game();g.p.resources=zero();g.e.addResources(g.p,{matter:5});assert.equal(g.p.resources.matter,5,'Collect the full gain before choosing excess');assert.equal(g.e.overflowPlayer(),0,'Five Matter exceeds its own limit despite spare capacity elsewhere');
 const before=JSON.stringify(g.s);assert(!g.e.discardOverflow(0,{data:1}));assert(!g.e.discardOverflow(0,{matter:2}));assert.equal(JSON.stringify(g.s),before);
 assert(g.adapter().legalActions(0).every(a=>a.type==='discard_overflow'&&a.resource==='matter'&&a.amount===1));act(g,'discard_overflow');assert.equal(g.p.resources.matter,4);assert.equal(g.e.overflowPlayer(),-1);
 g.e.addResources(g.p,{matter:3,energy:2,data:5});assert.deepEqual(plain(g.e.resourceExcess(0)),{matter:3,energy:0,biomass:0,data:1});
 assert(g.e.discardOverflow(0,{matter:1}));assert.equal(g.e.overflowPlayer(),0);assert(g.e.discardOverflow(0,{matter:2,data:1}));assert.equal(g.e.overflowPlayer(),-1);
}
{
 const g=game();g.s.players.forEach(p=>p.resources=zero());g.s.fleets={};Object.values(g.s.planets).forEach(p=>{p.owner=null;p.occupiedBy=null;});
 const sites=Object.keys(g.s.planets).slice(0,5);
 for(const [i,type] of ['matter','energy','biomass','data','moon'].entries())Object.assign(g.s.planets[sites[i]],{owner:0,type,upgrade:i===0?'harvester':null,upgradeLevel:1,occupiedBy:i===2?1:null});
 g.s.fleets[sites[1]]={0:{settler:3},1:{explorer:2}};g.s.fleets[sites[2]]={1:{fleet:2}};g.s.fleets[sites[4]]={0:{fleet:1}};
 g.e.produceAll();assert.deepEqual(plain(g.p.resources),{matter:1,energy:2,biomass:0,data:1});assert.deepEqual(plain(g.s.players[1].resources),{matter:0,energy:0,biomass:1,data:0});
}
for(const phase of ['operations','buy']) {
 const g=game();g.s.phase=phase;g.p.resources={matter:2,energy:2,biomass:2,data:2};g.s.actionMode='construct';g.s.actionCardId='kept-selection';
 const initial=JSON.stringify(g.s),allocation={matter:0,energy:1,biomass:0,data:3};
 for(const invalid of [null,[],{},[1,1,1,1],{...allocation,data:2},{...allocation,data:4},{...allocation,energy:.5},{...allocation,biomass:-1},{...allocation,extra:0}]) {assert(!g.e.increaseStorage(0,invalid));assert.equal(JSON.stringify(g.s),initial,'Invalid or incomplete allocations pay nothing');}
 const choices=g.adapter().legalActions(0).filter(a=>a.type==='increase_storage');assert.equal(choices.length,35);assert.equal(new Set(choices.map(a=>JSON.stringify(a.allocation))).size,35);assert(choices.every(a=>types.reduce((n,r)=>n+a.allocation[r],0)===4));
 act(g,'increase_storage',a=>JSON.stringify(a.allocation)===JSON.stringify(allocation));
 assert.deepEqual(plain(g.p.resourceLimits),{matter:4,energy:5,biomass:4,data:7});assert.deepEqual(plain(g.p.resources),{matter:1,energy:1,biomass:1,data:1});assert.equal(g.p.storagePurchases,1);assert.equal(g.e.calculatePrestige(0),3,'Capacity points award no Prestige');
 assert.deepEqual(plain(g.e.storageUpgradeCost(0)),{matter:2,energy:2,biomass:2,data:2});assert.equal(g.e.storageUpgradeCost(1).matter,1);assert.equal(g.s.phase,phase);assert.equal(g.s.activePlayer,0);assert.equal(g.s.actionCardId,'kept-selection');
 g.p.resources={matter:2,energy:2,biomass:2,data:2};act(g,'increase_storage',a=>a.allocation.matter===4);assert.equal(g.p.resourceLimits.matter,8);assert.equal(g.e.storageUpgradeCost(0).data,3);
}
{
 const g=game();g.p.resources={matter:4,energy:0,biomass:0,data:4};act(g,'bank_trade',a=>a.giveType==='matter'&&a.getType==='data');assert.equal(g.p.resources.data,5);assert.equal(g.e.overflowPlayer(),0);assert(g.adapter().legalActions(0).every(a=>a.type==='discard_overflow'&&a.resource==='data'));act(g,'discard_overflow');assert.equal(g.p.resources.data,4);
}
{
 const g=game();g.p.resources={matter:3,energy:0,biomass:0,data:0};g.p.hand=[{id:'double-matter',key:'construct',upgraded:true,starter:true}];act(g,'resource');assert.equal(g.p.resources.matter,5);assert.equal(g.p.inPlay[0].id,'double-matter');assert.equal(g.p.discard.length,0);assert(g.adapter().legalActions(0).every(a=>a.type==='discard_overflow'));act(g,'discard_overflow');
}
{
 const g=game();g.p.resources={matter:4,energy:3,biomass:0,data:0};g.s.players[1].resources={matter:4,energy:4,biomass:0,data:0};
 assert(g.e.offerTrade(0,{giveType:'matter',giveAmount:1,getType:'energy',getAmount:1}));const offer=g.s.tradeOffers[0],before=JSON.stringify(g.s);
 assert(g.e.tradeBlockReason(1,offer).includes('resource'));assert(!g.e.respondTrade(1,offer.id,'accept'));assert.equal(JSON.stringify(g.s),before,'Trade exceeding one resource cap is atomic');
 g.s.players[1].resources.matter=3;assert(g.e.respondTrade(1,offer.id,'accept'));assert.equal(g.p.resources.energy,4);assert.equal(g.s.players[1].resources.matter,4);
}
{
 const g=game();g.p.hand=[{id:'cradle',key:'cradleOfLostSuns'}];g.p.deck=[{id:'drawn',key:'move'}];g.p.discard=[];g.p.resources={matter:1,energy:1,biomass:3,data:0};const before=JSON.stringify(g.s),rng=g.calls();
 assert(!g.e.resolveHumanSpecial(g.p.hand[0],g.e.ALL_CARDS.cradleOfLostSuns,0));assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),rng,'Unconfirmed allocation does not commit the relic or draw');
 const allocations=g.adapter().legalActions(0).filter(a=>a.type==='special');assert.equal(allocations.length,35);act(g,'special',a=>a.allocation.data===4);
 assert.deepEqual(plain(g.p.resourceLimits),{matter:4,energy:4,biomass:4,data:8});assert.equal(g.p.storagePurchases,0);assert.equal(g.e.storageUpgradeCost(0).matter,1);assert.equal(g.p.inPlay[0].id,'cradle');assert(g.p.hand.some(c=>c.id==='drawn'));assert.equal(g.p.resources.biomass,5);assert.equal(g.e.overflowPlayer(),0);
 act(g,'discard_overflow');assert.equal(g.p.resources.biomass,4);
}
{
 const g=game();g.s.activePlayer=1;const p=g.s.players[1];p.resources={matter:4,energy:1,biomass:1,data:0};p.hand=[{id:'order',key:'construct'},{id:'gain-a',key:'construct'},{id:'gain-b',key:'construct'}];
 const before=JSON.stringify(g.s),rng=g.calls(),cost={matter:2,energy:1,biomass:1,data:1},plan=g.e.aiFundingPlan(p,'order',cost);
 assert(plan);assert.equal(plan.steps[0].type,'bank','Bank at the cap, then replenish the resource with conversions');assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),rng);assert(g.e.aiUseResources(p,'order',cost));assert.deepEqual(plain(p.resources),cost);assert.deepEqual(Array.from(p.hand,c=>c.id),['order']);assert(types.every(r=>p.resources[r]<=p.resourceLimits[r]));
}
{
 const g=game();g.s.activePlayer=1;const p=g.s.players[1];p.resources={matter:4,energy:3,biomass:3,data:3};const at=g.s.clusters[1].coords[1];Object.assign(g.s.planets[at],{type:'matter',owner:1,occupiedBy:null,upgrade:'harvester',upgradeLevel:2});
 const allocation=g.e.aiStorageAllocation(1,4,{},g.e.storageUpgradeCost(1));assert.equal(types.reduce((n,r)=>n+allocation[r],0),4);assert(g.e.aiManageStorage(1));assert.equal(p.storagePurchases,1);assert.equal(g.e.playerCapacity(1),20);assert(p.resourceLimits.matter>4);
}
{
 const old=game(true);assert.equal(old.s.version,27);assert.equal(old.e.playerCapacity(0),10);assert.equal(old.e.ownerProductionAmount({type:'data',upgrade:'harvester',upgradeLevel:1}),2);assert.equal(old.e.ownerProductionAmount({type:'data',upgrade:'harvester',upgradeLevel:2}),3);old.p.resources={matter:1,energy:1,biomass:1,data:1};assert(old.e.increaseStorage(0));assert.equal(old.e.playerCapacity(0),15);
}
{
 const g=game();g.p.resources={matter:4,energy:4,biomass:4,data:4};
 for(const building of ['harvester','starbase','colony']) {
  const coord=g.s.clusters[0].coords[1],planet=g.s.planets[coord];Object.assign(planet,{owner:0,occupiedBy:null,hasColony:building==='colony',upgrade:building==='colony'?null:building,upgradeLevel:1});
  const before=JSON.stringify(g.s);assert(!g.e.buildUpgrade(0,coord,'harvester',0,true));assert(!g.e.buildUpgrade(0,coord,'harvester'));assert.equal(JSON.stringify(g.s),before,'Existing buildings cannot upgrade or be replaced');
  assert(!g.adapter().legalActions(0).some(a=>a.type==='build'&&a.coord===coord&&a.kind==='harvester'));
 }
}
for(const [name,hash] of Object.entries(JSON.parse(read('scripts/resource-capacities-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),hash,'Frozen 27.32/policy23: '+name);
console.log('Resource Capacities: independent limits, exact paid/free allocations, production, atomic costs/cancellation, overflow, banking, trades, card timing, AI funding/allocation and frozen27.32/policy23 passed.');
