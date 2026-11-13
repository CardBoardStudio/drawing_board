const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(prefix='prototypes/galactic-reach/') {
 const c=vm.createContext({});let e,seed=1729,calls=0;
 const source=read(prefix+'app.js').replace('      clone, deckContents,','      runAiOperation, chooseAiMove, clone, deckContents,');
 vm.runInContext(read(prefix+'adapter.js')+source,c);const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
 const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 return {e,a,s:e.state,calls:()=>calls,fresh:()=>factory(e)};
}
function fixture(id=0) {
 const g=game(),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world),p=g.s.players[id];
 world.revealedBy=[0,1,2,3];g.s.activePlayer=id;g.s.phase='operations';p.hand=[{id:'probe',key:'probe'},{id:'dig',key:'excavate'}];p.resources={matter:1,energy:1,biomass:0,data:2};
 g.s.fleets={[site]:{[id]:{explorer:1,settler:0,fleet:0}}};
 return {...g,world,site,p};
}
const terrain=(g,id)=>plain({planets:g.a.observe(id).planets,clusters:g.a.observe(id).clusters});
{
 const g=fixture(),beforeOthers=[1,2,3].map(id=>terrain(g,id)),resources=plain(g.p.resources),calls=g.calls();
 assert(!g.e.excavate(0,g.site,'dig',g.s.relicRow[0].id,true),'An unlocated relic cannot be excavated');
 assert(!g.a.legalActions(0).some(a=>a.type==='excavate'));
 const action=g.a.legalActions(0).find(a=>a.type==='probe');assert(action);assert.equal(action.coord,g.world.center);
 g.a.applyAction(0,action);
 assert.deepEqual(plain(g.world.scannedBy),[0]);assert.equal(g.a.observe(0).planets[g.site].special,'relic');
 for(let i=0;i<3;i++)assert.deepEqual(terrain(g,i+1),beforeOthers[i],'Probe does not disclose its site to another player');
 assert.deepEqual(plain(g.p.resources),resources);assert.equal(g.calls(),calls);assert.equal(g.s.fleets[g.site][0].explorer,1);
 assert(!g.p.hand.some(c=>c.key==='probe'));assert(g.p.discard.some(c=>c.key==='probe'));assert(g.p.hand.some(c=>c.key==='excavate'));assert.equal(g.s.activePlayer,1);
 g.s.activePlayer=0;const a=g.fresh(),dig=a.legalActions(0).find(a=>a.type==='excavate');assert(dig);a.applyAction(0,dig);assert.equal(g.p.relicsExcavated,1);assert(!g.s.fleets[g.site]?.[0]?.explorer);
}
{
 const g=fixture();g.p.hand.push({id:'second-probe',key:'probe'});g.e.probeRelic(0,g.world.center,'probe');g.s.activePlayer=0;
 const before=JSON.stringify(g.s),calls=g.calls();assert(!g.e.probeRelic(0,g.world.center,'second-probe'));assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);
 assert(!g.fresh().legalActions(0).some(a=>a.type==='probe'));
}
{
 const full=fixture(),empty=fixture();empty.s.planets[empty.site].special=null;
 const targets=g=>plain(g.a.legalActions(0).filter(a=>a.type==='probe'));assert.deepEqual(targets(full),targets(empty),'Probe targets cannot disclose hidden contents');
 const command=empty.a.legalActions(0).find(a=>a.type==='probe');empty.a.applyAction(0,command);
 assert(empty.world.scannedBy.includes(0));assert(empty.p.discard.some(c=>c.key==='probe'));assert.equal(empty.s.activePlayer,1);
}
{
 const g=fixture();g.s.fleets={[g.s.clusters[0].center]:{0:{explorer:1}}};const before=JSON.stringify(g.s);
 assert(!g.e.probeRelic(0,g.world.center,'probe'));assert(!g.e.probeRelic(0,g.s.clusters[0].center,'probe'));assert.equal(JSON.stringify(g.s),before);
}
for(const kind of ['settler','explorer','fleet'])for(const type of ['world','moon']) {
 const g=game(),cluster=g.s.clusters.find(c=>c.kind===type&&c.id>=4),target=cluster.center,[q,r]=target.split(',').map(Number);
 const source=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]].map(([a,b])=>[q+a,r+b]).find(([a,b])=>Math.max(Math.abs(a),Math.abs(b),Math.abs(a+b))<=10).join(',');
 g.s.fleets={[source]:{0:{[kind]:1}}};g.s.players[0].hand=[{id:'move',key:'move'}];
 const a=g.fresh(),move=a.legalActions(0).find(x=>x.type==='move'&&x.source===source&&x.destination===target&&x.moveGroup===(kind==='explorer'?'explorer':'ships'));assert(move);a.applyAction(0,move);
 assert.deepEqual(plain(cluster.revealedBy),[0,1,2,3]);
 const site=g.e.relicCoordInCluster(cluster);for(let seat=0;seat<4;seat++){assert(g.e.clusterKnown(cluster,seat));assert.equal(a.observe(seat).planets[site].special,null,'Arrival reveals no relic to any seat');}
}
{
 const g=fixture(1);g.e.runAiOperation();assert(g.world.scannedBy.includes(1));assert(!g.world.scannedBy.includes(0));assert.equal(g.p.relicsExcavated,0);
 g.s.activePlayer=1;g.e.runAiOperation();assert.equal(g.p.relicsExcavated,1,'Browser rival probes before excavating');
}
{
 const g=game(),p=g.s.players[0],yard=g.s.clusters[0].coords[1];p.resources={matter:5,energy:5,biomass:1,data:5};p.storageUpgrades=3;p.hand=[{id:'build',key:'construct'}];
 assert(g.e.constructAt(0,yard,'starbase'));const before=p.hand.length;const a=g.fresh(),build=a.legalActions(0).find(x=>x.type==='build'&&x.kind==='explorer'&&x.coord===yard);assert(build);a.applyAction(0,build);
 assert(p.discard.some(c=>c.key==='probe'&&!c.starter));assert(p.discard.some(c=>c.key==='excavate'&&!c.starter));assert.equal(p.hand.length,before-1);
}
{
 const g=game(),p=g.s.players[0];p.hand=[{id:'astrolabe',key:'voidglassAstrolabe'}];
 g.e.resolveHumanSpecial(p.hand[0],g.e.ALL_CARDS.voidglassAstrolabe,0);
 assert.equal(g.s.clusters.filter(c=>c.id>=4&&c.scannedBy.length===4).length,2,'Astrolabe retains its explicit public discovery');
 const c=game(),q=c.s.players[0];q.hand=[{id:'chorus',key:'omniscientChorus'}];
 c.e.resolveHumanSpecial(q.hand[0],c.e.ALL_CARDS.omniscientChorus,0);
 const moon=c.s.clusters.find(x=>x.kind==='moon');assert(c.a.observe(0).planets[moon.center].relicSignal);assert(!c.a.observe(1).planets[moon.center]);
 assert(!c.e.clusterKnown(moon,0),'Chorus retains private discovery without revealing moon terrain');
}
const hashes=JSON.parse(read('scripts/probe-relics-archive-hashes.json')),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [name,h] of Object.entries(hashes.assets))assert.equal(hash(read('crates/galactic-reach/rules/v21-'+name)),h,'Frozen21.26 '+name);
const policy=read('crates/galactic-reach/src/legacy_v17.rs');assert.equal(hash(policy.slice(policy.indexOf('#[derive(Clone, Copy, Debug)]')).trim()),hashes.policy);
const old=game('crates/galactic-reach/rules/v21-');assert.equal(old.a.rulesVersion,'galactic-reach/21.26');assert(!old.e.BASIC_CARDS.probe);
console.log('Probe Relics: private discovery, no arrival signals, legal target privacy, invalid-action atomicity, card/turn accounting, empty searches, bundles, excavation gating, rival use and frozen21.26 passed.');
