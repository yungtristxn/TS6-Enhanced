// Native layout acceptance. No channel changes, messages or audio actions.
// --preview-case temporarily hides other stream cards to exercise one unopened
// preview; it restores their visibility and any volume changed by remounting.
import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{connect}from'../tools/cdp.mjs';
const c=await connect(),reports=[],out=process.env.TSIX_SCREENSHOT_DIR;let saved=false;
const settle=async()=>{await new Promise(r=>setTimeout(r,180));await c.evaluate('window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync()');await new Promise(r=>setTimeout(r,60))};
const capture=async name=>{if(!out)return;await mkdir(out,{recursive:true});const r=await c.send('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'))};
const metrics=()=>c.evaluate(`(()=>{const q=window.__tsixLayoutQA,root=document.querySelector('.tsv-window');const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}};const viewer=[...document.querySelectorAll('.tsv-screenshare')].find(e=>e.__vue__?.$refs.fullArea);return{viewport:[innerWidth,innerHeight],scale:root.__vue__.windowLayout.windowScale,nativeSidebar:getComputedStyle(root.querySelector('.sidebar-pane-layout')).position,nativeToolbar:getComputedStyle(root.querySelector('.tsv-central-toolbar')).position,customNavigation:root.querySelectorAll('[data-tsix-navigator],[data-tsix-navigation-toggle]').length,chat:box(document.querySelector('.ts-chat-container')),input:box(document.querySelector('.ts-chat-input-container')),preview:box(document.querySelector('.stream-preview')),stage:viewer?.dataset.tsixStreamStage,split:viewer?.__vue__.overrideSplitPercentage,rows:[...new Set([...root.querySelectorAll('.ts-server-tree-wrapper .ts-server-tree-item-leaf')].map(e=>e.getBoundingClientRect().height))],buttons:[...document.querySelectorAll('[data-tsix-chat-toggle],.screenshare__global-hover-actions .tsv-button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible').map(e=>({label:e.getAttribute('aria-label'),...box(e)})),sameMedia:q.media.every(({e,source,paused})=>e.isConnected&&e.srcObject===source&&e.paused===paused),errors:q.errors}})()`);
function verify(r,{media=true,chat=true}={}){assert.equal(r.customNavigation,0);assert.notEqual(r.nativeSidebar,'absolute');assert.notEqual(r.nativeToolbar,'fixed');if(chat&&r.chat){assert.ok(r.chat.h>=100);assert.ok(r.input.hit);assert.ok(r.input.bottom<=r.viewport[1]+1)}for(const b of r.buttons){assert.ok(b.hit,`Covered ${b.label}`);assert.ok(b.w>=24&&b.h>=24);assert.ok(b.right<=r.viewport[0]+1&&b.bottom<=r.viewport[1]+1)}if(media)assert.ok(r.sameMedia);assert.deepEqual(r.errors,[])}
try{
 await c.evaluate(`(()=>{const root=document.querySelector('.tsv-window'),l=root.__vue__.windowLayout,viewer=[...document.querySelectorAll('.tsv-screenshare')].find(e=>e.__vue__?.$refs.fullArea);if(document.fullscreenElement)throw Error('Exit fullscreen before layout QA');window.__tsixLayoutQA={scale:l.windowScale,sizes:l.windowSlots.map(s=>s.size),pre:l.windowSlots[0].preCollapseSize,chat:window.__tsixStreams.status().chatVisible,focus:document.activeElement,viewer:viewer?.__vue__,media:[...document.querySelectorAll('video')].map(e=>({e,source:e.srcObject,paused:e.paused})),sessions:(viewer?.__vue__.sortableStreamsContainer.sortedStreams||[]).map(s=>({s,hidden:s.hidden,volume:s.volume,muted:s.muted})),errors:[]};const q=window.__tsixLayoutQA;q.listener=e=>q.errors.push(e.message||e.reason?.message||e.type);addEventListener('error',q.listener);addEventListener('unhandledrejection',q.listener);const toggle=document.querySelector('[data-tsix-chat-toggle]');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click()})()`);saved=true;
 for(const [scale,row]of [[0,28],[1,30],[2,34]]){
  await c.evaluate(`document.querySelector('.tsv-window').__vue__.windowLayout.windowScale=${scale}`);
  for(const [width,height]of [[1322,847],[900,650],[640,480]]){
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();const r=await metrics();verify(r);assert.ok(r.rows.every(h=>h===row));reports.push({case:'native sizing',...r});
   if(scale===1)await capture(`native-layout-${width}`);
  }
 }
 if(process.argv.includes('--preview-case')){
  const available=await c.evaluate(`(()=>{const q=window.__tsixLayoutQA,s=q.sessions.find(({s})=>s.isInbound&&s.isJoinable&&s.status===0&&!s.hidden)?.s;if(!s)return false;for(const {s:other}of q.sessions)other.hidden=other!==s;return true})()`);
  if(!available)throw Error('No unopened current-view stream for --preview-case');
  for(const [width,height]of [[1322,847],[900,650],[640,480]]){
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();const r=await metrics();verify(r,{media:false});assert.equal(r.stage,'preview');assert.ok(r.preview.h>0);assert.ok(r.preview.bottom<=r.chat.y+2);reports.push({case:'single unopened preview',...r});await capture(`single-unopened-live-${width}`);
  }
 }
 if(out)await writeFile(`${out}/layout-live.json`,JSON.stringify(reports,null,2));
}finally{
 if(saved){
  await c.send('Emulation.clearDeviceMetricsOverride');
  await c.evaluate(`(()=>{const q=window.__tsixLayoutQA,l=document.querySelector('.tsv-window').__vue__.windowLayout;l.windowScale=q.scale;q.sizes.forEach((n,i)=>{l.windowSlots[i].size=n;l.windowSlots[i].change=0});if(q.pre===undefined)delete l.windowSlots[0].preCollapseSize;else l.windowSlots[0].preCollapseSize=q.pre;l.resizeSlotStarted();l.resizeSlotEnded();for(const {s,hidden}of q.sessions)if(s.hidden!==hidden)s.hidden=hidden;const b=document.querySelector('[data-tsix-chat-toggle]');if(b&&(b.getAttribute('aria-expanded')==='true')!==q.chat)b.click()})()`);
  await settle();
  await c.evaluate(`(()=>{const q=window.__tsixLayoutQA;for(const {s,volume,muted}of q.sessions){const e=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===s),i=e?.querySelector('[data-tsix-volume-control] input');if(i&&s.volume!==volume){const v=e.__vue__;if(!v.videoRef.srcObject?.getAudioTracks().length){s.volume=volume;v.internalVolume=Math.min(100,volume*100);v.videoRef.volume=muted?0:Math.min(1,volume)}else{i.value=String(volume*100);i.dispatchEvent(new Event('input',{bubbles:true}));s.muted=muted}}}q.focus?.focus?.();removeEventListener('error',q.listener);removeEventListener('unhandledrejection',q.listener);delete window.__tsixLayoutQA})()`);
 }
 c.close();
}
console.log(JSON.stringify({result:'PASS',checks:reports.length,cases:reports.map(r=>({case:r.case,viewport:r.viewport,scale:r.scale,chatHeight:r.chat?.h,stage:r.stage})),errors:[]},null,2));
