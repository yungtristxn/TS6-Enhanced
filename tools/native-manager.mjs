// Updater transport for the native DLL. No CDP connection or launcher ownership.
import {createServer} from 'node:http';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {WebSocketServer,WebSocket} from 'ws';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createUpdateSession,displayVersion} from './updates.mjs';
import {atomicJSON,readJSON,plainPath,stateRoot,validateBaseline} from './install-state.mjs';
import {createSessionJournal,validateSessionSnapshot} from './session-state.mjs';

// The worker holds the lifecycle lease and validates the installer before the
// renderer commits shutdown. It must never treat a spawned process as consent.
export async function runRestartWorker({project,root,env=process.env,sessionId,beforeClose}){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sessionId)||typeof beforeClose!=='function')throw Error('Invalid restart handoff');
  const powershell=join(env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script=join(project,'scripts/Restart-Update.ps1');await plainPath(script);
  return new Promise((resolve,reject)=>{
    const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-SessionId',sessionId],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:root,env});
    let ready=false,ended=false,line='',detail='',failure=null;
    const timer=setTimeout(()=>{failure=Error('Restart worker did not become ready');child.kill()},20000);
    child.stdin.on('error',()=>{});
    child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{detail=(detail+chunk).slice(-8192)});
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(ready)return;line+=chunk;
      if(line.length>64){failure=Error('Invalid restart worker response');child.kill();return}
      if(!line.includes('\n'))return;
      if(line.trim()!=='ready'){failure=Error('Invalid restart worker response');child.kill();return}
      ready=true;clearTimeout(timer);
      void Promise.resolve().then(beforeClose).then(()=>{
        if(!ended)child.stdin.end('commit\n');
      },error=>{failure=error;if(!ended)child.stdin.end('cancel\n')});
    });
    child.once('error',error=>{ended=true;clearTimeout(timer);reject(error)});
    child.once('close',(code,signal)=>{
      ended=true;clearTimeout(timer);
      if(failure)reject(failure);
      else if(code===0&&ready)resolve();
      else reject(Error('Restart worker failed ('+(signal||code)+'). '+detail.trim()));
    });
  });
}

