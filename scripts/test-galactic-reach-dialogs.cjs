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
const formatVersion = Number(source.match(/const SAVE_FORMAT_VERSION = (\d+);/)[1]);
const SAVE_KEY = `galactic-reach-save-v${formatVersion}`;
const TURN_HISTORY_KEY = `galactic-reach-turn-history-v${formatVersion}`;
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

function fire(target, type, { cancelable = false } = {}) {
  const event = {
    type, target, currentTarget: target, cancelable, defaultPrevented: false,
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
    focus() {}
    click() { fire(this, 'click'); }
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
      return button;
    }));
    queried.set(selector, found);
    return found;
  }

  const document = {
    body: new FakeElement('body'),
    documentElement: { clientWidth: 1280 },
    addEventListener() {},
    createElement: tag => {const e=new FakeElement(tag);created.push(e);return e;},
    querySelector: selector => (selector.startsWith('#') ? element(selector.slice(1)) : selector.startsWith('.hex[data-coord=') ? created.find(e=>e.dataset.coord===selector.match(/"([^"]+)"/)[1]) : null),
    querySelectorAll: selector => (selector==='.hex'?created.filter(e=>e.dataset.coord):/^\[data-[a-z-]+\]$/.test(selector) ? byDataAttribute(selector) : [])
  };
  return { document, element, hex:key=>created.find(e=>e.dataset.coord===key), lastQuery: selector => queried.get(selector) || [] };
}

function boot(storage, seed = 20261013, location = {hostname:'localhost',search:''}) {
  const timers = createTimers();
  const dom = createDom(timers);
  const errors = [];
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = vm.createContext({
    Math: math, URLSearchParams, location,
    document: dom.document,
    window: { innerHeight: 900, addEventListener() {} },
    localStorage: storage,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    confirm: () => true,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) }
  });
  vm.runInContext(`${adapterSource}\n${source}`, context, { filename: sourcePath });
  const game = {
    dom,
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
  state.fleets={'11,-11':{[attacker]:{fleet:1,explorer:0,settler:0}},'10,-11':{[defender]:{fleet:1,explorer:0,settler:0}}};
  state.players.forEach((p,id)=>{p.hand=id===attacker?[{key:'move',id:'dialog-combat-move'}]:[];p.resources={matter:0,energy:0,biomass:0,data:0};});
  a.applyAction(attacker,a.legalActions(attacker).find(x=>x.type==='move'&&x.source==='11,-11'&&x.destination==='10,-11'));
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
  assert.equal(reload.saved().players[attacker].discard.filter(c=>c.id==='dialog-combat-move').length,1);
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
  for(const seat of [0,1]) {state.players[seat].resources.data=10;state.players[seat].hand.push({key:'salvageCrews',id:`report-salvage-${seat}`});}
  writeSave(storage,state);let game=boot(storage),choices=0;
  while(game.saved().pendingCombat){assert(choices++<8);game.dom.lastQuery('[data-combat-action]')[0].click();game.settle();}
  assert(game.saved().pendingCombatReport);assert(game.dialog('overflow').open);assert(!game.dialog('message').open,'Final report waits behind the resource choice');
  assert.equal(game.saved().players[0].resources.matter,2);
  game=boot(storage);assert(game.dialog('overflow').open);assert(!game.dialog('message').open);
  game.dom.element('overflow-data').value='2';fire(game.dom.element('overflow-data'),'input');fire(game.dom.element('overflow-form'),'submit',{cancelable:true});game.settle();
  assert(game.dialog('message').open);assert.equal(game.saved().players[0].resources.matter,2);
  assert(game.dom.element('message-body').textContent.includes(game.saved().lastCombat.outcome));
  game.click('message-continue');assert(!game.saved().pendingCombatReport);
});

