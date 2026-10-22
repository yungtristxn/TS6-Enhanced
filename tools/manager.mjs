import {readFile,mkdir,stat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect} from './cdp.mjs';
import {attachSession} from './session.mjs';
import {maintainSession,isSessionTransition} from './managed-session.mjs';
import {atomicJSON,readJSON,captureBaseline,stateRoot,plainPath} from './install-state.mjs';
import {claimManager} from './manager-lock.mjs';
import {checkUpdate,compatible,stageLatestUpdate,displayVersion,compareVersions,canApplyStyles,downloadStyles} from './updates.mjs';
import {applyLiveStyles} from './live-update.mjs';
const root=stateRoot(),project=fileURLToPath(new URL('../',import.meta.url));
const readyIndex=process.argv.indexOf('--ready-file'),readyFile=readyIndex<0?null:process.argv[readyIndex+1];
const portIndex=process.argv.indexOf('--port'),port=Number(portIndex<0?9988:process.argv[portIndex+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid manager port');
let reported=false;
const report=async value=>{if(readyFile&&!reported){await atomicJSON(readyFile,value);reported=true}};
await plainPath(root);await mkdir(root,{recursive:true});
let active,timer,claim,removeBinding;let busy=false;
try{
  claim=await claimManager(root);
  if(!claim.owner){await report({status:'ready'});process.exit(0)}
  const release=JSON.parse(await readFile(join(project,'release.json'),'utf8'));
  const runtime=await readJSON(join(root,'install-runtime.json'));
  if(!['node','pwsh'].every(k=>typeof runtime[k]==='string'&&isAbsolute(runtime[k])))throw Error('Invalid maintenance runtime receipt. Run setup again to repair it.');
  let state={version:displayVersion(release.version),configured:!!release.updates?.repository,legacy:false,busy:false,available:null,detail:null,message:release.updates?.repository?'Checking for updates…':'Updates aren’t configured.'};
  const queued=await readJSON(join(root,'pending-update.json')).catch(()=>null);
  if(queued?.schema===2&&queued.mode==='next-launch'&&queued.fromVersion===release.version&&compareVersions(queued.version,release.version)>0){
    state.pending=displayVersion(queued.version);state.message=`Version ${state.pending} is ready. It will install next time you open TeamSpeak.`;
  }
  const publish=async(patch={})=>{
    state={...state,...patch,busy};
    if(!active)return false;
    try{return await active.client.evaluate(`(()=>{if(!window.__tsixManager)return false;window.__tsixManager.setState(${JSON.stringify(state)},${JSON.stringify(active.nonce)});return true})()`)}
    catch(error){if(!isSessionTransition(error))throw error;return false}
  };
  const ui=await readFile(join(project,'tools/manager-runtime.js'),'utf8');
  // The profile/settings button can be unmounted by native navigation. Load
  // its existing artwork locally so our entry never depends on that DOM node.
  const settingsIcon=await readFile(join(process.env.LOCALAPPDATA,'Programs/TeamSpeak/html/client_ui/images/icons/settings.svg'),'utf8');
  const check=async()=>{
    if(busy||state.pending||!release.updates?.repository)return;
    busy=true;await publish({message:'Checking for updates…',detail:null});
    try{
      const update=await checkUpdate(release.version,release.updates);
      if(update&&!await compatible(update,join(process.env.LOCALAPPDATA,'Programs/TeamSpeak'))){await publish({available:null,message:'This update needs a different TeamSpeak version.'})}
      else await publish({available:update?displayVersion(update.version):null,message:update?`Version ${displayVersion(update.version)} is available.`:'You’re up to date.'});
    }catch(e){await publish({available:null,message:'Couldn’t check for updates. Try again.',detail:e.message})}
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
  const handleRequest=async event=>{
    if(!active)return;
    const {contextId,nonce}=active;
    if(event.name!=='__tsixMaintenanceRequest'||event.executionContextId!==contextId||typeof event.payload!=='string'||event.payload.length>512||busy)return;
    let request;try{request=JSON.parse(event.payload)}catch{return}
    if(request.nonce!==nonce||!['check','update','uninstall'].includes(request.action))return;
    if(request.action==='check'){await check();return}
    if(request.action==='update'&&state.pending)return;
    busy=true;await publish({...(request.action==='update'?{available:null}:{}),message:request.action==='update'?'Checking for the latest release…':'Removing TS6 Enhanced…',detail:null});
    try{
      if(request.action==='update'){
        const selected=await stageLatestUpdate(release.version,release.updates,join(process.env.LOCALAPPDATA,'Programs/TeamSpeak'),join(root,'updates'),{
          onSelected:update=>publish({message:`Downloading version ${displayVersion(update.version)}…`})
        });
        if(!selected){busy=false;await publish({message:'No newer release is available.'});return}
        const {update,path}=selected;
        await atomicJSON(join(root,'pending-update.json'),{schema:2,mode:'next-launch',fromVersion:release.version,path,version:update.version,sha256:update.installer.sha256,resourceHashes:update.manifest.supportedClient.resourceHashes});
        let applied=false,detail=null;
        if(active&&canApplyStyles(release,update)){
          try{const css=await downloadStyles(update);if(active)applied=await applyLiveStyles(active.client,css,update.manifest.themeVersion)}
          catch(error){detail='The update is saved, but its appearance will apply on the next launch. '+error.message}
        }
        busy=false;
        await publish({available:null,pending:displayVersion(update.version),detail,message:(applied?'Appearance updated. ':'')+`Version ${displayVersion(update.version)} will finish installing next time you open TeamSpeak.`});
      }else{
        const uninstall=join(root,'app','unins000.exe');await plainPath(uninstall);
        if(await stat(uninstall).catch(()=>null))launch(uninstall,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],'Uninstall');
        else launch(runtime.pwsh,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(project,'scripts/Maintenance.ps1'),'-Action','Remove','-NodePath',process.execPath,'-Restart','-Background'],'Uninstall');
      }
    }catch(e){busy=false;await publish({message:request.action==='update'?'Update stopped. Try again.':'Uninstall stopped. Try again.',detail:e.message})}
  };
  await maintainSession({
    open:()=>connect({port}),
    async attach(c,contextId){
      await attachSession(c);
      state.legacy=(await captureBaseline(c)).legacy;
      await c.send('Runtime.addBinding',{name:'__tsixMaintenanceRequest',executionContextId:contextId});
      await c.evaluate(ui);
      await c.evaluate(`window.__tsixManager.setIcon(${JSON.stringify(settingsIcon)})`);
      removeBinding?.();
      removeBinding=c.on('Runtime.bindingCalled',event=>{handleRequest(event).catch(error=>{
        atomicJSON(join(root,'manager-error.json'),{at:new Date().toISOString(),status:'failed',message:error.message}).catch(()=>{});
      })});
      active={client:c,contextId,nonce:randomBytes(24).toString('hex')};
      if(!await publish())throw Error('Main renderer is not ready');
    },
    onState(value){
      claim.setState(value);
      if(value.status!=='ready'){active=null;removeBinding?.();removeBinding=null;return}
      if(!timer){
        check().catch(()=>{});
        timer=setInterval(()=>check().catch(()=>{}),Math.max(1,release.updates?.checkIntervalHours||6)*3600000);
      }
      return report({status:'ready'});
    }
  });
}catch(e){
  const failure={status:'failed',message:e.message};claim?.setState?.(failure);
  await atomicJSON(join(root,'manager-error.json'),{at:new Date().toISOString(),...failure});await report(failure);process.exitCode=1;
}finally{clearInterval(timer);removeBinding?.();await claim?.close?.()}
