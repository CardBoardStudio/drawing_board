// Runs the unmodified Galactic Reach app.js against a minimal fake DOM, so the real startup,
// save-migration, and round-end dialog paths execute exactly as they do in the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CURRENT_ENGINE = '../prototypes/galactic-reach/';
// Cards removed from the 31.36 market (Trade Consortium, Salvage Crews) keep their dialogs in
// the exact 30.35 archive; archived(...) runs a test body against those archived assets.
const ARCHIVED_30 = '../crates/galactic-reach/rules/v30-';
let sourcePath, adapterSource, source, indexHtml, formatVersion, SAVE_KEY, TURN_HISTORY_KEY, HISTORY_KEY, CURRENT_RULES_REVISION;
function useEngine(prefix) {
  sourcePath = path.resolve(__dirname, `${prefix}app.js`);
  adapterSource = fs.readFileSync(path.resolve(__dirname, `${prefix}adapter.js`), 'utf8');
  source = fs.readFileSync(sourcePath, 'utf8');
  indexHtml = fs.readFileSync(path.resolve(__dirname, `${prefix}index.html`), 'utf8');
  formatVersion = Number(source.match(/const SAVE_FORMAT_VERSION = (\d+);/)[1]);
  SAVE_KEY = `galactic-reach-save-v${formatVersion}`;
  TURN_HISTORY_KEY = `galactic-reach-turn-history-v${formatVersion}`;
  HISTORY_KEY = `galactic-reach-history-v${formatVersion}`;
  CURRENT_RULES_REVISION = Number(source.match(/const RULES_REVISION = (\d+);/)[1]);
}
useEngine(CURRENT_ENGINE);
function archived(body) {
  return () => { useEngine(ARCHIVED_30); try { body(); } finally { useEngine(CURRENT_ENGINE); } };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

function createTimers() {
  let queue = [];
  let serial = 0;
  let now = 0;
  return {
    setTimeout(fn, delay = 0) {
      serial += 1;
      queue.push({ id: serial, at: now + delay, fn });
      return serial;
    },
    clearTimeout(id) {
      queue = queue.filter(timer => timer.id !== id);
    },
    run(limit = 5000) {
      for (let count = 0; queue.length; count += 1) {
        assert.ok(count < limit, 'timers kept rescheduling; the game never waited for the human');
        queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const timer = queue.shift();
        now = timer.at;
        timer.fn();
      }
    }
  };
}

function fire(target, type, { cancelable = false, key } = {}) {
  const event = {
    type, key, target, currentTarget: target, cancelable, defaultPrevented: false,
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  };
  (target.listeners[type] || []).forEach(listener => listener(event));
  return event;
}

function createDom(timers) {
  const byId = new Map();
  const queried = new Map();
  const created = [];

  class FakeElement {
    constructor(tag = 'div', id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.listeners = {};
      this.style = { setProperty() {} };
      this.dataset = {};
      this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
      this.innerHTML = '';
      this.textContent = '';
      this.value = '';
      this.hidden = false;
      this.disabled = false;
      this.options = [];
      this.open = false;
      this.elements = new Proxy({}, { get: (fields, name) => (fields[name] ??= new FakeElement('input')) });
    }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    querySelector(selector) { return (this.childQueries ||= new Map()).get(selector) || (this.childQueries.set(selector,new FakeElement()),this.childQueries.get(selector)); }
    querySelectorAll() { return []; }
    appendChild(child) { return child; }
    insertAdjacentHTML(_, html) { this.innerHTML += html; }
    setAttribute(key,value) { (this.attributes ||= {})[key]=String(value); }
    getAttribute(key) { return this.attributes?.[key] ?? null; }
    matches() { return false; }
    contains() { return false; }
    showPopover() {}
    hidePopover() {}
    remove() {}
    focus() {this.focused=true;}
    scrollIntoView() {this.scrolledIntoView=true;}
    click() { if(!this.disabled)fire(this, 'click'); }
    // Dialog semantics: showModal on an open dialog throws, and close fires asynchronously.
    showModal() {
      if (this.open) throw new Error(`${this.id} is already open`);
      this.open = true;
    }
    close() {
      if (!this.open) return;
      this.open = false;
      timers.setTimeout(() => fire(this, 'close'), 0);
    }
  }

  function element(id) {
    if (!byId.has(id)) byId.set(id, new FakeElement(id.endsWith('-dialog') ? 'dialog' : 'div', id));
    return byId.get(id);
  }

  // Buttons rendered through innerHTML (directive choices, market cards) are found by data attribute.
  function byDataAttribute(selector) {
    const attribute = selector.slice(1, -1);
    const key = attribute.slice('data-'.length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const pattern = new RegExp(`${attribute}="([^"]*)"`, 'g');
    const found = [...byId.values()].flatMap(parent => [...parent.innerHTML.matchAll(pattern)].map(match => {
      const button = new FakeElement('button');
      button.dataset[key] = match[1];
      const tag=parent.innerHTML.slice(parent.innerHTML.lastIndexOf('<',match.index),parent.innerHTML.indexOf('>',match.index)+1);
      for(const [,name,value] of tag.matchAll(/data-([a-z-]+)="([^"]*)"/g))button.dataset[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
      button.disabled=/\sdisabled(?:\s|>|=)/.test(tag);
      return button;
    }));
    queried.set(selector, found);
    return found;
  }

  const controls=(pattern,dataName)=>[...indexHtml.matchAll(pattern)].map(match=>{
    const tag=match[0],id=tag.match(/\bid="([^"]+)"/)[1],node=element(id);
    if(!node.dataset[dataName]) {
      node.dataset[dataName]=match[1];node.hidden=/\shidden(?:\s|>)/.test(tag);
      for(const attr of ['role','aria-selected','aria-controls','aria-labelledby']) {const value=tag.match(new RegExp(attr+'="([^"]+)"'));if(value)node.setAttribute(attr,value[1]);}
      node.tabIndex=Number(tag.match(/tabindex="([^"]+)"/)?.[1] || 0);
    }
    return node;
  });
  const tabs=controls(/<button[^>]*data-tab="([^"]+)"[^>]*>/g,'tab');
  const panels=controls(/<div[^>]*data-panel="([^"]+)"[^>]*>/g,'panel');

  const document = {
    body: new FakeElement('body'),
    documentElement: { clientWidth: 1280 },
    addEventListener() {},
    createElement: tag => {const e=new FakeElement(tag);created.push(e);return e;},
    querySelector: selector => (selector.startsWith('#') ? element(selector.slice(1)) : selector.startsWith('.hex[data-coord=') ? created.find(e=>e.dataset.coord===selector.match(/"([^"]+)"/)[1]) : null),
    querySelectorAll: selector => (selector==='.console-tab'||selector==='.console-tab[data-tab]'?tabs:selector==='.tab-panel'?panels:selector==='.hex'?created.filter(e=>e.dataset.coord):/^\[data-[a-z-]+\]$/.test(selector) ? byDataAttribute(selector) : [])
  };
  return { document, element, tabs, panels, toasts:()=>created.filter(e=>e.className==='toast').map(e=>e.textContent), contextButton:label=>created.filter(e=>e.tagName==='BUTTON'&&(e.textContent===label||e.getAttribute?.('aria-label')===label||e.innerHTML===label||e.innerHTML.startsWith(`<span>${label}</span>`))).at(-1), hex:key=>created.find(e=>e.dataset.coord===key), lastQuery: selector => queried.get(selector) || [] };
}

function boot(storage, seed = 20261013, location = {hostname:'localhost',search:''}, engineOptions = {}) {
  const timers = createTimers();
  const dom = createDom(timers);
  const errors = [];
  const downloads = [];
  let randomCalls = 0;
  const math = Object.create(Math);
  const nextRandom = seededRandom(seed);
  math.random = () => {randomCalls++;return nextRandom();};
  const context = vm.createContext({
    Math: math, URLSearchParams, location, drawingBoardTableBoot:true,
    Blob:class {constructor(parts){this.text=parts.join('');}},
    URL:{createObjectURL:blob=>{downloads.push(JSON.parse(blob.text));return 'blob:test-report';},revokeObjectURL(){}},
    document: dom.document,
    window: { innerHeight: 900, addEventListener() {} },
    localStorage: storage,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    confirm: () => true,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) }
  });
  vm.runInContext(`${adapterSource}\n${source}`, context, { filename: sourcePath });
  const client=context.createGalacticReach(engineOptions);
  const game = {
    dom, downloads, randomCalls:()=>randomCalls, sync:view=>client.sync(view),
    dialog: name => dom.element(`${name}-dialog`),
    saved: () => JSON.parse(storage.getItem(SAVE_KEY)),
    // Every timer the game queues is drained, so AI turns run until the human must act.
    settle() {
      timers.run();
      assert.deepEqual(errors, [], 'the game logged an error');
      return game;
    },
    click(id) { dom.element(id).click(); return game.settle(); },
    // Escape fires a cancelable cancel event and closes the dialog only if nothing prevents it.
    pressEscape(name) {
      const dialog = game.dialog(name);
      if (!fire(dialog, 'cancel', { cancelable: true }).defaultPrevented) dialog.close();
      return game.settle();
    }
  };
  return game.settle();
}

function writeSave(storage, state) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

function combatStorage(attacker=0,stage='escape') {
  const c=vm.createContext({});vm.runInContext(adapterSource+source,c);
  let engine;const factory=c.createGalacticAdapter;c.createGalacticAdapter=e=>{engine=e;return factory(e);};
  const a=c.createGalacticReach({headless:true,random:seededRandom(1729)}),state=engine.state,defender=attacker===0?1:0;
  state.activePlayer=attacker;state.phase='operations';state.turnStage=attacker===0?'action':'ai';
  state.fleets={'10,-10':{[attacker]:{fleet:1,explorer:0,settler:0}},'9,-10':{[defender]:{fleet:1,explorer:0,settler:0}}};
  state.players.forEach((p,id)=>{p.hand=id===attacker?[{key:'move',id:'dialog-combat-move'}]:[];p.resources={matter:0,energy:0,biomass:0,data:0};});
  a.applyAction(attacker,a.legalActions(attacker).find(x=>x.type==='move'&&x.source==='10,-10'&&x.destination==='9,-10'));
  if(stage!=='escape') {
    engine.applyCombatAction(attacker,{type:'combat_stay'});engine.applyCombatAction(defender,{type:'combat_stay'});
    if(stage==='committed')engine.applyCombatAction(attacker,{type:'combat_tactic',tactic:'defensiveScreen'});
    if(stage==='later') {engine.applyCombatAction(attacker,{type:'combat_tactic',tactic:'defensiveScreen'});engine.applyCombatAction(defender,{type:'combat_tactic',tactic:'defensiveScreen'});}
  }
  const storage=createStorage();writeSave(storage,state);return storage;
}

const tests = [];
function test(name, body) {
 if(name.startsWith('Seed Ark ')||name.startsWith('Shared-table Seed Ark')){
  const original=body;body=()=>{const saved=source,{oldText,newText}=require('./compare-seed-ark-choice.cjs');source=source.replace('colonyCost: 1, text:','colonyCost: 1, fallbackDraw: 2, text:').replace(oldText,newText);try{original();}finally{source=saved;}};name+=' (isolated experimental fixture)';
 }
 tests.push({ name, body });
}

// Plays the fresh game's first round: the human leads Operations and Buy in round 1.
function playFirstRound() {
  const storage = createStorage();
  // 32.37 opens with 1 Matter, 1 Biomass, 1 Data (issue #41), so a fresh hand has no Buy
  // choice and Buy would finish itself; 2 Biomass keeps a starter upgrade on offer.
  const opening = boot(storage).saved();opening.players[0].resources.biomass = 2;writeSave(storage, opening);
  const game = boot(storage);
  let state = game.saved();
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'operations');
  assert.equal(state.activePlayer, 0);
  game.click('pass-button');
  state = game.saved();
  assert.equal(state.phase, 'buy');
  assert.equal(state.activePlayer, 0);
  game.click('finish-buy-button');
  return { storage, game };
}

