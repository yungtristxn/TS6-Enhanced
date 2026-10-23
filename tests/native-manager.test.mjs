import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from 'ws';
import {createNativeManager} from '../tools/native-manager.mjs';

test('native management rejects untrusted requests and preserves the first recovery baseline',async()=>{
  const root=await mkdtemp(join(tmpdir(),'tsix-native-test-')),token='b'.repeat(64),actions=[];
  const release={version:'1.1.0',updates:{repository:''}};
  const host=await createNativeManager({token,release,root,client:root,applyMaintenance:async action=>actions.push(action)});
  const connect=(origin='tsui://default',key=token)=>new Promise((resolve,reject)=>{
    const socket=new WebSocket(`ws://127.0.0.1:${host.port}`,`tsix.v1.${key}`,{headers:{Origin:origin}});
    socket.once('open',()=>resolve(socket));socket.once('error',reject);
  });
  let socket,sequence=0;
  try{
    await assert.rejects(connect('https://example.com'),/401/);
    await assert.rejects(connect('tsui://default','c'.repeat(64)),/401/);
    socket=await connect();
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
    assert.deepEqual(JSON.parse(await readFile(join(root,'before-install.json'),'utf8')),baseline);
    assert.equal((await request('/style-result',{id:'old',applied:true})).ok,false);
    await request('/action',{action:'uninstall'});
    assert.deepEqual(actions,['uninstall']);
  }finally{socket?.terminate();await host.close();await rm(root,{recursive:true,force:true})}
});
