// Runs the unmodified Galactic Reach app.js against a minimal fake DOM, so the real startup,
// save-migration, and round-end dialog paths execute exactly as they do in the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../prototypes/galactic-reach/app.js');
const adapterPath = path.resolve(__dirname, '../prototypes/galactic-reach/adapter.js');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8');
const indexHtml=fs.readFileSync(path.resolve(__dirname,'../prototypes/galactic-reach/index.html'),'utf8');
const formatVersion = Number(source.match(/const SAVE_FORMAT_VERSION = (\d+);/)[1]);
const SAVE_KEY = `galactic-reach-save-v${formatVersion}`;
const TURN_HISTORY_KEY = `galactic-reach-turn-history-v${formatVersion}`;
const HISTORY_KEY = `galactic-reach-history-v${formatVersion}`;
const CURRENT_RULES_REVISION = Number(source.match(/const RULES_REVISION = (\d+);/)[1]);

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
    querySelectorAll: selector => (selector==='.console-tab'?tabs:selector==='.tab-panel'?panels:selector==='.hex'?created.filter(e=>e.dataset.coord):/^\[data-[a-z-]+\]$/.test(selector) ? byDataAttribute(selector) : [])
  };
  return { document, element, tabs, panels, contextButton:label=>created.filter(e=>e.tagName==='BUTTON'&&(e.textContent===label||e.innerHTML===label||e.innerHTML.startsWith(`<span>${label}</span>`))).at(-1), hex:key=>created.find(e=>e.dataset.coord===key), lastQuery: selector => queried.get(selector) || [] };
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
  context.createGalacticReach(engineOptions);
  const game = {
    dom, downloads, randomCalls:()=>randomCalls,
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
function test(name, body) { tests.push({ name, body }); }

// Plays the fresh game's first round: the human leads Operations and Buy in round 1.
function playFirstRound() {
  const storage = createStorage();
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
  assert.equal(reload.saved().log.filter(line=>line.includes('moved a group from')).length,1,'Movement completes once despite reload and repeated close');
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

test('salvage overflow resolves before the saved automatic final report',()=>{
  const storage=combatStorage(0,'tactic'),state=JSON.parse(storage.getItem(SAVE_KEY));
  for(const seat of [0,1]) {state.players[seat].resources.matter=4;state.players[seat].hand.push({key:'salvageCrews',id:`report-salvage-${seat}`});}
  writeSave(storage,state);let game=boot(storage),choices=0;
  while(game.saved().pendingCombat){assert(choices++<8);game.dom.lastQuery('[data-combat-action]')[0].click();game.settle();}
  assert(game.saved().pendingCombatReport);assert(game.dialog('overflow').open);assert(!game.dialog('message').open,'Final report waits behind the resource choice');
  assert.equal(game.saved().players[0].resources.matter,6);
  game=boot(storage);assert(game.dialog('overflow').open);assert(!game.dialog('message').open);
  game.dom.element('overflow-matter').value='2';fire(game.dom.element('overflow-matter'),'input');fire(game.dom.element('overflow-form'),'submit',{cancelable:true});game.settle();
  assert(game.dialog('message').open);assert.equal(game.saved().players[0].resources.matter,4);
  assert(game.dom.element('message-body').textContent.includes(game.saved().lastCombat.outcome));
  game.click('message-continue');assert(!game.saved().pendingCombatReport);
});

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

test('excess resources wait for the player and survive Escape', () => {
  const game = boot(overflowStorage());
  assert.equal(game.saved().players[0].resources.data, 3);
  assert.equal(game.saved().activePlayer, 1);
  assert(game.dialog('overflow').open);
  game.pressEscape('overflow');
  assert(game.dialog('overflow').open);
  assert.deepEqual(game.saved().players[0].resources,{matter:8,energy:2,biomass:0,data:3});
});

test('closing or reloading an overflow choice preserves the full collection', () => {
  const storage = overflowStorage();
  const game = boot(storage);
  game.dialog('overflow').close();
  game.settle();
  assert(game.dialog('overflow').open);
  const before = storage.getItem(SAVE_KEY);
  const reloaded = boot(storage);
  assert(reloaded.dialog('overflow').open);
  assert.equal(storage.getItem(SAVE_KEY),before);
});

test('the player can discard old resources and keep newly collected resources', () => {
  const game = boot(overflowStorage());
  game.dom.element('overflow-matter').value='3';
  game.dom.element('overflow-energy').value='0';
  game.dom.element('overflow-biomass').value='0';
  game.dom.element('overflow-data').value='0';
  fire(game.dom.element('overflow-matter'),'input');
  assert.equal(game.dom.element('overflow-confirm').disabled,false);
  fire(game.dom.element('overflow-form'),'submit',{cancelable:true});
  game.settle();
  assert(!game.dialog('overflow').open);
  assert.deepEqual(game.saved().players[0].resources,{matter:5,energy:2,biomass:0,data:3});
  assert.equal(game.saved().activePlayer,0);
});

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
test('Trade Consortium waits, preserves an exchange across reload, and finishes once',()=>{
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
});
test('Trade Consortium gain and cancellation buttons resolve explicitly',()=>{
  const storage=consortiumSave(),game=boot(storage);game.click('consortium-cancel');
  assert(!game.saved().pendingConsortium);assert.equal(game.saved().players[0].hand.length,1);
  const gainGame=boot(consortiumSave());
  gainGame.dom.lastQuery('[data-consortium-gain]').find(b=>b.dataset.consortiumGain==='biomass').click();gainGame.settle();
  assert(!gainGame.saved().pendingConsortium);assert.equal(gainGame.saved().players[0].resources.biomass,1);
});


test('paid storage button preserves Buy and survives reload without a map building', () => {
  const { storage } = playFirstRound();
  const state = JSON.parse(storage.getItem(SAVE_KEY));
  Object.assign(state, { phase: 'buy', activePlayer: 0, turnStage: 'human-buy' });
  state.players[0].resources = { matter: 1, energy: 1, biomass: 1, data: 1 };
  state.players[0].storageUpgrades = 0;
  writeSave(storage, state);
  const game = boot(storage), before = game.saved();
  game.click('upgrade-storage-button');
  assert(game.dialog('storage-allocation').open);
  assert.deepEqual(game.saved(),before,'Opening an allocation is not a paid action');
  game.dom.element('storage-points-data').value='4';fire(game.dom.element('storage-points-data'),'input');
  fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});game.settle();
  assert.equal(game.saved().players[0].resourceLimits.data,8);
  assert.equal(game.saved().players[0].storageUpgrades, 1);
  assert.equal(game.saved().phase, 'buy');
  assert.equal(game.saved().players[0].bought, before.players[0].bought);
  assert.deepEqual(game.saved().planets, before.planets);
  assert.equal(game.dom.element('capacity-value').textContent, '0 stored · four separate limits');
  const reloaded = boot(storage);
  assert.equal(reloaded.saved().players[0].storageUpgrades, 1);
  assert.equal(reloaded.dom.element('capacity-value').textContent, '0 stored · four separate limits');
});

