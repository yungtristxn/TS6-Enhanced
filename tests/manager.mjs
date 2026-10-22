import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const source=await readFile(new URL('../tools/manager-runtime.js',import.meta.url),'utf8');
import {clientPath as client} from './client-path.mjs';
import {applyLiveStyles} from '../tools/live-update.mjs';
import {readClientBuild} from '../tools/cdp.mjs';
import {maintainSession} from '../tools/managed-session.mjs';
import {attachSession} from '../tools/session.mjs';
const nativeIcon=await readFile(`${client}/html/client_ui/images/icons/settings.svg`,'utf8');
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const errors=[],checks=[];
try{
 const p=await browser.newPage({viewport:{width:1000,height:700}});p.on('pageerror',e=>errors.push(e.message));
 await p.setContent('<title>TS6 Enhanced maintenance fixture</title><style>body{margin:0;background:#131d2b;font:13px "Segoe UI",sans-serif}.tsv-window{height:100vh;color:#edf1fa;--tsv-font-color:#edf1fa;--tsv-font-subtitle-color:#aeb9ca;--tsv-shaded-bg:#202a3c;--tsv-header-bg:#172034}.tsv-central-toolbar{height:44px;display:flex;align-items:center;padding-left:200px;background:#172034}.native-art{display:none}</style><div class="tsv-window"><div class="tsv-central-toolbar"><button>Mic</button><button>Audio</button></div><div class="native-art">'+nativeIcon+'</div><p>TeamSpeak workspace</p></div>');
 await p.evaluate(()=>{window.requests=[];window.__tsixMaintenanceRequest=value=>requests.push(JSON.parse(value));document.querySelector('.native-art').remove()});await p.evaluate(source);
 await p.evaluate(icon=>__tsixManager.setIcon(icon),nativeIcon);
 const base={version:'1.0',configured:false,legacy:true,busy:false,available:null,detail:null,message:'Updates aren’t configured.'};
 const set=patch=>p.evaluate(state=>__tsixManager.setState(state,'fixture-token'),{...base,...patch});
 const entry=p.locator('[data-tsix-manager-open]'),dialog=p.locator('#tsix-manager dialog');
 const capture=async name=>{if(!process.env.TSIX_SCREENSHOT_DIR)return;const c=await p.context().newCDPSession(p);const r=await dialog.boundingBox();const shot=await c.send('Page.captureScreenshot',{format:'png',clip:{...r,scale:1}});await writeFile(`${process.env.TSIX_SCREENSHOT_DIR}/${name}.png`,Buffer.from(shot.data,'base64'));await c.detach()};
 await set({});assert.equal(await p.title(),'TS6 Enhanced maintenance fixture');
 assert.equal(await entry.locator('svg').count(),1);const normal=await entry.boundingBox();assert.equal(normal.width,32);assert.equal(normal.height,32);assert.equal(await entry.getAttribute('aria-label'),'TS6 Enhanced');
 await entry.focus();await entry.press('Enter');assert.equal(await entry.getAttribute('aria-expanded'),'true');assert.ok(await dialog.isVisible());
 assert.equal(await p.getByRole('button',{name:'Check for updates'}).count(),0);assert.equal(await p.getByRole('button',{name:'Update…',exact:true}).count(),0);
 assert.doesNotMatch(await dialog.innerText(),/older installation|original appearance|shortcut|GitHub/);await capture('manager-overview');
 checks.push('32px native settings icon has a tooltip, accessible name and keyboard activation; overview shows only relevant actions');
 await p.getByRole('button',{name:'Uninstall…',exact:true}).click();assert.equal(await p.getByRole('heading').innerText(),'Uninstall TS6 Enhanced?');assert.match(await dialog.innerText(),/TeamSpeak will restart and end any calls or streams/);assert.match(await dialog.innerText(),/Other settings and personal data stay/);
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Cancel');await capture('manager-uninstall');
 await p.getByRole('button',{name:'Cancel',exact:true}).press('Enter');assert.equal(await p.evaluate(()=>requests.length),0);assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Uninstall…');
 await p.getByRole('button',{name:'Uninstall…',exact:true}).click();await p.keyboard.press('Escape');assert.ok(await dialog.isVisible());assert.equal(await p.getByRole('heading').innerText(),'TS6 Enhanced');await p.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.ok(await entry.evaluate(e=>e===document.activeElement));assert.equal(await p.evaluate(()=>requests.length),0);
 checks.push('Removal explains only its consequences; Cancel receives focus, Escape goes back, and dismissing never invokes removal');
 await entry.click();await p.getByRole('button',{name:'Uninstall…',exact:true}).click();await p.getByRole('button',{name:'Uninstall',exact:true}).evaluate(e=>e.click());assert.equal(await p.evaluate(()=>requests.length),0);
 await p.getByRole('button',{name:'Uninstall',exact:true}).click();assert.deepEqual(await p.evaluate(()=>requests),[{action:'uninstall',nonce:'fixture-token'}]);
 await p.getByRole('button',{name:'Close',exact:true}).click();
 await set({configured:true,legacy:false,available:'0.11.0',message:'Version 0.11.0 is available.'});
 assert.ok(await p.locator('[data-toast]').isVisible());assert.deepEqual(await entry.boundingBox(),normal);assert.match(await entry.getAttribute('aria-label'),/update available/);await p.getByRole('button',{name:'Later',exact:true}).click();
 await set({configured:true,available:'0.11.0',message:'Version 0.11.0 is available.'});assert.equal(await p.locator('[data-toast]').isVisible(),false);
 await entry.click();await p.getByRole('button',{name:'Update…',exact:true}).click();assert.match(await dialog.innerText(),/Download and apply the latest release/);assert.match(await dialog.innerText(),/TeamSpeak stays open/);assert.doesNotMatch(await dialog.innerText(),/restart|next time|finish/i);await capture('manager-update');await p.getByRole('button',{name:'Download update',exact:true}).click();assert.equal(await p.evaluate(()=>requests.at(-1).action),'update');
 await set({configured:true,version:'1.0.9',pending:null,message:'Updated to version 1.0.9.'});assert.doesNotMatch(await dialog.innerText(),/restart|next time|finish/i);assert.ok(await p.getByRole('button',{name:'Check for updates',exact:true}).isEnabled());await capture('manager-applied');
 await set({configured:true,ready:'1.0.10',message:'Appearance update ready to apply.'});assert.doesNotMatch(await dialog.innerText(),/restart|next time/i);await p.getByRole('button',{name:'Apply update',exact:true}).click();assert.equal(await p.evaluate(()=>requests.at(-1).action),'update');await capture('manager-ready');
 await set({configured:true,version:'1.0.9',pending:'1.0.10',message:'Version 1.0.10 will apply next time you open TeamSpeak.'});await p.getByRole('button',{name:'Check for updates',exact:true}).click();assert.equal(await p.evaluate(()=>requests.at(-1).action),'check');await capture('manager-pending');
 await set({configured:true,version:'1.0.9',pending:'1.0.10',available:'1.0.11',message:'Version 1.0.11 is available.'});await p.getByRole('button',{name:'Update…',exact:true}).click();await p.getByRole('button',{name:'Download update',exact:true}).click();assert.equal(await p.evaluate(()=>requests.at(-1).action),'update');
 checks.push('Live completion has no next-launch notice; queued changes keep Check and newer Update actions usable');
 await p.getByRole('button',{name:'Close',exact:true}).click();
 await p.evaluate(()=>{document.querySelector('.tsv-central-toolbar').replaceChildren();document.getElementById('tsix-manager').remove()});
 await entry.waitFor();await entry.click();assert.ok(await dialog.isVisible());
 assert.ok(await p.getByRole('button',{name:'Update…',exact:true}).isVisible());await p.getByRole('button',{name:'Close',exact:true}).click();
 await p.evaluate(()=>{const replacement=document.createElement('div');replacement.className='tsv-window';replacement.innerHTML='<div class="tsv-central-toolbar"></div>';document.querySelector('.tsv-window').replaceWith(replacement)});
 await entry.waitFor();await entry.click();assert.ok(await dialog.isVisible());
 assert.equal(await p.locator('[data-tsix-manager-open]').count(),1);assert.equal(await p.locator('#tsix-manager').count(),1);
 checks.push('Update button and dialog recover after toolbar, host and window replacement while retaining update state');
 const beforeChange=await p.evaluate(()=>requests.length);await p.getByRole('button',{name:'Update…',exact:true}).click();
 await set({configured:true,available:'0.12.0',message:'Version 0.12.0 is available.'});assert.equal(await p.getByRole('heading').innerText(),'TS6 Enhanced');assert.equal(await p.evaluate(()=>requests.length),beforeChange);
 await set({configured:true,legacy:false,message:'Couldn’t check for updates. Try again.',detail:'Download failed: <img src=x onerror=alert(1)>'});assert.equal(await p.locator('details').getAttribute('open'),null);assert.equal(await p.locator('#tsix-manager img').count(),0);await p.getByText('Details',{exact:true}).click();assert.match(await p.locator('details').innerText(),/Download failed/);
 await p.getByRole('button',{name:'Check for updates',exact:true}).click();assert.equal(await p.evaluate(()=>requests.at(-1).action),'check');
 await set({configured:true,busy:true,message:'Downloading update…'});assert.ok(await p.getByRole('button',{name:'Uninstall…',exact:true}).isDisabled());assert.equal(await p.locator('details').isVisible(),false);
 await p.setViewportSize({width:360,height:480});const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=360&&box.y+box.height<=480);
 checks.push('Error details are optional and escaped; busy actions are disabled; the dialog fits 360px width');
 await set({legacy:false});await p.getByRole('button',{name:'Uninstall…',exact:true}).click();assert.match(await dialog.innerText(),/Restores your previous appearance/);await p.getByRole('button',{name:'Cancel',exact:true}).click();
 await p.evaluate(source);await p.evaluate(source);assert.equal(await p.locator('[data-tsix-manager-open]').count(),1);assert.equal(await p.locator('#tsix-manager').count(),1);
 await p.evaluate(()=>__tsixManager.dispose());assert.equal(await p.locator('#tsix-manager,[data-tsix-manager-open]').count(),0);assert.deepEqual(errors,[]);checks.push('Fresh-install wording, repeated attachment and cleanup preserve the action contract without duplicate UI');
 // Exercise the live stylesheet against a real browser DOM with inert media.
 await p.setContent('<head><link id="userStyle" href="tsui://extension/local.tsix.layout/layout.css"></head><body><video></video></body>');
 await p.evaluate(()=>{window.originalVideo=document.querySelector('video');window.calls={refresh:0,sync:0};window.__tsixWorkspace={refresh(){calls.refresh++}};window.__tsixStreams={sync(){calls.sync++},dispose(){throw Error('Audio helper must not be disposed')}}});
 const renderer={evaluate:expression=>p.evaluate(expression)};
 assert.equal(await applyLiveStyles(renderer,':root{--tsix-layout-version:2.0.0;color:red}','2.0.0'),true);
 assert.ok(await p.evaluate(()=>document.querySelector('video')===originalVideo));
 await p.evaluate(()=>Object.defineProperty(document,'fullscreenElement',{configurable:true,value:document.querySelector('video')}));
 assert.equal(await applyLiveStyles(renderer,':root{--tsix-layout-version:2.0.0;color:red}','2.0.0'),true,'An already-active style stays completed during fullscreen');
 assert.equal(await applyLiveStyles(renderer,':root{--tsix-layout-version:2.0.1}','2.0.1'),false);
 await p.evaluate(()=>delete document.fullscreenElement);
 await assert.rejects(applyLiveStyles(renderer,':root{color:blue}','2.0.1'),/version did not match/);
 assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()),'2.0.0');
 await p.evaluate(()=>document.getElementById('userStyle').href='tsui://extension/another.theme/style.css');
 await p.waitForFunction(()=>document.getElementById('tsix-live-release-style').media==='not all');
 assert.equal(await applyLiveStyles(renderer,':root{--tsix-layout-version:2.0.1}','2.0.1'),false);
 await p.evaluate(()=>document.getElementById('userStyle').href='tsui://extension/local.tsix.layout/layout.css');
 await p.waitForFunction(()=>document.getElementById('tsix-live-release-style').media==='all');
 assert.ok(await p.evaluate(()=>document.querySelector('video')===originalVideo));
 await p.evaluate(()=>__tsixLiveStyles.dispose());assert.equal(await p.locator('#tsix-live-release-style').count(),0);
 checks.push('Live CSS preserves media elements, rolls back a wrong version and respects manual theme changes');
 await p.evaluate(()=>{window.tsclient_internal={getClientLibVersion:callback=>setTimeout(()=>callback(null,1791901251),100)}});
 const gc=await p.context().newCDPSession(p);
 const pendingBuild=readClientBuild(renderer);await gc.send('HeapProfiler.collectGarbage');assert.equal(await pendingBuild,1791901251);
 let attempts=0;assert.equal(await readClientBuild({evaluate(expression){if(++attempts===1)throw Error('Promise was collected');return p.evaluate(expression)}}),1791901251);assert.equal(attempts,2);
 await p.evaluate(()=>{tsclient_internal.getClientLibVersion=()=>{}});
 await assert.rejects(readClientBuild(renderer),/did not answer its version check/);
 await gc.detach();checks.push('Native version callback survives garbage collection, retries a collected promise and times out cleanly when the bridge does not answer');
 // Real document/context recreation and CDP detach, with only the native
 // bridge and origin supplied by a local fixture. No TeamSpeak reload occurs.
 await p.route('http://tsix-recovery.test/**',route=>route.fulfill({contentType:'text/html',body:`<main><div class="tsv-window"><div class="tsv-central-toolbar"></div><video></video></div></main><script>
 window.tsclient_internal={getClientLibVersion:callback=>callback(null,1791901251)};
 document.querySelector('.tsv-window').__vue__={windowLayout:{},collapseSidebar(){},$watch(){return()=>{}}};
 document.querySelector('main').__vue__={appearanceSettings:{}};
 </script>`}));
 await p.goto('http://tsix-recovery.test/');
 const abort=new AbortController(),recoveries=[],requests=[];let connection,attachment=0,removeRequest;
 const following=maintainSession({signal:abort.signal,retryMs:10,open:async()=>{
  const session=await p.context().newCDPSession(p);let closed=false;const onClose=[];
  connection={send:(...args)=>session.send(...args),async evaluate(expression){const result=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value},
   on(method,callback){const handler=params=>{if(method==='Runtime.executionContextCreated'&&params.context.origin==='http://tsix-recovery.test')params={...params,context:{...params.context,origin:'tsui://default'}};callback(params)};session.on(method,handler);return()=>session.off(method,handler)},
   onClose(callback){onClose.push(callback)},close(){if(closed)return;closed=true;session.detach().catch(()=>{});for(const callback of onClose)callback()}}
  return connection;
 },attach:async(c,id)=>{
  await attachSession(c,{refreshTree:()=>assert.fail('Disabled theme should not refresh native trees')});
  await c.send('Runtime.addBinding',{name:'__tsixMaintenanceRequest',executionContextId:id});
  await c.evaluate(source);const token='generation-'+(++attachment);
  await c.evaluate(`__tsixManager.setState(${JSON.stringify({...base,configured:true,legacy:false})},${JSON.stringify(token)})`);
  removeRequest?.();removeRequest=c.on('Runtime.bindingCalled',event=>{if(event.executionContextId===id)requests.push(JSON.parse(event.payload))});
 },onState:state=>{recoveries.push(state.status)}});
 let followError;following.catch(error=>{followError=error});
 const waitReady=async count=>{const until=Date.now()+8000;while(recoveries.filter(s=>s==='ready').length<count){if(followError)throw followError;if(Date.now()>until)throw Error('Recovery did not become ready');await new Promise(r=>setTimeout(r,25))}};
 try{
  await waitReady(1);
  await p.evaluate(()=>{window.savedHelpers={workspace:__tsixWorkspace,streams:__tsixStreams,video:document.querySelector('video')};window.disposals=0;for(const helper of [__tsixWorkspace,__tsixStreams])helper.dispose=()=>{disposals++;throw Error('Healthy helper was disposed')}});
  await attachSession(connection);await attachSession(connection);
  assert.ok(await p.evaluate(()=>savedHelpers.workspace===__tsixWorkspace&&savedHelpers.streams===__tsixStreams&&savedHelpers.video===document.querySelector('video')&&disposals===0));
  connection.close();await waitReady(2);
  assert.ok(await p.evaluate(()=>savedHelpers.workspace===__tsixWorkspace&&savedHelpers.streams===__tsixStreams&&savedHelpers.video===document.querySelector('video')&&disposals===0));
  await p.reload();await waitReady(3);
  assert.equal(await p.locator('[data-tsix-manager-open]').count(),1);assert.equal(await p.locator('#tsix-manager').count(),1);
  assert.ok(await p.evaluate(()=>!!__tsixWorkspace&&!!__tsixStreams));
  await p.locator('[data-tsix-manager-open]').click();await p.getByRole('button',{name:'Check for updates',exact:true}).click();
  await p.waitForTimeout(50);assert.equal(requests.length,1);assert.equal(requests[0].action,'check');assert.equal(requests[0].nonce,'generation-'+attachment);
  assert.deepEqual(errors,[]);
 }finally{abort.abort();await following;removeRequest?.()}
 checks.push('Renderer reload and CDP reconnect restore one updater with a fresh binding; repeat attachment and reconnect preserve existing helpers and media nodes without disposal');
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Native icon and trusted browser input with a recording-only bridge; no real restart or removal'},null,2));
}finally{await browser.close()}
