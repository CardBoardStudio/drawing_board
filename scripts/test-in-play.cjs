const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function game(prefix='prototypes/galactic-reach/'){
 const c=vm.createContext({});let e,seed=1729;
 let app=read(prefix+'app.js').replace('      clone, deckContents,',`      drawCards, useReaction, runAiOperation, runAiBuy, aiCards, ${['prototypes/galactic-reach/','crates/galactic-reach/rules/v37-'].includes(prefix)?'aiArchivePurgeChoice, ':''}clone, deckContents,`);
 vm.runInContext(read(prefix+'adapter.js')+app,c);const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
 c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
 const s=e.state,p=s.players[0];Object.assign(s,{phase:'operations',activePlayer:0});Object.assign(p,{hand:[],deck:[],discard:[],resources:{matter:20,energy:20,biomass:20,data:20},storageUpgrades:20,resourceLimits:{matter:1000,energy:1000,biomass:1000,data:1000}});
 return {e,s,p,adapter:()=>factory(e)};
}
const card=(key,id=key)=>({key,id});const all=p=>[...p.hand,...p.deck,...p.discard,...(p.inPlay||[])];
function action(g,type,id,extra=()=>true){const a=g.adapter();const x=a.legalActions(0).find(x=>x.type===type&&(!id||x.card===id)&&extra(x));assert(x,`Missing ${type} for ${id}`);a.applyAction(0,x);}
{
 const g=game(),{e,p,s}=g; // Draw four with only three available cards must not redraw cards In play.
 p.hand=[{...card('move','converted'),starter:true},card('construct','built'),card('commandNexus','draw-order')];p.deck=[card('move','draw-one')];p.discard=[card('construct','draw-two'),card('move','draw-three')];
 action(g,'resource','converted');action(g,'build','built',a=>a.kind==='harvester');
 assert.deepEqual(Array.from(p.inPlay,c=>c.id),['converted','built']);
 s.activePlayer=0;action(g,'special','draw-order');
 assert.deepEqual(Array.from(p.hand,c=>c.id).sort(),['draw-one','draw-three','draw-two']);
 assert.deepEqual(Array.from(p.inPlay,c=>c.id),['converted','built','draw-order']);assert.equal(p.discard.length,0);
 assert.equal(new Set(all(p).map(c=>c.id)).size,6);assert.equal(all(p).length,6);
 const view=g.adapter().observe(1);assert.deepEqual(Array.from(view.players[0].inPlay,c=>c.id),['converted','built','draw-order']);assert.equal(view.players[0].hand,undefined,'Unplayed hand stays private');
}
{
 // Tactical Foresight, Command Uplink and Data Brokerage left the market in 31.36; their timing stays in 30.35.
 const g=game('crates/galactic-reach/rules/v30-'),{p,e}=g;p.hand=[card('tacticalForesight','played-first'),card('move','explicit-discard')];p.deck=[card('move','a')];p.discard=[card('construct','b'),card('move','c')];
 action(g,'special','played-first');assert(p.inPlay.some(c=>c.id==='played-first'));assert(p.discard.some(c=>c.id==='explicit-discard'));assert(!p.hand.some(c=>c.id==='played-first'));
 e.drawCards(p,1);assert(p.hand.some(c=>c.id==='explicit-discard'),'An explicit discard can be redrawn');assert(!p.hand.some(c=>c.id==='played-first'),'The played draw card cannot recycle itself');
}
{
 const g=game('crates/galactic-reach/rules/v30-'),{p}=g;p.hand=[card('commandUplink','recover')];p.inPlay=[card('move','already-used')];p.discard=[card('construct','discarded')];action(g,'special','recover');
 assert(p.hand.some(c=>c.id==='discarded'));assert(p.inPlay.some(c=>c.id==='already-used'));assert(p.inPlay.some(c=>c.id==='recover'));
}
{
 const g=game('crates/galactic-reach/rules/v30-'),{p}=g;p.hand=[card('dataBrokerage','broker')];p.inPlay=[card('move','protected')];p.discard=[card('construct','trashed'),card('move','drawn')];action(g,'special','broker');
 assert(!all(p).some(c=>c.id==='trashed'));assert(p.inPlay.some(c=>c.id==='protected'));assert(p.inPlay.some(c=>c.id==='broker'));assert(p.hand.some(c=>c.id==='drawn'));
}
{
 // Retired Archive Purge (N17): preserve its discard-only trash timing in the frozen engine.
 const g=game('crates/galactic-reach/rules/v37-'),{p}=g;p.hand=[card('archivePurge','purge')];p.inPlay=[{key:'move',id:'protected',starter:true}];
 p.discard=[{key:'construct',id:'trash-1',starter:true},{key:'move',id:'kept',starter:true,upgraded:true},{key:'move',id:'trash-2',starter:true},{key:'construct',id:'third',starter:true}];
 const choices=g.adapter().legalActions(0).filter(x=>x.type==='special'&&x.card==='purge').map(x=>Array.from(x.trash));
 assert.equal(choices.length,7,'None, one of three, or two of three (discard order)');
 assert(choices.every(t=>!t.includes('kept')&&!t.includes('protected')),'Upgraded starters and cards in play are never offered');
 assert(choices.some(t=>t.length===0),'Trashing none is a choice');
 assert(!choices.some(t=>t.join()==='third,trash-2'),'One spelling per choice: discard order');
 action(g,'special','purge',x=>x.trash.join()==='trash-2,third');
 assert(!all(p).some(c=>['trash-2','third'].includes(c.id)),'The chosen starters are trashed');
 assert(all(p).some(c=>c.id==='kept')&&all(p).some(c=>c.id==='trash-1'),'Unchosen and upgraded starters stay');
 assert(p.inPlay.some(c=>c.id==='protected')&&p.inPlay.some(c=>c.id==='purge'));assert.equal(p.hand.length,1,'Then draw one');
}
{
 // Without a choice the order is refused and the card stays in hand; trashing none still draws.
 const g=game('crates/galactic-reach/rules/v37-'),{e,p}=g;p.hand=[card('archivePurge','purge')];p.deck=[card('move','next')];p.discard=[{key:'move',id:'m',starter:true}];
 assert.equal(e.resolveHumanSpecial(p.hand[0],e.ALL_CARDS.archivePurge,0,null),false);assert(p.hand.some(c=>c.id==='purge'));
 assert.equal(e.resolveHumanSpecial(p.hand[0],e.ALL_CARDS.archivePurge,0,['m','m']),false,'No duplicates');
 action(g,'special','purge',x=>x.trash.length===0);assert(p.discard.some(c=>c.id==='m'));assert(p.hand.some(c=>c.id==='next'));
}
{
 // Browser rivals trash only surplus starters: they keep 3 Move-order and 2 Construct-order cards.
 const g=game('crates/galactic-reach/rules/v37-'),{e,p}=g,choose=()=>Array.from(e.aiArchivePurgeChoice(0,2));
 p.hand=[];p.deck=[];p.inPlay=[];p.discard=[{key:'move',id:'m1',starter:true},{key:'construct',id:'c1',starter:true},{key:'move',id:'m2',starter:true},{key:'construct',id:'c2',starter:true}];
 assert.deepEqual(choose(),[],'Two of each: nothing to spare');
 p.deck=[{key:'move',id:'m3',starter:true},{key:'move',id:'m4',starter:true},{key:'construct',id:'c3',starter:true}];
 assert.deepEqual(choose(),['m1','c1'],'One surplus Move and one surplus Construct');
 p.deck.push({key:'ionThrusters',id:'ion'},{key:'slipstreamCharts',id:'slip'});
 assert.deepEqual(choose(),['m1','c1'],'At most two');
}
{
 const g=game('crates/galactic-reach/rules/v37-'),{p,e}=g;p.hand=[card('aegisOfSilentArchitects','reaction')];assert(e.useReaction(0,'prevent'));assert.equal(p.hand.length,0);assert(p.inPlay.some(c=>c.id==='reaction'));e.drawCards(p,3);assert.equal(p.hand.length,0);assert.equal(e.useReaction(0,'prevent'),null,'A used reaction cannot trigger again');
}
{
 const g=game(),{p,s}=g;p.hand=[{...card('move','converted'),starter:true},card('procurementHub','buy-card'),card('construct','unplayed')];
 action(g,'resource','converted');action(g,'pass');action(g,'buy_effect','buy-card');
 assert.equal(p.inPlay.length,2);assert.equal(p.discard.length,0);
 // 28.33 amendment (#buy): a card in play when Buy began may be trashed; one put in play during this Buy may not.
 assert(g.adapter().legalActions(0).some(a=>a.type==='decommission'&&a.card==='converted'),'A card converted before passing can be trashed during Buy');
 assert(!g.adapter().legalActions(0).some(a=>a.type==='decommission'&&a.card==='buy-card'),'A Buy effect used this Buy turn cannot be trashed');
 assert(g.adapter().legalActions(0).some(a=>a.type==='upgrade'&&a.card==='converted'),'The converted original starter can upgrade in Buy');
 p.relicsExcavated=20;action(g,'finish_buy');assert.equal(p.inPlay.length,2,'Finishing your Buy does not clean up your cards');assert.equal(p.hand.length,1);
 for(let seat=1;seat<4;seat++){let a=g.adapter();a.applyAction(seat,a.legalActions(seat).find(x=>x.type==='pass'));a=g.adapter();a.applyAction(seat,a.legalActions(seat).find(x=>x.type==='finish_buy'));}
 assert.equal(s.winner,0);assert.equal(p.hand.length,0);assert.equal(p.inPlay.length,0);assert.deepEqual(Array.from(p.discard,c=>c.id).sort(),['buy-card','converted','unplayed']);
}
{
 // 28.33 amendment (#buy): upgrade and trash original starters that are in play.
 const g=game(),{p,s}=g;p.hand=[{key:'move',id:'used-move',starter:true},{key:'construct',id:'used-construct',starter:true}];
 action(g,'resource','used-move');action(g,'resource','used-construct');action(g,'pass');assert.equal(s.phase,'buy');
 assert.deepEqual(Array.from(p.inPlay,c=>c.id),['used-move','used-construct']);
 action(g,'upgrade','used-move',a=>a.resource==='energy');assert.equal(p.inPlay.find(c=>c.id==='used-move').upgraded,true,'The starter upgrades where it is, in play');
 const before=p.resources.matter;action(g,'decommission','used-construct',a=>a.resource==='matter');
 assert(!all(p).some(c=>c.id==='used-construct'),'Trashing removes the in-play card permanently');assert.equal(p.resources.matter,before-3);
 assert(p.inPlay.some(c=>c.id==='used-move'));
}
{
 const g=game(),{p,s,e}=g;p.hand=[];s.activePlayer=1;const bot=s.players[1];Object.assign(bot,{hand:[{...card('move','bot-convert'),starter:true}],deck:[],discard:[],inPlay:[]});e.runAiOperation();assert(bot.inPlay.some(c=>c.id==='bot-convert'),'Browser rivals also retain conversions in play');
}
{
 const g=game('crates/galactic-reach/rules/v26-');g.p.hand=[card('move','old-convert')];action(g,'resource','old-convert');assert(g.p.discard.some(c=>c.id==='old-convert'));assert(!('inPlay' in g.p),'26.31 keeps its original zones');
}
const replayRoutes=vm.runInNewContext('('+read('prototypes/lab/replay.js').match(/const REPLAY_PATHS=(.*);/)[1]+')');
assert.equal(replayRoutes['galactic-reach/26.31'],'/galactic-reach/rules/26.31/','Pinned replay opens its archived browser');
assert.equal(replayRoutes['galactic-reach/27.32'],'/galactic-reach/rules/27.32/','27.32 replay opens its archived In play browser');
{
 // 30.35 #computer-rivals: browser rivals also upgrade a starter that is in play during Buy.
 const g=game(),{s,e}=g;const bot=s.players[1];s.phase='buy';s.activePlayer=1;
 Object.assign(bot,{hand:[],deck:[],discard:[],inPlay:[{key:'construct',id:'bot-used',starter:true}],resources:{matter:4,energy:4,biomass:4,data:4},buyStartDiscardIds:[],buyStartInPlayIds:['bot-used'],passed:true});
 const yard=Object.keys(s.planets)[0];Object.assign(s.planets[yard],{owner:1,upgrade:'starbase',occupiedBy:null});
 e.runAiBuy();assert.equal(bot.inPlay.find(c=>c.id==='bot-used')?.upgraded,true,'A rival upgraded its in-play starter');
}
// 30.35 archives the exact published 29.34 engine; there, cards in play still cannot upgrade or be trashed.
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/in-play-buy-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} must stay the published 29.34 asset`);
{
 const g=game('crates/galactic-reach/rules/v29-'),{p,s}=g;assert.equal(g.adapter().rulesVersion,'galactic-reach/29.34');
 p.hand=[{key:'move',id:'old-used',starter:true},{key:'construct',id:'old-kept',starter:true}];action(g,'resource','old-used');action(g,'pass');assert.equal(s.phase,'buy');
 const legal=g.adapter().legalActions(0);
 assert(!legal.some(a=>['upgrade','decommission'].includes(a.type)&&a.card==='old-used'),'29.34 tables keep the published Buy rule');
 assert(legal.some(a=>a.type==='upgrade'&&a.card==='old-kept'),'29.34 still upgrades from hand');
}
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/in-play-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
console.log('Cards in play: conversions/orders, pre-effect draw commitment, explicit discards, recovery/trashing isolation, public/private observations, reactions, Buy timing, shared cleanup, rival conversions and frozen26.31/policy22 passed.');

assert.equal(replayRoutes['galactic-reach/28.33'],'/galactic-reach/rules/28.33/');

assert.equal(replayRoutes['galactic-reach/29.34'],'/galactic-reach/rules/29.34/','29.34 replay opens its archived browser');
// 31.36 archives the exact 30.35 engine: its five-card market, basic purchases and 20-point target stay.
assert.equal(replayRoutes['galactic-reach/30.35'],'/galactic-reach/rules/30.35/','30.35 replay opens its archived browser');
// 32.37 archives the exact 31.36 engine: original card prices, Harvester 1, 2 starting Biomass.
assert.equal(replayRoutes['galactic-reach/31.36'],'/galactic-reach/rules/31.36/','31.36 replay opens its archived browser');assert.equal(replayRoutes['galactic-reach/33.38'],'/galactic-reach/rules/33.38/');
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/cheaper-cards-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} must stay the published 31.36 asset`);
{
 const g=game('crates/galactic-reach/rules/v31-'),{e,s}=g;assert.equal(g.adapter().rulesVersion,'galactic-reach/31.36');
 assert.deepEqual(JSON.parse(JSON.stringify(e.ALL_CARDS.dysonLattice.cost)),{energy:12,matter:6,data:4},'31.36 keeps its card prices');
 assert.deepEqual(JSON.parse(JSON.stringify(e.SHIP_STATS.settler.cost)),{matter:1,energy:1});
}
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/capacity-cards-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} must stay the published 30.35 asset`);
{
 const g=game('crates/galactic-reach/rules/v30-'),{p,s}=g;assert.equal(g.adapter().rulesVersion,'galactic-reach/30.35');assert.equal(s.market.length,5);assert.equal(s.victoryTarget,undefined);
 p.hand=[];action(g,'pass');assert(g.adapter().legalActions(0).some(a=>a.type==='buy'&&a.source==='basic'),'30.35 tables still sell basic cards');
}
{
 const g=game(),{s}=g;assert.equal(g.adapter().rulesVersion,'galactic-reach/39.44');assert.equal(s.market.length,9,'The tiered market shows three cards in each of three price rows');assert.equal(s.victoryTarget,30);
}

// 33.38 preserves the exact published 32.37 whole-group engine and client assets.
assert.equal(replayRoutes['galactic-reach/32.37'],'/galactic-reach/rules/32.37/');
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/split-moves-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} must stay the published 32.37 asset`);
// 34.39 preserves the exact published 33.38 Split Moves engine and client assets.
assert.equal(replayRoutes['galactic-reach/33.38'],'/galactic-reach/rules/33.38/');
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/balance-package-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,`${file} must stay the published 33.38 asset`);

// #buy: hand cards join Decommission (CI runs that suite through this in-play Buy suite).
require('./test-trash-hand.cjs');
