// Browser-only state/lifecycle coverage. No live broadcasting or native APIs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const files=new Map([['/',new URL('./broadcast.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]]);
const runtime=await readFile(files.get('/streams-runtime.js'),'utf8');
const server=createServer(async(req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const errors=[],checks=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1322,height:847}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 const url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__tsixStreams);assert.equal(page.url(),url);assert.equal(await page.title(),'TS6 broadcast fixture');
 const bar=page.locator('[data-tsix-broadcast-bar]'),toggle=page.locator('[data-tsix-viewer-toggle]'),list=page.locator('[data-tsix-viewer-list]');
 const check=async(name,fn)=>{await fn();checks.push(name)};
 const shell=()=>page.evaluate(()=>[...document.querySelectorAll('.tsv-activity,.sidebar-pane-layout,.main-pane-layout,.fixtureStage,.ts-tree,.ts-server-status-bar,.fixtureFooter,.ts-chat-input-container')].map(e=>{
  const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
 }));
 const idleShell=await shell();
 await check('idle has no live indicator',async()=>assert.equal(await bar.count(),0));
 await check('hidden own stream shows real viewers without changing sessions',async()=>{
  await page.evaluate(()=>lab.start());await bar.waitFor();assert.equal(await bar.getAttribute('data-state'),'live');
  assert.match(await toggle.getAttribute('aria-label'),/Alex Viewer, Sam Friend/);assert.equal(await page.locator('[data-tsix-viewer-icons] [data-tsix-viewer-icon]').count(),2);
  assert.deepEqual(await page.evaluate(()=>lab.report()),{actions:0,watchers:1,sameVideo:true,sameMedia:true,hidden:true,showOwn:false});
  assert.deepEqual(await shell(),idleShell,'Starting sharing must not resize or move native content');
 });
 await check('viewer list supports keyboard, Friends overlay, Escape and outside dismissal',async()=>{
  await toggle.focus();await toggle.press('Enter');await list.waitFor({state:'visible'});assert.match(await list.innerText(),/Sam Friend/);
  await page.evaluate(()=>document.querySelector('.fixtureFriends').hidden=false);
  assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));
  await page.evaluate(()=>document.querySelector('.fixtureFriends').hidden=true);
  await page.keyboard.press('Escape');await list.waitFor({state:'hidden'});assert.ok(await toggle.evaluate(e=>e===document.activeElement));
  await toggle.click();await page.locator('.fixtureStage p').click();await list.waitFor({state:'hidden'});
 });
 await check('join, leave, rename, overflow and zero viewers update reactively',async()=>{
  await page.evaluate(()=>lab.viewers([1,2,3,4,5,6]));await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-count]').textContent==='6 watching');
  await toggle.click();assert.equal(await list.locator('li').count(),6);assert.equal(await list.locator('[data-tsix-viewer-icon]').count(),6);await page.keyboard.press('Escape');
  await page.evaluate(()=>{lab.clients.get(1).displayName='A <script> Name';lab.tick()});await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-toggle]').getAttribute('aria-label').includes('A <script> Name'));
  assert.equal(await bar.locator('script').count(),0);await page.evaluate(()=>lab.viewers([]));await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-count]').textContent==='0 watching');
  await toggle.click();assert.match(await list.innerText(),/Nobody is watching yet/);await page.keyboard.press('Escape');
 });
 await check('paused remains visible; multiple streams deduplicate viewers',async()=>{
  await page.evaluate(()=>{lab.viewers([1,2]);lab.pause(true)});await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='paused');
  assert.deepEqual(await shell(),idleShell,'Pausing must not shift the layout');
  await page.evaluate(()=>lab.add([2,3]));await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='live');
  assert.equal(await page.locator('[data-tsix-viewer-count]').innerText(),'3 watching');assert.match(await page.locator('[data-tsix-broadcast-state]').innerText(),/LIVE · 2/);
 });
 await check('middle-column badge stays above Start Stream and preserves shell geometry at every size',async()=>{
  for(const [width,height,column] of [[1322,847,320],[820,600,320],[640,480,320]]){
   // This fixture has no workspace ResizeObserver. Pin both the native column
   // and navigator width to exercise the minimum supported width deliberately.
   await page.setViewportSize({width,height});await page.evaluate(column=>{lab.root.style.setProperty('--tsix-navigator-width',`${column}px`);const pane=document.querySelector('.main-pane-layout');pane.style.width=`${column}px`;pane.style.minWidth=`${column}px`},column);
   await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});const before=await shell();
   await page.evaluate(()=>lab.start([1,2,3,4,5,6]));await bar.waitFor();assert.deepEqual(await shell(),before);
   assert.ok(await bar.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('button'),br=b.getBoundingClientRect(),pane=document.querySelector('.main-pane-layout'),pr=pane.getBoundingClientRect(),footer=pane.querySelector('.ts-server-status-bar').getBoundingClientRect(),start=document.querySelector('#startStream').getBoundingClientRect();return e.parentElement===pane&&r.width<=260&&r.height===32&&r.left===pr.left+12&&r.right<=pr.right-12&&r.left<=start.left+1&&r.right>=start.left&&r.bottom===footer.top-8&&br.left>=r.left&&br.right<=r.right&&b.contains(document.elementFromPoint(br.x+br.width/2,br.y+br.height/2))}));
   await toggle.click();assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect(),pane=document.querySelector('.main-pane-layout').getBoundingClientRect();return r.x>=pane.x&&r.y>=0&&r.right<=pane.right&&r.bottom<=document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect().top}));await page.keyboard.press('Escape');
   await page.evaluate(()=>lab.pause(true));await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='paused');assert.deepEqual(await shell(),before);
   assert.ok((await bar.boundingBox()).width<=260);await page.evaluate(()=>lab.pause(false));
  }
  await page.locator('#nativeShare').click();assert.equal(await page.evaluate(()=>lab.state.actions),1);
  assert.equal(await page.locator('#nativeShare').getAttribute('aria-label'),'Pause screen sharing');
  await page.locator('#nativeShare').press('Enter');await page.locator('#nativeShare').press('Space');
  assert.equal(await page.evaluate(()=>lab.state.actions),3,'Keyboard uses the existing native action');
  await page.evaluate(()=>lab.pause(true));await page.waitForFunction(()=>lab.native.getAttribute('aria-label')==='Resume screen sharing');
  await page.evaluate(()=>lab.pause(false));
 });
 await check('pane resizing and sidebar movement keep the badge above the footer and out of chat',async()=>{
  await page.setViewportSize({width:640,height:600});await page.evaluate(()=>{lab.root.removeAttribute('data-tsix-navigator-view');__tsixStreams.sync()});
  const position=await bar.boundingBox();
  await page.locator('[aria-label="Chat draft"]').fill('Draft stays usable while sharing');
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').style.height='156px');
  assert.deepEqual(await bar.boundingBox(),position);
  await page.locator('#send').click();assert.equal(await page.locator('[aria-label="Chat draft"]').inputValue(),'Draft stays usable while sharing');
  await toggle.click();assert.ok(await list.evaluate(e=>e.getBoundingClientRect().top>=0));await page.keyboard.press('Escape');
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').hidden=true);
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').hidden=false);
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>{const input=document.querySelector('.ts-chat-input-container'),replacement=input.cloneNode(true);replacement.hidden=false;replacement.style.height='64px';input.replaceWith(replacement)});
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>{const pane=document.querySelector('.main-pane-layout');pane.style.width='220px';pane.style.minWidth='220px';document.querySelector('.sidebar-pane-layout').style.width='40px';document.querySelector('.ts-server-status-bar').style.height='80px'});
  await page.waitForFunction(()=>{const r=document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect(),p=document.querySelector('.main-pane-layout').getBoundingClientRect(),f=document.querySelector('.ts-server-status-bar').getBoundingClientRect();return r.left===p.left+12&&r.right<=p.right-12&&r.bottom===f.top-8});
  await toggle.click();assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.main-pane-layout').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right}));await page.keyboard.press('Escape');
  await page.locator('#startStream').click();
  if(process.env.TSIX_SCREENSHOT_DIR){
   await page.setViewportSize({width:1322,height:847});await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect().bottom===document.querySelector('.ts-server-status-bar').getBoundingClientRect().top-8);
   const capture=await page.context().newCDPSession(page);
   for(const name of ['broadcast-column','broadcast-viewers']){
    if(name==='broadcast-viewers')await toggle.click();
    const shot=await capture.send('Page.captureScreenshot',{format:'png'});await writeFile(`${process.env.TSIX_SCREENSHOT_DIR}/${name}.png`,Buffer.from(shot.data,'base64'));
   }
   await capture.detach();await page.keyboard.press('Escape');
  }
 });
 await check('fullscreen keeps warning and viewer list within the fullscreen element',async()=>{
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').hasAttribute('data-fullscreen'));
  assert.ok(await bar.evaluate(e=>{const r=e.getBoundingClientRect();return document.fullscreenElement.contains(e)&&r.top===12&&r.right===innerWidth-12&&r.width<=260}));await toggle.click();await list.waitFor({state:'visible'});
  assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight}));
  await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.querySelector('[data-tsix-broadcast-bar]').hasAttribute('data-fullscreen'));
 });
 await check('theme disable, reattach and stop restore owned DOM and watchers',async()=>{
  await page.addStyleTag({content:':root{--tsix-broadcast-api:0!important}',id:'unused'}).then(e=>e.evaluate(n=>n.id='disable-test'));
  await bar.waitFor({state:'detached'});assert.equal(await page.locator('[data-tsix-broadcast-control]').count(),0);assert.equal(await page.evaluate(()=>lab.watchers.size),0);
  assert.equal(await page.locator('#nativeShare').getAttribute('role'),null);assert.equal(await page.locator('#nativeShare').getAttribute('title'),'Native sharing control');
  await page.evaluate(()=>document.getElementById('disable-test').remove());await bar.waitFor();await page.evaluate(runtime);await page.evaluate(runtime);
  assert.equal(await bar.count(),1);assert.equal(await page.evaluate(()=>lab.watchers.size),1);
  await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});assert.equal(await page.locator('[data-tsix-broadcast]').count(),0);
  const afterStop=await shell();await page.evaluate(()=>lab.start());await bar.waitFor();assert.deepEqual(await shell(),afterStop);await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});assert.deepEqual(await shell(),afterStop);
  await page.evaluate(()=>window.__tsixStreams.dispose());assert.equal(await page.evaluate(()=>lab.watchers.size),0);
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Synthetic state, geometry and lifecycle; native streaming is checked separately'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
