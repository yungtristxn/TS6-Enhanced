import {readFile,open,unlink,mkdir,stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect} from './cdp.mjs';
import {atomicJSON,captureBaseline,stateRoot,plainPath} from './install-state.mjs';
import {checkUpdate,compatible,stageUpdate} from './updates.mjs';
const root=stateRoot(),project=fileURLToPath(new URL('../',import.meta.url)),lock=join(root,'manager.lock');
await plainPath(root);await mkdir(root,{recursive:true});
let lockFile;
try{lockFile=await open(lock,'wx');await lockFile.writeFile(String(process.pid))}catch(error){
  if(error.code!=='EEXIST')throw error;
  const pid=Number(await readFile(lock,'utf8'));let alive=true;try{process.kill(pid,0)}catch{alive=false}
  if(alive)process.exit(0);
  await unlink(lock);lockFile=await open(lock,'wx');await lockFile.writeFile(String(process.pid));
}
let c,timer;const nonce=randomBytes(24).toString('hex');let busy=false,update=null;
try{
  const release=JSON.parse(await readFile(join(project,'release.json'),'utf8'));
  const runtime=JSON.parse(await readFile(join(root,'install-runtime.json'),'utf8'));
  c=await connect();
  const disconnected=new Promise(resolve=>c.onClose(resolve));
  const build=await c.evaluate('new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)))');
  if(build!==release.supportedClient.build)throw Error('Unsupported TeamSpeak build; maintenance UI was not attached');
  const baseline=await captureBaseline(c);
  let state={version:release.version,configured:!!release.updates?.repository,legacy:baseline.legacy,busy:false,available:null,detail:null,message:release.updates?.repository?'Checking for updates…':'Updates aren’t available in this preview.'};
  const publish=async(patch={})=>{state={...state,...patch,busy};await c.evaluate(`window.__tsixManager?.setState(${JSON.stringify(state)},${JSON.stringify(nonce)})`)};
  const ui=await readFile(join(project,'tools/manager-runtime.js'),'utf8');
  let contextId;
  c.on('Runtime.executionContextCreated',({context})=>{if(context.origin==='tsui://default'&&context.auxData?.isDefault)contextId=context.id});
  await c.send('Runtime.enable');
  if(!contextId)throw Error('Main renderer context not found');
  await c.send('Runtime.addBinding',{name:'__tsixMaintenanceRequest',executionContextId:contextId});
  await c.evaluate(ui);
  // The profile/settings button can be unmounted by native navigation. Load
  // its existing artwork locally so our entry never depends on that DOM node.
  const settingsIcon=await readFile(join(process.env.LOCALAPPDATA,'Programs/TeamSpeak/html/client_ui/images/icons/settings.svg'),'utf8');
  await c.evaluate(`window.__tsixManager.setIcon(${JSON.stringify(settingsIcon)})`);
  await publish();
  const check=async()=>{
    if(busy||!release.updates?.repository)return;
    busy=true;await publish({message:'Checking for updates…',detail:null});
    try{
      update=await checkUpdate(release.version,release.updates);
      if(update&&!await compatible(update,join(process.env.LOCALAPPDATA,'Programs/TeamSpeak'))){update=null;await publish({available:null,message:'This update needs a different TeamSpeak version.'})}
      else await publish({available:update?.version||null,message:update?`Version ${update.version} is available.`:'You’re up to date.'});
    }catch(e){update=null;await publish({available:null,message:'Couldn’t check for updates. Try again.',detail:e.message})}
    finally{busy=false;await publish()}
  };
  const launch=(exe,args,action)=>{
    const child=spawn(exe,args,{windowsHide:true,detached:true,stdio:'ignore'});
    child.on('error',e=>{busy=false;publish({message:`${action} couldn’t start. Try again.`,detail:e.message}).catch(()=>{})});
    child.on('exit',async code=>{if(code){busy=false;const detail=await readFile(join(root,'setup-logs/maintenance-error.txt'),'utf8').catch(()=>`Setup exited with code ${code}`);publish({message:`${action} stopped. Try again.`,detail:detail.trim()}).catch(()=>{})}});
    child.unref();
  };
  c.on('Runtime.bindingCalled',async event=>{
    if(event.name!=='__tsixMaintenanceRequest'||event.executionContextId!==contextId||event.payload.length>512||busy)return;
    let request;try{request=JSON.parse(event.payload)}catch{return}
    if(request.nonce!==nonce||!['check','update','uninstall'].includes(request.action))return;
    if(request.action==='check'){await check();return}
    busy=true;await publish({message:request.action==='update'?'Downloading update…':'Removing TS6 Enhanced…',detail:null});
    try{
      if(request.action==='update'){
        if(!update)throw Error('Check for updates first');
        if(!await compatible(update,join(process.env.LOCALAPPDATA,'Programs/TeamSpeak')))throw Error('TeamSpeak changed; this update is no longer compatible');
        const path=await stageUpdate(update,join(root,'updates'));
        await atomicJSON(join(root,'pending-update.json'),{schema:1,path,version:update.version,sha256:update.installer.sha256,resourceHashes:update.manifest.supportedClient.resourceHashes});
        await publish({message:'Restarting TeamSpeak…'});
        launch(runtime.pwsh,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Maintenance.ps1'),'-Action','Update'],'Update');
      }else{
        const uninstall=join(root,'app','unins000.exe');await plainPath(uninstall);
        if(await stat(uninstall).catch(()=>null))launch(uninstall,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],'Uninstall');
        else launch(runtime.pwsh,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Maintenance.ps1'),'-Action','Remove','-NodePath',process.execPath,'-Restart'],'Uninstall');
      }
    }catch(e){busy=false;await publish({message:request.action==='update'?'Update stopped. Try again.':'Uninstall stopped. Try again.',detail:e.message})}
  });
  await check();timer=setInterval(()=>check().catch(()=>{}),Math.max(1,release.updates?.checkIntervalHours||6)*3600000);
  await disconnected;
}catch(e){await atomicJSON(join(root,'manager-error.json'),{at:new Date().toISOString(),message:e.message})}
finally{clearInterval(timer);c?.close();await lockFile?.close();await unlink(lock).catch(()=>{})}
