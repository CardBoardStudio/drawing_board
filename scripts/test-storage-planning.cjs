const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(prefix='prototypes/galactic-reach/', browserDiscards=false){
 const c=vm.createContext({});let e,seed=1729,calls=0;
 let src=read(prefix+'app.js').replace('      clone, deckContents,','      trimResourcesToCapacity, aiManageStorage, aiReserves, aiIncome, aiStockpile, aiUseResources, runAiBuy, runAiOperation, '+(prefix.startsWith('prototypes')?'aiStorageBudget, aiStorageProtection, ':'')+'clone, deckContents,');
 if(browserDiscards)src=src.replace('!headless && player.id > 0','player.id > 0');
 vm.runInContext(read(prefix+'adapter.js')+src,c);const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x);};const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 const s=e.state,p=s.players[1];s.activePlayer=1;p.strategy='military';p.hand=[];p.deck=[];p.discard=[];
 const yard=s.clusters[1].coords[1];Object.assign(s.planets[yard],{owner:1,upgrade:'starbase',occupiedBy:null});
 for(const coord of s.clusters[4].coords)Object.assign(s.planets[coord],{owner:1,occupiedBy:null});
 return {e,s,p,a,calls:()=>calls};
}
{
 const g=game(),old=game('crates/galactic-reach/rules/v24-');
 for(const x of [g,old])x.p.resources={matter:3,energy:3,biomass:2,data:2};
 old.e.aiManageStorage(1);assert.equal(old.p.storagePurchases,0,'Old reserve guard cannot buy the first upgrade');
 const before=JSON.stringify(g.s),calls=g.calls(),plan=g.e.aiStorageBudget(1);assert(plan);assert(plan.production>0);assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);
 assert(g.e.aiManageStorage(1));assert.equal(g.p.storagePurchases,1);assert.equal(g.e.playerCapacity(1),15);assert.deepEqual(plain(g.p.resources),{matter:2,energy:2,biomass:1,data:1});
}
{
 const g=game();g.s.fleets={'0,0':{1:{settler:1,explorer:1}}};g.p.resources={matter:2,energy:2,biomass:3,data:3};
 assert.deepEqual(plain(g.e.aiReserves(1)),{matter:2,energy:2,biomass:3,data:3});assert(g.e.aiManageStorage(1));
 assert.deepEqual(plain(g.p.resources),{matter:1,energy:1,biomass:2,data:2},'Payment leaves both Colony and excavation funds');
 const h=game();h.s.fleets={'0,0':{1:{settler:1,explorer:1}}};h.p.resources={matter:3,energy:3,biomass:2,data:2};const state=JSON.stringify(h.s);assert(!h.e.aiManageStorage(1));assert.equal(JSON.stringify(h.s),state,'No speculative purchase consumes the next scoring payment');
}
{
 const g=game();g.s.fleets={'0,0':{1:{settler:1,explorer:1}}};g.p.resources={matter:9,energy:6,biomass:3,data:3};g.e.trimResourcesToCapacity(1);
 assert.deepEqual(plain(g.p.resources),{matter:2,energy:2,biomass:3,data:3},'Overflow keeps a feasible purchase plus scoring mix');assert(g.e.aiManageStorage(1));
}
{
 const g=game();g.p.storageUpgrades=5;g.p.resources={matter:2,energy:2,biomass:2,data:2};assert(!g.e.aiStorageBudget(1),'Free capacity removes pressure');
 const h=game();h.p.storagePurchases=3;h.p.storageUpgrades=3;h.p.resources={matter:6,energy:6,biomass:6,data:6};h.s.players[0].combatVictories=13;
 assert(!h.e.aiStorageBudget(1),'An expensive tier cannot repay over the short late horizon');
 const k=game();k.p.resources={matter:3,energy:3,biomass:2,data:2};k.s.players[0].combatVictories=17;assert(!k.e.aiManageStorage(1),'No upgrade when a faction already qualifies for victory');
}
for(const phase of ['production','draw','cleanup']){
 const g=game();g.s.phase=phase;g.p.resources={matter:3,energy:3,biomass:2,data:2};const before=JSON.stringify(g.s);assert(!g.e.aiManageStorage(1));assert.equal(JSON.stringify(g.s),before);
}
{
 const g=game();g.p.resources={matter:5,energy:5,biomass:5,data:5};const before=JSON.stringify(g.s);assert(!g.e.aiManageStorage(1),'Overflow must be resolved before any purchase');assert.equal(JSON.stringify(g.s),before);
}
{
 const g=game();g.p.resources={matter:3,energy:3,biomass:2,data:2};g.p.hand=[{id:'buy-move',key:'move',starter:true}];g.s.phase='buy';g.e.runAiBuy();assert.equal(g.p.storagePurchases,1,'Storage occurs before discretionary Buy spending');
}
{
 const g=game();g.p.resources={matter:3,energy:3,biomass:2,data:2};const a=plain(g.e.aiStorageBudget(1));g.s.players[0].hand=[{id:'private',key:'omniscientChorus'}];g.s.players[0].deck.reverse();
 assert.deepEqual(plain(g.e.aiStorageBudget(1)),a,'Forecast cannot inspect enemy private cards');
}
{
 const a=game(),b=game('prototypes/galactic-reach/',true);
 for(const g of [a,b]){g.p.resources={matter:9,energy:0,biomass:0,data:0};g.p.hand=[{id:'keep',key:'construct'},{id:'convert',key:'move',upgraded:true}];assert(g.e.aiUseResources(g.p,'keep',{matter:2,energy:1,data:1}));}
 assert.deepEqual(plain(a.s),plain(b.s),'Funding overflow matches the live browser path');assert.equal(a.calls(),b.calls());
}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [n,h] of Object.entries(JSON.parse(read('scripts/storage-planning-archive-hashes.json')))){
 let s=read(n);if(n.endsWith('.rs'))s=s.slice(s.indexOf('#[derive(Clone, Copy, Debug)]')).trim();assert.equal(sha(s),h,'Frozen24.29/policy20 '+n);
}
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/24.29':{format:24,path:'/galactic-reach/rules/24.29/'}"));
console.log('Storage Planning: first-tier feasibility, point-payment protection, public forecasts, overflow mix, legal timing, price/free-capacity/endgame guards, pre-Buy priority, private information and preserved24.29/policy20 passed.');
