import {mkdir,readFile,writeFile,rename,lstat} from 'node:fs/promises';
import {join,dirname,resolve,parse} from 'node:path';
export const ownedPreferences=['tsix.layout.chatVisible','tsix.layout.streamTrayCollapsed'];
export const stateRoot=()=>join(process.env.LOCALAPPDATA,'TS6-Layout');
export async function plainPath(path){
  for(let p=resolve(path);;p=dirname(p)){
    try{if((await lstat(p)).isSymbolicLink())throw Error('Linked maintenance path refused')}catch(e){if(e.code!=='ENOENT')throw e}
    if(p===parse(p).root)break;
  }
}
export async function atomicJSON(path,value){
  await plainPath(path);await mkdir(dirname(path),{recursive:true});
  const temp=`${path}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await rename(temp,path);
}
export function validateBaseline(s){
  if(s?.schema!==1||s.owner!=='tsix-install-baseline'||!s.appearance||!s.storage)throw Error('Invalid install baseline');
  if(s.appearance.user_style!==null&&(typeof s.appearance.user_style!=='string'||!s.appearance.user_style.includes('//')||s.appearance.user_style.length>512))throw Error('Invalid saved theme');
  if('tree_compact'in s.appearance&&typeof s.appearance.tree_compact!=='boolean')throw Error('Invalid saved tree preference');
  if('chat_input_toolbar_visibility'in s.appearance&&!['always','never','dynamic'].includes(s.appearance.chat_input_toolbar_visibility))throw Error('Invalid saved chat toolbar preference');
  if(Object.keys(s.appearance).some(k=>!['user_style','tree_compact','chat_input_toolbar_visibility'].includes(k)))throw Error('Unowned appearance field in baseline');
  for(const key of ownedPreferences)if(s.storage[key]!==null&&typeof s.storage[key]!=='string')throw Error('Invalid saved layout preference');
  return s;
}
export async function captureBaseline(c,root=stateRoot()){
  const path=join(root,'before-install.json');await plainPath(path);
  try{return validateBaseline(JSON.parse(await readFile(path,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}
  const saved=await c.evaluate(`(()=>{const a=document.querySelector('main').__vue__.appearanceSettings;return {appearance:{user_style:a.user_style??null,tree_compact:a.tree_compact,chat_input_toolbar_visibility:a.chat_input_toolbar_visibility},storage:Object.fromEntries(${JSON.stringify(ownedPreferences)}.map(k=>[k,localStorage.getItem(k)]))}})()`);
  const legacy=['local.tsix.layout//Compact Stream Layout','local.tsix.layout//TS6 Enhanced'].includes(saved.appearance.user_style);
  // An older install never recorded its original settings. Do not invent them.
  if(legacy){saved.appearance={user_style:null};saved.storage=Object.fromEntries(ownedPreferences.map(k=>[k,null]))}
  const baseline=validateBaseline({schema:1,owner:'tsix-install-baseline',capturedAt:new Date().toISOString(),legacy,...saved});
  await mkdir(root,{recursive:true});
  try{await writeFile(path,JSON.stringify(baseline,null,2),{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;return validateBaseline(JSON.parse(await readFile(path,'utf8')))}
  return baseline;
}