test('converting at full storage opens the discard choice without losing the gain', () => {
  const storage=createStorage(),state=boot(storage).saved();
  state.players[0].resources={matter:4,energy:0,biomass:0,data:1};
  state.players[0].hand=[{id:'full-conversion',key:'construct',starter:true},{id:'keep-conversion',key:'move',starter:true}];
  writeSave(storage,state);
  const game=boot(storage);
  assert.equal(game.dom.element('convert-all-button').disabled,false);
  game.click('convert-all-button');
  assert(game.dialog('overflow').open);
  assert.equal(game.saved().players[0].resources.matter,5);
  assert.equal(game.saved().players[0].resources.data,1);
  assert.equal(game.saved().players[0].hand.length,1);
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
  state.players[0].hand=[{key:'excavate',id:'tab-dig'},{key:'construct',id:'tab-matter'},{key:'move',id:'tab-energy'},{key:'targetingAlgorithms',id:'tab-data'}];
  state.players[0].resources=affordable?{matter:1,energy:1,biomass:0,data:2}:{matter:0,energy:0,biomass:0,data:0};state.fleets[coord]={0:{explorer:1,fleet:1}};
  writeSave(storage,state);return {storage,coord};
}
function assertTab(game,name){
  for(const tab of game.dom.tabs){const active=tab.dataset.tab===name;assert.equal(tab.getAttribute('aria-selected'),String(active));assert.equal(tab.tabIndex,active?0:-1);}
  for(const panel of game.dom.panels)assert.equal(panel.hidden,panel.dataset.panel!==name);
}
test('Relics tab browses read-only and participates in keyboard tab navigation',()=>{
  const {storage}=excavationStorage(),game=boot(storage);assert.deepEqual(game.dom.tabs.map(t=>t.dataset.tab),['hand','market','trade','fleet','relics']);
  const before=JSON.stringify(game.saved());game.click('relics-tab');assertTab(game,'relics');assert.equal(JSON.stringify(game.saved()),before);
  const relics=game.dom.element('relics-tab');assert.equal(relics.getAttribute('role'),'tab');assert.equal(relics.getAttribute('aria-controls'),'relics-panel');assert.equal(game.dom.element('relics-panel').getAttribute('aria-labelledby'),'relics-tab');
  fire(relics,'keydown',{key:'ArrowRight',cancelable:true});assertTab(game,'hand');fire(game.dom.element('hand-tab'),'keydown',{key:'End',cancelable:true});assertTab(game,'relics');fire(relics,'keydown',{key:'Home',cancelable:true});assertTab(game,'hand');
  game.dom.hex(game.saved().clusters[0].center).click();assertTab(game,'hand');assert.equal(game.saved().actionMode,null,'Ordinary map inspection does not start excavation');
});
function productionNumbers(game) {
 const html=game.dom.element('resource-grid').innerHTML;
 return Object.fromEntries(['matter','energy','biomass','data'].map(resource=>{
  const article=html.match(new RegExp('<article class="resource-box '+resource+'"[\\s\\S]*?</article>'))?.[0];assert(article);
  const amount=Number(article.match(/class="resource-production"[^>]*>\+(\d+)/)?.[1]);assert(Number.isInteger(amount));
  assert(article.includes('+'+amount+' per round'),'Accessible name explains production');return [resource,amount];
 }));
}
test('Resource counters show starting production separately from available stock',()=>{
 const game=boot(createStorage());assert.deepEqual(productionNumbers(game),{matter:1,energy:0,biomass:0,data:0});
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
 assert.deepEqual(productionNumbers(game),{matter:1,energy:2,biomass:1,data:0});
 assert.deepEqual(game.saved().players[0].resources,state.players[0].resources,'Forecast never collects resources or caps the gross gain');
 const updated=game.saved();updated.planets[occupiedMatter].occupiedBy=null;delete updated.fleets[occupiedMatter];updated.planets[energy].owner=null;updated.fleets[biomass][0]={explorer:1};writeSave(storage,updated);
 assert.deepEqual(productionNumbers(boot(storage)),{matter:2,energy:1,biomass:0,data:0});
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
 game.click('export-game-report');const report=game.downloads.at(-1);assert(report.save.gameHistory.events.some(e=>e.text.includes('Probe was permanently trashed')));const p=report.save.state.players[0];assert(![...p.hand,...p.deck,...p.discard].some(c=>c.id==='remote-probe'));
});
test('Multiple Explorers let the player choose the Probe origin',()=>{
 const storage=createStorage(),state=boot(storage).saved();Object.assign(state,{phase:'operations',activePlayer:0,turnStage:'prep',selected:null});
 state.fleets={'2,2':{0:{explorer:1}},'-2,2':{0:{explorer:1}}};state.players[0].hand=[{id:'choose-probe',key:'probe'}];writeSave(storage,state);
 const game=boot(storage);game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='choose-probe').click();assert.equal(game.saved().activePlayer,0);assert(game.saved().players[0].hand.some(c=>c.id==='choose-probe'));
 game.dom.hex('-2,2').click();assert(![...game.saved().players[0].hand,...game.saved().players[0].deck,...game.saved().players[0].discard].some(c=>c.id==='choose-probe'));assert.equal(game.saved().activePlayer,1);
});
test('Probe UI locates a relic privately and unlocated excavation never redirects to rewards',()=>{
  const {storage,coord}=excavationStorage({affordable:true}),state=JSON.parse(storage.getItem(SAVE_KEY));
  const cluster=state.planets[coord].cluster;state.clusters[cluster].scannedBy=[];
  state.players[0].hand.push({id:'ui-probe',key:'probe'});writeSave(storage,state);
  const game=boot(storage),before=game.saved();
  assert(!game.dom.hex(coord).getAttribute('aria-label').includes('relic site'));
  game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();assertTab(game,'hand');
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
  assert(game.dom.lastQuery('[data-excavate-relic]').every(b=>b.disabled));assert.match(game.dom.element('relic-row-help').textContent,/Switch to Hand/);assert.match(game.dom.element('relic-cost').innerHTML,/Matter|matter/);
  const resumed=boot(storage);assertTab(resumed,'relics');resumed.click('hand-tab');
  for(const id of ['tab-matter','tab-energy','tab-data']){resumed.dom.lastQuery('[data-resource-card]').find(b=>b.dataset.resourceCard===id).click();assertTab(resumed,'hand');}
  assert.equal(resumed.saved().actionMode,'excavate');resumed.click('relics-tab');assert(resumed.dom.lastQuery('[data-excavate-relic]').every(b=>!b.disabled));
  const ready=resumed.saved();resumed.click('cancel-excavate');assertTab(resumed,'hand');assert.equal(resumed.saved().actionMode,null);assert.deepEqual(resumed.saved().players,ready.players);assert.deepEqual(resumed.saved().fleets,before.fleets);assert.deepEqual(resumed.saved().relicRow,before.relicRow);
});
test('Context Excavate and selecting a valid active site open Relics without redirecting other inspection',()=>{
  for(const path of ['context','site']){
    const {storage,coord}=excavationStorage({selected:path==='context',affordable:true}),game=boot(storage);
    if(path==='context'){game.dom.contextButton('Excavate relic · Excavate').click();}
    else{game.dom.lastQuery('[data-order-card]').find(b=>b.dataset.orderCard==='tab-dig').click();assertTab(game,'hand');game.dom.hex(game.saved().clusters[0].center).click();assertTab(game,'hand');game.dom.hex(coord).click();}
    assertTab(game,'relics');assert(game.dom.lastQuery('[data-excavate-relic]').every(b=>!b.disabled));assert.equal(game.saved().activePlayer,0);assert.equal(game.saved().players[0].hand.length,4);
  }
});

