(() => {
  'use strict';
  const id=new URLSearchParams(location.search).get('table'),$=id=>document.getElementById(id),host=document.body.dataset.role==='host';
  const fragment=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname+location.search);
  let invite=fragment.get('invite'),timer,qr;
  async function api(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','x-drawing-board':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'The table could not be reached.');return data;}
  const scoped=(path,body)=>api(`/api/tabletop/${id}/${path}`,body);
  function fail(e){$('status').textContent=e.message;}
  function showLink(data,title){$('link-box').hidden=false;$('link-title').textContent=title;$('link').href=data.url;$('manual-link').value=data.url;
    if(qr)URL.revokeObjectURL(qr);qr=URL.createObjectURL(new Blob([data.qr],{type:'image/svg+xml'}));$('qr').src=qr;}
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>action().catch(fail);return b;}
  async function refreshHost(){
    const [room,phones]=await Promise.all([api(`/api/tables/${id}/lobby`),scoped('requests')]);
    $('title').textContent=room.name;$('lobby').href=`/?game=galactic-reach#lobby/${id}`;
    $('start').hidden=room.status==='started';$('board').hidden=room.status!=='started';$('invite').disabled=room.status!=='waiting';$('host-phone').textContent=room.status==='started'?'Replace my phone link':'Pair my phone';
    $('roster').textContent=room.seats.map(s=>s.name||'AI rival').join(' · ');
    $('requests').replaceChildren(...phones.requests.filter(p=>p.status!=='rejected').map(p=>{const row=document.createElement('article'),text=document.createElement('p');text.textContent=`${p.name} · ${p.code} · ${p.status}`;row.append(text);
      if(p.status==='pending'&&room.status==='waiting'){for(const approve of [true,false])row.append(button(approve?'Approve':'Reject',async()=>{await scoped('approve',{participant:p.participant,approve});await refreshHost();}));}
      if(p.status==='approved')row.append(button('Replace this phone link',async()=>showLink(await scoped('repair',{participant:p.participant}),`Replacement phone for ${p.name}`)));return row;}));
    $('status').textContent=room.status==='started'?'Game started. Open the public board on this tablet.':'Pair your phone, then approve your guests before starting.';
  }
  async function refreshPhone(){const view=await scoped('seat');$('code').textContent=view.code?`Pairing code: ${view.code}`:'';
    if(view.status==='pending')$('status').textContent='Waiting for host approval. Compare the pairing code with your host.';
    else if(view.status==='closed')$('status').textContent='The game started before this phone was approved. Ask the host to include you in the next game.';
    else if(view.status==='waiting'){$('title').textContent=view.name;$('status').textContent='Approved. Waiting for the host to start.';}
    else if(view.client_path){location.replace(`${view.client_path}?tabletop=${id}`);return;}
  }
  async function poll(){clearTimeout(timer);try{if(document.visibilityState==='visible')await (host?refreshHost():refreshPhone());}catch(e){fail(e);}timer=setTimeout(poll,3000);}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});window.addEventListener('online',poll);
  (async()=>{try{if(!/^[a-f0-9]{32}$/.test(id||''))throw new Error('Open Pair phones from your host’s waiting room, or scan their phone invite.');
    if(host){
      $('host-phone').onclick=async()=>{try{showLink(await scoped('host-phone',{}),'Scan with your own phone');}catch(e){fail(e);}};
      $('invite').onclick=async()=>{try{showLink(await scoped('phone-invite',{}),'Guests: scan to request a seat');}catch(e){fail(e);}};
      $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('manual-link').value);$('status').textContent='Pairing link copied.';}catch{$('manual-link').select();$('status').textContent='Select and copy the link shown below the QR code.';}};
      $('start').onclick=async()=>{try{await api(`/api/tables/${id}/lobby/start`,{});await refreshHost();}catch(e){fail(e);}};
      $('board').onclick=async()=>{try{const result=await scoped('board-grant',{});location.assign(result.url);}catch(e){fail(e);}};
      await poll();
    }else if(fragment.get('pair')){await scoped('redeem',{token:fragment.get('pair')});await poll();}
    else if(invite){$('join').hidden=false;$('status').textContent='Enter the name your friends know.';$('join').onsubmit=async event=>{event.preventDefault();try{await scoped('join',{invite,name:$('name').value});invite=null;$('join').hidden=true;await poll();}catch(e){fail(e);}};}
    else await poll();
  }catch(e){fail(e);}})();
})();
