// Exact-build adapter for the native Appearance API. Setup only; no profile I/O.
// The Vue getter closes over the app module. CDP can read that closure without
// pausing execution, monkey-patching the client, or opening a settings screen.
import {captureBaseline,ownedPreferences,validateBaseline} from './install-state.mjs';
export async function withAppearance(c,operation) {
  const group='tsix-appearance-setup';
  const unwrap=r=>{if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result;};
  await c.evaluate(`(async()=>{
    const build=await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));
    if(build!==1791901251)throw Error('Unsupported TS6 build; no appearance settings changed');
    if(document.fullscreenElement)throw Error('Exit fullscreen and launch TeamSpeak from Start Menu again to finish setup');
  })()`);
  try {
    let getter;
    for(let i=0;i<120;i++) {
      getter=unwrap(await c.send('Runtime.evaluate',{
        expression:"document.querySelector('main')?.__vue__?.$options.computed?.appearanceSettings?.get",
        objectGroup:group}));
      if(getter.type==='function')break;
      await new Promise(r=>setTimeout(r,250));
    }
    if(getter?.type!=='function')throw Error('TeamSpeak did not finish loading. Launch its Start Menu entry again.');
    const properties=await c.send('Runtime.getProperties',{objectId:getter.objectId,ownProperties:true});
    const scopes=properties.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value.objectId;
    if(!scopes)throw Error('Native appearance adapter is unavailable; no settings changed');
    const entries=await c.send('Runtime.getProperties',{objectId:scopes,ownProperties:true});
    let app;
    for(const scope of entries.result.filter(p=>/^\d+$/.test(p.name)&&p.value?.description?.startsWith('Closure'))) {
      const vars=await c.send('Runtime.getProperties',{objectId:scope.value.objectId,ownProperties:true});
      const module=vars.result.find(p=>p.name==='Q')?.value;
      if(!module?.objectId)continue;
      const candidate=unwrap(await c.send('Runtime.callFunctionOn',{objectId:module.objectId,
        functionDeclaration:`function(){const a=this.Id?.sharedInstance?.();
          return typeof a?.refreshAvailableUserStyles==='function'&&typeof a?.applyUserStyle==='function'&&
            typeof a?.applyAppearanceSettings==='function'&&typeof a?.getThemeForIdentifier==='function'?a:null;}`,
        objectGroup:group}));
      if(candidate.objectId){app=candidate;break;}
    }
    if(!app)throw Error('Unexpected native Appearance API; no settings changed');
    return await operation(app,unwrap);
  } finally { await c.send('Runtime.releaseObjectGroup',{objectGroup:group}); }
}
export async function activateAppearance(c) {
  return withAppearance(c,async(app,unwrap)=>{
    await captureBaseline(c);
    const refreshAt=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,
      functionDeclaration:'function(){const t=Date.now();this.refreshAvailableUserStyles(true);return t}'})).value;
    let found=false;
    for(let i=0;i<80;i++) {
      found=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,
        functionDeclaration:`function(){if(this._userStylesUpdated<${refreshAt})return false;
          const t=this.getThemeForIdentifier('local.tsix.layout//TS6 Enhanced');
          if(!t)return false;const u=new URL(t.source);
          return u.protocol==='tsui:'&&u.hostname==='extension'&&u.pathname==='/local.tsix.layout/layout.css';}`})).value;
      if(found)break;
      await new Promise(r=>setTimeout(r,250));
    }
    if(!found)throw Error('Installed layout was not found by TeamSpeak. Run Install.cmd again.');
    unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,
      functionDeclaration:`function(){
        this.applyUserStyle('local.tsix.layout//TS6 Enhanced');
        this.applyAppearanceSettings({tree_compact:true,chat_input_toolbar_visibility:'dynamic'});
        const link=document.getElementById('userStyle');
        if(link){const url=new URL(link.href);url.searchParams.set('tsix',Date.now());link.href=url.href;}
      }`}));
  });
}
export async function restoreAppearance(c,baseline){
  validateBaseline(baseline);
  return withAppearance(c,async(app,unwrap)=>{
    // Uninstall may have started a closed client. Wait for the native extension
    // inventory before deciding whether the previously selected theme exists.
    if(baseline.appearance.user_style){
      const started=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,functionDeclaration:'function(){const t=Date.now();this.refreshAvailableUserStyles(true);return t}'})).value;
      let ready=false;
      for(let i=0;i<80;i++){
        ready=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,arguments:[{value:started}],functionDeclaration:'function(started){return this._userStylesUpdated>=started}'})).value;
        if(ready)break;await new Promise(r=>setTimeout(r,250));
      }
      if(!ready)throw Error('TeamSpeak did not finish loading its themes; retry removal');
    }
    const available=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,arguments:[{value:baseline.appearance.user_style}],functionDeclaration:'function(theme){return !theme||!!this.getThemeForIdentifier(theme)}'})).value;
    if(!available)throw Error('The original theme is missing; restore it before uninstalling');
    await c.evaluate('window.__tsixStreams?.dispose();window.__tsixWorkspace?.dispose()');
    unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,arguments:[{value:baseline.appearance}],
      functionDeclaration:`function(saved){
        if(saved.user_style&&!this.getThemeForIdentifier(saved.user_style))throw Error('The original theme is missing; restore it before uninstalling');
        if(saved.user_style)this.applyUserStyle(saved.user_style);else this.disableUserStyle();
        const fields={...saved};delete fields.user_style;this.applyAppearanceSettings(fields);
      }`}));
    await c.evaluate(`(()=>{const saved=${JSON.stringify(baseline.storage)};for(const key of ${JSON.stringify(ownedPreferences)}){if(saved[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,saved[key])}})()`);
    const actual=await c.evaluate('document.querySelector("main").__vue__.appearanceSettings');
    for(const [key,value]of Object.entries(baseline.appearance))if(actual[key]!==value)throw Error(`Could not restore ${key}`);
    return {restored:true,legacy:baseline.legacy};
  });
}
