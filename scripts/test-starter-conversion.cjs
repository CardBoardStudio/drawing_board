// #resources / #orders / #cards: level-I-only conversion and no resource-granting cards.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
const removed=['orbitalFoundry','miningCharter','bioReactor','dataHaven','harvestCycle','quartermaster','boardingMarines','senateSeat','genesisSeedVault','precursorMatterLoom','worldweaverSpore','cradleOfLostSuns','naniteOssuary','moonforge','sunwell','architectsLedger'];
function game(resume){
 const c=vm.createContext({}),read=f=>fs.readFileSync(path.join(root,'prototypes/galactic-reach',f),'utf8');
 vm.runInContext(read('adapter.js')+read('app.js').replace('      clone, deckContents,','      aiFundingPlan, aiStockpile, clone, deckContents,'),c);
 let e,seed=73,calls=0;const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x);};
 const a=c.createGalacticReach({headless:true,resume,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}}),s=e.state,p=s.players[0];
 if(!resume){s.phase='operations';s.activePlayer=0;s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];p.inPlay=[];p.resources={matter:20,energy:20,biomass:20,data:20};p.resourceLimits={matter:40,energy:40,biomass:40,data:40};});}
 return {e,a,s,p,calls:()=>calls};
}
const eligible=[{id:'move-I',key:'move',starter:true},{id:'construct-I',key:'construct',starter:true,level:1}];
const forbidden=[
 {id:'move-II',key:'move',starter:true,upgraded:true,level:2},
 {id:'construct-III',key:'construct',starter:true,upgraded:true,level:3},
 {id:'level-flag',key:'move',starter:true,level:2},
 {id:'nonstarter',key:'move'},{id:'bundled',key:'probe'},{id:'colonize',key:'colonize',starter:true},
 {id:'market',key:'signalRelay'},{id:'wonder',key:'dysonLattice'},
 {id:'relic',key:'firstDawnEchoes'},{id:'reaction',key:'aegisOfSilentArchitects'}
];
{
 const g=game(),cards=g.e.ALL_CARDS;
 for(const key of removed)assert(!cards[key],`${key} is absent from the current catalog`);
 assert.equal(Object.keys(g.e.MARKET_CARDS).length,31);assert.equal(Object.keys(g.e.RELIC_CARDS).length,15);
 for(const [key,d] of Object.entries(cards)){
  assert(!d.effect?.gain&&!d.effect?.produce&&!d.buildGain&&!d.loot&&d.reaction!=='salvage',key);
  if(!['move','construct'].includes(key))assert(!d.resource&&!d.wildcard,`${key} prints no conversion gain`);
 }
 for(const card of [...g.s.market,...Object.values(g.s.marketDecks).flat(),...g.s.relicRow,...g.s.relicDeck])assert(!removed.includes(card.key));
 assert.equal(g.s.market.length+Object.values(g.s.marketDecks).flat().length,62);assert.equal(g.s.relicRow.length+g.s.relicDeck.length,15);
 const book=fs.readFileSync(path.join(root,'prototypes/galactic-reach/rulebook.html'),'utf8');
 for(const key of removed)assert(!book.includes(`data-card="${key}"`));
  for(const [key,d] of Object.entries({...g.e.MARKET_CARDS,...g.e.RELIC_CARDS})){
   const row=book.match(new RegExp(`<tr data-card="${key}">[\\s\\S]*?</tr>`));assert(row,key);
   assert.equal((row[0].match(/<(?:td|th)(?:\s|>)/g)||[]).length,d.kind==='Alien Relic'?3:d.military?5:6,`${key}: reference table columns match`);
  }
 assert(!fs.readFileSync(path.join(root,'prototypes/galactic-reach/cards.html'),'utf8').includes('<dt>Convert</dt>'));
}
for(const timing of ['operations','buy','offturn','second-build','colony-build']){
 const g=game();g.p.hand=plain([...eligible,...forbidden]);
 if(timing==='buy')g.s.phase='buy';
 if(timing==='offturn')g.s.activePlayer=1;
 if(timing==='second-build')g.s.pendingConstruct={playerId:0,cardName:'Construct II'};
 if(timing==='colony-build')g.s.pendingColonyBuild={playerId:0,colony:g.s.clusters[0].center};
 const before=JSON.stringify(g.a.snapshotState()),calls=g.calls();
 assert.deepEqual(plain(g.a.legalActions(0).filter(a=>a.type==='resource').map(a=>a.card).sort()),eligible.map(c=>c.id).sort(),timing);
 for(const card of forbidden){
  assert(!g.e.canConvertCard(card));assert.deepEqual(plain(g.e.cardResources(card)),{});
  assert(!g.e.convertCard(0,card.id));
  assert.throws(()=>g.a.applyAction(0,{type:'resource',card:card.id,key:card.key,gain:{energy:99}}),/Illegal/);
 }
 assert.equal(JSON.stringify(g.a.snapshotState()),before);assert.equal(g.calls(),calls);
}
{
 const g=game();g.p.hand=plain([...eligible,...forbidden]);const before=plain(g.p.resources);
 for(const card of eligible){const action=g.a.legalActions(0).find(a=>a.type==='resource'&&a.card===card.id);g.a.applyAction(0,action);}
 assert.equal(g.p.resources.energy,before.energy+1);assert.equal(g.p.resources.matter,before.matter+1);
 assert.equal(g.p.inPlay.length,2);assert.equal(g.p.hand.length,forbidden.length);assert.equal(g.s.activePlayer,0);
 const resumed=game(g.a.snapshotState());assert(!resumed.a.legalActions(0).some(a=>a.type==='resource'));
}
for(const key of ['move','construct']){
 const g=game(),card={id:'III',key,starter:true,upgraded:true,level:3};g.p.hand=[card];g.p.deck=[{id:'drawn',key:'signalRelay'}];
 g.s.fleets={'0,0':{0:{fleet:1}}};const before=JSON.stringify(g.a.snapshotState());assert(!g.e.convertCard(0,'III'));assert.equal(JSON.stringify(g.a.snapshotState()),before);
 const action=g.a.legalActions(0).find(a=>key==='move'?a.type==='move'&&a.destination==='0,0':a.type==='build'&&a.kind==='starbase');assert(action);
 g.a.applyAction(0,action);assert(g.p.inPlay.some(c=>c.id==='III'));assert(g.p.hand.some(c=>c.id==='drawn'));assert.equal(g.p.deck.length,0);
 if(key==='construct'){g.a.applyAction(0,{type:'finish_construct'});assert.equal(g.p.hand.length,1,'Second build does not repeat the draw');}
}
{
 const g=game();g.s.phase='buy';g.s.market=[{id:'monument',key:'monumentOfAccord'},{id:'dyson',key:'dysonLattice'}];g.s.marketDecks={expensive:[],medium:[],cheap:[]};
 const start=g.e.calculatePrestige(0);g.a.applyAction(0,g.a.legalActions(0).find(a=>a.type==='buy'&&a.key==='monumentOfAccord'));
 g.a.applyAction(0,g.a.legalActions(0).find(a=>a.type==='buy'&&a.key==='dysonLattice'));
 assert.equal(g.e.calculatePrestige(0),start+7,'Monument 3 + Dyson Lattice 4');assert.equal(g.p.discard.length,2);
 assert(!g.e.decommission(0,'dyson','matter'),'Newly bought Wonders cannot be trashed in the same Buy turn');
 g.p.hand=g.p.discard.splice(0);g.s.phase='operations';
 assert(g.a.legalActions(0).every(a=>!['resource','special'].includes(a.type)),'Wonders are inert in hand');
 g.p.discard=g.p.hand.splice(0);g.p.buyStartDiscardIds=g.p.discard.map(c=>c.id);g.s.phase='buy';
 for(const id of ['monument','dyson'])assert(g.e.decommission(0,id,'matter'));
 assert.equal(g.p.discard.length,0);assert.equal(g.e.calculatePrestige(0),start+7,'Trashing keeps purchased Prestige');
}
{
 const g=game();g.p.resources={matter:0,energy:0,biomass:0,data:0};g.p.hand=plain([...eligible,...forbidden]);
 const plan=g.e.aiFundingPlan(g.p,null,{energy:1});assert(plan);assert.deepEqual(plain(plan.cards),['move-I']);
 assert.equal(g.e.aiFundingPlan(g.p,null,{data:1}),null,'Funding cannot invent conversions for relics or purchases');
 g.e.aiStockpile(0);assert(g.p.hand.filter(c=>forbidden.some(x=>x.id===c.id)).length===forbidden.length);
 assert(g.p.inPlay.every(g.e.canConvertCard));
}
console.log('Starter conversion: current pools, 5 timing contexts, atomic forged-command rejection, exact level-I gains, reload, III order-only draws, inert Wonders/trash points, and rival funding passed.');
