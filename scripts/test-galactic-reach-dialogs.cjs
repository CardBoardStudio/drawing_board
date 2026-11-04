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
    querySelector() { return new FakeElement(); }
    querySelectorAll() { return []; }
    appendChild(child) { return child; }
    insertAdjacentHTML(_, html) { this.innerHTML += html; }
    setAttribute() {}
    getAttribute() { return null; }
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
    createElement: tag => new FakeElement(tag),
    querySelector: selector => (selector.startsWith('#') ? element(selector.slice(1)) : null),
    querySelectorAll: selector => (/^\[data-[a-z-]+\]$/.test(selector) ? byDataAttribute(selector) : [])
  };
  return { document, element, lastQuery: selector => queried.get(selector) || [] };
}

function boot(storage, seed = 20261013) {
  const timers = createTimers();
  const dom = createDom(timers);
  const errors = [];
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = vm.createContext({
    Math: math,
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

const tests = [];
function test(name, body) { tests.push({ name, body }); }

// Plays the fresh game's first round: the human leads Operations and Buy in round 1.
function playToRoundOneDirective() {
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
  assert.equal(reloaded.saved().phase, 'directive');
});

test('a new game reaches the human-chosen directive at the end of round 1', () => {
  const { game } = playToRoundOneDirective();
  assert.equal(game.saved().phase, 'directive');
  assert.equal(game.dialog('directive').open, true);
  game.saved().players.forEach(player => {
    const stored = Object.values(player.resources).reduce((sum, value) => sum + value, 0);
    assert.ok(stored <= 10, `${player.name} stores ${stored} resources without a Warehouse`);
  });
});

test('Escape cannot dismiss the directive dialog', () => {
  const { game } = playToRoundOneDirective();
  game.pressEscape('directive');
  assert.equal(game.dialog('directive').open, true);
  assert.equal(game.saved().phase, 'directive');
});

test('a directive dialog closed without a choice reopens', () => {
  const { game } = playToRoundOneDirective();
  game.dialog('directive').close();
  game.settle();
  assert.equal(game.dialog('directive').open, true);
});

test('reloading during the directive reopens it and the choice continues the game', () => {
  const { storage } = playToRoundOneDirective();
  const reloaded = boot(storage);
  assert.equal(reloaded.dialog('directive').open, true);
  const [choice] = reloaded.dom.lastQuery('[data-directive]');
  assert.ok(choice, 'the directive dialog rendered its choices');
  choice.click();
  reloaded.settle();
  const state = reloaded.saved();
  assert.equal(state.round, 2);
  assert.equal(state.phase, 'operations');
  assert.equal(reloaded.dialog('directive').open, false);
});

// The review's reproduction: the last AI Buy turn of round 3 opens the policy ballot.
function reachRoundThreeBallot() {
  const { storage } = playToRoundOneDirective();
  const state = JSON.parse(storage.getItem(SAVE_KEY));
  Object.assign(state, { round: 3, phase: 'buy', firstPlayer: 0, activePlayer: 3, turnStage: 'ai-buy' });
  writeSave(storage, state);
  storage.removeItem(TURN_HISTORY_KEY);
  const game = boot(storage);
  assert.equal(game.saved().phase, 'policy');
  assert.equal(game.dialog('policy').open, true);
  return { storage, game };
}

test('Escape cannot dismiss the policy ballot', () => {
  const { game } = reachRoundThreeBallot();
  game.pressEscape('policy');
  assert.equal(game.dialog('policy').open, true);
  assert.equal(game.saved().phase, 'policy');
});

test('a policy ballot closed without a vote reopens', () => {
  const { game } = reachRoundThreeBallot();
  game.dialog('policy').close();
  game.settle();
  assert.equal(game.dialog('policy').open, true);
});

test('reloading during the ballot reopens it and voting moves on to the directive', () => {
  const { storage } = reachRoundThreeBallot();
  const reloaded = boot(storage);
  assert.equal(reloaded.dialog('policy').open, true);
  fire(reloaded.dom.element('policy-form'), 'submit');
  reloaded.settle();
  const state = reloaded.saved();
  assert.ok(state.activePolicy, 'a policy was enacted');
  assert.equal(state.phase, 'directive');
  assert.equal(reloaded.dialog('policy').open, false);
  assert.equal(reloaded.dialog('directive').open, true);
});

test('a current save loads without being rewritten', () => {
  const { storage } = playToRoundOneDirective();
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
  const { storage } = playToRoundOneDirective();
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
  const { storage } = playToRoundOneDirective();
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
test('public votes before the human remain visible and are not charged again on reload',()=>{
  const {storage}=reachRoundThreeBallot(),state=JSON.parse(storage.getItem(SAVE_KEY));
  state.firstPlayer=2;state.activePlayer=2;state.policyVotes=[];
  for(const p of state.players){p.tracks.expansion=5;p.tracks.culture=5;}
  writeSave(storage,state);const game=boot(storage),before=game.saved();
  assert.deepEqual(before.policyVotes.map(v=>v.seat),[2,3]);
  assert.equal(before.activePlayer,0);assert.match(game.dom.element('policy-votes').innerHTML,/Violet Assembly/);
  const reloaded=boot(storage);assert.deepEqual(reloaded.saved(),before);
  fire(reloaded.dom.element('policy-form'),'submit');reloaded.settle();
  assert.deepEqual(reloaded.saved().policyVotes.map(v=>v.seat),[2,3,0,1]);
  assert(!reloaded.dialog('policy').open);
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