for(const attacker of [0,1]) for(const stage of ['escape','tactic','committed','later']) test(`combat choice reload stays mandatory: human ${attacker===0?'attacker':'defender'}, ${stage}`,()=>{
  const storage=combatStorage(attacker,stage),game=boot(storage);
  assert(game.saved().pendingCombat);assert(game.dialog('combat').open);
  const before=JSON.stringify(game.saved());
  game.pressEscape('combat');assert(game.dialog('combat').open);assert.equal(JSON.stringify(game.saved()),before);
  game.dialog('combat').close();game.settle();assert(game.dialog('combat').open);
  assert(game.dom.element('undo-turn-button').disabled);
  game.click('convert-all-button');game.click('pass-button');game.click('finish-buy-button');assert.equal(JSON.stringify(game.saved()),before,'Normal turn controls cannot act during combat');
  const reload=boot(storage);assert(reload.dialog('combat').open);
  assert.doesNotMatch(reload.dom.element('combat-forces').innerHTML,/choice|commitments/,'No unrevealed opponent tactic rendered');
  let choices=0;
  while(reload.saved().pendingCombat){assert(choices++<8);const buttons=reload.dom.lastQuery('[data-combat-action]');assert(buttons.length,'Must offer the human a legal continuation');buttons[0].click();reload.settle();}
  assert(!reload.dialog('combat').open);assert(!reload.saved().pendingMove);
  assert.equal(reload.saved().players[attacker].inPlay.filter(c=>c.id==='dialog-combat-move').length,1);
  assert.equal(reload.saved().log.filter(line=>/ moved .+ from /.test(line)).length,1,'Movement completes once despite reload and repeated close');
  assert(reload.saved().lastCombat.volleys.length>0);
  assert(reload.dialog('message').open,'Final report opens automatically');
  const final=reload.saved().lastCombat;
  assert(reload.dom.element('message-body').textContent.includes(final.summary.at(-1)));
  assert(reload.dom.element('message-body').textContent.includes(final.outcome));
  assert.doesNotMatch(final.outcome,/You has/);
  const beforeReport=JSON.stringify(reload.saved());
  const reportReload=boot(storage);assert(reportReload.dialog('message').open,'Unacknowledged report survives reload');assert.equal(JSON.stringify(reportReload.saved()),beforeReport,'AI waits while the final report is open');
  reportReload.click('message-continue');assert(!reportReload.saved().pendingCombatReport);
});

test('30.35 archive: salvage caps automatically before the saved final report',archived(()=>{
 const storage=combatStorage(0,'tactic'),state=JSON.parse(storage.getItem(SAVE_KEY));
 for(const seat of [0,1]){state.players[seat].resources.matter=4;state.players[seat].hand.push({key:'naniteOssuary',id:`salvage-${seat}`});}
 writeSave(storage,state);const game=boot(storage);let choices=0;
 while(game.saved().pendingCombat){assert(choices++<8);game.dom.lastQuery('[data-combat-action]')[0].click();game.settle();}
 assert(game.dialog('message').open);assert(!game.dialog('overflow').open);assert.equal(game.saved().players[0].resources.matter,4);assert(game.saved().log.some(l=>l.includes('automatically discarded')));
 const reload=boot(storage);assert(reload.dialog('message').open);assert.equal(reload.saved().players[0].resources.matter,4);reload.click('message-continue');assert(!reload.saved().pendingCombatReport);
}));

test('pass opens Buy before any rival acts, and a Buy reload can finish', () => {
  const storage = createStorage();
  const game = boot(storage);
  game.click('convert-all-button');
  const converted = game.saved();
  assert(converted.players[0].inPlay.length > 0);
  assert.equal(converted.activePlayer, 0);
  game.click('pass-button');
  const state = game.saved();
  assert.equal(state.phase, 'buy');
  assert.equal(state.activePlayer, 0);
  assert(state.players.slice(1).every(p => !p.passed && p.hand.length === 5));
  const reloaded = boot(storage);
  assert.equal(JSON.stringify(reloaded.saved()), JSON.stringify(state));
  reloaded.click('finish-buy-button');
  assert.equal(reloaded.saved().phase, 'operations');
  assert.equal(reloaded.saved().round, 2);
});

test('a completed first round advances directly into round two', () => {
  const { game } = playFirstRound();
  assert.equal(game.saved().phase, 'operations');
  assert.equal(game.saved().round, 2);
  assert(!('awards' in game.saved()));
  assert(!game.dialog('directive').open);
  // Rules #round: the next hand is drawn at cleanup, so the stepper has no separate Draw step.
  const steps = [...game.dom.element('phase-stepper-steps').innerHTML.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(steps, ['Production', 'Operations', 'Buy', 'Cleanup & draw']);
  assert.equal(game.saved().players[0].hand.length + game.saved().players[0].inPlay.length > 0, true, 'round two opens with the hand drawn at cleanup');
});

function overflowStorage() {
  const storage = createStorage();
  const state = boot(storage).saved();
  state.players[0].resourceLimits.matter=5;state.players[0].resources = { matter: 8, energy: 2, biomass: 0, data: 3 };
  state.activePlayer = 1;
  state.turnStage = 'ai';
  writeSave(storage,state);
  return storage;
}

test('Only level I starters show conversion controls; bulk conversion preserves other cards',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});
 state.players[0].hand=[{id:'level-I',key:'move',starter:true},
  {id:'level-II',key:'construct',starter:true,upgraded:true,level:2},
  {id:'level-III',key:'move',starter:true,upgraded:true,level:3},
  {id:'unit',key:'probe'},{id:'market',key:'signalRelay'},
  {id:'wonder',key:'dysonLattice'},{id:'relic',key:'firstDawnEchoes'}];
 state.players[0].resources={matter:0,energy:0,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage),before=game.saved();
 assert.deepEqual(game.dom.lastQuery('[data-resource-card]').map(b=>b.dataset.resourceCard),['level-I']);
 assert.equal(game.dom.element('convert-all-button').disabled,false);
 game.click('convert-all-button');const after=game.saved();
 assert.deepEqual(after.players[0].hand.map(c=>c.id),before.players[0].hand.filter(c=>c.id!=='level-I').map(c=>c.id));
 assert.equal(after.players[0].resources.energy,1);assert.equal(after.phase,'operations');assert.equal(after.activePlayer,0);
 assert.equal(game.dom.element('convert-all-button').disabled,true);
 assert.equal(game.dom.lastQuery('[data-resource-card]').length,0);
 const reload=boot(storage);assert.equal(reload.dom.lastQuery('[data-resource-card]').length,0);
});
test('Construct III offers a separate draw-only control and keeps its used card in play',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});
 state.players[0].hand=[{id:'iii',key:'construct',starter:true,upgraded:true,level:3},{id:'ii',key:'construct',starter:true,upgraded:true,level:2}];
 state.players[0].deck=[{id:'new-card',key:'signalRelay'}];state.players[0].discard=[];
 state.players[0].resources={matter:0,energy:0,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage),buttons=game.dom.lastQuery('[data-construct-draw]');assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.constructDraw,'iii');
 assert(game.dom.element('hand-row').innerHTML.includes('Play Construct III to draw one card without building'));
 buttons[0].click();game.settle();const after=game.saved();
 assert(after.players[0].inPlay.some(c=>c.id==='iii'));assert(after.players[0].hand.some(c=>c.id==='new-card'));assert.equal(after.pendingConstruct,null);
 assert.deepEqual(after.players[0].resources,state.players[0].resources);
 assert.equal(boot(storage).dom.lastQuery('[data-construct-draw]').length,0);
});
test('Shared-table Construct III draw-only control sends the authoritative choice',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});
 state.players[0].hand=[{id:'iii',key:'construct',starter:true,upgraded:true,level:3}];
 const sent=[],network={seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:commands=>{sent.push(JSON.parse(JSON.stringify(commands)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});const button=game.dom.lastQuery('[data-construct-draw]')[0];assert(button);button.click();game.settle();
 assert.deepEqual(sent,[[{type:'construct_draw',card:'iii',key:'construct'}]]);
});
test('Seed Ark offers a separate draw-two choice and commits before the draw',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});
 state.players[0].hand=[{id:'seed-choice',key:'seedArk'},{id:'pods',key:'colonyPods'}];state.players[0].deck=[];state.players[0].discard=[{id:'draw-one',key:'signalRelay'},{id:'draw-two',key:'move',starter:true}];state.players[0].resources={matter:0,energy:0,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage),buttons=game.dom.lastQuery('[data-order-draw]');assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.orderDraw,'seed-choice');assert(game.dom.element('hand-row').innerHTML.includes('Play Seed Ark to draw two cards instead of colonizing'));
 buttons[0].click();game.settle();const after=game.saved();assert(after.players[0].inPlay.some(c=>c.id==='seed-choice'));assert(!after.players[0].hand.some(c=>c.id==='seed-choice'));assert(after.players[0].hand.some(c=>c.id==='draw-one'));assert(after.players[0].hand.some(c=>c.id==='draw-two'));assert.deepEqual(after.players[0].resources,state.players[0].resources);assert.equal(boot(storage).dom.lastQuery('[data-order-draw]').length,0);
});
test('Shared-table Seed Ark draw choice sends the authoritative command',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});state.players[0].hand=[{id:'shared-seed',key:'seedArk'}];
 const sent=[],network={seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:commands=>{sent.push(JSON.parse(JSON.stringify(commands)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});const button=game.dom.lastQuery('[data-order-draw]')[0];assert(button);button.click();game.settle();assert.deepEqual(sent,[[{type:'order_draw',card:'shared-seed',key:'seedArk'}]]);
});
test('Wonders in hand have no order or conversion and remain until cleanup or later trash',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 state.players[0].hand=[{key:'monumentOfAccord',id:'monument'},{key:'dysonLattice',id:'dyson'}];writeSave(storage,state);
 const game=boot(storage);assert.equal(game.dom.lastQuery('[data-resource-card]').length,0);
 assert.equal(game.dom.lastQuery('[data-order-card]').length,0);assert(game.dom.element('convert-all-button').disabled);
 game.click('convert-all-button');assert.equal(game.saved().players[0].hand.length,2);
 assert.equal(game.saved().phase,'operations');
});
test('Shared-table bulk conversion sends only eligible starters and no empty request',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});
 state.players[0].hand=[{id:'valid',key:'construct',starter:true},{id:'III',key:'move',starter:true,upgraded:true,level:3},{id:'wonder',key:'dysonLattice'}];
 const sent=[],network={seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:intents=>{sent.push(JSON.parse(JSON.stringify(intents)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});game.click('convert-all-button');
 assert.deepEqual(sent,[[{type:'resource',card:'valid'}]]);
 const next=JSON.parse(JSON.stringify(state));next.players[0].hand=next.players[0].hand.filter(c=>c.id!=='valid');
 game.sync({seq:2,state:next});assert(game.dom.element('convert-all-button').disabled);
 game.click('convert-all-button');assert.equal(sent.length,1);
});
test('resource conversion discards excess without a dialog or extra choice',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].resources={matter:4,energy:0,biomass:0,data:0};state.players[0].hand=[{id:'auto-cap',key:'construct',starter:true}];writeSave(storage,state);
 const game=boot(storage);game.click('convert-all-button');assert.equal(game.saved().players[0].resources.matter,4);assert(!game.dialog('overflow').open);assert.equal(game.saved().players[0].inPlay.length,1);assert(game.saved().log.some(l=>l.includes('automatically discarded 1 Matter')));
});

test('automatic excess results persist across reload without a pending choice',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].resources={matter:4,energy:4,biomass:0,data:0};state.players[0].hand=[{id:'m',key:'construct',starter:true},{id:'e',key:'move',starter:true}];writeSave(storage,state);
 const game=boot(storage);game.click('convert-all-button');const saved=game.saved();assert.equal(saved.players[0].hand.length,0);assert.deepEqual(saved.players[0].resources,{matter:4,energy:4,biomass:0,data:0});const reload=boot(storage);assert.deepEqual(reload.saved(),saved);assert(!reload.dialog('overflow').open);
});

test('current markup has no overflow-choice dialog',()=>{assert(!indexHtml.includes('id="overflow-dialog"'));});

test('round three skips the council and proceeds to round four', () => {
  const { storage } = playFirstRound();
  const state = JSON.parse(storage.getItem(SAVE_KEY));
  Object.assign(state,{round:3,phase:'buy',firstPlayer:0,activePlayer:3,turnStage:'ai-buy'});
  state.players.forEach(player=>{player.passed=true;player.resources={matter:0,energy:0,biomass:0,data:0};});
  writeSave(storage,state);
  storage.removeItem(TURN_HISTORY_KEY);
  const game = boot(storage);
  assert.equal(game.saved().round,4);
  assert.equal(game.saved().phase,'operations');
  assert(!game.dialog('directive').open);
});

test('a current save loads without being rewritten', () => {
  const { storage } = playFirstRound();
  const before = storage.getItem(SAVE_KEY);
  const history = storage.getItem(TURN_HISTORY_KEY);
  const state = JSON.parse(before);
  Object.assign(state, { phase: 'operations', activePlayer: 0, turnStage: 'prep' });
  writeSave(storage, state);
  const expected = storage.getItem(SAVE_KEY);
  boot(storage);
  assert.equal(storage.getItem(SAVE_KEY), expected);
  assert.equal(storage.getItem(TURN_HISTORY_KEY), history);
});

