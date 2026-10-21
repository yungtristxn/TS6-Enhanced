// Explicit live acceptance. Temporarily changes renderer size, chat visibility,
// stream gain and mute; restores them in finally. Never joins/leaves a channel.
import assert from 'node:assert/strict';
import {connect} from '../tools/cdp.mjs';
if(!process.argv.includes('--exercise-boost'))throw Error('Pass --exercise-boost to authorize temporary gain/mute changes');
const c=await connect(),reports=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let saved=false;
const state=()=>c.evaluate(`(()=>{const q=window.__tsixFullscreenQA,p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.session),v=p?.querySelector('video'),input=p?.querySelector('[data-tsix-volume-control] input');return{fullscreen:!!document.fullscreenElement,presented:q.viewer.presented,mode:q.viewer.item.layoutMode?.kind,gain:q.session.volume,muted:q.session.muted,htmlVolume:v?.volume,ready:v?.readyState,paused:v?.paused,frames:v?.getVideoPlaybackQuality().totalVideoFrames,range:input?Number(input.value):null,errors:q.errors.slice()}})()`);
async function ready(fullscreen,gain,muted){
 for(let i=0;i<60;i++){const r=await state();if(r.fullscreen===fullscreen&&r.ready===4&&!r.paused&&r.range===(muted?0:gain*100)&&r.gain===gain&&r.muted===muted&&r.htmlVolume===(muted?0:Math.min(1,gain)))return r;await delay(100)}
 throw Error('Fullscreen/player did not settle: '+JSON.stringify(await state()));
}
try{
 await c.evaluate(`(async()=>{
  const build=await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));
  const viewer=[...document.querySelectorAll('.tsv-screenshare')].find(e=>e.__vue__?.$refs.fullArea)?.__vue__,p=document.querySelector('.video-stream')?.__vue__;
  if(build!==1791901251||document.hidden||document.fullscreenElement||!p?.session.isInbound||!p.session.audioSupported||!p.session.config.audio||!p.$el.querySelector('[data-tsix-volume-control]'))throw Error('Requires visible supported main window with a loaded incoming audio stream');
  const chat=document.querySelector('.ts-chat-container')?.__vue__;
  const q=window.__tsixFullscreenQA={viewer,session:p.session,mode:viewer.item.layoutMode,gain:p.session.volume,muted:p.session.muted,chat:window.__tsixStreams.status().chatVisible,focus:document.activeElement,chatVM:chat,draft:chat?.$refs.chatInput?.chatInputFieldComponent?.internalText,scroll:chat?.getVirtualList()?.getScrollTop(),errors:[],originalConsole:console.error};
  q.listener=e=>q.errors.push(e.message||e.reason?.message||e.type);addEventListener('error',q.listener);addEventListener('unhandledrejection',q.listener);
  q.console=(...args)=>{q.errors.push(String(args[0]));q.originalConsole.apply(console,args)};console.error=q.console;
 })()`);saved=true;
 for(const [width,height]of [[1322,847],[900,650],[640,480]])for(const chat of [true,false])for(const [gain,muted]of [[1,false],[3,false],[3,true]]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await c.evaluate(`(()=>{
   const q=window.__tsixFullscreenQA,b=document.querySelector('[data-tsix-chat-toggle]');if(b&&(b.getAttribute('aria-expanded')==='true')!==${chat})b.click();
   const p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.session).__vue__,input=p.$el.querySelector('[data-tsix-volume-control] input');input.value='${gain*100}';input.dispatchEvent(new Event('input',{bubbles:true}));if(q.session.muted!==${muted})p.toggleMute();
  })()`);await ready(false,gain,muted);await delay(200);
  const action=await c.send('Runtime.evaluate',{expression:`[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===window.__tsixFullscreenQA.session).__vue__.toggleFullscreen()`,userGesture:true});
  if(action.exceptionDetails)throw Error(action.exceptionDetails.exception?.description);
  const entry=await ready(true,gain,muted);await delay(200);const playing=await state();assert.ok(playing.frames>entry.frames,'Fullscreen frames must advance');assert.deepEqual(playing.errors,[]);
  const nativeGain=await c.evaluate(`new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native session readback timeout')),3000);tsclient_internal.postMessage({cmd:'requestAllSessions',payload:{}},r=>{clearTimeout(timer);if(r.err!==0)return reject(Error('Native session readback failed'));resolve(r.payload.inbound.find(s=>s.sessionId===window.__tsixFullscreenQA.session.id)?.uiState?.volume)})})`);assert.equal(nativeGain,gain);
  await c.evaluate('document.exitFullscreen()');await ready(false,gain,muted);await delay(180);assert.deepEqual((await state()).errors,[]);
  reports.push({width,height,chat,gain,muted,framesAdvanced:true,nativeGain});
 }
 const draftPreserved=await c.evaluate('window.__tsixFullscreenQA.draft===window.__tsixFullscreenQA.chatVM?.$refs.chatInput?.chatInputFieldComponent?.internalText');assert.ok(draftPreserved);
 console.log(JSON.stringify({result:'PASS',cycles:reports.length,cases:reports,resizeWarnings:0,runtimeErrors:0,draftPreserved},null,2));
}finally{
 if(saved){
  await c.evaluate('document.fullscreenElement?document.exitFullscreen():null');await delay(200);await c.send('Emulation.clearDeviceMetricsOverride');
  await c.evaluate(`(()=>{const q=window.__tsixFullscreenQA;q.viewer.item.layoutMode=q.mode;const b=document.querySelector('[data-tsix-chat-toggle]');if(b&&(b.getAttribute('aria-expanded')==='true')!==q.chat)b.click()})()`);await delay(250);
  await c.evaluate(`(()=>{const q=window.__tsixFullscreenQA,p=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session===q.session)?.__vue__,input=p?.$el.querySelector('[data-tsix-volume-control] input');if(input){input.value=String(q.gain*100);input.dispatchEvent(new Event('input',{bubbles:true}))}else q.session.volume=q.gain;q.session.muted=q.muted;if(p?.videoRef)p.videoRef.volume=q.muted?0:Math.min(1,q.gain);if(Number.isFinite(q.scroll))q.chatVM?.getVirtualList()?.getController()?.scrollTo(q.scroll,0);if(q.focus?.isConnected)q.focus.focus();removeEventListener('error',q.listener);removeEventListener('unhandledrejection',q.listener);if(console.error===q.console)console.error=q.originalConsole;delete window.__tsixFullscreenQA})()`);
 }
 c.close();
}
