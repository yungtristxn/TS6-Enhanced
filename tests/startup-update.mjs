import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,writeFile,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve,join} from 'node:path';
const [clientFixture,installerFixture]=process.argv.slice(2),project=resolve(import.meta.dirname,'..');
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const wait=async(predicate,message)=>{
 const end=Date.now()+45000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,50))}throw Error(message);
};
const exists=path=>stat(path).then(()=>true,()=>false);
const checks=[];
async function fixture(name){
 const base=join(project,'.local/startup-update-tests');await mkdir(base,{recursive:true});
 const root=await mkdtemp(join(base,name+'-')),profile=join(root,'profile'),data=join(profile,'TS6-Layout'),client=join(profile,'Programs/TeamSpeak'),pkg=join(data,'app');
 for(const path of [join(client,'TS6-Enhanced'),join(pkg,'scripts'),join(data,'updates')])await mkdir(path,{recursive:true});
 await writeFile(join(root,'fixture-only'),'isolated');await writeFile(join(root,'mode.txt'),'success');
 await copyFile(clientFixture,join(client,'TeamSpeak.exe'));
 for(const name of ['Startup-Update','Native-Setup','Runtime','Maintenance'])await copyFile(join(project,`scripts/${name}.ps1`),join(pkg,`scripts/${name}.ps1`));
 await writeFile(join(pkg,'release.json'),JSON.stringify({version:'2.1.4'}));
 await writeFile(join(client,'version.dll'),'old DLL');await writeFile(join(client,'TS6-Enhanced/marker.txt'),'old payload');
 await writeFile(join(data,'native-install.json'),JSON.stringify({owner:'ts6-enhanced-native-v1',version:'2.1.3',directory:join(client,'TS6-Enhanced'),dll:join(client,'version.dll'),dllHash:await hash(join(client,'version.dll')),files:[{path:'marker.txt',sha256:await hash(join(client,'TS6-Enhanced/marker.txt'))}]}));
 const installer=join(data,'updates/TS6-Enhanced-2.1.4-Setup.exe');await copyFile(installerFixture,installer);
 const pending={schema:2,mode:'next-launch',fromVersion:'2.1.3',version:'2.1.4',path:installer,sha256:await hash(installer)};
 const queue=()=>writeFile(join(data,'pending-update.json'),JSON.stringify(pending));
 const launch=async(args=[])=>{
  const child=spawn(join(client,'TeamSpeak.exe'),args,{windowsHide:true,stdio:'ignore',env:{...process.env,LOCALAPPDATA:profile,TSIX_STARTUP_TEST_ROOT:root,TSIX_STARTUP_TEST_RECORD:join(root,'opened.txt')}});
  const [code]=await once(child,'exit',{signal:AbortSignal.timeout(25000)});assert.equal(code,0);return child;
 };
 return{root,data,client,pkg,pending,queue,launch,opened:()=>readFile(join(root,'opened.txt'),'utf8').then(s=>s.replace(/\r\n/g,'\n'),()=>''),attempts:()=>readFile(join(root,'attempts.txt'),'utf8').then(s=>s.trim().split('\n').length,()=>0)};
}
{
 const f=await fixture('no-queue');await f.launch(['normal']);assert.equal(await f.opened(),'opened\nnormal\nskip=\n');assert.equal(await f.attempts(),0);checks.push('No queue opens normally without an installer');
}
{
 const f=await fixture('success');await f.queue();
 const args=['ts3server://fixture.invalid/?name=Example User','quoted "text"','C:\\folder with spaces\\','äöß',''];
 await f.launch(args);await wait(async()=>!!await f.opened(),'Verified update did not resume the launch');
 assert.equal(await f.opened(),['opened',...args,'skip=',''].join('\n'));
 assert.equal(await f.attempts(),1);assert.equal(await readFile(join(f.client,'version.dll'),'utf8'),'new DLL');assert.equal(await exists(join(f.data,'pending-update.json')),false);
 const flags=await readFile(join(f.root,'installer-arguments.txt'),'utf8');assert.match(flags,/TSIXDEFERRED=1/);assert.match(flags,/TSIXNOOPEN=1/);
 checks.push('Production native gate and PowerShell worker apply the queued target, verify it, clear the queue and preserve URI/Unicode/quoted/empty arguments');
}
{
 const f=await fixture('interrupted');await f.queue();await writeFile(join(f.root,'mode.txt'),'hold');await f.launch();
 await wait(()=>exists(join(f.root,'installer-pid.txt')),'Fixture installer never started');
 const pid=Number(await readFile(join(f.root,'installer-pid.txt'),'utf8'));process.kill(pid);
 await wait(async()=>!!await f.opened(),'Interrupted installer did not reopen the previous client');
 assert.equal(await f.attempts(),1);assert.equal(await exists(join(f.data,'pending-update.json')),true);assert.equal(await readFile(join(f.client,'version.dll'),'utf8'),'old DLL');
 const failure=JSON.parse(await readFile(join(f.data,'native-error.json'),'utf8'));assert.equal(failure.phase,'startup-retry');
 await writeFile(join(f.root,'opened.txt'),'');await writeFile(join(f.root,'mode.txt'),'success');await f.launch();await wait(async()=>!!await f.opened(),'Next launch did not retry');
 assert.equal(await f.attempts(),2);assert.equal(await exists(join(f.data,'pending-update.json')),false);assert.equal(await readFile(join(f.client,'version.dll'),'utf8'),'new DLL');
 checks.push('Terminating the isolated installer preserves the queue, opens the old client once, and retries successfully on the next independent launch');
}
for(const kind of ['hash','path','base']){
 const f=await fixture('invalid-'+kind);if(kind==='hash')f.pending.sha256='0'.repeat(64);if(kind==='path')f.pending.path=installerFixture;if(kind==='base')f.pending.fromVersion='9.0.0';
 await f.queue();await f.launch();assert.ok(await f.opened());assert.equal(await f.attempts(),0);assert.equal(await exists(join(f.data,'pending-update.json')),true);checks.push(`Invalid ${kind} is refused before closing the startup client`);
}
{
 const f=await fixture('unverified-success');await f.queue();await writeFile(join(f.root,'mode.txt'),'no-install');await f.launch();
 await wait(async()=>!!await f.opened(),'Unverified installer result did not resume the old client');
 assert.equal(await f.attempts(),1);assert.equal(await exists(join(f.data,'pending-update.json')),true);
 const failure=JSON.parse(await readFile(join(f.data,'native-error.json'),'utf8'));assert.match(failure.message,/expected native installation receipt/);
 checks.push('Installer exit code zero cannot clear the queue without the expected installed version and file hashes');
}
{
 const f=await fixture('concurrent');await f.queue();await writeFile(join(f.root,'mode.txt'),'hold');await f.launch();await wait(()=>exists(join(f.root,'installer-pid.txt')),'Fixture installer never started');
 await f.launch(['second']);assert.equal(await f.attempts(),1);assert.ok((await f.opened()).includes('second'));
 await writeFile(join(f.root,'mode.txt'),'success');await wait(async()=>!await exists(join(f.data,'pending-update.json')),'First retry never completed');
 checks.push('Concurrent launch cannot start a second installer while the lifecycle lease is held');
}
console.log(JSON.stringify({result:'PASS',checks,scope:'Production startup gate and scripts with disposable native client/installer fixtures; real TeamSpeak untouched'},null,2));
