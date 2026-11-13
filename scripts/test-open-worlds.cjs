// Public world information, private discoveries, randomized moons, and frozen 19.24.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),plain=x=>JSON.parse(JSON.stringify(x)),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function game(prefix='prototypes/galactic-reach/',seed=17){const c=vm.createContext({});vm.runInContext(read(prefix+'adapter.js')+read(prefix+'app.js').replace('      clone, deckContents,','      chooseAiMove, moonLayoutCount:()=>moonLayoutChoices.length, clone, deckContents,'),c);let e;const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};const a=c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});return{a,e,s:e.state,adapter:()=>factory(e)};}
function terrain(a,seat){const view=a.observe(seat);return plain({planets:view.planets,clusters:view.clusters});}
{
 const g=game();assert.equal(g.a.rulesVersion,'galactic-reach/25.30');assert.equal(g.s.version,25);assert.equal(g.s.rulesRevision,30);
 assert.equal(g.s.visibilityRevision,4);assert.equal(g.e.moonLayoutCount(),2225);assert.equal(g.s.clusters.length,17);
 for(let seat=0;seat<4;seat++){
  const view=g.a.observe(seat);assert.equal(Object.keys(view.planets).length,91);
  for(const world of g.s.clusters.filter(c=>c.kind==='world'))for(const key of world.coords){
   assert(g.e.clusterKnown(world,seat));assert.equal(view.planets[key].type,g.s.planets[key].type);assert.equal(view.planets[key].owner,g.s.planets[key].owner);assert.equal(view.planets[key].special,null);
  }
  for(const moon of g.s.clusters.filter(c=>c.kind==='moon')){assert(!view.planets[moon.center]);assert.equal(view.clusters[moon.id].center,null);assert.deepEqual(plain(view.clusters[moon.id].coords),[]);}
 }
 // Changing secrets cannot change the public observer or a rival's Explorer goal.
 g.s.fleets={[g.s.clusters[0].center]:{0:{settler:0,fleet:0,explorer:1}}};
 const before=[0,1,2,3].map(seat=>terrain(g.a,seat)),legal=plain(g.a.legalActions(0)),moon=g.s.clusters.find(c=>c.kind==='moon');
 const old=moon.center,candidates=['-10,4','-10,5','-9,4','-4,-6'];const next=candidates.find(key=>key!==old&&!g.s.planets[key]);assert(next);
 g.s.planets[next]={...g.s.planets[old],q:Number(next.split(',')[0]),r:Number(next.split(',')[1])};delete g.s.planets[old];moon.center=next;moon.coords=[next];
 const world=g.s.clusters[4],relic=g.e.relicCoordInCluster(world),other=world.coords.find(k=>k!==relic);
 g.s.planets[relic].special=null;g.s.planets[other].special='relic';
 const a=g.adapter();for(let seat=0;seat<4;seat++)assert.deepEqual(terrain(a,seat),before[seat],'Neither hidden moon locations nor relic sectors leak through the observer');
 assert.deepEqual(plain(a.legalActions(0)),legal,'Legal commands cannot encode hidden moon positions or relic sectors');
}
{
 const g=game(),world=g.s.clusters[4],site=g.e.relicCoordInCluster(world),before=terrain(g.a,1);
 world.scannedBy=[0];const a=g.adapter();assert.equal(a.observe(0).planets[site].special,'relic');assert.deepEqual(terrain(a,1),before);
 const moon=g.s.clusters.find(c=>c.kind==='moon');moon.scannedBy=[0];const scanned=g.adapter();
 assert.equal(scanned.observe(0).planets[moon.center].relicSignal,true);assert(!scanned.observe(1).planets[moon.center]);
 assert.equal(scanned.observe(0).clusters[moon.id].center,null,'A private signal does not expose a public moon record');
}
for(const kind of ['settler','explorer','fleet'])for(const terrainKind of ['world','moon']){
 const g=game(),cluster=g.s.clusters.find(c=>c.kind===terrainKind&&c.id>=4),target=cluster.center,[q,r]=target.split(',').map(Number),source=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]].map(([a,b])=>[q+a,r+b]).find(([a,b])=>Math.max(Math.abs(a),Math.abs(b),Math.abs(a+b))<=10).join(',');
 g.s.fleets={[source]:{0:{settler:0,explorer:0,fleet:0,[kind]:1}}};g.s.players[0].hand=[{key:'move',id:'survey-move'}];
 const a=g.adapter(),action=a.legalActions(0).find(x=>x.type==='move'&&x.source===source&&x.destination===target&&x.moveGroup===(kind==='explorer'?'explorer':'ships'));assert(action,`${kind} surveys ${terrainKind}`);
 a.applyAction(0,action);assert.deepEqual(plain(cluster.revealedBy),[0,1,2,3]);
 const site=g.e.relicCoordInCluster(cluster);assert(site);for(let seat=0;seat<4;seat++){assert(g.e.clusterKnown(cluster,seat));assert.equal(a.observe(seat).planets[site].special,null,'Terrain surveys do not locate relics');}
}
{
 const g=game(),id=1,source=g.s.clusters[id].center;g.s.fleets={[source]:{[id]:{settler:0,fleet:0,explorer:1}}};
 g.s.clusters[4].scannedBy=[id];
 const card={key:'move',id:'ai-survey'},before=plain(g.e.chooseAiMove(id,card)),survey=g.e.nearestUnscannedRelicCluster(id,true).id;assert(before);
 for(const world of g.s.clusters.filter(c=>c.kind==='world'&&c.id>=4&&!c.scannedBy.includes(id))){
  const site=g.e.relicCoordInCluster(world);if(!site)continue;const next=world.coords.find(c=>c!==site);g.s.planets[site].special=null;g.s.planets[next].special='relic';
 }
 assert.deepEqual(plain(g.e.chooseAiMove(id,card)),before,'A browser rival cannot aim at an unlocated relic sector');
 assert.equal(g.e.nearestUnscannedRelicCluster(id,true).id,survey,'Astrolabe targets public world centers, not hidden relic sectors');
}
{
 const first=game(),second=game();
 for(const g of [first,second]) {
  for(const c of g.s.clusters.filter(c=>c.kind==='world')){c.revealedBy=[0,1,2,3];for(const key of c.coords)g.s.planets[key].special=null;}
  g.s.fleets={[g.s.clusters[1].center]:{1:{settler:0,fleet:0,explorer:1}}};
 }
 const moon=second.s.clusters.find(c=>c.kind==='moon'),old=moon.center,next=['-10,4','-10,5','-9,4','-4,-6'].find(k=>!second.s.planets[k]);assert(next);
 second.s.planets[next]={...second.s.planets[old]};delete second.s.planets[old];moon.center=next;moon.coords=[next];
 assert.deepEqual(plain(first.e.chooseAiMove(1,{key:'move'})),plain(second.e.chooseAiMove(1,{key:'move'})),'Searching space cannot consult hidden moon positions');
}
const old=game('crates/galactic-reach/rules/v19-');assert.equal(old.a.rulesVersion,'galactic-reach/19.24');assert(!old.e.clusterKnown(old.s.clusters[4],0));assert(old.a.observe(0).planets[old.s.clusters[4].center].unknown);
const hashes=JSON.parse(read('scripts/open-worlds-archive-hashes.json'));
for(const [name,expected] of Object.entries(hashes.assets))assert.equal(hash(read('crates/galactic-reach/rules/v19-'+name)),expected,'Frozen19.24 '+name);
const policy=read('crates/galactic-reach/src/legacy_v15.rs').slice(read('crates/galactic-reach/src/legacy_v15.rs').indexOf('#[derive(Clone, Copy, Debug)]')).trim();assert.equal(hash(policy),hashes.policy);
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/19.24':{format:19,path:'/galactic-reach/rules/19.24/'}"));assert(read('prototypes/lab/replay.js').includes("'galactic-reach/19.24':'/galactic-reach/rules/19.24/'"));assert(read('scripts/build-web.sh').includes('dist/galactic-reach/rules/19.24'));
console.log('Open Worlds: 91 public world hexes, hidden moon coordinates and relic sectors, private signals, global ship surveys, information-limited AI, and immutable19.24/policy15 passed.');
