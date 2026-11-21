const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function game(prefix='prototypes/galactic-reach/',seed=53){
 const c=vm.createContext({});let e,calls=0;
 const source=prefix==='prototypes/galactic-reach/'?read(prefix+'app.js').replace('      clone, deckContents,','      runAiOperation,runAiBuy,chooseAiMove,chooseAiBuild,aiUseResources,aiFundingPlan,aiManageStorage,aiBuyValue,aiPath,clone,deckContents,'):read(prefix+'app.js');
 vm.runInContext(read(prefix+'adapter.js')+source,c);const original=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return original(x);};
 const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 return {e,a,s:e.state,calls:()=>calls};
}
function bot(g){g.s.activePlayer=1;g.s.phase='operations';g.s.turnStage='ai';g.s.players[1].strategy='military';return g.s.players[1];}
function funds(p){p.storageUpgrades=100;p.resourceLimits={matter:1000,energy:1000,biomass:1000,data:1000};p.resources={matter:30,energy:30,biomass:30,data:30};}
const record={fixtures:0,matchedSetups:0};
// Absolute positions deliberately change in the inward-corner experiment. Keep
// comparing the actual dealt terrain/resources and sector order within clusters.
function relativeTerrain(s){
 const origins=new Map(s.clusters.flatMap((c,i)=>typeof c.center==='string'?[[c.id??i,c.center.split(',').map(Number)]]:[]));
 const relative=(key,origin)=>key.split(',').map((n,i)=>Number(n)-origin[i]);
 s.planets=Object.fromEntries(Object.entries(s.planets).map(([key,p])=>{
  const origin=origins.get(p.cluster);if(!origin)return[key,p];
  const at=relative(key,origin),next={...p};
  if('q' in next)next.q=at[0];if('r' in next)next.r=at[1];
  return[`${p.cluster}:${at.join(',')}`,next];
 }));
 for(const [i,c] of s.clusters.entries()){const origin=origins.get(c.id??i);if(!origin)continue;c.center='0,0';c.coords=c.coords.map(key=>relative(key,origin).join(','));}
 return s;
}
for(let n=0;n<32;n++){
 const current=game(undefined,20261111+n*7919),old=game('crates/galactic-reach/rules/v20-',20261111+n*7919);
 assert.equal(current.a.rulesVersion,'galactic-reach/39.44');assert.equal(old.a.rulesVersion,'galactic-reach/20.25');
 const now=current.a.observe(0);assert(now.goalDirectedTrading);for(const p of now.players){assert.deepEqual(plain(p.bankExchangeResources),[]);assert(Object.values(p.bankTradeRates).every(rate=>rate===4),'Before any exchange order all give resources retain4:1');}
 // Current planning capabilities and public bank rates are new metadata; archived terrain/decks still match.
 // 31.36 replaces the market supply (72 cards, new serials) and adds a Prestige target; the map,
 // factions, decks and dealt sector contents still match 20.25. Supply-dependent fields are excluded.
 // The inward corner worlds and re-enumerated moon positions are checked by the
 // geometry suites; compare terrain relative to each cluster's center here.
 // 33.38 drops the ships-or-Explorers prompt (moveChoiceSource) for the unit picker.
 // Unlimited Buy removes the obsolete purchase cap; the dedicated Buy suite tests its new semantics.
 // Cleanup & draw deals the same opening hand at setup; only the draw's log line differs.
 // The tiered market splits the supply into three decks (marketDecks), excluded with the rest of the supply.
 const supply=['advancedDeck','marketDecks','market','marketDiscard','relicDeck','relicRow','victoryTarget','capacitySupply'],newPlayer=['storage','military','cardPrestige','buyLimit','buyDiscountEach','buyHubDiscounts','bankExchangeResources','buyDiscountData','marketManipulated','resources'];
 const normalize=g=>{const s=plain(g.s);supply.forEach(k=>delete s[k]);s.players.forEach(p=>{delete p.storagePurchases;delete p.inPlay;delete p.resourceLimits;delete p.buyStartInPlayIds;delete p.buyStartHandIds;newPlayer.forEach(k=>delete p[k]);});delete s.portalLinks;delete s.pendingConstruct;delete s.moveChoiceSource;Object.values(s.planets).forEach(p=>{delete p.occupiedBy;if(p.cluster===12)p.special=null;});s.log=s.log.filter(line=>!/drew (five|its opening five) cards/.test(line));return {...s,version:0,rulesRevision:0,visibilityRevision:0};};assert.deepEqual(relativeTerrain(normalize(current)),relativeTerrain(normalize(old)));
 const observation=g=>{const v=plain(g.a.observe(0));['market','relicRow','relicDeckCount','victoryTarget','capacitySupply'].forEach(k=>delete v[k]);['portalLinks','portalMovementCost','harvesterYield','marketCosts','combinedProbe','cardStats','marketPrestige','tacticStats','combatVictoryPrestige','captureNeedsFleet','constructDrawOnly','investmentPlanning','cardPurchasePlanning','goalDirectedTrading','tradeGoals','shipCosts','harvesterCost','marketPaymentCosts','simulationCatalogMarket','catalogCounts'].forEach(k=>delete v[k]);v.players.forEach(p=>{delete p.bankExchangeResources;delete p.bankTradeRates;delete p.cardPrestige;delete p.military;delete p.resources;p.deckContents?.forEach(c=>delete c.level);});delete v.pendingConstruct;Object.values(v.planets).forEach(p=>delete p.occupiedBy);v.clusters.forEach(c=>delete c.located);v.players.forEach(p=>{delete p.storage;delete p.storagePurchases;delete p.storageUpgradeCost;delete p.inPlay;delete p.resourceLimits;p.capacity=0;p.prestige=0;});return v;};assert.deepEqual(relativeTerrain(observation(current)),relativeTerrain(observation(old)));const stable=g=>plain(g.a.legalActions(0)).filter(x=>!['trade_offer','bank_trade','discard_resources','resource','increase_storage'].includes(x.type));assert.deepEqual(stable(current),stable(old),'Orders match; resource-dependent actions differ with the 32.37 opening (issue #41)');record.matchedSetups++;
}
{
 const g=game(),p=bot(g),center=g.s.clusters[4].center;funds(p);p.hand=[{id:'col',key:'colonize'},{id:'build',key:'construct'}];g.s.fleets={[center]:{1:{settler:1,explorer:0,fleet:0}}};
 g.e.runAiOperation();assert.equal(g.s.planets[center].owner,1);assert(g.s.planets[center].hasColony);assert(p.hand.some(c=>c.id==='build'));assert.equal(p.resources.biomass,27);record.fixtures++;
}
{
 const g=game(),p=bot(g),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world);world.revealedBy=[0,1,2,3];world.scannedBy=[1];funds(p);p.hand=[{id:'dig',key:'excavate'},{id:'build',key:'construct'}];g.s.fleets={[site]:{1:{explorer:1,settler:0,fleet:0}}};
 g.e.runAiOperation();assert.equal(p.relicsExcavated,1);assert.equal(g.s.planets[site].special,null);assert(p.hand.some(c=>c.id==='build'));assert.equal(g.s.fleets[site]?.[1]?.explorer||0,0);record.fixtures++;
}
{
 const g=game(),p=bot(g);p.hand=[{id:'build',key:'construct'}];p.resources={matter:0,energy:0,biomass:0,data:0};const before=JSON.stringify(g.s),calls=g.calls();
 assert.equal(g.e.aiUseResources(p,'build',{matter:2,energy:1,biomass:1,data:1}),false);assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);record.fixtures++;
 p.hand.push({id:'fund',key:'move',starter:true});assert(g.e.aiUseResources(p,'build',{energy:1}));assert.equal(p.resources.energy,1);record.fixtures++;
}
{
 const g=game(),p=bot(g);p.resourceLimits.matter=9;p.resources={matter:9,energy:0,biomass:0,data:0};p.hand=[{id:'move',key:'move',starter:true},{id:'build',key:'construct'}];
 assert(g.e.aiUseResources(p,'build',{matter:2,energy:1,data:1}));assert.deepEqual(plain(p.resources),{matter:5,energy:1,biomass:0,data:1});assert.equal(g.e.overflowPlayer(),-1);record.fixtures++;
}
{
 const g=game(),p=bot(g),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world);world.revealedBy=[0,1,2,3];world.scannedBy=[1];
 g.s.fleets={[site]:{1:{explorer:1,settler:0,fleet:0}}};assert.equal(g.e.chooseAiMove(1,{key:'move'}),null,'Explorer holds its scoring site');
 const source=g.s.clusters[1].center;g.s.fleets[source]={1:{settler:1,explorer:0,fleet:0}};
 const move=g.e.chooseAiMove(1,{key:'move'});assert(move);assert.equal(move.source,source);assert.equal(move.moveGroup,'ships');assert(g.s.clusters.some(c=>c.center===move.goal));record.fixtures++;
 g.s.fleets={[world.center]:{1:{settler:1,explorer:0,fleet:0}}};assert.equal(g.e.chooseAiMove(1,{key:'move'}),null,'Settler waits for Colonize');record.fixtures++;
}
{
 const g=game(),p=bot(g);funds(p);const yard=g.s.clusters[1].coords[1];assert(g.e.constructAt(1,yard,'starbase'));
 g.s.relicRow=[];g.s.fleets={[yard]:{1:{explorer:1,fleet:0,settler:0}}};assert.equal(g.e.chooseAiMove(1,{key:'move'}),null,'No endless exploration after relic rewards run out');
 p.hand=[{id:'build',key:'construct'}];assert.notEqual(g.e.chooseAiBuild(1).kind,'explorer');record.fixtures++;
 p.strategy='economy';for(const c of g.s.clusters.filter(c=>c.kind==='world'&&c.id>=4))Object.assign(g.s.planets[c.center],{owner:2,hasColony:true});
 assert.equal(g.e.chooseAiBuild(1).kind,'settler','A closed map still needs Settlers for captures');record.fixtures++;
}
{
 const g=game(),p=bot(g),world=g.s.clusters[4];funds(p);p.hand=[{id:'move',key:'move',starter:true,upgraded:true}];
 for(const c of g.s.clusters.filter(c=>c.kind==='world'))g.s.planets[c.center].owner=1;
 for(const coord of world.coords)Object.assign(g.s.planets[coord],{owner:2,occupiedBy:null,hasColony:coord===world.center,upgrade:coord===world.center?null:'harvester'});
 const [q,r]=world.center.split(',').map(Number),source=`${q-2},${r}`;g.s.fleets={[source]:{1:{settler:1,explorer:0,fleet:0}}};
 // 34.39 #combat: a lone Settler cannot capture, so it no longer heads for the enemy center.
 assert.notEqual(g.e.chooseAiMove(1,p.hand[0])?.goal,world.center,'A lone Settler does not chase a capture');
 g.s.fleets={[source]:{1:{settler:1,explorer:0,fleet:1}}};
 const move=g.e.chooseAiMove(1,p.hand[0]);assert(move);assert.equal(move.goal,world.center);assert.equal(move.destination,world.center,'Pass through undefended enemy resource hexes without occupation battles');
 assert(g.a.legalActions(1).some(a=>a.type==='move'&&a.source===source&&a.destination===move.destination));record.fixtures++;
}
{
 const g=game(),p=bot(g),yard=g.s.clusters[1].coords[1];funds(p);assert(g.e.constructAt(1,yard,'starbase'));p.storageUpgrades=4;p.resources={matter:8,energy:7,biomass:8,data:5};
 // Rules #rival-planning: storage is a Capacity Module bought on the rival's own Buy turn.
 g.s.phase='buy';g.s.activePlayer=1;
 const before=JSON.stringify(p.resources);for(let n=0;n<10;n++)g.e.aiManageStorage(1);assert.equal(p.storagePurchases||0,0);assert.equal(JSON.stringify(p.resources),before);record.fixtures++;
 p.resources={matter:4,energy:4,biomass:4,data:3};const incomeSite=g.s.clusters[1].coords[2];Object.assign(g.s.planets[incomeSite],{owner:1,type:'matter',upgrade:'harvester',occupiedBy:null});p.storageUpgrades=1;p.resourceLimits={matter:4,energy:4,biomass:4,data:4};g.e.aiManageStorage(1);assert.equal(p.storagePurchases,1);assert.equal(p.discard.filter(c=>c.key==='capacityModule').length,1);
 g.e.aiManageStorage(1);assert.equal(p.storagePurchases,1,'At most one unplayed module');record.fixtures++;
}
{
 const g=game(),p=bot(g),yard=g.s.clusters[1].coords[1];funds(p);assert(g.e.constructAt(1,yard,'starbase'));
 p.hand=[];p.deck=[{id:'last-draw-move',key:'move'}];p.discard=[{id:'kept-move',key:'move'}];p.buyStartDiscardIds=['kept-move'];g.s.phase='buy';g.s.market=[];
 g.e.runAiBuy();assert(p.discard.some(c=>c.id==='kept-move'),'Never trash a needed movement order');record.fixtures++;
}
{
 const a=game(),b=game();for(const g of [a,b]){const p=bot(g);funds(p);p.hand=[{id:'build',key:'construct'}];}
 b.s.players[1].deck.reverse();assert.deepEqual(plain(a.e.chooseAiBuild(1)),plain(b.e.chooseAiBuild(1)),'Own draw order cannot influence planning');record.fixtures++;
}
const hashes=JSON.parse(read('scripts/scoring-bots-archive-hashes.json'));
for(const [name,expected] of Object.entries(hashes.assets))assert.equal(hash(read('crates/galactic-reach/rules/v20-'+name)),expected,'Immutable20.25 '+name);
const policy=read('crates/galactic-reach/src/legacy_v16.rs').slice(read('crates/galactic-reach/src/legacy_v16.rs').indexOf('#[derive(Clone, Copy, Debug)]')).trim();assert.equal(hash(policy),hashes.policy);
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/20.25':{format:20,path:'/galactic-reach/rules/20.25/'}"));
console.log('Scoring Bots:',JSON.stringify(record),'immediate points, legal funding and overflow, Colony paths, held scoring sites, useful decks, bounded storage, information limits and frozen20.25/policy16 passed.');
