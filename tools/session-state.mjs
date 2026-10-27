// One-use update-resume journal. Session contents are encrypted by the Windows
// helper; metadata contains only transaction/version/expiry information.
import {stat,unlink,mkdir,readdir,copyFile,rename,readFile,open} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicJSON,readJSON,plainPath} from './install-state.mjs';
const fail=()=>{throw Error('Invalid update session snapshot')};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=2048)=>typeof value==='string'&&value.length<=max&&!value.includes('\0');
const bool=value=>typeof value==='boolean';
const scalar=value=>value===null||bool(value)||typeof value==='number'&&Number.isFinite(value)||text(value,4096);
export function validateSessionSnapshot(value){
 if(!object(value)||value.schema!==1||value.build!==1791901251||!Number.isSafeInteger(value.capturedAt)||!Array.isArray(value.connections)||value.connections.length>8||!object(value.workflow)||!bool(value.workflow.restoreOpenedActivities)||![0,1,2].includes(value.workflow.autoConnectSkipActivityCheck)||!object(value.defaults)||!bool(value.defaults.inputMuted)||!bool(value.defaults.outputMuted)||!text(value.activeServer,512)||!text(value.captureServer,512))fail();
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>65536)fail();
 if(value.closePolicy!==undefined&&(!object(value.closePolicy)||!bool(value.closePolicy.ignoreExit)||Object.keys(value.closePolicy).some(key=>key!=='ignoreExit')))fail();
 if(value.drafts!==undefined&&(!Array.isArray(value.drafts)||value.drafts.length>32||value.drafts.some(d=>!object(d)||!text(d.connectionKey,512)||!text(d.chatKey,512)||JSON.stringify(d.content??null).length>16384)))fail();
 if(value.views!==undefined&&(!Array.isArray(value.views)||value.views.length>8||value.views.some(view=>!object(view)||!text(view.connectionKey,512)||!text(view.channelId,64)||!object(view.focus)||!['inbound','outbound'].includes(view.focus.direction)||!text(view.focus.id,512)||view.focus.direction==='outbound'&&![1,2,3].includes(view.focus.type))))fail();
 const keys=new Set();
 for(const connection of value.connections){
  if(!object(connection)||!text(connection.key,512)||!connection.key||keys.has(connection.key)||!text(connection.serverUid,512)||!connection.serverUid||!text(connection.channelId,64)||!/^\d+$/.test(connection.channelId)||!object(connection.connectInfo)||!text(connection.connectInfo.address)||!Number.isInteger(connection.connectInfo.port)||connection.connectInfo.port<1||connection.connectInfo.port>65535||!text(connection.channelPassword)||!object(connection.voice)||!Array.isArray(connection.outbound)||connection.outbound.length>8||!Array.isArray(connection.inbound)||connection.inbound.length>16)fail();
  if(!text(connection.selfUid,512)||!connection.selfUid)fail();
  keys.add(connection.key);
  const fields=new Set(['address','port','nickname','phonetic_nickname','identity','server_password','default_channel','default_channel_password','default_channel_id','sound_pack','show_serverquery_clients','send_mytsid','announce_to_chat','connect_muted','uuid']);
  if(Object.entries(connection.connectInfo).some(([key,v])=>!fields.has(key)||!scalar(v)))fail();
  if(Object.keys(connection.voice).some(key=>!['inputMuted','outputMuted','inputDeactivated','away','awayMessage'].includes(key))||!['inputMuted','outputMuted','inputDeactivated','away'].every(key=>bool(connection.voice[key]))||!text(connection.voice.awayMessage))fail();
  for(const stream of connection.outbound){
   if(!object(stream)||!object(stream.source)||![1,2,3].includes(stream.source.type)||!text(stream.source.id,512)||!text(stream.source.name)||!object(stream.catalogue)||!text(stream.catalogue.id,512)||!text(stream.catalogue.title)||!bool(stream.paused)||!bool(stream.hidden)||!object(stream.config)||!object(stream.quality))fail();
   if(Object.keys(stream.quality).some(key=>!['width','height','fps','bitrate','audioBitrate','cameraHeight','cameraWidth'].includes(key))||Object.values(stream.quality).some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e9))fail();
   if(Object.keys(stream.config).some(key=>!['bitrate','access','mode','viewerLimit','audio','appAudio','name','type'].includes(key)))fail();
   if(!bool(stream.config.audio)||![1,2,3].includes(stream.config.access)||![1,2].includes(stream.config.mode)||!Number.isFinite(stream.config.bitrate)||!Number.isFinite(stream.config.viewerLimit))fail();
   if(stream.config.appAudio!==undefined){const audio=stream.config.appAudio;if(!object(audio)||![0,1,2].includes(audio.scope)||!Array.isArray(audio.entries)||audio.entries.length>64||!Number.isFinite(audio.masterGain??1)||audio.entries.some(e=>!object(e)||!text(e.identity)||!Number.isFinite(e.gain)||e.captured!==undefined&&!bool(e.captured)))fail()}
  }
  for(const stream of connection.inbound)if(!object(stream)||!text(stream.id,512)||!stream.id||!text(stream.ownerUid,512)||!stream.ownerUid||!bool(stream.hidden)||!bool(stream.muted)||typeof stream.volume!=='number'||!Number.isFinite(stream.volume)||stream.volume<0||stream.volume>3)fail();
 }
 return value;
}
export function createSessionJournal(root,{protect,unprotect,now=Date.now,remove=unlink}){
 const metadata=join(root,'update-session.json'),dataPath=join(root,'update-session.bin');
 const recoveryRoot=join(root,'draft-recovery'),uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
 let active=null,recoveryWrite=Promise.resolve();
 const serialize=operation=>{const next=recoveryWrite.then(operation);recoveryWrite=next.catch(()=>{});return next};
 const exists=path=>stat(path).then(()=>true,error=>{if(error.code!=='ENOENT')throw error;return false});
 const discard=path=>remove(path).catch(error=>{if(error.code!=='ENOENT')throw error});
 const validateEntry=entry=>{
  if(entry?.schema!==1||!uuid.test(entry.id)||!['captured','armed','restoring','drafts','clearing'].includes(entry.phase))throw Error('Invalid update session journal');
  return entry;
 };
 const readEntry=async(meta,data)=>{
  await plainPath(meta);await plainPath(data);
  const entry=await readJSON(meta).catch(error=>{if(error.code!=='ENOENT')throw error;return null});
  if(!entry)return null;
  validateEntry(entry);
  // Complete an interrupted deletion, including the legacy data-first order.
  if(entry.phase==='clearing'||!await exists(data)){await discard(data);await discard(meta);return null}
  return entry;
 };
 const clearEntry=async(meta,data,entry)=>{
  await atomicJSON(meta,{...entry,phase:'clearing'});
  await discard(data);await discard(meta);
 };
 const decrypt=async path=>{
  await plainPath(path);
  const decrypted=JSON.parse(await unprotect(path));
  const payload=typeof decrypted.payload==='string'?JSON.parse(decrypted.payload):decrypted;
  return {snapshot:validateSessionSnapshot(payload.snapshot)};
 };
 const recoveryPaths=id=>{if(!uuid.test(id))throw Error('Invalid draft recovery ID');return [join(recoveryRoot,id+'.json'),join(recoveryRoot,id+'.bin')]};
 const validateIndices=(indices,snapshot)=>{
  if(!Array.isArray(indices)||indices.length>32||new Set(indices).size!==indices.length||indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=(snapshot.drafts||[]).length))throw Error('Invalid draft recovery acknowledgement');
 };
 const journal={
  async save(snapshot,targetVersion){
   validateSessionSnapshot(snapshot);if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion))throw Error('Invalid update version');
   const old=await readEntry(metadata,dataPath);
   if(old?.phase==='restoring')await journal.retainDrafts(old.id,[]);
   else if(old)throw Error('Previous update session recovery is still pending');
   const entry={schema:1,id:randomUUID(),targetVersion,createdAt:now(),expiresAt:now()+10*60*1000,phase:'captured'};
   await plainPath(dataPath);
   if(await stat(dataPath).then(()=>true,e=>{if(e.code!=='ENOENT')throw e;return false})){
    // A crash after encryption but before publishing metadata cannot have
    // armed a restart. Remove only a decryptable, owned orphan snapshot.
    const orphan=JSON.parse(await unprotect(dataPath));validateSessionSnapshot((typeof orphan.payload==='string'?JSON.parse(orphan.payload):orphan).snapshot);await unlink(dataPath);
   }
   await protect(dataPath,JSON.stringify({snapshot}));
   try{await atomicJSON(metadata,entry)}catch(error){await unlink(dataPath).catch(()=>{});throw error}
   active=entry;return entry.id;
  },
  async arm(id){if(!active||active.id!==id)throw Error('Stale update session');active={...active,phase:'armed'};await atomicJSON(metadata,active)},
  async load(){
   const entry=await readEntry(metadata,dataPath);if(!entry)return null;
   if(!Number.isSafeInteger(entry.expiresAt))throw Error('Invalid update session journal');
   const payload=await decrypt(dataPath);
   const restoreSession=entry.phase==='armed'&&entry.expiresAt>=now();
   active={...entry,phase:'restoring'};await atomicJSON(metadata,active);
   return{id:entry.id,restoreSession,...payload};
  },
  async clear(id){
   const current=await readEntry(metadata,dataPath);if(current?.id!==id)return false;
   await clearEntry(metadata,dataPath,current);active=null;return true;
  },
  async retainDrafts(id,recovered){
   return serialize(async()=>{
    const entry=await readEntry(metadata,dataPath);if(entry?.id!==id)throw Error('Stale update session');
    const {snapshot}=await decrypt(dataPath);validateIndices(recovered,snapshot);
    const pending=(snapshot.drafts||[]).map((_,index)=>index).filter(index=>!recovered.includes(index));
    if(pending.length){
     const [meta,data]=recoveryPaths(id);await plainPath(recoveryRoot);await mkdir(recoveryRoot,{recursive:true});await plainPath(data);
     // Publish a complete encrypted copy before releasing the update journal.
     // A retry after interruption keeps any already acknowledged draft indices.
     const existing=await readEntry(meta,data);
     if(existing&&(existing.id!==id||existing.phase!=='drafts'))throw Error('Invalid draft recovery journal');
     if(!await exists(data)){
      const temporary=data+'.'+randomUUID()+'.tmp';
      try{
       await copyFile(dataPath,temporary);
       const file=await open(temporary,'r+');try{await file.sync()}finally{await file.close()}
       await rename(temporary,data);
      }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error})}
     }else if(!(await readFile(data)).equals(await readFile(dataPath)))throw Error('Conflicting draft recovery data');
     if(!existing)await atomicJSON(meta,{schema:1,id,phase:'drafts',pending});
    }
    await journal.clear(id);
   });
  },
  async loadDrafts(){
   await recoveryWrite;await plainPath(recoveryRoot);
   const files=await readdir(recoveryRoot).catch(error=>{if(error.code!=='ENOENT')throw error;return []}),records=[];
   for(const file of files.sort()){
    if(!file.endsWith('.json')||!uuid.test(file.slice(0,-5)))continue;
    const id=file.slice(0,-5),[meta,data]=recoveryPaths(id),entry=await readEntry(meta,data);if(!entry)continue;
    if(entry.id!==id||entry.phase!=='drafts')throw Error('Invalid draft recovery journal');
    const {snapshot}=await decrypt(data);validateIndices(entry.pending,snapshot);
    const drafts=entry.pending.map(index=>snapshot.drafts[index]);
    // These jobs can only recover text. No reconnect credentials or media are
    // delivered from an archived update snapshot to a later renderer.
    const connections=snapshot.connections.filter(connection=>drafts.some(draft=>draft.connectionKey===connection.key)).map(connection=>({...connection,channelPassword:'',connectInfo:{address:connection.connectInfo.address,port:connection.connectInfo.port,identity:connection.connectInfo.identity||''},outbound:[],inbound:[]}));
    records.push({id,draftOnly:true,restoreSession:false,draftIndices:entry.pending,snapshot:{...snapshot,connections,drafts,views:[],activeServer:'',captureServer:''}});
   }
   return records;
  },
  async acknowledgeDrafts(id,recovered){
   return serialize(async()=>{
    const [meta,data]=recoveryPaths(id),entry=await readEntry(meta,data);if(!entry)return true;
    if(entry.id!==id||entry.phase!=='drafts')throw Error('Invalid draft recovery journal');
    const {snapshot}=await decrypt(data);validateIndices(recovered,snapshot);validateIndices(entry.pending,snapshot);
    const pending=entry.pending.filter(index=>!recovered.includes(index));
    if(pending.length)await atomicJSON(meta,{...entry,pending});else await clearEntry(meta,data,entry);
    return pending.length===0;
   });
  },
  async windowMatches(source){
   if(!active||active.phase!=='restoring'||!text(source,512))return false;
   const decrypted=JSON.parse(await unprotect(dataPath));return decrypted.windowMatches?.[source]===true;
  }
 };
 return journal;
}
