// Exact-build adapter for uninstall recovery. No profile database I/O.
// Use the same native controller as session recovery; no minified closure names.
import {ownedPreferences,validateBaseline} from './install-state.mjs';
import {readClientBuild} from './cdp.mjs';
async function withAppearance(c,operation) {
  const group='tsix-appearance-setup';
  const unwrap=r=>{if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result;};
  try {
    let app;
    for(let i=0;i<120;i++) {
      app=unwrap(await c.send('Runtime.evaluate',{
        expression:"typeof tsclient_internal!=='undefined' && typeof tsclient_internal.getClientLibVersion==='function' && document.querySelector('main')?.__vue__?.$root?.appController",
        objectGroup:group}));
      if(app.objectId)break;
      await new Promise(r=>setTimeout(r,250));
    }
    if(!app?.objectId)throw Error('TeamSpeak did not finish loading. Wait for startup to finish and retry removal.');
    if(await readClientBuild(c)!==1791901251)throw Error('Unsupported TS6 build; no appearance settings changed');
    await c.evaluate(`(()=>{
      if(document.fullscreenElement)throw Error('Exit fullscreen before restoring appearance');
    })()`);
    const supported=unwrap(await c.send('Runtime.callFunctionOn',{objectId:app.objectId,returnByValue:true,
      functionDeclaration:'function(){return ["refreshAvailableUserStyles","applyUserStyle","disableUserStyle","applyAppearanceSettings","getThemeForIdentifier"].every(name=>typeof this[name]==="function")}'})).value;
    if(!supported)throw Error('Unexpected native Appearance API; no settings changed');
    return await operation(app,unwrap);
  } finally { await c.send('Runtime.releaseObjectGroup',{objectGroup:group}); }
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
    await c.evaluate('window.__tsixUpdateSession?.dispose();window.__tsixSessionGuard?.dispose();window.__tsixLegacyStyle?.dispose();window.__tsixStreams?.dispose();window.__tsixWorkspace?.dispose()');
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
