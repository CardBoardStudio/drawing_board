const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(old=false){const prefix=old?'crates/galactic-reach/rules/v28-':'prototypes/galactic-reach/';const c=vm.createContext({});let e,seed=1729,calls=0;const app=read(prefix+'app.js').replace('      clone, deckContents,','      adjacentKeys, canPlaceShip, produceAll, ownerProductionAmount, chooseAiBuild, chooseAiMove, runAiOperation, aiIncome, clone, deckContents,');vm.runInContext(read(prefix+'adapter.js')+app,c);const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x)};c.createGalacticReach({headless:true,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)}});return{e,s:e.state,p:e.state.players[0],a:()=>f(e),calls:()=>calls};}
function action(g,type,pred=()=>true,seat=g.a().activeSeat()){const a=g.a(),x=a.legalActions(seat).find(x=>x.type===type&&pred(x));assert(x,'Missing legal '+type);a.applyAction(seat,x);return x;}
const full=p=>{p.resourceLimits={matter:100,energy:100,biomass:100,data:100};p.resources={matter:30,energy:30,biomass:30,data:30}};
{
 const g=game();assert.equal(g.a().rulesVersion,'galactic-reach/38.43');g.p.resources={matter:3,energy:4,biomass:2,data:0};const r=g.e.addResources(g.p,{matter:3,energy:2,data:8});assert.deepEqual(plain(g.p.resources),{matter:4,energy:4,biomass:2,data:4});assert.deepEqual(plain(r.lost),{matter:2,energy:2,data:4});assert.equal(r.totalLost,8);assert.equal(g.e.overflowPlayer(),-1);assert(!g.a().legalActions(0).some(x=>x.type==='discard_overflow'));assert(g.s.log.some(l=>l.includes('automatically discarded')));
 const before=JSON.stringify(g.s);assert(!g.e.discardOverflow(0,{matter:1}));assert.equal(JSON.stringify(g.s),before);
 g.p.resources={matter:4,energy:0,biomass:0,data:4};action(g,'bank_trade',a=>a.giveType==='matter'&&a.getType==='data');assert.equal(g.p.resources.data,4);assert.equal(g.p.resources.matter,0);
}
for(const finish of [true,false]){
 const g=game();full(g.p);const card={key:'construct',id:'two',starter:true,upgraded:true};g.p.hand=[card,{key:'construct',id:'convert',starter:true}];
 const first=g.s.clusters[0].coords[1],second=g.s.clusters[0].coords[2],before=JSON.stringify(g.s),rng=g.calls();
 assert(!g.e.performConstructOrder(1,first,'harvester',card));assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),rng);
 const a=action(g,'build',a=>a.coord===first&&a.kind==='starbase'&&a.card==='two');assert.equal(a.discountResource,null);assert.equal(g.p.resources.matter,28);assert.equal(g.s.activePlayer,0);assert(g.s.pendingConstruct);assert.equal(g.p.inPlay.filter(c=>c.id==='two').length,1);assert(!g.p.hand.some(c=>c.id==='two'));
 let legal=g.a().legalActions(0);assert(legal.some(x=>x.type==='finish_construct'));assert(!legal.some(x=>['pass','colonize','move','build','special','trade_offer'].includes(x.type)));
 const pending=JSON.stringify(g.s);assert.throws(()=>g.a().applyAction(0,{type:'build',card:'two',coord:second,kind:'harvester',discountResource:'matter'}),/Illegal/);assert.equal(JSON.stringify(g.s),pending);
 if(finish)action(g,'finish_construct');else{action(g,'resource',a=>a.card==='convert');action(g,'second_build',a=>a.kind==='settler'&&a.coord===first);assert.equal(g.p.resources.matter,28);assert.equal(g.p.discard.at(-1).key,'colonize');}
 assert(!g.s.pendingConstruct);assert.equal(g.s.activePlayer,1);assert.equal(g.p.inPlay.filter(c=>c.id==='two').length,1);assert(!g.e.finishConstruct(0));
}
{
 const g=game();g.p.hand=[{key:'construct',id:'two',upgraded:true}];g.p.resources={matter:1,energy:1,biomass:0,data:1};const at=g.s.clusters[0].coords[1];assert(g.e.performConstructOrder(0,at,'harvester',g.p.hand[0]));const before=JSON.stringify(g.s);assert(!g.e.finishConstruct(0,g.s.clusters[0].coords[2],'harvester'));assert.equal(JSON.stringify(g.s),before);action(g,'finish_construct');
}
{
 const g=game();full(g.p);g.p.hand=[{key:'construct',id:'plain'}];action(g,'build',a=>a.kind==='harvester');assert.equal(g.s.activePlayer,1);assert(!g.s.pendingConstruct);
}
{
 const g=game();full(g.p);const yard=g.s.clusters[0].coords[1];Object.assign(g.s.planets[yard],{owner:0,upgrade:'starbase'});g.s.fleets={[yard]:{0:{fleet:5,settler:3,explorer:2}}};assert(g.e.buildShip(0,yard,'fleet'));assert.equal(g.s.fleets[yard][0].fleet,6);
 const from='0,0',to='1,0';g.s.fleets={[from]:{0:{fleet:4}},[to]:{0:{fleet:6,settler:8,explorer:5}}};g.p.hand=[{key:'move',id:'move'}];assert(g.e.reachableFrom(from,0,2,false,g.s.fleets[from][0]).includes(to));action(g,'move',a=>a.source===from&&a.destination===to&&a.moveGroup==='ships');assert.equal(g.s.fleets[to][0].fleet,10);assert(!g.e.canPlaceShip(0,'fleet'),'Faction-wide Fleet limit stays 10');
}
{
 const g=game();full(g.p);g.s.fleets={};const enemy=g.s.clusters[1].center,adj=g.e.adjacentKeys(enemy)[0];g.s.fleets[adj]={0:{fleet:2,settler:1}};g.p.hand=[{key:'move',id:'advance'},{key:'colonize',id:'capture'}];const beforeOwner=g.s.planets[enemy].owner;
 action(g,'move',a=>a.source===adj&&a.destination===enemy&&a.moveGroup==='ships');assert(!g.s.pendingCombat);assert(!g.s.pendingCombatReport);assert.equal(g.s.planets[enemy].owner,beforeOwner);assert(!('occupiedBy' in g.s.planets[enemy]));assert(!g.s.log.some(l=>/seized|occupied/.test(l)));
 g.s.players[1].resources={matter:0,energy:0,biomass:0,data:0};g.e.produceAll();assert.equal(g.s.players[1].resources.matter,1,'Foreign ships do not block Colony production');assert.equal(g.e.aiIncome(1).matter,1);
 g.s.activePlayer=0;action(g,'colonize',a=>a.coord===enemy);assert.equal(g.s.planets[enemy].owner,0);assert.equal(g.s.fleets[enemy][0].settler,0);assert.equal(g.e.calculatePrestige(0),6);assert(!g.p.inPlay.some(c=>c.id==='capture'));assert.equal(g.e.calculatePrestige(1),0);
}
{
 const old=game(true);assert.equal(old.a().rulesVersion,'galactic-reach/28.33');old.p.resources={matter:4,energy:0,biomass:0,data:0};old.e.addResources(old.p,{matter:1});assert.equal(old.p.resources.matter,5);assert.equal(old.e.overflowPlayer(),0);
}
{
 // Rules #storage-allocation: no direct capacity purchase; a Capacity Module in hand offers every split as an order.
 const g=game();g.p.resources={matter:2,energy:2,biomass:2,data:2};assert(!g.a().legalActions(0).some(a=>a.type==='increase_storage'));
 const module={id:'module',key:'capacityModule'};g.p.hand.push(module);assert.equal(g.a().legalActions(0).filter(a=>a.type==='special'&&a.card==='module').length,35);
 const before=JSON.stringify(g.s);assert(!g.e.resolveHumanSpecial(module,g.e.ALL_CARDS.capacityModule,0,{matter:1,energy:1,biomass:1,data:0}));assert.equal(JSON.stringify(g.s),before,'An incomplete split plays nothing');
 action(g,'special',a=>a.card==='module'&&Object.values(a.allocation).every(v=>v===1));assert.deepEqual(plain(g.p.resourceLimits),{matter:5,energy:5,biomass:5,data:5});assert.equal(g.e.storageUpgradeCost(0).matter,2,'A stored module raises the next price');assert.deepEqual(plain(g.p.resources),{matter:2,energy:2,biomass:2,data:2},'Playing a module costs nothing');assert(![...g.p.hand,...g.p.inPlay,...g.p.discard].some(c=>c.id==='module'),'The module leaves the deck cycle');assert.deepEqual(plain(g.p.storage.map(c=>c.id)),['module'],'It is stored');assert.notEqual(g.a().activeSeat(),0,'Playing a module uses the Operations action');
 const h=game();h.p.hand=[{id:'free',key:'foldedWarehouse'}];h.p.resources={matter:0,energy:0,biomass:3,data:0};h.p.deck=[{id:'drawn',key:'move'}];h.p.discard=[];action(h,'special');assert.equal(h.p.resourceLimits.matter,6,'Folded Warehouse raises each limit by 2 once');assert.equal(h.p.resources.biomass,3);assert.equal(h.p.storagePurchases,0);assert(![...h.p.hand,...h.p.inPlay,...h.p.discard,...h.p.deck].some(c=>c.id==='free'),'Folded Warehouse is trashed after its use');assert(h.p.hand.some(c=>c.id==='drawn'));assert.equal(h.e.overflowPlayer(),-1);
}
{
 const g=game();g.p.resources={matter:3,energy:2,biomass:2,data:2};g.p.hand=[{key:'construct',id:'two',upgraded:true},{key:'construct',id:'fund',starter:true}];const yard=g.s.clusters[0].coords[1],other=g.s.clusters[0].coords[2];action(g,'build',a=>a.card==='two'&&a.coord===yard&&a.kind==='starbase');assert(!g.a().legalActions(0).some(a=>a.type==='increase_storage'),'No capacity purchase between builds');assert(g.s.pendingConstruct);action(g,'resource',a=>a.card==='fund');action(g,'second_build',a=>a.coord===other&&a.kind==='harvester');assert.equal(g.p.resources.matter,1);assert.equal(g.p.resources.energy,0);assert.equal(g.p.resources.data,0,'32.37: the Harvester costs Data, not Biomass');assert.equal(g.p.resources.biomass,1);assert.equal(g.p.storagePurchases,0);assert.equal(g.s.planets[other].upgrade,'harvester');
}
{
 const g=game();g.p.resources={matter:0,energy:2,biomass:0,data:0};g.p.hand=[{key:'move',id:'escape-move'}];g.s.fleets={'0,0':{0:{explorer:2}},'1,0':{1:{fleet:1}},'2,0':{0:{fleet:5}}};action(g,'move',a=>a.source==='0,0'&&a.destination==='1,0'&&a.moveGroup==='explorer');action(g,'combat_escape',a=>a.destination==='2,0'&&a.amount===2);assert.equal(g.s.fleets['2,0'][0].explorer,2);assert.equal(g.e.fleetCount(g.s.fleets['2,0'][0]),7);assert.equal(g.p.resources.energy,0);assert(!g.s.pendingCombat);
}
{
 const g=game();g.s.activePlayer=1;assert(g.e.offerTrade(1,{giveType:'matter',giveAmount:1,getType:'energy',getAmount:1}));g.s.activePlayer=0;g.p.resources={matter:4,energy:3,biomass:3,data:2};g.p.hand=[{key:'construct',id:'trade-two',upgraded:true}];const yard=g.s.clusters[0].coords[1];action(g,'build',a=>a.coord===yard&&a.kind==='starbase');const pending=JSON.stringify(g.s.pendingConstruct);assert(g.a().legalActions(0).some(a=>a.type==='trade_reject'));action(g,'trade_accept');assert.equal(JSON.stringify(g.s.pendingConstruct),pending);assert.equal(g.s.activePlayer,0);assert.equal(g.p.resources.matter,3);assert.equal(g.p.resources.energy,1);action(g,'second_build',a=>a.coord===yard&&a.kind==='fleet');assert.equal(g.s.fleets[yard][0].fleet,1);assert.equal(g.p.inPlay.filter(c=>c.id==='trade-two').length,1);
}
for(const [file,hash]of Object.entries(JSON.parse(read('scripts/streamlined-operations-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'Frozen 28.33/policy24: '+file);
console.log('Streamlined Operations: automatic caps/loss logging; full-cost optional two-build continuation; forged/wrong-seat/failed actions; unlimited stacks and fixed faction limits; passive enemy movement, production and capture; immutable28.33/policy24 passed.');
