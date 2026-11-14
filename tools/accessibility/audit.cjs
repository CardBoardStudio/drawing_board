// Local QA only. The published game never loads axe or the audit controls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'prototypes/galactic-reach');
const port = Number(process.env.A11Y_PORT || 8885);
const output = path.resolve(process.env.A11Y_OUTPUT || path.join(__dirname, 'reports'));
const axe = require.resolve('axe-core/axe.min.js');
fs.mkdirSync(output, {recursive:true});
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hashes = () => Object.fromEntries(['app.js','index.html','styles.css','rulebook.html','rulebook.css','playtest-notes.js','playtest-notes.css'].map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')]));

function fixture(kind) {
  let engine, seed=1729;
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(source,'adapter.js'),'utf8')+fs.readFileSync(path.join(source,'app.js'),'utf8'),context);
  const factory=context.createGalacticAdapter;
  context.createGalacticAdapter=value=>{engine=value;return factory(value);};
  const adapter=context.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  const state=engine.state;
  if (kind==='buy') {
    Object.assign(state,{phase:'buy',turnStage:'buy',activePlayer:0});
    Object.assign(state.players[0],{passed:true,storageUpgrades:2,resources:{matter:4,energy:4,biomass:4,data:4}});
  } else if (kind==='mixed') {
    state.fleets={'-9,0':{0:{settler:2,explorer:1,fleet:2}},'9,0':{2:{settler:2,explorer:1,fleet:2}}};
  } else if (kind==='overflow') engine.addResources(state.players[0],{matter:10});
  else if (kind==='combat') {
    Object.assign(state,{phase:'operations',turnStage:'action',activePlayer:0});
    state.fleets={'10,-10':{0:{fleet:1,explorer:0,settler:0}},'9,-10':{1:{fleet:1,explorer:0,settler:0}}};
    state.players.forEach((p,id)=>{p.hand=id===0?[{key:'move',id:'a11y-combat-move'}]:[];p.resources={matter:0,energy:0,biomass:0,data:0};});
    adapter.applyAction(0,adapter.legalActions(0).find(a=>a.type==='move'&&a.source==='10,-10'&&a.destination==='9,-10'));
    engine.applyCombatAction(0,{type:'combat_stay'});engine.applyCombatAction(1,{type:'combat_stay'});
  }
  return state;
}

function summary() {
  const reports=fs.readdirSync(output).filter(file=>file.endsWith('.json')).map(file=>({file,...JSON.parse(fs.readFileSync(path.join(output,file),'utf8'))}));
  const current=hashes();
  const currentReports=reports.filter(r=>Object.entries(current).every(([file,hash])=>r.sourceHashes[file]===hash));
  const rows=currentReports.map(r=>`<tr><td><a href="${escape(r.file)}">${escape(r.case)}</a></td><td>${r.viewport.width} × ${r.viewport.height}</td><td>${r.violations.length}</td><td>${r.contrastReview?(r.contrastReview.failures.length+(r.mapContrastReview?.failures.length||0)):'pending'}</td><td>${r.incomplete.length}</td><td>${escape(r.testedAt)}</td></tr>`).join('');
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Galactic Reach accessibility audit</title><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#152526;color:#fff5df}a{color:#ffe09f}table{border-collapse:collapse;width:100%}th,td{padding:12px;border:1px solid #819481;text-align:left}.scroll{overflow:auto}</style><main><h1>Galactic Reach accessibility audit</h1><p>axe-core 4.14.0 · WCAG 2.2 A/AA and best practices. Automated scans do not replace keyboard, reflow, focus and assistive-technology review. The table includes only the current source hashes. Each JSON records exact source hashes, raw axe results and conservative gradient contrast checks. Earlier scans remain in this folder as evidence. Icon controls and gradient indeterminates also receive manual review.</p><div class="scroll"><table><thead><tr><th>Case</th><th>Viewport</th><th>Violations</th><th>Contrast checks</th><th>Raw review items</th><th>Tested</th></tr></thead><tbody>${rows}</tbody></table></div></main></html>`);
}

const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const send=(res,status,body,type='text/plain')=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);};
http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='POST'&&url.pathname==='/__audit/result') {
      let body='';for await(const part of req){body+=part;if(body.length>12_000_000)throw Error('Report too large');}
      const report=JSON.parse(body);report.sourceHashes=hashes();
      const version=crypto.createHash('sha256').update(JSON.stringify(report.sourceHashes)).digest('hex').slice(0,10);
      const file=String(report.case).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100)+'-'+version+'.json';
      fs.writeFileSync(path.join(output,file),JSON.stringify(report,null,2));summary();send(res,200,JSON.stringify({file}),types['.json']);return;
    }
    if(req.method!=='GET'){send(res,405,'GET or POST required');return;}
    if(url.pathname==='/__audit/axe.min.js'){send(res,200,fs.readFileSync(axe),types['.js']);return;}
    if(url.pathname==='/__audit/runner.js'){send(res,200,fs.readFileSync(path.join(__dirname,'runner.js')),types['.js']);return;}
    const relative=decodeURIComponent(url.pathname).replace(/^\/galactic-reach\/?/,'')||'index.html';
    const filename=path.resolve(source,relative);
    if(!filename.startsWith(source+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){send(res,404,'Not found');return;}
    let content=fs.readFileSync(filename);
    if(path.extname(filename)==='.html') {
      let html=content.toString();
      if(path.basename(filename)==='index.html') {
        const saved=JSON.stringify(JSON.stringify(fixture(url.searchParams.get('fixture')||'fresh'))).replace(/</g,'\\u003c');
        html=html.replace('  <script src="table.js',`<script>localStorage.removeItem('galactic-reach-turn-history-v27');localStorage.removeItem('galactic-reach-history-v27');localStorage.setItem('galactic-reach-save-v27',${saved});</script>\n  <script src="table.js`);
      }
      content=html.replace('</body>','<script src="/__audit/axe.min.js"></script><script src="/__audit/runner.js"></script></body>');
    }
    send(res,200,content,types[path.extname(filename)]||'application/octet-stream');
  } catch(error){send(res,500,error.stack);}
}).listen(port,'127.0.0.1',()=>process.stdout.write(`Accessibility fixture: http://127.0.0.1:${port}/galactic-reach/\nReports: ${output}\n`));
