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
function funds(p){p.storageUpgrades=100;p.resources={matter:30,energy:30,biomass:30,data:30};}
const record={fixtures:0,matchedSetups:0};
for(let n=0;n<32;n++){
 const current=game(undefined,20261111+n*7919),old=game('crates/galactic-reach/rules/v20-',20261111+n*7919);
 assert.equal(current.a.rulesVersion,'galactic-reach/27.32');assert.equal(old.a.rulesVersion,'galactic-reach/20.25');
 const normalize=g=>{const s=plain(g.s);s.players.forEach(p=>{delete p.storagePurchases;delete p.inPlay;});return {...s,version:0,rulesRevision:0,visibilityRevision:0};};assert.deepEqual(normalize(current),normalize(old));assert.equal(current.calls(),old.calls());
 const observation=g=>{const v=plain(g.a.observe(0));v.clusters.forEach(c=>delete c.located);v.players.forEach(p=>{delete p.storagePurchases;delete p.storageUpgradeCost;delete p.inPlay;p.prestige=0;});return v;};assert.deepEqual(observation(current),observation(old));assert.deepEqual(plain(current.a.legalActions(0)),plain(old.a.legalActions(0)));record.matchedSetups++;
}
{
 const g=game(),p=bot(g),center=g.s.clusters[4].center;funds(p);p.hand=[{id:'col',key:'colonize'},{id:'build',key:'construct'}];g.s.fleets={[center]:{1:{settler:1,explorer:0,fleet:0}}};
 g.e.runAiOperation();assert.equal(g.s.planets[center].owner,1);assert(g.s.planets[center].hasColony);assert(p.hand.some(c=>c.id==='build'));assert.equal(p.resources.biomass,28);record.fixtures++;
}
{
 const g=game(),p=bot(g),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world);world.revealedBy=[0,1,2,3];world.scannedBy=[1];funds(p);p.hand=[{id:'dig',key:'excavate'},{id:'build',key:'construct'}];g.s.fleets={[site]:{1:{explorer:1,settler:0,fleet:0}}};
 g.e.runAiOperation();assert.equal(p.relicsExcavated,1);assert.equal(g.s.planets[site].special,null);assert(p.hand.some(c=>c.id==='build'));assert.equal(g.s.fleets[site]?.[1]?.explorer||0,0);record.fixtures++;
}
{
 const g=game(),p=bot(g);p.hand=[{id:'build',key:'construct'}];p.resources={matter:0,energy:0,biomass:0,data:0};const before=JSON.stringify(g.s),calls=g.calls();
 assert.equal(g.e.aiUseResources(p,'build',{matter:2,energy:1,biomass:1,data:1}),false);assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);record.fixtures++;
 p.hand.push({id:'wild',key:'tradeConsortium'});assert(g.e.aiUseResources(p,'build',{data:2}));assert.equal(p.resources.data,2);record.fixtures++;
}
{
 const g=game(),p=bot(g);p.resources={matter:9,energy:0,biomass:0,data:0};p.hand=[{id:'move',key:'move',upgraded:true},{id:'build',key:'construct'}];
 assert(g.e.aiUseResources(p,'build',{matter:2,energy:1,data:1}));assert.deepEqual(plain(p.resources),{matter:4,energy:2,biomass:0,data:1});assert.equal(g.e.overflowPlayer(),-1);record.fixtures++;
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
 const g=game(),p=bot(g),world=g.s.clusters[4];funds(p);p.hand=[{id:'move',key:'move',upgraded:true}];
 for(const c of g.s.clusters.filter(c=>c.kind==='world'))g.s.planets[c.center].owner=1;
 for(const coord of world.coords)Object.assign(g.s.planets[coord],{owner:2,occupiedBy:null,hasColony:coord===world.center,upgrade:coord===world.center?null:'harvester'});
 const [q,r]=world.center.split(',').map(Number),source=`${q-2},${r}`;g.s.fleets={[source]:{1:{settler:1,explorer:0,fleet:0}}};
 const move=g.e.chooseAiMove(1,p.hand[0]);assert(move);assert.equal(move.goal,world.center);assert.notEqual(move.destination,world.center,'Stop at the first hostile intermediate hex');
 assert(g.a.legalActions(1).some(a=>a.type==='move'&&a.source===source&&a.destination===move.destination));record.fixtures++;
}
{
 const g=game(),p=bot(g),yard=g.s.clusters[1].coords[1];funds(p);assert(g.e.constructAt(1,yard,'starbase'));p.storageUpgrades=4;p.resources={matter:8,energy:7,biomass:8,data:5};
 const before=JSON.stringify(p.resources);for(let n=0;n<10;n++)g.e.aiManageStorage(1);assert.equal(p.storageUpgrades,4);assert.equal(JSON.stringify(p.resources),before);record.fixtures++;
 p.resources={matter:4,energy:4,biomass:4,data:3};p.storageUpgrades=1;g.e.aiManageStorage(1);assert.equal(p.storageUpgrades,2);record.fixtures++;
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
