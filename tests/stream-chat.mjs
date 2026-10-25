import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {settleLayout} from './browser-settle.mjs';
import {clientPath} from './client-path.mjs';
const chatIcon=(await readFile(`${clientPath}/html/client_ui/images/icons/chat.svg`,'utf8')).replace('<svg','<svg name="mode-chat"');
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./stream-tray.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]]);
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname,file=routes.get(path);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');let content=await readFile(file);if(path==='/')content=content.toString().replace('<main class="tsv-screenshare">',`<div hidden>${chatIcon}</div><main class="tsv-screenshare">`);res.end(content)});
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
  assert.equal(await page.locator('main > [data-tsix-stream-toolbar]').count(),0);
  assert.equal(await page.locator('[data-tsix-chat-rail] [data-tsix-chat-icon]').count(),1);
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
 // beta5 keeps the source catalogue and view menu when its last preview is
 // hidden, but removes the screen-grid entirely. Preserve that exact boundary.
 await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&incoming=1`);await setChat(true);
 await page.getByLabel('Chat draft').fill('Unsent while my preview is hidden');
 await page.evaluate(()=>{
  const wrapper=document.querySelector('.screen-grid-wrapper');
  lab.hiddenGrid=wrapper.querySelector('.screen-grid');lab.hiddenGrid.remove();
  lab.visibleSessions=lab.vm.allSessions;lab.hiddenStream=lab.vm.allSessions[0];lab.hiddenStream.isInbound=false;lab.hiddenStream.hidden=true;
  lab.vm.allSessions=[];lab.vm.doUpdateGrid();
  Object.defineProperty(document.querySelector('main').__vue__,'sortableStreamsContainer',{configurable:true,get:()=>({sortedStreams:lab.visibleSessions})});
  wrapper.classList.add('is-empty');
  const message=document.createElement('div');message.id='hidden-message';message.textContent='All streams are hidden! You can view hidden streams in the advanced options.';wrapper.append(message);
  __tsixStreams.sync();
 });
 const empty=page.locator('[data-tsix-empty-stream-row]');await empty.waitFor();
 assert.equal(await page.locator('[data-tsix-stream-footer],[data-tsix-view-action="expand"]').count(),0);
 assert.equal(await empty.locator('[data-tsix-view-action="dots"]').count(),1);
 assert.equal(await page.locator('[data-tsix-chat-toggle]').count(),0);
 for(const [width,height]of [[1322,847],[640,480],[360,540]]){
  await page.setViewportSize({width,height});await settleLayout(page);
  const menu=empty.locator('[data-tsix-view-action="dots"]');
  assert.ok(await menu.evaluate(button=>{const b=button.getBoundingClientRect(),r=button.closest('[data-tsix-empty-stream-row]').getBoundingClientRect();return r.height<100&&b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom&&button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}));
  await menu.press('Enter');
  assert.ok(await page.locator('.ts-stream-view-settings .tsv-button').evaluate(button=>Number(button.dataset.activations)>0&&button.dataset.ownerVisible==='true'));
  if(process.env.TSIX_SCREENSHOT_DIR&&width===1322)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/all-streams-hidden.png`});
 }
 assert.ok(await page.evaluate(()=>lab.hiddenStream.hidden&&lab.report().identity));
 assert.equal(await page.getByLabel('Chat draft').inputValue(),'Unsent while my preview is hidden');
 await page.evaluate(()=>{
  __tsixStreams.dispose();
 });
 assert.equal(await page.locator('[data-tsix-empty-stream-row],[data-tsix-source-actions]').count(),0);
 await page.evaluate(await readFile(routes.get('/streams-runtime.js'),'utf8'));await empty.waitFor();
 await page.evaluate(()=>{
  const wrapper=document.querySelector('.screen-grid-wrapper');wrapper.querySelector('#hidden-message').remove();wrapper.classList.remove('is-empty');wrapper.append(lab.hiddenGrid);
  lab.hiddenStream.hidden=false;lab.vm.allSessions=lab.visibleSessions;lab.vm.doUpdateGrid();__tsixStreams.sync();
 });
 await empty.waitFor({state:'detached'});await settleLayout(page);await checkDock();
 assert.equal(await page.getByLabel('Chat draft').inputValue(),'Unsent while my preview is hidden');
 checks.push('All-hidden state keeps one inline native restore menu without an empty toolbar or popout; hide/show, media, draft and cleanup remain intact');
 await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&incoming=1`);await setChat(true);
 await page.evaluate(()=>{lab.vm.resizeVideoHeightOrigin=lab.vm.gridHeight;lab.vm.overrideSplitPercentage=.45;lab.vm.maximumVideoHeight=lab.vm.maximumHeight*.45;window.__tsixStreams.sync();lab.vm.resizeVideoHeightOrigin=-1;window.__tsixStreams.sync()});await setChat(false);await setChat(true);
 assert.ok(Math.abs(await page.evaluate(()=>lab.vm.overrideSplitPercentage)-.45)<.001);checks.push('manual divider preference survives chat toggles');
 await page.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&single=1&preview=1`);await page.locator('[data-tsix-preview-join]').waitFor();await settleLayout(page);
 const writes=await page.evaluate(()=>new Promise(resolve=>{const changes=[];const o=new MutationObserver(es=>changes.push(...es.map(e=>({type:e.type,name:e.attributeName,tag:e.target.tagName,attributes:e.target.getAttributeNames?.().filter(n=>n.startsWith('data-tsix')),style:e.target.getAttribute?.('style')}))));o.observe(document.querySelector('main'),{subtree:true,childList:true,attributes:true});for(let i=0;i<50;i++)window.__tsixStreams.sync();queueMicrotask(()=>{o.disconnect();resolve(changes)})}));
 assert.deepEqual(writes,[]);assert.equal(await page.locator('[data-tsix-view-action]').count(),2);checks.push('unopened controls stay stable through 50 idle reconciliations');
 await page.evaluate(()=>window.__tsixStreams.dispose());
 assert.equal(await page.locator('[data-tsix-preview-join],[data-tsix-stream-layout],[data-tsix-stream-region],[data-tsix-stream-row],[data-tsix-view-actions],[data-tsix-stream-footer],[data-tsix-source-actions]').count(),0);checks.push('cleanup removes join/dock controls and restores native sources and stage markers');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
