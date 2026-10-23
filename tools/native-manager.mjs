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

export async function createNativeManager({token,release,root,client,applyMaintenance,fetcher=fetch,onStatus=async()=>{}}) {
  if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Invalid native session token');
  let busy=false,closing=false,revision=0,started=false,styleJob=null;
  let state={version:displayVersion(release.version),configured:!!release.updates?.repository,legacy:false,busy:false,available:null,message:'Checking for updates…'};
  const sockets=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const send=(socket,value)=>{if(socket.readyState!==WebSocket.OPEN)return;if(socket.bufferedAmount>4*1024*1024){socket.terminate();return}socket.send(JSON.stringify(value));};
  const publish=patch=>{state={...state,...patch,busy};revision++;for(const socket of sockets.clients)send(socket,snapshot());};
  const snapshot=()=>({revision,state,style:styleJob?{id:styleJob.id,css:styleJob.css,themeVersion:styleJob.themeVersion}:null});
  const updates=await createUpdateSession(release,client,root,{fetcher,applyStyles:(css,themeVersion)=>new Promise(resolve=>{
    styleJob?.finish(false);
    const job={id:randomUUID(),css,themeVersion,finish(value){if(styleJob!==job)return;clearTimeout(job.timer);styleJob=null;publish({});resolve(value)}};
    styleJob=job;job.timer=setTimeout(()=>job.finish(false),10000);publish({});
  })});
  publish(updates.snapshot());
  const check=async()=>{
    if(busy||closing||!state.configured)return;
    busy=true;publish({message:'Checking for updates…',detail:null});
    try{publish(await updates.check());await onStatus({checkedAt:new Date().toISOString(),updateError:null})}
    catch(e){publish({...updates.snapshot(),message:'Couldn’t check for updates. Try again.',detail:e.message});await onStatus({updateError:e.message}).catch(()=>{})}
    finally{busy=false;publish({})}
  };
  const begin=async baseline=>{
    if(!started){
      try{validateBaseline(baseline);await atomicJSON(join(root,'before-install.json'),baseline,{exclusive:true});}
      catch(e){if(e.code!=='EEXIST'){publish({message:'Appearance recovery could not be saved.',detail:e.message});return}}
      started=true;
    }
    await onStatus({uiReady:true});
    try{publish(await updates.restore({reset:true}))}catch(e){publish({detail:e.message})}
    await check();
  };
  const action=async(action,baseline)=>{
    if(action==='ready'){await begin(baseline);return}
    if(action==='check'){await check();return}
    if(busy||closing)return;
    busy=true;publish({message:action==='update'?'Checking for the latest release…':'Removing TS6 Enhanced…',detail:null});
    try{
      if(action==='update')publish(await updates.download(update=>publish({message:`Downloading version ${displayVersion(update.version)}…`})));
      else await applyMaintenance('uninstall');
    }catch(e){publish({message:action==='update'?'Update stopped. Try again.':'Uninstall stopped. Try again.',detail:e.message})}
    finally{busy=false;publish({})}
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
      if(request.path==='/style-result'){
        if(typeof data.applied!=='boolean'||data.id!==styleJob?.id)throw Error('Stale appearance update');
        styleJob.finish(data.applied);send(socket,{reply:id,ok:true});return;
      }
      if(request.path!=='/action'||!['ready','check','update','uninstall'].includes(data.action)||Object.keys(data).some(k=>k!=='action'&&(k!=='baseline'||data.action!=='ready')))throw Error('Invalid action');
      send(socket,{reply:id,ok:true});void action(data.action,data.baseline).catch(e=>publish({detail:e.message}));
    }catch(e){send(socket,{reply:Number.isSafeInteger(id)?id:null,ok:false,error:e.message})}
    });
  });
  server.requestTimeout=10000;server.headersTimeout=5000;server.maxHeadersCount=16;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const timer=setInterval(()=>void check(),Math.max(1,release.updates?.checkIntervalHours||6)*3600000);timer.unref();
  return {port:server.address().port,async close(){closing=true;clearInterval(timer);styleJob?.finish(false);for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})}};
}

async function main(){
  const project=fileURLToPath(new URL('../',import.meta.url)),root=stateRoot();
  const release=await readJSON(join(project,'release.json'));
  const client=resolve(project,'..'),token=process.env.TSIX_NATIVE_TOKEN;
  let status={schema:1,mode:'native',pid:process.pid,version:release.version,startedAt:new Date().toISOString(),uiReady:false,checkedAt:null};
  const onStatus=async patch=>{status={...status,...patch};await atomicJSON(join(root,'native-session.json'),status)};
  // Children spawned for maintenance must not inherit a usable UI capability.
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['TSIX_NATIVE_TOKEN','TSIX_NATIVE_ENDPOINT','TSIX_OPERATION_TOKEN'].includes(key.toUpperCase())));
  const launch=async(file,args)=>{
    await plainPath(file);if(!(await stat(file)).isFile())throw Error('Maintenance executable is missing');
    await new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore',cwd:root,env});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})});
  };
  await onStatus({});
  const host=await createNativeManager({token,release,root,client,onStatus,applyMaintenance:async action=>{
    if(action==='uninstall')await launch(join(root,'app','unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART']);
  }});
  process.stdout.write(`${host.port}\n`);
  process.stdin.resume();
  process.stdin.once('end',async()=>{
    try{
      await host.close();
      const pending=await readJSON(join(root,'pending-update.json')).catch(()=>null);
      if(pending?.fromVersion===release.version){
        const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
        await launch(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Native-Setup.ps1'),'-Action','ApplyPending']);
      }
    }catch(e){await atomicJSON(join(root,'native-error.json'),{at:new Date().toISOString(),message:e.message}).catch(()=>{})}
    finally{process.exit()}
  });
}
if(process.argv[1]&&resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()){
  main().catch(async e=>{await atomicJSON(join(stateRoot(),'native-error.json'),{at:new Date().toISOString(),message:e.message}).catch(()=>{});process.exitCode=1});
}
