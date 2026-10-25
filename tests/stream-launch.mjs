// Render the supported client's unmodified launch template with its exact Vue
// runtime. Capture/session services are synthetic; no client is launched.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {clientPath} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const bundle=await readFile(`${clientPath}/html/client_ui/main.js`,'utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
const module=id=>{const signature=`${id}:(e,t,n)=>{`,start=bundle.indexOf(signature)+signature.length;assert.ok(start>=signature.length);const end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(end);return bundle.slice(start,start+end.index)};
const launch=module(28312),renderStart=launch.indexOf('const D=(0,w.A)(M,')+'const D=(0,w.A)(M,'.length;
assert.ok(renderStart>20);
const render=launch.slice(renderStart,launch.lastIndexOf(',[],!1,null,'));
assert.ok(render.startsWith('function()')&&render.endsWith('}'));
const source=await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8');
const nativeCSS=await readFile(`${clientPath}/html/client_ui/main.css`,'utf8');
// Load the bundled dark-theme variables using the CSS-loader interface only.
const darkExports={},cssRequire=id=>id===76314?()=>[]:{};
cssRequire.r=()=>{};cssRequire.n=value=>()=>value;
cssRequire.d=(target,props)=>{for(const [key,get]of Object.entries(props))Object.defineProperty(target,key,{get})};
new Function('e','t','n',module(8165))({id:8165},darkExports,cssRequire);
const darkCSS=darkExports.default.map(entry=>entry[1]).join('\n');
const css=await readFile(new URL('../theme/layout.css',import.meta.url),'utf8');
const checks=[],errors=[];
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
try {
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text())});
 await page.route('http://launch.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:'<title>TS6 native launch regression</title><main class="tsv-window"><div id="mount"></div></main>'});
  // Native styles reference their bundled fonts. Serve only local assets.
  if(/^\/[a-f0-9]+\.(woff2?|ttf)$/.test(path))return route.fulfill({body:await readFile(`${clientPath}/html/client_ui${path}`)});
  return route.fulfill({status:204});
 });
 await page.goto('http://launch.test/');
 await page.addStyleTag({content:nativeCSS});await page.addStyleTag({content:darkCSS});await page.addStyleTag({content:css});
 await page.addStyleTag({content:'body{margin:0;background:#101827;color:var(--tsv-font-color);font:14px Segoe UI,sans-serif}.tsv-window{height:100vh}.tsv-modal-overlay-inner{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}.setup-stream__preview{background:#172a37}button,input{color:inherit;font:inherit}'});
 await page.evaluate(({vue,render})=>{
  const exports={},require=()=>{throw Error('Unexpected Vue dependency')};require.r=()=>{};require.d=(target,props)=>{for(const [key,get]of Object.entries(props))Object.defineProperty(target,key,{get,enumerable:true})};
  new Function('e','t','n',vue)({},exports,require);const Vue=Object.values(exports).find(value=>value?.version==='2.7.16');
  window.Vue=Vue;
  const words={'video.setup.section.basic':'Basic Settings','video.setup.section.advanced':'Advanced Settings','video.preset':'Preset','video.audio.apps.title':'Application Audio','video.audio':'Capture Audio','video.privacy':'Privacy','video.resolution':'Resolution','video.fps':'FPS','video.bitrate':'Bitrate','video.audio.bitrate':'Audio Bitrate [Kbps]','video.viewer_limit':'Viewer Limit','video.mode.title':'Connection Mode','video.action.go_live':'Go Live','universal.back':'Back','universal.cancel':'Cancel','universal.apply':'Apply','video.action.change_source':'Change Source','universal.next':'Next','video.sources.apps':'Applications','video.sources.screens':'Screens','video.sources.cameras':'Cameras','video.setup.unsaved_changes':'Unsaved changes','video.stream.minimized':'Minimized','video.error.no_available_source':'No available sources'};
  Vue.prototype.$t=key=>words[key]||key;Vue.prototype.$tc=(key)=>words[key]||key;Vue.prototype.TSIcon={};
  Vue.directive('better-tooltip',{});
  const Button={props:['disabled'],render(h){return h('button',{class:'tsv-button',attrs:{disabled:this.disabled},on:{click:event=>this.$emit('click',event)}},this.$slots.default)}};
  const Segments={props:['segments','value'],render(h){return h('div',{class:'tsv-segmented-control'},(this.segments||[]).map(segment=>h('button',{class:['tsv-segmented-button',{'active':segment.key===this.value}],attrs:{disabled:segment.disabled},on:{click:()=>this.$emit('input',segment.key)}},segment.title)))}};
  const Toggle={props:['value','disabled'],render(h){return h('label',[this.$slots.default,h('input',{attrs:{type:'checkbox',disabled:this.disabled},domProps:{checked:this.value},on:{change:event=>this.$emit('input',event.target.checked)}})])}};
  const NumberInput={props:['value','minimum','maximum'],render(h){return h('label',[h('input',{attrs:{type:'number',min:this.minimum,max:this.maximum},domProps:{value:this.value},on:{input:event=>this.$emit('input',Number(event.target.value))}}),this.$slots.default])}};
  const segments=values=>values.map((value,index)=>({key:index+1,title:String(value)}));
  const saved={quality:{width:1920,height:1080,fps:30,bitrate:5000000,audioBitrate:192000},config:{access:0,viewerLimit:0,audio:true,mode:0},writes:0};
  const media=new MediaStream();
  window.lab={saved,original:JSON.stringify(saved),media,publishes:0,applies:0,refreshes:0,advancedWrites:0,closes:0};
  const options={name:'ts-setup-stream-modal',_scopeId:'data-v-bacc622e',
   components:{'ts-button':Button,'ts-segmented-control':Segments,'ts-toggle':Toggle,'ts-input-number':NumberInput,TSExpander:Toggle,'ts-icon':{render:h=>h('span')},'app-audio-select-list':{render:h=>h('div','Selected application audio')},TsLoader:{render:h=>h('span','Loading')}},
   data:()=>({data:{editSession:null},settingsOpen:true,sortedSources:{windows:{arr:[{sourceId:'1',title:'Chrome'}]},screens:{arr:[]},cameras:{arr:[]}},
    preview:{id:1,quality:{...saved.quality},config:{...saved.config},sourceInfo:{name:'Chrome'},isLoading:false,framesFlowing:true,isPublishable:true},
    paused:false,minimized:false,mediaStream:media,isPublishing:false,collapsedMode:false,advanced:true,currentTab:'windows',tabsCollapsed:false,selected:null,
    audioEnabled:true,useAppAudio:true,screenshareAppAudioCaps:{perAppGain:true},capturableApps:[],appAudioForList:{},configAppAudioScope:'0',
    presetSegments:segments(['360','480','720','1080','1440','Source','Presentation']),selectedPreset:4,displayedSegments:0,
    showPrivacySetting:true,privacyModeSegments:[{key:'0',title:'Public'},{key:'1',title:'Contacts'},{key:'2',title:'Private'}],configPrivacyMode:'0',
    resolutionSegments:segments(['360','480','720','1080','1440','Source']),resolutionLevel:4,fpsSegments:segments(['5','30','60']),fpsLevel:2,
    audioBitrateSegments:segments(['64','96','128','192','256','320']),audioBitrateLevel:4,bitrate:5000,
    serverModeSegments:[{key:'0',title:'P2P'},{key:'1',title:'Server',disabled:true}],configServerMode:'0',isEditingSession:false,hasUnsavedChanges:false}),
   computed:{advancedMode:{get(){return this.advanced},set(value){this.advanced=value;lab.advancedWrites++}}},
   methods:{onTrackFitParentRef(){},onPreviewRef(element){if(element&&element.srcObject!==this.mediaStream)element.srcObject=this.mediaStream},onAppAudioInput(){},
    goLive(){if(!this.preview.isPublishable||this.isPublishing)return;if(!this.settingsOpen){this.settingsOpen=true;return}if(this.isEditingSession)lab.applies++;else lab.publishes++},
    onBackOrClose(){if(this.settingsOpen)this.settingsOpen=false;else lab.closes++},onClose(){},onScrollAreaRef(){},addIntersectionObserver(){},
    switchTab(value){if(this.sortedSources[value].arr.length)this.currentTab=value},
    selectSource(kind,value){if(lab.selections)lab.selections.push({kind,id:value.sourceId||value.uniqueName});this.selected=value;this.preview.sourceInfo={id:value.sourceId||value.uniqueName,type:kind};this.preview.isPublishable=true;this.settingsOpen=true}},
   render:new Function('return ('+render+')')()
  };
  lab.mount=()=>{const target=document.createElement('div');document.querySelector('main').append(target);lab.vm=new Vue(options).$mount(target);return lab.vm.$nextTick()};
  lab.close=()=>{lab.vm.$destroy();lab.vm.$el.remove()};
  lab.mount();
 },{vue:module(62893),render});

 const dialog=page.locator('.ts-setup-stream');await dialog.waitFor();
 assert.equal(page.url(),'http://launch.test/');assert.equal(await page.title(),'TS6 native launch regression');
 const launchState=()=>page.evaluate(()=>{
  const dialog=document.querySelector('.ts-setup-stream');
  return {html:dialog.outerHTML,geometry:[...dialog.querySelectorAll('.setup-stream__preview-wrapper,.setup-stream__settings,.setup-stream__actions')].map(element=>{
   const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
  })};
 });
 const nativeLaunch=await launchState();
 await page.evaluate(()=>{lab.originalVideo=document.querySelector('video');lab.originalPreview=lab.vm.preview;lab.originalHandler=lab.vm.goLive});
 await page.evaluate(source);await page.evaluate(()=>__tsixStreams.sync());
 assert.deepEqual(await launchState(),nativeLaunch);
 assert.ok(await page.getByText('Preset',{exact:true}).isVisible());
 assert.ok(await page.getByText('Bitrate',{exact:true}).isVisible());
 assert.ok(await page.getByText('Application Audio',{exact:true}).isVisible());
 assert.ok(await page.getByText('Privacy',{exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>lab.advancedWrites),0);
 checks.push('Attaching the sharing helper preserves the native launch DOM, layout, settings visibility and advanced-mode choice');
 if(process.env.TSIX_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/native-launch.png`});
 await page.evaluate(()=>{lab.vm.useAppAudio=false;lab.vm.isPublishing=true});
 assert.ok(await page.locator('.setup-stream__settings-section').first().getByRole('checkbox').isDisabled());
 assert.ok(await page.getByRole('button',{name:'Go Live',exact:true}).isDisabled());
 await page.evaluate(()=>{lab.vm.useAppAudio=true;lab.vm.isPublishing=false});
 assert.ok(await page.evaluate(()=>lab.originalVideo===document.querySelector('video')&&lab.originalVideo.srcObject===lab.media&&lab.originalPreview===lab.vm.preview&&lab.originalHandler===lab.vm.goLive));
 await page.getByRole('button',{name:'Go Live',exact:true}).click();
 assert.equal(await page.evaluate(()=>lab.publishes),1);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.locator('.thumbnail-grid').waitFor();
 // Compare the source picker with the helper fully detached as well as attached.
 await page.evaluate(()=>__tsixStreams.dispose());const nativePicker=await launchState();
 await page.evaluate(source);await page.evaluate(()=>__tsixStreams.sync());
 assert.deepEqual(await launchState(),nativePicker);
 assert.equal(await page.locator('[data-tsix-source-heading],[data-tsix-launch-summary]').count(),0);
 if(process.env.TSIX_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/native-source-picker.png`});
 await page.getByText('Chrome',{exact:true}).click();await page.locator('.setup-stream__settings').waitFor();
 await page.evaluate(()=>{lab.vm.data.editSession={};lab.vm.isEditingSession=true;lab.vm.hasUnsavedChanges=true});
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 assert.equal(await page.evaluate(()=>lab.applies),1);assert.equal(await page.evaluate(()=>lab.publishes),1);
 checks.push('Source picker remains native; Back, source selection, publish, edit/Apply and disabled controls retain their handlers');
 const beforeReattach=await launchState();
 await page.evaluate(source);await page.evaluate(source);await page.evaluate(()=>__tsixStreams.dispose());
 assert.deepEqual(await launchState(),beforeReattach);
 assert.equal(await page.evaluate(()=>JSON.stringify(lab.saved)),await page.evaluate(()=>lab.original));
 assert.equal(await page.evaluate(()=>lab.advancedWrites),0);
 checks.push('Reattachment and disposal preserve native controls, saved defaults and media identity');
 // Check the exact manager methods against the minimal context used by the
 // sharing bar, including navigation to a server, a direct chat and a popout.
 const manager=module(78768),nativeMethods=manager.slice(manager.indexOf('openSettings(e){'),manager.indexOf('openViewers(e){'));
 const navigation=await page.evaluate(nativeMethods=>{
  const calls=[],channel={name:'channel'},room={name:'room'},session={client:{channel},idData:{server:true}},direct={idData:{roomId:7}};
  const controller={showItem:(...args)=>calls.push(['server',...args]),showMatrixRoom:(...args)=>calls.push(['chat',...args]),events:{onInvokeModalOverlayEmitter:{fire:event=>calls.push(['settings',event.data.item===channel,event.data.editSession===session,event.data.settingsOpenOnStart])}}};
  const backend={Ay$:{getStreamPopupParams:value=>value.popup?{originalUrl:'tsui://existing-popup'}:null,tschat_manager:{getRoomById:id=>id===7?room:null}},VIT:{Ok:0}};
  const native={focusPopupWindow:(url,callback)=>{calls.push(['popup',url]);callback(0)}};
  const methods=new Function('i','d','g','h','m','c','n','tsclient_internal','return new class {'+nativeMethods+'}')(
   backend,{Id:{sharedInstance:()=>controller}},{$F:value=>!!value.server},{He:{Pop:()=>calls.push(['pop'])}},()=>({warn:()=>{throw Error('Unexpected navigation error')}}),{p:value=>value===session},()=>{},native);
  for(const value of [session,direct,{popup:true}])methods.goToStream.call({data:null},value);
  methods.openSettings.call({data:null},session);
  return calls;
 },nativeMethods);
 assert.deepEqual(navigation,[['pop'],['server',{name:'channel'},'Chat'],['pop'],['chat',{name:'room'},true,true,true],['pop'],['popup','tsui://existing-popup'],['pop'],['settings',true,true,true]]);
 checks.push('Exact native manager handlers accept the sharing-bar context for server/chat navigation, existing popout focus and editing the original session');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Exact native Vue, launch render and CSS; synthetic source/session services'},null,2));
}finally{await browser.close()}
