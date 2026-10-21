import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {settleLayout} from './browser-settle.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./stream-tray.html',import.meta.url)],['/layout.css',new URL('../theme/local.tsix.layout/layout.css',import.meta.url)],['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]]);
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname,file=routes.get(path);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const errors=[],checks=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 const box=selector=>page.locator(selector).first().boundingBox();
 const same=(a,b)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1,`${key} changed on opening: ${JSON.stringify({a,b})}`)};
 const setChat=async shown=>{const button=page.locator('[data-tsix-chat-toggle]');if((await button.getAttribute('aria-expanded')==='true')!==shown)await button.click();await settleLayout(page)};
 const checkDock=async()=>{
  const r=await page.evaluate(()=>{const p=document.querySelector('.video-stream'),b=p.getBoundingClientRect(),buttons=[...p.querySelectorAll('[data-tsix-view-action],.screen-overlay__bottom .tsv-button')].map(e=>{const b=e.getBoundingClientRect(),i=e.querySelector('svg')?.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right,hit:[[b.x+2,b.y+2],[b.right-2,b.bottom-2]].every(([x,y])=>e.contains(document.elementFromPoint(x,y))),iconInside:!i||(i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom)}});return{player:b.toJSON(),buttons,menus:p.querySelectorAll('[data-tsix-view-action="dots"]').length,popouts:p.querySelectorAll('[data-tsix-view-action="expand"],.screen-overlay__bottom .tsv-button:has(svg[name="expand"])').length}});
  assert.equal(r.menus,1);assert.equal(r.popouts,1);
  for(const b of r.buttons){assert.ok(b.hit&&b.w>=24&&b.h>=24&&b.iconInside,JSON.stringify(r));assert.ok(b.x>=r.player.x&&b.right<=r.player.right);assert.ok(b.y>=r.player.bottom-40&&b.bottom<=r.player.bottom)}
 };
 for(const [width,height]of [[2562,1394],[1322,847],[900,650],[640,480],[360,540]])for(const chat of [true,false]){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&preview=1&incoming=1`);
  await page.locator('[data-tsix-preview-join]').waitFor();await setChat(true);await page.getByLabel('Chat draft').fill('Keep this unsent draft');await setChat(chat);
  const before=await box('.video-stream');assert.ok(before.width>width-100);await checkDock();
  const join=page.getByRole('button',{name:'Watch stream',exact:true});
  assert.ok(await join.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.closest('.video-stream').getBoundingClientRect();return b.width>=96&&b.height>=32&&b.top>=p.top&&b.bottom<=p.bottom&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}));
  if(chat){const c=await box('.ts-chat-container');assert.ok(before.y+before.height<=c.y+1);assert.ok(c.height>=120&&c.y+c.height<=height+1)}
  if(process.env.TSIX_SCREENSHOT_DIR&&[1322,360].includes(width)&&!chat){await mkdir(process.env.TSIX_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/fixture-unopened-${width}.png`})}
  if(width===2562)await join.click();else await join.press(chat?'Enter':'Space');
  await page.waitForFunction(()=>document.querySelector('main').dataset.tsixStreamStage==='single');await settleLayout(page);
  same(before,await box('.video-stream'));await checkDock();assert.equal(await page.locator('[data-tsix-preview-join]').count(),0);
  assert.equal(await page.evaluate(()=>lab.refs.a.querySelector('.video-stream').__vue__.joinCalls),1);
  assert.equal(await page.getByLabel('Chat draft').inputValue(),'Keep this unsent draft');assert.ok(await page.evaluate(()=>lab.report().identity));
  if(process.env.TSIX_SCREENSHOT_DIR&&[1322,360].includes(width)&&!chat)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/fixture-opened-${width}.png`});
  checks.push(`same unopened/playing stage and grouped controls at ${width}x${height}, chat ${chat?'shown':'hidden'}`);
 }
 await page.setViewportSize({width:900,height:650});await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&preview=1`);await page.locator('[data-tsix-preview-join]').first().waitFor();await page.evaluate(()=>{lab.focus(null);window.__tsixStreams.sync()});await setChat(true);
 const previews=await page.locator('.video-stream').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()));
 for(let i=0;i<3;i++){await page.locator('[data-tsix-preview-join]').first().click();await settleLayout(page)}
 const players=await page.locator('.video-stream').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()));previews.forEach((b,i)=>same(b,players[i]));
 checks.push('opening multiple preview cards preserves native grid geometry');
 await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&incoming=1`);await setChat(true);
 await page.evaluate(()=>{lab.vm.resizeVideoHeightOrigin=lab.vm.gridHeight;lab.vm.overrideSplitPercentage=.45;lab.vm.maximumVideoHeight=lab.vm.maximumHeight*.45;window.__tsixStreams.sync();lab.vm.resizeVideoHeightOrigin=-1;window.__tsixStreams.sync()});await setChat(false);await setChat(true);
 assert.ok(Math.abs(await page.evaluate(()=>lab.vm.overrideSplitPercentage)-.45)<.001);checks.push('manual divider preference survives chat toggles');
 await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&preview=1`);await page.locator('[data-tsix-preview-join]').waitFor();await settleLayout(page);
 const writes=await page.evaluate(()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(e=>n+=e.length);o.observe(document.querySelector('main'),{subtree:true,childList:true,attributes:true});for(let i=0;i<50;i++)window.__tsixStreams.sync();queueMicrotask(()=>{o.disconnect();resolve(n)})}));
 assert.equal(writes,0);assert.equal(await page.locator('[data-tsix-view-action]').count(),2);checks.push('unopened controls stay stable through 50 idle reconciliations');
 await page.evaluate(()=>window.__tsixStreams.dispose());
 assert.equal(await page.locator('[data-tsix-preview-join],[data-tsix-stream-layout],[data-tsix-stream-region],[data-tsix-stream-row],[data-tsix-view-actions],[data-tsix-stream-footer],[data-tsix-source-actions]').count(),0);checks.push('cleanup removes join/dock controls and restores native sources and stage markers');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
