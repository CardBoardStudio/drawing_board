// Learn to play's saved place (prototypes/galactic-reach/tutorial.js, docs/rules/tutorial.md):
// choosing Learn to play resumes only a walkthrough left part-way; otherwise it deals the practice
// game again before app.js reads it. Reloads keep the walkthrough, the guest save is never
// touched, unreadable stored data never breaks the page, and a restart in another tab is followed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../prototypes/galactic-reach/tutorial.js'), 'utf8');
const PROGRESS = 'galactic-reach-tutorial-progress-v1';
const RULES = /const RULES = '([^']+)'/.exec(source)[1];
const PRACTICE = ['galactic-reach-tutorial-save-v39', 'galactic-reach-tutorial-history-v39', 'galactic-reach-tutorial-turn-history-v39'];
const GUEST = ['galactic-reach-save-v39', 'galactic-reach-history-v39', 'galactic-reach-turn-history-v39', 'galactic-reach-guide-v1'];

// localStorage keeps its entries as own enumerable keys: tutorial.js lists them with Object.keys.
function storage(entries, { blocked = false } = {}) {
  const store = {};
  const method = fn => ({ value: blocked ? () => { throw new Error('blocked'); } : fn });
  Object.defineProperties(store, {
    getItem: method(key => (Object.hasOwn(store, key) ? store[key] : null)),
    setItem: method((key, value) => { store[key] = String(value); }),
    removeItem: method(key => { delete store[key]; }),
  });
  Object.assign(store, entries);
  return store;
}

function open({ entries = {}, navigation = 'navigate', search = '?tutorial=1', blocked = false, performance } = {}) {
  const localStorage = storage(entries, { blocked });
  const listeners = {};
  let reloads = 0;
  const element = { classList: { add() {} }, addEventListener() {}, hidden: false, textContent: '' };
  const context = {
    URLSearchParams, JSON, Number, Object, Math, Boolean, String, Array,
    localStorage,
    location: { search, pathname: '/galactic-reach/', reload: () => { reloads += 1; } },
    performance: performance !== undefined ? performance : { getEntriesByType: type => (type === 'navigation' && navigation ? [{ type: navigation }] : []) },
    document: { readyState: 'complete', title: 'Heirs Ad Astra', body: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { context, localStorage, keys: () => Object.keys(localStorage).sort(), fire: (type, event) => (listeners[type] || []).forEach(fn => fn(event)), reloads: () => reloads };
}

const practice = progress => ({
  [PROGRESS]: typeof progress === 'string' ? progress : JSON.stringify({ rules: RULES, view: progress.step, base: null, staged: { 'first-construct': true }, cardFirst: true, ...progress }),
  ...Object.fromEntries(PRACTICE.map(key => [key, '{"round":2}'])),
  ...Object.fromEntries(GUEST.map(key => [key, '{"guest":true}'])),
});
const guestOnly = GUEST.slice().sort();
const everything = [...GUEST, ...PRACTICE, PROGRESS].sort();

// A walkthrough still on its first step (the player may have played on, Lesson 1 never advanced):
// choosing Learn to play deals the practice game again, as its "Learn to play" label promises.
{
  const page = open({ entries: practice({ step: 0, stepId: 'first-construct' }) });
  assert.deepEqual(page.keys(), guestOnly, 'a new walkthrough must not inherit the earlier practice table');
  assert.equal(page.context.galacticReachTutorial.progress().step, 0);
  assert.equal(JSON.stringify(page.context.galacticReachTutorial.progress().staged), '{}', 'the opening hand is staged again');
}
// A finished walkthrough: Learn to play starts it again.
assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }) }).keys(), guestOnly);
// Left part-way ("Continue Learn to play"): the place and the practice game are resumed.
{
  const page = open({ entries: practice({ step: 8, stepId: 'convert-rest' }) });
  assert.deepEqual(page.keys(), everything);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'convert-rest');
}
// A place saved at Lesson 1's former second step (its Move conversion, now part of the first step)
// was left part-way: it resumes on the same practice game, at Lesson 1.
{
  const page = open({ entries: practice({ step: 1, stepId: 'convert-move' }) });
  assert.deepEqual(page.keys(), everything);
  // The smallest table the first step reads: your Move not yet converted (no Energy).
  page.context.galacticReachGuide = { handCard: () => null, hex: () => null, turnButton: () => null };
  const player = { resources: { matter: 1, energy: 0, biomass: 1, data: 1 }, hand: [], deck: [], discard: [], inPlay: [] };
  const state = { tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, players: [player], planets: {}, clusters: [], fleets: {} };
  const tip = page.context.galacticReachTutorial.tip({ state, structures: { harvester: { cost: { energy: 1 } } }, turnSerial: () => 1, stage: () => true }, null);
  assert.match(tip.eyebrow, /^Lesson 1 of /);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'first-construct');
}
// A place saved before steps were named still resumes.
assert.deepEqual(open({ entries: practice({ step: 3, stepId: undefined }) }).keys(), everything);
// A reload or Back/Forward keeps the same walkthrough, even on its first step or once finished.
for (const navigation of ['reload', 'back_forward']) {
  assert.deepEqual(open({ entries: practice({ step: 0, stepId: 'first-construct' }), navigation }).keys(), everything, navigation);
  assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }), navigation }).keys(), everything, navigation);
}
// Browsers without navigation timing treat the page as newly chosen.
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: null }).keys(), guestOnly);
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: { getEntriesByType: () => { throw new Error('unsupported'); } } }).keys(), guestOnly);
// Unreadable or older stored places cannot be resumed: the page still loads and starts clean.
for (const stored of ['{not json', 'null', '5', '"text"', '[]', '{"step":"8"}', '{"step":-1}', '{"step":1.5}']) {
  const page = open({ entries: practice(stored) });
  assert.deepEqual(page.keys(), guestOnly, stored);
  assert.equal(page.context.galacticReachTutorial.progress().step, 0, stored);
}
// Blocked storage never stops the walkthrough from loading.
assert.equal(open({ entries: {}, blocked: true }).context.galacticReachTutorial.active, true);
// Outside Learn to play nothing is read, cleared or watched, whatever is saved.
{
  const page = open({ entries: practice({ step: 0 }), search: '' });
  assert.equal(page.context.galacticReachTutorial.active, false);
  assert.deepEqual(page.keys(), everything);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 0);
}
// Another tab restarted the walkthrough (its place removed): this tab reloads onto the new one
// instead of writing the old practice game back. Its ordinary saves do not reload it.
{
  const page = open({ entries: practice({ step: 12, stepId: 'shipyard-aim' }) });
  page.fire('storage', { key: PROGRESS, newValue: JSON.stringify({ step: 13 }) });
  page.fire('storage', { key: 'galactic-reach-tutorial-save-v39', newValue: null });
  page.fire('storage', { key: 'galactic-reach-save-v39', newValue: null });
  assert.equal(page.reloads(), 0);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 1);
}
console.log('Learn to play progress: new walkthroughs start clean, part-way places resume, reloads keep their place, guest saves and unreadable data are safe, other tabs follow a restart.');
