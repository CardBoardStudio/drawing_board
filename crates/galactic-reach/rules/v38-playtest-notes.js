/* Save-compatible playtest annotations. Reads rendered UI; never reads or writes a game save. */
(function (host) {
  'use strict';
  const ISSUE_BASE = 'https://github.com/CardBoardStudio/drawing_board/issues/new';
  function safeUrl(value) {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : ''; } catch (_) { return ''; }
  }
  function issueBody(notes, current) {
    const rows = notes.filter(n => n.include !== false);
    return ['## Playtest feedback', '', `Game: ${current.game || 'Galactic Reach'}`, `Rules: ${current.rules || 'unspecified'}`, `Playtest: ${safeUrl(current.url)}`, '', ...rows.flatMap((note, i) => {
      const c = note.context || {}, target = note.target;
      const where = [c.rules && `rules ${c.rules}`, c.round && `round ${c.round}`, c.phase, c.active && `active: ${c.active}`].filter(Boolean).join(' · ');
      return [`### ${i + 1}. ${target?.label || 'General observation'}`, where, note.createdAt ? `Recorded: ${note.createdAt}` : '', target?.coord ? `Map hex: ${target.coord}` : '', '', note.text, ''];
    })].filter(line => line !== undefined).join('\n');
  }
  function issueLink(title, body) {
    const base = ISSUE_BASE + '?title=' + encodeURIComponent(title || 'Galactic Reach playtest feedback');
    const full = base + '&body=' + encodeURIComponent(body);
    return {url: full.length <= 7000 ? full : base, needsCopy: full.length > 7000};
  }
  function normalize(value) {
    const data = value && typeof value === 'object' ? value : {};
    return {notes: Array.isArray(data.notes) ? data.notes.filter(n => n && typeof n.id === 'string' && typeof n.text === 'string') : [], draft: data.draft && typeof data.draft.text === 'string' ? data.draft : {text: '', target: null, context: null}, editing: typeof data.editing === 'string' ? data.editing : null, title: typeof data.title === 'string' ? data.title : ''};
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {safeUrl, issueBody, issueLink, normalize}; return; }
  const doc = host.document;
  if (!doc || doc.getElementById('playtest-notes-root')) return;
  const script = doc.currentScript;
  const game = script?.dataset.game || 'Galactic Reach', rules = script?.dataset.rules || 'unspecified';
  const key = `drawing-board-playtest-notes-v1:${game}:${rules}`;
  let data, pickMode = false, removed = null, frame = null;
  try { data = normalize(JSON.parse(host.localStorage.getItem(key))); } catch (_) { data = normalize(null); }
  const context = () => ({game, rules, url: safeUrl(host.location.href), round: doc.getElementById('round-value')?.textContent.trim() || '', phase: doc.getElementById('phase-value')?.textContent.trim() || '', active: doc.getElementById('active-value')?.textContent.trim() || ''});
  const uid = () => host.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function el(tag, attrs = {}, text) {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, fn, attrs = {}) { const b = el('button', {type: 'button', ...attrs}, text); b.addEventListener('click', fn); return b; }
  const root = el('div', {id: 'playtest-notes-root'}), pins = el('div', {class: 'ptn-pins', role: 'region', 'aria-label': 'Playtest note pins'});
  const launcher = button('Playtest notes', open, {id: 'playtest-notes-button', class: 'button button-ghost ptn-launcher', 'aria-haspopup': 'dialog'});
  const header = doc.querySelector('.header-actions');
  (header || root).append(launcher);
  if (!header) launcher.classList.add('ptn-floating');
  const panel = el('dialog', {class: 'ptn-panel', 'aria-labelledby': 'ptn-heading'});
  const top = el('div', {class: 'ptn-top'}); top.append(el('h2', {id: 'ptn-heading'}, 'Playtest notes'), button('Close', () => panel.close(), {'aria-label': 'Close playtest notes', class: 'ptn-quiet'}));
  const intro = el('p', {class: 'ptn-muted'}, 'Pin observations as you play. Drafts stay in this browser. Review on GitHub before posting an issue.');
  const status = el('p', {class: 'ptn-status', role: 'status', 'aria-live': 'polite'});
  const label = el('label', {for: 'ptn-text', class: 'ptn-label'}, 'Observation');
  const text = el('textarea', {id: 'ptn-text', rows: '4', placeholder: 'What happened? What did you expect?'});
  const captured = el('p', {class: 'ptn-muted'}), targetLabel = el('p', {class: 'ptn-target'});
  const tools = el('div', {class: 'ptn-actions'});
  const pick = button('Pick a map hex or UI element', startPicking);
  const unpin = button('Remove target', () => {data.draft.target = null; persist(); renderEditor();}, {class: 'ptn-quiet'});
  const save = button('Save note', saveNote, {class: 'ptn-primary'});
  const cancelEdit = button('Cancel edit', () => {data.editing = null; data.draft = {text: '', target: null, context: context()}; persist(); render();}, {class: 'ptn-quiet'});
  tools.append(pick, unpin, save, cancelEdit);
  const listHeading = el('h3', {}, 'Saved notes'), list = el('div', {class: 'ptn-list'});
  const undo = button('Undo remove', () => {if (removed) {data.notes.splice(removed.index, 0, removed.note); removed = null; const stored = persist(); render(); if (stored) status.textContent = 'Note restored.';}}, {class: 'ptn-quiet'}); undo.hidden = true;
  const issueLabel = el('label', {for: 'ptn-issue-title', class: 'ptn-label'}, 'Issue title');
  const title = el('input', {id: 'ptn-issue-title', type: 'text'});
  const previewDetails = el('details', {class: 'ptn-preview'}), preview = el('textarea', {rows: '9', readonly: '', 'aria-label': 'GitHub issue preview'});
  previewDetails.append(el('summary', {}, 'Issue preview'), preview);
  const issueHint = el('p', {class: 'ptn-muted'}), issueActions = el('div', {class: 'ptn-actions'});
  const copy = button('Copy issue text', copyIssue);
  const review = el('a', {class: 'ptn-primary ptn-link', target: '_blank', rel: 'noopener noreferrer'}, 'Review GitHub issue');
  review.addEventListener('click', event => {
    if (!included().length) {event.preventDefault(); status.textContent = 'Write a note or select a saved note first.'; return;}
    if (data.draft.text.trim()) saveNote();
    renderIssue();
  });
  issueActions.append(copy, review);
  panel.append(top, intro, status, label, text, captured, targetLabel, tools, listHeading, list, undo, issueLabel, title, previewDetails, issueHint, issueActions);
  const banner = el('div', {class: 'ptn-pick-banner', role: 'status'}); banner.hidden = true;
  banner.append(el('span', {}, 'Click a map hex or UI element to annotate it. Game clicks are blocked while picking.'), button('Cancel', cancelPicking));
  root.append(pins, panel, banner); doc.body.append(root);
  function persist() {
    try { host.localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch (_) { status.textContent = 'Browser storage is unavailable. Your notes are still here for now; copy the issue text to keep them.'; return false; }
  }
  function open() {
    if (!data.draft.context || (!data.editing && !data.draft.text.trim() && !data.draft.target)) {data.draft.context = context(); data.draft.createdAt = new Date().toISOString();}
    render();
    if (!panel.open) panel.showModal();
    text.focus();
  }
  function draftEntry() { return {id: data.editing || 'draft', text: data.draft.text.trim(), target: data.draft.target || null, context: data.draft.context || context(), createdAt: data.draft.createdAt || new Date().toISOString(), include: data.editing ? data.notes.find(n => n.id === data.editing)?.include !== false : true}; }
  function included() {
    const notes = data.notes.filter(n => n.include !== false && n.id !== data.editing);
    if (data.draft.text.trim() && draftEntry().include !== false) notes.push(draftEntry());
    return notes;
  }
  function renderEditor() {
    text.value = data.draft.text;
    const c = data.draft.context || context();
    captured.textContent = [c.rules && `Rules ${c.rules}`, c.round && `Round ${c.round}`, c.phase].filter(Boolean).join(' · ');
    targetLabel.textContent = data.draft.target ? `Target: ${data.draft.target.label}` : 'General observation — no target selected';
    unpin.hidden = !data.draft.target;
    save.textContent = data.editing ? 'Update note' : 'Save note';
    save.disabled = !data.draft.text.trim(); cancelEdit.hidden = !data.editing;
  }
  function renderIssue() {
    const entries = included(), body = issueBody(entries, context());
    preview.value = body;
    const link = issueLink(data.title, body);
    review.href = link.url; review.setAttribute('aria-disabled', String(!entries.length)); copy.disabled = !entries.length;
    issueHint.textContent = link.needsCopy ? 'This draft is too long for a link. Copy the issue text, then open GitHub and paste it into the issue body.' : 'Only selected notes are included. GitHub opens for your review; your notes stay saved here.';
    if (link.needsCopy) previewDetails.open = true;
  }
  function render() {
    launcher.textContent = `Playtest notes${data.notes.length ? ` (${data.notes.length})` : ''}`;
    title.value = data.title || `${game} playtest feedback (rules ${rules})`;
    if (!data.title) data.title = title.value;
    renderEditor(); list.replaceChildren();
    if (!data.notes.length) list.append(el('p', {class: 'ptn-muted'}, 'No notes yet. Add a general observation or pick something on the board.'));
    data.notes.forEach((note, index) => {
      const item = el('article', {class: 'ptn-note'}), checkLabel = el('label', {class: 'ptn-include'}), check = el('input', {type: 'checkbox', 'aria-label': `Include note ${index + 1} in issue`});
      check.checked = note.include !== false;
      check.addEventListener('change', () => {note.include = check.checked; persist(); renderIssue();});
      checkLabel.append(check, el('strong', {}, `${index + 1}. ${note.target?.label || 'General observation'}`));
      const c = note.context || {}, meta = el('p', {class: 'ptn-muted'}, [c.round && `Round ${c.round}`, c.phase, c.rules && `rules ${c.rules}`].filter(Boolean).join(' · '));
      const actions = el('div', {class: 'ptn-actions'});
      actions.append(button('Edit', () => {editNote(note.id);}, {class: 'ptn-quiet'}), button('Remove', () => {removed = {note, index}; data.notes.splice(index, 1); if (data.editing === note.id) {data.editing = null; data.draft = {text: '', target: null, context: context()};} const stored = persist(); render(); if (stored) status.textContent = 'Note removed. You can undo that removal.';}, {class: 'ptn-quiet'}));
      if (note.target) actions.append(button('Show target', () => {panel.close(); highlight(note.target);}, {class: 'ptn-quiet'}));
      item.append(checkLabel, meta, el('p', {class: 'ptn-note-text'}, note.text), actions); list.append(item);
    });
    undo.hidden = !removed; renderIssue(); schedulePins();
  }
  function editNote(id) {
    if (data.draft.text.trim()) saveNote();
    const note = data.notes.find(n => n.id === id);
    if (!note) return;
    data.editing = note.id; data.draft = {text: note.text, target: note.target, context: note.context, createdAt: note.createdAt}; persist(); open();
  }
  function saveNote() {
    if (!data.draft.text.trim()) return;
    const note = draftEntry(), index = data.notes.findIndex(n => n.id === data.editing);
    note.id = data.editing || uid();
    if (index >= 0) {note.include = data.notes[index].include; data.notes[index] = note;} else data.notes.push(note);
    data.editing = null; data.draft = {text: '', target: null, context: null}; const stored = persist(); render(); if (stored) status.textContent = 'Note saved in this browser.';
  }
  text.addEventListener('input', () => {if (!data.draft.context) data.draft.context = context(); if (!data.draft.createdAt) data.draft.createdAt = new Date().toISOString(); data.draft.text = text.value; persist(); save.disabled = !text.value.trim(); renderIssue();});
  title.addEventListener('input', () => {data.title = title.value; persist(); renderIssue();});
  async function copyIssue() {
    renderIssue();
    try {await host.navigator.clipboard.writeText(preview.value); status.textContent = 'Issue text copied.';}
    catch (_) {previewDetails.open = true; preview.focus(); preview.select(); status.textContent = 'Copy the selected preview text to keep or submit your notes.';}
  }
  function selector(target) {
    if (target.id) return '#' + host.CSS.escape(target.id);
    if (target.matches('.hex') && target.dataset.coord) return `.hex[data-coord="${host.CSS.escape(target.dataset.coord)}"]`;
    if (target.matches('.hex') && target.dataset.key) return `.hex[data-key="${host.CSS.escape(target.dataset.key)}"]`;
    const parts = []; let node = target;
    while (node && node !== doc.body) {
      if (node.id) {parts.unshift('#' + host.CSS.escape(node.id)); break;}
      const siblings = node.parentElement ? [...node.parentElement.children].filter(n => n.tagName === node.tagName) : [node];
      parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')'); node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function targetNode(value) {try {return doc.querySelector(value.selector);} catch (_) {return null;}}
  function startPicking() {pickMode = true; data.draft.context = context(); persist(); panel.close(); banner.hidden = false; doc.body.classList.add('ptn-picking');}
  function cancelPicking() {pickMode = false; banner.hidden = true; doc.body.classList.remove('ptn-picking'); open();}
  doc.addEventListener('keydown', event => {if (pickMode && event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); cancelPicking();}}, true);
  doc.addEventListener('click', event => {
    if (!pickMode || root.contains(event.target) || event.target === launcher) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = event.target.closest('.hex, button, a, input, select, textarea, .card, .panel, h1, h2, h3') || event.target;
    if (target === doc.body || target === doc.documentElement) return;
    const rect = target.getBoundingClientRect();
    data.draft.target = {selector: selector(target), label: (target.getAttribute('aria-label') || target.getAttribute('title') || target.textContent || target.tagName).trim().replace(/\s+/g, ' ').slice(0, 180), coord: target.matches('.hex') ? target.dataset.coord || target.dataset.key || '' : '', x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))};
    persist(); cancelPicking();
  }, true);
  function highlight(target) {const node = targetNode(target); if (!node) {status.textContent = 'That target is not on the current board. Its original context is kept in the note.'; open(); return;} node.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'}); node.classList.add('ptn-highlight'); host.setTimeout(() => node.classList.remove('ptn-highlight'), 2200);}
  function schedulePins() {if (frame !== null) return; frame = host.requestAnimationFrame(() => {frame = null; pins.replaceChildren(); data.notes.forEach((note, index) => {if (!note.target) return; const node = targetNode(note.target); if (!node) return; const r = node.getBoundingClientRect(), x = r.left + r.width * (note.target.x ?? .5), y = r.top + r.height * (note.target.y ?? .5); if (!r.width || !r.height || x < 0 || x > host.innerWidth || y < 0 || y > host.innerHeight) return; const pin = button(String(index + 1), () => {editNote(note.id);}, {class: 'ptn-pin', 'aria-label': `Open playtest note ${index + 1}: ${note.text.slice(0, 100)}`}); pin.style.left = x + 'px'; pin.style.top = y + 'px'; pins.append(pin);});});}
  host.addEventListener('scroll', schedulePins, true); host.addEventListener('resize', schedulePins);
  new host.MutationObserver(records => {if (records.some(record => !root.contains(record.target) && record.target !== launcher)) schedulePins();}).observe(doc.querySelector('main') || doc.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open']});
  render();
})(globalThis);
