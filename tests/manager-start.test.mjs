import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {claimManager} from '../tools/manager-lock.mjs';import {readJSON} from '../tools/install-state.mjs';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {maintainSession} from '../tools/managed-session.mjs';
import {EventEmitter} from 'node:events';

test('manager exclusion is kernel-owned, ignores incomplete legacy PID files and waits for readiness',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tsix-manager-'));
 for(const old of ['', '  ', String(process.pid), '2147483647']){
  await writeFile(join(root,'manager.lock'),old);
  const owner=await claimManager(root);
  try{
   assert.equal(owner.owner,true);
   const contender=claimManager(root);let finished=false;contender.then(()=>finished=true);
   await new Promise(r=>setTimeout(r,100));assert.equal(finished,false);
   owner.setState({status:'ready'});assert.equal((await contender).owner,false);
  }finally{await owner.close()}
 }
 const owner=await claimManager(root);owner.setState({status:'failed',message:'fixture failure'});
 try{await assert.rejects(claimManager(root),/fixture failure/)}finally{await owner.close()}
});

test('manager ownership is released when its process is terminated',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tsix-manager-crash-'));
 const source=`import {claimManager} from ${JSON.stringify(new URL('../tools/manager-lock.mjs',import.meta.url).href)};const owner=await claimManager(process.argv[1]);owner.setState({status:'ready'});console.log('ready');`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,root],{stdio:['ignore','pipe','inherit'],windowsHide:true});
 try{
  await once(child.stdout,'data');assert.equal((await claimManager(root)).owner,false);
  const exited=once(child,'exit');child.kill();await exited;
  const replacement=await claimManager(root);assert.equal(replacement.owner,true);await replacement.close();
 }finally{if(child.exitCode===null)child.kill()}
});

test('runtime receipts written by Windows PowerShell 5.1 remain readable; malformed JSON fails',async()=>{
 const path=join(await mkdtemp(join(tmpdir(),'tsix-runtime-')),'runtime.json'),runtime={node:'C:\\node.exe',pwsh:'C:\\pwsh.exe'};
 await writeFile(path,'\uFEFF'+JSON.stringify(runtime));assert.deepEqual(await readJSON(path),runtime);
 await writeFile(path,'\uFEFF{');await assert.rejects(readJSON(path),SyntaxError);
});

test('manager recovery stops on client exit and never retries listener trust failures',async()=>{
 const events=new EventEmitter(),states=[];let opens=0,attaches=0;
 const c={on(name,callback){events.on(name,callback);return()=>events.off(name,callback)},onClose(callback){events.once('close',callback)},close(){events.emit('close')},
  async send(method){if(method==='Runtime.enable')events.emit('Runtime.executionContextCreated',{context:{id:7,origin:'tsui://default',auxData:{isDefault:true,frameId:'main'}}});if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main'}}}}
 };
 await maintainSession({open:async()=>{if(++opens===1)return c;throw Object.assign(Error('Client closed'),{code:'TSIX_NO_LISTENER'})},attach:async(client,id)=>{assert.equal(id,7);attaches++},
  onState(state){states.push(state.status);if(state.status==='ready')queueMicrotask(()=>events.emit('close'))},retryMs:1});
 assert.equal(opens,2);assert.equal(attaches,1);assert.deepEqual(states,['starting','ready','recovering','stopped']);
 let unsafeAttempts=0;
 await assert.rejects(maintainSession({open:async()=>{unsafeAttempts++;throw Error('Non-loopback listener refused')},attach:async()=>assert.fail('Unsafe attachment')}),/Non-loopback/);
 assert.equal(unsafeAttempts,1);
});
