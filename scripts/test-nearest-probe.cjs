const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(){
 const c=vm.createContext({});let e,seed=1729,calls=0;
 const src=read('prototypes/galactic-reach/app.js').replace('      clone, deckContents,','      runAiOperation, chooseAiMove, clone, deckContents,');vm.runInContext(read('prototypes/galactic-reach/adapter.js')+src,c);
 const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return f(x);};const a=c.createGalacticReach({headless:true,random:()=>{calls++;return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
 return {e,a,s:e.state,calls:()=>calls,fresh:()=>f(e)};
}
const distance=(a,b)=>{const [q,r]=a.split(',').map(Number),[x,y]=b.split(',').map(Number);return Math.max(Math.abs(q-x),Math.abs(r-y),Math.abs(q+r-x-y));};
function expected(g,source,id=0){return g.s.clusters.flatMap(c=>c.scannedBy.includes(id)?[]:c.coords.filter(k=>g.s.planets[k].special==='relic'&&!g.s.planets[k].relicClaimed).map(coord=>({coord,cluster:c.id}))).sort((a,b)=>distance(source,a.coord)-distance(source,b.coord)||a.cluster-b.cluster)[0];}
function setup(source='2,2',id=0){const g=game();g.s.activePlayer=id;g.s.phase='operations';g.s.fleets={[source]:{[id]:{explorer:1}}};g.s.players[id].hand=[{id:'probe',key:'probe'},{id:'probe2',key:'probe'}];return {...g,source,p:g.s.players[id]};}
for(const source of ['2,2','-9,0','-8,0']){
 const g=setup(source);if(source==='-8,0')Object.assign(g.s.planets[source],{owner:0,upgrade:'starbase',occupiedBy:null});
 const target=expected(g,source),resources=plain(g.p.resources),calls=g.calls(),before=JSON.stringify(g.s),others=[1,2,3].map(id=>plain({planets:g.a.observe(id).planets,clusters:g.a.observe(id).clusters}));
 assert(g.e.probeRelic(0,source,'probe',true));assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);
 const action=g.a.legalActions(0).find(a=>a.type==='probe'&&a.card==='probe');assert(action);assert.equal(action.coord,source);assert.deepEqual(Object.keys(action).sort(),['card','coord','key','type']);
 g.a.applyAction(0,action);assert(g.s.clusters[target.cluster].scannedBy.includes(0));assert(g.p.discard.some(c=>c.id==='probe'));assert.equal(g.s.fleets[source][0].explorer,1);assert.equal(g.s.activePlayer,1);assert.deepEqual(plain(g.p.resources),resources);assert.equal(g.calls(),calls);
 for(let i=0;i<3;i++)assert.deepEqual(plain({planets:g.a.observe(i+1).planets,clusters:g.a.observe(i+1).clusters}),others[i]);
 g.s.activePlayer=0;const next=expected(g,source);assert(next);assert(g.e.probeRelic(0,source,'probe2'));assert(g.s.clusters[next.cluster].scannedBy.includes(0),'Repeat from the same source finds another unlocated relic');
}
for(const tie of [false,true]){
 const g=setup('2,1'),far=g.s.clusters.find(c=>c.center==='6,-3'),near=g.s.clusters.find(c=>c.center==='3,3');
 for(const c of g.s.clusters)c.scannedBy=[0];
 for(const c of [far,near]){c.scannedBy=[];for(const at of c.coords)g.s.planets[at].special=null;}
 const a='5,-2',b=tie?'4,2':'4,3';assert(far.coords.includes(a)&&near.coords.includes(b));g.s.planets[a].special='relic';g.s.planets[b].special='relic';
 assert(distance(g.source,near.center)<distance(g.source,far.center));
 const wanted=tie?(far.id<near.id?far:near):far;
 if(tie)assert.equal(distance(g.source,a),distance(g.source,b));else assert(distance(g.source,a)<distance(g.source,b));
 assert(g.e.probeRelic(0,g.source,'probe'));assert(wanted.scannedBy.includes(0),'Probe ranks actual relic hexes and resolves ties deterministically');
}
{
 const g=setup(),moon=g.s.clusters.find(c=>c.kind==='moon');for(const c of g.s.clusters)c.scannedBy=c.id===moon.id?[]:[0];
 const terrain=JSON.stringify(moon.revealedBy);assert(g.e.probeRelic(0,g.source,'probe'));assert.equal(JSON.stringify(moon.revealedBy),terrain);assert(!g.e.clusterKnown(moon,0));
 const own=g.a.observe(0).planets[moon.center];assert(own.relicSignal&&own.unknown);assert(!('type' in own));assert(!g.a.observe(1).planets[moon.center]);assert(!g.s.log[0].includes(moon.name));assert(!g.s.log[0].includes(moon.center));
}
{
 const g=setup(),first=expected(g,g.source);g.s.planets[first.coord].relicClaimed=true;const second=expected(g,g.source);assert.notEqual(first.coord,second.coord);assert(g.e.probeRelic(0,g.source,'probe'));assert(g.s.clusters[second.cluster].scannedBy.includes(0));
}
{
 const g=setup();for(const c of g.s.clusters)c.scannedBy=[0];const before=JSON.stringify(g.s),calls=g.calls();assert(!g.e.probeRelic(0,g.source,'probe'));assert.equal(JSON.stringify(g.s),before);assert.equal(g.calls(),calls);assert(!g.a.legalActions(0).some(a=>a.type==='probe'));
}
{
 const g=setup();for(const bad of ['0,0','99,0','bad']){const before=JSON.stringify(g.s);assert(!g.e.probeRelic(0,bad,'probe'));assert.equal(JSON.stringify(g.s),before);}g.p.passed=true;assert(!g.e.probeRelic(0,g.source,'probe'));
}
{
 const a=setup(),b=setup();for(const g of [a,b])g.s.fleets['-2,2']={0:{explorer:1}};
 const site=expected(b,b.source);b.s.planets[site.coord].special=null;assert.deepEqual(plain(a.a.legalActions(0).filter(a=>a.type==='probe')),plain(b.a.legalActions(0).filter(a=>a.type==='probe')),'Legal source choices disclose no hidden target');
}
{
 const g=setup('2,2',1),target=expected(g,g.source,1);g.e.runAiOperation();assert(g.s.clusters[target.cluster].scannedBy.includes(1));assert(!g.s.clusters[target.cluster].scannedBy.includes(0));
 g.s.activePlayer=1;g.p.hand=[{id:'move',key:'move'}];const m=g.e.chooseAiMove(1,g.p.hand[0]);assert(m&&m.moveGroup==='explorer');assert.equal(m.goal,target.coord,'Rival follows its remote signal');
}
for(const [n,h] of Object.entries(JSON.parse(read('scripts/nearest-probe-archive-hashes.json')))){let s=read(n);if(n.endsWith('.rs'))s=s.slice(s.indexOf('#[derive(Clone, Copy, Debug)]')).trim();assert.equal(crypto.createHash('sha256').update(s).digest('hex'),h);}
console.log('Nearest Probe: empty/home/Shipyard origins, actual nearest distance, repeat/claimed/empty guards, private moon signals, atomic dry runs, no hidden legal payload, ordinary turn/card/unit accounting, rival use and preserved23.28/policy19 passed.');
