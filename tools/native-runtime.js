// Bundled into the DLL inside a closure with connection, release, css and
// attachWorkspace/attachStreams/attachManager. Never opens a debugging port.
async function startNativeEnhanced() {
  if(window!==window.top||location.protocol!=='tsui:'||location.hostname!=='default'||location.pathname!=='/index.html'||new URLSearchParams(location.search).has('popup'))return;
  if(window.__tsixNative)return;
  if(release.updates?.sessionRestore===1&&typeof attachSessionGuard==='function')attachSessionGuard();
  const state={version:release.version,status:'waiting',transport:'native',error:null};
  window.__tsixNative=state;
  const deadline=Date.now()+60000;
  while(!document.querySelector('.tsv-window')?.__vue__?.windowLayout||typeof globalThis.tsclient_internal?.getClientLibVersion!=='function'){
    if(Date.now()>deadline){state.status='unavailable';state.error='TeamSpeak startup did not finish';window.__tsixSessionGuard?.dispose(true);return}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  let build=null;
  for(let attempt=0;attempt<3;attempt++){
    // The native bridge can appear before its callback is ready. Keep the
    // resolver alive and bound each attempt so a lost callback cannot hang startup.
    build=await new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(null),2000);
      try{tsclient_internal.getClientLibVersion((error,value)=>{clearTimeout(timer);resolve(error?null:value)})}
      catch{clearTimeout(timer);resolve(null)}
    });
    if(Number.isInteger(build))break;
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!Number.isInteger(build)){state.status='unavailable';state.error='TeamSpeak did not answer its version check';window.__tsixSessionGuard?.dispose(true);return}
  if(build!==release.supportedClient.build){state.status='unsupported';window.__tsixSessionGuard?.dispose(true);return}
  window.__tsixSessionGuard?.finishSetup?.();
  // The former official theme can still be selected after installing the native
  // loader. It is another version of our layout, not an independent user theme.
  // Suspend only that owned sheet in this document; retain the saved preference
  // and original media attribute for removal/recovery or a later theme change.
  const appearanceVm=document.querySelector('main')?.__vue__;
  let legacyStyle=null;
  const restoreLegacy=()=>{
    if(!legacyStyle)return;
    if(legacyStyle.node.getAttribute('media')==='not all'){
      if(legacyStyle.media===null)legacyStyle.node.removeAttribute('media');else legacyStyle.node.setAttribute('media',legacyStyle.media);
    }
    legacyStyle=null;state.legacyThemeSuppressed=false;
  };
  const syncLegacy=()=>{
    const selected=appearanceVm?.appearanceSettings?.user_style;
    const owned=typeof selected==='string'?selected.startsWith('local.tsix.layout//'):selected?.extensionIdentifier==='local.tsix.layout';
    const node=document.getElementById('userStyle');
    if(legacyStyle&&(!owned||legacyStyle.node!==node))restoreLegacy();
    if(!owned||!node)return;
    if(!legacyStyle)legacyStyle={node,media:node.getAttribute('media')};
    if(node.getAttribute('media')!=='not all')node.setAttribute('media','not all');
    state.legacyThemeSuppressed=true;
  };
  const legacyObserver=new MutationObserver(syncLegacy);
  legacyObserver.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['id','href','media']});
  const unwatchLegacy=appearanceVm?.$watch?.(()=>appearanceVm.appearanceSettings?.user_style,syncLegacy);
  let legacyDisposed=false;
  window.__tsixLegacyStyle={dispose(){if(legacyDisposed)return;legacyDisposed=true;legacyObserver.disconnect();unwatchLegacy?.();restoreLegacy()}};
  window.addEventListener('pagehide',()=>window.__tsixLegacyStyle.dispose(),{once:true});
  syncLegacy();
  // Prefer the verified native CSS response. Use one fallback sheet when early
  // delivery was unavailable or belongs to an older resource group.
  const mainSheet=[...document.styleSheets].find(sheet=>{
    try{return new URL(sheet.href).protocol==='tsui:'&&new URL(sheet.href).hostname==='default'&&new URL(sheet.href).pathname==='/main.css'}catch{return false}
  });
  let earlyRule=null;
  try{earlyRule=[...(mainSheet?.cssRules||[])].find(rule=>rule.type===CSSRule.MEDIA_RULE&&rule.media.mediaText==='all'&&
    rule.cssRules[0]?.selectorText===':root'&&rule.cssRules[0].style.getPropertyValue('--tsix-css-delivery').trim()==='resource-v1')||null}catch{}
  const earlyCurrent=earlyRule&&getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()===release.version;
  if(!earlyCurrent){
    if(earlyRule)earlyRule.media.mediaText='not all';
    const style=document.createElement('style');style.id='tsix-native-style';style.textContent=css;
    // Match the native response's position so user themes retain precedence.
    const anchor=mainSheet?.ownerNode;
    if(anchor?.parentNode)anchor.after(style);else document.head.append(style);
  }
  state.cssDelivery=earlyCurrent?'resource':'javascript';
  // Runtime-owned styles leave native Appearance settings untouched. Removing
  // the DLL removes these styles on next startup, including after a failed host.
  if(!window.__tsixWorkspace)attachWorkspace();
  if(!window.__tsixStreams)attachStreams();
  attachManager();
  if(release.updates?.sessionRestore===1&&typeof attachSession==='function')attachSession();
  state.status='ready';
  const unavailable=(message,detail='Run the installer again to repair native update support.')=>window.__tsixManager.setState({version:release.version,configured:false,busy:false,message,detail},'');
  if(!connection){unavailable('Update support couldn’t start.');return}
  let socket,sequence=0,stopped=false,retry=1000;
  const sessionJobs=new Map();
  const runSessionJob=job=>{
    if(!job||typeof job.id!=='string')return;
    const adapter=window.__tsixUpdateSession;
    if(!adapter||!['capture','prepare','cancel','restore'].includes(job.stage))return;
    let entry=sessionJobs.get(job.id);
    const send=()=>{
      if(!entry.response||entry.sending)return;
      entry.sending=true;
      void request('/session-result',entry.response).catch(error=>{state.error=error.message}).finally(()=>{entry.sending=false});
    };
    if(entry){send();return}
    entry={response:null,sending:false};sessionJobs.set(job.id,entry);
    const payload=job.stage==='restore'?{...job.payload,validateWindow:source=>request('/session-window',{id:job.id,source})}:job.payload;
    Promise.resolve().then(()=>adapter[job.stage](payload)).then(
      result=>{entry.response={id:job.id,result:result??{ok:true}};send()},
      error=>{entry.response={id:job.id,error:String(error.message||'Session operation failed').slice(0,256)};send()}
    );
    if(sessionJobs.size>16)sessionJobs.delete(sessionJobs.keys().next().value);
  };
  const pending=new Map();
  const request=(path,data)=>new Promise((resolve,reject)=>{
    if(socket?.readyState!==WebSocket.OPEN){reject(Error('Native update service is disconnected'));return}
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native update request timed out'))},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,path,data}));
  });
  const recoveredDrafts=new Map();
  const sendRecovered=(id,entry)=>{
    if(entry.sending)return;
    const indices=[...entry.indices];entry.sending=true;let acknowledged=false;
    void request('/session-recovered',{id,indices}).then(()=>{
      acknowledged=true;
      for(const index of indices)entry.indices.delete(index);
      if(!entry.indices.size)recoveredDrafts.delete(id);
    }).catch(error=>{state.error=error.message}).finally(()=>{
      entry.sending=false;
      if(acknowledged&&entry.indices.size)sendRecovered(id,entry);
    });
  };
  window.__tsixSessionRecovered=(id,indices)=>{
    let entry=recoveredDrafts.get(id);if(!entry){entry={indices:new Set(),sending:false};recoveredDrafts.set(id,entry)}
    for(const index of indices)entry.indices.add(index);
    sendRecovered(id,entry);
  };
  window.__tsixMaintenanceRequest=raw=>{
    let message;try{message=JSON.parse(raw)}catch{return}
    if(!message||typeof message!=='object'||message.nonce!==connection.token||!['check','update','uninstall'].includes(message.action))return;
    request('/action',{action:message.action}).catch(error=>{state.error=error.message;unavailable('Update support is unavailable.');});
  };
  window.addEventListener('pagehide',()=>{stopped=true;socket?.close()},{once:true});
  const appearance=appearanceVm?.appearanceSettings;
  let storage;
  try{storage=Object.fromEntries(['tsix.layout.chatVisible','tsix.layout.streamTrayCollapsed'].map(key=>[key,localStorage.getItem(key)]))}
  catch(error){
    // The interface works with in-memory preferences. Do not invent a recovery
    // baseline when storage cannot be read, or mark working helpers as failed.
    state.error=error.message;
    unavailable('Update support couldn’t read saved preferences.','Restart TeamSpeak to retry. Your layout remains available.');
    return;
  }
  const baseline={schema:1,owner:'tsix-install-baseline',capturedAt:new Date().toISOString(),legacy:false,
    appearance:{user_style:appearance?.user_style??null,...(typeof appearance?.tree_compact==='boolean'?{tree_compact:appearance.tree_compact}:{}),...(appearance?.chat_input_toolbar_visibility?{chat_input_toolbar_visibility:appearance.chat_input_toolbar_visibility}:{})},
    storage};
  const connect=()=>{
    if(stopped)return;
    socket=new WebSocket(connection.endpoint,`tsix.v1.${connection.token}`);
    socket.onopen=()=>{retry=1000;void request('/action',{action:'ready',baseline}).catch(()=>{});for(const [id,entry]of recoveredDrafts)sendRecovered(id,entry)};
    socket.onmessage=event=>{
      try{
        const response=JSON.parse(event.data);
        if('reply'in response){const item=pending.get(response.reply);if(item){clearTimeout(item.timer);pending.delete(response.reply);response.ok?item.resolve(response.value):item.reject(Error(response.error))}return}
        window.__tsixManager.setState(response.state,connection.token);state.error=null;
        runSessionJob(response.session);
        if(response.state?.sessionRecoveryDone&&!response.session&&window.__tsixSessionGuard?.active)window.__tsixSessionGuard.dispose(true);
      }catch(error){state.error=error.message}
    };
    socket.onerror=()=>{state.error='Native update connection failed'};
    socket.onclose=()=>{
      for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Native update connection closed'))}pending.clear();
      if(!stopped){unavailable('Update support is reconnecting…');setTimeout(connect,retry);retry=Math.min(30000,retry*2)}
    };
  };
  connect();
}
void startNativeEnhanced().catch(error=>{if(window.__tsixNative){window.__tsixNative.status='failed';window.__tsixNative.error=error.message}});
