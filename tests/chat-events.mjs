// Exact installed Vue, native chat filter methods and CSS with synthetic
// messages. No server is contacted and no message is sent.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {clientPath as client} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const bundle=await readFile(`${client}/html/client_ui/main.js`,'utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
const module=id=>{const signature=`${id}:(e,t,n)=>{`,start=bundle.indexOf(signature)+signature.length;assert.ok(start>=signature.length);const end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(end);return bundle.slice(start,start+end.index)};
// TeamSpeak's legacy chat grouping and filter methods, verbatim.
const methodsStart=bundle.indexOf('static stampGrouping(e,t){'),methodsEnd=bundle.indexOf('GetIconUrl(){return this.parent instanceof',methodsStart);
assert.ok(methodsStart>0&&methodsEnd>methodsStart&&methodsEnd-methodsStart<4000);
const nativeMethods=bundle.slice(methodsStart,methodsEnd);
for(const name of ['updateFilteredMessages(e){','updateFilteredMessagesAfterPush(){','updateFilteredMessagesAfterUnshift(e){'])assert.ok(nativeMethods.includes(name),name);
const nativeCss=await readFile(`${client}/html/client_ui/main.css`,'utf8');
const css=await readFile(new URL('../theme/layout.css',import.meta.url),'utf8');
const features=await readFile(new URL('../tools/features-runtime.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../tools/chat-runtime.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const checks=[],errors=[];
try {
 const page=await browser.newPage({viewport:{width:1900,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<title>TS6 chat events regression</title><div class="tsv-window tsv-window-scale-medium"><div id="mount"></div></div>');
 await page.addStyleTag({content:nativeCss});
 await page.addStyleTag({content:css});
 await page.addStyleTag({content:'body{margin:0}.ts-chat-container{width:1800px}.tsv-window{--ts-chat-system-message-bg:#2a3546}'});
 await page.evaluate(({vue,nativeMethods})=>{
  const modules=new Map(),require=id=>{if(!modules.has(id))throw Error('Unexpected module '+id);return modules.get(id)};
  require.r=()=>{};require.d=(target,properties)=>{for(const [key,get]of Object.entries(properties))Object.defineProperty(target,key,{get,enumerable:true})};
  const exports={};new Function('e','t','n',vue)({},exports,require);
  const Vue=Object.values(exports).find(v=>v?.version==='2.7.16');
  const Chat=new Function('a','o',`return class d{constructor(){this.messages=[];this.filteredMessages=[];this._showSystemMessages=true;this.fired=0;this._onMessagesChanged={fire:()=>this.fired++}}${nativeMethods}}`)({Kje:class{}},{CU:5});
  const day=new Date(2026,9,31,20,0);let next=0;
  const message=(kind,minutes=next,extra={})=>{const id=`chan#${next++}`;const base={id,index:next,time:new Date(day.getTime()+minutes*60000),sender:{uuid:'u'+(next%4),id:next%4}};
   const paths={join:'channel.chat.events.client.joined',move:'channel.chat.events.client.joined.from_channel',left:'channel.chat.events.client.left',drop:'server.log.events.client.disconnected',timeout:'server.log.events.client.timeout',kick:'channel.chat.events.client.kicked.from_to.by_invoker'};
   return kind==='text'?{...base,isSystem:false,isPoke:false,i18nPath:undefined,text:'Hello there',...extra}:{...base,isSystem:true,isPoke:false,i18nPath:paths[kind],text:`User ${kind}`,...extra}};
  const Row={_scopeId:'data-v-5c102790',props:['legacyEvent'],render(h){const m=this.legacyEvent;
   if(!m.isSystem)return h('div',{staticClass:'ts-chat-room-event-detailed',attrs:{'data-id':m.id}},[h('div',{staticClass:'ts-chat-room-event-bubble'},m.text)]);
   return h('div',{staticClass:'ts-chat-room-event-detailed is-system',attrs:{'data-id':m.id}},[h('div',{staticClass:'ts-chat-message-system-body compact'},[h('div',{staticClass:'ts-chat-message-system-body-icon'}),h('div',{staticClass:'ts-chat-message-system-body-contents ts-chat-message-system-body-contents-spaced'},[h('span',{staticClass:'ts-font-small'},m.text)]),h('span',{staticClass:'ts-font-minimal ts-style-caption ts-chat-message-system-time'},'20:0'+(m.index%10)+' - Sat')])])}};
  const chat=new Chat();
  const vm=new Vue({data:()=>({item:chat}),computed:{isLegacy:()=>true},render(h){return h('div',{staticClass:'ts-chat-container tsv-view is-detailed'},[h('div',{staticClass:'rows'},this.item.filteredMessages.map(m=>h('div',{key:m.id,staticClass:'vl-row'},[h('div',{staticClass:'vl-content'},[h(Row,{props:{legacyEvent:m}})])])))])}}).$mount('#mount');
  const push=(...kinds)=>{for(const kind of kinds){vm.item.messages.push(typeof kind==='string'?message(kind):kind);vm.item.updateFilteredMessagesAfterPush()}};
  window.lab={vm,chat:vm.item,message,push,Chat,
   ids:()=>vm.item.filteredMessages.map(m=>m.id),
   runs:()=>[...document.querySelectorAll('[data-tsix-chat-run]')].map(b=>({row:b.closest('[data-id]').dataset.id,text:b.textContent,label:b.getAttribute('aria-label'),expanded:b.getAttribute('aria-expanded')})),
   settle:()=>new Promise(r=>Vue.nextTick(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
  vm.item.messages.push(message('text'),message('join'),message('left'),message('text'),message('join'),message('drop'),message('timeout'),message('move'),message('left'),message('kick'),message('join'),message('left'),message('drop'));
  vm.item.updateFilteredMessages(true);
 },{vue:module(62893),nativeMethods});
 // Pure grouping: runs of three or more connection events fold to their latest.
 await page.evaluate(features);await page.evaluate(runtime);await page.evaluate(()=>lab.settle());
 assert.deepEqual(await page.evaluate(()=>lab.ids()),['chan#0','chan#1','chan#2','chan#3','chan#8','chan#9','chan#12']);
 assert.deepEqual(await page.evaluate(()=>lab.runs()),[{row:'chan#8',text:'+4 more',label:'Show 5 join and leave events',expanded:'false'},{row:'chan#12',text:'+2 more',label:'Show 3 join and leave events',expanded:'false'}]);
 assert.equal(await page.evaluate(()=>lab.chat.messages.length),13);
 checks.push('Runs of three or more joins, leaves, disconnects and timeouts fold into their latest line; pairs, text and kicks stay visible');
 const pair=await page.evaluate(()=>{const fold=__tsixChat.fold;const m=lab.message;const yesterday=m('join',-1440),today=[m('left',1),m('drop',2)];return fold([yesterday,...today]).list.length});
 assert.equal(pair,3);checks.push('A run never crosses a day boundary, so day separators stay correct');
 // Day separators: the first message of each day carries the day, and times drop TeamSpeak's day suffix.
 const days=()=>page.evaluate(()=>({days:[...document.querySelectorAll('[data-tsix-day]')].map(e=>[e.dataset.id,e.dataset.tsixDay]),times:[...document.querySelectorAll('.ts-chat-message-system-time')].map(e=>[e.textContent.trim(),e.getAttribute('data-tsix-time')])}));
 const expectedDay=await page.evaluate(()=>new Intl.DateTimeFormat(undefined,{weekday:'long',day:'numeric',month:'long',...(new Date().getFullYear()===2026?{}:{year:'numeric'})}).format(new Date(2026,9,31)));
 let marked=await days();
 assert.deepEqual(marked.days,[['chan#0',expectedDay]]);
 assert.ok(marked.times.length&&marked.times.every(([text,full])=>/^20:0[0-9]$/.test(text)&&full===text+' - Sat'),JSON.stringify(marked.times));
 await page.evaluate(()=>{const first=lab.chat.messages[0];lab.push({...first,id:'next-day',time:new Date(first.time.getTime()+86400000)})});await page.evaluate(()=>lab.settle());
 marked=await days();assert.equal(marked.days.length,2);assert.equal(marked.days[1][0],await page.evaluate(()=>lab.ids().at(-1)));
 const separator=await page.evaluate(()=>{const e=document.querySelector('[data-tsix-day]'),s=getComputedStyle(e,'::before');return {content:s.content,border:s.borderTopWidth,display:s.display}});
 assert.equal(separator.content,JSON.stringify(expectedDay));assert.equal(separator.border,'1px');
 await page.evaluate(()=>__tsixFeatures.set('chatDays',false));await page.evaluate(()=>lab.settle());
 marked=await days();assert.equal(marked.days.length,0);assert.ok(marked.times.every(([text,full])=>full===null&&/ - Sat$/.test(text)),JSON.stringify(marked.times));
 await page.evaluate(()=>__tsixFeatures.set('chatDays',true));await page.evaluate(()=>lab.settle());
 marked=await days();assert.equal(marked.days.length,2);
 await page.evaluate(()=>{const c=lab.chat;c.messages.pop();c.updateFilteredMessages(true)});await page.evaluate(()=>lab.settle());
 checks.push('Day separators mark the first message of each day, times drop the day suffix, and the switch restores TeamSpeak’s text');
 // Expand and fold with the keyboard; focus follows the same run.
 await page.locator('[data-tsix-chat-run]').first().focus();await page.keyboard.press('Enter');await page.evaluate(()=>lab.settle());
 assert.deepEqual(await page.evaluate(()=>lab.ids().slice(4,9)),['chan#4','chan#5','chan#6','chan#7','chan#8']);
 assert.deepEqual((await page.evaluate(()=>lab.runs()))[0],{row:'chan#8',text:'Fold',label:'Fold 5 join and leave events',expanded:'true'});
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.tsixRunKey),'chan#4');
 await page.keyboard.press('Space');await page.evaluate(()=>lab.settle());
 assert.equal(await page.evaluate(()=>lab.ids().length),7);assert.equal(await page.evaluate(()=>document.activeElement.dataset.tsixRunKey),'chan#4');
 checks.push('Show and Fold work by keyboard, announce their state and keep focus on the same run');
 // Live messages extend the latest run through TeamSpeak's own push path.
 await page.evaluate(()=>lab.push('join'));await page.evaluate(()=>lab.settle());
 assert.equal((await page.evaluate(()=>lab.runs())).at(-1).label,'Show 4 join and leave events');assert.equal(await page.evaluate(()=>lab.ids().at(-1)),'chan#16');
 await page.evaluate(()=>lab.push('text','join'));await page.evaluate(()=>lab.settle());
 assert.deepEqual(await page.evaluate(()=>lab.ids().slice(-3)),['chan#16','chan#17','chan#18']);
 checks.push('New join/leave messages extend the run; a text message ends it');
 // TeamSpeak's own "hide system messages" setting still wins.
 await page.evaluate(()=>lab.chat.updateFilteredMessages(false));await page.evaluate(()=>lab.settle());
 assert.deepEqual(await page.evaluate(()=>lab.ids()),['chan#0','chan#3','chan#17']);assert.equal(await page.evaluate(()=>lab.runs().length),0);
 await page.evaluate(()=>lab.push('left'));assert.deepEqual(await page.evaluate(()=>lab.ids()),['chan#0','chan#3','chan#17']);
 await page.evaluate(()=>lab.chat.updateFilteredMessages(true));await page.evaluate(()=>lab.settle());assert.equal(await page.evaluate(()=>lab.runs().length),2);
 checks.push('Hiding system messages in TeamSpeak hides them natively; showing them again regroups');
 // Slim lines: no card, time beside the text; readable row width.
 const geometry=()=>page.evaluate(()=>{const row=document.querySelector('.ts-chat-room-event-detailed.is-system'),body=row.querySelector('.ts-chat-message-system-body'),text=row.querySelector('.ts-chat-message-system-body-contents > span').getBoundingClientRect(),time=row.querySelector('.ts-chat-message-system-time').getBoundingClientRect();return {gap:Math.round(time.left-text.right),background:getComputedStyle(body).backgroundImage,width:Math.round(document.querySelector('.ts-chat-room-event-detailed:not(.is-system)').getBoundingClientRect().width)}});
 const slim=await geometry();
 if(process.env.TSIX_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/chat-events.png`,clip:{x:0,y:0,width:1100,height:330}});
 assert.ok(slim.gap>=0&&slim.gap<=12,JSON.stringify(slim));assert.equal(slim.background,'none');assert.equal(slim.width,960);
 checks.push('Slim system lines drop the card and keep the time beside the text; rows stop at 960px in a 1800px chat');
 await page.evaluate(()=>{__tsixFeatures.set('chatCompactEvents',false);__tsixFeatures.set('chatWidth',false)});
 const native=await geometry();assert.ok(native.gap>600,JSON.stringify(native));assert.notEqual(native.background,'none');assert.ok(native.width>1700);
 await page.evaluate(()=>{__tsixFeatures.set('chatCompactEvents',true);__tsixFeatures.set('chatWidth',true)});
 checks.push('Turning off the slim and width switches restores the native card, far timestamp and full width');
 await page.evaluate(()=>__tsixFeatures.set('chatGroupEvents',false));await page.evaluate(()=>lab.settle());
 assert.equal(await page.evaluate(()=>lab.chat.filteredMessages===lab.chat.messages),true);assert.equal(await page.evaluate(()=>lab.runs().length),0);
 await page.evaluate(()=>__tsixFeatures.set('chatGroupEvents',true));await page.evaluate(()=>lab.settle());assert.equal(await page.evaluate(()=>lab.runs().length),2);
 checks.push('The grouping switch restores TeamSpeak’s own list immediately and regroups when turned back on');
 // By default a short history starts at the top. With the option on it sits on
 // the message box; a long one still starts at the top and scrolls to every row.
 const anchoring=await page.evaluate(()=>{
  const host=document.createElement('div');host.className='ts-chat-container';host.style.cssText='position:fixed;left:0;top:0;width:600px;height:400px;display:flex;flex-direction:column';
  host.innerHTML='<div class="vl-root" style="flex:1 1 auto;overflow-y:scroll"><div class="vl-hover" style="position:sticky;top:0;height:0"></div><div class="vl-width" style="position:absolute"></div><div class="vl-leading"></div><div class="vl-canvas" style="position:relative;height:120px"></div><div class="vl-trailing" style="height:40px"></div></div>';
  document.body.append(host);
  const root=host.querySelector('.vl-root'),canvas=host.querySelector('.vl-canvas'),trailing=host.querySelector('.vl-trailing');
  const top=Math.round(canvas.getBoundingClientRect().top-root.getBoundingClientRect().top);
  __tsixFeatures.set('chatBottom',true);
  const short={gap:Math.round(root.getBoundingClientRect().bottom-trailing.getBoundingClientRect().bottom),scrolls:root.scrollHeight>root.clientHeight};
  canvas.style.height='2000px';
  const long={top:Math.round(canvas.getBoundingClientRect().top-root.getBoundingClientRect().top),scrollHeight:root.scrollHeight};
  root.scrollTop=root.scrollHeight;const end=Math.round(root.getBoundingClientRect().bottom-trailing.getBoundingClientRect().bottom);
  __tsixFeatures.set('chatBottom',false);host.remove();return {top,short,long,end};
 });
 assert.equal(anchoring.top,0,'A short history starts at the top by default');assert.deepEqual(anchoring.short,{gap:0,scrolls:false});assert.equal(anchoring.long.top,0);assert.equal(anchoring.long.scrollHeight,2040);assert.equal(anchoring.end,0);
 checks.push('Chat starts at the top by default; with the option on a short history sits on the message box and a long one still scrolls to its end');
 await page.evaluate(()=>__tsixChat.dispose());await page.evaluate(()=>lab.settle());
 assert.deepEqual(await page.evaluate(()=>({own:['updateFilteredMessages','updateFilteredMessagesAfterPush','updateFilteredMessagesAfterUnshift'].filter(k=>Object.hasOwn(lab.chat,k)),same:lab.chat.filteredMessages===lab.chat.messages,buttons:lab.runs().length,days:document.querySelectorAll('[data-tsix-day],[data-tsix-time]').length,suffix:[...document.querySelectorAll('.ts-chat-message-system-time')].every(e=>/ - Sat$/.test(e.textContent.trim()))})),{own:[],same:true,buttons:0,days:0,suffix:true});
 await page.evaluate(()=>lab.push('join'));assert.equal(await page.evaluate(()=>lab.chat.filteredMessages.at(-1).id),'chan#20');
 checks.push('Disposal removes the per-chat methods and buttons; TeamSpeak’s native push path continues');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Exact installed Vue, native legacy chat filter methods and CSS with synthetic messages; no server messages'},null,2));
} finally {await browser.close()}
