import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {clientPath} from './client-path.mjs';
const source=await readFile(new URL('../tools/session-guard.js',import.meta.url),'utf8');
const native=await readFile(clientPath+'/html/client_ui/main.js','utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(native).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
assert.match(native,/this\.restoreOpenedActivities=!0/);
assert.match(native,/this\.autoConnectSkipActivityCheck=\$e\.OnlyConnectToRestoredActivity/);
assert.match(native,/e\[e\.OnlyConnectToRestoredActivity=1\]/);
assert.ok(native.includes('JsonBlobSaved:"jsonBlobSaved"'));
assert.ok(native.includes('this.onUserPreferenceJsonChanged(e.payload)'));
assert.ok(native.includes('tsclient_internal.on("onHotkey",e=>'));
const browser=await chromium.launch({headless:true}),checks=[];
try{
 const page=await browser.newPage();
 async function setup(active,readonly=false,omitted=false){
  await page.goto('about:blank');
  await page.setContent('<main></main>');
  await page.evaluate(({readonly,omitted})=>{
   window.disk={workflow:{...(omitted?{}:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:2}),showOwnStreams:false},other:'preserved'};
   window.listeners=new Map();window.events=[];
   window.originalGet=(name,callback)=>callback(0,JSON.stringify(disk));
   window.originalSave=(name,raw)=>{disk=JSON.parse(raw);for(const callback of listeners.get('jsonBlobSaved')||[])callback({key:name,payload:raw})};
   window.originalOn=(name,callback)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(callback);return()=>listeners.get(name).delete(callback)};
   window.tsclient_internal={getJsonBlob:originalGet,saveJsonBlob:originalSave,on:originalOn};
   if(readonly==='configurable')for(const name of ['getJsonBlob','saveJsonBlob','on'])Object.defineProperty(tsclient_internal,name,{writable:false,configurable:true});
   else if(readonly)Object.freeze(tsclient_internal);
  },{readonly,omitted});
  await page.evaluate(({source,active})=>new Function('connection',source)({resumeSession:active}),{source,active});
  await page.evaluate(()=>{
   const app={workflowSettings:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1},connections:[],
    changed(raw){Object.assign(this.workflowSettings,JSON.parse(raw).workflow)},
    applyWorkflowSettings(value){Object.assign(this.workflowSettings,value);tsclient_internal.saveJsonBlob('general_settings',JSON.stringify({...disk,workflow:this.workflowSettings}))},
    restoreOpenedActivities(){events.push('tabs')},checkAutoConnect(){if(this.workflowSettings.autoConnectSkipActivityCheck)events.push('connect')}};
   window.app=app;document.querySelector('main').__vue__={$root:{appController:app,_vm:{tsapi:{IsReady:()=>true}}}};
   tsclient_internal.on('jsonBlobSaved',event=>{if(event.key==='general_settings')app.changed(event.payload);else events.push(event)});
   window.hotkeys=0;tsclient_internal.on('onHotkey',()=>hotkeys++);
   __tsixSessionGuard.finishSetup();
   tsclient_internal.getJsonBlob('general_settings',(error,raw)=>app.changed(raw));
  });
 }
 await setup(false);assert.equal(await page.evaluate(()=>__tsixSessionGuard.supported),true);
 assert.ok(await page.evaluate(()=>tsclient_internal.getJsonBlob===originalGet&&tsclient_internal.saveJsonBlob===originalSave));
 await page.evaluate(()=>{window.__tsixUpdateSession={userIntent:()=>false};for(const listener of listeners.get('onHotkey'))listener({})});
 assert.equal(await page.evaluate(()=>hotkeys),0);
 await page.evaluate(()=>{window.__tsixUpdateSession={userIntent:()=>true};for(const listener of listeners.get('onHotkey'))listener({})});
 assert.equal(await page.evaluate(()=>hotkeys),1);
 checks.push('The native hotkey dispatcher honors the shutdown input fence before invoking the vendor action');
 await setup(true);
 const guarded=await page.evaluate(()=>new Promise(resolve=>tsclient_internal.getJsonBlob('general_settings',(error,raw)=>resolve(JSON.parse(raw)))));
 assert.equal(guarded.workflow.restoreOpenedActivities,false);assert.equal(guarded.workflow.autoConnectSkipActivityCheck,0);
 await page.evaluate(value=>{value.other='new native preference';tsclient_internal.saveJsonBlob('general_settings',JSON.stringify(value))},guarded);
 assert.deepEqual(await page.evaluate(()=>disk),{workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:2,showOwnStreams:false},other:'new native preference'});
 assert.deepEqual(await page.evaluate(()=>app.workflowSettings),{restoreOpenedActivities:false,autoConnectSkipActivityCheck:0,showOwnStreams:false});
 await page.evaluate(()=>app.checkAutoConnect());assert.deepEqual(await page.evaluate(()=>events),[]);
 await page.evaluate(()=>tsclient_internal.saveJsonBlob('another_blob',JSON.stringify({unrelated:true})));
 assert.deepEqual(await page.evaluate(()=>events),[{key:'another_blob',payload:'{"unrelated":true}'}]);
 // An unreadable settings blob is the vendor's to handle; the guard passes it through unchanged.
 assert.equal(await page.evaluate(()=>{const saved=disk,observers=listeners.get('jsonBlobSaved');listeners.delete('jsonBlobSaved');
  try{tsclient_internal.saveJsonBlob('general_settings','null');return disk===null}catch(error){return error.message}finally{disk=saved;listeners.set('jsonBlobSaved',observers)}}),true);
 checks.push('A non-object settings save reaches the vendor unchanged instead of throwing inside the guard');
 assert.deepEqual(await page.evaluate(()=>__tsixSessionGuard.release()),{restoreOpenedActivities:true,autoConnectSkipActivityCheck:2});
 assert.ok(await page.evaluate(()=>tsclient_internal.getJsonBlob===originalGet&&tsclient_internal.saveJsonBlob===originalSave&&tsclient_internal.on===originalOn));
 await page.evaluate(()=>tsclient_internal.saveJsonBlob('general_settings',JSON.stringify({workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:2}})));
 assert.equal(await page.evaluate(()=>app.workflowSettings.autoConnectSkipActivityCheck),2);
 checks.push('Saved-blob notifications keep recovery gated, preserve disk preferences and unrelated events, then stop masking existing listeners on release');
 await setup(true,false,true);
 await page.evaluate(()=>__tsixSessionGuard.dispose(true));
 assert.equal(await page.evaluate(()=>app.workflowSettings.restoreOpenedActivities),true);
 assert.equal(await page.evaluate(()=>app.workflowSettings.autoConnectSkipActivityCheck),1);
 assert.deepEqual(await page.evaluate(()=>events),['tabs','connect']);
 assert.deepEqual(await page.evaluate(()=>disk),{workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1,showOwnStreams:false},other:'preserved'});
 checks.push('Fallback cleanup restores the actual beta5 defaults for omitted workflow keys and resumes normal startup');
 await setup(true,'configurable');assert.equal(await page.evaluate(()=>__tsixSessionGuard.supported),true);
 assert.equal(await page.evaluate(()=>app.workflowSettings.autoConnectSkipActivityCheck),0);
 await page.evaluate(()=>app.applyWorkflowSettings({showOwnStreams:true}));
 assert.equal(await page.evaluate(()=>app.workflowSettings.autoConnectSkipActivityCheck),0);
 assert.equal(await page.evaluate(()=>disk.workflow.autoConnectSkipActivityCheck),2);
 for(const name of ['getJsonBlob','saveJsonBlob','on'])assert.deepEqual(await page.evaluate(name=>{const d=Object.getOwnPropertyDescriptor(tsclient_internal,name);return{writable:d.writable,configurable:d.configurable}},name),{writable:false,configurable:true});
 await page.evaluate(()=>__tsixSessionGuard.dispose(true));
 assert.equal(await page.evaluate(()=>app.workflowSettings.autoConnectSkipActivityCheck),2);
 assert.ok(await page.evaluate(()=>tsclient_internal.getJsonBlob===originalGet&&tsclient_internal.saveJsonBlob===originalSave&&tsclient_internal.on===originalOn));
 checks.push('Actual CEF read-only/configurable bindings support early hooks and exact descriptor restoration without making native functions writable');
 await setup(true,true);assert.equal(await page.evaluate(()=>__tsixSessionGuard.supported),false);
 assert.ok(await page.evaluate(()=>tsclient_internal.getJsonBlob===originalGet));
 checks.push('Read-only native bindings refuse automatic session recovery without modifying preferences');
 console.log(JSON.stringify({result:'PASS',checks},null,2));
}finally{await browser.close()}
