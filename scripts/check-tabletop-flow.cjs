// Run against an explicitly started local DEV_AUTH server with the web bundle built.
// Exercises real cookie pairing and the real shared UI, never a production host.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('./lib/tabletop-browser.cjs');
const origin=process.env.TABLETOP_ORIGIN;
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||''),'Set TABLETOP_ORIGIN to a local DEV_AUTH server');
async function api(route,cookie='',body){const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json','x-drawing-board':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert(r.ok,`${route}: ${JSON.stringify(data)}`);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function wait(browser,expression){await browser.evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(${expression}){clearInterval(t);resolve();}else if(++n>200){clearInterval(t);reject(Error('Browser did not reach expected state'));}},50);})`);}
(async()=>{

  const login=await api('/api/auth/dev','',{name:'Tabletop UI host'}),host=login.cookie;
  const {data:table}=await api('/api/tables',host,{game:'galactic-reach',name:'Phone flow check',lobby:true}),id=table.id;
  const {data:invite}=await api(`/api/tabletop/${id}/phone-invite`,host,{});
  const phone=await launch(),board=await launch();
  try{
    await phone.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await phone.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await phone.navigate(invite.url);
    await wait(phone,"!document.querySelector('#join').hidden");
    await phone.evaluate(`document.querySelector('#name').value='Phone guest';document.querySelector('#join').requestSubmit()`);
    await wait(phone,"document.querySelector('#status').textContent.includes('host approval')");
    const {data:requests}=await api(`/api/tabletop/${id}/requests`,host);
    assert.equal(requests.requests.length,1);
    await api(`/api/tabletop/${id}/approve`,host,{participant:requests.requests[0].participant,approve:true});
    await wait(phone,"document.querySelector('#status').textContent.includes('Approved')");
    await api(`/api/tables/${id}/lobby/start`,host,{});
    // Pairing navigates to the real game bundle when the host starts.
    for(let i=0;i<100;i++){
      const url=await phone.evaluate('location.pathname');if(url.includes('/client/'))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await wait(phone,"document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    assert(await phone.evaluate(`document.querySelectorAll('#shared-seats li').length===4`));
    const privateView=()=>phone.evaluate(`fetch('/api/tabletop/${id}/seat').then(r=>r.json())`);
    for(let i=0;i<100;i++){const v=await privateView();if(v.seats[v.active]?.human)break;await new Promise(r=>setTimeout(r,100));}
    let before=await privateView();
    await phone.evaluate(`document.querySelector('#tabletop-plan').click();document.querySelector('#tabletop-plan-sector').value='0,0';document.querySelector('#tabletop-plan-card').selectedIndex=1;[...document.querySelectorAll('#tabletop-planner button')].find(b=>b.textContent==='Keep reminder').click()`);
    assert.equal((await privateView()).seq,before.seq,'private reminder sends no game action');
    await phone.evaluate(`document.querySelector('#convert-all-button').click()`);
    await wait(phone,"document.querySelector('#tabletop-confirm').open");
    assert.equal((await privateView()).seq,before.seq,'opening a preview spends nothing');
    await phone.setOffline(true);
    assert(await phone.evaluate(`fetch('/api/tabletop/${id}/seat',{cache:'no-store'}).then(()=>false,()=>true)`),'phone really loses network access');
    const {data:hostView}=await api(`/api/shared/${id}`,host);
    const hostCard=hostView.state.players[hostView.seat].hand[0];
    await api(`/api/shared/${id}/act`,host,{seq:hostView.seq,actions:[{type:'resource',card:hostCard.id}]});
    await phone.setOffline(false);
    await phone.evaluate("window.dispatchEvent(new Event('online'))");
    await wait(phone,"document.querySelector('#tabletop-confirm button').disabled");
    await phone.evaluate(`[...document.querySelectorAll('#tabletop-confirm button')].find(b=>b.textContent==='Back to planning').click()`);
    before=await privateView();
    await phone.evaluate(`document.querySelector('#convert-all-button').click()`);
    assert.equal((await privateView()).seq,before.seq,'revised preview is still private');
    await phone.evaluate(`[...document.querySelectorAll('#tabletop-confirm button')].find(b=>b.textContent==='Confirm').click()`);
    await phone.evaluate(`new Promise((resolve,reject)=>{let tries=0;const timer=setInterval(async()=>{const v=await fetch('/api/tabletop/${id}/seat').then(r=>r.json());if(v.seq>${before.seq}){clearInterval(timer);resolve();}else if(++tries>100){clearInterval(timer);reject(Error('Confirmation was not committed'));}},50);})`);
    assert.equal((await privateView()).state.players[before.seat].hand.length,0,'explicit confirmation commits the selected conversions');
    // Advance only the other human until this phone is active. An empty hand
    // must still wait for an explicit Pass, including after network recovery.
    for(let i=0;i<100;i++){
      const v=await privateView();if(v.active===v.seat)break;
      if(v.active===hostView.seat)await api(`/api/shared/${id}/act`,host,{seq:v.seq,actions:[{type:v.state.phase==='buy'?'finish_buy':'pass'}]});
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    before=await privateView();assert.equal(before.active,before.seat);assert.equal(before.state.phase,'operations');
    await phone.evaluate('new Promise(resolve=>setTimeout(resolve,750))');
    assert.equal((await privateView()).seq,before.seq,'empty hand waits for the human');
    assert.equal(await phone.evaluate("document.querySelector('#tabletop-confirm').open"),false,'no automatic Pass preview');
    assert.equal(before.undo.available,false);assert.equal(before.committed_only,true);
    await phone.evaluate("document.querySelector('#pass-button').click()");
    await wait(phone,"document.querySelector('#tabletop-confirm').open");
    assert.equal((await privateView()).seq,before.seq,'Pass preview sends nothing');
    await phone.evaluate(`[...document.querySelectorAll('#tabletop-confirm button')].find(b=>b.textContent==='Confirm').click()`);
    await wait(phone,"!document.querySelector('#tabletop-confirm').open && document.querySelector('#table-sync').textContent!=='Sending…'");
    assert((await privateView()).seq>before.seq,'manual Pass commits once');
    console.log('ok - private reminders, network recovery, stale preview, confirmed conversion and manual Pass');

    for(const [width,height] of [[390,844],[844,390],[1024,768],[768,1024]]){
      await phone.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await phone.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const size=await phone.evaluate('({w:document.scrollingElement.scrollWidth,h:document.scrollingElement.scrollHeight})');
      assert(size.w<=width,`phone horizontal overflow ${width}x${height}`);
      if(width>=600&&height>=600)assert(size.h<=height,`tablet vertical overflow ${width}x${height}`);
      if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});const shot=await phone.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SHOTS,`phone-${width}x${height}.png`),Buffer.from(shot.data,'base64'));}
      console.log(`ok - paired phone ${width}x${height}`);
    }
    await phone.send('Page.reload');await wait(phone,"document.querySelector('.app-shell') && !document.querySelector('.app-shell').inert");
    const {data:boardLink}=await api(`/api/tabletop/${id}/board-grant`,host,{});
    await board.navigate(origin+boardLink.url);await wait(board,"document.querySelectorAll('.player').length===4");
    assert(await board.evaluate("document.querySelectorAll('.hex').length===331"));
    assert.deepEqual(phone.errors,[]);assert.deepEqual(board.errors,[]);
    console.log('ok - real guest pairing, host approval, pinned game assets, reload, and separate public board');
  }finally{await phone.close();await board.close();}
})().catch(error=>{console.error(error);process.exit(1);});