test('a save from an older format version is replaced by a new game', () => {
  const { storage } = playFirstRound();
  const stale = JSON.parse(storage.getItem(SAVE_KEY));
  stale.version = formatVersion - 1;
  writeSave(storage, stale);
  const game = boot(storage);
  const state = game.saved();
  assert.equal(state.version, formatVersion);
  assert.equal(state.round, 1);
  assert.equal(state.rulesRevision, CURRENT_RULES_REVISION);
});

test('a save from an incompatible rules revision is replaced by a current game', () => {
  const { storage } = playFirstRound();
  const legacy = JSON.parse(storage.getItem(SAVE_KEY));
  legacy.rulesRevision = CURRENT_RULES_REVISION - 1;
  writeSave(storage, legacy);

  const game = boot(storage);
  const state = game.saved();
  assert.equal(state.rulesRevision, CURRENT_RULES_REVISION);
  assert.equal(state.version, formatVersion);
  assert.equal(state.visibilityRevision, 4);
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'operations');
  const history = JSON.parse(storage.getItem(TURN_HISTORY_KEY));
  assert.equal(history.undo, null, 'the reset clears the previous undo snapshot');
  assert.ok(history.pending, 'the new Operations turn records its own pending snapshot');
});

function consortiumSave() {
  const storage=createStorage(),game=boot(storage),state=game.saved();
  Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'consortium',pendingConsortium:{playerId:0,cardId:'choice-card',trades:0}});
  state.players[0].hand=[{id:'choice-card',key:'tradeConsortium'}];
  state.players[0].resourceLimits.matter=6;state.players[0].resources={matter:6,energy:0,biomass:0,data:0};
  writeSave(storage,state);return storage;
}
test('30.35 archive: Trade Consortium waits, preserves an exchange across reload, and finishes once',archived(()=>{
  const storage=consortiumSave(),game=boot(storage);
  assert(game.dialog('consortium').open);assert.equal(game.saved().players[0].resources.matter,6);
  game.pressEscape('consortium');assert(game.dialog('consortium').open);
  game.dom.element('consortium-give').value='matter';game.dom.element('consortium-get').value='energy';
  fire(game.dom.element('consortium-form'),'submit');game.settle();
  assert.equal(game.saved().pendingConsortium.trades,1);
  assert.equal(game.saved().players[0].resources.energy,1);
  const reloaded=boot(storage);assert(reloaded.dialog('consortium').open);
  assert.equal(reloaded.saved().pendingConsortium.trades,1);assert.equal(reloaded.saved().players[0].resources.matter,4);
  assert(reloaded.dom.element('consortium-cancel').hidden);
  reloaded.click('consortium-finish');assert(!reloaded.dialog('consortium').open);
  assert.equal(reloaded.saved().players[0].inPlay.filter(c=>c.id==='choice-card').length,1);
}));
test('30.35 archive: Trade Consortium gain and cancellation buttons resolve explicitly',archived(()=>{
  const storage=consortiumSave(),game=boot(storage);game.click('consortium-cancel');
  assert(!game.saved().pendingConsortium);assert.equal(game.saved().players[0].hand.length,1);
  const gainGame=boot(consortiumSave());
  gainGame.dom.lastQuery('[data-consortium-gain]').find(b=>b.dataset.consortiumGain==='biomass').click();gainGame.settle();
  assert(!gainGame.saved().pendingConsortium);assert.equal(gainGame.saved().players[0].resources.biomass,1);
}));


// Rules #storage-allocation: the Upgrades tray sells Capacity Modules; buying one changes no limit.
test('Capacity Module pile buys a card into discard during Buy and survives reload', () => {
  const { storage } = playFirstRound();
  const state = JSON.parse(storage.getItem(SAVE_KEY));
  Object.assign(state, { phase: 'buy', activePlayer: 0, turnStage: 'human-buy' });
  state.players[0].resources = { matter: 1, energy: 1, biomass: 1, data: 1 };
  state.players[0].storageUpgrades = 0;
  writeSave(storage, state);
  const game = boot(storage), before = game.saved();
  const offer = game.dom.lastQuery('[data-capacity-offer]');
  assert.equal(offer.length, 1, 'The Upgrades tray shows one Capacity Module pile');
  assert(!offer[0].disabled, 'The first module costs 1 of each resource');
  offer[0].click(); game.settle();
  const after = game.saved();
  assert.equal(after.players[0].storagePurchases, 1);
  assert.equal(after.capacitySupply, before.capacitySupply - 1);
  assert.equal(after.players[0].discard.filter(c => c.key === 'capacityModule').length, 1, 'The module enters discard');
  assert.deepEqual(after.players[0].resourceLimits, before.players[0].resourceLimits, 'Buying a module raises no limit until it is played');
  assert.deepEqual(after.players[0].resources, { matter: 0, energy: 0, biomass: 0, data: 0 });
  assert.equal(after.phase, 'buy');
  assert.deepEqual(after.planets, before.planets);
  assert(!game.dialog('storage-allocation').open, 'Buying opens no allocation');
  assert(game.dom.lastQuery('[data-capacity-offer]')[0].disabled, 'The next module still costs 1 of each, but the first purchase spent the remaining resources');
  const reloaded = boot(storage);
  assert.equal(reloaded.saved().players[0].storagePurchases, 1);
  assert.equal(reloaded.saved().capacitySupply, before.capacitySupply - 1);
});

test('convert-all continues after automatic excess loss',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].resources={matter:4,energy:0,biomass:0,data:1};state.players[0].hand=[{id:'full',key:'construct',starter:true},{id:'next',key:'move',starter:true}];writeSave(storage,state);
 const game=boot(storage);game.click('convert-all-button');assert(!game.dialog('overflow').open);assert.equal(game.saved().players[0].resources.matter,4);assert.equal(game.saved().players[0].resources.energy,1);assert.equal(game.saved().players[0].hand.length,0);
});

test('trashing uses three of the selected resource type in the live Buy UI', () => {
  const storage=createStorage(),state=boot(storage).saved();
  Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'human-buy'});
  state.players[0].resources={matter:3,energy:3,biomass:0,data:0};
  state.players[0].hand=[];
  state.players[0].discard=[{id:'selected-trash',key:'move',starter:true}];
  state.players[0].buyStartDiscardIds=['selected-trash'];
  writeSave(storage,state);
  const game=boot(storage);
  game.dom.element('trash-resource').value='energy';
  fire(game.dom.element('trash-resource'),'change');
  game.dom.lastQuery('[data-trash]').find(button=>button.dataset.trash==='selected-trash').click();
  game.settle();
  assert.equal(game.saved().players[0].resources.matter,3);
  assert.equal(game.saved().players[0].resources.energy,0);
  assert.equal(game.saved().players[0].discard.length,0);
});


function excavationStorage({selected=true,affordable=false}={}) {
  const storage=createStorage(),state=boot(storage).saved(),coord=Object.keys(state.planets).find(k=>state.planets[k].special==='relic');
  state.clusters[state.planets[coord].cluster].revealedBy=[0,1,2,3];state.clusters[state.planets[coord].cluster].scannedBy=[0];state.selected=selected?coord:null;
  state.players[0].hand=[{key:'excavate',id:'tab-dig'},{key:'construct',id:'tab-matter',starter:true},{key:'move',id:'tab-energy',starter:true},{key:'construct',id:'tab-extra',starter:true}];
  state.players[0].resources=affordable?{matter:1,energy:1,biomass:0,data:3}:{matter:0,energy:0,biomass:0,data:3};state.fleets[coord]={0:{explorer:1,fleet:1}};
  writeSave(storage,state);return {storage,coord};
}
function assertTab(game,name){
  for(const tab of game.dom.tabs){const active=tab.dataset.tab===name;assert.equal(tab.getAttribute('aria-selected'),String(active));assert.equal(tab.tabIndex,active?0:-1);}
  for(const panel of game.dom.panels)assert.equal(panel.hidden,panel.dataset.panel!==name);
}
test('Relics tab browses read-only and participates in keyboard tab navigation',()=>{
  const {storage}=excavationStorage(),game=boot(storage);assert.deepEqual(game.dom.tabs.map(t=>t.dataset.tab),['market','relics']);
  const before=JSON.stringify(game.saved());game.click('relics-tab');assertTab(game,'relics');assert.equal(JSON.stringify(game.saved()),before);
  const relics=game.dom.element('relics-tab');assert.equal(relics.getAttribute('role'),'tab');assert.equal(relics.getAttribute('aria-controls'),'relics-panel');assert.equal(game.dom.element('relics-panel').getAttribute('aria-labelledby'),'relics-tab');
  fire(relics,'keydown',{key:'ArrowRight',cancelable:true});assertTab(game,'market');fire(game.dom.element('market-tab'),'keydown',{key:'End',cancelable:true});assertTab(game,'relics');fire(relics,'keydown',{key:'Home',cancelable:true});assertTab(game,'market');
  game.dom.hex(game.saved().clusters[0].center).click();assertTab(game,'market');assert.equal(game.saved().actionMode,null,'Ordinary map inspection does not start excavation');
});
// Rules #shared-board and #military-deck: the standings table carries each faction's public counts
// (the old Fleet panel's manifest), and the military deck is a pile with its own inspect view.
test('Standings table shows public counts and the military deck is a pile of its own',()=>{
  const storage=createStorage(),state=boot(storage).saved();
  const coord=Object.keys(state.planets).find(k=>state.planets[k].owner===null&&!state.planets[k].hasColony);
  Object.assign(state.planets[coord],{owner:1,upgrade:'harvester'});state.fleets[coord]={1:{settler:1,explorer:2,fleet:3}};
  state.players[1].cardsPurchased=4;state.players[1].relicsExcavated=1;
  state.players[0].military=[{key:'aegisOfSilentArchitects',id:'m1'},{key:'aegisOfSilentArchitects',id:'m2'},{key:'cinderDrive',id:'m3'}];
  writeSave(storage,state);const game=boot(storage);
  const track=game.dom.element('prestige-track').innerHTML;
  assert(track.includes('role="table"'),'The standings are a table');
  for(const label of ['Settlers','Explorers','Fleets','Strongest fleet power','Colonies','Harvesters','Shipyards','Excavated relics','Cards bought'])assert(track.includes(`aria-label="${label}"`),`${label} column`);
  const row=track.split('role="row"').find(part=>part.includes(`<span class="sr-only">${game.saved().players[1].name}</span>`));
  assert(row,"A row for the second faction");
  const saved=game.saved(),total=type=>Object.values(saved.fleets).reduce((n,group)=>n+(group[1]?.[type]||0),0);
  const harvesters=Object.values(saved.planets).filter(p=>p.owner===1&&p.upgrade==='harvester').length;
  assert(total('fleet')>=3&&harvesters>=1);
  for(const [label,value] of [['settlers',total('settler')],['explorers',total('explorer')],['fleets',total('fleet')],['harvesters',harvesters],['excavated relics',1],['cards bought',4]])
    assert(row.includes(`: ${value} ${label}"`),`${label} is ${value}`);
  assert.equal(String(game.dom.element('military-count').textContent),'3');
  assert(game.dom.element('military-row').innerHTML.includes('2×'),'Two copies group');
  assert(game.dom.element('military-basic-row').innerHTML.includes('Concentrated Fire'));
  assert(/7 tactics/.test(game.dom.element('military-dialog-help').textContent),'Four basic tactics plus three cards');
  assert(!/id="(fleet-panel|fleet-tab|fleet-glance)"/.test(fs.readFileSync(path.join(__dirname,'../prototypes/galactic-reach/index.html'),'utf8')),'The Fleet panel is gone');
});
function productionNumbers(game) {
 const html=game.dom.element('resource-grid').innerHTML;
 return Object.fromEntries(['matter','energy','biomass','data'].map(resource=>{
  const article=html.match(new RegExp('<article class="resource-box '+resource+'[^"]*"[\\s\\S]*?</article>'))?.[0];assert(article);
  const amount=Number(article.match(/class="resource-production"[^>]*>\+(\d+)/)?.[1]);assert(Number.isInteger(amount));
  assert(article.includes('+'+amount+' per round'),'Accessible name explains production');return [resource,amount];
 }));
}
test('Resource counters show starting production separately from available stock',()=>{
 const game=boot(createStorage());assert.deepEqual(productionNumbers(game),{matter:1,energy:0,biomass:0,data:0});
 const html=game.dom.element('resource-grid').innerHTML;
 assert(html.includes('mat-pips rate mat-classic'),'Green background retains production squares');
 assert(html.includes('mat-key cap'),'Green background retains its capacity marker');
 for(const resource of ['matter','energy','biomass','data']){
  const article=html.match(new RegExp('<article class="resource-box '+resource+'[^"]*"[\\s\\S]*?</article>'))[0];
  const pips=[...article.matchAll(/<i aria-hidden="true" class="([^"]*)"><\/i>/g)].map(m=>m[1].trim().split(/\s+/));
  assert.equal(pips.length,21);assert.equal(pips.filter(p=>p.includes('shut')).length,17,'Only four slots available');
  assert.equal(pips.filter(p=>p.includes('producing')).length,resource==='matter'?1:0);
  assert.equal(pips.filter(p=>p.includes('full')).length,resource==='energy'?0:1);
 }

});
test('Production readout includes Harvesters and per-group collection and reacts to control changes',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 for(const p of Object.values(state.planets))Object.assign(p,{owner:null,hasColony:false,upgrade:null,upgradeLevel:0,occupiedBy:null});
 const coords=resource=>Object.entries(state.planets).filter(([,p])=>p.type===resource).map(([k])=>k);
 const [matter,occupiedMatter]=coords('matter'),[energy]=coords('energy'),[biomass]=coords('biomass'),[data]=coords('data');
 const moon=state.clusters.find(c=>c.kind==='moon').center;
 Object.assign(state.planets[matter],{owner:0,upgrade:'harvester',upgradeLevel:2});
 Object.assign(state.planets[occupiedMatter],{owner:0,occupiedBy:1});
 Object.assign(state.planets[energy],{owner:0});Object.assign(state.planets[biomass],{owner:1});Object.assign(state.planets[data],{owner:0,occupiedBy:1});
 state.fleets={[energy]:{0:{fleet:3}},[biomass]:{0:{settler:3}},[data]:{1:{fleet:1}},[occupiedMatter]:{1:{fleet:1}},[moon]:{0:{fleet:1}}};
 // An Explorer on unclaimed Data earns no local collection.
 const explorerData=coords('data').find(k=>k!==data);state.fleets[explorerData]={0:{explorer:1}};
 state.players[0].resources={matter:10,energy:0,biomass:0,data:0};
 writeSave(storage,state);const game=boot(storage);
 // 32.37: the Harvester hex yields 2 Matter; the other owned Matter hex yields 1.
 assert.deepEqual(productionNumbers(game),{matter:3,energy:2,biomass:1,data:1});
 assert.deepEqual(game.saved().players[0].resources,state.players[0].resources,'Forecast never collects resources or caps the gross gain');
 const updated=game.saved();updated.planets[occupiedMatter].occupiedBy=null;delete updated.fleets[occupiedMatter];updated.planets[energy].owner=null;updated.fleets[biomass][0]={explorer:1};writeSave(storage,updated);
 assert.deepEqual(productionNumbers(boot(storage)),{matter:3,energy:1,biomass:0,data:1});
});

