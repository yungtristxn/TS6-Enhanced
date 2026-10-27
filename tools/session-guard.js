// Installed at context creation, before the vendor bundle reads preferences.
// Only the recovery launch receives the native resume flag. The two temporary
// autoconnect values are never written back to the user's saved settings.
(() => {
  if(window.__tsixSessionGuard)return;
  const bridge=globalThis.tsclient_internal;
  const originalGet=bridge?.getJsonBlob,originalSave=bridge?.saveJsonBlob,originalOn=bridge?.on;
  const descriptors=Object.fromEntries(['getJsonBlob','saveJsonBlob','on'].map(name=>[name,bridge&&Object.getOwnPropertyDescriptor(bridge,name)]));
  const replace=(name,value)=>{
    const descriptor=descriptors[name];
    // CEF exposes these functions as read-only but configurable data properties.
    // Preserve their attributes rather than relying on assignment or making the
    // native surface writable. Truly immutable bindings still fail closed.
    Object.defineProperty(bridge,name,descriptor&&'value'in descriptor?{...descriptor,value}:{value,writable:false,enumerable:descriptor?.enumerable??true,configurable:descriptor?.configurable??true});
  };
  const restore=(name,wrapper)=>{
    if(bridge?.[name]!==wrapper)return;
    if(descriptors[name])Object.defineProperty(bridge,name,descriptors[name]);else delete bridge[name];
  };
  // Defaults from the supported beta5 workflow constructor. Omitted saved keys
  // must restore these effective values, never the temporary recovery values.
  const defaults={restoreOpenedActivities:true,autoConnectSkipActivityCheck:1};
  let active=!!connection?.resumeSession,originalWorkflow=null;
  const mask=raw=>{
    if(!active)return raw;
    const value=JSON.parse(raw||'{}'),workflow=value.workflow||{};
    originalWorkflow={...workflow};
    value.workflow={...workflow,restoreOpenedActivities:false,autoConnectSkipActivityCheck:0};
    return JSON.stringify(value);
  };
  const read=(name,callback)=>{
    if(name!=='general_settings'||!active)return originalGet.call(bridge,name,callback);
    return originalGet.call(bridge,name,(error,raw)=>{
      if(error){callback(error,raw);return}
      try{
        callback(error,mask(raw));
      }catch{callback(error,raw)}
    });
  };
  const write=(name,raw,...args)=>{
    if(name==='general_settings'&&active&&originalWorkflow){
      const value=JSON.parse(raw),workflow=value.workflow||{};
      for(const [key,guard]of [['restoreOpenedActivities',false],['autoConnectSkipActivityCheck',0]]){
        if(workflow[key]!==guard&&workflow[key]!==undefined)originalWorkflow[key]=workflow[key];
        if(Object.hasOwn(originalWorkflow,key))workflow[key]=originalWorkflow[key];else delete workflow[key];
      }
      value.workflow=workflow;raw=JSON.stringify(value);
    }
    return originalSave.call(bridge,name,raw,...args);
  };
  // The vendor consumes saved-blob notifications directly, without calling the
  // getter again. Register the same listener with a masked notification payload.
  const on=(name,listener,...args)=>originalOn.call(bridge,name,name==='jsonBlobSaved'?function(event,...rest){
    if(active&&event?.key==='general_settings'){
      try{event={...event,payload:mask(event.payload)}}catch{}
    }
    return listener.call(this,event,...rest);
  }:name==='onHotkey'?function(...values){
    // Installed before the vendor registers its hotkey handler. During the
    // final shutdown commit no hotkey action can change the saved session.
    if(window.__tsixUpdateSession?.userIntent?.()===false)return;
    return listener.apply(this,values);
  }:listener,...args);
  let supported=false;
  try{
    if(typeof originalGet==='function'&&typeof originalSave==='function'&&typeof originalOn==='function'){
      replace('getJsonBlob',read);replace('saveJsonBlob',write);replace('on',on);
      supported=bridge.getJsonBlob===read&&bridge.saveJsonBlob===write&&bridge.on===on;
    }
  }catch{}
  const release=()=>{
    active=false;
    restore('getJsonBlob',read);restore('saveJsonBlob',write);
    clearTimeout(timer);
    return originalWorkflow&&{restoreOpenedActivities:originalWorkflow.restoreOpenedActivities??defaults.restoreOpenedActivities,autoConnectSkipActivityCheck:originalWorkflow.autoConnectSkipActivityCheck??defaults.autoConnectSkipActivityCheck};
  };
  const finishSetup=()=>restore('on',on);
  const dispose=(normalStartup=false)=>{
    finishSetup();
    const wasActive=active,saved=release(),root=document.querySelector('main')?.__vue__?.$root,app=root?.appController;
    if(wasActive&&app&&saved){
      const values=Object.fromEntries(Object.entries(saved).filter(([,value])=>value!==undefined));app.applyWorkflowSettings(values);
      if(normalStartup&&root?._vm?.tsapi?.IsReady?.()&&!app.connections.length){if(app.workflowSettings.restoreOpenedActivities)app.restoreOpenedActivities?.();app.checkAutoConnect?.()}
    }
  };
  const timer=setTimeout(()=>dispose(true),180000);
  window.__tsixSessionGuard={supported,early:supported,get active(){return active},release,dispose,finishSetup};
  if(!active||!supported)release();
})();
