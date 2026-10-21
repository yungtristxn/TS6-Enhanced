import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {captureBaseline,validateBaseline,ownedPreferences} from '../tools/install-state.mjs';
import {restoreAppearance} from '../tools/appearance.mjs';
const original={appearance:{user_style:'example.theme//Original',tree_compact:false,chat_input_toolbar_visibility:'always'},storage:Object.fromEntries(ownedPreferences.map(k=>[k,null]))};
const baseline={schema:1,owner:'tsix-install-baseline',legacy:false,...original};
test('first install snapshot survives subsequent updates unchanged',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tsix-baseline-'));await captureBaseline({evaluate:async()=>structuredClone(original)},root);
 const again=await captureBaseline({evaluate:async()=>{throw Error('Must not recapture')}},root);assert.deepEqual(again.appearance,original.appearance);validateBaseline(JSON.parse(await readFile(join(root,'before-install.json'),'utf8')));
});
test('older installations explicitly record an unavailable original baseline',async()=>{
 for(const theme of ['local.tsix.layout//Compact Stream Layout','local.tsix.layout//TS6 Enhanced']){
  const root=await mkdtemp(join(tmpdir(),'tsix-legacy-'));const value=structuredClone(original);value.appearance.user_style=theme;
  const saved=await captureBaseline({evaluate:async()=>value},root);assert.equal(saved.legacy,true);assert.deepEqual(saved.appearance,{user_style:null});
 }
});
test('malformed baselines cannot write unrelated settings',()=>{
 assert.throws(()=>validateBaseline({...baseline,appearance:{...baseline.appearance,identity:'must not restore'}}));assert.throws(()=>validateBaseline({...baseline,owner:'foreign'}));
});
function mockClient(themeExists=true){
 const app={appearanceSettings:{user_style:'local.tsix.layout//TS6 Enhanced',tree_compact:true,chat_input_toolbar_visibility:'dynamic',chat_compact:true},refreshAvailableUserStyles(){this._userStylesUpdated=Date.now()},getThemeForIdentifier:()=>themeExists?{}:null,applyUserStyle(theme){this.appearanceSettings.user_style=theme},disableUserStyle(){this.appearanceSettings.user_style=null},applyAppearanceSettings(fields){Object.assign(this.appearanceSettings,fields)}};
 let detached=false;
 return {app,get detached(){return detached},async evaluate(expression){if(expression.includes('dispose()'))detached=true;if(expression==='document.querySelector("main").__vue__.appearanceSettings')return app.appearanceSettings},async send(method,args){
  if(method==='Runtime.evaluate')return {result:{type:'function',objectId:'getter'}};
  if(method==='Runtime.getProperties')return args.objectId==='getter'?{internalProperties:[{name:'[[Scopes]]',value:{objectId:'scopes'}}]}:args.objectId==='scopes'?{result:[{name:'0',value:{description:'Closure',objectId:'closure'}}]}:{result:[{name:'Q',value:{objectId:'module'}}]};
  if(method==='Runtime.callFunctionOn'){
   if(args.objectId==='module')return {result:{objectId:'app'}};
   const value=new Function(`return (${args.functionDeclaration})`)().apply(app,args.arguments?.map(a=>a.value)||[]);return {result:{value}};
  }return {};
 }};
}
test('restore changes only owned settings and keeps other native preferences',async()=>{
 const c=mockClient();await restoreAppearance(c,baseline);assert.equal(c.app.appearanceSettings.user_style,original.appearance.user_style);assert.equal(c.app.appearanceSettings.tree_compact,false);assert.equal(c.app.appearanceSettings.chat_compact,true);assert.equal(c.detached,true);
});
test('missing original theme aborts before removing helpers or changing settings',async()=>{
 const c=mockClient(false);await assert.rejects(restoreAppearance(c,baseline),/original theme is missing/);assert.equal(c.detached,false);assert.equal(c.app.appearanceSettings.user_style,'local.tsix.layout//TS6 Enhanced');
});
test('legacy removal disables theme without guessing prior density or toolbar values',async()=>{
 const c=mockClient();await restoreAppearance(c,{...baseline,legacy:true,appearance:{user_style:null}});assert.equal(c.app.appearanceSettings.user_style,null);assert.equal(c.app.appearanceSettings.tree_compact,true);assert.equal(c.app.appearanceSettings.chat_input_toolbar_visibility,'dynamic');
});