test('Probe resolves from empty space without selecting or reaching a world',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 state.phase='operations';state.activePlayer=0;state.turnStage='prep';state.selected=null;
 state.fleets={'2,2':{0:{explorer:1,settler:0,fleet:0}}};state.players[0].hand=[{id:'remote-probe',key:'probe'}];
 writeSave(storage,state);const game=boot(storage),before=game.saved(),calls=game.randomCalls();
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='remote-probe').click();
 const after=game.saved();assert(![...after.players[0].hand,...after.players[0].deck,...after.players[0].discard].some(c=>c.id==='remote-probe'));assert.equal(after.activePlayer,1);
 assert.equal(after.fleets['2,2'][0].explorer,1);assert.deepEqual(after.players[0].resources,before.players[0].resources);assert.equal(game.randomCalls(),calls);
 assert.equal(after.clusters.filter(c=>c.scannedBy.includes(0)).length,before.clusters.filter(c=>c.scannedBy.includes(0)).length+1);
 assert.deepEqual(after.clusters.map(c=>c.revealedBy),before.clusters.map(c=>c.revealedBy));
 game.click('export-game-report');const report=game.downloads.at(-1);assert(report.save.gameHistory.events.some(e=>e.text.includes('combined card stays in play')));const p=report.save.state.players[0];assert(![...p.hand,...p.deck,...p.discard].some(c=>c.id==='remote-probe'));assert(p.inPlay.some(c=>c.id==='remote-probe'),'Probe keeps the combined card in play');assert(!p.discard.some(c=>c.key==='excavate'));
});
test('Multiple Explorers let the player choose the Probe origin',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',selected:null});
 state.fleets={'2,2':{0:{explorer:1}},'-2,2':{0:{explorer:1}}};state.players[0].hand=[{id:'choose-probe',key:'probe'}];writeSave(storage,state);
 const game=boot(storage);game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='choose-probe').click();assert.equal(game.saved().activePlayer,0);assert(game.saved().players[0].hand.some(c=>c.id==='choose-probe'));
 game.dom.hex('-2,2').click();assert(![...game.saved().players[0].hand,...game.saved().players[0].deck,...game.saved().players[0].discard].some(c=>c.id==='choose-probe'));assert.equal(game.saved().activePlayer,1);
});
test('Probe warns that all remaining sites are known, for one or multiple Explorers, without spending',()=>{
 for(const multiple of [false,true]) {
  const storage=createStorage(),state=boot(storage).saved();
  Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',selected:null});
  state.clusters.forEach(c=>{c.scannedBy=[0];});
  state.fleets={'2,2':{0:{explorer:1}}};if(multiple)state.fleets['-2,2']={0:{explorer:1}};
  state.players[0].hand=[{id:'known-probe',key:'probe'}];writeSave(storage,state);
  const game=boot(storage),before=game.saved(),calls=game.randomCalls();
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='known-probe'&&b.dataset.orderMode==='probe').click();
  assert.equal(game.dom.toasts().at(-1),'You have already discovered all remaining relics. Your card and action are kept.');
  game.click('export-game-report');const after=game.downloads.at(-1).save.state;
  assert.deepEqual(after.players,before.players);assert.deepEqual(after.fleets,before.fleets);
  assert.deepEqual(after.clusters,before.clusters);assert.equal(after.activePlayer,0);assert.equal(after.actionMode,null);
  assert.equal(game.randomCalls(),calls);
 }
});
test('Probe distinguishes all excavated sites from all discovered sites and announces the final discovery',()=>{
 for(const noneRemaining of [false,true]) {
  const storage=createStorage(),state=boot(storage).saved();
  Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',selected:null});
  state.fleets={'2,2':{0:{explorer:1}}};state.players[0].hand=[{id:'last-probe',key:'probe'}];
  const moon=state.clusters.find(c=>c.kind==='moon');
  state.clusters.forEach(c=>{c.scannedBy=c===moon?[]:[0];});
  if(noneRemaining)Object.values(state.planets).filter(p=>p.special==='relic').forEach(p=>{p.relicClaimed=true;});
  writeSave(storage,state);const game=boot(storage);
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='last-probe'&&b.dataset.orderMode==='probe').click();
  if(noneRemaining) {
   assert.equal(game.dom.toasts().at(-1),'No relics remain. Your card and action are kept.');
   assert(game.saved().players[0].hand.some(c=>c.id==='last-probe'));assert.equal(game.saved().activePlayer,0);
  } else {
   assert.match(game.dom.toasts().at(-1),/^Relic signal located at .*You have now discovered all remaining relics\.$/);
   assert(game.saved().clusters[moon.id].scannedBy.includes(0));
   assert(game.saved().players[0].inPlay.some(c=>c.id==='last-probe'));assert.equal(game.saved().activePlayer,1);
  }
 }
});
test('Market permits repeated affordable purchases and reloads with no purchase cap',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'buy'});
 Object.assign(state.players[0],{passed:true,hand:[],deck:[],discard:[],inPlay:[],buyStartDiscardIds:[],buyStartInPlayIds:[],buyLimit:1,resources:{matter:0,energy:6,biomass:0,data:3},resourceLimits:{matter:4,energy:10,biomass:4,data:10}});
 state.market=[{id:'purchase-1',key:'signalRelay'},{id:'purchase-2',key:'signalRelay'}];state.marketDecks={expensive:[],medium:[],cheap:[{id:'refill-3',key:'signalRelay'}]};
 writeSave(storage,state);let game=boot(storage);
 assert.match(game.dom.element('market-help').textContent,/as many cards as you can afford/);
 for(let n=1;n<=3;n++) {
  const button=game.dom.lastQuery('[data-buy-market]').find(b=>!b.disabled);assert(button,`Purchase ${n} remains enabled`);button.click();
  assert.equal(game.saved().players[0].bought,n);assert.equal(game.saved().phase,'buy');
  if(n===1)game=boot(storage);
 }
 assert.equal(game.saved().players[0].discard.length,3);assert.equal(game.saved().market.length,0);
 assert.equal(game.saved().players[0].resources.energy,0);assert.equal(game.saved().players[0].resources.data,0);
});
test('Shared-table Probe uses private server availability and warns after the final signal',()=>{
 const c=vm.createContext({});vm.runInContext(adapterSource+source,c);
 let engine;const factory=c.createGalacticAdapter;c.createGalacticAdapter=e=>{engine=e;return factory(e);};
 const adapter=c.createGalacticReach({headless:true,random:seededRandom(1729)}),state=engine.state;
 Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',selected:null});
 state.fleets={'2,2':{0:{explorer:1}},'-2,2':{0:{explorer:1}}};
 state.players[0].hand=[{id:'network-probe',key:'probe'}];
 const moon=state.clusters.find(c=>c.kind==='moon');state.clusters.forEach(c=>{c.scannedBy=c===moon?[]:[0];});
 let seq=0;const view=()=>JSON.parse(JSON.stringify({seq:++seq,state:adapter.privateState(0),hints:adapter.hints(0)}));
 const sent=[],network={rules:adapter.rulesVersion,seat:0,busy:()=>false,initial:view(),act:intents=>{sent.push(intents);return true;}};
 assert.equal(network.initial.state.probeStatus,'available');assert.equal(network.initial.state.planets[moon.center],undefined,'Unknown moon is redacted');
 const game=boot(createStorage(),1729,undefined,{network});
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='network-probe'&&b.dataset.orderMode==='probe').click();
 game.dom.hex('2,2').click();assert.equal(sent.length,1);assert.equal(sent[0][0].type,'probe');
 const command=sent[0][0],legal=adapter.legalActions(0).find(a=>a.type===command.type&&a.card===command.card&&a.coord===command.coord);
 assert(legal);adapter.applyAction(0,legal);game.sync(view());
 assert.equal(game.dom.toasts().at(-1),'You have now discovered all remaining relics.');
 state.activePlayer=0;state.players[0].hand.push(state.players[0].inPlay.pop());game.sync(view());
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='network-probe'&&b.dataset.orderMode==='probe').click();
 assert.equal(sent.length,1,'All-known Probe sends no command');
 assert.equal(game.dom.toasts().at(-1),'You have already discovered all remaining relics. Your card and action are kept.');
 assert(state.players[0].hand.some(c=>c.id==='network-probe'));assert.equal(state.activePlayer,0);
 Object.values(state.planets).filter(p=>p.special==='relic').forEach(p=>{p.relicClaimed=true;});game.sync(view());
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='network-probe'&&b.dataset.orderMode==='probe').click();
 assert.equal(game.dom.toasts().at(-1),'No relics remain. Your card and action are kept.');assert.equal(sent.length,1);
});
test('Probe UI locates a relic privately and unlocated excavation never redirects to rewards',()=>{
  const {storage,coord}=excavationStorage({affordable:true}),state=JSON.parse(storage.getItem(SAVE_KEY));
  const cluster=state.planets[coord].cluster;state.clusters[cluster].scannedBy=[];
  state.players[0].hand.push({id:'ui-probe',key:'probe'});writeSave(storage,state);
  const game=boot(storage),before=game.saved();
  assert(!game.dom.hex(coord).getAttribute('aria-label').includes('relic site'));
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();assertTab(game,'market');
  assert(game.dom.lastQuery('[data-excavate-relic]').every(b=>b.disabled));
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='ui-probe').click();
  game.dom.hex(coord).click();game.settle();
  const after=game.saved();assert.deepEqual(after.clusters[cluster].scannedBy,[0]);
  assert(![...after.players[0].hand,...after.players[0].deck,...after.players[0].discard].some(c=>c.id==='ui-probe'));assert(after.players[0].hand.some(c=>c.id==='tab-dig'));
  assert.deepEqual(after.players[0].resources,before.players[0].resources);
  assert.equal(after.fleets[coord][0].explorer,1);assert(game.dom.hex(coord).getAttribute('aria-label').includes('relic site'));
  const reload=boot(storage);assert(reload.dom.hex(coord).getAttribute('aria-label').includes('relic site'));assert(![...reload.saved().players[0].hand,...reload.saved().players[0].deck,...reload.saved().players[0].discard].some(c=>c.id==='ui-probe'),'Trashed Probe stays removed across reload');
});

