const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function game(prefix='prototypes/galactic-reach/'){
 const c=vm.createContext({});let e,seed=1729;
 let app=read(prefix+'app.js').replace('      clone, deckContents,','      drawCards, useReaction, runAiOperation, runAiBuy, aiCards, clone, deckContents,');
 vm.runInContext(read(prefix+'adapter.js')+app,c);const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
 c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
 const s=e.state,p=s.players[0];Object.assign(s,{phase:'operations',activePlayer:0});Object.assign(p,{hand:[],deck:[],discard:[],resources:{matter:20,energy:20,biomass:20,data:20},storageUpgrades:20});
 return {e,s,p,adapter:()=>factory(e)};
}
const card=(key,id=key)=>({key,id});const all=p=>[...p.hand,...p.deck,...p.discard,...(p.inPlay||[])];
function action(g,type,id,extra=()=>true){const a=g.adapter();const x=a.legalActions(0).find(x=>x.type===type&&(!id||x.card===id)&&extra(x));assert(x,`Missing ${type} for ${id}`);a.applyAction(0,x);}
{
 const g=game(),{e,p,s}=g;const echo=Object.keys(e.ALL_CARDS).find(k=>e.ALL_CARDS[k].tag==='alienEchoes');
 p.hand=[card('move','converted'),card('construct','built'),card(echo,'draw-order')];p.deck=[card('move','draw-one')];p.discard=[card('construct','draw-two'),card('move','draw-three')];
 action(g,'resource','converted');action(g,'build','built',a=>a.kind==='harvester');
 assert.deepEqual(Array.from(p.inPlay,c=>c.id),['converted','built']);
 s.activePlayer=0;action(g,'special','draw-order');
 assert.deepEqual(Array.from(p.hand,c=>c.id).sort(),['draw-one','draw-three','draw-two']);
 assert.deepEqual(Array.from(p.inPlay,c=>c.id),['converted','built','draw-order']);assert.equal(p.discard.length,0);
 assert.equal(new Set(all(p).map(c=>c.id)).size,6);assert.equal(all(p).length,6);
 const view=g.adapter().observe(1);assert.deepEqual(Array.from(view.players[0].inPlay,c=>c.id),['converted','built','draw-order']);assert.equal(view.players[0].hand,undefined,'Unplayed hand stays private');
}
{
 const g=game(),{p,e}=g;p.hand=[card('tacticalForesight','played-first'),card('move','explicit-discard')];p.deck=[card('move','a')];p.discard=[card('construct','b'),card('move','c')];
 action(g,'special','played-first');assert(p.inPlay.some(c=>c.id==='played-first'));assert(p.discard.some(c=>c.id==='explicit-discard'));assert(!p.hand.some(c=>c.id==='played-first'));
 e.drawCards(p,1);assert(p.hand.some(c=>c.id==='explicit-discard'),'An explicit discard can be redrawn');assert(!p.hand.some(c=>c.id==='played-first'),'The played draw card cannot recycle itself');
}
{
 const g=game(),{p}=g;p.hand=[card('commandUplink','recover')];p.inPlay=[card('move','already-used')];p.discard=[card('construct','discarded')];action(g,'special','recover');
 assert(p.hand.some(c=>c.id==='discarded'));assert(p.inPlay.some(c=>c.id==='already-used'));assert(p.inPlay.some(c=>c.id==='recover'));
}
{
 const g=game(),{p}=g;p.hand=[card('dataBrokerage','broker')];p.inPlay=[card('move','protected')];p.discard=[card('construct','trashed'),card('move','drawn')];action(g,'special','broker');
 assert(!all(p).some(c=>c.id==='trashed'));assert(p.inPlay.some(c=>c.id==='protected'));assert(p.inPlay.some(c=>c.id==='broker'));assert(p.hand.some(c=>c.id==='drawn'));
}
{
 const g=game(),{p,e}=g;p.hand=[card('ablativePlating','reaction')];assert(e.useReaction(0,'prevent'));assert.equal(p.hand.length,0);assert(p.inPlay.some(c=>c.id==='reaction'));e.drawCards(p,3);assert.equal(p.hand.length,0);assert.equal(e.useReaction(0,'prevent'),null,'A used reaction cannot trigger again');
}
{
 const g=game(),{p,s}=g;p.hand=[card('move','converted'),card('procurementNetwork','buy-card'),card('construct','unplayed')];
 action(g,'resource','converted');action(g,'pass');action(g,'buy_effect','buy-card');
 assert.equal(p.inPlay.length,2);assert.equal(p.discard.length,0);
 assert(!g.adapter().legalActions(0).some(a=>['upgrade','decommission'].includes(a.type)&&a.card==='converted'));
 p.relicsExcavated=10;action(g,'finish_buy');assert.equal(p.inPlay.length,2,'Finishing your Buy does not clean up your cards');assert.equal(p.hand.length,1);
 for(let seat=1;seat<4;seat++){let a=g.adapter();a.applyAction(seat,a.legalActions(seat).find(x=>x.type==='pass'));a=g.adapter();a.applyAction(seat,a.legalActions(seat).find(x=>x.type==='finish_buy'));}
 assert.equal(s.winner,0);assert.equal(p.hand.length,0);assert.equal(p.inPlay.length,0);assert.deepEqual(Array.from(p.discard,c=>c.id).sort(),['buy-card','converted','unplayed']);
}
{
 const g=game(),{p,s,e}=g;p.hand=[];s.activePlayer=1;const bot=s.players[1];Object.assign(bot,{hand:[card('move','bot-convert')],deck:[],discard:[],inPlay:[]});e.runAiOperation();assert(bot.inPlay.some(c=>c.id==='bot-convert'),'Browser rivals also retain conversions in play');
}
{
 const g=game('crates/galactic-reach/rules/v26-');g.p.hand=[card('move','old-convert')];action(g,'resource','old-convert');assert(g.p.discard.some(c=>c.id==='old-convert'));assert(!('inPlay' in g.p),'26.31 keeps its original zones');
}
for(const [file,hash] of Object.entries(JSON.parse(read('scripts/in-play-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
console.log('Cards in play: conversions/orders, pre-effect draw commitment, explicit discards, recovery/trashing isolation, public/private observations, reactions, Buy timing, shared cleanup, rival conversions and frozen26.31/policy22 passed.');
