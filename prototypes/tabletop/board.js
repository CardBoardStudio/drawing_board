/* Public board: renders only the public DTO. No engine, hand, command or report API. */
(() => {
  'use strict';
  const id = new URLSearchParams(location.search).get('table');
  const $ = id => document.getElementById(id), status = $('status'), ns='http://www.w3.org/2000/svg';
  let current, selected, stream, lastMessage=0, retryTimer, wake, halted=false;
  const colors=['#55d9f4','#ff9f6e','#a58cff','#f2cf66'];
  const nodes=new Map();
  function el(tag,text) { const node=document.createElement(tag); if(text!==undefined)node.textContent=text;return node; }
  async function api(path,body) {
    const response=await fetch(`/api/tabletop/${id}/${path}`,{credentials:'same-origin',method:body===undefined?'GET':'POST',
      headers:body===undefined?{}:{'Content-Type':'application/json','x-drawing-board':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(result.error||'Cannot reach the table. Reconnecting…'),{status:response.status});
    return result;
  }
  function inspect(coord, suggest=false) {
    selected=coord;nodes.forEach((node,key)=>node.classList.toggle('selected',key===coord));
    const state=current.state,p=state.planets[coord];
    $('sector-title').textContent=p?.name||`Space ${coord}`;
    const text=[p?`${p.type} · ${p.owner===null?'Unclaimed':state.players[p.owner].name}`:'No public terrain here.'];
    if(p?.hasColony)text.push('Colony');if(p?.upgrade)text.push(p.upgrade==='starbase'?'Shipyard':p.upgrade);
    if(p?.relic)text.push(p.relicClaimed?'Recovered relic site':'Located relic');
    for(const [seat,fleet] of Object.entries(state.fleets[coord]||{})) {
      const ships=Object.entries(fleet).filter(([,n])=>n).map(([kind,n])=>`${n} ${kind}`).join(', ');
      if(ships)text.push(`${state.players[seat].name}: ${ships}`);
    }
    if(state.portalLinks[coord])text.push(`Portal to ${state.portalLinks[coord]} · 2 movement`);
    $('sector').textContent=text.join('. ');
    if(suggest)api('focus',{seq:current.seq,coord}).catch(error=>{status.textContent=error.message;});
  }
  function buildMap(radius) {
    const x=radius*32+20,y=radius*27.713+20;$('map').setAttribute('viewBox',`${-x} ${-y} ${x*2} ${y*2}`);
    for(let r=-radius;r<=radius;r++)for(let q=Math.max(-radius,-radius-r);q<=Math.min(radius,radius-r);q++) {
      const key=`${q},${r}`,g=document.createElementNS(ns,'g'),hex=document.createElementNS(ns,'polygon');
      g.setAttribute('transform',`translate(${(q+r/2)*32},${r*27.713})`);g.classList.add('hex');
      g.dataset.coord=key;g.setAttribute('role','button');g.setAttribute('tabindex','0');
      hex.setAttribute('points',Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${Math.cos(a)*18},${Math.sin(a)*18}`;}).join(' '));
      g.append(hex);g.addEventListener('click',()=>inspect(key,true));g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();inspect(key,true);}});
      $('map').append(g);nodes.set(key,g);
    }
  }
  function render(view) {
    if(current&&view.seq<current.seq)return;
    current=view;lastMessage=Date.now();const state=view.state;
    $('title').textContent=view.name;
    status.textContent=view.status==='finished'?'Game over · private cards remain on phones':`Round ${state.round} · ${state.phase} · ${state.players[state.active]?.name||'Table'} to act`;
    $('rules').href=`${view.client_path}rulebook.html#shared-tables`;
    $('players').replaceChildren(...state.players.map(p=>{const card=el('article');card.className=`player${state.active===p.id?' acting':''}`;card.style.setProperty('--player',p.color||colors[p.id]);
      card.append(el('strong',p.name),el('p',`${p.prestige} / ${state.victoryTarget} Prestige · ${p.handCount} in hand`),el('p',Object.entries(p.resources).map(([k,v])=>`${k[0].toUpperCase()} ${v}/${p.limits[k]}`).join(' · ')));return card;}));
    nodes.forEach((node,coord)=>{const p=state.planets[coord];node.dataset.type=p?.type||'space';node.classList.toggle('portal',!!state.portalLinks[coord]);
      while(node.children.length>1)node.lastChild.remove();
      const markers=[];
      if(p?.hasColony||p?.upgrade)markers.push([p.owner,p.hasColony?'C':p.upgrade==='starbase'?'Y':'H']);
      for(const [seat,fleet] of Object.entries(state.fleets[coord]||{}))for(const [kind,n] of Object.entries(fleet))if(n)markers.push([seat,`${n}${kind[0].toUpperCase()}`]);
      markers.forEach(([seat,label],i)=>{const text=document.createElementNS(ns,'text');text.setAttribute('x',String((i%2)*14-7));text.setAttribute('y',String(Math.floor(i/2)*8-4));text.style.fill=colors[seat]||'white';text.textContent=label;node.append(text);});
      if(p?.relic&&!p.relicClaimed){const mark=document.createElementNS(ns,'text');mark.setAttribute('y','13');mark.textContent='◈';node.append(mark);}
      node.setAttribute('aria-label',`${p?.name||'Space'} ${coord}${markers.length?`, ${markers.map(([s,l])=>`${state.players[s]?.name} ${l}`).join(', ')}`:''}`);
    });
    $('battle').textContent=state.combat?`Combat · volley ${state.combat.volley}. ${state.players[state.combat.actor]?.name||'A player'} chooses privately on their phone.`:'';
    if(selected)inspect(selected);
    const content=$('cards-content');content.replaceChildren();
    function pile(title,cards){content.append(el('h3',title),el('p',cards.map(c=>`${c.name}${c.level>1?' '+c.level:''}`).join(' · ')||'Empty'));}
    pile('Market',state.market);pile('Relic rewards',state.relicRow);
    state.players.forEach(p=>{pile(`${p.name} · In play`,p.inPlay);pile(`${p.name} · Discard`,p.discard);pile(`${p.name} · Military`,p.military);});
  }
  function failed(error){status.textContent=error.message;if([401,403,404,409].includes(error.status)){halted=true;stream?.close();clearTimeout(retryTimer);return true;}return false;}
  function connect(){stream?.close();clearTimeout(retryTimer);stream=new EventSource(`/api/tabletop/${id}/stream`);lastMessage=Date.now();
    stream.addEventListener('view',event=>{try{render(JSON.parse(event.data));}catch{status.textContent='The board could not refresh. Reload to retry.';}});
    stream.onerror=()=>{stream.close();status.textContent='Disconnected. Reconnecting…';retryTimer=setTimeout(async()=>{try{render(await api('board'));connect();}catch(error){if(!failed(error))connect();}},2000);};
  }
  async function resync(){if(halted)return;try{render(await api('board'));connect();}catch(error){failed(error);}}
  $('cards-open').onclick=()=>$('cards').showModal();$('cards-close').onclick=()=>$('cards').close();
  $('wake').onclick=async()=>{try{wake=await navigator.wakeLock.request('screen');$('wake').textContent='Screen stays awake';wake.addEventListener('release',()=>{$('wake').textContent='Keep screen awake';});}catch{$('wake').textContent='Keep awake unavailable';}};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resync();else{stream?.close();clearTimeout(retryTimer);status.textContent='Board paused. Return to reconnect.';}});
  window.addEventListener('online',resync);
  setInterval(()=>{if(current&&document.visibilityState==='visible'&&Date.now()-lastMessage>25000)resync();},5000);
  (async()=>{try{
    if(!/^[a-f0-9]{32}$/.test(id||''))throw new Error('Open the board link from the host’s shared table.');
    const secret=new URLSearchParams(location.hash.slice(1)).get('pair');
    history.replaceState(null,'',location.pathname+location.search);
    if(secret)await api('redeem',{token:secret});
    const view=await api('board');buildMap(view.state.boardRadius);render(view);connect();
  }catch(error){failed(error);}})();
})();
