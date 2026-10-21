// Browser regression test; Playwright is a development-only dependency.
// Set TSIX_PLAYWRIGHT_MODULE to reuse an existing installation's index.mjs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {settleLayout} from './browser-settle.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href : 'playwright');
const routes=new Map([
 ['/',new URL('./stream-tray.html',import.meta.url)],
 ['/layout.css',new URL('../theme/local.tsix.layout/layout.css',import.meta.url)],
 ['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]
]);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname, file=routes.get(path);
 if(!file){res.writeHead(404).end();return;}
 try {res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(file));}
 catch {res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[],checks=[];
try {
 browser=await chromium.launch({headless:true, ...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text())});
 const beta5=process.env.TSIX_STREAM_MODEL==='beta5';
 const url=`http://127.0.0.1:${server.address().port}/${beta5?'?model=beta5':''}`;
 await page.goto(url);assert.equal(page.url(),url);assert.match(await page.title(),/stream tray fixture/);
 const toggle=page.locator('[data-tsix-tray-toggle]');
 const state=()=>page.evaluate(()=>lab.report());
 const check=async(name,fn)=>{await fn();checks.push(name)};
 await check('Chat is available by default and focus mode is an explicit choice',async()=>{
  await page.getByRole('button',{name:'Hide chat',exact:true}).waitFor();
  assert.ok(await page.locator('.ts-chat-container').isVisible());assert.ok((await state()).split<1);
  await page.getByRole('button',{name:'Hide chat',exact:true}).click();
  assert.equal(await page.locator('.ts-chat-container').isVisible(),false);assert.equal((await state()).split,1);
  assert.ok(await page.locator('.ts-chat-container').evaluate(e=>e.inert&&e.getAttribute('aria-hidden')==='true'&&e.getBoundingClientRect().height>0));
 });
 for(const [width,height] of [[1322,847],[900,650],[640,480]]) {
  await page.setViewportSize({width,height});
  // ResizeObserver/native measurements settle asynchronously after the viewport
  // changes; comparing a new collapsed size to the previous viewport is invalid.
  await page.waitForFunction(()=>lab.vm.maximumWidth===document.querySelector('main').clientWidth&&lab.vm.maximumHeight===lab.vm.$refs.fullArea.clientHeight);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>document.querySelector('[data-tsix-tray-toggle]')?.getAttribute('aria-expanded')==='true');
  const hero=page.locator('[data-tsix-tray-tile="focused"]');const expanded=await hero.boundingBox();
  await toggle.click();await settleLayout(page);assert.equal((await state()).tray,'collapsed');
  assert.equal(await toggle.getAttribute('aria-label'),'Show other streams');
  const folded=await hero.boundingBox();assert.ok(folded.height>expanded.height,'Folding must reclaim preview space');
  const controls=page.locator('[data-tsix-view-action]');
  assert.ok(await controls.evaluateAll(nodes=>nodes.every(node=>{
   const b=node.getBoundingClientRect(),i=node.querySelector('svg').getBoundingClientRect();
   return b.width>=32&&b.height>=32&&b.bottom<=innerHeight&&i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom&&
    [[b.left+2,b.top+2],[b.right-2,b.bottom-2],[b.left+b.width/2,b.top+b.height/2]].every(([x,y])=>node.contains(document.elementFromPoint(x,y)));
  })),`Stream controls must contain their icons and have unobscured hit areas: ${JSON.stringify(await controls.evaluateAll(nodes=>nodes.map(n=>({box:n.getBoundingClientRect().toJSON(),icon:n.querySelector('svg').getBoundingClientRect().toJSON(),points:(()=>{const b=n.getBoundingClientRect();return [[b.left+2,b.top+2],[b.right-2,b.bottom-2],[b.left+b.width/2,b.top+b.height/2]].map(([x,y])=>({x,y,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,180)}))})()}))))}`);
  const menu=page.getByRole('button',{name:'Stream view settings',exact:true});
  const sourceMenu=page.locator('.ts-stream-view-settings > .tsv-button');
  const beforeClicks=Number(await sourceMenu.getAttribute('data-activations')??0);
  await menu.click({position:{x:2,y:2}});
  const menuBox=await menu.boundingBox();
  for(const key of ['Enter','Space']){
   await menu.press(key);
   assert.ok(Math.abs(Number(await sourceMenu.getAttribute('data-click-x'))-(menuBox.x+menuBox.width/2))<1,'Keyboard menu click must be anchored to the button');
   assert.ok(Math.abs(Number(await sourceMenu.getAttribute('data-click-y'))-(menuBox.y+menuBox.height/2))<1,'Keyboard menu click must be anchored to the button');
  }
  assert.equal(Number(await sourceMenu.getAttribute('data-activations')),beforeClicks+3);
  assert.equal(await sourceMenu.getAttribute('data-owner-visible'),'true','Native menus require the visible proxy as their owner, not the hidden source');
  assert.equal(await page.locator('.ts-stream-view-settings').isVisible(),false,'The native source and its edge badge must not remain visible beside the new group');
  assert.equal(await page.locator('[data-tsix-tray-tile="preview"]:not([inert])').count(),0);
  assert.ok(await page.locator('[data-tsix-tray-tile="preview"]').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).visibility==='hidden')));
  assert.ok(await page.locator('[data-tsix-tray-tile="preview"] button').evaluateAll(nodes=>nodes.every(node=>{node.focus();return document.activeElement!==node})));
  const handle=await toggle.boundingBox();assert.ok(handle.x>=folded.x+folded.width&&handle.x+handle.width<=width&&handle.y>=folded.y&&handle.y+handle.height<=height,'Preview icon stays beside the player/previews');
  assert.equal((await toggle.innerText()).trim(),'');
  assert.ok((await state()).identity);assert.equal((await state()).draft,'Draft is preserved');
  if(process.env.TSIX_SCREENSHOT_DIR&&width===1322){await mkdir(process.env.TSIX_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/tray-collapsed.png`})}
  await toggle.press('Enter');await settleLayout(page);assert.equal((await state()).tray,'expanded');
  assert.equal(await toggle.getAttribute('aria-label'),'Hide other streams');
  if(process.env.TSIX_SCREENSHOT_DIR&&width===1322)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/tray-expanded.png`});
  await toggle.press('Space');assert.equal((await state()).tray,'collapsed');
  await toggle.press('Space');assert.equal((await state()).tray,'expanded');
  checks.push(`pointer, Enter/Space, geometry, inert previews and media identity at ${width}x${height}`);
 }
 await check('collapsed and expanded preferences survive grid/refocus and helper reattachment',async()=>{
  await toggle.click();await page.evaluate(()=>lab.focus(lab.vm.allSessions[1]));
  await page.waitForFunction(()=>lab.refs.b.getAttribute('data-tsix-tray-tile')==='focused');
  assert.equal((await state()).tray,'collapsed');
  await page.evaluate(()=>lab.focus(null));await toggle.waitFor({state:'detached'});
  assert.equal(await page.locator('[inert]:not(.ts-chat-container)').count(),0);
  await page.evaluate(()=>lab.focus(lab.vm.allSessions[0]));await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
  await page.evaluate(await readFile(routes.get('/streams-runtime.js'),'utf8'));
  assert.equal((await state()).tray,'collapsed');
  await toggle.click();
  await page.evaluate(()=>lab.focus(null));await toggle.waitFor({state:'detached'});
  await page.evaluate(()=>lab.focus(lab.vm.allSessions[1]));await toggle.waitFor();assert.equal((await state()).tray,'expanded');
  await page.evaluate(()=>lab.focus(lab.vm.allSessions[0]));
  await page.waitForFunction(()=>lab.refs.a.getAttribute('data-tsix-tray-tile')==='focused');
 });
 await check('saved preference survives renderer reload without touching unrelated storage',async()=>{
  await page.evaluate(()=>localStorage.setItem('unrelated.setting','keep'));
  await toggle.click();await page.reload();await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated.setting')),'keep');
  await toggle.click();await page.reload();await toggle.waitFor();assert.equal((await state()).tray,'expanded');
 });
 await check('fullscreen temporarily restores native presentation',async()=>{
  await toggle.click();await page.locator('[data-tsix-tray-tile="focused"] .video-stream').evaluate(el=>el.requestFullscreen());
  await toggle.waitFor({state:'detached'});assert.equal((await state()).tray,null);
  await page.evaluate(()=>document.exitFullscreen());await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
 });
 await check('drag temporarily restores native presentation',async()=>{
  await page.evaluate(()=>{lab.vm.inDragStream=lab.vm.allSessions[1];window.__tsixStreams.sync()});
  await toggle.waitFor({state:'detached'});assert.equal(await page.locator('[inert]:not(.ts-chat-container)').count(),0);
  await page.evaluate(()=>{lab.vm.inDragStream=null;window.__tsixStreams.sync()});await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
 });
 if(beta5)await check('beta5 call participants and picture-in-picture retain native geometry',async()=>{
  for(const tile of [{tile:{id:'participant',payload:{kind:'participant'}}},{tile:{id:'pip',payload:{kind:'video',session:{}}},pip:{corner:'top-left'}}]) {
   await page.evaluate(tile=>{lab.extraTiles=[tile];window.__tsixStreams.sync()},tile);
   await toggle.waitFor({state:'detached'});assert.equal(await page.locator('[inert]:not(.ts-chat-container)').count(),0);
   assert.equal(await page.locator('main').getAttribute('data-tsix-stream-stage'),'multiple');
   await page.evaluate(()=>{lab.extraTiles=[];window.__tsixStreams.sync()});await toggle.waitFor();
  }
 });
 await check('theme off/on and pop-out cleanup',async()=>{
  await page.evaluate(()=>{document.querySelector('#theme').disabled=true;window.__tsixStreams.sync()});
  await toggle.waitFor({state:'detached'});assert.equal((await state()).split,-1);assert.equal(await page.locator('[inert]').count(),0);
  await page.evaluate(()=>{document.querySelector('#theme').disabled=false;window.__tsixStreams.sync()});await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
  await page.evaluate(()=>{lab.vm.isGridOpenedInPopup=true;window.__tsixStreams.sync()});await toggle.waitFor({state:'detached'});
  await page.evaluate(()=>{lab.vm.isGridOpenedInPopup=false;window.__tsixStreams.sync()});await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
 });
 await check('stream ending, resize while collapsed, and idempotent reattach/dispose',async()=>{
  await page.setViewportSize({width:1100,height:720});
  await page.evaluate(()=>lab.remove('c'));await page.waitForFunction(()=>lab.vm.layoutStreams.length===2);
  assert.equal((await state()).tray,'collapsed');
  await page.evaluate(()=>lab.remove('a'));await toggle.waitFor({state:'detached'});assert.equal(await page.locator('[inert]:not(.ts-chat-container)').count(),0);
  const runtime=await readFile(routes.get('/streams-runtime.js'),'utf8');
  await page.evaluate(runtime);await page.evaluate(runtime);assert.equal((await state()).watchers,1);
  await page.evaluate(()=>document.querySelector('main').remove());
  await page.waitForFunction(()=>lab.watchers.size===0);
  await page.evaluate(()=>window.__tsixStreams.dispose());assert.equal((await state()).watchers,0);assert.equal((await state()).split,-1);
  assert.equal(await page.locator('[data-tsix-tray-tile], [data-tsix-tray-toggle], [data-tsix-stream-tray], [inert]').count(),0);
  assert.ok((await state()).identity);
 });
 await check('incoming mute, volume drag and labels stay separate from controls in focus, grid and single views',async()=>{
  await page.goto(url+(beta5?'&':'?')+'incoming=1');await toggle.waitFor();
  const settle=async()=>{
   await page.waitForFunction(()=>lab.vm.maximumWidth===document.querySelector('main').clientWidth&&lab.vm.maximumHeight===lab.vm.$refs.fullArea.clientHeight);
   await settleLayout(page);
  };
  const inspect=async(selector,stage)=>{
   const stream=page.locator(selector), slider=stream.locator('.screen-overlay__hero-actions__action-volume-slider');
   const volumeShown=await slider.isVisible();
   assert.ok(await stream.evaluate((n,stage)=>{
    const b=n.getBoundingClientRect(),slider=n.querySelector('.ts-slider'),s=slider.getBoundingClientRect();
    const inside=r=>r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom;
    const shown=slider.getClientRects().length>0;
    if(shown&&(s.width<39||!inside(s)||getComputedStyle(slider).opacity!=='1'))return false;
    if(!shown&&(stage||b.width>220))return false;
    const controls=[...n.querySelectorAll('.screen-overlay__bottom .tsv-button'),...(shown?[slider]:[])];
    for(const node of controls){const r=node.getBoundingClientRect();if(!inside(r)||![[r.left+2,r.top+2],[r.right-2,r.bottom-2],[r.left+r.width/2,r.top+r.height/2]].every(([x,y])=>node.contains(document.elementFromPoint(x,y))))return false;}
    if(stage){
     const name=n.querySelector('.always-visible-overlay').getBoundingClientRect(),bar=n.querySelector('.screen-overlay__bottom').getBoundingClientRect();
     if(name.bottom>bar.top)return false;
     const leave=n.querySelector('.tsv-is-destructive').getBoundingClientRect(),full=n.querySelector('[aria-label="Fullscreen"]').getBoundingClientRect();
     const tools=[...document.querySelectorAll('.screenshare__global-hover-actions .tsv-button')].map(n=>n.getBoundingClientRect());
     if(full.right>leave.left||tools.some(t=>t.left<b.right&&t.right>b.left&&t.top<b.bottom&&t.bottom>b.top))return false;
    }
    return true;
   },stage),`Incoming controls must be in bounds: ${selector}, stage=${stage}, viewport=${JSON.stringify(page.viewportSize())}, ${JSON.stringify(await stream.evaluate(n=>({player:n.getBoundingClientRect().toJSON(),nodes:[...n.querySelectorAll('.ts-slider,.screen-overlay__bottom .tsv-button')].map(e=>{const r=e.getBoundingClientRect();return {box:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})})))}`);
   const before=await page.evaluate(()=>lab.focused?.uniqueIdentifier),b=await slider.boundingBox();
   if(volumeShown){
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
   for(const [fraction,value] of [[0,0],[1,100],[.5,50]]){
    const x=fraction===0?Math.floor(b.x)-1:fraction===1?Math.ceil(b.x+b.width)+1:b.x+b.width/2;
    await page.mouse.move(x,b.y+b.height/2);
    const actual=Number(await slider.getAttribute('data-volume'));
    // Integer mouse coordinates may skip a percentage on a narrow track.
    if(fraction===.5)assert.ok(Math.abs(actual-value)<=2);else assert.equal(actual,value);
    assert.ok(await stream.evaluate(n=>{const b=n.getBoundingClientRect(),r=n.querySelector('.ts-slider-knob-bubble').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom}),'Volume value bubble must not be clipped at either endpoint');
   }
   await page.mouse.up();
   }
   assert.equal(await page.evaluate(()=>lab.focused?.uniqueIdentifier),before,'Volume drag must not change stream focus');
   const mute=stream.getByRole('button',{name:'Mute stream audio',exact:true});
   await mute.press('Enter');assert.equal(await stream.getByRole('button',{name:'Unmute stream audio',exact:true}).getAttribute('data-muted'),'true');
   await stream.getByRole('button',{name:'Unmute stream audio',exact:true}).press('Space');assert.equal(await mute.getAttribute('data-muted'),'false');
   assert.ok((await state()).identity);
  };
  for(const [width,height] of [[1322,847],[900,650],[640,480]]){
   await page.setViewportSize({width,height});await settle();
   if((await state()).tray==='collapsed')await toggle.click();await settleLayout(page);
   await inspect('[data-tsix-tray-tile="focused"] .video-stream',false);
   await inspect('[data-tsix-tray-tile="preview"] .video-stream >> nth=0',false);
   await toggle.click();await settleLayout(page);await inspect('[data-tsix-tray-tile="focused"] .video-stream',true);
   await page.evaluate(()=>lab.focus(null));await toggle.waitFor({state:'detached'});await settleLayout(page);
   await inspect('.video-stream >> nth=0',false);
   await page.evaluate(()=>lab.focus(lab.vm.allSessions[0]));await toggle.waitFor();
  }
  await page.evaluate(()=>{lab.remove('c');lab.remove('b')});await toggle.waitFor({state:'detached'});
  await page.setViewportSize({width:360,height:540});await settle();
  await inspect('.video-stream',true);
  if(process.env.TSIX_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/incoming-volume.png`});
 });
 await check('Moving focus while Space is held does not activate a stream control',async()=>{
  const mute=page.getByRole('button',{name:'Mute stream audio',exact:true}).first(),menu=page.getByRole('button',{name:'Stream view settings',exact:true});
  const before=Number(await menu.getAttribute('data-activations')??0);await mute.focus();await page.keyboard.down('Space');await menu.focus();await page.keyboard.up('Space');assert.equal(Number(await menu.getAttribute('data-activations')??0),before);
 });
 await check('Showing chat preserves draft and media and persists across reattachment',async()=>{
  await page.getByRole('button',{name:'Show chat',exact:true}).click();assert.ok(await page.locator('.ts-chat-container').isVisible());assert.equal((await state()).draft,'Draft is preserved');assert.ok((await state()).identity);
  await page.evaluate(await readFile(routes.get('/streams-runtime.js'),'utf8'));assert.ok(await page.getByRole('button',{name:'Hide chat',exact:true}).isVisible());assert.ok((await state()).split<1);
 });
 await check('restricted storage degrades to an in-memory preference',async()=>{
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage unavailable')};Storage.prototype.setItem=()=>{throw new Error('Storage unavailable')}});
  await page.reload();await toggle.waitFor();assert.equal((await state()).tray,'expanded');
  await toggle.click();await page.evaluate(()=>lab.focus(null));await toggle.waitFor({state:'detached'});
  await page.evaluate(()=>lab.focus(lab.vm.allSessions[0]));await toggle.waitFor();assert.equal((await state()).tray,'collapsed');
  await page.evaluate(await readFile(routes.get('/streams-runtime.js'),'utf8'));assert.equal((await state()).tray,'collapsed');
 });
 assert.deepEqual(errors,[],'No browser console warnings or errors');
 console.log(JSON.stringify({result:'PASS',url,checks,consoleErrors:errors,scope:'Synthetic browser geometry and lifecycle; no live TS6 playback certification'},null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
