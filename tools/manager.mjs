import {readFile,mkdir,stat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect} from './cdp.mjs';
import {atomicJSON,readJSON,captureBaseline,stateRoot,plainPath} from './install-state.mjs';
import {claimManager} from './manager-lock.mjs';
import {checkUpdate,compatible,stageUpdate,displayVersion} from './updates.mjs';
const root=stateRoot(),project=fileURLToPath(new URL('../',import.meta.url));
const readyIndex=process.argv.indexOf('--ready-file'),readyFile=readyIndex<0?null:process.argv[readyIndex+1];
const report=async value=>{if(readyFile)await atomicJSON(readyFile,value)};
await plainPath(root);await mkdir(root,{recursive:true});
let c,timer,claim;const nonce=randomBytes(24).toString('hex');let busy=false,update=null;
try{
  claim=await claimManager(root);
  if(!claim.owner){await report({status:'ready'});process.exit(0)}
  const release=JSON.parse(await readFile(join(project,'release.json'),'utf8'));
  const runtime=await readJSON(join(root,'install-runtime.json'));
  if(!['node','pwsh'].every(k=>typeof runtime[k]==='string'&&isAbsolute(runtime[k])))throw Error('Invalid maintenance runtime receipt. Run setup again to repair it.');
  c=await connect();
  const disconnected=new Promise(resolve=>c.onClose(resolve));
  const build=await c.evaluate('new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)))');
  if(build!==release.supportedClient.build)throw Error('Unsupported TeamSpeak build; maintenance UI was not attached');
  const baseline=await captureBaseline(c);
  let state={version:displayVersion(release.version),configured:!!release.updates?.repository,legacy:baseline.legacy,busy:false,available:null,detail:null,message:release.updates?.repository?'Checking for updates…':'Updates aren’t configured.'};
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
      else await publish({available:update?displayVersion(update.version):null,message:update?`Version ${displayVersion(update.version)} is available.`:'You’re up to date.'});
    }catch(e){update=null;await publish({available:null,message:'Couldn’t check for updates. Try again.',detail:e.message})}
    finally{busy=false;await publish()}
  };
  const launch=(exe,args,action)=>{
    // Detached console startup can make PowerShell exit 0 without running -File.
    // Maintenance.ps1 starts its own hidden host so it survives this UI closing.
    // A user action is a new operation, not a descendant of the setup which
    // originally launched this long-lived manager.
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='TSIX_OPERATION_TOKEN'));
    const child=spawn(exe,args,{windowsHide:true,stdio:'ignore',env});
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
        launch(runtime.pwsh,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Maintenance.ps1'),'-Action','Update','-Background'],'Update');
      }else{
        const uninstall=join(root,'app','unins000.exe');await plainPath(uninstall);
        if(await stat(uninstall).catch(()=>null))launch(uninstall,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],'Uninstall');
        else launch(runtime.pwsh,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Maintenance.ps1'),'-Action','Remove','-NodePath',process.execPath,'-Restart','-Background'],'Uninstall');
      }
    }catch(e){busy=false;await publish({message:request.action==='update'?'Update stopped. Try again.':'Uninstall stopped. Try again.',detail:e.message})}
  });
  claim.setState({status:'ready'});await report({status:'ready'});
  await check();timer=setInterval(()=>check().catch(()=>{}),Math.max(1,release.updates?.checkIntervalHours||6)*3600000);
  await disconnected;
}catch(e){
  const failure={status:'failed',message:e.message};claim?.setState?.(failure);
  await atomicJSON(join(root,'manager-error.json'),{at:new Date().toISOString(),...failure});await report(failure);process.exitCode=1;
}finally{clearInterval(timer);c?.close();await claim?.close?.()}
