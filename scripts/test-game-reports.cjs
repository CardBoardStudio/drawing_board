// Scoring change, full prior-rules isolation, and immutable release assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const hashes={"app.js": "32d0b254a0e693598f1e38b23d09f9656f03f6ffb144692a47023ebc39cffaf6", "adapter.js": "7a691cc66a98d367ae2619af0d688879c493c87e54e240f7eeaa99ecf5f7e9c5", "index.html": "ff9d25a1baaec8f1385b5c1684d808d464a91ed542ef8f19180a093adef6fcd1", "styles.css": "5ce4316e504c3b0509a102d8201271fa361d9e078054462cd85fd9f84058c0e7", "rulebook.html": "a9f10a378c5cd92afa8b228997308d90730bbfeef074da3bca7756368457e6aa", "rulebook.css": "c89d7ff15fc902e2dda07d2ef54213e9ec09796a736c596dbc411c12fa5c1e5b", "replay.js": "7137b0fc33852d1dcc456432e6ffcddd6e0446189b2d37c03ceca925458c7d3c"};
for(const [asset,expected] of Object.entries(hashes))assert.equal(hash(read('crates/galactic-reach/rules/v18-'+asset)),expected,'Archived18.23 '+asset);
function load(prefix) {const c=vm.createContext({});vm.runInContext(read(prefix+'adapter.js')+read(prefix+'app.js'),c);let e;const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};const a=c.createGalacticReach({headless:true,random:()=>0});return {a,e,s:e.state};}
for(const [prefix,expected] of [['prototypes/galactic-reach/',3],['crates/galactic-reach/rules/v18-',5]]) {
 const {e,s}=load(prefix);s.players[0].cardsPurchased=16;
 s.clusters[0].coords.slice(1,5).forEach(coord=>Object.assign(s.planets[coord],{owner:0,upgrade:'starbase',upgradeLevel:1}));
 assert.equal(e.calculatePrestige(0),expected,'Shipyard/card Prestige changes only in the new rules');
 s.players[0].relicsExcavated=2;s.players[0].combatVictories=3;assert.equal(e.calculatePrestige(0),expected+(s.version>=23?7:5),'Permanent relic/combat Prestige remains');
 for(const cluster of s.clusters.slice(4,6))Object.assign(s.planets[cluster.center],{owner:0,hasColony:true});
 assert.equal(e.calculatePrestige(0),expected+(s.version>=23?13:8),'Two additional colonies follow the pinned scoring rules');
}
assert(!/Every eight purchased cards grant|Colonies, Shipyards, excavated relics, purchased cards/.test(read('prototypes/galactic-reach/index.html')),'Quick help must follow the new scoring');
const policy=read('crates/galactic-reach/src/legacy_v14.rs').slice(read('crates/galactic-reach/src/legacy_v14.rs').indexOf('#[derive(Clone, Copy, Debug)]')).trim();
assert.equal(hash(policy),'82e8134d9b712ebadfbd004b70150ce4af9110076dee31310fb54e8713cbdd2f');assert(policy.includes('gr-military/14'));
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/18.23':{format:18,path:'/galactic-reach/rules/18.23/'}"));
assert(read('prototypes/lab/replay.js').includes("'galactic-reach/18.23':'/galactic-reach/rules/18.23/'"));
assert(read('scripts/build-web.sh').includes('dist/galactic-reach/rules/18.23'));
assert(read('prototypes/galactic-reach/table.js').includes('save.gameHistory'));
console.log('Game Reports: zero Shipyard/card Prestige, retained colony/relic/combat sources, immutable18.23/policy14, and pinned routes passed.');