test('pass opens Buy before any rival acts, and a Buy reload can finish', () => {
  const storage = createStorage();
  const game = boot(storage);
  game.click('convert-all-button');
  const converted = game.saved();
  assert(converted.players[0].discard.length > 0);
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
  state.players[0].resources = { matter: 8, energy: 2, biomass: 0, data: 3 };
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
  assert.equal(state.visibilityRevision, 2);
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
  state.players[0].resources={matter:6,energy:0,biomass:0,data:0};
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
  assert.equal(reloaded.saved().players[0].discard.filter(c=>c.id==='choice-card').length,1);
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
  state.players[0].resources = { matter: 2, energy: 1, biomass: 0, data: 1 };
  state.players[0].storageUpgrades = 0;
  writeSave(storage, state);
  const game = boot(storage), before = game.saved();
  game.click('upgrade-storage-button');
  assert.equal(game.saved().players[0].storageUpgrades, 1);
  assert.equal(game.saved().phase, 'buy');
  assert.equal(game.saved().players[0].bought, before.players[0].bought);
  assert.deepEqual(game.saved().planets, before.planets);
  assert.equal(game.dom.element('capacity-value').textContent, '0 of 15 stored');
  const reloaded = boot(storage);
  assert.equal(reloaded.saved().players[0].storageUpgrades, 1);
  assert.equal(reloaded.dom.element('capacity-value').textContent, '0 of 15 stored');
});

test('converting at full storage opens the discard choice without losing the gain', () => {
  const storage=createStorage(),state=boot(storage).saved();
  state.players[0].resources={matter:9,energy:0,biomass:0,data:1};
  state.players[0].hand=[{id:'full-conversion',key:'construct',starter:true},{id:'keep-conversion',key:'move',starter:true}];
  writeSave(storage,state);
  const game=boot(storage);
  assert.equal(game.dom.element('convert-all-button').disabled,false);
  game.click('convert-all-button');
  assert(game.dialog('overflow').open);
  assert.equal(game.saved().players[0].resources.matter,10);
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


test('excavation UI chooses a visible reward and survives reload without its spent order', () => {
  const storage=createStorage(), state=boot(storage).saved();
  const coord=Object.keys(state.planets).find(k=>state.planets[k].special==='relic');
  state.clusters[state.planets[coord].cluster].revealedBy=[0,1,2,3];
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

test('map and Sector Scan show every faction in fog and empty space', () => {
  const storage=createStorage(), state=boot(storage).saved(), coord=state.clusters[4].coords[1];
  const empty=['-11,11','11,-11','0,0'].find(key=>!state.planets[key]);assert(empty);
  state.clusters[4].revealedBy=[];state.clusters[4].scannedBy=[];
  state.fleets[coord]={2:{explorer:1,fleet:2}};state.fleets[empty]={3:{settler:1}};
  writeSave(storage,state);const game=boot(storage);
  for (const [key,name] of [[coord,'Violet Assembly'],[empty,'Helios Compact']]) {
    const hex=game.dom.hex(key);assert(hex.querySelector('.hex-fleets').innerHTML.includes('hex-fleet-group'));
    assert(hex.getAttribute('aria-label').includes(name));
    hex.click();assert(game.dom.element('inspect-facts').innerHTML.includes(name));
  }
  assert(game.dom.hex(coord).className.includes('unknown-world'),'Visible units do not reveal terrain');
});

test('development reveal restores fog and leaves saved discovery unchanged', () => {
  const storage=createStorage(), state=boot(storage).saved(), coord=state.clusters[4].coords[1];
  state.planets[coord].owner=2;state.planets[coord].upgrade='harvester';state.planets[coord].upgradeLevel=1;
  state.fleets[coord]={2:{fleet:1}};state.selected=coord;
  writeSave(storage,state);
  const game=boot(storage,20261013,{hostname:'localhost',search:'?dev=1'}), before=storage.getItem(SAVE_KEY);
  assert.equal(game.dom.element('development-tools').hidden,false);
  const toggle=game.dom.element('reveal-entire-map'), hex=game.dom.hex(coord);
  assert(hex.className.includes('unknown-world'));assert.equal(hex.querySelector('.hex-buildings').innerHTML,'');
  toggle.checked=true;fire(toggle,'change');
  assert(!hex.className.includes('unknown-world'));assert(hex.querySelector('.hex-buildings').innerHTML);
  toggle.checked=false;fire(toggle,'change');
  assert(hex.className.includes('unknown-world'));assert.equal(hex.querySelector('.hex-buildings').innerHTML,'');
  assert(hex.querySelector('.hex-fleets').innerHTML);assert.equal(storage.getItem(SAVE_KEY),before);
  assert.equal(boot(storage,20261013,{hostname:'drawing-board-p0g3.onrender.com',search:'?dev=1'}).dom.element('development-tools').hidden,true,'Stable host never exposes development controls');
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
