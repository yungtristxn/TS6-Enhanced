import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {createNativeManager} from '../tools/native-manager.mjs';
import {createSessionJournal} from '../tools/session-state.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const snapshot=()=>({schema:1,build:1791901251,capturedAt:Date.now(),workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1},defaults:{inputMuted:false,outputMuted:false},activeServer:'',captureServer:'',connections:[],drafts:[]});
async function fixture({prepareFails=false,protectFails=false,restore=null,sameVersion=false,targetAlreadyInstalled=false,withdrawn=false,corruptInstaller=false,retainedDrafts=false,changedDuringWorker=false}={}){
 const base=resolve(import.meta.dirname,'../.local/session-update-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'flow-')),client=join(root,'client');
 await mkdir(join(client,'html/client_ui'),{recursive:true});const resource=Buffer.from('fixture resource'),resourceHashes={};
 for(const name of ['html/client_ui/main.js','html/client_ui/main.css']){await writeFile(join(client,name),resource);resourceHashes[name]=digest(resource)}
 const images={};for(const name of ['TeamSpeak.exe','TeamSpeak.dll','libcef.dll']){await writeFile(join(client,name),resource);images[name]={sha256:digest(resource)}}
 const manifest={version:'2.2.1',updates:{deferredInstall:1,sessionRestore:1},nativeLoader:{schema:1},supportedClient:{resourceHashes,nativeImages:images}};
 const metadata=Buffer.from(JSON.stringify(manifest)),installer=Buffer.alloc(128);installer.write('MZ');installer.writeUInt32LE(64,60);installer.writeUInt32LE(0x4550,64);installer.writeUInt16LE(0x8664,68);
 const asset=(name,body)=>({name,state:'uploaded',size:body.length,digest:'sha256:'+digest(body),browser_download_url:'https://github.com/example/layout/releases/download/v2.2.1/'+name});
 const published={tag_name:'v2.2.1',draft:false,prerelease:false,published_at:'2026-10-26T10:00:00Z',assets:[asset('release.json',metadata),asset('TS6-Enhanced-2.2.1-Setup.exe',installer)]};
 const events=[],states=[],jobs=[],statuses=[],release={version:sameVersion||targetAlreadyInstalled?'2.2.1':'2.2.0',nativeLoader:{schema:1},updates:{repository:'example/layout',channel:'stable',nativeInstall:1,sessionRestore:1}};
 if(sameVersion||targetAlreadyInstalled){
  await writeFile(join(root,'pending-update.json'),JSON.stringify({schema:2,mode:'next-launch',fromVersion:targetAlreadyInstalled?'2.2.0':release.version,version:release.version,sha256:digest(installer)}));
  await writeFile(join(root,'native-error.json'),JSON.stringify({message:'Interrupted installation',update:{version:release.version,sha256:digest(installer)}}));
 }
 let saved=null;
 let recoveryId=null,journal={load:async()=>restore,loadDrafts:async()=>[],save:async(value,version)=>{events.push('save');if(protectFails)throw Error('Encryption unavailable');saved=value;assert.equal(version,'2.2.1');return 'resume-fixture'},arm:async()=>events.push('arm'),clear:async()=>events.push('clear')};
 if(retainedDrafts){
  journal=createSessionJournal(root,{protect:(path,text)=>writeFile(path,text,{flag:'wx'}),unprotect:path=>readFile(path,'utf8')});
  const previous=snapshot();previous.connections=[{key:'old',serverUid:'offline-server',selfUid:'old-user',channelId:'7',channelPassword:'',connectInfo:{address:'offline.invalid',port:9987},voice:{inputMuted:false,outputMuted:false,inputDeactivated:false,away:false,awayMessage:''},outbound:[],inbound:[]}];
  previous.drafts=[{connectionKey:'old',chatKey:'7',content:'Keep this draft'},{connectionKey:'old',chatKey:'8',content:'Keep this one too'}];
  recoveryId=await journal.save(previous,release.version);await journal.arm(recoveryId);
  const save=journal.save,arm=journal.arm,retain=journal.retainDrafts;
  journal.save=async(value,version)=>{events.push('save');saved=value;return save(value,version)};
  journal.arm=async id=>{events.push('arm');return arm(id)};
  journal.retainDrafts=async(id,indices)=>{events.push('retain');return retain(id,indices)};
 }
 const host=await createNativeManager({token:'a'.repeat(64),release,root,client,journal,onStatus:async patch=>statuses.push(patch),
  fetcher:async url=>new Response(url.includes('api.github.com')?JSON.stringify(withdrawn?[]:[published]):url.endsWith('release.json')?metadata:corruptInstaller?'tampered':installer),
  applyMaintenance:async(action,handoff)=>{events.push('worker-ready');assert.equal(action,'update');if(changedDuringWorker)events.push('user-muted');await handoff.beforeClose();events.push('install');assert.ok(saved);assert.ok(events.indexOf('arm')<events.indexOf('install'))}});
 const socket=new WebSocket('ws://127.0.0.1:'+host.port,'tsix.v1.'+'a'.repeat(64),{headers:{Origin:'tsui://default'}});
 let sequence=0;const pending=new Map(),seen=new Set();
 const request=(path,data)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,path,data}))});
 socket.on('message',async bytes=>{
  const value=JSON.parse(bytes);if(value.reply){const promise=pending.get(value.reply);pending.delete(value.reply);promise?.resolve(value);return}
  if(value.state)states.push(value.state);
  if(value.session&&!seen.has(value.session.id)){
   const job=value.session;seen.add(job.id);jobs.push(job);events.push(job.stage);
   const result=job.stage==='capture'?snapshot():job.stage==='restore'?{preferencesRestored:true,draftsRestored:!retainedDrafts,recoveredDrafts:[],warnings:[]}:{ok:true};
   await request('/session-result',{id:job.id,...((prepareFails||changedDuringWorker)&&job.stage==='prepare'?{error:'Session changed'}:{result})});
  }
 });
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 const baseline={schema:1,owner:'tsix-install-baseline',appearance:{user_style:null},storage:{'tsix.layout.chatVisible':null,'tsix.layout.streamTrayCollapsed':null}};
 const wait=async predicate=>{const end=Date.now()+8000;while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('Fixture flow timed out: '+JSON.stringify({events,states}))};
 await request('/action',{action:'ready',baseline});await wait(()=>states.at(-1)?.busy===false);
 return{events,states,jobs,statuses,request,wait,root,journal,recoveryId,close:async()=>{socket.terminate();await host.close()}};
}
test('confirmed update verifies download, saves and prepares the current session, then immediately installs',async()=>{
 const f=await fixture();try{
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('install')&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save','worker-ready','prepare','arm','install']);
  assert.equal(JSON.parse(await readFile(join(f.root,'pending-update.json'),'utf8')).version,'2.2.1');
  assert.equal((await f.request('/session-result',{id:'stale',result:{ok:true}})).ok,false);
 }finally{await f.close()}
});

