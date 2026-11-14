const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(){
 const c=vm.createContext({});let e,seed=1729,calls=0;
 let source=read('prototypes/galactic-reach/app.js').replace('      clone, deckContents,','      prestigeBreakdown, aiThreat, aiBattleEstimate, chooseAiMove, chooseAiBuild, aiManageStorage, clone, deckContents,');
 vm.runInContext(read('prototypes/galactic-reach/adapter.js')+source,c);const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
 const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 return {e,a,s:e.state,calls:()=>calls,fresh:()=>factory(e)};
}
{
 const {e,s}=game(),p=s.players[0];assert.equal(e.calculatePrestige(0),3);
 for(const c of s.clusters.slice(4,9))Object.assign(s.planets[c.center],{owner:0,hasColony:true});
 assert.equal(e.calculatePrestige(0),18);p.relicsExcavated=1;assert.equal(e.calculatePrestige(0),20);
 assert.deepEqual(plain(e.prestigeBreakdown(0)),{colonies:18,expansionBonus:0,relics:2,combat:0,total:20});
 Object.assign(s.planets[s.clusters[4].center],{owner:1});assert.equal(e.calculatePrestige(0),17);
 p.combatVictories=3;assert.equal(e.calculatePrestige(0),20);p.cardsPurchased=100;assert.equal(e.calculatePrestige(0),20);
}
{
 const {e,s,a}=game(),p=s.players[0];p.storageUpgrades=3;
 for(let tier=1;tier<=3;tier++){
  p.resources=Object.fromEntries(e.RESOURCES.map(r=>[r,tier]));
  assert.deepEqual(plain(e.storageUpgradeCost(0)),p.resources);
  assert(e.increaseStorage(0,{matter:1,energy:1,biomass:1,data:1}));assert.equal(p.storagePurchases,tier);assert.equal(e.playerCapacity(0),16+4*tier);
  assert.deepEqual(plain(p.resources),{matter:0,energy:0,biomass:0,data:0});
 }
 assert.deepEqual(plain(a.observe(0).players[0].storageUpgradeCost),{matter:4,energy:4,biomass:4,data:4});
 assert.equal(a.observe(0).players[0].storagePurchases,3);
 assert.equal(e.storageUpgradeCost(1).biomass,1,'Paid tiers belong to one faction');
 p.resources={matter:4,energy:4,biomass:3,data:4};const before=JSON.stringify(s);assert(!e.increaseStorage(0));assert.equal(JSON.stringify(s),before);
 // The actual free relic effect, rather than a synthetic count increment.
 p.hand=[{id:'cradle',key:'cradleOfLostSuns'}];p.resources={matter:0,energy:0,biomass:0,data:0};
 const paid=p.storagePurchases,capacity=e.playerCapacity(0);e.resolveHumanSpecial(p.hand[0],e.ALL_CARDS.cradleOfLostSuns,0,{matter:1,energy:1,biomass:1,data:1});
 assert.equal(p.storagePurchases,paid);assert.equal(e.playerCapacity(0),capacity+4);assert.equal(e.storageUpgradeCost(0).matter,4);
}
{
 const g=game(),{e,s}=g,p=s.players[1];p.strategy='military';p.hand=[{id:'move',key:'move',upgraded:true}];s.activePlayer=1;
 // Uploaded report: a lone Settler moved from -6,-1 next to two human Fleets at -8,0.
 s.fleets={'-6,-1':{1:{settler:1}},'-8,0':{0:{fleet:2}}};
 assert.equal(e.aiThreat(1,{settler:1},'-7,-1','-6,-1'),1);
 const before=JSON.stringify(s),calls=g.calls(),move=e.chooseAiMove(1,p.hand[0]);
 assert(move);assert.notEqual(move.destination,'-7,-1');assert(e.aiThreat(1,{settler:1},move.destination,move.source)<1);
 assert(g.fresh().legalActions(1).some(a=>a.type==='move'&&a.source===move.source&&a.destination===move.destination));
 assert.equal(JSON.stringify(s),before);assert.equal(g.calls(),calls,'Planning is deterministic and consumes no RNG');
 s.players[0].hand=[{id:'secret',key:'obeliskOfAnnihilation'}];s.players[0].deck.reverse();
 assert.deepEqual(plain(e.chooseAiMove(1,p.hand[0])),plain(move),'Enemy private cards do not affect planning');
}
{
 const {e,s}=game();s.players[1].strategy='military';s.fleets={'0,0':{1:{fleet:1}},'5,0':{1:{fleet:1}},'9,0':{0:{fleet:2}}};
 const m=e.chooseAiMove(1,{key:'move'});assert(m);assert(m.goal==='0,0'||m.goal==='5,0','Fleets rally or retreat toward allies');
 assert.equal(e.aiBattleEstimate({fleet:3},{fleet:2}).win,1);assert.equal(e.aiBattleEstimate({settler:1},{fleet:2}).win,0);
}
{
 const {e,s}=game(),p=s.players[1];p.hand=[{id:'build',key:'construct'}];p.resources={matter:2,energy:1,biomass:1,data:1};
 const build=e.chooseAiBuild(1);assert.equal(build.kind,'harvester');assert.equal(s.planets[build.coord].type,'data','Opening invests in missing Data production');
}
const hashes=JSON.parse(read('scripts/twenty-point-strategy-archive-hashes.json'));
for(const [file,expected] of Object.entries(hashes)){
 let contents=read(file);if(file.endsWith('.rs'))contents=contents.slice(contents.indexOf('#[derive(Clone, Copy, Debug)]')).trim();
 assert.equal(crypto.createHash('sha256').update(contents).digest('hex'),expected,'Preserved '+file);
}
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/22.27':{format:22,path:'/galactic-reach/rules/22.27/'}"));
assert(!read('prototypes/galactic-reach/index.html').includes('extra point per pair'),'Point dialog help must follow the new scoring');
console.log('Twenty Point Strategy: weighted scoring, 1/2/3 escalating storage, free relic isolation, per-player prices, atomic rejection, report threat regression, private information, rallying, Data opening and frozen22.27/policy18 passed.');
