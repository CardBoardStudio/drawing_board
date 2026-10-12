// Completed AI matches step through the live table's own UI (`?replay=<match id>`).
// Observer only: frames are recorded state deltas; no rules or randomness run here.
'use strict';
(() => {
  const RULES = 'galactic-reach/6.11';
  const CHECKPOINT = 25;
  // Headless matches log the browser's default faction names; seat 0 is "You".
  const FACTIONS = ['You', 'Ember Directorate', 'Violet Assembly', 'Helios Compact'];
  const FACTION_PATTERN = /\b(Ember Directorate|Violet Assembly|Helios Compact|Your|You)\b/g;

  function applyChanges(state, changes) {
    for (const change of changes) {
      const path = change.path;
      if (!path.length) { state = structuredClone(change.value); continue; }
      let parent = state;
      for (const key of path.slice(0, -1)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Invalid replay path');
        parent = parent[key];
      }
      const key = path.at(-1);
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Invalid replay path');
      if (change.remove) delete parent[key]; else parent[key] = structuredClone(change.value);
    }
    return state;
  }

  // Rewrites recorded faction names to the match's AI players. A sentence that opens
  // with "You" was written by the acting seat's rules text, even for computer seats.
  function renameFactions(text, names, actor = 0) {
    const [prefix, body] = /^(R\d+ · )?([\s\S]*)$/.exec(String(text)).slice(1);
    let first = true;
    return (prefix || '') + body.replace(FACTION_PATTERN, (match, _name, offset) => {
      const leading = first && offset === 0;
      first = false;
      if (match === 'You' || match === 'Your') {
        const name = names[leading ? actor : 0];
        return match === 'Your' ? `${name}’s` : name;
      }
      return names[FACTIONS.indexOf(match)];
    });
  }

  // The log only grows at the front and is capped, so the old lines form its tail.
  function newLines(before, after) {
    for (let added = Math.max(0, after.length - before.length); added < after.length; added += 1)
      if (after.slice(added).every((line, index) => line === before[index])) return added;
    return after.length;
  }

  // One pass over every decision: derives what replays do not record directly
  // (purchases, completed trades, pending Colonize II builds, renamed log lines).
  function analyse(data, describe, names) {
    let state = structuredClone(data.initial);
    const checkpoints = new Map([[0, structuredClone(state)]]);
    const bought = [0, 0, 0, 0];
    const trades = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    let pending = null;
    let log = (state.log || []).map(line => renameFactions(line, names));
    const steps = [];
    const step = decision => steps.push({ cardsPurchased: [...bought], tradesWith: trades.map(row => [...row]), pendingColonyBuild: pending, decision, log });
    step(null);
    data.frames.forEach((frame, index) => {
      const { seat, action } = frame;
      const decision = { seat, ...describe(seat, action, state, names), combat: frame.changes.some(change => change.path[0] === 'lastCombat') };
      if (action.type === 'colonize' && state.players[seat].hand.find(card => card.id === action.card)?.upgraded) pending = { playerId: seat, colony: action.coord };
      if (action.type === 'colony_build' || action.type === 'finish_colony_build') pending = null;
      if (action.type === 'buy') bought[seat] += 1;
      const before = state.log || [];
      state = applyChanges(state, frame.changes);
      const offer = action.type === 'trade_accept' && state.tradeOffers.find(o => o.id === action.offer);
      if (offer && offer.status === 'accepted' && offer.acceptedBy === seat) { trades[seat][offer.from] += 1; trades[offer.from][seat] += 1; }
      const after = state.log || [];
      const added = newLines(before, after);
      log = [...after.slice(0, added).map(line => renameFactions(line, names, seat)), ...log].slice(0, after.length);
      if ((index + 1) % CHECKPOINT === 0) checkpoints.set(index + 1, structuredClone(state));
      step(decision);
    });
    const rounds = new Map([[data.initial.round, 0]]);
    data.frames.forEach((frame, index) => { if (!rounds.has(frame.round)) rounds.set(frame.round, index + 1); });
    return { checkpoints, steps, rounds };
  }

  function stateAt(data, analysis, target) {
    let from = Math.floor(target / CHECKPOINT) * CHECKPOINT;
    let state = structuredClone(analysis.checkpoints.get(from));
    while (from < target) { state = applyChanges(state, data.frames[from].changes); from += 1; }
    return state;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { applyChanges, renameFactions, analyse, stateAt, RULES };
    return;
  }
  const id = new URLSearchParams(location.search).get('replay');
  if (id === null) return;
  globalThis.drawingBoardTableBoot = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arena = '/?game=galactic-reach#arena';

  document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('has-replay');
    const shell = document.querySelector('.app-shell');
    shell.inert = true;
    // Replay-only controls sit above the unchanged live layout; only stepping stays pinned.
    const meta = document.createElement('section');
    meta.className = 'replay-meta';
    meta.setAttribute('aria-label', 'Replay');
    meta.innerHTML = `<a class="button button-ghost" href="${arena}">← AI arena</a><strong class="replay-indicator"><span aria-hidden="true">◉</span> Replay / all information visible</strong><span id="replay-summary" role="status">Verifying replay…</span><label class="replay-select">Round<select id="replay-round" disabled></select></label><label class="replay-select">Command view<select id="replay-view" disabled><option value="active">Follow acting faction</option></select></label>`;
    const controls = document.createElement('section');
    controls.className = 'replay-controls';
    controls.setAttribute('aria-label', 'Replay stepping');
    controls.innerHTML = `<div class="replay-transport"><button class="button button-ghost" id="replay-prev" type="button" aria-label="Previous decision" disabled>← <span class="replay-word">Previous</span></button><button class="button button-primary" id="replay-play" type="button" aria-pressed="false" disabled>Play</button><button class="button button-ghost" id="replay-next" type="button" aria-label="Next decision" disabled><span class="replay-word">Next</span> →</button></div><label class="replay-scrub"><span>Decision <output id="replay-position">0 / 0</output></span><input id="replay-step" type="range" min="0" max="0" value="0" step="1" disabled></label>`;
    shell.before(meta, controls);
    const $ = selector => document.querySelector(selector);
    const library = document.querySelector('.header-actions a');
    library.textContent = 'AI arena'; library.href = arena;

    let data;
    try {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new Error('Invalid replay link. Return to the AI arena.');
      const response = await fetch(`/api/arena/replays/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-drawing-board': '1' }, body: '{}' });
      const value = await response.json();
      if (!response.ok) throw Object.assign(new Error(value.error || 'This replay could not be opened.'), { status: response.status });
      if (value.match.rules_version !== RULES) throw new Error(`This replay uses ${value.match.rules_version}. Open it from the AI arena.`);
      data = value;
    } catch (error) {
      $('#replay-summary').textContent = error.message;
      if (error.status === 401) {
        const link = document.createElement('a'); link.className = 'button button-ghost'; link.textContent = 'Sign in to watch this replay';
        link.href = `/?return_to=${encodeURIComponent(`/galactic-reach/?replay=${id}`)}#account`; meta.append(link);
      }
      return;
    }

    const match = data.match;
    const names = match.names;
    let index = 0, timer = null, selected = null;
    const view = globalThis.createGalacticReach({ replay: true, onSelect: key => { selected = key; } });
    const analysis = analyse(data, view.describe, names);
    const last = data.frames.length;
    const elo = names.map((_, seat) => ({ before: match.before[seat], after: match.after[seat] }));
    document.title = `Replay · ${names.join(' vs ')} · Galactic Reach`;
    $('#replay-summary').textContent = `${match.pool.includes(':placement:') ? 'Placement Elo' : 'Original win/loss Elo'} · ${data.summary.rounds} rounds · ${last} decisions`;
    $('#replay-round').innerHTML = [...analysis.rounds].map(([round, step]) => `<option value="${step}">${round}</option>`).join('');
    $('#replay-view').insertAdjacentHTML('beforeend', names.map((name, seat) => `<option value="${seat}">${esc(name)}</option>`).join(''));
    $('#replay-step').max = last;
    // Reserve the widest position label so the slider never shifts while stepping.
    const position = $('.replay-scrub > span');
    $('#replay-position').value = `${last} / ${last}`;
    position.style.minWidth = `${Math.ceil(position.getBoundingClientRect().width) + 2}px`;
    [meta, controls].forEach(section => section.querySelectorAll('button, select, input').forEach(control => { control.disabled = false; }));

    function viewSeat(raw) {
      const choice = $('#replay-view').value;
      if (choice !== 'active') return Number(choice);
      return analysis.steps[index].decision?.seat ?? raw.active ?? 0;
    }
    function show() {
      const raw = stateAt(data, analysis, index);
      const step = analysis.steps[index];
      const observed = { ...raw, log: step.log, lastCombat: raw.lastCombat && { ...raw.lastCombat, summary: raw.lastCombat.summary.map(line => renameFactions(line, names)), outcome: renameFactions(raw.lastCombat.outcome, names) } };
      view.show(observed, { names, selected, viewSeat: viewSeat(raw), cardsPurchased: step.cardsPurchased, tradesWith: step.tradesWith, pendingColonyBuild: step.pendingColonyBuild, decision: step.decision, elo: index === last ? elo : null });
      $('#replay-position').value = `${index} / ${last}`;
      $('#replay-step').value = index;
      $('#replay-step').setAttribute('aria-valuetext', `Decision ${index} of ${last}, round ${raw.round}`);
      $('#replay-prev').disabled = index === 0;
      $('#replay-next').disabled = index === last;
      $('#replay-round').value = String(analysis.rounds.get(raw.round) ?? 0);
    }
    function stop() { clearInterval(timer); timer = null; $('#replay-play').textContent = 'Play'; $('#replay-play').setAttribute('aria-pressed', 'false'); }
    function seek(target) {
      index = Math.max(0, Math.min(last, Number(target)));
      show();
      if (index === last) stop();
    }
    $('#replay-prev').addEventListener('click', () => { stop(); seek(index - 1); });
    $('#replay-next').addEventListener('click', () => { stop(); seek(index + 1); });
    $('#replay-step').addEventListener('input', event => { stop(); seek(event.target.value); });
    $('#replay-round').addEventListener('change', event => { stop(); seek(event.target.value); });
    $('#replay-view').addEventListener('change', show);
    $('#replay-play').addEventListener('click', () => {
      if (timer) { stop(); return; }
      if (index === last) seek(0);
      $('#replay-play').textContent = 'Pause'; $('#replay-play').setAttribute('aria-pressed', 'true');
      timer = setInterval(() => seek(index + 1), 750);
    });
    shell.inert = false;
    show();
  });
})();
