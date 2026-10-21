// Explicit live check: requires an already-running outbound stream. Never
// starts/stops/pauses sharing, changes audio, or changes preview preferences.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {connect} from '../tools/cdp.mjs';
const c=await connect(), checks=[];
const currentOnly=process.argv.includes('--current-size');
const settle=async()=>{
 if(await c.evaluate("document.visibilityState==='hidden'"))await c.send('Page.captureScreenshot',{format:'png'});
 await c.evaluate('new Promise(r=>setTimeout(r,200))');
};
let ready=false;
try{
 await c.evaluate(`(async()=>{const build=await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));if(build!==1791901251||document.fullscreenElement)throw Error('Requires supported main renderer outside fullscreen');const toolbar=document.querySelector('.tsv-central-toolbar').__vue__,options=toolbar.screenshareButton.contextMenuData.component.options,computed=options.computed.allSessions,getter=typeof computed==='function'?computed:computed.get,sessions=getter.call({data:null});if(!sessions.length)throw Error('Start sharing yourself before running this check');const root=document.querySelector('.tsv-window'),tree=document.querySelector('.ts-server-tree-scroller');window.__tsixBroadcastTest={getter,sessions:sessions.map(s=>({session:s,hidden:s.hidden,paused:s.paused})),showOwn:document.querySelector('.tsv-screenshare')?.__vue__.showOwnStreams,focus:document.activeElement,sizes:root.__vue__.windowLayout.windowSlots.map(s=>s.size),scroll:tree?.__vue__.getScrollTop(),errors:[]};window.__tsixBroadcastTest.onError=e=>window.__tsixBroadcastTest.errors.push(e.type);window.addEventListener('error',window.__tsixBroadcastTest.onError)})()`);ready=true;
 const inspect=async()=>{
  const r=await c.evaluate(`(()=>{const saved=window.__tsixBroadcastTest,root=document.querySelector('.tsv-window'),bar=document.querySelector('[data-tsix-broadcast-bar]'),toggle=bar?.querySelector('button'),native=document.querySelector('[data-tsix-broadcast-control]'),sessions=saved.getter.call({data:null}),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}};return {viewport:[innerWidth,innerHeight],mode:root.getAttribute('data-tsix-navigator-view'),bar:bar&&rect(bar),toggle:toggle&&rect(toggle),native:native&&rect(native),sameSessions:saved.sessions.every(b=>sessions.includes(b.session)&&b.session.hidden===b.hidden&&b.session.paused===b.paused),samePreview:saved.showOwn===document.querySelector('.tsv-screenshare')?.__vue__.showOwnStreams,actualViewers:new Set(sessions.flatMap(s=>s.viewers.map(v=>v.scHandlerId+':'+v.clientId))).size,displayedViewers:bar?.querySelector('[data-tsix-viewer-count]').textContent,errors:saved.errors}})()`);
  assert.ok(r.bar&&r.toggle.hit&&r.bar.x>=0&&r.bar.right<=r.viewport[0]&&r.bar.y>=0&&r.bar.bottom<=r.viewport[1]);
  assert.ok(r.bar.width<=260&&r.bar.height===32,'Sharing status stays compact');
  assert.ok(await c.evaluate(`(()=>{const e=document.querySelector('[data-tsix-broadcast-bar]'),r=e.getBoundingClientRect(),pane=document.querySelector('.main-pane-layout'),p=pane.getBoundingClientRect(),f=pane.querySelector('.ts-server-status-bar').getBoundingClientRect();return e.parentElement===pane&&r.left===p.left+8&&r.right<=p.right-8&&Math.abs(r.bottom-(f.top-8))<1})()`),'Badge stays in the middle column above Start Stream');
  assert.ok(r.native?.hit&&(r.native.bottom<=r.bar.y||r.native.right<=r.bar.x),'Native sharing control stays operable and separate');
  assert.ok(await c.evaluate(`(()=>{const bar=document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect();return [...document.querySelectorAll('.ts-chat-input-container')].every(e=>{const r=e.getBoundingClientRect();return !r.width||!r.height||r.right<=bar.x||r.x>=bar.right||bar.bottom<=r.y-8})})()`),'Badge clears the message composer');
  assert.ok(r.sameSessions&&r.samePreview);assert.equal(r.displayedViewers,`${r.actualViewers} watching`);assert.deepEqual(r.errors,[]);return r;
 };
 for(const [width,height] of currentOnly?[]:[[1672,941],[820,600],[640,600]]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();await inspect();checks.push(`${width}x${height}: visible, hit-testable and native state retained`);
 }
 if(!currentOnly)await c.send('Emulation.clearDeviceMetricsOverride');await settle();
 await inspect();checks.push('Current window: middle-column badge clears the video/chat workspace');
 {
  await c.evaluate(`document.querySelector('[data-tsix-viewer-toggle]').click()`);await settle();
  assert.ok(await c.evaluate(`(()=>{const e=document.querySelector('[data-tsix-viewer-list]'),r=e.getBoundingClientRect();return !e.hidden&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`));
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.ok(await c.evaluate("document.querySelector('[data-tsix-viewer-list]').hidden"));checks.push('Viewer list is visible and Escape closes it');
 }
 if(!currentOnly){
 await c.evaluate('window.__tsixStreams.dispose()');assert.equal(await c.evaluate("document.querySelectorAll('[data-tsix-broadcast-bar],[data-tsix-broadcast-control]').length"),0);
 const runtime=await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8');await c.evaluate(runtime);await c.evaluate(runtime);await settle();
 assert.equal(await c.evaluate("document.querySelectorAll('[data-tsix-broadcast-bar]').length"),1);await inspect();checks.push('cleanup and repeated attachment preserve native sessions and preview preference');
 }
 if(process.env.TSIX_SCREENSHOT_DIR){
  await c.evaluate("document.querySelector('[data-tsix-viewer-toggle]').click()");await settle();
  const clip=await c.evaluate('(()=>{const r=document.querySelector(".main-pane-layout").getBoundingClientRect();return {x:r.x,y:Math.max(0,r.bottom-460),width:r.width,height:Math.min(r.height,460),scale:1}})()'),shot=await c.send('Page.captureScreenshot',{format:'png',clip});
  await writeFile(`${process.env.TSIX_SCREENSHOT_DIR}/live-viewers-installed.png`,Buffer.from(shot.data,'base64'));
 }
 console.log(JSON.stringify({result:'PASS',checks,scope:'Existing outgoing server stream; no media or audio actions invoked'},null,2));
}finally{
 if(!currentOnly)await c.send('Emulation.clearDeviceMetricsOverride');
 if(ready){
  if(!await c.evaluate('!!window.__tsixStreams'))await c.evaluate(await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8'));
  await c.evaluate(`(()=>{const saved=window.__tsixBroadcastTest,toggle=document.querySelector('[data-tsix-viewer-toggle]');if(toggle?.getAttribute('aria-expanded')==='true')toggle.click();if(!${currentOnly}){const l=document.querySelector('.tsv-window').__vue__.windowLayout;l.windowSlots.forEach((s,i)=>{s.size=saved.sizes[i];s.change=0});l.resizeSlotStarted();l.resizeSlotEnded();document.querySelector('.ts-server-tree-scroller')?.__vue__.setScrollTop(saved.scroll||0)}saved.focus?.focus();window.removeEventListener('error',saved.onError);delete window.__tsixBroadcastTest})()`);
 }
 c.close();
}
