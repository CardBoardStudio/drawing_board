// Private solo tables keep the existing browser rules and guest save intact.
(() => {
  const id = new URLSearchParams(location.search).get('table');
  if (id === null) return;
  globalThis.drawingBoardTableBoot = true;
  document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('has-saved-table');
    const shell = document.querySelector('.app-shell');
    shell.inert = true;
    const bar = document.createElement('section');
    bar.className = 'table-save-bar';
    bar.innerHTML = '<a class="button button-ghost" href="/?game=galactic-reach#tables">← Your tables</a><strong id="saved-table-name">Opening table…</strong><span id="table-sync" role="status">Connecting…</span><button class="button button-ghost" id="table-retry" hidden>Retry save</button><button class="button button-ghost" id="table-reload" hidden>Load latest saved table</button><button class="button button-ghost" id="table-download" hidden>Download local copy</button>';
    shell.before(bar);
    const status = bar.querySelector('#table-sync');
    const retry = bar.querySelector('#table-retry');
    const reload = bar.querySelector('#table-reload');
    const download = bar.querySelector('#table-download');
    let revision = 0, pending = null, saving = null, cacheKey, conflict = false, timer;
    function backup() {
      if (!cacheKey) return;
      try {
        if (pending) localStorage.setItem(cacheKey, JSON.stringify({revision,save:pending}));
        else localStorage.removeItem(cacheKey);
      } catch { status.textContent = 'Local backup unavailable. Keep this page open until saved.'; }
    }
    async function api(path, body) {
      const response = await fetch(path, {method:body === undefined ? 'GET':'POST',credentials:'same-origin',headers:body === undefined ? {} : {'Content-Type':'application/json','x-drawing-board':'1'},...(body === undefined ? {}:{body:JSON.stringify(body)})});
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Unable to save this table.'),{status:response.status});
      return data;
    }
    function failed(error) {
      status.textContent = error.message || 'Connection lost. Your changes are backed up in this browser.';
      conflict = [401,403,404,409].includes(error.status);
      if (conflict) { shell.inert = true; document.querySelectorAll('dialog[open]').forEach(d=>d.close()); }
      retry.hidden = conflict || !pending;
      reload.hidden = !conflict;
      download.hidden = !pending;
    }
    async function flush() {
      if (saving) return saving;
      if (!pending || conflict) return;
      saving = (async () => {
        while (pending && !conflict) {
          const snapshot = pending;
          status.textContent = 'Saving to your account…';
          try {
            const result = await api(`/api/tables/${id}/save`,{revision,save:snapshot});
            revision = result.revision;
            if (pending === snapshot) pending = null;
            backup();
            status.textContent = 'Saved to your account';
            retry.hidden = true; download.hidden = true;
          } catch(error) { failed(error); break; }
        }
      })();
      try { await saving; } finally { saving = null; }
    }
    retry.addEventListener('click',()=>flush());
    reload.addEventListener('click',()=>{
      if (pending && !confirm('Load the server’s latest save and discard these local changes? Download a local copy first if you want to keep it.')) return;
      pending=null; backup(); location.reload();
    });
    download.addEventListener('click',()=>{
      if (!pending) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(pending)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download=`galactic-reach-${id}.json`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    window.addEventListener('beforeunload',event=>{if(pending){backup();event.preventDefault();event.returnValue='';}});
    async function leave() {
      clearTimeout(timer); await flush();
      if (pending && !confirm('This table has unsynced changes saved in this browser. Leave anyway?')) return;
      location.assign('/?game=galactic-reach#tables');
    }
    bar.querySelector('a').addEventListener('click',e=>{e.preventDefault();leave();});
    try {
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid table link. Return to Your tables.');
      const table = await api(`/api/tables/${id}`);
      revision = table.revision;
      cacheKey = `drawing-board-table:${table.owner_id}:${id}`;
      bar.querySelector('#saved-table-name').textContent = table.name;
      document.title = `${table.name} · Galactic Reach`;
      let save = table.save;
      let local = null;
      try { local = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { /* Account save remains available without browser storage. */ }
      if (local && local.revision !== revision && JSON.stringify(local.save) !== JSON.stringify(save)) {
        pending=local.save;
        throw Object.assign(new Error('Another tab or device saved a newer version. Download your local copy or load the latest table.'),{status:409});
      }
      if (local && local.revision === revision) { save=local.save; pending=save; }
      // Engine storage is in memory; never replace the guest's v4 localStorage keys.
      const memory = new Map();
      if (save) {
        memory.set('galactic-reach-save-v4',JSON.stringify(save.state));
        memory.set('galactic-reach-turn-history-v4',JSON.stringify(save.turnHistory || {pending:null,undo:null}));
      }
      const storage = {getItem:k=>memory.get(k) || null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
      globalThis.createGalacticReach({storage,requireSave:!!save,newTable:leave,paused:()=>conflict,onSave:value=>{
        if (conflict) return;
        pending=JSON.parse(JSON.stringify(value)); backup();
        status.textContent='Saving to your account…'; clearTimeout(timer); timer=setTimeout(flush,100);
      }});
      shell.inert=false;
      document.querySelector('#new-game-button').textContent='New table';
      const library = document.querySelector('.header-actions a');
      library.textContent='Your tables'; library.href='/?game=galactic-reach#tables';
      library.addEventListener('click',e=>{e.preventDefault();leave();});
      if (pending) await flush(); else status.textContent='Saved to your account';
    } catch(error) {
      failed(error);
      if(error.status===401) {
        const link=document.createElement('a'); link.className='button button-ghost'; link.textContent='Sign in to open this table';
        link.href=`/?return_to=${encodeURIComponent('/galactic-reach/?table='+id)}#account`; bar.append(link);
      }
    }
  });
})();
