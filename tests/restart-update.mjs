import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';import {resolve,join} from 'node:path';
import {runRestartWorker} from '../tools/native-manager.mjs';
import {createSessionJournal} from '../tools/session-state.mjs';
const [clientFixture,installerFixture]=process.argv.slice(2),project=resolve(import.meta.dirname,'..'),checks=[];
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const exists=path=>stat(path).then(()=>true,()=>false);
const wait=async(predicate,message,timeout=35000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error(message)};
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
async function fixture(name){
 const base=join(project,'.local/restart-worker-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,name+'-'));
 const profile=join(root,'profile'),data=join(profile,'TS6-Layout'),client=join(profile,'Programs/TeamSpeak'),pkg=join(data,'app');
 for(const path of [join(client,'TS6-Enhanced'),join(pkg,'scripts'),join(data,'updates')])await mkdir(path,{recursive:true});
 await writeFile(join(root,'fixture-only'),'isolated');await writeFile(join(root,'mode.txt'),'success');await writeFile(join(root,'client-mode.txt'),'normal');await writeFile(join(root,'ignore-exit.txt'),'true');
 await copyFile(clientFixture,join(client,'TeamSpeak.exe'));
 for(const name of ['Restart-Update','Native-Setup','Runtime','Maintenance'])await copyFile(join(project,`scripts/${name}.ps1`),join(pkg,`scripts/${name}.ps1`));
 await writeFile(join(pkg,'release.json'),JSON.stringify({version:'2.2.0'}));
 await writeFile(join(client,'version.dll'),'old DLL');await writeFile(join(client,'TS6-Enhanced/marker.txt'),'old payload');
 await writeFile(join(data,'native-install.json'),JSON.stringify({owner:'ts6-enhanced-native-v1',version:'2.2.0',directory:join(client,'TS6-Enhanced'),dll:join(client,'version.dll'),dllHash:await hash(join(client,'version.dll')),files:[{path:'marker.txt',sha256:await hash(join(client,'TS6-Enhanced/marker.txt'))}]}));
 const installer=join(data,'updates/TS6-Enhanced-2.2.1-Setup.exe');await copyFile(installerFixture,installer);
 const pending={schema:2,mode:'next-launch',fromVersion:'2.2.0',version:'2.2.1',path:installer,sha256:await hash(installer)};
 const queue=()=>writeFile(join(data,'pending-update.json'),JSON.stringify(pending));await queue();
 const env={...process.env,LOCALAPPDATA:profile,TSIX_STARTUP_TEST_ROOT:root,TSIX_NATIVE_TOKEN:'a'.repeat(64),TSIX_NATIVE_ENDPOINT:'fixture-only'};delete env.TSIX_OPERATION_TOKEN;delete env.TSIX_SKIP_STARTUP_RETRY;
 const journal=createSessionJournal(data,{protect:(path,value)=>writeFile(path,value,{flag:'wx'}),unprotect:path=>readFile(path,'utf8')});
 const snapshot={schema:1,build:1791901251,capturedAt:Date.now(),workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1},defaults:{inputMuted:false,outputMuted:false},closePolicy:{ignoreExit:true},activeServer:'',captureServer:'',connections:[]};
 let sessionId=await journal.save(snapshot,pending.version);
 const old=spawn(join(client,'TeamSpeak.exe'),[],{windowsHide:true,stdio:'ignore',env});old.on('error',()=>{});
 await wait(()=>exists(join(root,'ready-'+old.pid+'.txt')),'Isolated client did not become ready');
 const run=async({beforeClose,session=sessionId}={})=>{
  try{return await runRestartWorker({project:pkg,root:data,env,sessionId:session,beforeClose:async()=>{
   assert.equal(await exists(join(root,'installer-pid.txt')),false,'Installer cannot run before final commit');
   if(beforeClose)await beforeClose();
   await writeFile(join(root,'ignore-exit.txt'),'false');await journal.arm(sessionId);
  }})}catch(error){await writeFile(join(root,'ignore-exit.txt'),'true');throw error}
 };
 const opened=async()=>readFile(join(root,'reopened.txt'),'utf8').then(text=>text.trim().split('\n').filter(Boolean).map(Number),()=>[]);
 const clean=async()=>{
  for(const name of await readdir(root)){const match=/^client-(\d+)\.json$/.exec(name);if(match)await writeFile(join(root,'exit-'+match[1]+'.txt'),'finish')}
  await writeFile(join(root,'mode.txt'),'success');
  await wait(async()=>!(await opened()).some(alive)&&!alive(old.pid),'Fixture clients did not exit',5000);
 };
 return {root,data,client,pkg,env,pending,journal,queue,run,opened,old,sessionId,clean};
}
async function scenario(name,body){const f=await fixture(name);try{await body(f)}finally{await f.clean()}}
await scenario('success',async f=>{
 let before=false;await f.run({beforeClose:async()=>{before=true;assert.equal(alive(f.old.pid),true);assert.equal((await readFile(join(f.root,'ignore-exit.txt'),'utf8')),'true')}});
 assert.ok(before);await wait(async()=>(await f.opened()).length===1,'Client did not reopen');
 const pid=(await f.opened())[0];assert.ok(alive(pid),'Worker must finish while the reopened GUI client is still alive');assert.equal(alive(f.old.pid),false);
 assert.equal(await exists(join(f.data,'pending-update.json')),false);assert.equal(await readFile(join(f.client,'version.dll'),'utf8'),'new DLL');
 const record=JSON.parse(await readFile(join(f.root,'client-'+pid+'.json'),'utf8'));assert.equal(record.skip,'1');assert.equal(record.token,null);assert.equal(record.endpoint,null);assert.equal(record.operation,null);assert.ok(record.stderr===0||record.stderr===-1);
 assert.match(await readFile(join(f.root,'installer-arguments.txt'),'utf8'),/TSIXDEFERRED=1/);assert.match(await readFile(join(f.root,'installer-arguments.txt'),'utf8'),/TSIXNOOPEN=1/);
 checks.push('Actual worker commits after verification, exits a Hide-on-Close GUI stand-in, verifies installation and reopens once without leaking standard handles or capabilities');
});
await scenario('changed-session',async f=>{
 await assert.rejects(f.run({beforeClose:async()=>{await new Promise(resolve=>setTimeout(resolve,150));throw Error('Session changed during worker startup')}}),/Session changed/);
 assert.ok(alive(f.old.pid));assert.equal(await exists(join(f.root,'close-requests.txt')),false);assert.equal(await exists(join(f.root,'installer-pid.txt')),false);assert.deepEqual(await f.opened(),[]);
 checks.push('Rejected final snapshot leaves the original client running without any close or install');
});
await scenario('parent-disconnect',async f=>{
 const worker=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(f.pkg,'scripts/Restart-Update.ps1'),'-SessionId',f.sessionId],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:f.data,env:f.env});
 worker.stderr.resume();let output='';worker.stdout.on('data',chunk=>output+=chunk);const done=once(worker,'close');
 await wait(()=>output.includes('ready'),'Worker did not reach its commit boundary');worker.stdin.end();
 const [code]=await done;assert.notEqual(code,0);assert.ok(alive(f.old.pid));assert.equal(await exists(join(f.root,'close-requests.txt')),false);assert.equal(await exists(join(f.root,'installer-pid.txt')),false);
 checks.push('Parent EOF before commit cannot close the client or start installation');
});
await scenario('concurrent-workers',async f=>{
 let release,ready=false;const gate=new Promise(resolve=>release=resolve);
 const first=f.run({beforeClose:async()=>{ready=true;await gate}});first.catch(()=>{});
 try{
  await wait(()=>ready,'First worker did not acquire its lease');
  await assert.rejects(f.run(),/Another TS6 Enhanced operation/);assert.ok(alive(f.old.pid));assert.equal(await exists(join(f.root,'installer-pid.txt')),false);
 }finally{release()}
 await first;await wait(async()=>(await f.opened()).length===1,'Committed worker did not reopen');
 assert.equal((await readFile(join(f.root,'attempts.txt'),'utf8')).trim().split('\n').length,1);
 checks.push('An independent concurrent worker cannot enter the held restart transaction or duplicate installation');
});
await scenario('invalid-hash',async f=>{
 f.pending.sha256='0'.repeat(64);await f.queue();let committed=false;
 await assert.rejects(f.run({beforeClose:async()=>{committed=true}}),/checksum changed/);assert.equal(committed,false);assert.ok(alive(f.old.pid));assert.equal(await exists(join(f.root,'close-requests.txt')),false);
 checks.push('Invalid installer hash is rejected before requesting final commit or closing the client');
});
for(const mode of ['fail','no-install'])await scenario(mode,async f=>{
 await writeFile(join(f.root,'mode.txt'),mode);await assert.rejects(f.run(),mode==='fail'?/17/:/expected native installation receipt/);
 await wait(async()=>(await f.opened()).length===1,'Failed installation did not reopen the existing client');
 assert.ok(alive((await f.opened())[0]));assert.equal(await exists(join(f.data,'pending-update.json')),true);
 checks.push(mode==='fail'?'Installer failure retains the queue and reopens once':'An unverified zero exit cannot clear the queue; the existing client still reopens');
});
await scenario('interrupted',async f=>{
 await writeFile(join(f.root,'mode.txt'),'hold');const running=f.run();running.catch(()=>{});
 await wait(()=>exists(join(f.root,'installer-pid.txt')),'Installer stand-in did not start');
 // This PID is produced only by the executable copied into this fixture root.
 const pid=Number(await readFile(join(f.root,'installer-pid.txt'),'utf8'));process.kill(pid);
 await assert.rejects(running,/Queued update failed/);await wait(async()=>(await f.opened()).length===1,'Interrupted update did not reopen');
 assert.equal(await exists(join(f.data,'pending-update.json')),true);assert.ok(alive((await f.opened())[0]));
 checks.push('Terminating the disposable installer preserves the queue and reopens the previous client');
});
await scenario('refused-close',async f=>{
 await writeFile(join(f.root,'client-mode.txt'),'refuse');await assert.rejects(f.run(),/TeamSpeak is still running/);
 assert.ok(alive(f.old.pid));assert.equal(await exists(join(f.root,'installer-pid.txt')),false);assert.deepEqual(await f.opened(),[]);
 checks.push('A refused shutdown times out without force-killing, installing or launching a duplicate client');
});
console.log(JSON.stringify({result:'PASS',checks,scope:'Unmodified production restart worker, lifecycle lease, queued installer application and relaunch; disposable off-screen GUI client and installer only'},null,2));
