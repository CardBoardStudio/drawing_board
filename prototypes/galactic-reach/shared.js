// Shared tables (?shared=<id>): the server's table service owns the game. This
// page shows the signed-in seat's private view, sends that seat's commands, and
// follows every other seat live over server-sent events.
(() => {
  const params = new URLSearchParams(location.search), tabletop = params.has('tabletop');
  const id = params.get(tabletop ? 'tabletop' : 'shared');
  const endpoint = suffix => tabletop ? `/api/tabletop/${id}/${suffix || 'seat'}` : `/api/shared/${id}${suffix ? '/' + suffix : ''}`;
  if (id === null) return;
  globalThis.drawingBoardTableBoot = true;
  document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('has-saved-table', 'has-shared-table');
    const shell = document.querySelector('.app-shell');
    shell.inert = true;
    const bar = document.createElement('section');
    bar.className = 'table-save-bar shared-table-bar';
    bar.setAttribute('aria-label', 'Shared table');
    bar.innerHTML = '<a class="button button-ghost" href="/?game=galactic-reach#tables">← Your tables</a><strong id="saved-table-name">Opening shared table…</strong><span id="table-rules" class="rules-badge"></span><ol class="shared-seats" id="shared-seats" aria-label="Seats"></ol><span id="table-sync" role="status" aria-live="polite">Connecting…</span><span id="shared-undo-note" class="shared-undo-note" hidden></span>';
    shell.before(bar);
    const boardButton = document.createElement('button');
    boardButton.className = 'button button-ghost'; boardButton.textContent = 'Pair public board';
    const boardLink = document.createElement('a'); boardLink.hidden = true; boardLink.target = '_blank'; boardLink.rel = 'noopener'; boardLink.textContent = 'Open public board';
    const revokeBoard = document.createElement('button'); revokeBoard.className = 'button button-ghost'; revokeBoard.textContent = 'Revoke board links';
    if (!tabletop) bar.append(boardButton, boardLink, revokeBoard);
    boardButton.addEventListener('click', async () => {
      try { const result = await api(`/api/tabletop/${id}/board-grant`, {}); boardLink.href = result.url; boardLink.hidden = false;
        status.textContent = 'Open this link on the tablet, or copy it there. It pairs one public board.';
      } catch (error) { status.textContent = error.message; }
    });
    revokeBoard.addEventListener('click', async () => {
      try { await api(`/api/tabletop/${id}/board-revoke`, {}); boardLink.hidden = true; boardLink.removeAttribute('href'); status.textContent = 'Public board access revoked.'; }
      catch (error) { status.textContent = error.message; }
    });
    const status = bar.querySelector('#table-sync');
    const seatList = bar.querySelector('#shared-seats');
    const undoNote = bar.querySelector('#shared-undo-note');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let current = null, game = null, controls = null, busy = false, stream = null;
    async function api(path, body) {
      const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        headers: body === undefined ? {} : {'Content-Type': 'application/json', 'x-drawing-board': '1'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || 'The table service did not answer.'), {status: response.status});
      return data;
    }
    function describe(view) {
      const active = view.active;
      seatList.innerHTML = view.seats.map(seat => `<li class="${seat.seat === active ? 'acting' : ''}${seat.you ? ' you' : ''}" style="--player:${['#55d9f4','#ff9f6e','#a58cff','#f2cf66'][seat.seat]}">${esc(seat.name)}<small>${seat.you ? 'you' : seat.human ? 'player' : 'AI rival'}${seat.seat === active ? ' · to move' : ''}</small></li>`).join('');
      const mine = active === view.seat;
      if (view.ai_error) status.textContent = `${view.ai_error} Reload to retry; if it persists, tell the host.`;
      else if (view.status === 'finished') status.textContent = 'Game over. Export game report now includes every hidden card.';
      else if (!busy) status.textContent = mine ? 'Your move.' : `Waiting for ${view.seats[active]?.name || 'the table'}…`;
      document.title = `${mine && view.status !== 'finished' ? '● Your move · ' : ''}${view.name} · Galactic Reach`;
      // Say why Undo stops short of the start of the turn: a reveal is final.
      const undo = view.undo || {};
      const note = view.committed_only ? 'Confirmed choices are final. No Undo in this game.' : !mine ? '' : undo.available && undo.stop ? `Undo goes back only to just after ${undo.stop}.` : !undo.available && /^Undo stops/.test(undo.reason || '') ? undo.reason : '';
      undoNote.textContent = note; undoNote.hidden = !note;
    }
    function adopt(view) {
      if (current && view.seq < current.seq) return;
      current = view;
      describe(view);
      game?.sync(view);
      controls?.update(view);
    }
    async function refresh() { adopt(await api(endpoint(''))); }
    function send(intents) {
      if (busy || !current) { status.textContent = 'Still sending your last choice…'; return false; }
      busy = true;
      status.textContent = 'Sending…';
      api(endpoint('act'), {seq: current.seq, actions: intents})
        .then(result => {
          busy = false;
          adopt(result.view);
          if (result.stopped) status.textContent = `${result.applied} of ${intents.length} applied. ${result.stopped}`;
        })
        .catch(async error => {
          busy = false;
          status.textContent = error.message;
          try { await refresh(); status.textContent = error.message; } catch { /* The live stream resyncs on reconnect. */ }
        });
      return true;
    }
    function undo() {
      if (busy || !current) return false;
      busy = true;
      status.textContent = 'Undoing…';
      api(endpoint('undo'), {seq: current.seq})
        .then(result => { busy = false; adopt(result.view); status.textContent = `Took back ${result.undone} choice${result.undone === 1 ? '' : 's'}.`; })
        .catch(async error => { busy = false; status.textContent = error.message; try { await refresh(); status.textContent = error.message; } catch { /* The live stream resyncs on reconnect. */ } });
      return true;
    }
    async function report() {
      try {
        const data = await api(endpoint('report'));
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
        const link = document.createElement('a'); link.href = url; link.download = `galactic-reach-shared-${id}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { status.textContent = error.message; }
    }
    // Live updates. The server sends `view` after every change and a `ping {seq}`
    // every 10 s when quiet. A proxy can leave a stream open but silent after the
    // server restarts, with no error, so the page watches for silence itself:
    // no message for 25 s, a ping showing a newer seq, a closed stream, the tab
    // becoming visible again, or the network returning all reconnect and resync.
    let lastMessage = Date.now(), retry = 0, retryTimer = null, halted = false;
    // The server says this table cannot continue here (for example, it was dealt
    // with an earlier build of the rules): show why and stop retrying.
    function halt(message) {
      halted = true; stream?.close(); stream = null; clearTimeout(retryTimer);
      status.textContent = message; shell.inert = true;
    }
    function resync() {
      refresh().catch(error => { if (error.status === 409 || error.status === 404 || (tabletop && [401,403].includes(error.status))) halt(error.message); });
    }
    function reconnect(reason) {
      if (halted) return;
      stream?.close(); stream = null; clearTimeout(retryTimer);
      if (reason) status.textContent = reason;
      retryTimer = setTimeout(listen, Math.min(10000, 1000 * 2 ** retry++));
    }
    function listen() {
      if (halted) return;
      stream?.close();
      lastMessage = Date.now();
      stream = new EventSource(endpoint(tabletop ? 'player-stream' : 'stream'));
      stream.addEventListener('view', event => {
        lastMessage = Date.now(); retry = 0;
        try { adopt(JSON.parse(event.data)); } catch { /* Ignore a malformed frame; the next one resyncs. */ }
      });
      stream.addEventListener('ping', event => {
        lastMessage = Date.now(); retry = 0;
        try { if (current && JSON.parse(event.data).seq > current.seq) resync(); } catch { /* A ping only nudges a resync. */ }
      });
      stream.addEventListener('open', () => { lastMessage = Date.now(); if (current) describe(current); });
      stream.addEventListener('error', () => {
        // EventSource retries by itself unless the response was an error page (a
        // 502 while the server restarts), which closes it for good.
        if (stream?.readyState === EventSource.CLOSED) { reconnect('Connection lost. Reconnecting…'); resync(); }
        else status.textContent = 'Connection lost. Reconnecting…';
      });
    }
    setInterval(() => {
      if (stream && Date.now() - lastMessage > 25000) { reconnect('Reconnecting to the table…'); resync(); }
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      resync();
      if (!stream || stream.readyState === EventSource.CLOSED || Date.now() - lastMessage > 15000) reconnect();
    });
    window.addEventListener('online', () => { resync(); reconnect(); });
    const leave = () => { clearTimeout(retryTimer); stream?.close(); stream = null; location.assign(tabletop ? `/tabletop/phone.html?table=${id}` : '/?game=galactic-reach#tables'); };
    bar.querySelector('a').addEventListener('click', event => { event.preventDefault(); leave(); });
    try {
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid table link. Return to Your tables.');
      const view = await api(endpoint(''));
      // A table keeps the rules revision it was dealt with: open that revision's browser.
      if (view.client_path && location.pathname !== view.client_path) { location.replace(`${view.client_path}?${tabletop ? 'tabletop' : 'shared'}=${id}`); return; }
      current = view;
      bar.querySelector('#saved-table-name').textContent = view.name;
      bar.querySelector('#table-rules').textContent = `Rules ${view.rules_version.split('/')[1]} · shared`;
      describe(view);
      if (tabletop) controls = globalThis.createTabletopControls({bar, status, current:()=>current, game:()=>game, send, busy:()=>busy});
      game = globalThis.createGalacticReach({
        network: {tabletop, committedOnly:view.committed_only===true, seat: view.seat, rules: view.rules_version, initial: view,
          act: intents=>controls?controls.preview(intents):send(intents), undo, busy: () => busy || !!controls?.pending(), report},
        paused: () => busy || !!controls?.pending(), newTable: leave
      });
      controls?.update(view);
      if (tabletop) { bar.querySelector('a').textContent='Phone pairing'; bar.querySelector('a').href=`/tabletop/phone.html?table=${id}`; }
      const library = document.querySelector('.header-actions a');
      if (library) { library.textContent = tabletop ? 'Phone pairing' : 'Your tables'; library.href = tabletop ? `/tabletop/phone.html?table=${id}` : '/?game=galactic-reach#tables'; }
      shell.inert = false;
      listen();
    } catch (error) {
      status.textContent = error.message;
      if (error.status === 401 && !tabletop) {
        const link = document.createElement('a'); link.className = 'button button-ghost'; link.textContent = 'Sign in to open this table';
        link.href = `/?return_to=${encodeURIComponent('/galactic-reach/?shared=' + id)}#account`; bar.append(link);
      }
    }
  });
})();
