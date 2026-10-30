import assert from 'node:assert/strict';import{createServer}from'node:http';import{readFile,mkdir}from'node:fs/promises';import{pathToFileURL}from'node:url';import{settleLayout}from'./browser-settle.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./stream-tray.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]]);
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname,f=routes.get(path);if(!f){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(f))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})}),errors=[],checks=[],latencies=[];
try{
 const p=await browser.newPage({viewport:{width:1322,height:847}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 const url=`http://127.0.0.1:${server.address().port}/?model=beta5&incoming=1`;
 await p.goto(url);await p.locator('[data-tsix-tray-toggle]').waitFor();await settleLayout(p);
 const player=p.locator('.video-stream').first(),toggle=p.locator('[data-tsix-tray-toggle]');
 assert.equal(await player.getAttribute('role'),'group');assert.equal(await player.getAttribute('aria-keyshortcuts'),'Enter Space');
 // Inspect model change in the same event turn: this fails with the native
 // 150ms timer, independently of browser automation transport latency.
 for(let i=0;i<40;i++){
  const r=await p.evaluate(()=>{const vm=lab.refs.a.querySelector('.video-stream').__vue__,before=lab.focused,start=performance.now();vm.enterFocusModeAfterDelay(new KeyboardEvent('keydown',{key:'Enter'}));return{changed:lab.focused!==before,elapsed:performance.now()-start,timer:vm._dblClickTimeout||null}});
  assert.ok(r.changed);assert.equal(r.timer,null);assert.ok(r.elapsed<50);latencies.push(r.elapsed);
 }
 checks.push('40 focus/unfocus actions commit synchronously without the native click timer');
 await settleLayout(p);await player.press('Enter');assert.equal(await p.evaluate(()=>lab.focused),null);
 await player.press('Space');assert.equal(await p.evaluate(()=>lab.focused.uniqueIdentifier),'a');
 await player.focus();await p.keyboard.down('Space');await p.getByRole('button',{name:'Hide chat',exact:true}).focus();await p.keyboard.up('Space');assert.equal(await p.evaluate(()=>lab.focused.uniqueIdentifier),'a');
 checks.push('Enter/Space focus works; moving keyboard focus cancels pending Space');
 await p.evaluate(()=>{const n=lab.refs.a.querySelector('.video-stream');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:10,clientY:10}));lab.vm.inDragStream=lab.vm.allSessions[0];window.__tsixStreams.sync();n.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:80,clientY:90}));lab.vm.inDragStream=null;window.__tsixStreams.sync();n.__vue__.enterFocusModeAfterDelay(new MouseEvent('click',{detail:1}))});
 assert.equal(await p.evaluate(()=>lab.focused.uniqueIdentifier),'a');
 checks.push('Dragging a stream never turns into a delayed focus click');
 await toggle.click();await settleLayout(p);
 await p.evaluate(()=>{lab.vm.allSessions[1].isInbound=false;const old=document.createElement('style');old.id='previous-theme';old.textContent='.tsv-screenshare[data-tsix-stream-tray="collapsed"] .screen-grid > :is(.screen-video-wrapper,.screen-tile-wrapper){width:100%;height:100%;transform:none}';document.head.insertBefore(old,document.getElementById('theme'))});
 const focusedBefore=await p.evaluate(()=>lab.focused.uniqueIdentifier);
 await player.click({position:{x:160,y:120}});
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier??null),null,'A click on the collapsed focused surface returns to the grid and never focuses the hidden own stream');
 await p.evaluate(()=>lab.focus(lab.vm.allSessions[0]));await settleLayout(p);
 const surface=await p.evaluate(()=>{
  const hero=lab.refs.a.getBoundingClientRect(),hidden=lab.refs.b.getBoundingClientRect();
  const hits=[.1,.5,.9].flatMap(x=>[.1,.5,.8].map(y=>document.elementFromPoint(hero.x+hero.width*x,hero.y+hero.height*y)?.closest('[data-tsix-tray-tile]')===lab.refs.a));
  return {hiddenSmaller:hidden.width<hero.width||hidden.height<hero.height,hits,identity:lab.report().identity};
 });
 assert.ok(surface.hiddenSmaller,'Hidden previews must retain their native preview geometry');assert.ok(surface.hits.every(Boolean));assert.ok(surface.identity);
 await p.evaluate(()=>lab.refs.b.querySelector('.video-stream').__vue__.enterFocusModeAfterDelay(new MouseEvent('click',{detail:1})));
 assert.equal(await p.evaluate(()=>lab.focused.uniqueIdentifier),focusedBefore,'A stale event on an inert preview must be ignored');
 await player.dblclick({position:{x:160,y:120},delay:70});await p.waitForFunction(()=>!!document.fullscreenElement,{},{timeout:2000});
 assert.ok(await p.evaluate(()=>document.fullscreenElement===lab.refs.a.querySelector('.video-stream')));
 await p.evaluate(()=>document.exitFullscreen());await settleLayout(p);
 assert.equal(await p.evaluate(()=>lab.focused.uniqueIdentifier),focusedBefore);
 await toggle.click();await settleLayout(p);await p.evaluate(()=>{lab.vm.allSessions[1].isInbound=true;document.getElementById('previous-theme').remove()});
 checks.push('A click on collapsed focus returns to the grid without focusing hidden previews; stale preview events are ignored and double-click fullscreen stays on the watched stream');
 await p.evaluate(()=>{lab.vm.allSessions[1].isInbound=false;lab.vm.allSessions[1].captureStatus=4;lab.focus(lab.vm.allSessions[1])});await settleLayout(p);
 const own=p.locator('.video-stream').nth(1);
 await own.click({position:{x:160,y:120}});
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier??null),null,'Clicking the focused stream returns to the grid, like the native client and Enter');
 await p.evaluate(()=>lab.focus(lab.vm.allSessions[1]));await settleLayout(p);
 // A control can appear under the pointer between clicks (for example on hover).
 await p.evaluate(()=>{const n=document.createElement('button');n.id='appearing-control';n.textContent='Pause';n.style.cssText='position:absolute;left:148px;top:108px;width:24px;height:24px;z-index:100';n.onclick=e=>{e.stopPropagation();window.controlClicks=(window.controlClicks||0)+1};lab.refs.b.querySelector('.video-stream').append(n)});
 const controlBox=await p.locator('#appearing-control').boundingBox();await p.mouse.move(controlBox.x+12,controlBox.y+12);await p.mouse.down({clickCount:2});await p.mouse.up({clickCount:2});
 assert.equal(await p.evaluate(()=>window.controlClicks),1,'The focus gesture must not consume a stream control click');
 assert.equal(await p.evaluate(()=>!!document.fullscreenElement),false);
 await p.evaluate(()=>document.getElementById('appearing-control').remove());
 await own.dblclick({position:{x:60,y:60},delay:70});await p.waitForFunction(()=>!!document.fullscreenElement);
 assert.ok(await p.evaluate(()=>document.fullscreenElement===lab.refs.b.querySelector('.video-stream')));
 await p.evaluate(()=>document.exitFullscreen());await settleLayout(p);
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'b');
 await p.evaluate(()=>{lab.vm.allSessions[1].isInbound=true;lab.focus(lab.vm.allSessions[0])});await settleLayout(p);
 checks.push('A focused own stream returns to the grid on click; controls remain clickable and double-click fullscreen returns to the same focused stream');
 // beta5's player fullscreen button calls toggleFullscreen with its own click event.
 await p.evaluate(()=>{const n=lab.refs.a.querySelector('.video-stream'),b=document.createElement('div');b.className='tsv-button';b.id='native-fullscreen';b.setAttribute('aria-label','Fixture fullscreen');b.style.cssText='position:absolute;right:4px;bottom:4px;width:28px;height:28px;z-index:100;background:#345';b.addEventListener('click',e=>{e.stopPropagation();e.preventDefault();n.__vue__.toggleFullscreen(e)});n.append(b)});
 await p.locator('#native-fullscreen').click();await p.waitForFunction(()=>!!document.fullscreenElement,{},{timeout:2000});
 assert.ok(await p.evaluate(()=>document.fullscreenElement===lab.refs.a.querySelector('.video-stream')));
 await p.evaluate(()=>document.exitFullscreen());await settleLayout(p);
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a','A fullscreen button must not change the focused stream');
 await p.evaluate(()=>document.getElementById('native-fullscreen').remove());
 checks.push('The player fullscreen button passes its click event through and enters fullscreen');
 for(const [id,fromFocus,delay]of [['a',false,0],['a',false,90],['b',true,90],['c',false,40]]){
  await p.evaluate(fromFocus=>lab.focus(fromFocus?lab.vm.allSessions[0]:null),fromFocus);await settleLayout(p);
  const target=p.locator('.video-stream').nth(['a','b','c'].indexOf(id));
  await target.dblclick({position:{x:20,y:15},delay});await p.waitForFunction(()=>!!document.fullscreenElement,{},{timeout:2000});
  assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier??null),fromFocus?'a':null,'Double-click fullscreen keeps the pre-click layout');
  assert.ok(await p.evaluate(id=>document.fullscreenElement===lab.refs[id].querySelector('.video-stream'),id));
  await p.evaluate(()=>document.exitFullscreen());await settleLayout(p);
 }
 checks.push('Four double-click timings/targets enter the intended stream and preserve grid/focus return state');
 await p.evaluate(()=>lab.focus(null));await settleLayout(p);
 const spot=await p.locator('.video-stream').nth(2).boundingBox();
 await p.mouse.click(spot.x+20,spot.y+15);await p.mouse.click(spot.x+20,spot.y+15);await settleLayout(p);
 assert.equal(await p.evaluate(()=>!!document.fullscreenElement),false,'Two separate single clicks must not enter fullscreen');
 checks.push('Two quick separate single clicks change focus but never enter fullscreen');
 await p.evaluate(()=>lab.focus(lab.vm.allSessions[0]));await toggle.waitFor();
 for(const [width,height]of [[1322,847],[900,650],[640,480],[360,540]]){
  await p.setViewportSize({width,height});await settleLayout(p);
  for(let i=0;i<4;i++){
   await toggle.click();await settleLayout(p);
   const r=await toggle.evaluate(n=>{const b=n.getBoundingClientRect(),host=n.parentElement;return{w:b.width,h:b.height,hit:n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),right:b.right,bottom:b.bottom,inRail:host.classList.contains('screenshare__global-hover-actions-wrapper'),text:n.textContent}});
   assert.ok(r.inRail&&r.hit);assert.equal(r.text,'');assert.ok(r.w>=24&&r.h>=24&&r.right<=width&&r.bottom<=height);
  }
 }
 checks.push('Icon remains beside previews, visible and hit-testable through 16 toggles at four sizes');
 await p.setViewportSize({width:1322,height:847});await settleLayout(p);
 const writes=await p.evaluate(()=>new Promise(resolve=>{let count=0;const observer=new MutationObserver(entries=>count+=entries.length);observer.observe(document.querySelector('main'),{attributes:true,subtree:true,childList:true});for(let i=0;i<50;i++)window.__tsixStreams.sync();queueMicrotask(()=>{observer.disconnect();resolve(count)})}));
 assert.ok(writes<10,`No-op reconciliation caused ${writes} DOM mutations`);
 checks.push('50 unchanged reconciliations avoid attribute/DOM churn');
 // A connected-but-paused stream keeps its stage and focus controls. An
 // unopened stream remains compact; these states must not be conflated.
 await p.evaluate(()=>{const node=lab.refs.a.querySelector('.video-stream');node.__vue__.session.status=4;window.savedVideo=node.querySelector('video');savedVideo.remove();window.__tsixStreams.sync()});
 assert.equal(await p.locator('main').getAttribute('data-tsix-stream-stage'),'multiple');assert.equal(await toggle.count(),1);
 await p.evaluate(()=>{lab.refs.a.querySelector('.video-stream').prepend(savedVideo);window.__tsixStreams.sync()});await settleLayout(p);
 checks.push('Paused/loading connected streams retain focus instead of becoming unopened previews');
 await p.emulateMedia({reducedMotion:'reduce'});assert.ok(await p.locator('.screen-tile-wrapper').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)===0))));
 await p.emulateMedia({reducedMotion:'no-preference'});
 checks.push('Reduced-motion mode disables tile geometry animation');
 if(process.env.TSIX_SCREENSHOT_DIR){await mkdir(process.env.TSIX_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/polished-streams.png`})}
 const js=await readFile(routes.get('/streams-runtime.js'),'utf8');
 for(let i=0;i<10;i++){await p.evaluate(()=>window.__tsixStreams.dispose());assert.equal(await p.locator('.video-stream[aria-keyshortcuts],[data-tsix-tray-toggle]').count(),0);await p.evaluate(js)}
 await settleLayout(p);assert.ok(await p.evaluate(()=>lab.report().identity));assert.equal(await toggle.count(),1);
 checks.push('10 detach/reattach cycles restore native handlers and keep media identity without duplicate controls');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,focusHandlerMs:{max:Math.max(...latencies),mean:latencies.reduce((a,b)=>a+b,0)/latencies.length},idleMutations:writes,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