test('Hand Excavate opens Relics with disabled choices, permits conversions, and cancels without spending',()=>{
  const {storage}=excavationStorage(),game=boot(storage),before=game.saved();
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();assertTab(game,'relics');assert.equal(game.saved().actionMode,'excavate');
  assert(game.dom.lastQuery('[data-excavate-relic]').every(b=>b.disabled));assert.match(game.dom.element('relic-row-help').textContent,/Convert cards from your hand/);assert.match(game.dom.element('relic-cost').innerHTML,/3 Data/);
  const resumed=boot(storage);assertTab(resumed,'relics');resumed.click('market-tab');
  for(const id of ['tab-matter','tab-energy','tab-extra']){resumed.dom.lastQuery('[data-resource-card]').find(b=>b.dataset.resourceCard===id).click();assertTab(resumed,'market');}
  assert.equal(resumed.saved().actionMode,'excavate');resumed.click('relics-tab');assert(resumed.dom.lastQuery('[data-excavate-relic]').every(b=>!b.disabled));
  const ready=resumed.saved();resumed.click('cancel-excavate');assertTab(resumed,'market');assert.equal(resumed.saved().actionMode,null);assert.deepEqual(resumed.saved().players,ready.players);assert.deepEqual(resumed.saved().fleets,before.fleets);assert.deepEqual(resumed.saved().relicRow,before.relicRow);
});
test('Context Excavate and selecting a valid active site open Relics without redirecting other inspection',()=>{
  for(const path of ['context','site']){
    const {storage,coord}=excavationStorage({selected:path==='context',affordable:true}),game=boot(storage);
    if(path==='context'){game.dom.contextButton('Excavate relic · Excavate').click();}
    else{game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();assertTab(game,'market');game.dom.hex(game.saved().clusters[0].center).click();assertTab(game,'market');game.dom.hex(coord).click();}
    assertTab(game,'relics');assert(game.dom.lastQuery('[data-excavate-relic]').every(b=>!b.disabled));assert.equal(game.saved().activePlayer,0);assert.equal(game.saved().players[0].hand.length,4);
  }
});

test('excavation UI chooses a visible reward and survives reload without its spent order', () => {
  const storage=createStorage(), state=boot(storage).saved();
  const coord=Object.keys(state.planets).find(k=>state.planets[k].special==='relic');
  state.clusters[state.planets[coord].cluster].revealedBy=[0,1,2,3];state.clusters[state.planets[coord].cluster].scannedBy=[0];
  state.selected=coord;state.players[0].hand=[{key:'excavate',id:'ui-dig'}];
  state.players[0].resources={matter:0,energy:1,biomass:0,data:3};
  state.fleets[coord]={0:{explorer:1}};
  writeSave(storage,state);
  const game=boot(storage), chosen=state.relicRow[1], replacement=state.relicDeck.at(-1);
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='ui-dig').click();
  const choices=game.dom.lastQuery('[data-excavate-relic]');assert.equal(choices.length,3);
  choices.find(b=>b.dataset.excavateRelic===chosen.id).click();
  const after=game.saved(), p=after.players[0];
  assert.equal(after.planets[coord].special,null);assert(!after.fleets[coord]);
  assert.equal(p.relicsExcavated,1);assert.equal(p.discard.find(c=>c.id===chosen.id).key,chosen.key);assert(!p.hand.some(c=>c.id===chosen.id));
  assert(![...p.hand,...p.discard,...p.deck].some(c=>c.id==='ui-dig'));
  assert.equal(after.relicRow[1].id,replacement.id);
  assert.equal(boot(storage).saved().players[0].relicsExcavated,1);
});

test('units remain visible on hidden moons and ordinary space without revealing terrain', () => {
  const storage=createStorage(),state=boot(storage).saved(),moon=state.clusters.find(c=>c.kind==='moon'),coord=moon.center;
  const empty=['2,0','0,2','-2,0','0,-2'].find(key=>!state.planets[key]);assert(empty);
  state.fleets[coord]={2:{explorer:1,fleet:2}};state.fleets[empty]={3:{settler:1}};
  writeSave(storage,state);const game=boot(storage);
  // 34.39: solo rivals are dealt to seats at random, so read each seat's faction name.
  for(const [key,name] of [[coord,state.players[2].name],[empty,state.players[3].name]]) {
    const hex=game.dom.hex(key);assert(hex.querySelector('.hex-fleets').innerHTML.includes('hex-fleet-group'));
    assert(hex.getAttribute('aria-label').includes(name));hex.click();assert(game.dom.element('inspect-facts').innerHTML.includes(name));
  }
  assert.equal(game.dom.hex(coord).querySelector('.special').textContent,'');
  assert(!game.dom.hex(coord).className.includes('moon'),'Unit markers do not reveal a moon');
  assert(!game.dom.element('inspect-facts').innerHTML.includes('Relic'));
});

test('development reveal exposes moons and relics then restores normal public-world visibility', () => {
  const storage=createStorage(),state=boot(storage).saved(),moon=state.clusters.find(c=>c.kind==='moon'),coord=moon.center;
  state.fleets[coord]={2:{fleet:1}};state.selected=coord;writeSave(storage,state);
  const game=boot(storage,20261013,{hostname:'localhost',search:'?dev=1'}),before=storage.getItem(SAVE_KEY);
  assert.equal(game.dom.element('development-tools').hidden,false);
  const toggle=game.dom.element('reveal-entire-map'),hex=game.dom.hex(coord);
  assert(!hex.className.includes('moon'));assert.equal(hex.querySelector('.special').textContent,'');
  toggle.checked=true;fire(toggle,'change');assert(hex.className.includes('moon'));assert.equal(hex.querySelector('.special').textContent,'◈');
  toggle.checked=false;fire(toggle,'change');assert(!hex.className.includes('moon'));assert.equal(hex.querySelector('.special').textContent,'');
  assert(hex.querySelector('.hex-fleets').innerHTML);assert.equal(storage.getItem(SAVE_KEY),before);
  assert.equal(boot(storage,20261013,{hostname:'drawing-board-p0g3.onrender.com',search:'?dev=1'}).dom.element('development-tools').hidden,true);
});

test('public worlds show resources and buildings while unlocated relics stay hidden in every panel', () => {
  const storage=createStorage(),state=boot(storage).saved(),world=state.clusters[4];
  const coord=world.coords.find(key=>state.planets[key].special==='relic');
  Object.assign(state.planets[coord],{owner:2,upgrade:'harvester',upgradeLevel:1});state.selected=coord;writeSave(storage,state);
  const game=boot(storage),hex=game.dom.hex(coord);
  assert(hex.className.includes(state.planets[coord].type));assert(hex.querySelector('.hex-buildings').innerHTML);
  assert.equal(hex.querySelector('.special').textContent,'');assert(!game.dom.element('inspect-facts').innerHTML.includes('Relic site'));
  assert(!hex.getAttribute('aria-label').includes('relic'));
  for(const world of state.clusters.filter(c=>c.kind==='world')) for(const key of world.coords) assert(!game.dom.hex(key).className.includes('unknown-world'));
  state.clusters[4].scannedBy=[0];writeSave(storage,state);const located=boot(storage);
  assert.equal(located.dom.hex(coord).querySelector('.special').textContent,'◈');assert(located.dom.element('inspect-facts').innerHTML.includes('Relic site'));
});

test('Deck opens grouped remaining cards without draw order or save changes', () => {
 const storage=createStorage(),state=boot(storage).saved();
 state.players[0].deck=[{key:'move',id:'c2001',starter:true,upgraded:true},{key:'construct',id:'c2002',starter:true},{key:'construct',id:'c2003',starter:true}];
 writeSave(storage,state);const game=boot(storage),before=storage.getItem(SAVE_KEY);
 game.click('deck-button');assert(game.dom.element('deck-dialog').open);
 const content=game.dom.element('deck-row').innerHTML;
 assert(content.includes('2×'));assert(content.includes('Construct'));assert(content.includes('Move II'));
 assert(content.indexOf('Construct')<content.indexOf('Move II'),'Names use alphabetical order');
 assert(!content.includes('c2001')&&!content.includes('c2002'),'Card IDs cannot reveal ordering');
 game.click('close-deck');assert(!game.dom.element('deck-dialog').open);
 assert.equal(storage.getItem(SAVE_KEY),before,'Opening/closing never rewrites the save');
 state.players[0].deck.reverse();writeSave(storage,state);const reversed=boot(storage);reversed.click('deck-button');
 assert.equal(reversed.dom.element('deck-row').innerHTML,content);
});

test('starter upgrade UI pays two of the selected resource and preserves Buy', () => {
 const storage=createStorage(),state=boot(storage).saved();
 state.phase='buy';state.activePlayer=0;state.turnStage='buy';
 state.players[0].hand=[{key:'move',id:'ui-upgrade',starter:true}];state.players[0].discard=[];
 state.players[0].resources={matter:3,energy:3,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage);
 // The upgrade is offered beside the market like a card; choosing it opens the starter chooser.
 const offer=game.dom.lastQuery('[data-upgrade-offer]').find(b=>b.dataset.upgradeOffer==='move');
 assert(offer&&!offer.disabled,'Move II is offered in the market during Buy');
 offer.click();assert(game.dialog('upgrade').open,'choosing the upgrade card asks which starter to upgrade');
 game.dom.element('upgrade-resource').value='energy';fire(game.dom.element('upgrade-resource'),'change');
 game.dom.lastQuery('[data-upgrade-card]').find(b=>b.dataset.upgradeCard==='ui-upgrade').click();
 assert(!game.dialog('upgrade').open,'the chooser closes after the upgrade');
 const after=game.saved();assert(after.players[0].hand[0].upgraded);assert.equal(after.players[0].resources.energy,1);
 assert.equal(after.players[0].resources.matter,3);assert.equal(after.phase,'buy');assert.equal(after.players[0].bought,0);
 assert(boot(storage).saved().players[0].hand[0].upgraded);
});

test('Buildings have no upgrade actions; Shipyard still offers commissions', () => {
 const storage=createStorage(),state=boot(storage).saved(),coord=state.clusters[0].coords[1];
 Object.assign(state,{selected:coord,actionMode:null,actionCardId:null,actionOptions:{}});
 Object.assign(state.planets[coord],{owner:0,upgrade:'starbase',upgradeLevel:1});
 state.players[0].hand=[{key:'construct',id:'yard-order',starter:true}];
 state.players[0].storageUpgrades=20;state.players[0].resources={matter:10,energy:10,biomass:10,data:10};
 writeSave(storage,state);
 const yard=boot(storage);
 yard.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='yard-order').click();
 assert.equal(yard.dom.contextButton('Upgrade Shipyard to II'),undefined);
 assert(yard.dom.contextButton('Commission Fleet'));
 assert(yard.dom.contextButton('Commission Explorer + Probe / Excavate'));
 state.planets[coord].upgrade='harvester';writeSave(storage,state);
 const harvester=boot(storage);
 harvester.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='yard-order').click();
 assert.equal(harvester.dom.contextButton('Upgrade Harvester to II'),undefined);
});

test('decisive combat awards Prestige once and the saved report preserves it', () => {
 const storage=combatStorage(0,'tactic'),state=JSON.parse(storage.getItem(SAVE_KEY));
 state.pendingCombat.defenderPieces=[{type:'settler',hull:4,power:1,damage:0}];
 state.fleets['9,-10'][1]={settler:1,explorer:0,fleet:0};writeSave(storage,state);
 const game=boot(storage);let choices=0;
 while(game.saved().pendingCombat){assert(choices++<8);game.dom.lastQuery('[data-combat-action]')[0].click();game.settle();}
 assert.equal(game.saved().players[0].combatVictories,1);
 assert.equal(game.saved().lastCombat.prestigeWinner,0);
 assert.match(game.dom.element('message-body').textContent,/gained 2 Prestige/);
 assert(game.dialog('message').open);
 const reloaded=boot(storage);assert(reloaded.dialog('message').open);
 assert.equal(reloaded.saved().players[0].combatVictories,1);
 reloaded.click('message-continue');assert.equal(reloaded.saved().players[0].combatVictories,1);
 assert.equal(boot(storage).saved().players[0].combatVictories,1);
});


test('point buttons show all scoring components and ignore yards and purchases', () => {
 const storage=createStorage(),state=boot(storage).saved();
 const owned=state.clusters[0].coords;
 owned.slice(1,5).forEach(coord=>Object.assign(state.planets[coord],{owner:0,upgrade:'starbase'}));
 for(const cluster of state.clusters.slice(4,6))Object.assign(state.planets[cluster.center],{owner:0,hasColony:true});
 state.players[0].cardsPurchased=80;state.players[0].relicsExcavated=2;state.players[0].combatVictories=1;writeSave(storage,state);
 const game=boot(storage),before=storage.snapshot(),randomBefore=game.randomCalls();
 const button=game.dom.lastQuery('[data-score-player]').find(b=>b.dataset.scorePlayer==='0');
 assert(button);button.click();assert(game.dialog('prestige').open);
 assert.match(game.dom.element('prestige-title').textContent,/15 Prestige/,'34.39: a decisive win scores 2');
 const rows=game.dom.element('prestige-breakdown').innerHTML;
 assert.match(rows,/Colonies · 3 each<\/dt><dd>9/);assert(!rows.includes('Expansion bonus'));
 assert.match(rows,/Excavated relics · 2 each<\/dt><dd>4/);assert.match(rows,/Decisive combat victories · 2 each<\/dt><dd>2/);
 assert(!/Shipyard|Purchased/.test(rows));game.click('close-prestige');
 assert.deepEqual(storage.snapshot(),before);assert.equal(game.randomCalls(),randomBefore);
});