export async function createNativeManager({token,release,root,client,applyMaintenance,journal=null,fetcher=fetch,onStatus=async()=>{}}) {
  if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Invalid native session token');
  let busy=false,closing=false,revision=0,started=false,pendingReady=null,sessionJob=null,resumeLoaded=false,restorationWarning='';
  const passiveRecovery=new Set(),completedRecovery=new Set();
  const validateResult=result=>{
    if(!result||typeof result.preferencesRestored!=='boolean'||typeof result.draftsRestored!=='boolean'||!Array.isArray(result.warnings)||result.warnings.some(value=>typeof value!=='string'||value.length>512)||!Array.isArray(result.recoveredDrafts)||result.recoveredDrafts.some(index=>!Number.isSafeInteger(index)||index<0||index>=32))throw Error('Invalid session restoration result');
    return result;
  };
  let state={version:displayVersion(release.version),configured:!!release.updates?.repository,restartRestore:true,busy:false,available:null,message:'Checking for updates…'};
  const sockets=new WebSocketServer({noServer:true,maxPayload:98304,perMessageDeflate:false});
  const send=(socket,value)=>{if(socket.readyState!==WebSocket.OPEN)return;if(socket.bufferedAmount>4*1024*1024){socket.terminate();return}socket.send(JSON.stringify(value));};
  const publish=patch=>{state={...state,...patch,busy};if(restorationWarning&&!busy){state.message='Update completed with session-restoration issues.';state.detail=restorationWarning}revision++;for(const socket of sockets.clients)send(socket,snapshot());};
  const snapshot=()=>({revision,state,session:sessionJob?{id:sessionJob.id,stage:sessionJob.stage,payload:sessionJob.payload}:null});
  const sessionRequest=(stage,payload=null)=>new Promise((resolve,reject)=>{
    if(sessionJob){reject(Error('Another session operation is active'));return}
    const job={id:randomUUID(),stage,payload,finish(result,error){
      if(sessionJob!==job)return;clearTimeout(job.timer);sessionJob=null;publish({});
      error?reject(Error(String(error).slice(0,256))):resolve(result);
    }};
    sessionJob=job;job.timer=setTimeout(()=>job.finish(null,'TeamSpeak did not finish saving or restoring the session'),stage==='restore'?180000:stage==='prepare'?30000:20000);publish({});
  });
  const updates=await createUpdateSession(release,client,root,{fetcher});
  publish(updates.snapshot());
  const finishOperation=()=>{
    busy=false;publish({});
    if(pendingReady&&!closing){
      const {baseline}=pendingReady;pendingReady=null;
      void begin(baseline).catch(error=>publish({detail:error.message}));
    }
  };
  const check=async()=>{
    if(busy||closing||!state.configured)return;
    busy=true;publish({message:'Checking for updates…',detail:null});
    try{publish(await updates.check());await onStatus({checkedAt:new Date().toISOString(),updateError:null})}
    catch(e){publish({...updates.snapshot(),message:'Couldn’t check for updates. Try again.',detail:e.message});await onStatus({updateError:e.message}).catch(()=>{})}
    finally{finishOperation()}
  };
  const begin=async baseline=>{
    if(closing)return;
    // Reattachment must not interrupt a download/check/restore operation.
    if(busy){pendingReady={baseline};return}
    busy=true;publish({});
    try{
      if(!started){
        try{validateBaseline(baseline);await atomicJSON(join(root,'before-install.json'),baseline,{exclusive:true});}
        catch(e){if(e.code!=='EEXIST'){publish({message:'Appearance recovery could not be saved.',detail:e.message});return}}
        started=true;
      }
      if(closing)return;
      await onStatus({uiReady:true});
      if(closing)return;
      if(journal&&!resumeLoaded){
        resumeLoaded=true;
        try{
          const saved=await journal.load();
          if(saved){
            publish({message:'Restoring your previous session…',detail:null});
            const result=validateResult(await sessionRequest('restore',saved));
            restorationWarning=result.warnings.join('\n');
            // Persist the outcome, never the snapshot, so a normal relaunch can
            // be diagnosed without a debugger or exposing reconnect credentials.
            await onStatus({sessionRestore:{at:new Date().toISOString(),automaticAttempted:saved.restoreSession,warnings:result.warnings,preferencesRestored:result.preferencesRestored,draftsRestored:result.draftsRestored}});
            if(result.preferencesRestored&&result.draftsRestored)await journal.clear(saved.id);
            else if(result.preferencesRestored)await journal.retainDrafts(saved.id,result.recoveredDrafts);
          }
          for(const draft of await journal.loadDrafts()){
            passiveRecovery.add(draft.id);
            const result=validateResult(await sessionRequest('restore',draft));
            if(await journal.acknowledgeDrafts(draft.id,result.recoveredDrafts)){passiveRecovery.delete(draft.id);completedRecovery.add(draft.id)}
          }
          if(passiveRecovery.size&&!restorationWarning.includes('Unsent drafts remain encrypted'))restorationWarning+='\nUnsent drafts remain encrypted for recovery and will return when their original servers reconnect.';
        }catch(error){restorationWarning='Session restoration could not finish. '+String(error.message).slice(0,256)}
        finally{publish({sessionRecoveryDone:true})}
      }
    }finally{finishOperation()}
    await check();
  };
  const action=async(action,baseline)=>{
    if(action==='ready'){await begin(baseline);return}
    if(action==='check'){await check();return}
    if(busy||closing)return;
    busy=true;publish({message:action==='update'?'Checking for the latest release…':'Removing TS6 Enhanced…',detail:null});
    try{
      if(action==='update'){
        if(!journal)throw Error('Session restoration is unavailable; repair the installation before updating');
        const downloaded=await updates.download(update=>publish({message:'Downloading version '+displayVersion(update.version)+'…'}));
        publish(downloaded);
        const queued=updates.queued();
        if(journal&&downloaded.restartReady&&queued){
          publish({message:'Saving your current session…'});
          const saved=validateSessionSnapshot(await sessionRequest('capture'));
          const id=await journal.save(saved,queued.version);
          try{
            await applyMaintenance('update',{sessionId:id,beforeClose:async()=>{
              const prepared=await sessionRequest('prepare',saved);
              if(prepared?.ok!==true)throw Error('TeamSpeak did not confirm restart preparation');
              await journal.arm(id);
              publish({message:'Restarting TeamSpeak and applying the update…'});
            }});
          }catch(error){
            if(!closing){try{await sessionRequest('cancel',saved);await journal.clear(id)}catch{}}
            throw error;
          }
        }
      }else await applyMaintenance('uninstall');
    }catch(e){publish({message:action==='update'?'Update stopped. Your session was kept where possible.':'Uninstall stopped. Try again.',detail:e.message})}
    finally{finishOperation()}
  };
  const server=createServer((request,response)=>{response.writeHead(404);response.end()});
  server.on('upgrade',(request,socket,head)=>{
    const supplied=Buffer.from(String(request.headers['sec-websocket-protocol']||'')),expected=Buffer.from(`tsix.v1.${token}`);
    if(closing||request.url!=='/'||request.headers.origin!=='tsui://default'||sockets.clients.size>=4||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;
    }
    sockets.handleUpgrade(request,socket,head,ws=>sockets.emit('connection',ws));
  });
  sockets.on('connection',socket=>{
    send(socket,snapshot());socket.on('error',()=>{});
    socket.on('message',(bytes,binary)=>{
    let id;
    try{
      if(binary)throw Error('Binary requests refused');
      const request=JSON.parse(bytes.toString('utf8'));id=request.id;
      if(!Number.isSafeInteger(id)||id<0||!request.data||Object.keys(request).some(k=>!['id','path','data'].includes(k)))throw Error('Invalid request');
      const data=request.data;
      if(request.path==='/session-recovered'){
        if(!journal||typeof data.id!=='string'||!Array.isArray(data.indices)||data.indices.length>32||data.indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=32)||Object.keys(data).some(key=>!['id','indices'].includes(key)))throw Error('Stale draft recovery completion');
        if(completedRecovery.has(data.id)){send(socket,{reply:id,ok:true});return}
        if(!passiveRecovery.has(data.id))throw Error('Stale draft recovery completion');
        void journal.acknowledgeDrafts(data.id,data.indices).then(complete=>{
          if(complete){passiveRecovery.delete(data.id);completedRecovery.add(data.id)}
          if(!passiveRecovery.size)restorationWarning=restorationWarning.split('\n').filter(line=>!line.startsWith('Unsent drafts remain encrypted')).join('\n');
          publish({message:'Unsent drafts recovered.',detail:null});send(socket,{reply:id,ok:true});
        },()=>send(socket,{reply:id,ok:false,error:'Recovery completion could not be saved'}));return;
      }
      if(request.path==='/session-window'){
        if(!journal||sessionJob?.stage!=='restore'||data.id!==sessionJob.id||typeof data.source!=='string'||data.source.length>512||Object.keys(data).some(key=>!['id','source'].includes(key)))throw Error('Stale source-validation request');
        void journal.windowMatches(data.source).then(value=>send(socket,{reply:id,ok:true,value}),()=>send(socket,{reply:id,ok:true,value:false}));return;
      }
      if(request.path==='/session-result'){
        if(!sessionJob||data.id!==sessionJob.id||Object.keys(data).some(key=>!['id','result','error'].includes(key)))throw Error('Stale session response');
        sessionJob.finish(data.result,data.error);send(socket,{reply:id,ok:true});return;
      }
      if(request.path!=='/action'||!['ready','check','update','uninstall'].includes(data.action)||Object.keys(data).some(k=>k!=='action'&&(k!=='baseline'||data.action!=='ready')))throw Error('Invalid action');
      send(socket,{reply:id,ok:true});void action(data.action,data.baseline).catch(e=>publish({detail:e.message}));
    }catch(e){send(socket,{reply:Number.isSafeInteger(id)?id:null,ok:false,error:e.message})}
    });
  });
  server.requestTimeout=10000;server.headersTimeout=5000;server.maxHeadersCount=16;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const timer=setInterval(()=>void check(),Math.max(1,release.updates?.checkIntervalHours||6)*3600000);timer.unref();
  return {port:server.address().port,async close(){closing=true;pendingReady=null;clearInterval(timer);sessionJob?.finish(null,'Client closed during session recovery');for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})}};
}

