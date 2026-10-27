import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {nativeSessionProtocol} from './session-native-contract.mjs';
import {clientPath} from './client-path.mjs';
const bundle=await readFile(clientPath+'/html/client_ui/main.js','utf8'),signature='62893:(e,t,n)=>{',start=bundle.indexOf(signature)+signature.length;
const end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(start>=signature.length&&end);
const vueSource=bundle.slice(start,start+end.index);
const source=await readFile(new URL('../tools/session-runtime.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(source=>{const exports={},require=()=>{throw Error('Unexpected Vue dependency')};require.r=()=>{};require.d=(target,props)=>{for(const [key,get]of Object.entries(props))Object.defineProperty(target,key,{get})};new Function('e','t','n',source)({},exports,require);window.Vue=Object.getOwnPropertyNames(exports).map(key=>exports[key]).find(value=>value?.version==='2.7.16');if(!Vue)throw Error('Missing native Vue runtime')},vueSource);
 async function setup({restarted=false,missingSource=false,wrongServer=false,wrongOwner=false,wrongSelf=false,wrongChannel=false,failedView=false,moveDuringCreate=false,expireDuringCreate=false}={}){
  await page.setContent('<main></main>');
  await page.evaluate(({restarted,missingSource,wrongServer,wrongOwner,wrongSelf,wrongChannel,failedView,moveDuringCreate,expireDuringCreate})=>{
   const events=[],workflow={restoreOpenedActivities:!restarted,autoConnectSkipActivityCheck:restarted?0:1};
   const info={address:'fixture.invalid',port:9987,identity:'identity-fixture',nickname:'Fixture',server_password:'fixture-secret',default_channel_id:'7',default_channel_password:''};
   const remote={isInbound:true,idData:{serverSessionId:'remote-session'},client:{properties:{uniqueIdentifier:wrongOwner?'different-owner':'remote-user'}},status:restarted?0:4,volume:1.7,muted:true,hidden:false,
    join(){events.push(['join',this.volume,this.muted]);if(window.lab.holdJoin)return new Promise(resolve=>{lab.finishJoin=()=>{this.status=4;resolve()}});this.status=4;return Promise.resolve()}};
   const stream={id:40,isInbound:false,client:null,sourceInfo:{id:'1',type:2,name:'Screen 1',pixelFormat:'I420',interlaced:true},quality:{width:1920,height:1080,fps:30,bitrate:5000000,audioBitrate:192000},
    config:{bitrate:5000000,access:1,mode:1,viewerLimit:0,audio:true,appAudio:{scope:2,masterGain:1,entries:[]},name:'Screen 1',type:2},paused:false,hidden:true};
   const api={IsReady:()=>true,serverConnectionHandlers:[],defaultClientSelfProperties:{inputMuted:false,outputMuted:false},activeCallSessions:[],screenshareSupport:{appAudio:{available:true}},
    get connectedServerConnectionHandlers(){return this.serverConnectionHandlers.filter(h=>h.isEstablished)},
    get outboundStreams(){return this.serverConnectionHandlers.flatMap(h=>h.outboundStreams)},allOutboundStreams(){return this.outboundStreams},
    setActiveAudioTarget(handler){this.activeAudioTarget=handler;events.push(['active',handler.id])}};
   let ignoreExit=false;
   api.preferences={getValue:()=>ignoreExit,setValue(name,value){ignoreExit=value;events.push(['close-policy',value]);if(window.lab?.changeWhilePreparing&&!value)api.serverConnectionHandlers[0].ownClient.channel.id='9'}};
   const reactive=new Vue({data:{defaults:api.defaultClientSelfProperties,handlers:api.serverConnectionHandlers}});api.defaultClientSelfProperties=reactive.defaults;api.serverConnectionHandlers=reactive.handlers;
   const makeHandler=established=>{
     const handler={id:restarted?17:8,identifier:restarted?'new-handler':'old-handler',connectInfo:{...info},properties:{uniqueIdentifier:wrongServer?'wrong-server':'server-fixture'},isEstablished:established,isActivelyConnecting:false,isReconnecting:false,isConnecting:!established,
     ownClient:{channel:{id:wrongChannel?'9':'7',properties:{flagPassword:false}},properties:{uniqueIdentifier:wrongSelf?'different-self':'own-user',inputMuted:!established,outputMuted:!established,inputDeactivated:false,away:false,awayMessage:''}},
     outboundStreams:established?[stream]:[],joinedStreams:{inbound:established?[remote]:[]},
     Connect(value){events.push(['connect',value.default_channel_id,api.defaultClientSelfProperties.inputMuted,api.defaultClientSelfProperties.outputMuted]);this.connectInfo=value;this.isEstablished=true;this.isActivelyConnecting=false},
     FindChannel:id=>wrongChannel?null:{id,properties:{}},RequestMoveClientsToChannel(clients,channel){this.ownClient.channel=channel;return Promise.resolve()},
     GetInboundSession(value){events.push(['lookup']);return value.serverSessionId==='remote-session'&&!lab.missingInbound?remote:null},
     SetClientSelfProperties(value){if(this.ownClient.channel.id!=='7')throw Error('Unmute before channel restoration');events.push(['voice',value.inputMuted,value.outputMuted]);if(lab.delayVoiceEvent)setTimeout(()=>Object.assign(this.ownClient.properties,value),50);else Object.assign(this.ownClient.properties,value);return Promise.resolve()},
     audio:{ActivateCaptureDevice(){events.push(['capture']);const finish=()=>{api.activeCallSessions=[];api.currentCaptureOwner=handler};if(lab.holdCapture)return new Promise(resolve=>{lab.finishCapture=()=>{finish();resolve()}});finish();return Promise.resolve()}}
    };handler.ownClient.channel.sc_handler=handler;stream.client={sc_handler:handler};return handler;
   };
   const app={workflowSettings:workflow,connections:[],applyWorkflowSettings(value){Object.assign(this.workflowSettings,value);events.push(['preferences',value.restoreOpenedActivities,value.autoConnectSkipActivityCheck])},
    openConnection(value){const handler=makeHandler(false);api.serverConnectionHandlers.push(handler);const activity={serverConnectionHandler:handler};this.connections.push(activity);return activity},
    restoreOpenedActivities(){events.push(['tabs']);if(restarted&&!this.connections.length){this.connections.push({connectInfo:{...info},suspended:true,serverConnectionHandler:null,async spawnServerConnectionHandler(){this.suspended=false;this.serverConnectionHandler=makeHandler(false);api.serverConnectionHandlers.push(this.serverConnectionHandler);this.serverConnectionHandler.Connect(this.connectInfo)}})}},
    showItem(channel,mode){events.push(['view',channel.id,mode]);if(failedView)return Promise.reject(Error('navigation failed'));mountView(channel.sc_handler,restarted?'':'Unsent Grüße 🎮')}};
   const drafts=new Map();api.chatInputCache={mappedInputs:drafts,getCachedInputForIdentifier:key=>drafts.get(key),setCachedInputForIdentifier:(key,value)=>drafts.set(key,value),clearCachedInputForIdentifier:key=>drafts.delete(key)};
   function mountView(handler,text){
    document.querySelectorAll('.tsv-screenshare,.ts-chat-input-container').forEach(node=>node.remove());
    const view=document.createElement('div');view.className='tsv-screenshare';view.__vue__={item:handler.ownClient.channel,flatTiles:[{tile:{id:restarted?'new-remote':'old-remote',payload:{session:remote}}}]};
    view.__vue__.item.layoutMode={kind:restarted?'auto':'focus',tileId:'old-remote'};document.querySelector('main').append(view);
    const editor=document.createElement('div');editor.className='ts-chat-input-container';editor.__vue__={chat:{GetUniqueChatIdentifier:()=> '7#'+handler.identifier},chatInputField:{underlyingContent:text},get chatInputText(){return this.chatInputField.underlyingContent},previewItems:[],attachmentItems:[]};document.querySelector('main').append(editor);
   }
   if(!restarted){const handler=makeHandler(true);api.serverConnectionHandlers.push(handler);app.connections.push({serverConnectionHandler:handler});api.activeAudioTarget=handler;api.currentCaptureOwner=handler;mountView(handler,'Unsent Grüße 🎮')}
   document.querySelector('main').__vue__={$root:{appController:app,_vm:{tsapi:api}},$watch(get,callback,options){const callbacks=window.lab.recoveryCallbacks;callbacks.add(callback);const stop=reactive.$watch(get,callback,options);return()=>{stop();callbacks.delete(callback)}}};
   window.tsclient_internal={
    getJsonBlob(name,callback){callback(0,JSON.stringify({workflow:app.workflowSettings}))},
    setSubscribedScreenshotWhitelist(...args){args.at(-1)()},
    subscribeAvailableSourcesWithScreenshots(callback){events.push(['sources']);const finish=()=>callback(0,{screens:{arr:missingSource?[]:[{sourceId:'1',title:'DISPLAY1'}]},windows:{arr:[{sourceId:'140',title:'Window fixture'}]},cameras:{arr:[]}});if(lab.holdSources)lab.finishSources=finish;else finish()},
    unsubscribeAvailableSourcesWithScreenshots(callback){callback()},
    postMessage(message,callback){
     events.push([message.cmd,message.payload]);
     if(message.cmd==='createOutboundSession'){if(moveDuringCreate)api.serverConnectionHandlers[0].ownClient.channel.id='999';if(expireDuringCreate){const expired=Date.now()+61000;Date.now=()=>expired}callback({err:0,payload:{session:{sessionId:41}}});return}
     if(message.cmd==='publishSession'){const handler=api.serverConnectionHandlers.find(h=>h.id===message.payload.sessionIdentifier.scHandlerId);handler.outboundStreams.push({id:41,hidden:false,paused:true,client:handler.ownClient});}
     if(message.cmd==='pauseSession'){const session=api.outboundStreams.find(s=>s.id===message.payload.id);if(session)session.paused=message.payload.isPaused}
     callback({err:0,payload:{}});
    }
   };
   window.lab={app,api,events,remote,stream,recoveryCallbacks:new Set(),recovered:[]};
   window.__tsixSessionRecovered=(id,indices)=>lab.recovered.push({id,indices});
   window.__tsixStreams={volumeForSession:session=>session.volume,restoreVolume(session,value){events.push(['volume',value]);session.volume=value}};
   window.__tsixSessionGuard={supported:true,early:true,active:restarted,release(){this.active=false;return{restoreOpenedActivities:true,autoConnectSkipActivityCheck:1}}};
  },{restarted,missingSource,wrongServer,wrongOwner,wrongSelf,wrongChannel,failedView,moveDuringCreate,expireDuringCreate});
  await page.evaluate(source);
 }
 await setup();const snapshot=await page.evaluate(()=>__tsixUpdateSession.capture());
 assert.equal(snapshot.connections[0].channelId,'7');assert.equal(snapshot.connections[0].voice.inputMuted,false);
 assert.equal(snapshot.connections[0].outbound[0].source.id,'1');assert.equal(snapshot.connections[0].inbound[0].volume,1.7);
 await page.evaluate(value=>__tsixUpdateSession.prepare(value),snapshot);
 assert.deepEqual(await page.evaluate(()=>lab.app.workflowSettings),snapshot.workflow);
 assert.equal(await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.inputMuted),false);
 await page.evaluate(value=>__tsixUpdateSession.cancel(value),snapshot);
 assert.deepEqual(await page.evaluate(()=>lab.app.workflowSettings),snapshot.workflow);
 checks.push('Captures channel, voice, sources, watched streams, focus and drafts; preparation and cancellation leave the live session and saved preferences unchanged');
 await setup({restarted:true});let result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.deepEqual(result,{warnings:[],preferencesRestored:true,draftsRestored:true,recoveredDrafts:[0]});
 let events=await page.evaluate(()=>lab.events);
 const savedStream=snapshot.connections[0].outbound[0];
 const nativeCalls=await nativeSessionProtocol(savedStream.source,savedStream.quality,savedStream.config,17);
 assert.deepEqual(events.filter(e=>['createOutboundSession','publishSession'].includes(e[0])).map(([cmd,payload])=>({cmd,payload})),nativeCalls);
 assert.deepEqual(events.find(e=>e[0]==='connect'),['connect','7',true,true]);
 assert.equal(events.find(e=>e[0]==='publishSession')[1].sessionIdentifier.scHandlerId,17);
 assert.deepEqual(events.find(e=>e[0]==='join'),['join',1,true]);
 assert.deepEqual(events.find(e=>e[0]==='volume'),['volume',1.7]);
 assert.ok(events.findIndex(e=>e[0]==='voice')>events.findIndex(e=>e[0]==='connect'));
 assert.ok(events.findIndex(e=>e[0]==='voice')<events.findIndex(e=>e[0]==='sources'));
 assert.ok(events.findIndex(e=>e[0]==='voice')<events.findIndex(e=>e[0]==='join'));
 assert.deepEqual(events.find(e=>e[0]==='voice'),['voice',false,false]);
 assert.ok(events.findIndex(e=>e[0]==='pauseSession'&&e[1].isPaused===true)<events.findIndex(e=>e[0]==='publishSession'));
 assert.equal(await page.evaluate(()=>lab.api.outboundStreams[0].hidden),true);
 assert.equal(await page.evaluate(()=>document.querySelector('.ts-chat-input-container').__vue__.chatInputField.underlyingContent),'Unsent Grüße 🎮');
 assert.equal(await page.evaluate(()=>document.querySelector('.tsv-screenshare').__vue__.item.layoutMode.tileId),'new-remote');
 assert.deepEqual(await page.evaluate(()=>lab.app.workflowSettings),snapshot.workflow);
 checks.push('Reconnects muted, validates the original identity/channel, restores voice immediately, then recovers the original shared and watched streams');
 await setup({restarted:true});
 await page.evaluate(snapshot=>{lab.holdSources=true;lab.delayVoiceEvent=true;lab.restorePromise=__tsixUpdateSession.restore({snapshot,restoreSession:true}).then(result=>lab.restoreResult=result)},snapshot);
 await page.waitForFunction(()=>typeof lab.finishSources==='function');
 assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
 assert.equal(await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.inputMuted),false);
 assert.equal(await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.outputMuted),false);
 assert.equal(await page.locator('[data-tsix-restart-pending]').count(),0);
 assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='createOutboundSession')),false);
 await page.evaluate(()=>lab.finishSources());await page.waitForFunction(()=>!!lab.restoreResult);
 assert.deepEqual(await page.evaluate(()=>lab.restoreResult.warnings),[]);
 checks.push('Microphone, speakers and global mute indicators are restored before slow source discovery, including delayed native voice acknowledgements; input is already unlocked');
 await setup({restarted:true});
 await page.evaluate(snapshot=>{lab.missingInbound=true;lab.realNow=Date.now;lab.restorePromise=__tsixUpdateSession.restore({snapshot,restoreSession:true}).then(result=>lab.restoreResult=result).finally(()=>Date.now=lab.realNow)},snapshot);
 await page.waitForFunction(()=>lab.events.some(e=>e[0]==='lookup'));
 assert.equal(await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.inputMuted),false);
 assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
 assert.equal(await page.locator('[data-tsix-restart-pending]').count(),0);
 await page.evaluate(()=>{const advanced=Date.now()+16000;Date.now=()=>advanced});await page.waitForFunction(()=>!!lab.restoreResult);
 assert.match((await page.evaluate(()=>lab.restoreResult.warnings)).join(' '),/watched stream is no longer available/);
 assert.equal(await page.evaluate(()=>lab.events.filter(e=>e[0]==='voice').length),1);
 checks.push('An unavailable watched stream retains its existing timeout/warning but never delays unmute or repeats the audio restore');
 await setup({restarted:true});
 const mutedSnapshot=structuredClone(snapshot);mutedSnapshot.defaults={inputMuted:true,outputMuted:true};mutedSnapshot.connections[0].voice.inputMuted=true;mutedSnapshot.connections[0].voice.outputMuted=true;
 result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),mutedSnapshot);
 assert.deepEqual(result.warnings,[]);assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),mutedSnapshot.defaults);
 assert.deepEqual(await page.evaluate(()=>lab.events.find(e=>e[0]==='voice')),['voice',true,true]);
 await setup({restarted:true,missingSource:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/original capture source/);
 assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='createOutboundSession')),false);
 await setup({restarted:true,wrongServer:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/server identity changed/);assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='voice'||e[0]==='publishSession')),false);
 await setup({restarted:true,wrongChannel:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/previous channel is unavailable/);assert.equal(await page.evaluate(()=>lab.events.some(e=>['voice','capture','publishSession'].includes(e[0]))),false);
 await setup({restarted:true,wrongOwner:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/stream owner changed/);assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='join')),false);
 checks.push('Missing capture sources, changed server identities and changed remote owners are reported without substituting another source or unmuting the wrong server');
 const windowSnapshot=structuredClone(snapshot),windowStream=windowSnapshot.connections[0].outbound[0];
 windowStream.source={...windowStream.source,type:3,id:'140',name:'Window fixture'};windowStream.catalogue={id:'140',title:'Window fixture'};
 for(const liveValidation of [null,false,true]){
  await setup({restarted:true});
  result=await page.evaluate(({snapshot,liveValidation})=>__tsixUpdateSession.restore({snapshot,restoreSession:true,windowMatches:{140:true},...(liveValidation===null?{}:{validateWindow:async()=>liveValidation})}),{snapshot:windowSnapshot,liveValidation});
  assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='createOutboundSession')),liveValidation===true);
 }
 checks.push('Window capture requires a fresh owner validation; an older cached match cannot authorize replay');
 for(const drafts of [[],snapshot.drafts]){
  await setup({restarted:true,wrongSelf:true});
  result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),{...snapshot,drafts});
  assert.match(result.warnings.join(' '),/user identity changed/);
  assert.equal(await page.evaluate(()=>lab.events.some(e=>['capture','voice','publishSession'].includes(e[0]))),false);
  assert.equal(await page.evaluate(()=>lab.api.chatInputCache.mappedInputs.size),0);
  assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
 }
 checks.push('A rejected own identity stays excluded from microphone, media and draft recovery, with and without saved drafts');
 await setup({restarted:true,failedView:true});
 result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/navigation failed/);
 assert.deepEqual(await page.evaluate(()=>lab.events.find(e=>e[0]==='voice')),['voice',false,false]);
 assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
 await setup({restarted:true,expireDuringCreate:true});
 result=await page.evaluate(async snapshot=>{const now=Date.now;try{return await __tsixUpdateSession.restore({snapshot,restoreSession:true})}finally{Date.now=now}},snapshot);
 assert.match(result.warnings.join(' '),/timed out/);
 assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='publishSession')),false);
 assert.deepEqual(await page.evaluate(()=>lab.events.find(e=>e[0]==='voice')),['voice',false,false]);
 assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
 checks.push('Optional navigation or later media-deadline failures do not delay or undo audio already restored on the verified channel');
 for(const action of ['global-mute','local-mute','new-call','keyboard']){
  await setup({restarted:true});
  await page.evaluate(snapshot=>{lab.holdJoin=true;lab.restorePromise=__tsixUpdateSession.restore({snapshot,restoreSession:true}).then(result=>lab.restoreResult=result)},snapshot);
  await page.waitForFunction(()=>typeof lab.finishJoin==='function');
  assert.deepEqual(await page.evaluate(()=>lab.api.defaultClientSelfProperties),snapshot.defaults);
  assert.deepEqual(await page.evaluate(()=>lab.events.find(e=>e[0]==='voice')),['voice',false,false]);
  await page.evaluate(()=>lab.intentBoundary=lab.events.length);
  if(action==='keyboard')await page.keyboard.press('m');
  else await page.evaluate(action=>{
   if(action==='global-mute'){lab.api.defaultClientSelfProperties.inputMuted=false;lab.api.defaultClientSelfProperties.inputMuted=true}
   if(action==='local-mute'){const own=lab.api.serverConnectionHandlers[0].ownClient.properties;own.inputMuted=false;own.inputMuted=true}
   if(action==='new-call'){const call={id:'new-call'};lab.api.activeCallSessions.push(call);lab.api.activeAudioTarget=call;lab.api.currentCaptureOwner=call}
  },action);
  await page.evaluate(()=>lab.finishJoin());await page.waitForFunction(()=>!!lab.restoreResult);
  assert.match((await page.evaluate(()=>lab.restoreResult.warnings)).join(' '),/session changed/);
  assert.equal(await page.evaluate(()=>lab.events.slice(lab.intentBoundary).some(event=>['capture','voice','active'].includes(event[0]))),false);
  assert.equal(await page.evaluate(()=>lab.api.defaultClientSelfProperties.inputMuted),action==='global-mute');
  if(action==='local-mute')assert.equal(await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.inputMuted),true);
  if(action==='new-call')assert.deepEqual(await page.evaluate(()=>({call:lab.api.activeCallSessions[0].id,owner:lab.api.currentCaptureOwner.id,target:lab.api.activeAudioTarget.id})),{call:'new-call',owner:'new-call',target:'new-call'});
 }
 checks.push('Real Vue sync watchers, trusted keyboard input and newly started calls cancel later capture/voice writes and preserve newer mute/target choices');
 await setup({restarted:true});
 await page.evaluate(snapshot=>{lab.holdCapture=true;lab.acceptedAudioKeys=0;document.addEventListener('keydown',()=>lab.acceptedAudioKeys++);lab.restorePromise=__tsixUpdateSession.restore({snapshot,restoreSession:true}).then(result=>lab.restoreResult=result)},snapshot);
 await page.waitForFunction(()=>typeof lab.finishCapture==='function');await page.keyboard.press('m');
 assert.equal(await page.evaluate(()=>lab.acceptedAudioKeys),0);assert.equal(await page.evaluate(()=>__tsixUpdateSession.userIntent()),false);
 await page.evaluate(()=>lab.finishCapture());await page.waitForFunction(()=>!!lab.restoreResult);
 assert.deepEqual(await page.evaluate(()=>lab.restoreResult.warnings),[]);await page.keyboard.press('m');assert.equal(await page.evaluate(()=>lab.acceptedAudioKeys),1);
 assert.equal(await page.locator('[data-tsix-restart-pending]').count(),0);
 checks.push('The early asynchronous native capture/voice commit accepts no intervening user actions and releases input immediately afterward');
 await setup();await page.evaluate(()=>lab.api.preferences.setValue('application.ignore_exit_request',true));
 const hideSnapshot=await page.evaluate(()=>__tsixUpdateSession.capture());
 await page.evaluate(snapshot=>__tsixUpdateSession.prepare(snapshot),hideSnapshot);
 assert.equal(await page.evaluate(()=>lab.api.preferences.getValue('application.ignore_exit_request')),false);
 await page.evaluate(()=>{lab.acceptedKeys=0;document.addEventListener('keydown',()=>lab.acceptedKeys++)});
 await page.keyboard.press('m');assert.equal(await page.evaluate(()=>lab.acceptedKeys),0);
 assert.equal(await page.evaluate(()=>__tsixUpdateSession.userIntent()),false);
 await page.evaluate(snapshot=>__tsixUpdateSession.cancel(snapshot),hideSnapshot);
 assert.equal(await page.evaluate(()=>lab.api.preferences.getValue('application.ignore_exit_request')),true);
 assert.equal(await page.locator('[data-tsix-restart-pending]').count(),0);
 await page.keyboard.press('m');assert.equal(await page.evaluate(()=>lab.acceptedKeys),1);
 await setup({restarted:true});await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:false}),hideSnapshot);
 assert.equal(await page.evaluate(()=>lab.api.preferences.getValue('application.ignore_exit_request')),true);
 await setup();await page.evaluate(()=>{lab.api.preferences.setValue('application.ignore_exit_request',true);lab.changeWhilePreparing=true});
 await assert.rejects(page.evaluate(snapshot=>__tsixUpdateSession.prepare(snapshot),hideSnapshot),/changed before shutdown/);
 assert.equal(await page.evaluate(()=>lab.api.preferences.getValue('application.ignore_exit_request')),true);
 assert.equal(await page.locator('[data-tsix-restart-pending]').count(),0);
 checks.push('Final commit blocks input/hotkeys, handles Hide on Close, revalidates late native changes, and restores the close preference on cancellation and expired recovery');
 await setup({restarted:true,moveDuringCreate:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({snapshot,restoreSession:true}),snapshot);
 assert.match(result.warnings.join(' '),/channel changed/);assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='publishSession')),false);
 assert.equal(await page.evaluate(()=>lab.events.slice(lab.events.findIndex(e=>e[0]==='createOutboundSession')).some(e=>e[0]==='voice')),false);
 await setup({restarted:true});result=await page.evaluate(snapshot=>__tsixUpdateSession.restore({id:'draft-recovery',snapshot,restoreSession:false}),snapshot);
 assert.equal(result.preferencesRestored,true);assert.equal(await page.evaluate(()=>lab.events.some(e=>e[0]==='connect'||e[0]==='publishSession')),false);
 assert.equal(result.draftsRestored,false);
 await page.evaluate(snapshot=>__tsixUpdateSession.restore({id:'draft-recovery',snapshot,restoreSession:false,draftOnly:true,draftIndices:[3]}),snapshot);
 await page.evaluate(snapshot=>__tsixUpdateSession.restore({id:'other-recovery',snapshot:{...snapshot,drafts:[{...snapshot.drafts[0],chatKey:'8'}]},restoreSession:false,draftOnly:true,draftIndices:[5]}),snapshot);
 await page.evaluate(async()=>{await lab.app.connections[0].spawnServerConnectionHandler();for(const callback of [...lab.recoveryCallbacks])callback()});
 assert.deepEqual(await page.evaluate(()=>lab.recovered),[{id:'draft-recovery',indices:[3]},{id:'other-recovery',indices:[5]}]);
 assert.equal(await page.evaluate(()=>lab.api.chatInputCache.getCachedInputForIdentifier('7#new-handler').message),'Unsent Grüße 🎮');
 assert.equal(await page.evaluate(()=>lab.recoveryCallbacks.size),0);
 assert.equal(await page.evaluate(()=>lab.events.some(e=>['capture','voice','publishSession'].includes(e[0]))),false);
 await setup();await page.evaluate(()=>lab.api.serverConnectionHandlers[0].ownClient.properties.inputMuted=true);
 await assert.rejects(page.evaluate(snapshot=>__tsixUpdateSession.prepare(snapshot),snapshot),/session changed/);
 await page.evaluate(()=>lab.api.activeCallSessions.push({}));
 await assert.rejects(page.evaluate(()=>__tsixUpdateSession.capture()),/private or group calls/);
 checks.push('Expired journals restore preferences only; state changes and unsupported calls block restart preparation');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Native adapter contracts with recording bridge; no live server or capture was used'},null,2));
}finally{await browser.close()}