test('export downloads a private read-only report without using RNG or changing the save', () => {
 const storage=createStorage(),snapshots=[];
 const game=boot(storage,20261013,undefined,{onSave:value=>snapshots.push(JSON.parse(JSON.stringify(value)))});
 const before=storage.snapshot(),randomBefore=game.randomCalls();game.click('export-game-report');
 const report=game.downloads[0];assert(report);assert.equal(report.reportFormat,'galactic-reach-game-report/1');
 assert.equal(report.rulesVersion,`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`);
 assert(report.coverage.complete);assert(report.save.gameHistory.initialState);
 assert.deepEqual(report.save.state,game.saved());assert.equal(report.factions.length,4);
 assert.equal(report.factions[1].botProfile.strategy,game.saved().players[1].strategy);assert.deepEqual(report.factions.slice(1).map(f=>f.botProfile.strategy).sort(),['economy','expansion','military']);assert.equal(report.factions[0].points.total,3);
 assert(report.logText.includes('Controlled planets produced'));assert(report.logText.includes('+1 Matter'));
 // Rules #setup: the private opening hand is dealt at setup, so the report's initial position holds it.
 assert.equal(report.save.gameHistory.initialState.players[0].hand.length,5);assert.equal(report.save.gameHistory.initialState.players[0].deck.length,1);
 assert(snapshots.at(-1).gameHistory.complete,'Account payload includes the full private history');
 assert.deepEqual(storage.snapshot(),before);assert.equal(game.randomCalls(),randomBefore);
 const reloaded=boot(storage);reloaded.click('export-game-report');
 assert.deepEqual(reloaded.downloads[0].save.gameHistory,report.save.gameHistory);
});

test('history is uncapped, persists resource transactions, and marks unavailable history partial', () => {
 const storage=createStorage(),state=boot(storage).saved();
 state.players[0].storageUpgrades=1000;state.players[0].resourceLimits={matter:1000,energy:1000,biomass:1000,data:1000};state.players[0].resources={matter:400,energy:0,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage),before=game.saved(),calls=game.randomCalls();
 assert(game.dom.element('bank-exchange-button').disabled);
 game.click('bank-give-matter');assert(game.dom.element('bank-exchange-button').disabled);
 game.click('bank-get-matter');assert(game.dom.element('bank-exchange-button').disabled,'Same-type exchange stays unavailable');
 game.click('bank-get-data');assert(!game.dom.element('bank-exchange-button').disabled);
 assert.equal(game.dom.element('bank-get-data').getAttribute('aria-pressed'),'true');
 assert.equal(game.dom.element('bank-get-matter').getAttribute('aria-pressed'),'false');
 assert.deepEqual(game.saved(),before,'Selecting bank buttons spends no resources or cards');assert.equal(game.randomCalls(),calls);
 for(let n=0;n<95;n++)fire(game.dom.element('bank-trade-form'),'submit',{cancelable:true});
 game.click('export-game-report');const report=game.downloads.at(-1);
 assert(!report.coverage.complete);assert.equal(report.save.state.log.length,80);
 assert(report.coverage.events>95);assert.equal(report.save.gameHistory.events.filter(e=>e.text.includes('exchanged 4 Matter')).length,95);
 const transaction=report.save.gameHistory.events.find(e=>e.text.includes('exchanged 4 Matter'));
 assert.equal(transaction.actor,0);assert(transaction.changes.some(c=>c.path.join('.')==='players.0.resources.matter'&&c.after-c.before===-4));
 assert.match(report.logText,/earlier|unavailable/);assert.match(game.dom.element('history-status').textContent,/Partial/);
 const reload=boot(storage);reload.click('export-game-report');assert.deepEqual(reload.downloads[0].save.gameHistory,report.save.gameHistory);
 reload.click('new-game-button');reload.dialog('new-game').returnValue='start';reload.dialog('new-game').close();reload.settle();
 reload.click('export-game-report');const fresh=reload.downloads.at(-1);
 assert(fresh.coverage.complete);assert(fresh.coverage.events<20);assert(!fresh.logText.includes('exchanged 4 Matter'));
});

// 31.36 #victory: the Prestige target is chosen when a game is created; 30 by default.
test('New game asks for the Prestige target; Cancel keeps the current game', () => {
 const storage=createStorage(),game=boot(storage),before=game.saved();
 assert.equal(before.victoryTarget,30);assert.equal(game.dom.element('victory-target-text').textContent,'30 Prestige');
 game.click('new-game-button');assert(game.dialog('new-game').open);
 assert.match(game.dom.element('new-game-target').innerHTML,/value="30"/);assert.match(game.dom.element('new-game-target').innerHTML,/30 Prestige \(default\)/);
 game.dialog('new-game').returnValue='cancel';game.dialog('new-game').close();game.settle();assert.deepEqual(game.saved(),before,'Cancel changes nothing');
 game.click('new-game-button');game.dom.element('new-game-target').value='40';game.dialog('new-game').returnValue='start';game.dialog('new-game').close();game.settle();
 assert.equal(game.saved().victoryTarget,40);assert.equal(game.saved().round,1);assert.equal(game.dom.element('victory-target-text').textContent,'40 Prestige');
 assert.equal(boot(storage).saved().victoryTarget,40,'The chosen target is saved with the game');
});

// Rules #solo-seating: preview and log follow physical home assignment, which survives reload.
test('New solo games randomize all four starting positions and name the actual neighbor', () => {
 const storage=createStorage(),game=boot(storage),profiles={'Ember Directorate':'military','Violet Assembly':'economy','Helios Compact':'expansion'};
 const check=s=>{assert.deepEqual(s.players.slice(1).map(p=>p.name).sort(),Object.keys(profiles).sort());s.players.slice(1).forEach(p=>assert.equal(p.strategy,profiles[p.name]));assert.equal(s.firstPlayer,0);};
 const neighbor=s=>s.players[s.homeOrder.indexOf(s.homeOrder[0]^1)];
 check(game.saved());assert(game.saved().log.some(e=>String(e.text||e).includes(`Your neighbor this game is ${neighbor(game.saved()).name}`)));
 const homes=new Set(),rivals=new Set();
 for(let n=0;n<24;n++){
  const before=game.saved();game.click('new-game-button');game.dialog('new-game').returnValue='cancel';game.dialog('new-game').close();game.settle();assert.deepEqual(game.saved(),before,'Cancel keeps the current map');
  game.click('new-game-button');const shown=game.dom.element('new-game-neighbor').innerHTML;
  game.dialog('new-game').returnValue='start';game.dialog('new-game').close();game.settle();
  const s=game.saved(),near=neighbor(s);check(s);assert(shown.includes(`Your neighbor: ${near.name} (`),'The preview names the actual physical neighbor');
  assert.equal(near.color,{'Ember Directorate':'#ff9f6e','Violet Assembly':'#a58cff','Helios Compact':'#f2cf66'}[near.name]);
  homes.add(s.clusters[0].center);rivals.add(near.name);
 }
 assert.equal(homes.size,4,'Real browser startup reaches every home position');assert.equal(rivals.size,3,'Every rival can be the neighbor');
 const saved=game.saved(),reloaded=boot(storage);assert.deepEqual(reloaded.saved().homeOrder,saved.homeOrder);assert.deepEqual(reloaded.saved().clusters,saved.clusters,'Reload does not reroll positions');
 const named=boot(createStorage(),20261013,undefined,{names:['Pilot','Rival A','Rival B','Rival C']});assert.equal(new Set(named.saved().homeOrder).size,4,'Custom solo names still receive randomized homes');
 named.click('new-game-button');const customPreview=named.dom.element('new-game-neighbor').innerHTML;named.dialog('new-game').returnValue='start';named.dialog('new-game').close();named.settle();assert(customPreview.includes(`Your neighbor: ${neighbor(named.saved()).name} (`),'Custom names also match the actual neighbor');
});

test('Undo retains the audit and records which events it reverses, including across reload', () => {
 const storage=createStorage(),game=boot(storage);game.click('pass-button').click('finish-buy-button');
 const before=JSON.parse(storage.getItem(HISTORY_KEY));assert(before.events.some(e=>e.text.includes('passed')));
 game.click('undo-turn-button').click('export-game-report');const report=game.downloads.at(-1),events=report.save.gameHistory.events;
 const boundary=events.find(e=>e.kind==='undo');assert(boundary);assert.equal(boundary.actor,0);
 assert(boundary.undone.from<=boundary.undone.to);assert(events.length>before.events.length);
 assert(events.some(e=>e.seq===boundary.undone.from));assert.match(report.logText,/rolls back/);
 const reload=boot(storage);reload.click('export-game-report');assert(reload.downloads[0].save.gameHistory.events.some(e=>e.kind==='undo'));
});

test('combat history retains secret choices and volley arithmetic without changing the observer view', () => {
 const storage=combatStorage(0,'tactic'),game=boot(storage);
 const choice=game.dom.lastQuery('[data-combat-action]')[0];
 assert(choice);choice.click();game.settle();game.click('export-game-report');
 const events=game.downloads.at(-1).save.gameHistory.events;
 assert(events.some(e=>e.kind==='combat-choice'&&e.actor===0&&e.action.tactic==='concentratedFire'));
 const volley=events.find(e=>e.kind==='combat-volley');assert(volley);assert.equal(volley.results.attacker.base,3);
 assert(Number.isFinite(volley.results.defender.damage));
});

test('stale history never attaches to a different position and storage failure is visible', () => {
 const storage=createStorage(),state=boot(storage).saved();state.round++;writeSave(storage,state);
 const stale=boot(storage);stale.click('export-game-report');assert(!stale.downloads[0].coverage.complete);
 const failedStorage=createStorage();failedStorage.setItem=()=>{throw new Error('quota');};
 const failed=boot(failedStorage);assert.match(failed.dom.element('history-status').textContent,/Browser save unavailable/);
 failed.click('export-game-report');assert(failed.downloads[0].coverage.complete);
});


test('a complete browser game exports setup through victory and retains its history after reload', () => {
 const storage=createStorage(),game=boot(storage);
 for(let turn=0;game.saved().winner===null;turn++) {
   assert(turn<350,'Browser rivals should finish a game: '+JSON.stringify({round:game.saved().round,phase:game.saved().phase,active:game.saved().activePlayer,pendingConstruct:game.saved().pendingConstruct,pendingBuildOrder:game.saved().pendingBuildOrder,players:game.saved().players.map(p=>({id:p.id,prestige:p.prestige,resources:p.resources,hand:p.hand.map(c=>c.key)})),log:game.saved().log.slice(-10)}));
   const state=game.saved();
   if(state.pendingCombatReport)game.click('message-continue');
   else if(state.pendingCombat){game.dom.lastQuery('[data-combat-action]')[0].click();game.settle();}
   else if(game.dialog('overflow').open){
     const player=state.players[0];
     for(const resource of ['matter','energy','biomass','data']) game.dom.element('overflow-'+resource).value=String(Math.max(0,player.resources[resource]-player.resourceLimits[resource]));
     fire(game.dom.element('overflow-form'),'submit',{cancelable:true});game.settle();
   } else game.click(state.phase==='buy'?'finish-buy-button':'pass-button');
 }
 game.click('export-game-report');const report=game.downloads.at(-1);
 assert(report.coverage.complete);assert(report.factions[report.winner].points.total>=10);
 assert(report.save.gameHistory.events.some(e=>e.text.includes('won with')));
 assert(report.save.gameHistory.events.some(e=>e.text.includes('converted')&&e.actor>0));
 assert(report.coverage.events>80);assert.equal(report.save.state.log.length,80);
 assert(JSON.stringify(report.save).length<8*1024*1024,'A completed report fits the account save bound');
 const reload=boot(storage);reload.click('export-game-report');assert.deepEqual(reload.downloads[0].save.gameHistory,report.save.gameHistory);
});


test('Undo with missing history never claims an invented earlier event range', () => {
 const storage=createStorage(),game=boot(storage);game.click('pass-button').click('finish-buy-button');
 storage.removeItem(HISTORY_KEY);
 const reload=boot(storage);reload.click('undo-turn-button').click('export-game-report');
 const report=reload.downloads.at(-1),undo=report.save.gameHistory.events.find(e=>e.kind==='undo');
 assert(!report.coverage.complete);assert(undo);assert.equal(undo.undone.from,null);assert.equal(undo.undone.to,null);
 assert.match(report.logText,/earlier event range unavailable/);assert(!report.logText.includes('#null'));
});


