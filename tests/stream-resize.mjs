// Exercise the installed beta5 virtual list and Vue, not an imitation of its
// ResizeObservers. No account, server or live media is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
import {clientPath as client} from './client-path.mjs';
const bundle=await readFile(`${client}/html/client_ui/main.js`,'utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
const module=id=>{const signature=`${id}:(e,t,n)=>{`,start=bundle.indexOf(signature)+signature.length;assert.ok(start>=signature.length);const end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(end);return bundle.slice(start,start+end.index)};
const css=await readFile(`${client}/html/client_ui/main.css`,'utf8');
const listCSS=[...css.matchAll(/[^{}]*(?:\.vl-|\.tsv-virtual-list)[^{}]*\{[^{}]*\}/g)].map(m=>m[0]).join('\n');
const source=await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8');
const adapter=source.slice(source.indexOf('  function deferChatLayout('),source.indexOf('  function syncChatLayout('));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
try{
 const p=await browser.newPage({viewport:{width:1000,height:700}});
 await p.setContent('<title>Native TS6 resize regression</title><style>body{margin:0;font:14px/20px sans-serif}#host{width:600px;height:350px}</style><div class="ts-chat-container"><div id="host" class="tsv-virtual-list-container"><div id="mount"></div></div></div>');
 await p.addStyleTag({content:listCSS});
 await p.evaluate(({vue,list,adapter})=>{
  const modules=new Map(),require=id=>{if(!modules.has(id))throw Error('Unexpected module '+id);return modules.get(id)};
  require.r=()=>{};require.d=(target,properties)=>{for(const [key,get]of Object.entries(properties))Object.defineProperty(target,key,{get,enumerable:true})};
  for(const [id,body]of [[62893,vue],[8757,list]]){const exports={};new Function('e','t','n',body)({},exports,require);modules.set(id,exports)}
  window.Vue=Object.values(modules.get(62893)).find(v=>v?.version==='2.7.16');
  window.NativeList=modules.get(8757).Ay;
  window.deferChatLayout=new Function(`${adapter};return deferChatLayout`)();
  window.resizeErrors=[];addEventListener('error',e=>resizeErrors.push(e.message));
  const NativeObserver=ResizeObserver;window.ResizeObserver=class extends NativeObserver{constructor(callback){super((entries,observer)=>{window.inResizeDelivery=true;try{callback(entries,observer)}finally{window.inResizeDelivery=false}})}};
  const Row={render(h){return h('div',{style:{padding:'4px',whiteSpace:'normal'}},'Native virtual chat row with wrapping text. '.repeat(2))}};
  window.mountList=fixed=>{
   document.getElementById('host').innerHTML='<div id="mount"></div>';
   window.vm=new Vue({data:()=>({items:Array.from({length:8},(_,id)=>({id})),scrollbar:true}),render(h){return h(NativeList,{ref:'list',class:{'scrollbar-visible':this.scrollbar},props:{items:this.items,minHeight:24,buffer:200,component:Row},on:{'ts-scroller-height-changed':sizes=>requestAnimationFrame(()=>{if(!this._isDestroyed)this.scrollbar=sizes.totalHeight>sizes.clientHeight})}})}}).$mount('#mount');
   window.controller=vm.$refs.list.getController();window.transactionsInObserver=0;
   for(const key of ['measure','refreshLayout']){const native=controller[key];controller[key]=function(...args){if(window.inResizeDelivery)transactionsInObserver++;return native.apply(this,args)}}
   window.originalMeasure=controller.measure;window.originalRefresh=controller.refreshLayout;
   window.patch=fixed?deferChatLayout(controller):null;
  };
 },{vue:module(62893),list:module(8757),adapter});
 const cycle=()=>p.evaluate(async()=>{for(const [width,height]of [[600,180],[600,450],[300,350],[800,650],[220,180],[900,450],[320,500],[600,180]]){const host=document.getElementById('host');host.style.width=width+'px';host.style.height=height+'px';await new Promise(r=>setTimeout(r,100))}});
 await p.evaluate(()=>mountList(false));await cycle();
 const baseline=await p.evaluate(()=>({errors:resizeErrors.slice(),transactionsInObserver}));
 assert.ok(baseline.transactionsInObserver>0,'The native baseline must perform geometry transactions during observer delivery');
 assert.ok(baseline.errors.every(e=>e.includes('ResizeObserver loop')));
 await p.evaluate(()=>{vm.$destroy();vm.$el.remove();resizeErrors.length=0;mountList(true)});
 for(let i=0;i<4;i++)await cycle();
 const report=await p.evaluate(async()=>{
  const before=controller.engine.geometry.total;
  controller.measure([{key:0,height:99999,width:600,version:-1,epoch:-1}]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(controller.engine.geometry.total!==before)throw Error('Stale measurement was accepted');
  await vm.$refs.list.scrollToBottom();await new Promise(r=>setTimeout(r,150));
  const atBottom=Math.abs(controller.ownerElement.scrollHeight-controller.ownerElement.clientHeight-controller.ownerElement.scrollTop)<2;
  const mounted=vm.$el.querySelectorAll('.vl-content').length;
  for(let i=0;i<10;i++){patch.dispose();if(controller.measure!==originalMeasure||controller.refreshLayout!==originalRefresh)throw Error('Native methods not restored');patch=deferChatLayout(controller)}
  controller.refreshLayout();patch.dispose();vm.$destroy();vm.$el.remove();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return{atBottom,mounted,errors:resizeErrors.slice(),transactionsInObserver,staleMeasurementRejected:true,cleanupCycles:10};
 });
 assert.ok(report.atBottom&&report.mounted>0);assert.equal(report.transactionsInObserver,0);assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify({result:'PASS',nativeBaselineTransactionsInObserver:baseline.transactionsInObserver,nativeBaselineWarnings:baseline.errors.length,resizeChanges:32,...report},null,2));
}finally{await browser.close()}