test('excavation UI chooses a visible reward and survives reload without its spent order', () => {
  const storage=createStorage(), state=boot(storage).saved();
  const coord=Object.keys(state.planets).find(k=>state.planets[k].special==='relic');
  state.clusters[state.planets[coord].cluster].revealedBy=[0,1,2,3];state.clusters[state.planets[coord].cluster].scannedBy=[0];
  state.selected=coord;state.players[0].hand=[{key:'excavate',id:'ui-dig'}];
  state.players[0].resources={matter:1,energy:1,biomass:0,data:2};
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
  for(const [key,name] of [[coord,'Violet Assembly'],[empty,'Helios Compact']]) {
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
 const game=boot(storage);game.dom.element('upgrade-resource').value='energy';fire(game.dom.element('upgrade-resource'),'change');
 game.dom.lastQuery('[data-upgrade-card]').find(b=>b.dataset.upgradeCard==='ui-upgrade').click();
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
 assert(yard.dom.contextButton('Commission Explorer + Probe + Excavate'));
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
 assert.match(game.dom.element('message-body').textContent,/gained 1 Prestige/);
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
 assert.match(game.dom.element('prestige-title').textContent,/14 Prestige/);
 const rows=game.dom.element('prestige-breakdown').innerHTML;
 assert.match(rows,/Colonies · 3 each<\/dt><dd>9/);assert(!rows.includes('Expansion bonus'));
 assert.match(rows,/Excavated relics · 2 each<\/dt><dd>4/);assert.match(rows,/Decisive combat victories<\/dt><dd>1/);
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
 assert.equal(report.factions[1].botProfile.strategy,'military');assert.equal(report.factions[0].points.total,3);
 assert(report.logText.includes('Controlled planets produced'));assert(report.logText.includes('+1 Matter'));
 assert(report.save.gameHistory.events.some(event=>event.changes.some(change=>change.path.join('.')==='players.0.hand')));
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
 reload.click('new-game-button').click('export-game-report');const fresh=reload.downloads.at(-1);
 assert(fresh.coverage.complete);assert(fresh.coverage.events<20);assert(!fresh.logText.includes('exchanged 4 Matter'));
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
   assert(turn<350,'Browser rivals should finish a game');
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
test('Trade Consortium commits into play on its first exchange across reload',()=>{
 const storage=consortiumSave(),game=boot(storage);game.dom.element('consortium-give').value='matter';game.dom.element('consortium-get').value='energy';fire(game.dom.element('consortium-form'),'submit');game.settle();assert.equal(game.saved().players[0].hand.length,0);assert.equal(game.saved().players[0].inPlay.filter(c=>c.id==='choice-card').length,1);const reload=boot(storage);assert(reload.dialog('consortium').open);reload.click('consortium-finish');assert.equal(reload.saved().players[0].inPlay.filter(c=>c.id==='choice-card').length,1);
});


test('storage allocations cancel atomically, survive commitment and undo with the turn',()=>{
 const storage=createStorage(),state=boot(storage).saved();state.players[0].resources={matter:2,energy:2,biomass:2,data:2};writeSave(storage,state);
 let game=boot(storage),before=game.saved();game.click('upgrade-storage-button');assert(game.dialog('storage-allocation').open);
 for(const r of ['matter','energy','biomass','data'])game.dom.element('storage-points-'+r).value='0';
 game.dom.element('storage-points-data').value='3';fire(game.dom.element('storage-points-data'),'input');assert(game.dom.element('storage-allocation-confirm').disabled);
 fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});assert.deepEqual(game.saved(),before);
 game.click('storage-allocation-cancel');assert(!game.dialog('storage-allocation').open);assert.deepEqual(game.saved(),before);
 game.click('upgrade-storage-button');game.dom.element('storage-points-data').value='4';fire(game.dom.element('storage-points-data'),'input');game=boot(storage);assert.deepEqual(game.saved(),before,'Reloading a draft spends nothing');
 game.click('upgrade-storage-button');for(const r of ['matter','energy','biomass','data'])game.dom.element('storage-points-'+r).value='1';fire(game.dom.element('storage-points-data'),'input');
 fire(game.dom.element('storage-allocation-form'),'submit',{cancelable:true});game.settle();assert.deepEqual(game.saved().players[0].resourceLimits,{matter:5,energy:5,biomass:5,data:5});
 game.click('export-game-report');const report=game.downloads.at(-1);assert.deepEqual(report.save.state.players[0].resourceLimits,game.saved().players[0].resourceLimits);
 assert(report.save.gameHistory.events.some(e=>e.changes.some(c=>c.path.join('.')==='players.0.resourceLimits.data')));
 const reload=boot(storage);assert.deepEqual(reload.saved(),game.saved());reload.click('pass-button');reload.click('undo-turn-button');assert.deepEqual(reload.saved().players[0].resourceLimits,before.players[0].resourceLimits);
});

let failed = 0;
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