test('account JSON field reordering preserves full history, Undo cursors, and subsequent recording', () => {
 const storage=createStorage(),snapshots=[];
 const game=boot(storage,20261013,undefined,{onSave:value=>snapshots.push(JSON.parse(JSON.stringify(value)))});
 game.click('pass-button').click('finish-buy-button');
 const saved=snapshots.at(-1);
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const server=canonical(saved),account=createStorage({[SAVE_KEY]:JSON.stringify(server.state),[TURN_HISTORY_KEY]:JSON.stringify(server.turnHistory),[HISTORY_KEY]:JSON.stringify(server.gameHistory)});
 assert.notEqual(account.getItem(SAVE_KEY),JSON.stringify(saved.state),'Account fixture actually reorders state fields');
 const reload=boot(account,20261013,undefined,{requireSave:true});reload.click('export-game-report');
 const report=reload.downloads.at(-1);assert(report.coverage.complete);assert.equal(report.save.gameHistory.signatureVersion,2);
 assert.deepEqual(report.save.gameHistory.events,saved.gameHistory.events);
 reload.click('undo-turn-button').click('export-game-report');
 const after=reload.downloads.at(-1);assert(after.coverage.complete);assert(after.save.gameHistory.events.some(e=>e.kind==='undo'&&Number.isInteger(e.undone.from)));
 assert(boot(account,20261013,undefined,{requireSave:true}).dom.element('history-status').textContent.includes('Full history'));
});

test('legacy browser history markers load without loss and array order remains significant', () => {
 const storage=createStorage(),game=boot(storage),history=JSON.parse(storage.getItem(HISTORY_KEY));
 let hash=2166136261;const raw=JSON.stringify(game.saved());
 for(let n=0;n<raw.length;n++)hash=Math.imul(hash^raw.charCodeAt(n),16777619)>>>0;
 delete history.signatureVersion;history.stateSignature=`${raw.length}:${hash.toString(16)}`;storage.setItem(HISTORY_KEY,JSON.stringify(history));
 const reload=boot(storage);reload.click('export-game-report');assert(reload.downloads.at(-1).coverage.complete);
 assert.equal(reload.downloads.at(-1).save.gameHistory.signatureVersion,2,'Export copy uses the canonical marker');
 reload.click('pass-button');assert.equal(JSON.parse(storage.getItem(HISTORY_KEY)).signatureVersion,2,'Next save upgrades the marker');
 const state=reload.saved();state.players[0].hand.reverse();writeSave(storage,state);
 const changed=boot(storage);changed.click('export-game-report');assert(!changed.downloads.at(-1).coverage.complete,'Canonicalization never hides changes to ordered arrays');
});

test('In play is inspectable, survives reload, and is included in game reports',()=>{
 const storage=createStorage(),game=boot(storage);game.click('convert-all-button');const state=game.saved();assert.equal(state.players[0].inPlay.length,5);assert.equal(state.players[0].discard.length,0);
 const before=storage.snapshot(),rng=game.randomCalls();game.click('in-play-button');assert(game.dialog('in-play').open);assert.equal(Number(game.dom.element('in-play-dialog-count').textContent),5);assert(game.dom.element('in-play-row').innerHTML.includes('game-card'));assert(!game.dom.element('in-play-row').innerHTML.includes('data-order-card'));game.click('close-in-play');assert.deepEqual(storage.snapshot(),before);assert.equal(game.randomCalls(),rng);
 const reload=boot(storage);assert.deepEqual(reload.saved(),state);reload.click('export-game-report');const report=reload.downloads[0];assert.equal(report.factions[0].cards.inPlay,5);assert.deepEqual(report.save.state.players[0].inPlay,state.players[0].inPlay);assert(report.save.gameHistory.events.some(e=>e.changes.some(c=>c.path.join('.')==='players.0.inPlay')));
});
test('Undo returns newly played cards to hand without leaving a second copy in play',()=>{
 const storage=createStorage(),game=boot(storage),initial=game.saved();game.click('convert-all-button');game.click('pass-button');assert.equal(game.saved().players[0].inPlay.length,5);game.click('undo-turn-button');assert.deepEqual(game.saved().players[0].hand,initial.players[0].hand);assert.equal(game.saved().players[0].inPlay.length,0);
});
test('30.35 archive: Trade Consortium commits into play on its first exchange across reload',archived(()=>{
 const storage=consortiumSave(),game=boot(storage);game.dom.element('consortium-give').value='matter';game.dom.element('consortium-get').value='energy';fire(game.dom.element('consortium-form'),'submit');game.settle();assert.equal(game.saved().players[0].hand.length,0);assert.equal(game.saved().players[0].inPlay.filter(c=>c.id==='choice-card').length,1);const reload=boot(storage);assert(reload.dialog('consortium').open);reload.click('consortium-finish');assert.equal(reload.saved().players[0].inPlay.filter(c=>c.id==='choice-card').length,1);
}));


// A Capacity Module in hand: choosing its order opens the split; cancelling plays nothing.
const playModule=game=>game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='module').click();
const moduleSave=()=>{const storage=createStorage(),state=boot(storage).saved();state.players[0].resources={matter:2,energy:2,biomass:2,data:2};state.players[0].hand.push({id:'module',key:'capacityModule',starter:false,upgraded:false});writeSave(storage,state);return storage;};
test('storage allocations cancel atomically, survive commitment and undo with the turn',()=>{
 const storage=moduleSave();
 let game=boot(storage),before=game.saved();playModule(game);game.settle();assert(game.dialog('storage-allocation').open);
 for(const r of ['matter','energy','biomass','data'])game.dom.element('storage-points-'+r).value='0';
 game.dom.element('storage-points-data').value='3';fire(game.dom.element('storage-points-data'),'input');assert(game.dom.element('storage-allocation-confirm').disabled);
 fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});assert.deepEqual(game.saved(),before);
 game.click('storage-allocation-cancel');assert(!game.dialog('storage-allocation').open);assert.deepEqual(game.saved(),before);
 playModule(game);game.settle();game.dom.element('storage-points-data').value='4';fire(game.dom.element('storage-points-data'),'input');game=boot(storage);assert.deepEqual(game.saved(),before,'Reloading a draft plays nothing');
 playModule(game);game.settle();for(const r of ['matter','energy','biomass','data'])game.dom.element('storage-points-'+r).value='1';fire(game.dom.element('storage-points-data'),'input');
 fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});game.settle();assert.deepEqual(game.saved().players[0].resourceLimits,{matter:5,energy:5,biomass:5,data:5});
 const owned=p=>[...p.hand,...p.deck,...p.discard,...p.inPlay];assert(!owned(game.saved().players[0]).some(c=>c.id==='module'),'The played module leaves the deck cycle');assert.deepEqual(game.saved().players[0].storage.map(c=>c.id),['module'],'It is stored');assert.equal(game.dom.element('storage-pile-count').textContent,1,'The Storage pile count shows beside the mat');assert.match(game.dom.element('storage-pile').title,/next Capacity Module costs 1 of each resource/,'Stored modules do not raise the displayed price');
 const cleanup=boot(storage);assert.deepEqual(cleanup.saved().players[0].storage.map(c=>c.id),['module'],'The Storage pile survives reload');
 game.click('export-game-report');const report=game.downloads.at(-1);assert.deepEqual(report.save.state.players[0].resourceLimits,game.saved().players[0].resourceLimits);
 assert(report.save.gameHistory.events.some(e=>e.changes.some(c=>c.path.join('.')==='players.0.resourceLimits.data')));
 const reload=boot(storage);assert.deepEqual(reload.saved(),game.saved());reload.click('undo-turn-button');assert.deepEqual(reload.saved().players[0].resourceLimits,before.players[0].resourceLimits);
});


function constructTwoSave(){const storage=createStorage(),state=boot(storage).saved(),coord=state.clusters[0].coords[1];Object.assign(state,{activePlayer:0,phase:'operations',turnStage:'prep',selected:coord});state.players[0].resources={matter:4,energy:4,biomass:3,data:2};state.players[0].hand=[{id:'two-builds',key:'construct',starter:true,upgraded:true},{id:'fund-more',key:'construct'}];writeSave(storage,state);return{storage,coord};}
function startFirstBuild(game){game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='two-builds').click();const button=game.dom.contextButton('Build Shipyard');assert(button&&!button.disabled);button.click();game.settle();}
test('a rival resumes its optional second build after commissioning into an enemy rival',()=>{
 const storage=createStorage(),c=vm.createContext({});vm.runInContext(adapterSource+source,c);
 let e;const f=c.createGalacticAdapter;c.createGalacticAdapter=x=>(e=x,f(x));
 c.createGalacticReach({headless:true,random:seededRandom(1729)});
 const s=e.state,coord=s.clusters[1].coords[1],card={id:'spawn-second',key:'construct',starter:true,upgraded:true};
 s.phase='operations';s.activePlayer=1;
 s.players.forEach((p,id)=>{p.passed=id>=2;p.hand=id===1?[card]:id===0?[{id:'wait-human',key:'move',starter:true}]:[];p.resourceLimits={matter:30,energy:30,biomass:30,data:30};p.resources={matter:20,energy:20,biomass:20,data:20};});
 assert(e.buildUpgrade(1,coord,'starbase'));s.fleets={[coord]:{2:{settler:0,explorer:0,fleet:1}}};
 assert(e.performConstructOrder(1,coord,'fleet',card));assert(s.pendingCombat);assert(s.pendingConstruct);
 writeSave(storage,JSON.parse(JSON.stringify(s)));const g=boot(storage),after=g.saved();
 assert(!after.pendingCombat);assert(!after.pendingConstruct,'The rival resolves or declines its second build after combat');
 assert(!after.pendingBuildOrder);assert.equal(after.activePlayer,0,'The real browser timers return control to the human');
 assert.equal(after.players[1].inPlay.filter(c=>c.id===card.id).length,1);
});

test('Construct II saves its optional second build and commits only once',()=>{
 const {storage,coord}=constructTwoSave(),game=boot(storage);startFirstBuild(game);let state=game.saved();assert(state.pendingConstruct);assert.equal(state.activePlayer,0);assert.equal(state.players[0].resources.matter,2);assert.equal(state.players[0].inPlay.filter(c=>c.id==='two-builds').length,1);assert(!game.dom.element('finish-construct').hidden);assert(game.dom.element('undo-turn-button').disabled);
 game.click('export-game-report');assert(game.downloads.at(-1).save.state.pendingConstruct);assert(game.downloads.at(-1).save.gameHistory.events.some(e=>e.changes.some(c=>c.path.join('.')==='pendingConstruct')));
 const reload=boot(storage);assert.deepEqual(reload.saved().pendingConstruct,state.pendingConstruct);const fleet=reload.dom.contextButton('Commission Fleet');assert(fleet&&!fleet.disabled);fleet.click();reload.settle();state=reload.saved();assert(!state.pendingConstruct);assert.equal(state.fleets[coord][0].fleet,1);assert.equal(state.players[0].inPlay.filter(c=>c.id==='two-builds').length,1);assert.equal(state.players[0].resources.matter,0);
 reload.click('undo-turn-button');assert(!reload.saved().pendingConstruct);assert(!reload.saved().planets[coord].upgrade);assert(!reload.saved().fleets[coord]?.[0]);assert.equal(reload.saved().players[0].inPlay.length,0);
});
test('Construct II can finish after one build following a reload',()=>{
 const {storage,coord}=constructTwoSave(),game=boot(storage);startFirstBuild(game);const before=game.saved().players[0].resources;const reload=boot(storage);reload.click('finish-construct');assert(!reload.saved().pendingConstruct);assert.equal(reload.saved().planets[coord].upgrade,'starbase');assert.deepEqual(reload.saved().players[0].resources,before);assert.equal(reload.saved().players[0].inPlay.filter(c=>c.id==='two-builds').length,1);
});
test('capacity allocation defaults to one each and is immediately confirmable',()=>{
 const storage=moduleSave(),game=boot(storage);playModule(game);game.settle();for(const r of ['matter','energy','biomass','data'])assert.equal(game.dom.element('storage-points-'+r).value,'1');assert(!game.dom.element('storage-allocation-confirm').disabled);fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});game.settle();assert.deepEqual(game.saved().players[0].resourceLimits,{matter:5,energy:5,biomass:5,data:5});
});

