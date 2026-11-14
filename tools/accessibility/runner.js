(() => {
  const rgb=color=>{const values=color.match(/[\d.]+/g)?.map(Number)||[0,0,0];return {rgb:values.slice(0,3),alpha:values[3]??1};};
  const luminance=channels=>channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  // Review axe's gradient indeterminates against conservative, documented
  // surface bounds. Dark textures stay below #34494a; paper gradients only
  // lighten their base. Keep the raw axe indeterminates in the report too.
  function reviewContrast(nodes) {
    const samples=[];
    for(const node of nodes) {
      const element=document.querySelector(node.target.join(' '));
      if(!element||element.closest('[aria-hidden="true"],:disabled'))continue;
      const style=getComputedStyle(element);let current=element,background,gradient=false;
      while(current) {
        const computed=getComputedStyle(current),color=rgb(computed.backgroundColor);
        gradient ||= computed.backgroundImage!=='none';
        if(color.alpha>=.999){background=color.rgb;break;}current=current.parentElement;
      }
      background ||= [16,25,29];
      if(gradient&&luminance(background)<.5)background=background.map((v,i)=>Math.max(v,[52,73,74][i]));
      const color=rgb(style.color),foreground=color.rgb.map((v,i)=>v*color.alpha+background[i]*(1-color.alpha));
      const values=[luminance(foreground),luminance(background)].sort((a,b)=>a-b);
      const ratio=(values[1]+.05)/(values[0]+.05);
      const large=parseFloat(style.fontSize)>=24||(Number(style.fontWeight)>=700&&parseFloat(style.fontSize)>=18.667);
      const required=large?3:4.5;
      samples.push({target:node.target,foreground:style.color,backgroundBound:background,ratio:Number(ratio.toFixed(2)),required,pass:ratio>=required});
    }
    return {method:'Computed foreground; opaque surface or conservative dark-texture/paper gradient bounds. Decorative and disabled elements excluded.',samples,failures:samples.filter(sample=>!sample.pass)};
  }
  function reviewMapContrast() {
    const space=document.querySelector('.hex.space');if(!space)return null;
    const blend=(a,b,alpha)=>a.map((v,i)=>v*alpha+b[i]*(1-alpha));
    const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05);};
    const lightSpace=blend([255,255,255],rgb(getComputedStyle(space,'::before').backgroundColor).rgb,6/255);
    const samples=['matter','energy','biomass','data'].map(resource=>{
      const hex=document.querySelector('.hex.'+resource),base=rgb(getComputedStyle(hex,'::before').backgroundColor).rgb;
      const darkTile=blend([0,0,0],base,12/255),lightTile=blend([255,255,255],base,6/255);
      const boundary=ratio(darkTile,lightSpace),building=ratio([247,251,255],lightTile),fleetKeyline=ratio([7,16,26],darkTile);
      return {resource,boundary:Number(boundary.toFixed(2)),building:Number(building.toFixed(2)),fleetKeyline:Number(fleetKeyline.toFixed(2)),pass:Math.min(boundary,building,fleetKeyline)>=3};
    });
    return {method:'3:1 graphical contrast, including the tile bevel’s light/dark bounds. Ships retain faction color with a dark keyline.',samples,failures:samples.filter(sample=>!sample.pass)};
  }
  const controls=document.createElement('div');controls.id='accessibility-audit-controls';
  controls.style.cssText='position:fixed;bottom:8px;right:8px;z-index:9999;padding:10px;background:#fff;color:#111;border:2px solid #111;border-radius:6px;font:14px/1.4 system-ui;max-width:calc(100vw - 16px)';
  controls.innerHTML='<button type="button" id="run-accessibility-audit" style="font:inherit;padding:8px;color:#111;background:#fff;border:2px solid #111">Run WCAG audit</button> <output id="accessibility-audit-status" aria-live="polite">Ready</output>';
  function positionControls(){const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.querySelector('[popover]:popover-open')||document.body;if(controls.parentElement!==host)host.appendChild(controls);}
  positionControls();new MutationObserver(positionControls).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('toggle',positionControls,true);
  controls.querySelector('button').addEventListener('click',async()=>{
    const status=controls.querySelector('output');
    controls.hidden=true;
    try {
      const results=await axe.run({exclude:[['#accessibility-audit-controls']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
      const params=new URL(location.href).searchParams;
      const fixture=(params.get('fixture')||'fresh')+(params.has('queue')?'-'+params.get('queue'):'');
      const panel=document.querySelector('.console-tab[aria-selected="true"]')?.dataset.tab||'rulebook';
      const modal=[...document.querySelectorAll('dialog[open]')].at(-1);
      const dialog=modal?(modal.id||modal.classList[0]):document.querySelector('[popover]:popover-open')?.id||'page';
      const expanded=[...document.querySelectorAll('details[open]')].map(el=>el.id).filter(Boolean).join('_');
      const zoom=document.querySelector('#map-zoom')?.getAttribute('aria-pressed')==='true'?'-zoom':'';
      const queueView=document.querySelector('.cq-pr-heading')?(document.querySelector('.cq-pr-heading .cq-kicker').textContent.includes('MERGED')?'review-merged':'review'):document.querySelector('#cq-token')?'connect':document.querySelector('#cq-tab-pulls[aria-selected="true"]')?'pulls':document.querySelector('#cq-tab-requests[aria-selected="true"]')?'requests':'';
      const name=`${fixture}-${panel}-${dialog}${queueView?'-'+queueView:''}${expanded?'-'+expanded:''}${zoom}-${innerWidth}`;
      const report={case:name,testedAt:new Date().toISOString(),url:location.href,viewport:{width:innerWidth,height:innerHeight},axeVersion:results.testEngine.version,violations:results.violations,incomplete:results.incomplete,passes:results.passes.map(rule=>rule.id)};
      report.contrastReview=reviewContrast(results.incomplete.filter(rule=>rule.id==='color-contrast').flatMap(rule=>rule.nodes));
      report.mapContrastReview=reviewMapContrast();
      const response=await fetch('/__audit/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
      if(!response.ok)throw Error('Report could not be saved');
      status.textContent=`${name}: ${results.violations.length} violations; ${report.contrastReview.failures.length} text contrast failures; ${report.mapContrastReview?.failures.length||0} map contrast failures; ${results.incomplete.length} raw review items. ${results.violations.map(rule=>rule.id).join(', ')}`;
    } catch(error){status.textContent=error.message;}
    finally {controls.hidden=false;positionControls();}
  });
})();
