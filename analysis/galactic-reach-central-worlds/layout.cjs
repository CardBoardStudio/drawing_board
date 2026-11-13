// Simulation-only setup intervention. No gameplay RNG is consumed here.
const crypto=require('node:crypto');
const {seeded}=require('../galactic-reach-16.21/run.cjs');
const DIRECTIONS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const NEUTRAL_SLOTS=[[9,-9],[-9,9],[6,-3],[3,-6],[-3,-3],[-6,3],[-3,6],[3,3]];
const MOONS=[[-3,0],[0,-3],[3,0],[0,3]];
const key=coord=>coord.join(','),parse=coord=>coord.split(',').map(Number);
const distance=(a,b=[0,0])=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[0]+a[1]-b[0]-b[1]));
function shuffle(values,rng){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function relocate(state,seed){
 const rng=seeded((seed^0x63e7c0de)>>>0),slots=shuffle(NEUTRAL_SLOTS,rng),planets={},clusters=[];
 const originals=state.clusters.filter(c=>c.kind==='world'),moons=state.clusters.filter(c=>c.kind==='moon');
 if(originals.length!==12||moons.length!==4)throw Error('Expected the original 12-world/4-moon map');
 function move(cluster,center,id){
  const [oldQ,oldR]=parse(cluster.center),[q,r]=center;
  const coords=cluster.coords.map(coord=>{const [cq,cr]=parse(coord);const next=[cq-oldQ+q,cr-oldR+r],k=key(next);if(planets[k])throw Error('Terrain overlap at '+k);planets[k]={...state.planets[coord],q:next[0],r:next[1],cluster:id};return k;});
  clusters.push({...cluster,id,center:key(center),coords});
 }
 originals.forEach((c,i)=>move(c,i<4?parse(c.center):slots[i-4],i));
 const types=shuffle(['matter','energy','biomass','data','matter','energy','biomass'],rng),coords=[[0,0],...DIRECTIONS],numerals=['I','II','III','IV','V','VI','VII'];
 clusters.push({id:12,kind:'world',name:'Meridian',center:'0,0',coords:coords.map(key),scannedBy:[],revealedBy:[]});
 coords.forEach(([q,r],i)=>{const k=key([q,r]);if(planets[k])throw Error('Center overlap');planets[k]={q,r,cluster:12,name:`Meridian ${numerals[i]}`,type:types[i],special:null,owner:null,originalFounder:null,hasColony:false,upgrade:null,upgradeLevel:0,relicClaimed:false,occupiedBy:null,conquest:null};});
 moons.forEach((c,i)=>move(c,MOONS[i],13+i));
 state.planets=planets;state.clusters=clusters;
 return {worlds:clusters.filter(c=>c.kind==='world').map(c=>({id:c.id,center:c.center})),moons:MOONS.map(key)};
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function setupFingerprint(state){
 const {planets,clusters,...ordinary}=state;
 // Neutral relocation affects only terrain; fleets start on unchanged home centers.
 return digest({ordinary,homes:clusters.slice(0,4),homeTiles:clusters.slice(0,4).flatMap(c=>c.coords.map(k=>[k,planets[k]])),neutralTiles:clusters.filter(c=>c.kind==='world'&&c.id>=4&&c.id<12).map(c=>c.coords.map(k=>{const {q,r,cluster,...tile}=planets[k];return tile;})),moons:clusters.filter(c=>c.kind==='moon').map(c=>{const {q,r,cluster,...tile}=planets[c.coords[0]];return tile;})});
}
function validate(state){
 const worlds=state.clusters.filter(c=>c.kind==='world'),moons=state.clusters.filter(c=>c.kind==='moon');
 if(worlds.length!==13||moons.length!==4||Object.keys(state.planets).length!==95)throw Error('Incorrect terrain counts');
 const seen=new Set();
 for(const c of state.clusters){
  if(c.coords.length!==(c.kind==='moon'?1:7))throw Error('Malformed terrain');
  for(const coord of c.coords){const p=state.planets[coord];if(!p||p.cluster!==c.id||seen.has(coord)||distance(parse(coord))>10)throw Error('Invalid terrain '+coord);seen.add(coord);}
 }
 for(let i=0;i<worlds.length;i++)for(let j=i+1;j<worlds.length;j++)if(distance(parse(worlds[i].center),parse(worlds[j].center))<4)throw Error('Worlds too close');
 for(const m of moons){if(worlds.some(w=>distance(parse(m.center),parse(w.center))<3))throw Error('Moon too close to world');if(moons.some(n=>n!==m&&distance(parse(m.center),parse(n.center))<2))throw Error('Moons too close');}
 if(Object.values(state.planets).filter(p=>p.special==='relic').length!==12)throw Error('Changed relic supply');
 if(state.clusters[12].center!=='0,0'||state.clusters[12].coords.some(k=>state.planets[k].special))throw Error('Unexpected center site');
 return true;
}
module.exports={relocate,validate,setupFingerprint,digest,NEUTRAL_SLOTS,MOONS,distance};
