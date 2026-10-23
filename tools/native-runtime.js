// Bundled into the DLL inside a closure with connection, release, css and
// attachWorkspace/attachStreams/attachManager. Never opens a debugging port.
async function startNativeEnhanced() {
  if(window!==window.top||location.protocol!=='tsui:'||location.hostname!=='default'||location.pathname!=='/index.html'||new URLSearchParams(location.search).has('popup'))return;
  if(window.__tsixNative)return;
  const state={version:release.version,status:'waiting',transport:'native',error:null};
  window.__tsixNative=state;
  const deadline=Date.now()+60000;
  while(!document.querySelector('.tsv-window')?.__vue__?.windowLayout||typeof globalThis.tsclient_internal?.getClientLibVersion!=='function'){
    if(Date.now()>deadline){state.status='unavailable';state.error='TeamSpeak startup did not finish';return}
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
  if(!Number.isInteger(build)){state.status='unavailable';state.error='TeamSpeak did not answer its version check';return}
  if(build!==release.supportedClient.build){state.status='unsupported';return}
  // Keep a single replaceable group inside native main.css. Live updates can
  // disable that group without leaving obsolete selectors underneath an overlay.
  const mainSheet=[...document.styleSheets].find(sheet=>{
    try{return new URL(sheet.href).protocol==='tsui:'&&new URL(sheet.href).hostname==='default'&&new URL(sheet.href).pathname==='/main.css'}catch{return false}
  });
  let earlyRule=null;
  try{earlyRule=[...(mainSheet?.cssRules||[])].find(rule=>rule.type===CSSRule.MEDIA_RULE&&rule.media.mediaText==='all'&&
    rule.cssRules[0]?.selectorText===':root'&&rule.cssRules[0].style.getPropertyValue('--tsix-css-delivery').trim()==='resource-v1')||null}catch{}
  const style=document.createElement('style');style.id='tsix-native-style';
  const insertStyle=()=>{
    if(style.isConnected)return;
    // Match early loading's cascade position. Native/user Appearance styles
    // loaded after main.css retain the same precedence with either delivery path.
    const anchor=mainSheet?.ownerNode;
    if(anchor?.parentNode)anchor.after(style);else document.head.append(style);
  };
  const earlyCurrent=earlyRule&&getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()===(release.themeVersion||release.version);
  if(!earlyCurrent){if(earlyRule)earlyRule.media.mediaText='not all';style.textContent=css;insertStyle()}
  state.cssDelivery=earlyCurrent?'resource':'javascript';
  // Runtime-owned styles leave native Appearance settings untouched. Removing
  // the DLL removes these styles on next startup, including after a failed host.
  if(!window.__tsixWorkspace)attachWorkspace();
  if(!window.__tsixStreams)attachStreams();
  attachManager();
  state.status='ready';
  const unavailable=(message,detail='Run the installer again to repair native update support.')=>window.__tsixManager.setState({version:release.version,configured:false,busy:false,message,detail},'');
  if(!connection){unavailable('Update support couldn’t start.');return}
  let socket,sequence=0,stopped=false,retry=1000,lastStyle='';
  const pending=new Map();
  const request=(path,data)=>new Promise((resolve,reject)=>{
    if(socket?.readyState!==WebSocket.OPEN){reject(Error('Native update service is disconnected'));return}
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native update request timed out'))},15000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,path,data}));
  });
  window.__tsixMaintenanceRequest=raw=>{
    let message;try{message=JSON.parse(raw)}catch{return}
    if(!message||typeof message!=='object'||message.nonce!==connection.token||!['check','update','uninstall'].includes(message.action))return;
    request('/action',{action:message.action}).catch(error=>{state.error=error.message;unavailable('Update support is unavailable.');});
  };
  window.addEventListener('pagehide',()=>{stopped=true;socket?.close()},{once:true});
  const applyStyle=job=>{
    if(document.fullscreenElement)return false;
    const previous=style.textContent,connected=style.isConnected,previousMedia=earlyRule?.media.mediaText;
    try{
      if(typeof job.css!=='string'||!job.css||typeof job.themeVersion!=='string')return false;
      if(earlyRule)earlyRule.media.mediaText='not all';
      style.textContent=job.css;
      insertStyle();
      if(getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()!==job.themeVersion)throw Error('Stylesheet version mismatch');
      window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync();return true;
    }catch{
      style.textContent=previous;if(!connected)style.remove();
      if(earlyRule)earlyRule.media.mediaText=previousMedia;
      try{window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync()}catch{}
      return false;
    }
  };
  const appearance=document.querySelector('main')?.__vue__?.appearanceSettings;
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
    socket.onopen=()=>{retry=1000;lastStyle='';void request('/action',{action:'ready',baseline}).catch(()=>{})};
    socket.onmessage=event=>{
      try{
        const response=JSON.parse(event.data);
        if('reply'in response){const item=pending.get(response.reply);if(item){clearTimeout(item.timer);pending.delete(response.reply);response.ok?item.resolve():item.reject(Error(response.error))}return}
        window.__tsixManager.setState(response.state,connection.token);state.error=null;
        if(response.style&&lastStyle!==response.style.id){lastStyle=response.style.id;void request('/style-result',{id:lastStyle,applied:applyStyle(response.style)}).catch(()=>{})}
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
