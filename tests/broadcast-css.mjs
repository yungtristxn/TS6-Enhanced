// Real native stylesheet/theme/font cascade, with synthetic outbound sessions.
// Covers the upgrade state that the original clean-shell fixture omitted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {clientPath} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const [html,css,runtime,native,legacy,bundle]=await Promise.all([
 readFile(new URL('./broadcast.html',import.meta.url),'utf8'),
 readFile(new URL('../theme/layout.css',import.meta.url),'utf8'),
 readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8'),
 readFile(clientPath+'/html/client_ui/main.css','utf8'),
 readFile(new URL('./fixtures/legacy-sharing.css',import.meta.url),'utf8'),
 readFile(clientPath+'/html/client_ui/main.js','utf8')
]);
const signature='8165:(e,t,n)=>{',start=bundle.indexOf(signature)+signature.length,end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));
assert.ok(start>=signature.length&&end);
const darkExports={},require=id=>id===76314?()=>[]:{};
require.r=()=>{};require.n=value=>()=>value;require.d=(target,props)=>{for(const [key,get]of Object.entries(props))Object.defineProperty(target,key,{get})};
new Function('e','t','n',bundle.slice(start,start+end.index))({id:8165},darkExports,require);
const dark=darkExports.default.map(entry=>entry[1]).join('\n'),browser=await chromium.launch({headless:true}),checks=[],errors=[];
try{
 for(const [scale,width,height,dpr] of [['small',1322,847,1],['medium',900,600,1.5],['large',640,480,2]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://sharing-css.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   const assets={'/layout.css':css,'/native.css':native,'/dark.css':dark,'/streams-runtime.js':runtime,'/legacy.css':legacy};
   if(path in assets)return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':'text/css',body:assets[path]});
   if(/^\/[a-f0-9]+\.(woff2?|ttf)$/.test(path))return route.fulfill({body:await readFile(clientPath+'/html/client_ui'+path)});
   if(path!=='/')return route.fulfill({status:204});
   const body=html.replace('<link rel="stylesheet" href="/layout.css">','<link rel="stylesheet" href="/native.css"><link rel="stylesheet" href="/layout.css"><link rel="stylesheet" href="/dark.css">')
    .replace("font:14px 'Segoe UI',sans-serif","font:14px var(--tsv-font-family),sans-serif");
   return route.fulfill({contentType:'text/html',body});
  });
  await page.goto('http://sharing-css.test/',{waitUntil:'domcontentloaded'});
  await page.evaluate(scale=>{
   document.querySelector('.tsv-window').classList.add('tsv-window-scale-'+scale);
   // Native Vue normally sizes the nested item-view flex ancestors. This
   // component fixture pins only the footer anchor, without replacing any
   // native button/font rules or the production bar's own layout.
   const footer=document.querySelector('.ts-server-status-bar');
   footer.style.height='55px';document.querySelector('.main-pane-layout').append(footer);
   lab.start([1]);__tsixStreams.sync();
  },scale);
  await page.evaluate(()=>document.fonts.ready);
  const bar=page.locator('[data-tsix-broadcast-bar]');
  for(const late of [false,true]){
   if(late)await page.addStyleTag({content:legacy});
   for(const column of [320,260,220]){
    await page.evaluate(column=>{lab.root.style.setProperty('--tsix-navigator-width',column+'px');const pane=document.querySelector('.main-pane-layout');pane.style.width=column+'px';pane.style.minWidth=column+'px';__tsixStreams.sync()},column);
    const metrics=await bar.evaluate(element=>{
     const r=element.getBoundingClientRect(),s=getComputedStyle(element);
     return {x:r.x,y:r.y,width:r.width,height:r.height,pane:element.parentElement.getBoundingClientRect().toJSON(),inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,direction:s.flexDirection,border:s.borderLeftWidth,font:s.fontFamily,
      buttons:[...element.querySelectorAll('button')].filter(button=>button.getClientRects().length).map(button=>{
       const b=button.getBoundingClientRect(),label=button.querySelector('[data-tsix-share-label]');
       return {width:b.width,height:b.height,inside:b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,readable:!label||button.dataset.tsixShareAction==='open'||label.scrollWidth<=label.clientWidth};
      })};
    });
    assert.equal(metrics.direction,'column');assert.equal(metrics.border,'1px');assert.ok(metrics.inViewport&&metrics.width>=190&&metrics.height>=100&&metrics.height<160,JSON.stringify(metrics));
    assert.ok(metrics.buttons.every(button=>button.width>=24&&button.height>=24&&button.inside&&button.readable),JSON.stringify(metrics));
   }
   checks.push(scale+', DPR '+dpr+', native font, 320/260/220px panes, '+(late?'legacy theme loaded last':'clean appearance'));
  }
  const pause=bar.locator('[data-tsix-share-action="pause"]');
  await pause.press('Enter');await page.waitForFunction(()=>lab.streams[0].data.paused);
  assert.ok(await pause.locator('[data-tsix-share-label]').evaluate(label=>label.scrollWidth<=label.clientWidth));
  assert.equal(await page.evaluate(()=>lab.report().sameMedia&&lab.report().sameVideo),true);
  if(process.env.TSIX_SCREENSHOT_DIR){
   await mkdir(process.env.TSIX_SCREENSHOT_DIR,{recursive:true});
   const capture=await context.newCDPSession(page),bounds=await bar.boundingBox();
   const shot=await capture.send('Page.captureScreenshot',{format:'png',clip:{...bounds,scale:1}});
   await writeFile(process.env.TSIX_SCREENSHOT_DIR+'/sharing-cascade-'+scale+'.png',Buffer.from(shot.data,'base64'));await capture.detach();
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Real native CSS/fonts with synthetic sessions; no friend-machine verification'},null,2));
}finally{await browser.close()}
