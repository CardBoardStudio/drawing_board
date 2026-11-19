// Chromium uses the repository's dependency-free harness. WebKit is optional:
// BROWSER=webkit PLAYWRIGHT_MODULE=/path/to/playwright node <check script>.
const chrome=require('../check-viewport-fit.cjs');
async function launch(){
  if(process.env.BROWSER!=='webkit'){
    const browser=await chrome.launch(chrome.findChrome());
    await browser.send('Network.enable');
    browser.setOffline=offline=>browser.send('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    return browser;
  }
  const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  return {
    errors,
    navigate:url=>page.goto(url,{waitUntil:'load'}),
    evaluate:expression=>page.evaluate(expression),
    setOffline:offline=>context.setOffline(offline),
    send:async(method,params={})=>{
      if(method==='Emulation.setDeviceMetricsOverride'){await page.setViewportSize({width:params.width,height:params.height});return {};}
      if(method==='Emulation.setTouchEmulationEnabled')return {};
      if(method==='Page.captureScreenshot')return {data:(await page.screenshot({type:'png'})).toString('base64')};
      if(method==='Page.reload'){await page.reload();return {};}
      throw new Error(`Unsupported browser-check command: ${method}`);
    },
    close:()=>browser.close()
  };
}
module.exports={launch};
