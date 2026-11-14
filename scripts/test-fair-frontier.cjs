// Current Fair Frontier rules: inspect private deck multisets, select upgrade payment,
// consume exactly one Explorer, and circulate relic rewards through discard.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'), plain=x=>JSON.parse(JSON.stringify(x));
function game(){
 const c=vm.createContext({});
 vm.runInContext(['adapter.js','app.js'].map(n=>fs.readFileSync(path.join(root,'prototypes/galactic-reach',n),'utf8')).join('\n'),c);
 const factory=c.createGalacticAdapter;let e,seed=17,calls=0;
 c.createGalacticAdapter=p=>{e=p;return factory(p);};
 const a=c.createGalacticReach({headless:true,random:()=>{calls++;return(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32;}});
 return{e,a,s:e.state,p:e.state.players[0],calls:()=>calls,adapter:()=>factory(e)};
}
{
 const g=game();g.p.deck=[
  {id:'secret-last',key:'move',starter:true,upgraded:true},
  {id:'secret-middle',key:'construct',starter:true},
  {id:'secret-first',key:'construct',starter:true},
  {id:'secret-purchased',key:'move'}
 ];
 const before=JSON.stringify(g.s), calls=g.calls(), expected=[
  {key:'construct',upgraded:false,starter:true,count:2},
  {key:'move',upgraded:false,starter:false,count:1},
  {key:'move',upgraded:true,starter:true,count:1}
 ];
 for(let n=0;n<20;n++)assert.deepEqual(plain(g.e.deckContents(g.p)),expected);
 const view=g.a.observe(0);assert.deepEqual(plain(view.players[0].deckContents),expected);
 assert(!JSON.stringify(view.players[0].deckContents).includes('secret'));
 assert(view.players.slice(1).every(p=>!('deckContents' in p)));
 assert(!('deckContents' in g.a.observe(1).players[0]),'Opponent cannot inspect this deck');
 assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls,'Inspection never consumes RNG');
 g.p.deck.reverse();assert.deepEqual(plain(g.e.deckContents(g.p)),expected,'Deck ordering cannot affect presentation');
}
// Acquiring new cards never bypasses discard or draws/shuffles the owned deck.
for(const kind of ['settler','explorer']){
 const g=game(),yard=g.s.clusters[0].coords[1];
 g.s.planets[yard].owner=0;g.s.planets[yard].upgrade='starbase';g.s.planets[yard].upgradeLevel=1;
 g.p.storageUpgrades=20;g.p.resources={matter:20,energy:20,biomass:20,data:20};
 g.p.hand=[{key:'construct',id:'commission'}];g.p.discard=[];
 const beforeDeck=JSON.stringify(g.p.deck),calls=g.calls();
 const a=g.adapter(),action=a.legalActions(0).find(x=>x.type==='build'&&x.kind===kind&&x.coord===yard);
 assert(action);assert.equal(g.calls(),calls);a.applyAction(0,action);
 const bundled=kind==='explorer'?'excavate':'colonize';
 assert(g.p.discard.some(c=>c.key===bundled));assert(!g.p.hand.some(c=>c.key===bundled));
 assert.equal(JSON.stringify(g.p.deck),beforeDeck);assert.equal(g.calls(),calls);assert.equal(g.p.cardsPurchased,0);
}
for(const source of ['basic','market']){
 const g=game();g.s.phase='buy';g.p.storageUpgrades=20;g.p.resources={matter:20,energy:20,biomass:20,data:20};
 const beforeDeck=JSON.stringify(g.p.deck),beforeHand=JSON.stringify(g.p.hand),calls=g.calls();
 const a=g.adapter(),action=a.legalActions(0).find(x=>x.type==='buy'&&x.source===source);
 assert(action);a.applyAction(0,action);
 assert(g.p.discard.some(c=>c.key===action.key));assert.equal(JSON.stringify(g.p.hand),beforeHand);
 assert.equal(JSON.stringify(g.p.deck),beforeDeck);assert.equal(g.calls(),calls);
}
for(const resource of ['matter','energy','biomass','data']){
 const g=game();g.s.phase='buy';g.p.hand=[{key:'move',id:'starter',starter:true}];g.p.discard=[];
 g.p.resources={matter:0,energy:0,biomass:0,data:0};g.p.resources[resource]=2;
 const a=g.adapter(),before=JSON.stringify(g.s),legal=a.legalActions(0).filter(x=>x.type==='upgrade');
 assert.equal(legal.length,1);assert.equal(legal[0].resource,resource);
 assert.throws(()=>a.applyAction(0,{...legal[0],resource:['matter','energy']}),/Illegal action/);
 assert.equal(JSON.stringify(g.s),before);
 a.applyAction(0,legal[0]);assert(g.p.hand[0].upgraded);assert.equal(g.p.resources[resource],0);
 assert.equal(g.s.activePlayer,0);assert.equal(g.s.phase,'buy');assert.equal(g.p.bought,0);
 assert(!g.e.upgradeStarter(0,'starter',resource),'Cannot upgrade twice');
}
{
 const g=game();g.s.phase='buy';g.p.hand=[{key:'move',id:'starter',starter:true}];g.p.resources={matter:1,energy:1,biomass:1,data:1};
 const before=JSON.stringify(g.s);assert(!g.adapter().legalActions(0).some(x=>x.type==='upgrade'));
 for(const resource of ['matter','energy','biomass','data',null,'unknown'])assert(!g.e.upgradeStarter(0,'starter',resource));
 assert.equal(JSON.stringify(g.s),before,'Mixed or invalid payment cannot upgrade');
}
{
 const g=game(), coord=Object.keys(g.s.planets).find(k=>g.s.planets[k].special==='relic');
 g.p.hand=[{key:'excavate',id:'dig'}];g.p.discard=[];g.p.deck=[{id:'normal-draw',key:'move'}];
 g.p.resources={matter:1,energy:1,biomass:0,data:2};
 g.s.clusters[g.s.planets[coord].cluster].scannedBy=[0];
 g.s.fleets[coord]={0:{explorer:2,fleet:1,settler:1}};
 const prize=g.s.relicRow[0], action=g.adapter().legalActions(0).find(x=>x.type==='excavate'&&x.coord===coord&&x.relic===prize.id);
 assert(action);g.adapter().applyAction(0,action);
 assert.deepEqual(plain(g.s.fleets[coord][0]),{explorer:1,fleet:1,settler:1});
 assert(g.p.discard.some(c=>c.id===prize.id));assert(!g.p.hand.some(c=>c.id===prize.id),'Reward is not immediately playable');
 assert(![...g.p.hand,...g.p.deck,...g.p.discard].some(c=>c.id==='dig'));
 g.s.players.slice(1).forEach(p=>{p.hand=[];p.deck=[];p.discard=[];});
 for(let n=0;n<8;n++){
  const a=g.adapter(),seat=a.activeSeat(),type=g.s.phase==='buy'?'finish_buy':'pass';
  a.applyAction(seat,a.legalActions(seat).find(x=>x.type===type));
 }
 assert.equal(g.s.round,2);assert(g.p.hand.some(c=>c.id===prize.id),'Reward reaches hand through normal round draw and reshuffle');
}
{
 const g=game();assert(!g.e.ALL_CARDS.terraformingProtocols);
 assert(Object.values(g.s.planets).every(p=>!('rich'in p)&&p.special!=='rich'));
 g.p.hand=[{key:'worldweaverSpore',id:'spore'}];g.p.resources={matter:0,energy:0,biomass:0,data:0};
 const home=g.s.clusters[0];g.s.planets[home.coords[1]].owner=0;
 const before=plain(g.s.planets);const action=g.adapter().legalActions(0).find(x=>x.type==='special');
 g.adapter().applyAction(0,action);assert.equal(g.e.totalResources(g.p),2);assert.deepEqual(plain(g.s.planets),before,'Spore makes no permanent terrain changes');
}
console.log('Fair Frontier: private unordered deck inspection without RNG/state changes, four upgrade currencies and atomic mixed-payment rejection, one Explorer consumed, all newly gained cards in discard and normal draw circulation, and no Rich/terraforming passed.');
