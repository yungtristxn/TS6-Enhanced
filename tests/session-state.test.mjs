import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat,unlink} from 'node:fs/promises';import {join,resolve} from 'node:path';import {spawn} from 'node:child_process';
import {createSessionJournal,validateSessionSnapshot} from '../tools/session-state.mjs';
export const emptySnapshot=()=>({schema:1,build:1791901251,capturedAt:Date.now(),workflow:{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1},defaults:{inputMuted:false,outputMuted:false},activeServer:'',captureServer:'',connections:[]});
function withDrafts(){
 const snapshot=emptySnapshot();
 snapshot.connections=[{key:'server|identity',serverUid:'server',selfUid:'own-user',channelId:'7',channelPassword:'channel-secret',connectInfo:{address:'fixture.invalid',port:9987,identity:'identity',server_password:'server-secret'},voice:{inputMuted:false,outputMuted:false,inputDeactivated:false,away:false,awayMessage:''},outbound:[],inbound:[]}];
 snapshot.drafts=[{connectionKey:'server|identity',chatKey:'7',content:'First unsent draft'},{connectionKey:'server|identity',chatKey:'8',content:'Second unsent draft'}];
 return snapshot;
}
async function fixture(options={}){
 const base=resolve(import.meta.dirname,'../.local/session-state-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'recovery-'));
 const dependencies={protect:(path,text)=>writeFile(path,text,{flag:'wx'}),unprotect:path=>readFile(path,'utf8'),...options};
 return {root,journal:createSessionJournal(root,dependencies),fresh:()=>createSessionJournal(root,dependencies)};
}
test('resume journal is one-use, expires, rejects stale completion and validates bounded state',async()=>{
 const base=resolve(import.meta.dirname,'../.local/session-state-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'journal-'));let clock=1000;
 const journal=createSessionJournal(root,{now:()=>clock,protect:(path,text)=>writeFile(path,text),unprotect:path=>readFile(path,'utf8')});
 const snapshot=emptySnapshot(),id=await journal.save(snapshot,'2.2.1');
 await assert.rejects(journal.save(snapshot,'2.2.1'),/still pending/);await journal.arm(id);
 assert.equal((await journal.load()).restoreSession,true);
 assert.equal((await journal.load()).restoreSession,false,'A restarted host must not replay automatic capture/unmute after a partial restoration');
 assert.equal(await journal.clear('wrong'),false);assert.equal(await journal.clear(id),true);
 const next=await journal.save(snapshot,'2.2.1');await journal.arm(next);clock+=11*60*1000;assert.equal((await journal.load()).restoreSession,false);await journal.clear(next);
 assert.throws(()=>validateSessionSnapshot({...snapshot,connections:Array(9).fill({})}),/Invalid/);
 assert.throws(()=>validateSessionSnapshot({...snapshot,build:1}),/Invalid/);
});

test('retained offline drafts do not occupy the next update transaction and partial recovery is durable',async()=>{
 let now=1000;const f=await fixture({now:()=>now}),snapshot=withDrafts();
 const old=await f.journal.save(snapshot,'2.2.1');await f.journal.arm(old);await f.journal.load();
 now+=24*60*60*1000;
 const next=await f.journal.save(emptySnapshot(),'2.2.2');assert.notEqual(next,old);
 let recovery=await f.fresh().loadDrafts();assert.equal(recovery.length,1);
 assert.equal(recovery[0].draftOnly,true);assert.equal(recovery[0].restoreSession,false);
 assert.equal(recovery[0].snapshot.connections[0].connectInfo.server_password,undefined);
 assert.equal(recovery[0].snapshot.connections[0].channelPassword,'');
 assert.deepEqual(recovery[0].snapshot.drafts,snapshot.drafts);
 assert.deepEqual(recovery[0].draftIndices,[0,1]);
 await assert.rejects(f.journal.acknowledgeDrafts(old,[2]),/Invalid/);
 assert.equal(await f.journal.acknowledgeDrafts(old,[0]),false);
 recovery=await f.fresh().loadDrafts();assert.deepEqual(recovery[0].snapshot.drafts,[snapshot.drafts[1]]);assert.deepEqual(recovery[0].draftIndices,[1]);
 assert.equal(JSON.parse(await readFile(join(f.root,'update-session.json'),'utf8')).id,next);
 assert.equal(await f.journal.acknowledgeDrafts(old,[1]),true);assert.equal(await f.journal.acknowledgeDrafts(old,[1]),true);
 assert.deepEqual(await f.fresh().loadDrafts(),[]);
});

test('retention archives only unfinished drafts and serializes concurrent acknowledgements',async()=>{
 const f=await fixture(),snapshot=withDrafts();
 const first=await f.journal.save(snapshot,'2.2.1');await f.journal.arm(first);await f.journal.load();
 await f.journal.retainDrafts(first,[0]);
 assert.deepEqual((await f.journal.loadDrafts())[0].snapshot.drafts,[snapshot.drafts[1]]);
 const next=await f.journal.save(snapshot,'2.2.2');await f.journal.arm(next);await f.journal.load();await f.journal.retainDrafts(next,[]);
 await Promise.all([f.journal.acknowledgeDrafts(next,[0]),f.journal.acknowledgeDrafts(next,[1])]);
 assert.deepEqual((await f.journal.loadDrafts()).map(record=>record.id),[first]);
});

test('cleanup recovers from interruption before either unlink and from legacy data-first deletion',async t=>{
 for(const failAt of ['update-session.bin','update-session.json'])await t.test(failAt,async()=>{
  let failed=false;const f=await fixture({remove:async path=>{if(path.endsWith(failAt)&&!failed){failed=true;throw Error('Injected interruption')}await unlink(path)}});
  const id=await f.journal.save(emptySnapshot(),'2.2.1');
  await assert.rejects(f.journal.clear(id),/Injected/);
  assert.equal(JSON.parse(await readFile(join(f.root,'update-session.json'),'utf8')).phase,'clearing');
  assert.equal(await f.fresh().load(),null);await f.fresh().save(emptySnapshot(),'2.2.2');
 });
 const f=await fixture();await f.journal.save(emptySnapshot(),'2.2.1');await unlink(join(f.root,'update-session.bin'));
 assert.equal(await f.fresh().load(),null);await f.fresh().save(emptySnapshot(),'2.2.2');
});

test('an interruption while releasing the update journal preserves the independent encrypted recovery copy',async()=>{
 let failed=false;const f=await fixture({remove:async path=>{if(path===join(f.root,'update-session.json')&&!failed){failed=true;throw Error('Injected interruption')}await unlink(path)}});
 const snapshot=withDrafts(),id=await f.journal.save(snapshot,'2.2.1');await f.journal.arm(id);await f.journal.load();
 await assert.rejects(f.journal.retainDrafts(id,[]),/Injected/);
 assert.equal(await f.fresh().load(),null);
 assert.deepEqual((await f.fresh().loadDrafts())[0].snapshot.drafts,snapshot.drafts);
 await f.fresh().save(emptySnapshot(),'2.2.2');
});

test('interrupted archive cleanup is reconciled without replaying acknowledged drafts',async()=>{
 let failed=false;const f=await fixture({remove:async path=>{if(path.includes('draft-recovery')&&path.endsWith('.json')&&!failed){failed=true;throw Error('Injected interruption')}await unlink(path)}});
 const id=await f.journal.save(withDrafts(),'2.2.1');await f.journal.arm(id);await f.journal.load();await f.journal.retainDrafts(id,[]);
 await assert.rejects(f.journal.acknowledgeDrafts(id,[0,1]),/Injected/);
 assert.deepEqual(await f.fresh().loadDrafts(),[]);
 await f.fresh().save(emptySnapshot(),'2.2.2');
});
test('Windows DPAPI stores reconnect credentials encrypted and validates the round-trip',{skip:process.platform!=='win32'},async()=>{
 const base=resolve(import.meta.dirname,'../.local/session-state-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'dpapi-'));
 const invoke=(action,path,input='')=>new Promise((done,reject)=>{
  const child=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(import.meta.dirname,'../scripts/Session-State.ps1'),'-Action',action,'-Path',path],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);child.once('error',reject);child.once('close',code=>code===0?done(out):reject(Error(err)));child.stdin.end(input);
 });
 const journal=createSessionJournal(root,{protect:(path,text)=>invoke('Protect',path,text),unprotect:path=>invoke('Unprotect',path)});
 const snapshot=emptySnapshot();snapshot.connections.push({key:'server|identity',serverUid:'server',selfUid:'own-user',channelId:'7',channelPassword:'fixture-channel-secret',connectInfo:{address:'fixture.invalid',port:9987,server_password:'fixture-server-secret'},voice:{inputMuted:false,outputMuted:false,inputDeactivated:false,away:false,awayMessage:'Grüße 🎮'},outbound:[],inbound:[]});
 snapshot.drafts=[{connectionKey:'server|identity',chatKey:'7',content:'Unsent Grüße 🎮'}];
 const id=await journal.save(snapshot,'2.2.1');const encrypted=await readFile(join(root,'update-session.bin'));
 assert.equal(encrypted.includes(Buffer.from('fixture-server-secret')),false);assert.equal(encrypted.includes(Buffer.from('fixture.invalid')),false);
 await journal.arm(id);assert.deepEqual((await journal.load()).snapshot,snapshot);
 await journal.retainDrafts(id,[]);
 const archive=await readFile(join(root,'draft-recovery',id+'.bin'));
 assert.deepEqual(archive,encrypted,'Retention copies protected bytes without plaintext materialization on disk');
 const drafts=await journal.loadDrafts();assert.deepEqual(drafts[0].snapshot.drafts,snapshot.drafts);
 assert.equal(drafts[0].snapshot.connections[0].connectInfo.server_password,undefined);
 assert.equal(await journal.acknowledgeDrafts(id,[0]),true);
 assert.deepEqual(await journal.loadDrafts(),[]);
 await assert.rejects(stat(join(root,'update-session.bin')),/ENOENT/);
});
