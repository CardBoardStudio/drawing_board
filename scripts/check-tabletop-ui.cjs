// Public-board viewport, keyboard and touch checks over the real browser bundle.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {launch}=require('./lib/tabletop-browser.cjs');
const root=path.join(__dirname,'..'),id='a'.repeat(32),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8')+fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8'),context);
const adapter=context.createGalacticReach({headless:true,names:['Ada','Bo','Violet','Helios'],controllers:['human','human','ai','ai'],random:()=>0.41});
const view={id,role:'board',name:'Tabletop playtest',status:'active',seq:19,client_path:'/galactic-reach/',rules_version:'galactic-reach/38.43',state:JSON.parse(JSON.stringify(adapter.publicState()))};
const requests=[];
const server=http.createServer((req,res)=>{
  requests.push([req.method,req.url]);
  if(req.method==='POST'&&req.url===`/api/tabletop/${id}/focus`){res.setHeader('Content-Type','application/json');return res.end('{}');}
  if(req.url===`/api/tabletop/${id}/board`){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(view));}
  if(req.url===`/api/tabletop/${id}/stream`){res.setHeader('Content-Type','text/event-stream');return res.write(`event: view\ndata: ${JSON.stringify(view)}\n\n`);}
  const file=new URL(req.url,'http://localhost').pathname.split('/').pop();
  if(!['board.html','board.js','board.css'].includes(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,'prototypes/tabletop',file)));
});
(async()=>{

  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await launch();
  try{
    for(const [width,height] of [[1280,720],[1440,900],[1024,768],[768,1024],[390,844]]){
      browser.errors.length=0;
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await browser.send('Emulation.setTouchEmulationEnabled',{enabled:width<1100});
      await browser.navigate(`http://127.0.0.1:${server.address().port}/tabletop/board.html?table=${id}`);
      await browser.evaluate(`new Promise((resolve,reject)=>{let tries=0;const t=setInterval(()=>{if(document.querySelectorAll('.player').length===4){clearInterval(t);resolve();}else if(++tries>100){clearInterval(t);reject(Error('Board did not load'));}},20);})`);
      const result=await browser.evaluate(`(()=>{const d=document.scrollingElement,map=document.querySelector('#map').getBoundingClientRect();return {width:d.scrollWidth,height:d.scrollHeight,mapHeight:map.height,hexes:document.querySelectorAll('.hex').length};})()`);
      assert(result.width<=width,`horizontal overflow at ${width}x${height}`);
      if(width>=600)assert(result.height<=height,`vertical overflow at ${width}x${height}`);
      assert(result.mapHeight>250);assert.equal(result.hexes,331);
      for(const coord of [...Object.keys(view.state.planets),...Object.keys(view.state.portalLinks)])assert(await browser.evaluate(`!!document.querySelector('.hex[data-coord="${coord}"]')`),`board omitted ${coord}`);
      await browser.evaluate(`document.querySelector('.hex[data-type="matter"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector('#cards-open').click();`);
      assert(await browser.evaluate(`document.querySelector('#cards').open && document.querySelector('#sector-title').textContent !== 'Inspect the galaxy'`));
      await browser.evaluate(`document.querySelector('#cards-close').click()`);
      assert.deepEqual(browser.errors,[]);
      if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});const shot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SHOTS,`board-${width}x${height}.png`),Buffer.from(shot.data,'base64'));}
      console.log(`ok - public board ${width}x${height}`);
    }
    assert(requests.every(([method,url])=>(method==='GET'||url===`/api/tabletop/${id}/focus`)&&!url.includes('/api/shared/')),'board uses no private endpoint or game command');
  }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exit(1);});
