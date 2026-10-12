const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#55d9f4','#ff9f6e','#a58cff','#f2cf66'];
const titleCase=value=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function matchList(data) {
  const matches=data?.matches||[];
  return `<section class="panel replay-library"><div class="panel-heading"><div><div class="eyebrow">WATCH THE STRATEGIES UNFOLD</div><h2>Games worth watching</h2></div><span class="badge cyan">${matches.length} matches</span></div><p>Ranked by lead changes, battles, and a close finish. Open a completed AI game to step through every decision.</p><details class="interest-help"><summary>How interestingness is scored</summary><p>${esc(data?.ranking||'40 per lead change + 5 per battle + 2 × max(0, 20 − final Prestige gap)')}. Lead changes count changes of the sole Prestige leader, ignoring tied moments. This is a browsing aid; it never affects Elo.</p></details>${matches.length?`<label for="replay-version">Rules version</label><select id="replay-version"><option value="">All recorded versions</option>${[...new Set(matches.map(m=>m.rules_version))].map(v=>`<option>${esc(v)}</option>`).join('')}</select><div class="match-list">${matches.map((m,i)=>{
    const a=m.metrics;
    return `<button class="match-card" data-replay="${esc(m.id)}" data-rules="${esc(m.rules_version)}"><span class="interest-number">${i+1}<small>${a?`${a.interest} interest`:'Unindexed'}</small></span><span class="match-main"><strong>${a?esc(m.names[a.standings[0].seat])+' leads the finish':'Recorded AI match'}</strong><span>${esc(m.rules_version)} · ${m.pool.includes(':placement:')?'Placement Elo':'Original win/loss Elo'}${a?` · ${a.rounds} rounds`:''}</span>${a?`<span class="match-reasons">${a.lead_changes} lead changes · ${a.battles} battles · ${a.prestige_gap} Prestige gap</span><span class="match-places">${a.standings.map(p=>`${p.rank}. ${esc(m.names[p.seat])} (${p.prestige}★)`).join(' · ')}</span>`:'<span>Prepare verified replay to calculate interestingness</span>'}</span><span class="match-watch">Watch →</span></button>`;
  }).join('')}</div>`:'<div class="empty"><p>Your completed Galactic Reach series will appear here.</p></div>'}</section>`;
}
export function bindReplays(api,onIndexed) {
  document.querySelector('#replay-version')?.addEventListener('change',e=>document.querySelectorAll('[data-replay]').forEach(el=>el.hidden=!!e.target.value&&el.dataset.rules!==e.target.value));
  document.querySelectorAll('[data-replay]').forEach(button=>button.addEventListener('click',async()=>{
    const old=button.innerHTML; button.disabled=true; button.querySelector('.match-watch').textContent='Opening…';
    try {const data=await api(`/api/arena/replays/${encodeURIComponent(button.dataset.replay)}`,{});openReplay(data);Promise.resolve(onIndexed?.()).catch(()=>{});}
    catch(e){button.innerHTML=old;const error=document.createElement('span');error.className='replay-error';error.textContent=e.message;button.after(error);}
    finally{button.disabled=false;if(button.isConnected)button.innerHTML=old;}
  }));
}
export function applyChanges(state,changes) {
  for(const change of changes) {
    const path=change.path;
    if(!path.length){state=structuredClone(change.value);continue;}
    let parent=state;
    for(const key of path.slice(0,-1)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Invalid replay path');parent=parent[key];}
    const key=path.at(-1);if(['__proto__','prototype','constructor'].includes(key))throw Error('Invalid replay path');
    if(change.remove)delete parent[key];else parent[key]=structuredClone(change.value);
  }
  return state;
}
function openReplay(data) {
  document.querySelector('#arena-replay')?.remove();
  const dialog=document.createElement('dialog');dialog.id='arena-replay';dialog.className='arena-replay';
  const m=data.match;
  dialog.innerHTML=`<div class="replay-heading"><div><div class="eyebrow">COMPLETED AI GAME · ALL FACTIONS VISIBLE</div><h2>Galactic Reach <span class="badge">${esc(m.rules_version.split('/')[1])}</span></h2><p>${m.pool.includes(':placement:')?'Placement Elo':'Original win/loss Elo'} · ${data.summary.rounds} rounds · ${data.frames.length} decisions</p></div><button class="secondary" id="replay-close" autofocus>Close ✕</button></div><div class="replay-controls"><button class="secondary" id="replay-start" aria-label="Go to start">|←</button><button class="secondary" id="replay-prev">← Previous</button><button class="primary" id="replay-play">Play</button><button class="secondary" id="replay-next">Next →</button><button class="secondary" id="replay-end" aria-label="Go to final result">→|</button><label class="replay-step-label" for="replay-step">Decision <output id="replay-position">0</output></label><input id="replay-step" type="range" min="0" max="${data.frames.length}" value="0" step="1"><label for="replay-round">Jump to round</label><select id="replay-round"></select></div><p id="replay-action" class="replay-action" aria-live="polite"></p><div id="replay-players" class="replay-players"></div><div class="replay-layout"><div class="replay-map-wrap"><svg id="replay-map" viewBox="-465 -420 930 840" role="img" aria-label="Galactic Reach replay board"></svg><p class="hint">Border color = faction · C Colony · H Harvester · S Shipyard · W Warehouse · R Research · ● Fleet. Select a hex for details.</p></div><aside><section class="panel" id="replay-sector"><h3>Sector scan</h3><p>Select any hex to inspect it at this decision.</p></section><section class="panel replay-log"><h3>Game log</h3><div id="replay-log"></div></section></aside></div>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s), checkpoints=new Map([[0,structuredClone(data.initial)]]);
  let index=0,state=structuredClone(data.initial),timer=null,selected=null;
  const stop=()=>{clearInterval(timer);timer=null;$('#replay-play').textContent='Play';};
  const seek=target=>{
    target=Math.max(0,Math.min(data.frames.length,Number(target)));
    const start=Math.floor(target/25)*25;
    let from=checkpoints.has(start)?start:Math.max(...[...checkpoints.keys()].filter(k=>k<=target));
    state=structuredClone(checkpoints.get(from));
    while(from<target){state=applyChanges(state,data.frames[from].changes);from++;if(from%25===0)checkpoints.set(from,structuredClone(state));}
    index=target;render();if(index===data.frames.length)stop();
  };
  const rounds=new Map([[data.initial.round,0]]);data.frames.forEach((f,i)=>{if(!rounds.has(f.round))rounds.set(f.round,i+1);});
  $('#replay-round').innerHTML=[...rounds].map(([round,step])=>`<option value="${step}">${round}</option>`).join('');
  function sector(){
    if(!selected)return;
    const p=state.planets[selected],fleets=state.fleets[selected]||{};
    $('#replay-sector').innerHTML=`<h3>${esc(p?.name||'Empty space')}</h3><p>${esc(selected)}${p?` · ${titleCase(p.type)} · ${p.owner===null?'Unclaimed':esc(m.names[p.owner])}`:''}</p>${p?`<p>${p.hasColony?'Colony':titleCase(p.upgrade||p.special||'No building')}${p.upgradeLevel?` · Level ${p.upgradeLevel}`:''}</p>`:''}${Object.entries(fleets).map(([seat,fleet])=>`<p><strong style="color:${colors[seat]}">${esc(m.names[seat])}</strong><br>${Object.entries(fleet).filter(([,n])=>n).map(([kind,n])=>`${n} ${titleCase(kind)}`).join(' · ')}</p>`).join('')}`;
  }
  function render(){
    const frame=index?data.frames[index-1]:null,a=frame?.action;
    $('#replay-position').value=`${index} / ${data.frames.length}`;$('#replay-step').value=index;
    $('#replay-prev').disabled=index===0;$('#replay-start').disabled=index===0;$('#replay-next').disabled=index===data.frames.length;$('#replay-end').disabled=index===data.frames.length;
    $('#replay-round').value=rounds.get(state.round)??0;
    $('#replay-action').textContent=`Round ${state.round} · ${titleCase(state.phase)} — ${frame?`${m.names[frame.seat]}: ${titleCase(a.type)}${a.key?' · '+titleCase(a.key):''}${a.gain?' → '+Object.entries(a.gain).map(([k,n])=>n+' '+titleCase(k)).join(', '):''}${a.kind?' '+titleCase(a.kind):''}${a.source?' from '+a.source:''}${a.destination?' to '+a.destination:''}${a.coord?' at '+a.coord:''}${a.discountResource?' (−1 '+titleCase(a.discountResource)+')':''}`:'Opening position'}`;
    $('#replay-players').innerHTML=state.players.map(p=>`<article class="replay-player ${state.active===p.seat?'is-active':''}" style="--seat:${colors[p.seat]}"><h3>${esc(m.names[p.seat])}</h3><div class="replay-prestige"><strong>${p.prestige}★</strong><span>Rank ${p.rank} · ${p.colonies} colonies</span></div><div class="replay-resources">${Object.entries(p.resources).map(([k,n])=>`<span>${titleCase(k)}<b>${n}</b></span>`).join('')}</div><p>${Object.entries(p.tracks).map(([k,n])=>`${titleCase(k)} ${n}`).join(' · ')}</p><details><summary>Hand (${p.hand.length}) · Deck ${p.deckCount}</summary><ul>${p.hand.map(c=>`<li>${esc(c.name)}${c.upgraded?' II':''}</li>`).join('')}</ul></details>${index===data.frames.length?`<p class="replay-elo">Elo ${Math.round(m.before[p.seat])} → ${Math.round(m.after[p.seat])} (${m.after[p.seat]>=m.before[p.seat]?'+':''}${(m.after[p.seat]-m.before[p.seat]).toFixed(1)})</p>`:''}</article>`).join('');
    const hexes=[];const fill={matter:'#244056',energy:'#4a4025',biomass:'#1f4739',data:'#39305a'};
    for(let q=-12;q<=12;q++)for(let r=-12;r<=12;r++)if(Math.abs(q+r)<=12){
      const key=`${q},${r}`,p=state.planets[key],fleets=Object.entries(state.fleets[key]||{}).filter(([,f])=>Object.values(f).some(n=>n)),x=Math.sqrt(3)*20*(q+r/2),y=30*r;
      const points=Array.from({length:6},(_,i)=>{const angle=Math.PI/180*(60*i-30);return `${(x+19*Math.cos(angle)).toFixed(1)},${(y+19*Math.sin(angle)).toFixed(1)}`;}).join(' ');
      const building=p?.hasColony?'C':({harvester:'H',starbase:'S',warehouse:'W'}[p?.upgrade]|| (p?.researchStationOwner!==null&&p?.researchStationOwner!==undefined?'R':p?.special==='relic'?'◇':''));
      const label=`${p?.name||'Space'} (${key})${p?.owner!==null&&p?.owner!==undefined?' · '+m.names[p.owner]:''}`;
      hexes.push(`<g data-hex="${key}" role="button" tabindex="${p||fleets.length?'0':'-1'}" aria-label="${esc(label)}"><title>${esc(label)}</title><polygon points="${points}" fill="${p?fill[p.type]:'#0b1520'}" stroke="${selected===key?'#fff':p?.owner!==null&&p?.owner!==undefined?colors[p.owner]:'#22374a'}" stroke-width="${selected===key?3:p?1.8:.6}"/>${building?`<text x="${x}" y="${y+3}" text-anchor="middle" fill="#f0f6fa" font-size="13">${building}</text>`:''}${fleets.map(([seat,f],i)=>`<circle cx="${x-9+i*6}" cy="${y+11}" r="3.3" fill="${colors[seat]}"/><title>${esc(m.names[seat])}: ${Object.entries(f).filter(([,n])=>n).map(([k,n])=>`${n} ${k}`).join(', ')}</title>`).join('')}</g>`);
    }
    $('#replay-map').innerHTML=hexes.join('');
    $('#replay-log').innerHTML=(state.log||[]).slice(0,12).map(item=>`<p>${esc(typeof item==='string'?item:item.text||JSON.stringify(item))}</p>`).join('');
    sector();
  }
  $('#replay-map').addEventListener('click',e=>{const hex=e.target.closest('[data-hex]');if(hex){selected=hex.dataset.hex;render();}});
  $('#replay-map').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.target.closest('[data-hex]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  $('#replay-close').onclick=()=>dialog.close();$('#replay-start').onclick=()=>{stop();seek(0);};$('#replay-end').onclick=()=>{stop();seek(data.frames.length);};$('#replay-prev').onclick=()=>{stop();seek(index-1);};$('#replay-next').onclick=()=>{stop();seek(index+1);};
  $('#replay-step').oninput=e=>{stop();seek(e.target.value);};$('#replay-round').onchange=e=>{stop();seek(e.target.value);};
  $('#replay-play').onclick=()=>{if(timer){stop();return;}if(index===data.frames.length)seek(0);$('#replay-play').textContent='Pause';timer=setInterval(()=>seek(index+1),750);};
  dialog.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stop();seek(index+(e.key==='ArrowRight'?1:-1));}});
  dialog.addEventListener('close',()=>{stop();dialog.remove();});
  render();dialog.showModal();
}
