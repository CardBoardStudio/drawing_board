/* Developer repository tools. Never inspects a game save or private game state. */
(function (host) {
  'use strict';
  const REPOSITORY = 'CardBoardStudio/drawing_board';
  function parsePulls(value) {
    const values = value.trim() ? value.trim().split(/[\s,]+/) : [];
    const numbers = values.map(value => {
      const match = value.match(/^#?([1-9]\d*)$/) || value.match(/^https:\/\/github\.com\/CardBoardStudio\/drawing_board\/pull\/([1-9]\d*)\/?$/);
      if (!match || !Number.isSafeInteger(Number(match[1]))) throw Error('Use PR numbers or pull-request links from CardBoardStudio/drawing_board.');
      return Number(match[1]);
    });
    const unique = [...new Set(numbers)];
    if (unique.length > 10) throw Error('Link up to ten implementation PRs.');
    return unique;
  }
  function previewOrigin(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.endsWith('.onrender.com') && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname === '/' ? url.origin : ''; } catch { return ''; }
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = {parsePulls, previewOrigin}; return; }
  const doc = host.document;
  if (!doc || doc.getElementById('change-queue-root')) return;
  const forced = new URLSearchParams(host.location.search).get('dev') === '1';
  const draftKey = 'drawing-board-change-request-draft-v1';
  let panel, launcher, status, content, busy = false, page = 1, selected = null, connection = null;
  let requests = [], pulls = [], more = false, activeTab = 'requests', listVersion = 0, detailVersion = 0;
  let draft = {title: '', description: ''};
  try { const saved = JSON.parse(host.localStorage.getItem(draftKey)); if (saved && typeof saved.title === 'string' && typeof saved.description === 'string') draft = saved; } catch { /* A visible storage warning follows on the first edit. */ }
  const el = (tag, attrs = {}, text) => { const node = doc.createElement(tag); for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value); if (text !== undefined) node.textContent = text; return node; };
  const button = (text, fn, attrs = {}) => { const node = el('button', {type:'button',class:'cq-button',...attrs},text); node.addEventListener('click', fn); return node; };
  const link = (text, url) => el('a',{href:url,target:'_blank',rel:'noopener noreferrer',class:'cq-link'},text);
  function message(text) { status.textContent = text; }
  async function api(path = '', body) {
    const controller = new AbortController(), timer = host.setTimeout(()=>controller.abort(),30000);
    try {
      const response = await host.fetch('/api/admin/change-queue'+path,{method:body === undefined?'GET':'POST',credentials:'same-origin',signal:controller.signal,headers:body === undefined?{}:{'Content-Type':'application/json','x-drawing-board':'1'},...(body === undefined?{}:{body:JSON.stringify(body)})});
      const data = await response.json();
      if (!response.ok) { const error = Error(data.error || 'The queue could not be loaded.'); error.status = response.status; throw error; }
      return data;
    } catch (error) { if (error.name === 'AbortError') throw Error('The request timed out. Refresh the queue before retrying a write.'); throw error; }
    finally { host.clearTimeout(timer); }
  }
  async function action(fn) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy','true');
    try { await fn(); } catch (error) { message(error.message); if ([401,403].includes(error.status)) { requests=[];pulls=[];selected=null;content.replaceChildren(el('p',{},error.message),link('Sign in to the host account','/?return_to='+encodeURIComponent(host.location.pathname+host.location.search)+'#account')); } }
    finally { busy=false;panel.removeAttribute('aria-busy'); }
  }
  function saveDraft() { try { host.localStorage.setItem(draftKey,JSON.stringify(draft)); } catch { message('Browser draft storage is unavailable. Keep a copy of the request before closing.'); } }
  function clearSecrets() { panel.querySelectorAll('input[type="password"]').forEach(input=>{input.value='';}); }
  async function open() {
    if (!panel.open) panel.showModal();
    panel.querySelector('.cq-close').focus();
    await action(()=>load(false));
  }
  async function load(append) {
    const version=++listVersion;
    message('Refreshing the repository queue…');
    const result=await api('?page='+(append?page+1:1));
    if (version!==listVersion) return;
    connection=result;
    if (!result.connected) { requests=[];pulls=[];selected=null;renderConnection();message(result.preview?'Repository connections are disabled on PR previews. The stable site uses your temporary administrator connection.':'Connect GitHub to load your repository queue.');return; }
    page=result.page;more=result.more;
    requests=append?[...new Map([...requests,...result.requests].map(item=>[item.number,item])).values()]:result.requests;
    pulls=append?[...new Map([...pulls,...result.pull_requests].map(item=>[item.number,item])).values()]:result.pull_requests;
    renderList(); message('Up to date with GitHub. Requests remain on GitHub across deployments.');
  }
  function renderConnection() {
    content.replaceChildren(el('div',{class:'cq-kicker'},'GITHUB CONNECTION'),el('h3',{},'One repository. Your approval.'));
    content.append(el('p',{class:'cq-muted'},'Connect a fine-grained token for CardBoardStudio/drawing_board. It stays in server memory for one hour and disconnects on restart. It is never saved in this browser.'));
    if (connection?.preview) { content.append(el('p',{class:'cq-callout'},'This preview does not accept GitHub credentials. Repository mutations are tested with the local mock fixture.')); return; }
    const details=el('details',{id:'cq-connection-permissions'}), summary=el('summary',{},'Connection permissions');
    details.append(summary,el('p',{class:'cq-muted'},'Select only this repository. Allow Issues and Contents: write; Pull requests, Checks, Commit statuses and Deployments: read. Organization approval may be required.'),link('Create a fine-grained GitHub token','https://github.com/settings/personal-access-tokens/new'));
    const form=el('form'), label=el('label',{for:'cq-token'},'Fine-grained GitHub token'), token=el('input',{id:'cq-token',type:'password',autocomplete:'off',spellcheck:'false',required:'',maxlength:'255'}), submit=el('button',{type:'submit',class:'cq-button cq-primary'},'Connect GitHub');
    form.append(label,token,submit);
    form.addEventListener('submit',event=>{event.preventDefault();const value=token.value;token.value='';action(async()=>{await api('/connect',{token:value});await load(false);});});
    content.append(details,form);
  }
  function renderList() {
    selected=null;++detailVersion;
    content.replaceChildren();
    const tools=el('div',{class:'cq-tools'});
    tools.append(button('Refresh',()=>action(()=>load(false))),button('Disconnect GitHub',()=>action(async()=>{await api('/disconnect',{});await load(false);}),{class:'cq-button cq-quiet'}));
    const tabs=el('div',{class:'cq-tabs',role:'tablist','aria-label':'Repository queue'});
    for (const [id,label,count] of [['requests','Requested changes',requests.length],['pulls','Pull requests',pulls.length]]) {
      const tab=button(`${label} (${count})`,()=>{activeTab=id;renderList();doc.getElementById('cq-tab-'+id).focus();},{id:'cq-tab-'+id,role:'tab','aria-selected':String(activeTab===id),'aria-controls':'cq-list',tabindex:activeTab===id?'0':'-1'});
      tab.addEventListener('keydown',event=>{if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault();activeTab=event.key==='Home'?'requests':event.key==='End'?'pulls':activeTab==='requests'?'pulls':'requests';renderList();doc.getElementById('cq-tab-'+activeTab).focus();}});
      tabs.append(tab);
    }
    const list=el('section',{id:'cq-list',role:'tabpanel','aria-labelledby':'cq-tab-'+activeTab});
    content.append(tools,tabs,list);
    if (activeTab==='requests') {
      const composer=el('details',{class:'cq-composer',id:'cq-request-composer'}); composer.append(el('summary',{},'Add a requested change'));
      const form=el('form'), title=el('input',{id:'cq-request-title',type:'text',required:'',maxlength:'160'}), description=el('textarea',{id:'cq-request-description',rows:'4',required:'',maxlength:'10000'});
      title.value=draft.title;description.value=draft.description;
      title.addEventListener('input',()=>{draft.title=title.value;saveDraft();});description.addEventListener('input',()=>{draft.description=description.value;saveDraft();});
      form.append(el('label',{for:title.id},'Change title'),title,el('label',{for:description.id},'What should change?'),description,el('button',{type:'submit',class:'cq-button cq-primary'},'Queue change'));
      form.addEventListener('submit',event=>{event.preventDefault();action(async()=>{await api('',{title:title.value,description:description.value});draft={title:'',description:''};saveDraft();await load(false);message('Change queued on GitHub.');});});
      composer.append(form); list.append(composer);
      if (!requests.length) list.append(el('div',{class:'cq-empty'},'No requested changes are queued. Add one above.'));
      requests.forEach(request=>{
        const article=el('article',{class:'cq-card'}), heading=el('h3',{},request.title), numbers=request.pull_requests||[];
        article.append(el('span',{class:'cq-kicker'},`REQUEST #${request.number} · ${numbers.length?'PR LINKED':'QUEUED'}`),heading,el('p',{class:'cq-description'},request.description),link('View or edit request on GitHub',request.url));
        if (numbers.length) { const refs=el('div',{class:'cq-tools'});numbers.forEach(number=>refs.append(button('Review PR #'+number,()=>action(()=>loadPull(number)))));article.append(refs); }
        const details=el('details');details.append(el('summary',{},'Link implementation PRs'));
        const form=el('form'), input=el('input',{id:'cq-links-'+request.number,type:'text',placeholder:'e.g. 40, 41'});input.value=numbers.join(', ');
        form.append(el('label',{for:input.id},'PR numbers from this repository'),input,el('button',{type:'submit',class:'cq-button'},'Save PR links'));
        form.addEventListener('submit',event=>{event.preventDefault();action(async()=>{await api('/issues/'+request.number,{revision:request.revision,pull_requests:parsePulls(input.value)});await load(false);message('Implementation PRs linked.');});});
        details.append(form);article.append(details);list.append(article);
      });
    } else {
      if (!pulls.length) list.append(el('div',{class:'cq-empty'},'No open pull requests. Implementation PRs appear here when opened.'));
      pulls.forEach(pr=>{const card=el('article',{class:'cq-card'});card.append(el('span',{class:'cq-kicker'},`PR #${pr.number} · ${pr.draft?'DRAFT':'OPEN'}`),el('h3',{},pr.title),el('p',{class:'cq-muted'},`${pr.base} · ${(pr.labels||[]).join(', ')||'Compatibility label needed'}`),button('Review PR #'+pr.number,()=>action(()=>loadPull(pr.number))));list.append(card);});
    }
    if (more) content.append(button('Load more changes',()=>action(()=>load(true))));
  }
  async function loadPull(number) {
    const version=++detailVersion;message('Loading PR #'+number+' and its current checks…');
    const pr=await api('/pulls/'+number);
    if (version!==detailVersion) return;
    selected=pr;renderPull(pr);message(pr.merged?'This PR has merged. Check its deployment below.':pr.merge_ready?'Ready for your review and explicit merge approval.':'This PR has merge blockers.');
  }
  function addDeployment(parent, deployment, kind) {
    const origin=previewOrigin(deployment?.origin||'');
    if (deployment?.state==='success' && origin) { const row=el('div',{class:'cq-tools'});row.append(link(kind==='live'?'Play live game':'Play PR preview',origin+'/galactic-reach/'),link('Rulebook',origin+'/galactic-reach/rulebook.html'));parent.append(row); }
    else parent.append(el('p',{class:'cq-muted'},kind==='live'?'Merged · waiting for successful checks and the Render deployment.':'Preview is not successfully deployed for this exact head.'));
  }
  function renderPull(pr) {
    content.replaceChildren();
    const tools=el('div',{class:'cq-tools'});tools.append(button('← Queue',()=>renderList()),button('Refresh PR status',()=>action(()=>loadPull(pr.number))));content.append(tools);
    const header=el('div',{class:'cq-pr-heading'});header.append(el('div',{class:'cq-kicker'},`PR #${pr.number} · ${pr.merged?'MERGED':pr.state.toUpperCase()}`),el('h3',{},pr.title),el('p',{class:'cq-muted'},`Into ${pr.base} · head ${pr.head.slice(0,10)}`),link('Read the full diff on GitHub',pr.url+'/files'));
    const counts=el('p',{class:'cq-counts'},`${pr.changed_files??'—'} files · +${pr.additions??'—'} / −${pr.deletions??'—'}`);header.append(counts);content.append(header);
    addDeployment(content,pr.merged?pr.live:pr.preview,pr.merged?'live':'preview');
    const body=el('details');body.append(el('summary',{},'PR description'),el('pre',{class:'cq-description'},pr.body||'No description.'));content.append(body);
    const checks=el('section',{'aria-labelledby':'cq-checks-heading'});checks.append(el('h4',{id:'cq-checks-heading'},'Checks for this head'));
    const rows=el('ul',{class:'cq-checks'});(pr.checks||[]).forEach(check=>rows.append(el('li',{},`${check.name} · ${check.conclusion||check.status}`)));if (!pr.checks?.length)rows.append(el('li',{},'No check results available.'));checks.append(rows);content.append(checks);
    if (!pr.merged && pr.blockers?.length) { const blockers=el('div',{class:'cq-callout'});blockers.append(el('h4',{},'Before merging'));const list=el('ul');pr.blockers.forEach(reason=>list.append(el('li',{},reason)));blockers.append(list);content.append(blockers); }
    if (!pr.merged) content.append(button('Review merge…',()=>confirmMerge(pr),{class:'cq-button cq-primary',...(pr.merge_ready?{}:{disabled:''})}));
  }
  function confirmMerge(pr) {
    const dialog=el('dialog',{class:'cq-confirm','aria-labelledby':'cq-confirm-title'}), breaking=pr.labels.includes('playtest-breaking');
    dialog.append(el('div',{class:'cq-kicker'},'YOUR APPROVAL'),el('h2',{id:'cq-confirm-title'},`Merge PR #${pr.number}?`),el('p',{},pr.title),el('p',{class:'cq-muted'},`Reviewed head ${pr.head}. The server rechecks this commit before merging into main.`));
    const approval=el('input',{type:'checkbox',id:'cq-merge-approval'}), approvalLabel=el('label',{class:'cq-check-label',for:approval.id});approvalLabel.append(approval,doc.createTextNode('I reviewed this PR and approve merging it into main.'));dialog.append(approvalLabel);
    const reset=el('input',{type:'checkbox',id:'cq-reset-approval'});
    if (breaking) { const label=el('label',{class:'cq-check-label',for:reset.id});label.append(reset,doc.createTextNode('I accept the new-game reset for this breaking rules change. Existing pinned games must keep their archived rules.'));dialog.append(label); }
    dialog.append(el('p',{class:'cq-muted'},'Publishing starts after the merge. The panel will show a live link once the matching Render deployment succeeds.'));
    const actions=el('div',{class:'cq-tools'}), cancel=button('Cancel',()=>dialog.close()), merge=button('Merge PR #'+pr.number,async()=>{
      if (!approval.checked || (breaking&&!reset.checked) || busy) return;
      merge.disabled=true;dialog.close();
      await action(async()=>{const result=await api('/pulls/'+pr.number+'/merge',{expected_head:pr.head,confirm:true,acknowledge_reset:reset.checked});await loadPull(pr.number);message(result.message);});
    },{class:'cq-button cq-primary',disabled:''});
    const enable=()=>{merge.disabled=!approval.checked||(breaking&&!reset.checked);};approval.addEventListener('change',enable);reset.addEventListener('change',enable);
    actions.append(cancel,merge);dialog.append(actions);doc.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();panel.querySelector('.cq-primary')?.focus();},{once:true});dialog.showModal();cancel.focus();
  }
  function mount() {
    if (panel) return;
    const root=el('div',{id:'change-queue-root'});launcher=button('Change queue',open,{id:'change-queue-button',class:'button button-ghost','aria-haspopup':'dialog'});
    const header=doc.querySelector('.header-actions');if (!header)return;header.append(launcher);
    const changeNote=doc.getElementById('developer-change-note');if(changeNote)changeNote.hidden=false;
    panel=el('dialog',{id:'change-queue-dialog',class:'cq-panel','aria-labelledby':'cq-title'});
    const heading=el('div',{class:'cq-top'}), title=el('div');title.append(el('div',{class:'cq-kicker'},'DEVELOPER WORKSPACE'),el('h2',{id:'cq-title'},'Change queue'));
    heading.append(title,button('Close',()=>panel.close(),{class:'cq-button cq-quiet cq-close','aria-label':'Close change queue'}));status=el('p',{class:'cq-status',role:'status','aria-live':'polite'});content=el('div',{class:'cq-content'});
    panel.append(heading,el('p',{class:'cq-repository'},REPOSITORY),status,content);root.append(panel);doc.body.append(root);
    panel.addEventListener('close',()=>{clearSecrets();++listVersion;++detailVersion;launcher.focus();});
  }
  async function boot() {
    if (forced) mount();
    try { const response=await host.fetch('/api/session',{credentials:'same-origin'});if (!response.ok)return;const session=await response.json();if (!session.user)return;const profileResponse=await host.fetch('/api/account',{credentials:'same-origin'});if (!profileResponse.ok)return;const profile=await profileResponse.json();if (profile.is_admin)mount(); } catch { /* Guest games work independently of developer tools. */ }
  }
  boot();
})(globalThis);
