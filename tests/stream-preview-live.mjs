// Compare unopened and playing states of the same native incoming stream.
// Opens it once, then restores the original viewing, audio and layout state.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {connect} from '../tools/cdp.mjs';
if(!process.argv.includes('--exercise-preview'))throw Error('Pass --exercise-preview to allow temporary incoming playback changes');
const c=await connect(),cases=[[2562,1394],[1322,847],[900,650],[640,480]],reports=[],closed=new Map(),out=process.env.TSIX_SCREENSHOT_DIR;
const delay=ms=>new Promise(r=>setTimeout(r,ms));let saved=false;
async function waitFor(expression){for(let i=0;i<60;i++){if(await c.evaluate(expression))return;await delay(100)}throw Error('Preview/player did not settle')}
async function layout(width,height,chat){await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await c.evaluate(`(()=>{const b=document.querySelector('[data-tsix-chat-toggle]');if((b.getAttribute('aria-expanded')==='true')!==${chat})b.click()})()`);await delay(300)}
const metrics=()=>c.evaluate(`(()=>{const q=window.__tsixPreviewLive,p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.s),box=e=>{if(!e)return null;const b=e.getBoundingClientRect(),i=e.querySelector('svg')?.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),corners:[[b.x+2,b.y+2],[b.right-2,b.bottom-2]].every(([x,y])=>e.contains(document.elementFromPoint(x,y))),iconInside:!i||(i.left>=b.left&&i.right<=b.right&&i.top>=b.top&&i.bottom<=b.bottom)}};return{stage:q.viewer.$el.dataset.tsixStreamStage,layout:q.viewer.$el.dataset.tsixStreamLayout,player:box(p),picture:box(p.querySelector('video,.stream-preview')),join:box(p.querySelector('[data-tsix-preview-join]')),bar:box(p.querySelector('.screen-overlay__bottom,[data-tsix-stream-footer]')),area:box(q.viewer.$refs.fullArea),chat:box(document.querySelector('.ts-chat-container')),composer:box(document.querySelector('.ts-chat-input-container')),actions:[...p.querySelectorAll('[data-tsix-view-action],.screen-overlay__bottom .tsv-button')].map(e=>({...box(e),icon:e.querySelector('svg')?.getAttribute('name')})),draftPreserved:q.draft===q.chatVM?.$refs.chatInput?.chatInputFieldComponent?.internalText,mediaPreserved:!q.video||(p.querySelector('video')===q.video&&q.video.srcObject===q.source),errors:q.errors.slice()}})()`);
function verify(r,height,chat){
 assert.deepEqual(r.errors,[]);assert.ok(r.draftPreserved&&r.mediaPreserved);assert.equal(r.layout,'single');assert.ok(r.player.w>=r.area.w-100);
 assert.equal(r.actions.filter(b=>b.icon==='dots').length,1);assert.equal(r.actions.filter(b=>b.icon==='expand').length,1);
 for(const b of r.actions){assert.ok(b.hit&&b.corners&&b.iconInside&&b.w>=24&&b.h>=24,JSON.stringify(r));assert.ok(b.x>=r.player.x&&b.right<=r.player.right&&b.y>=r.bar.y&&b.bottom<=r.bar.bottom)}
 assert.ok(r.picture.bottom<=r.bar.y+1);assert.ok(r.bar.bottom<=r.player.bottom&&r.player.bottom-r.bar.bottom<=3);
 if(chat){assert.ok(r.player.bottom<=r.chat.y+2);assert.ok(r.composer.hit&&r.composer.bottom<=height+1)}else assert.ok(r.chat.h>0&&!r.chat.hit,'Hidden chat stays measurable without intercepting the stream');
}
async function screenshot(name){if(!out)return;await mkdir(out,{recursive:true});const shot=await c.send('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(shot.data,'base64'))}
try{
 await c.evaluate(`(()=>{const viewer=[...document.querySelectorAll('.tsv-screenshare')].find(e=>e.__vue__?.$refs.fullArea)?.__vue__,p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session?.isInbound)?.__vue__;if(document.hidden||document.fullscreenElement||!viewer||!p||viewer.sortableStreamsContainer.sortedStreams.filter(s=>viewer.isStreamVisible(s)).length!==1)throw Error('Requires a visible main view with one incoming stream');const layout=document.querySelector('.tsv-window').__vue__.windowLayout,chat=document.querySelector('.ts-chat-container')?.__vue__;const q=window.__tsixPreviewLive={viewer,s:p.session,joined:p.session.status===4,gain:p.session.volume,muted:p.session.muted,mode:viewer.item.layoutMode,chat:window.__tsixStreams.status().chatVisible,sizes:layout.windowSlots.map(s=>s.size),pre:layout.windowSlots[0].preCollapseSize,chatVM:chat,draft:chat?.$refs.chatInput?.chatInputFieldComponent?.internalText,errors:[]};q.listener=e=>q.errors.push(e.message||e.reason?.message||e.type);addEventListener('error',q.listener);addEventListener('unhandledrejection',q.listener);if(q.joined)p.onLeave()})()`);saved=true;
 await waitFor(`document.querySelector('[data-tsix-preview-join]')`);
 for(const [width,height]of cases)for(const chat of [true,false]){
  await layout(width,height,chat);const r=await metrics();verify(r,height,chat);assert.equal(r.stage,'preview');assert.ok(r.picture.hit&&r.picture.w>=r.player.w-8);
  assert.ok(r.join?.hit&&r.join.h>=32&&r.join.y>=r.player.y&&r.join.bottom<=r.player.bottom);
  closed.set(`${width}:${chat}`,r);if(width===2562||width===900)await screenshot(`native-unopened-${width}-chat-${chat}`);
 }
 await c.evaluate(`if(!window.__tsixPreviewLive.joined)window.__tsixPreviewLive.s.muted=true`);
 const point=await c.evaluate(`(()=>{const e=document.querySelector('[data-tsix-preview-join]'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await waitFor(`document.querySelector('.video-stream video')?.readyState===4`);
 await c.evaluate(`window.__tsixPreviewLive.video=document.querySelector('.video-stream video');window.__tsixPreviewLive.source=window.__tsixPreviewLive.video.srcObject`);
 for(const [width,height]of cases)for(const chat of [true,false]){
  await layout(width,height,chat);const r=await metrics();verify(r,height,chat);assert.equal(r.stage,'single');assert.equal(r.join,null);
  const before=closed.get(`${width}:${chat}`);for(const key of ['x','y','w','h'])assert.ok(Math.abs(before.player[key]-r.player[key])<1,`Opening changed ${key}: ${JSON.stringify({before:before.player,after:r.player})}`);
  reports.push({width,height,chat,sameFrame:true,groupedControls:true,draftPreserved:true});if(width===2562&&!chat)await screenshot('native-playing-stage');
 }
 console.log(JSON.stringify({result:'PASS',comparisons:reports,errors:[]},null,2));
}finally{
 if(saved){
  await c.send('Emulation.clearDeviceMetricsOverride');await c.evaluate(`(()=>{const q=window.__tsixPreviewLive,l=document.querySelector('.tsv-window').__vue__.windowLayout;q.sizes.forEach((n,i)=>{l.windowSlots[i].size=n;l.windowSlots[i].change=0});if(q.pre===undefined)delete l.windowSlots[0].preCollapseSize;else l.windowSlots[0].preCollapseSize=q.pre;l.resizeSlotStarted();l.resizeSlotEnded();const b=document.querySelector('[data-tsix-chat-toggle]');if(b&&(b.getAttribute('aria-expanded')==='true')!==q.chat)b.click();const p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.s)?.__vue__;if(!q.joined&&p?.session.status===4)p.onLeave();else if(q.joined&&p?.session.isJoinable)p.onJoin()})()`);
  await waitFor(`window.__tsixPreviewLive.joined?document.querySelector('.video-stream video')?.readyState===4:!!document.querySelector('[data-tsix-preview-join]')`);await delay(150);
  await c.evaluate(`(()=>{const q=window.__tsixPreviewLive,p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.s)?.__vue__,input=p?.$el.querySelector('[data-tsix-volume-control] input');if(input&&q.s.volume!==q.gain){input.value=String(q.gain*100);input.dispatchEvent(new Event('input',{bubbles:true}))}else q.s.volume=q.gain;q.s.muted=q.muted;if(p?.videoRef)p.videoRef.volume=q.muted?0:Math.min(1,q.gain);q.viewer.item.layoutMode=q.mode;removeEventListener('error',q.listener);removeEventListener('unhandledrejection',q.listener);delete window.__tsixPreviewLive})()`);
 }
 c.close();
}