test('same-version repair confirmation verifies the published installer and immediately enters maintenance',async()=>{
 const f=await fixture({sameVersion:true});try{
  assert.equal(f.states.at(-1).pending,'2.2.1');
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('install')&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save','worker-ready','prepare','arm','install']);
  const receipt=JSON.parse(await readFile(join(f.root,'pending-update.json'),'utf8'));
  assert.equal(receipt.fromVersion,receipt.version);assert.equal(digest(await readFile(receipt.path)),receipt.sha256);
 }finally{await f.close()}
});

test('same-version repairs cannot restart from a withdrawn release or tampered download',async()=>{
 for(const options of [{withdrawn:true},{corruptInstaller:true}]){
  const f=await fixture({sameVersion:true,...options});try{
   const before=f.states.length;await f.request('/action',{action:'update'});await f.wait(()=>f.states.length>before&&f.states.at(-1)?.busy===false);
   assert.deepEqual(f.events,[]);
   assert.match(JSON.stringify(f.states.at(-1)),options.withdrawn?/no longer published/:/SHA-256/);
  }finally{await f.close()}
 }
});

test('offline draft recovery remains independent across the next confirmed update and acknowledgements',async()=>{
 const f=await fixture({retainedDrafts:true});try{
  assert.deepEqual(f.events,['restore','retain','restore']);assert.equal(f.jobs[1].payload.draftOnly,true);
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('install')&&f.states.at(-1)?.busy===false);
  const active=JSON.parse(await readFile(join(f.root,'update-session.json'),'utf8'));
  assert.notEqual(active.id,f.recoveryId);assert.equal(active.phase,'armed');
  assert.equal((await f.request('/session-recovered',{id:f.recoveryId,indices:[0]})).ok,true);
  assert.deepEqual((await f.journal.loadDrafts())[0].draftIndices,[1]);
  assert.equal((await f.request('/session-recovered',{id:f.recoveryId,indices:[1]})).ok,true);
  assert.equal((await f.request('/session-recovered',{id:f.recoveryId,indices:[1]})).ok,true,'A lost completion reply can be retried');
  assert.deepEqual(await f.journal.loadDrafts(),[]);
  assert.equal(JSON.parse(await readFile(join(f.root,'update-session.json'),'utf8')).id,active.id);
 }finally{await f.close()}
});
test('failed preparation cancels the startup guard and never closes the client',async()=>{
 const f=await fixture({prepareFails:true});try{
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('clear')&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save','worker-ready','prepare','cancel','clear']);assert.equal(f.states.at(-1).detail,'Session changed');
 }finally{await f.close()}
});

test('final preparation happens after worker verification and refuses a newly changed session',async()=>{
 const f=await fixture({changedDuringWorker:true});try{
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('clear')&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save','worker-ready','user-muted','prepare','cancel','clear']);
 }finally{await f.close()}
});

test('a partially installed target keeps the source-version repair queue visible and actionable',async()=>{
 const f=await fixture({targetAlreadyInstalled:true});try{
  assert.equal(f.states.at(-1).pending,'2.2.1');assert.equal(f.states.at(-1).detail,'Interrupted installation');
  await f.request('/action',{action:'update'});await f.wait(()=>f.events.includes('install')&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save','worker-ready','prepare','arm','install']);
 }finally{await f.close()}
});
test('encryption failure stops before preference changes or restart',async()=>{
 const f=await fixture({protectFails:true});try{
  await f.request('/action',{action:'update'});await f.wait(()=>f.states.at(-1)?.detail==='Encryption unavailable'&&f.states.at(-1)?.busy===false);
  assert.deepEqual(f.events,['capture','save']);
 }finally{await f.close()}
});
test('fresh renderer restores a one-use saved session before normal update polling',async()=>{
 const f=await fixture({restore:{id:'resume-fixture',snapshot:snapshot(),restoreSession:true,windowMatches:{}}});try{
  assert.deepEqual(f.events,['restore','clear']);assert.equal(f.jobs[0].payload.restoreSession,true);
  const recorded=f.statuses.find(status=>status.sessionRestore)?.sessionRestore;
  assert.equal(recorded.automaticAttempted,true);assert.deepEqual(recorded.warnings,[]);
  assert.deepEqual(Object.keys(recorded).sort(),['at','automaticAttempted','draftsRestored','preferencesRestored','warnings']);
 }finally{await f.close()}
});
