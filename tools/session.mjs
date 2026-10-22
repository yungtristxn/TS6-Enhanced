// Attach the optional layout features to an already verified inspection session.
// No background watcher, restart, connection, media action or profile read.
import {connect,readClientBuild} from './cdp.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {activateAppearance} from './appearance.mjs';
const i=process.argv.indexOf('--port'),port=Number(i<0?9988:process.argv[i+1]);
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
export async function attachSession(c,{setup=false,preserve=false,refreshTree=()=>execFileSync(process.execPath,[fileURLToPath(new URL('./client.mjs',import.meta.url)), 'refresh-tree','--allow-empty','--port',String(port)],{windowsHide:true,stdio:'pipe'})}={}) {
  // A listening CEF port is not evidence that the main app and native bridge
  // have initialized. Wait before asking the Appearance adapter to mutate it.
  const appDeadline=Date.now()+60000;let appReady=false;
  while(Date.now()<appDeadline){
    appReady=await c.evaluate(`(()=>{try{return (${!(setup||preserve)} || !!document.querySelector('main')?.__vue__?.appearanceSettings) &&
      !!document.querySelector('.tsv-window')?.__vue__?.windowLayout &&
      typeof tsclient_internal!=='undefined' && typeof tsclient_internal?.getClientLibVersion==='function'}catch{return false}})()`);
    if(appReady)break;
    await new Promise(r=>setTimeout(r,250));
  }
  if(!appReady)throw Error('TeamSpeak is still opening. Finish any startup screen, then launch its Start Menu shortcut again.');
  // Setup uses the native theme loader/settings setter, then normal launches
  // respect the user's subsequent theme choices. Never edits the profile DB.
  let activated=false;
  if(setup||preserve) activated=await activateAppearance(c,{preserve});
  // Cold launch can expose the CEF document before the Vue root/theme exists.
  let ready=false;
  for(let attempt=0;attempt<120;attempt++) {
    ready=await c.evaluate(`!!document.querySelector('.tsv-window')?.__vue__?.windowLayout &&
      (${!activated} || (getComputedStyle(document.documentElement).getPropertyValue('--tsix-workspace-api').trim()==='1' &&
      getComputedStyle(document.documentElement).getPropertyValue('--tsix-stream-stage-api').trim()==='1' &&
      getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()===${JSON.stringify(release.themeVersion)}))`);
    if(ready)break;
    await new Promise(r=>setTimeout(r,250));
  }
  if(!ready)throw Error('Select TS6 Enhanced in Appearance, then launch the TeamSpeak Start Menu shortcut again. No restart is needed.');
  if(await readClientBuild(c)!==release.supportedClient.build)throw Error('Unsupported TS6 build; no helpers attached');
  await c.evaluate(`(()=>{
    if(document.fullscreenElement)throw Error('Exit fullscreen before attaching layout helpers');
    const vm=document.querySelector('.tsv-window').__vue__;
    if(typeof vm.collapseSidebar!=='function')throw Error('Unexpected window component');
  })()`);
  const enabled=await c.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tsix-stream-stage-api').trim()==='1'");
  if(enabled){
  // Refresh even when the user starts on Home: future trees read this cache.
  await refreshTree();
  console.log('Layout ready: native navigation, scaled rows, bounded previews, stream focus, chat and sharing status. Existing pane widths retained.');
  }else console.log('Layout theme is disabled. Update and uninstall controls remain available; your appearance choice was retained.');
  // Both runtimes remain dormant without their CSS marker and observe later
  // theme loads. A disabled or delayed stylesheet must not skip attachment.
  await c.evaluate(await readFile(new URL('./workspace-runtime.js',import.meta.url),'utf8'));
  await c.evaluate(await readFile(new URL('./streams-runtime.js',import.meta.url),'utf8'));
}
const entryPath=process.argv[1]?resolve(process.argv[1]):'',modulePath=fileURLToPath(import.meta.url);
if(entryPath&&(process.platform==='win32'?modulePath.toLowerCase()===entryPath.toLowerCase():modulePath===entryPath)) {
let c;
try {
const deadline=Date.now()+60000;
while(!c) {
  try {c=await connect({port});}
  catch(error) {
    // The CEF listener can appear before its main page/bridge on cold launch.
    // Do not retry failed listener ownership or non-loopback checks.
    if(Date.now()>=deadline||!/Expected one TS6 target|TS6 document identity check failed|CDP connection (failed|timeout)|Cannot find context|Execution context was destroyed/.test(error.message))throw error;
    await new Promise(r=>setTimeout(r,250));
  }
}
await attachSession(c,{setup:process.argv.includes('--setup'),preserve:process.argv.includes('--upgrade')});
}catch(error){console.error(error.message);process.exitCode=1;}finally{c?.close();}
}
