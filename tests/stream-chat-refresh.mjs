// Exact installed Vue/virtual-list regression. Messages are synthetic and local.
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
const helpers=source.slice(source.indexOf('  function deferChatLayout('),source.indexOf('  function syncChatLayout('));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const checks=[],errors=[];
try {
 const page=await browser.newPage({viewport:{width:1000,height:700}});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<title>TS6 hidden chat refresh regression</title><main class="tsv-screenshare" data-tsix-chat="shown"><div class="tsv-body"><div class="tsv-scroll-area-v"><div id="stage">Stream remains visible</div><div class="ts-chat-container"><div id="host" class="tsv-virtual-list-container"><div id="mount"></div></div><textarea aria-label="Chat draft">Keep this draft</textarea></div></div></div></main>');
 await page.addStyleTag({content:listCSS});
 await page.addStyleTag({content:await readFile(new URL('../theme/layout.css',import.meta.url),'utf8')});
 await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;font:14px/20px sans-serif}.tsv-screenshare{width:600px;height:600px;--tsix-chat-min-height:220px}.tsv-body,.tsv-scroll-area-v{height:100%}.tsv-scroll-area-v{display:flex;flex-direction:column}#stage{flex:1;min-height:0}.ts-chat-container{display:flex;flex-direction:column;max-height:220px}#host{flex:1;min-height:0}textarea{flex:0 0 32px}'});
 await page.evaluate(({vue,list,helpers})=>{
  const modules=new Map(),require=id=>{if(!modules.has(id))throw Error('Unexpected module '+id);return modules.get(id)};
  require.r=()=>{};require.d=(target,properties)=>{for(const [key,get]of Object.entries(properties))Object.defineProperty(target,key,{get,enumerable:true})};
  for(const [id,body]of [[62893,vue],[8757,list]]){const exports={};new Function('e','t','n',body)({},exports,require);modules.set(id,exports)}
  const Vue=Object.values(modules.get(62893)).find(v=>v?.version==='2.7.16'),NativeList=modules.get(8757).Ay;
  const setAttr=(node,key,value)=>{if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)};
  const api=new Function('setAttr',`${helpers};return {deferChatLayout,syncChatVisibility}`)(setAttr);
  const Row={props:['row'],render(h){return h('div',{attrs:{'data-message':this.row.item.id},style:{padding:'4px'}},`Message ${this.row.item.id}: `+'A realistic wrapping chat message. '.repeat(3))}};
  const vm=new Vue({data:()=>({items:Array.from({length:40},(_,id)=>({id}))}),render(h){return h(NativeList,{ref:'list',props:{items:this.items,minHeight:24,buffer:200,component:Row,stickBottomWhenBottom:true,prerenderInBackgroud:true,renderAsync:true}})}}).$mount('#mount');
  const controller=vm.$refs.list.getController(),chat=document.querySelector('.ts-chat-container'),owner=document.querySelector('main'),record={};
  window.lab={vm,controller,chat,owner,record,patch:api.deferChatLayout(controller),
   hide(hidden){api.syncChatVisibility(record,chat,hidden);owner.dataset.tsixChat=hidden?'hidden':'shown'},
   append(){vm.items=[...vm.items,{id:vm.items.length}];return vm.items.length-1},
   snapshot(){const r=chat.getBoundingClientRect(),v=controller.engine.viewport,o=controller.ownerElement;return {height:r.height,width:r.width,viewportHeight:v.height,viewportWidth:v.width,atBottom:Math.abs(o.scrollHeight-o.clientHeight-o.scrollTop)<2,latestRendered:!!chat.querySelector(`[data-message="${vm.items.length-1}"]`),inert:chat.inert,aria:chat.getAttribute('aria-hidden'),visibility:getComputedStyle(chat).visibility,display:getComputedStyle(chat).display}}
  };
 },{vue:module(62893),list:module(8757),helpers});
 await page.evaluate(()=>lab.vm.$refs.list.scrollToBottom());await page.waitForFunction(()=>lab.snapshot().atBottom&&lab.snapshot().latestRendered);
 const before=await page.evaluate(()=>lab.snapshot());
 await page.evaluate(()=>lab.chat.style.display='none');await page.waitForFunction(()=>lab.controller.engine.viewport.height===0);
 assert.equal(await page.evaluate(()=>lab.snapshot().viewportHeight),0);checks.push('Old display:none behavior reproduces the zero-size native viewport');
 await page.evaluate(()=>{lab.chat.style.display='';lab.controller.refreshLayout()});await page.waitForFunction(()=>lab.snapshot().viewportHeight>0);await page.evaluate(()=>lab.vm.$refs.list.scrollToBottom());
 await page.evaluate(()=>lab.hide(true));
 const hidden=await page.evaluate(()=>lab.snapshot());assert.equal(hidden.height,before.height);assert.equal(hidden.width,before.width);assert.ok(hidden.inert&&hidden.aria==='true'&&hidden.visibility==='hidden'&&hidden.display!=='none');
 for(let i=0;i<12;i++){
  await page.evaluate(()=>lab.append());
  try {await page.waitForFunction(()=>lab.snapshot().latestRendered&&lab.snapshot().atBottom,{},{timeout:5000})}
  catch(error){throw Error(`${error.message}: ${JSON.stringify(await page.evaluate(()=>({...lab.snapshot(),items:lab.vm.items.length,geometry:lab.controller.engine.geometry.length,top:lab.controller.ownerElement.scrollTop,viewport:lab.controller.engine.viewport})))}`)}
 }
 assert.ok(await page.evaluate(()=>lab.snapshot().viewportHeight>0));
 assert.equal(await page.getByLabel('Chat draft').isVisible(),false);
 await page.evaluate(()=>{document.querySelector('textarea').focus()});assert.equal(await page.evaluate(()=>document.activeElement.tagName==='TEXTAREA'),false);
 checks.push('Twelve new messages render and follow the bottom while chat remains invisible and inert');
 await page.evaluate(()=>{lab.latest=lab.chat.querySelector(`[data-message="${lab.vm.items.length-1}"]`);lab.hide(false)});
 assert.ok(await page.evaluate(()=>lab.latest===lab.chat.querySelector(`[data-message="${lab.vm.items.length-1}"]`)&&lab.snapshot().atBottom));
 assert.equal(await page.getByLabel('Chat draft').inputValue(),'Keep this draft');assert.equal(await page.evaluate(()=>lab.chat.hasAttribute('inert')||lab.chat.hasAttribute('aria-hidden')),false);
 checks.push('Showing chat immediately reuses the latest rendered message and preserves the draft');
 await page.evaluate(()=>lab.vm.$refs.list.scrollToTop());await page.waitForFunction(()=>lab.controller.ownerElement.scrollTop<2);
 await page.evaluate(()=>{lab.hide(true);lab.append()});await page.waitForFunction(()=>lab.controller.engine.geometry.length===53);
 assert.ok(await page.evaluate(()=>lab.controller.ownerElement.scrollTop<2));await page.evaluate(()=>lab.hide(false));assert.ok(await page.evaluate(()=>lab.controller.ownerElement.scrollTop<2));
 checks.push('Reading older messages retains the scroll position instead of forcing the newest message');
 await page.evaluate(()=>{lab.chat.setAttribute('aria-hidden','false');lab.chat.style.setProperty('--tsix-hidden-chat-height','180px','important');lab.hide(true);lab.hide(false)});
 assert.deepEqual(await page.evaluate(()=>({aria:lab.chat.getAttribute('aria-hidden'),height:lab.chat.style.getPropertyValue('--tsix-hidden-chat-height'),priority:lab.chat.style.getPropertyPriority('--tsix-hidden-chat-height')})),{aria:'false',height:'180px',priority:'important'});
 await page.evaluate(()=>{lab.patch.dispose();lab.vm.$destroy()});assert.deepEqual(errors,[]);checks.push('Cleanup restores preexisting attributes and styles without resize warnings');
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Exact installed Vue and virtual list with synthetic messages; no server messages sent'},null,2));
} finally {await browser.close()}
