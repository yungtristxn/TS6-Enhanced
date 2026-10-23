// Native renderer glue with a recording-only transport. No installed client.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const source=await readFile(new URL('../tools/native-runtime.js',import.meta.url),'utf8');
const release={version:'2.0.0',themeVersion:'2.0.0',supportedClient:{build:1791901251}};
const connection={endpoint:'ws://127.0.0.1:12345/',token:'b'.repeat(64)};
const nativeLocation={protocol:'tsui:',hostname:'default',pathname:'/index.html',search:''};
const css=':root{--tsix-layout-version:2.0.0}';
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const checks=[],errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 let fixtureCss='';
 await page.route('http://tsix-native.test/**',route=>route.fulfill(route.request().url().endsWith('/main.css')?
  {contentType:'text/css',body:fixtureCss}:
  {contentType:'text/html',body:'<head><link rel="stylesheet" href="/main.css"></head><body><main><div class="tsv-window"><video></video><span id="style-target">Style target</span></div></main></body>'}));
 const setup=async({build=1791901251,ready=true,dropFirst=false,early=false,custom=false,stale=false,storageBlocked=false}={})=>{
  fixtureCss='#style-target{padding-left:3px;color:blue}'+(early?`@media all{:root{--tsix-css-delivery:resource-v1}${stale?css.replace('2.0.0','1.0.0'):css}#style-target{padding-left:23px;color:red}}`:'');
  await page.goto('http://tsix-native.test/');
  await page.evaluate(({build,ready,dropFirst,custom,storageBlocked})=>{
   // The actual stylesheet remains same-origin HTTP for this browser fixture.
   // Only its reported native address differs, like the lexical page address.
   Object.defineProperty(document.styleSheets[0],'href',{value:'tsui://default/main.css'});
   if(custom){const style=document.createElement('style');style.id='user-style';style.textContent='#style-target{color:purple}';document.head.append(style)}
   if(storageBlocked)Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage is unavailable','SecurityError')}});
   const fixture=window.fixture={requests:[],sockets:[],states:[],attaches:{workspace:0,streams:0,manager:0},refreshes:0,syncs:0,versionRequests:0};
   document.querySelector('main').__vue__={appearanceSettings:{user_style:null,tree_compact:false,chat_input_toolbar_visibility:'always'}};
   document.querySelector('.tsv-window').__vue__={windowLayout:ready?{}:null};
   window.tsclient_internal={getClientLibVersion:callback=>{fixture.versionRequests++;if(dropFirst&&fixture.versionRequests===1)return;callback(null,build)}};
   window.WebSocket=class {
    static OPEN=1;
    constructor(endpoint,protocol){this.endpoint=endpoint;this.protocol=protocol;this.readyState=1;fixture.sockets.push(this);queueMicrotask(()=>this.onopen?.())}
    send(raw){const request=JSON.parse(raw);fixture.requests.push(request);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({reply:request.id,ok:true})}))}
    close(){if(this.readyState!==1)return;this.readyState=3;this.onclose?.()}
    deliver(value){this.onmessage?.({data:JSON.stringify(value)})}
   };
   window.attachWorkspace=()=>{fixture.attaches.workspace++;window.__tsixWorkspace={refresh(){fixture.refreshes++},dispose(){throw Error('Healthy workspace must survive updates')}}};
   window.attachStreams=()=>{fixture.attaches.streams++;window.__tsixStreams={sync(){fixture.syncs++},dispose(){throw Error('Healthy streams must survive updates')}}};
   window.attachManager=()=>{fixture.attaches.manager++;window.__tsixManager={setState(state,token){fixture.states.push({state,token})}}};
  },{build,ready,dropFirst,custom,storageBlocked});
 };
 // Chromium fixtures do not implement TeamSpeak's private tsui scheme. Supply
 // only that document address lexically; all runtime and DOM code is unchanged.
 const start=(address=nativeLocation,transport=connection)=>page.evaluate(`((connection,release,css,location)=>{${source}\n})(${JSON.stringify(transport)},${JSON.stringify(release)},${JSON.stringify(css)},${JSON.stringify(address)})`);
 await setup({ready:false});await start();
 assert.equal(await page.evaluate(()=>__tsixNative.status),'waiting');
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:0,streams:0,manager:0});
 await page.evaluate(()=>{document.querySelector('.tsv-window').__vue__.windowLayout={}});
 await page.waitForFunction(()=>__tsixNative.status==='ready'&&fixture.requests.some(r=>r.data.action==='ready'));
 const ready=await page.evaluate(()=>fixture.requests.find(r=>r.data.action==='ready'));
 assert.deepEqual(ready.data.baseline.appearance,{user_style:null,tree_compact:false,chat_input_toolbar_visibility:'always'});
 assert.equal(await page.locator('#tsix-native-style').count(),1);
 assert.deepEqual(await page.evaluate(()=>({endpoint:fixture.sockets[0].endpoint,protocol:fixture.sockets[0].protocol})),{endpoint:connection.endpoint,protocol:`tsix.v1.${connection.token}`});
 await page.evaluate(()=>{window.original={workspace:__tsixWorkspace,streams:__tsixStreams,video:document.querySelector('video')}});
 await start();
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:1,streams:1,manager:1});
 assert.equal(await page.evaluate(()=>fixture.sockets.length),1);
 checks.push('Startup waits for the native window, captures existing preferences and attaches once per document');
 const send=async style=>{
  await page.evaluate(style=>fixture.sockets.at(-1).deliver({state:{version:'2.0',configured:true},style}),style);
  return page.evaluate(()=>fixture.requests.filter(r=>r.path==='/style-result').at(-1)?.data);
 };
 assert.deepEqual(await send({id:'style-1',css:':root{--tsix-layout-version:2.0.1}',themeVersion:'2.0.1'}),{id:'style-1',applied:true});
 assert.deepEqual(await send({id:'style-bad',css:':root{color:red}',themeVersion:'2.0.2'}),{id:'style-bad',applied:false});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()),'2.0.1');
 await page.evaluate(()=>Object.defineProperty(document,'fullscreenElement',{configurable:true,value:document.querySelector('video')}));
 assert.deepEqual(await send({id:'style-fullscreen',css:':root{--tsix-layout-version:2.0.2}',themeVersion:'2.0.2'}),{id:'style-fullscreen',applied:false});
 await page.evaluate(()=>delete document.fullscreenElement);
 assert.equal(await page.evaluate(()=>original.workspace===__tsixWorkspace&&original.streams===__tsixStreams&&original.video===document.querySelector('video')),true);
 checks.push('Live styles preserve media and helpers, roll back invalid versions and defer during fullscreen');
 const requestCount=await page.evaluate(()=>fixture.requests.length);
 await page.evaluate(()=>{
  __tsixMaintenanceRequest('not json');
  for(const value of ['null','false','12','"check"','[]'])__tsixMaintenanceRequest(value);
  __tsixMaintenanceRequest(JSON.stringify({nonce:'wrong',action:'uninstall'}));
  __tsixMaintenanceRequest(JSON.stringify({nonce:'b'.repeat(64),action:'execute'}));
 });
 assert.equal(await page.evaluate(()=>fixture.requests.length),requestCount);
 await page.evaluate(()=>__tsixMaintenanceRequest(JSON.stringify({nonce:'b'.repeat(64),action:'check'})));
 assert.equal(await page.evaluate(()=>fixture.requests.at(-1).data.action),'check');
 await page.evaluate(()=>fixture.sockets[0].close());
 await page.waitForFunction(()=>fixture.sockets.length===2&&fixture.requests.filter(r=>r.data.action==='ready').length===2);
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:1,streams:1,manager:1});
 assert.equal(await page.evaluate(()=>original.video===document.querySelector('video')&&original.streams===__tsixStreams),true);
 checks.push('Only authenticated maintenance actions are sent; transport reconnect preserves existing helpers and media');
 await setup({early:true,custom:true});await start();await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.equal(await page.evaluate(()=>__tsixNative.cssDelivery),'resource');
 assert.equal(await page.locator('#tsix-native-style').count(),0);
 assert.deepEqual(await page.locator('#style-target').evaluate(e=>({padding:getComputedStyle(e).paddingLeft,color:getComputedStyle(e).color})),{padding:'23px',color:'rgb(128, 0, 128)'});
 assert.deepEqual(await send({id:'early-invalid',css:':root{color:red}',themeVersion:'2.0.1'}),{id:'early-invalid',applied:false});
 assert.equal(await page.locator('#tsix-native-style').count(),0);
 assert.equal(await page.locator('#style-target').evaluate(e=>getComputedStyle(e).paddingLeft),'23px');
 assert.deepEqual(await send({id:'early-update',css:':root{--tsix-layout-version:2.0.1}#style-target{color:green}',themeVersion:'2.0.1'}),{id:'early-update',applied:true});
 assert.deepEqual(await page.locator('#style-target').evaluate(e=>({padding:getComputedStyle(e).paddingLeft,color:getComputedStyle(e).color})),{padding:'3px',color:'rgb(128, 0, 128)'});
 assert.deepEqual(await send({id:'early-invalid-again',css:':root{color:red}',themeVersion:'2.0.2'}),{id:'early-invalid-again',applied:false});
 assert.equal(await page.locator('#style-target').evaluate(e=>getComputedStyle(e).paddingLeft),'3px');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()),'2.0.1');
 assert.deepEqual(await page.evaluate(()=>[...document.head.children].map(e=>e.id||e.tagName)),['LINK','tsix-native-style','user-style']);
 checks.push('Early CSS needs no duplicate style; live updates remove obsolete rules and preserve custom Appearance precedence; invalid updates restore the previous group/overlay');
 await setup({custom:true});await start();await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.equal(await page.evaluate(()=>__tsixNative.cssDelivery),'javascript');
 assert.deepEqual(await send({id:'fallback-update',css:':root{--tsix-layout-version:2.0.1}#style-target{color:green}',themeVersion:'2.0.1'}),{id:'fallback-update',applied:true});
 assert.equal(await page.locator('#style-target').evaluate(e=>getComputedStyle(e).color),'rgb(128, 0, 128)');
 await setup({early:true,stale:true});await start();await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.equal(await page.evaluate(()=>__tsixNative.cssDelivery),'javascript');
 assert.equal(await page.locator('#style-target').evaluate(e=>getComputedStyle(e).paddingLeft),'3px');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()),'2.0.0');
 checks.push('Fallback CSS uses the same cascade position and replaces a stale early stylesheet safely');
 await setup({dropFirst:true});await start();
 assert.equal(await page.evaluate(()=>__tsixNative.status),'waiting');
 assert.equal(await page.locator('#tsix-native-style').count(),0);
 const gc=await page.context().newCDPSession(page);await gc.send('HeapProfiler.collectGarbage');await gc.detach();
 await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.equal(await page.evaluate(()=>fixture.versionRequests),2);
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:1,streams:1,manager:1});
 checks.push('A dropped native version callback times out and retries successfully without premature or duplicate attachment');
 for(const address of [{...nativeLocation,hostname:'extension'},{...nativeLocation,pathname:'/other.html'},{...nativeLocation,search:'?popup=1'}]){
  await setup();await start(address);assert.equal(await page.evaluate(()=>!!window.__tsixNative),false);
 }
 await setup({build:1});await start();await page.waitForFunction(()=>__tsixNative.status==='unsupported');
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:0,streams:0,manager:0});
 assert.equal(await page.locator('#tsix-native-style').count(),0);
 await setup();await start(nativeLocation,null);await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.equal(await page.evaluate(()=>fixture.states.at(-1).state.configured),false);
 assert.equal(await page.evaluate(()=>fixture.sockets.length),0);
 checks.push('Wrong document and unsupported builds stay untouched; a missing update connection leaves the interface usable');
 await setup({storageBlocked:true});await start();await page.waitForFunction(()=>__tsixNative.status==='ready');
 assert.deepEqual(await page.evaluate(()=>fixture.attaches),{workspace:1,streams:1,manager:1});
 assert.equal(await page.evaluate(()=>fixture.sockets.length),0);
 assert.equal(await page.evaluate(()=>fixture.states.at(-1).state.message),'Update support couldn’t read saved preferences.');
 assert.equal(await page.evaluate(()=>__tsixNative.error),'Storage is unavailable');
 checks.push('Unavailable preference storage preserves working helpers and does not send an invented recovery baseline');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
}finally{await browser.close()}
