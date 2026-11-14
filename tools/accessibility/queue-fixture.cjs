// Local-only, in-memory repository fixture. Never calls GitHub or merges a PR.
const repo='CardBoardStudio/drawing_board',head='a'.repeat(40);
let mode='',connected=false,requests=[],prs=[],calls=[];
function reset(value) {
  mode=value||'ready';connected=!['disconnected','preview','guest','member'].includes(mode);calls=[];
  requests=[{number:12,title:'Make ship groups easier to read',description:'Keep each ship type and its complete quantity visible on the board.',state:'open',pull_requests:[42],revision:'fixture-1',url:`https://github.com/${repo}/issues/12`}];
  if(mode==='long'){requests[0].title='A'.repeat(160);requests[0].description=('A detailed requested change with several concrete examples. ').repeat(90);}
  prs=[{number:42,title:'Improve ship markers on the board',state:'open',draft:false,merged:false,head,base:'main',labels:[mode==='breaking'?'playtest-breaking':'playtest-safe'],url:`https://github.com/${repo}/pull/42`,body:'Keep mixed ship counts readable.\n\nValidation: dialog and replay checks passed.',changed_files:3,additions:28,deletions:9,checks:['Galactic Reach JavaScript checks','Rust checks and Wasm','Preview container smoke','Rules contract'].map(name=>({name,status:'completed',conclusion:mode==='blocked'?'failure':'success'})),blockers:mode==='blocked'?['Wait for every current-head check to pass.']:[],merge_ready:mode!=='blocked',preview:{state:'success',origin:'https://drawing-board-pr-42.onrender.com'}}];
}
async function handle(req,res,url) {
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;};
  if(url.pathname==='/api/session')return send(200,{user:mode&&mode!=='guest'?{name:'Developer'}:null});
  if(url.pathname==='/api/account')return send(200,{name:'Developer',is_admin:mode!=='member'&&mode!=='guest'});
  if(url.pathname==='/__queue/evidence')return send(200,{calls,connected});
  if(!url.pathname.startsWith('/api/admin/change-queue'))return false;
  if(mode==='guest'||!mode)return send(401,{error:'Sign in to the host account.'});
  if(mode==='member')return send(403,{error:'Administrator access is required for the change queue.'});
  let body={};if(req.method==='POST'){let text='';for await(const part of req)text+=part;body=JSON.parse(text||'{}');}
  const path=url.pathname.slice('/api/admin/change-queue'.length);
  if(req.method==='POST'&&req.headers['x-drawing-board']!=='1')return send(403,{error:'Missing request protection header.'});
  if(path==='/connect'){if(mode==='preview')return send(403,{error:'Connections disabled on previews.'});connected=true;calls.push({type:'connect',tokenReceived:!!body.token});return send(200,{connected:true,repository:repo,expires_in:3600});}
  if(path==='/disconnect'){connected=false;calls.push({type:'disconnect'});return send(200,{connected:false});}
  if(path==='') {
    if(mode==='error')return send(503,{error:'GitHub is temporarily unavailable. Refresh before retrying a write.'});
    if(req.method==='GET')return send(200,{connected,preview:mode==='preview',repository:repo,page:Number(url.searchParams.get('page')||1),more:false,requests:connected?requests:[],pull_requests:connected?prs.filter(p=>!p.merged):[]});
    const number=13+requests.length;const item={number,title:body.title,description:body.description,state:'open',pull_requests:[],revision:'fixture-'+number,url:`https://github.com/${repo}/issues/${number}`};requests.unshift(item);calls.push({type:'create',title:body.title});return send(200,item);
  }
  if(path.startsWith('/issues/')){const number=Number(path.split('/')[2]),item=requests.find(i=>i.number===number);if(!item)return send(404,{error:'Request not found.'});if(body.revision!==item.revision)return send(409,{error:'The request changed. Refresh before linking PRs.'});item.pull_requests=body.pull_requests;item.revision+='-updated';calls.push({type:'link',number,pulls:body.pull_requests});return send(200,item);}
  if(path==='/pulls/42/merge') {
    calls.push({type:'merge',expected_head:body.expected_head,confirm:body.confirm,acknowledge_reset:body.acknowledge_reset});
    if(mode==='stale')return send(409,{error:'The PR head changed. Refresh and review the new commit before merging.'});
    if(!body.confirm||body.expected_head!==head||!prs[0].merge_ready||(mode==='breaking'&&!body.acknowledge_reset))return send(409,{error:'Merge approval is incomplete.'});
    prs[0].merged=true;prs[0].state='closed';prs[0].live={state:'pending'};return send(200,{merged:true,sha:'b'.repeat(40),message:'Merged into main. Waiting for checks and the live deployment.'});
  }
  if(path==='/pulls/42')return send(200,prs[0]);
  return send(404,{error:'Fixture endpoint not found.'});
}
module.exports={reset,handle};