async function main(){
  const project=fileURLToPath(new URL('../',import.meta.url)),root=stateRoot();
  const release=await readJSON(join(project,'release.json'));
  const client=resolve(project,'..'),token=process.env.TSIX_NATIVE_TOKEN;
  let status={schema:1,mode:'native',pid:process.pid,version:release.version,startedAt:new Date().toISOString(),uiReady:false,checkedAt:null};
  let maintenance=null;
  const onStatus=async patch=>{status={...status,...patch};await atomicJSON(join(root,'native-session.json'),status)};
  // Children spawned for maintenance must not inherit a usable UI capability.
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['TSIX_NATIVE_TOKEN','TSIX_NATIVE_ENDPOINT','TSIX_OPERATION_TOKEN'].includes(key.toUpperCase())));
  const launch=async(file,args)=>{
    await plainPath(file);if(!(await stat(file)).isFile())throw Error('Maintenance executable is missing');
    // A successful spawn is not a completed handoff. On Windows the worker can
    // die with this host; keep its process referenced until maintenance ends.
    await new Promise((resolve,reject)=>{
      const child=spawn(file,args,{windowsHide:true,stdio:['ignore','ignore','pipe'],cwd:root,env});
      let detail='';child.stderr.on('data',chunk=>{detail=(detail+chunk.toString()).slice(-8192)});
      child.once('error',reject);
      child.once('close',(code,signal)=>code===0?resolve():reject(Error(`Maintenance failed (${signal||code}). ${detail.trim()}`.trim())));
    });
  };
  await onStatus({});
  const protectedState=(action,path,input='')=>new Promise((resolve,reject)=>{
    const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
    const child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Session-State.ps1'),'-Action',action,'-Path',path],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:root,env});
    const timer=setTimeout(()=>{child.kill();reject(Error('Protected session storage timed out'))},20000);
    let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000)child.kill()});child.stderr.resume();
    child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('Protected session storage is unavailable'))});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
  const journal=release.updates?.sessionRestore===1?createSessionJournal(root,{protect:(path,value)=>protectedState('Protect',path,value),unprotect:path=>protectedState('Unprotect',path)}):null;
  const host=await createNativeManager({token,release,root,client,onStatus,journal,applyMaintenance:async(action,handoff)=>{
    if(action==='update'){
      const operation=runRestartWorker({project,root,env,...handoff});
      maintenance=operation;try{await operation}finally{if(maintenance===operation)maintenance=null}
      return;
    }
    if(action==='uninstall'){
      const operation=launch(join(root,'app','unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART']);
      maintenance=operation;
      try{await operation}finally{if(maintenance===operation)maintenance=null}
    }
  }});
  process.stdout.write(`${host.port}\n`);
  process.stdin.resume();
  process.stdin.once('end',async()=>{
    let pending=null;
    try{
      await host.close();
      // Uninstall closes TeamSpeak itself. Let it finish rather than killing
      // its worker or starting a queued update at the same time.
      if(maintenance){await maintenance;return}
      pending=await readJSON(join(root,'pending-update.json')).catch(()=>null);
      if(pending&&[pending.fromVersion,pending.version].includes(release.version)){
        const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
        await launch(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Native-Setup.ps1'),'-Action','ApplyPending']);
      }
    }catch(e){await atomicJSON(join(root,'native-error.json'),{at:new Date().toISOString(),message:e.message,
      ...(pending&&[pending.fromVersion,pending.version].includes(release.version)?{update:{version:pending.version,sha256:pending.sha256}}:{})}).catch(()=>{})}
    finally{process.exit()}
  });
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
  main().catch(async e=>{await atomicJSON(join(stateRoot(),'native-error.json'),{at:new Date().toISOString(),message:e.message}).catch(()=>{});process.exitCode=1});
}