let failed = 0;
// Interface automation for forced turns (feedback 2026-11-14). Rules are unchanged:
// the engine still requires an explicit pass and finish_buy from headless seats.
function forcedTurnStorage({resources={matter:0,energy:0,biomass:0,data:0},discard=[]}={}) {
  const storage=createStorage(),state=boot(storage).saved();
  Object.assign(state,{phase:'operations',activePlayer:3,turnStage:'ai',tradeOffers:[]});
  state.players.forEach((p,id)=>{p.passed=id===1||id===2;});
  Object.assign(state.players[3],{hand:[],resources:{matter:0,energy:0,biomass:0,data:0}});
  Object.assign(state.players[0],{hand:[],discard,resources,passed:false});
  writeSave(storage,state);return storage;
}
test('an empty hand passes to Buy, and a Buy with no possible choice finishes, with a notice and Undo',()=>{
  const game=boot(forcedTurnStorage());game.settle();
  const saved=game.saved(),log=saved.log.join('\n');
  assert.match(log,/no cards left, so the table passed you to Buy/);
  assert.match(log,/nothing to buy, upgrade, trash or exchange, so Buy finished automatically/);
  assert(saved.round>=2,'the round finished and play continued');
  const notice=game.dom.element('turn-notice');
  assert.equal(notice.hidden,false);
  assert.equal(notice.textContent,'No cards left: moved to Buy. Nothing affordable: Buy finished automatically.');
  assert.equal(game.dom.element('undo-turn-button').disabled,false,'Undo can restore the Operations turn to post a trade instead');
});
test('an empty hand with something affordable stops at Buy, beside the hand',()=>{
  // 31.36 sells no basic cards; 1 of each resource still affords the first capacity upgrade.
  const game=boot(forcedTurnStorage({resources:{matter:1,energy:1,biomass:1,data:1}}));game.settle();
  const saved=game.saved();
  assert.equal(saved.phase,'buy');assert.equal(saved.activePlayer,0);assert(saved.players[0].passed);
  assert.equal(game.dom.element('market-notice').textContent,'No cards left: moved to Buy.');
  assert.equal(game.dom.element('hand-finish-buy-button').hidden,false);
  game.click('hand-finish-buy-button');game.settle();
  assert.notEqual(game.saved().phase==='buy'&&game.saved().activePlayer===0,true,'Finish Buy beside the hand ends the Buy turn');
});
test('a hand with cards is never passed automatically',()=>{
  const storage=forcedTurnStorage(),state=JSON.parse(storage.getItem(SAVE_KEY));
  state.players[0].hand=[{id:'keep-me',key:'move',starter:true}];writeSave(storage,state);
  const game=boot(storage);game.settle();
  const saved=game.saved();
  assert.equal(saved.phase,'operations');assert.equal(saved.activePlayer,0);assert(!saved.players[0].passed);
  assert.equal(game.dom.element('pass-button').hidden,false,'Pass & buy is offered beside the hand');
});
test('Buy upgrades and trashes starters in hand, discard and in play (28.33 #buy amendment)',()=>{
  const storage=createStorage(),state=boot(storage).saved();
  Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'buy'});
  Object.assign(state.players[0],{passed:true,resources:{matter:3,energy:2,biomass:0,data:0},
    hand:[{id:'up-hand',key:'move',starter:true}],discard:[{id:'up-discard',key:'construct',starter:true}],
    inPlay:[{id:'up-play',key:'move',starter:true}],buyStartDiscardIds:['up-discard'],buyStartInPlayIds:['up-play'],buyStartHandIds:['up-hand']});
  writeSave(storage,state);
  let game=boot(storage);
  const html=game.dom.element('decommission-area').innerHTML;
  assert.deepEqual([...html.matchAll(/data-trash="([^"]*)"/g)].map(m=>m[1]).sort(),['up-discard','up-hand','up-play']);
  assert.match(html,/in hand/,'the Trash dialog says where a hand card is');
  assert.match(game.dom.element('hand-row').innerHTML,/data-trash-hand="up-hand"/,'an eligible hand card offers Trash…');
  const choices=key=>{game.dom.lastQuery('[data-upgrade-offer]').find(b=>b.dataset.upgradeOffer===key).click();
    const ids=[...game.dom.element('upgrade-options').innerHTML.matchAll(/data-upgrade-card="([^"]*)"/g)].map(m=>m[1]).sort();
    game.dom.element('upgrade-dialog').close();game.settle();return ids;};
  assert.deepEqual(choices('move'),['up-hand','up-play']);
  assert.deepEqual(choices('construct'),['up-discard']);
  assert.doesNotMatch(game.dom.element('upgrade-market').innerHTML,/All upgraded/);
  game.dom.lastQuery('[data-upgrade-offer]').find(b=>b.dataset.upgradeOffer==='move').click();
  game.dom.element('upgrade-resource').value='energy';fire(game.dom.element('upgrade-resource'),'change');
  game.dom.lastQuery('[data-upgrade-card]').find(b=>b.dataset.upgradeCard==='up-play').click();game.settle();
  assert.equal(game.saved().players[0].inPlay.find(c=>c.id==='up-play').upgraded,true);
  game=boot(storage);game.dom.element('trash-resource').value='matter';fire(game.dom.element('trash-resource'),'change');
  game.dom.lastQuery('[data-trash]').find(b=>b.dataset.trash==='up-play').click();game.settle();
  assert(!game.saved().players[0].inPlay.some(c=>c.id==='up-play'),'the in-play card was trashed');
});
test('the last conversion passes into Buy without waiting for a click',()=>{
 const storage=createStorage(),state=boot(storage).saved();
 state.players[0].hand=[{id:'last',key:'construct',starter:true}];state.players[0].resources={matter:3,energy:3,biomass:3,data:3};
 writeSave(storage,state);const game=boot(storage);game.click('convert-all-button');
 const after=game.saved();assert.equal(after.phase,'buy');assert.equal(after.activePlayer,0);assert.equal(after.players[0].hand.length,0);assert(after.players[0].inPlay.some(c=>c.id==='last'));
});
test('the combined card selects Excavate and keeps the choice through reload',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].hand=[{id:'combined',key:'probe'}];writeSave(storage,state);
 let game=boot(storage);const buttons=game.dom.lastQuery('[data-order-card]');
 assert.equal(buttons.filter(b=>b.dataset.orderCard==='combined').length,2);
 buttons.find(b=>b.dataset.orderMode==='excavate').click();assert.equal(game.saved().actionMode,'excavate');
 game=boot(storage);assert.equal(game.saved().actionMode,'excavate');
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderMode==='probe').click();
 assert.equal(game.saved().actionMode,'probe');
});
test('Exchange order chooses a give resource,can cancel,and updates the bank rate',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});state.players.forEach((p,id)=>p.passed=id!==0);
 state.players[0].hand=[{id:'exchange-choice',key:'exchangeProtocol'},{id:'keep-turn',key:'move',starter:true}];state.players[0].resources={matter:0,energy:0,biomass:4,data:0};writeSave(storage,state);
 const game=boot(storage);game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='exchange-choice').click();assert(game.dom.element('exchange-resource-dialog').open);
 game.click('exchange-resource-cancel');assert(game.saved().players[0].hand.some(c=>c.id==='exchange-choice'));
 game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='exchange-choice').click();const buttons=game.dom.lastQuery('[data-exchange-resource]');assert.equal(buttons.length,4);buttons.find(b=>b.dataset.exchangeResource==='biomass').click();game.settle();assert(game.saved().players[0].bankExchangeResources.includes('biomass'));assert(game.saved().players[0].inPlay.some(c=>c.id==='exchange-choice'));
 game.click('bank-give-biomass').click('bank-get-data');assert.equal(game.dom.element('bank-give-rate').textContent,'Give 2');fire(game.dom.element('bank-trade-form'),'submit',{cancelable:true});game.settle();assert.equal(game.saved().players[0].resources.biomass,2);assert.equal(game.saved().players[0].resources.data,1);
});
test('Shared exchange order sends its resource choice to the authoritative engine',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep'});state.players[0].hand=[{id:'shared-exchange',key:'barterNetwork'}];
 const sent=[],network={seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:commands=>{sent.push(JSON.parse(JSON.stringify(commands)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='shared-exchange').click();game.dom.lastQuery('[data-exchange-resource]').find(b=>b.dataset.exchangeResource==='energy').click();game.settle();assert.deepEqual(sent,[[{type:'special',card:'shared-exchange',resource:'energy'}]]);
});
test('Buy exchange stays in Buy, can cancel, trades at 2:1, and keeps the held card on reload',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'buy'});state.players[0].passed=true;
 state.players[0].hand=[{id:'buy-exchange',key:'clearingHouse'}];state.players[0].resources={matter:0,energy:4,biomass:0,data:0};writeSave(storage,state);
 let game=boot(storage);const button=()=>game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='buy-exchange');assert(button(),'A held exchange has a Buy button');
 button().click();assert(game.dom.element('exchange-resource-dialog').open);game.click('exchange-resource-cancel');assert(game.saved().players[0].hand.some(c=>c.id==='buy-exchange'));
 game=boot(storage);button().click();game.dom.lastQuery('[data-exchange-resource]').find(b=>b.dataset.exchangeResource==='energy').click();game.settle();
 assert.equal(game.saved().phase,'buy');assert.equal(game.saved().activePlayer,0);assert(game.saved().players[0].inPlay.some(c=>c.id==='buy-exchange'));
 game.click('bank-give-energy').click('bank-get-data');assert.equal(game.dom.element('bank-give-rate').textContent,'Give 2');fire(game.dom.element('bank-trade-form'),'submit',{cancelable:true});game.settle();assert.equal(game.saved().players[0].resources.energy,2);assert.equal(game.saved().players[0].resources.data,1);
 assert(game.dom.element('upgrade-market').innerHTML.includes('Pay 3 of one resource per card.'));assert(game.dom.element('upgrade-market').innerHTML.includes('aria-label="Trash pile: pay 3 of one resource per card'));
});
test('A held exchange prevents automatic Buy skipping even with no resources',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'buy'});state.players[0].passed=true;state.players[0].hand=[{id:'empty-exchange',key:'barterNetwork'}];state.players[0].resources={matter:0,energy:0,biomass:0,data:0};writeSave(storage,state);
 const game=boot(storage);assert.equal(game.saved().phase,'buy');assert(game.dom.lastQuery('[data-order-card]').some(b=>b.dataset.orderCard==='empty-exchange'));
});
test('Shared Buy exchange sends its resource choice without finishing Buy',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'buy',activePlayer:0,turnStage:'buy'});state.players[0].passed=true;state.players[0].hand=[{id:'shared-buy-exchange',key:'barterNetwork'}];
 const sent=[],network={seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:commands=>{sent.push(JSON.parse(JSON.stringify(commands)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='shared-buy-exchange').click();game.dom.lastQuery('[data-exchange-resource]').find(b=>b.dataset.exchangeResource==='energy').click();game.settle();assert.deepEqual(sent,[[{type:'special',card:'shared-buy-exchange',resource:'energy'}]]);
});
test('Retained Seed Ark has no unadopted draw alternative',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].hand=[{id:'retained-seed',key:'seedArk'}];writeSave(storage,state);const game=boot(storage);assert.equal(game.dom.lastQuery('[data-order-draw]').length,0);
});
test('committed tabletop turns wait for explicit Pass and Finish Buy with an empty hand',()=>{
 const state=boot(createStorage()).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',tradeOffers:[]});
 Object.assign(state.players[0],{hand:[],discard:[],inPlay:[],resources:{matter:0,energy:0,biomass:0,data:0},passed:false});
 const sent=[],network={committedOnly:true,seat:0,rules:`galactic-reach/${formatVersion}.${CURRENT_RULES_REVISION}`,initial:{seq:1,state},busy:()=>false,act:intents=>{sent.push(JSON.parse(JSON.stringify(intents)));return true;}};
 const game=boot(createStorage(),1729,undefined,{network});game.settle();
 assert.deepEqual(sent,[],'an empty hand cannot submit or preview Pass automatically');
 game.click('pass-button');assert.deepEqual(sent,[[{type:'pass'}]]);sent.length=0;
 const next=JSON.parse(JSON.stringify(state));Object.assign(next,{phase:'buy',turnStage:'buy'});next.players[0].passed=true;
 game.sync({seq:2,state:next});game.settle();assert.deepEqual(sent,[],'empty Buy cannot submit or preview finishing automatically');
 game.click('hand-finish-buy-button');assert.deepEqual(sent,[[{type:'finish_buy'}]]);
 const ordinary=[];boot(createStorage(),1729,undefined,{network:{...network,committedOnly:false,act:intents=>{ordinary.push(JSON.parse(JSON.stringify(intents)));return true;}}});
 assert.deepEqual(ordinary,[[{type:'pass'}]],'ordinary shared tables retain automatic Pass');
});

for (const { name, body } of tests) {
  try {
    body();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`not ok - ${name}`);
    console.log(error.stack.split('\n').map(line => `  ${line}`).join('\n'));
  }
}
console.log(`${tests.length - failed}/${tests.length} Galactic Reach checks passed.`);
process.exitCode = failed ? 1 : 0;
