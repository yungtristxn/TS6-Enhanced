import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from 'ws';
import {createNativeManager} from '../tools/native-manager.mjs';

test('native management rejects untrusted requests and preserves the first recovery baseline',async()=>{
  const root=await mkdtemp(join(tmpdir(),'tsix-native-test-')),token='b'.repeat(64),actions=[];
  let readyCount=0,currentState;
  const release={version:'1.1.0',updates:{repository:''}};
  const host=await createNativeManager({token,release,root,client:root,applyMaintenance:async action=>actions.push(action),onStatus:async patch=>{if(patch.uiReady)readyCount++}});
  const connect=(origin='tsui://default',key=token)=>new Promise((resolve,reject)=>{
    const socket=new WebSocket(`ws://127.0.0.1:${host.port}`,`tsix.v1.${key}`,{headers:{Origin:origin}});
    socket.once('open',()=>resolve(socket));socket.once('error',reject);
  });
  let socket,sequence=0;
  try{
    await assert.rejects(connect('https://example.com'),/401/);
    await assert.rejects(connect('tsui://default','c'.repeat(64)),/401/);
    socket=await connect();
    socket.on('message',bytes=>{const value=JSON.parse(bytes);if(value.state)currentState=value.state});
    const request=(path,data)=>new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>reject(Error('Reply timed out')),2000);
      const listener=bytes=>{const value=JSON.parse(bytes);if(value.reply===id){clearTimeout(timer);socket.off('message',listener);resolve(value)}};
      socket.on('message',listener);socket.send(JSON.stringify({id,path,data}));
    });
    assert.equal((await request('/action',{action:'execute',path:'anything'})).ok,false);
    assert.deepEqual(actions,[]);
    const baseline={schema:1,owner:'tsix-install-baseline',appearance:{user_style:null,tree_compact:false},storage:{'tsix.layout.chatVisible':null,'tsix.layout.streamTrayCollapsed':'true'}};
    assert.equal((await request('/action',{action:'ready',baseline})).ok,true);
    let saved;
    for(let i=0;i<50&&!saved;i++){saved=await readFile(join(root,'before-install.json'),'utf8').catch(()=>null);if(!saved)await new Promise(r=>setTimeout(r,10))}
    assert.deepEqual(JSON.parse(saved),baseline);
    await request('/action',{action:'ready',baseline:{...baseline,appearance:{user_style:'another//theme'}}});
    for(let i=0;i<100&&(readyCount<2||currentState?.busy!==false);i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(readyCount,2);assert.equal(currentState?.busy,false);
    assert.deepEqual(JSON.parse(await readFile(join(root,'before-install.json'),'utf8')),baseline);
    assert.equal((await request('/style-result',{id:'old',applied:true})).ok,false);
    await request('/action',{action:'uninstall'});
    assert.deepEqual(actions,['uninstall']);
  }finally{socket?.terminate();await host.close();await rm(root,{recursive:true,force:true})}
});

test('repeated renderer readiness waits for the active appearance restore',async()=>{
  const root=await mkdtemp(join(tmpdir(),'tsix-ready-test-')),token='d'.repeat(64);
  const css=':root{--tsix-layout-version:1.1.1}',liveUpdate={schema:1,runtimeHash:'a'.repeat(64)};
  const release={version:'1.1.0',updates:{repository:''},liveUpdate};
  await writeFile(join(root,'pending-update.json'),JSON.stringify({schema:2,mode:'next-launch',fromVersion:release.version,version:'1.1.1',liveUpdate,
    liveStyles:{...liveUpdate,version:'1.1.1',themeVersion:'1.1.1',css,sha256:createHash('sha256').update(css).digest('hex')}}));
  const host=await createNativeManager({token,release,root,client:root,applyMaintenance:async()=>{throw Error('No maintenance expected')}});
  const socket=new WebSocket(`ws://127.0.0.1:${host.port}`,`tsix.v1.${token}`,{headers:{Origin:'tsui://default'}});
  const jobs=[];let sequence=0;
  socket.on('message',bytes=>{const value=JSON.parse(bytes);if(value.style&&!jobs.some(job=>job.id===value.style.id))jobs.push(value.style)});
  const request=(path,data)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{socket.off('message',listener);reject(Error('Reply timed out'))},2000);
    const listener=bytes=>{const value=JSON.parse(bytes);if(value.reply===id){clearTimeout(timer);socket.off('message',listener);resolve(value)}};
    socket.on('message',listener);socket.send(JSON.stringify({id,path,data}));
  });
  const waitForJobs=async count=>{for(let i=0;i<100&&jobs.length<count;i++)await new Promise(r=>setTimeout(r,10));assert.equal(jobs.length,count)};
  const baseline={schema:1,owner:'tsix-install-baseline',appearance:{user_style:null},storage:{'tsix.layout.chatVisible':null,'tsix.layout.streamTrayCollapsed':null}};
  try{
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
    await request('/action',{action:'ready',baseline});await waitForJobs(1);
    await request('/action',{action:'ready',baseline});
    await request('/action',{action:'ready',baseline});
    assert.equal((await request('/style-result',{id:jobs[0].id,applied:true})).ok,true,'Readiness must not cancel an in-flight style job');
    await waitForJobs(2);
    assert.equal(jobs[1].css,css);
    assert.equal((await request('/style-result',{id:jobs[1].id,applied:true})).ok,true);
    assert.deepEqual(JSON.parse(await readFile(join(root,'before-install.json'),'utf8')),baseline);
  }finally{socket.terminate();await host.close();await rm(root,{recursive:true,force:true})}
});
