// Use the exact supported client's Vue 2 runtime, isolated from accounts/media.
// Functional video refs are replaced during render; fake watchers miss this.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href : 'playwright');
import {clientPath as client} from './client-path.mjs';
const bundle=await readFile(`${client}/html/client_ui/main.js`,'utf8');
const signature='62893:(e,t,n)=>{',start=bundle.indexOf(signature)+signature.length;
assert.ok(start>=signature.length);
const end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(end);
const vueSource=bundle.slice(start,start+end.index);
const source=await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8');
const volumeSource=source.slice(source.indexOf('  function createVolume('),source.indexOf('  function onFullscreenChange('));
assert.ok(!volumeSource.includes('sync:true'));
const browser=await chromium.launch({headless:true,args:['--mute-audio','--autoplay-policy=no-user-gesture-required'],...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<main><div id="fixture"></div></main>');
 await page.evaluate(vueSource=>{const exports={},require=()=>{throw Error('Unexpected Vue dependency')};require.r=()=>{};require.d=(target,props)=>{for(const [k,get]of Object.entries(props))Object.defineProperty(target,k,{get,enumerable:true})};new Function('e','t','n',vueSource)({},exports,require);window.Vue=Object.values(exports).find(v=>v?.version==='2.7.16');if(!Vue)throw Error('Expected supported Vue runtime: '+Object.keys(exports))},vueSource);
 await page.evaluate(volumeSource=>{
  navigator.createMediaStreamRequest=()=>{throw Error('No native calls allowed in fixture')};
  const create=new Function(`${volumeSource};return createVolume`)();
  const DragHelper={render(h){return h('div')}};
  const NativeSlider={props:['value'],data:()=>({actualValue:100}),
   watch:{value(value){this.actualValue=Math.max(0,Math.min(100,value))},actualValue(value){this.$emit('input',value)}},
   render(h){return h(DragHelper,{class:'screen-overlay__hero-actions__action-volume-slider',on:{drag:()=>{}}})}
  };
  window.vm=new Vue({data:()=>({session:{isInbound:true,volume:1,muted:false},internalVolume:100,mediaStream:new MediaStream(),videoRef:null,revision:0}),
   computed:{volume:{get(){return this.session.muted?0:this.internalVolume},set(value){this.internalVolume=value;this.session.muted=value===0;this.session.volume=value/100;this.videoRef.volume=this.session.volume}}},
   methods:{onConnectionRef(element){this.videoRef=element;if(element&&element.srcObject!==this.mediaStream){element.srcObject=this.mediaStream;this.internalVolume=100*this.session.volume;element.volume=this.session.muted?0:this.session.volume}}},
   render(h){this.revision;return h('div',{class:'video-stream'},[h('video',{ref:element=>this.onConnectionRef(element)}),h(NativeSlider,{props:{value:this.volume},on:{input:value=>{this.volume=value}}})])}
  }).$mount('#fixture');
  window.originalRef=vm.onConnectionRef;
  window.makeVolume=create;window.handoffs=new WeakMap();vm.session.status=4;
  window.control=create(vm.$el.querySelector('.screen-overlay__hero-actions__action-volume-slider'),vm,handoffs);
 },volumeSource);
 await page.locator('input[type=range]').fill('300');
 const report=await page.evaluate(async()=>{
  const video=vm.videoRef;
  for(let i=0;i<100;i++){vm.revision++;await vm.$nextTick()}
  if(vm.session.volume!==3||vm.videoRef!==video||video.volume!==1)throw Error('Ref updates changed native gain or HTML playback');
  const replacement=new MediaStream();vm.mediaStream=replacement;await vm.$nextTick();
  if(video.srcObject!==replacement||video.volume!==1||vm.session.volume!==3)throw Error('Media replacement failed');
  vm.session.muted=true;await vm.$nextTick();vm.session.muted=false;await vm.$nextTick();
  if(vm.session.volume!==3)throw Error('Hidden native slider reset boost on unmute');
  video.volume=0;vm.revision++;await vm.$nextTick();
  if(video.volume!==1)throw Error('A stale mute level survived a same-media functional ref');
  const slider=vm.$children.find(v=>v.$options.props?.value);
  if(slider._events.input.length!==0)throw Error('Native model listener is still active');
  for(let i=0;i<10;i++){
   const old=vm,oldControl=control,session=vm.session,options=vm.$options;
   old.$destroy();old.$el.remove();
   if(session.volume!==1)throw Error('Remount did not prepare a legal initial HTML volume');
   window.vm=new Vue({...options,el:undefined,data:()=>({session,internalVolume:100,mediaStream:new MediaStream(),videoRef:null,revision:0})}).$mount();document.body.append(vm.$el);
   window.currentOriginal=vm.onConnectionRef;
   window.control=makeVolume(vm.$el.querySelector('.screen-overlay__hero-actions__action-volume-slider'),vm,handoffs);
   oldControl.dispose();await vm.$nextTick();
   if(session.volume!==3||vm.videoRef.volume!==1)throw Error('Fullscreen-style remount lost boost');
  }
  const finalSlider=vm.$children.find(v=>v.$options.props?.value);
  const watchers=vm._scope.effects.length;
  control.dispose();await vm.$nextTick();
  if(vm.onConnectionRef!==currentOriginal||vm.session.volume!==1||vm.$el.querySelector('input')||finalSlider._events.input.length!==1)throw Error('Cleanup failed');
  vm.revision++;await vm.$nextTick();
  return {vue:Vue.version,renderCycles:100,remountCycles:10,gain:3,htmlVolume:1,mediaReplacement:true,mutePreservesBoost:true,restoredNativeRef:true,restoredNativeSlider:true,volumeWatchersRemoved:vm._scope.effects.length<watchers};
 });
 assert.ok(report.volumeWatchersRemoved);assert.deepEqual(errors,[]);
 const reproduction=await page.evaluate(async()=>{
  vm.$destroy();vm.$el.remove();
  let renders=0;
  const old=new Vue({data:()=>({videoRef:null,internalVolume:100,mediaStream:new MediaStream(),session:{volume:1,muted:false}}),
   methods:{onConnectionRef(element){this.videoRef=element;if(element&&element.srcObject!==this.mediaStream){element.srcObject=this.mediaStream;this.internalVolume=this.session.volume*100;element.volume=this.session.volume}}},
   render(h){renders++;if(renders>30)return h('div');return h('video',{ref:element=>this.onConnectionRef(element)})}
  }).$mount();
  document.body.append(old.$el);
  const unwatch=old.$watch(()=>old.videoRef,()=>{const media=old.mediaStream,video=old.videoRef;old.internalVolume=Math.min(old.session.volume*100,100);void media;void video},{sync:true});
  old.$forceUpdate();await old.$nextTick();
  unwatch();old.$destroy();old.$el.remove();
  return {oldSynchronousWatcherRenderCount:renders,renderLoopReproduced:renders>30};
 });
 assert.ok(reproduction.renderLoopReproduced,'The regression must reproduce the original failure');
 console.log(JSON.stringify({result:'PASS',...report,...reproduction,errors},null,2));
}finally{await browser.close()}
