// Explicit live regression: temporarily exercises volume and refreshes the
// current incoming player's media. Never joins/leaves a channel or call.
import assert from 'node:assert/strict';
import {connect} from '../tools/cdp.mjs';
if(!process.argv.includes('--exercise-boost'))throw Error('This live check needs --exercise-boost; it temporarily changes stream volume and refreshes the incoming player');
const c=await connect();
let saved=false;
try {
 await c.evaluate(`(async()=>{const build=await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));if(build!==1791901251)throw Error('Unsupported build');const e=[...document.querySelectorAll('.video-stream')].find(e=>e.__vue__?.session?.isInbound),v=e?.__vue__,input=e?.querySelector('[data-tsix-volume-control] input');if(!v||!input||!v.session.audioSupported||!v.session.config.audio||v.videoRef.readyState<2)throw Error('Requires a loaded incoming audio stream');window.__tsixVolumeLive={v,input,session:v.session,volume:v.session.volume,muted:v.session.muted,focus:document.activeElement,video:v.videoRef,source:v.videoRef.srcObject,errors:[]};const s=window.__tsixVolumeLive;s.listener=e=>s.errors.push(e.message||e.reason?.message||e.type);addEventListener('error',s.listener);addEventListener('unhandledrejection',s.listener)})()`);saved=true;
 const report=await c.evaluate(`(async()=>{
  const s=window.__tsixVolumeLive,{v,input,session}=s;
  input.value='300';input.dispatchEvent(new Event('input',{bubbles:true}));await v.$nextTick();
  if(session.volume!==3||v.videoRef.volume!==1)throw Error('Native/HTML volume mismatch');
  // The update command has no reply. Read native session state back instead
  // of treating the frontend's locally cached volume as proof of acceptance.
  const backend=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native session readback timed out')),3000);tsclient_internal.postMessage({cmd:'requestAllSessions',payload:{}},reply=>{clearTimeout(timer);if(reply.err!==0)return reject(Error('Native session readback failed: '+reply.err));const native=reply.payload.inbound.find(e=>e.sessionId===session.id);resolve({gain:native?.uiState?.volume})})});
  if(backend.gain!==3)throw Error('Native backend did not retain 300%: '+backend.gain);
  for(let i=0;i<100;i++){v.$forceUpdate();await v.$nextTick()}
  if(v.videoRef!==s.video||v.videoRef.srcObject!==s.source)throw Error('Rendering replaced existing media');
  v.toggleMute();await v.$nextTick();if(!session.muted||v.videoRef.volume!==0)throw Error('Mute failed');
  v.toggleMute();await v.$nextTick();if(session.muted||session.volume!==3||v.videoRef.volume!==1)throw Error('Unmute failed: '+JSON.stringify({muted:session.muted,gain:session.volume,html:v.videoRef.volume,internal:v.internalVolume,value:v.volume}));
  v.updateMediaStream();
  for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));if(v.mediaStream&&v.mediaStream!==s.source&&v.videoRef?.srcObject===v.mediaStream&&v.videoRef.readyState>=2)break}
  if(v.mediaStream===s.source||v.videoRef?.srcObject!==v.mediaStream||v.videoRef.readyState<2)throw Error('Refreshed stream did not load');
  if(session.volume!==3||v.videoRef.volume!==1)throw Error('Gain was lost during player refresh');
  const framesBefore=v.videoRef.getVideoPlaybackQuality().totalVideoFrames;await new Promise(r=>setTimeout(r,300));
  const framesAfter=v.videoRef.getVideoPlaybackQuality().totalVideoFrames;
  return {nativeGainReadback:backend.gain,nativeGain:session.volume,htmlVolume:v.videoRef.volume,renderCycles:100,muteUnmute:true,playerRefresh:true,readyState:v.videoRef.readyState,paused:v.videoRef.paused,framesBefore,framesAfter,errors:s.errors};
 })()`);
 assert.deepEqual(report.errors,[]);assert.equal(report.paused,false);
 console.log(JSON.stringify({result:'PASS',...report},null,2));
} finally {
 if(saved)await c.evaluate(`(()=>{const s=window.__tsixVolumeLive;if(!s)return;s.input.value=String(Math.round(s.volume*100));s.input.dispatchEvent(new Event('input',{bubbles:true}));s.session.muted=s.muted;if(s.v.videoRef)s.v.videoRef.volume=s.muted?0:Math.min(1,s.volume);s.focus?.focus?.();removeEventListener('error',s.listener);removeEventListener('unhandledrejection',s.listener);delete window.__tsixVolumeLive})()`);
 c.close();
}
