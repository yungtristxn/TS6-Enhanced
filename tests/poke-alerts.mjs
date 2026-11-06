// Installed beta5 poke contract plus the owned poke sound with synthetic
// pokes. No server is contacted, no sound device is opened.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {clientPath as client} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const bundle=await readFile(`${client}/html/client_ui/main.js`,'utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
const checks=[],errors=[];
// Exact vendor code, except § stands for a minified module alias: those change
// between client builds while the code itself stays the same.
const nativeHas=text=>new RegExp(text.split('§').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[$\\w]+')).test(bundle);
// Every connection fires one text-message event; a poke uses target mode 4.
assert.ok(bundle.includes('e[e.CLIENT=1]="CLIENT",e[e.CHANNEL=2]="CHANNEL",e[e.SERVER=3]="SERVER",e[e.POKE=4]="POKE"'));
assert.ok(nativeHas('const l={sc_handler:this,targetMode:t,invoker:a,target:o,message:§};§.Ay$.eventSystem._onTextMessage.fire(l)'));
assert.ok(nativeHas('this._onTextMessage=new §.v,this.onTextMessage=this._onTextMessage.event'));
assert.ok(bundle.includes('a={dispose:()=>{'),'Emitter subscriptions are disposable');
checks.push('The installed client reports pokes from every connection through one disposable event');
// Sound: TeamSpeak's own file and playback path, recorded in lastPlayed.
assert.ok(bundle.includes('[a.nA.PokedFromAnotherClient,{soundFile:"you_were_poked"}]'));
assert.ok(nativeHas('this.lastPlayed.set(d,h),§.Ay$.audio.playNotificationSound(d)'));
assert.ok(bundle.includes('get soundNotifications(){return this._soundNotifications}'));
assert.ok(bundle.includes('playNotificationSound(e){tsclient_internal.playWaveFile(0,e,'));
assert.ok(nativeHas('const l=§.Ay$.audio.audioSettings[§.bV.Out].notificationsDevice;if(l&&"none"===l.id)return'));
await access(`${client}/html/client_ui/sound/default/you_were_poked.wav`);
// Taskbar flash: the native poke notice flashes only for the open server tab.
assert.ok(nativeHas('e.sc_handler===this.serverConnectionHandler&&e.targetMode===§.b0b.POKE&&e.target.id===e.sc_handler.ownClient.id&&this.handlePokeNotification('));
assert.ok(nativeHas('§.Id.sharedInstance().workflowSettings.flashTaskBarOnPoke&&!document.hasFocus()&&tsclient_internal.tsnotifications_flashTaskbar(()=>{})'));
checks.push('The poke sound is TeamSpeak’s own you_were_poked file, played through the same notification path that records lastPlayed');
const features=await readFile(new URL('../tools/features-runtime.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../tools/poke-runtime.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<title>TS6 poke sound</title><main></main>');
 // The runtime may attach before the client API is ready.
 await page.evaluate(features);await page.evaluate(runtime);
 assert.equal(await page.evaluate(()=>__tsixPokes.status().subscribed),false);
 await page.evaluate(()=>{
  const listeners=[];
  const lab=window.lab={played:[],listeners,own:{id:7},
   api:{eventSystem:{onTextMessage(fn){listeners.push(fn);return {dispose:()=>listeners.splice(listeners.indexOf(fn),1)}}},
    soundNotifications:{lastPlayed:new Map},
    audio:{audioSettings:{0:{notificationsDevice:{id:'default'}},1:{}},playNotificationSound(file){lab.played.push(file)}}},
   fire(event){for(const fn of [...listeners])fn(event)}};
  lab.handler={ownClient:lab.own,properties:{name:'Gaming Server'}};
  lab.poke=(nickname,message,extra={})=>{lab.api.soundNotifications.lastPlayed.clear();lab.fire({sc_handler:lab.handler,targetMode:4,invoker:nickname?{id:3,nickname}:null,target:lab.own,message,...extra})};
  lab.flashes=0;window.tsclient_internal={tsnotifications_flashTaskbar(){lab.flashes++}};
  document.querySelector('main').__vue__={$root:{_vm:{tsapi:lab.api},appController:{workflowSettings:{flashTaskBarOnPoke:true}}}};
 });
 await page.waitForFunction(()=>__tsixPokes.status().subscribed);
 checks.push('The helper waits for the client API before subscribing');
 const played=()=>page.evaluate(()=>lab.played.length);
 await page.evaluate(()=>lab.poke('Alex','Get in'));
 assert.deepEqual(await page.evaluate(()=>lab.played),['you_were_poked']);assert.equal(await page.evaluate(()=>__tsixPokes.status().sound),'played');
 assert.equal(await page.locator('body *:not(main)').count(),0,'No popup or other element is added');
 // TeamSpeak already played the sound: do not double it.
 await page.evaluate(()=>{lab.api.soundNotifications.lastPlayed.set('you_were_poked',Date.now());lab.fire({sc_handler:lab.handler,targetMode:4,invoker:{nickname:'Sam'},target:lab.own,message:''})});
 assert.equal(await played(),1);assert.equal(await page.evaluate(()=>__tsixPokes.status().sound),'native');
 checks.push('A poke plays TeamSpeak’s poke sound once, without adding any UI, and not again when TeamSpeak already played it');
 // Not pokes, or pokes to someone else, are ignored; host pokes count.
 await page.evaluate(()=>{lab.api.soundNotifications.lastPlayed.clear();lab.fire({sc_handler:lab.handler,targetMode:1,invoker:{nickname:'Alex'},target:lab.own,message:'hi'});lab.poke('Alex','x',{target:{id:9}})});
 assert.equal(await played(),1);
 await page.evaluate(()=>lab.poke(null,'Restart in 5 minutes'));assert.equal(await played(),2);
 checks.push('Private messages and pokes sent to other clients are ignored; host messages delivered as pokes play the sound');
 await page.evaluate(()=>{__tsixFeatures.set('pokeSound',false);lab.poke('Alex','quiet')});
 assert.equal(await played(),2);assert.equal(await page.evaluate(()=>__tsixPokes.status().received),4);
 await page.evaluate(()=>{__tsixFeatures.set('pokeSound',true);lab.api.audio.audioSettings[0].notificationsDevice.id='none';lab.poke('Alex','none')});
 assert.equal(await played(),2);assert.equal(await page.evaluate(()=>__tsixPokes.status().sound),'off');
 checks.push('The Poke sound switch turns it off, and a notification device of “None” stays silent');
 // Taskbar flash only in the background, following TeamSpeak's setting and the switch.
 const flashes=()=>page.evaluate(()=>lab.flashes);
 await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true});lab.flashes=0;lab.poke('Alex','focused')});
 assert.equal(await flashes(),0);
 await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{value:()=>false,configurable:true});lab.poke('Alex','background')});
 assert.equal(await flashes(),1);
 await page.evaluate(()=>{document.querySelector('main').__vue__.$root.appController.workflowSettings.flashTaskBarOnPoke=false;lab.poke('Alex','setting off')});
 assert.equal(await flashes(),1);
 await page.evaluate(()=>{document.querySelector('main').__vue__.$root.appController.workflowSettings.flashTaskBarOnPoke=true;__tsixFeatures.set('pokeFlash',false);lab.poke('Alex','switch off')});
 assert.equal(await flashes(),1);
 await page.evaluate(()=>{__tsixFeatures.set('pokeFlash',true);__tsixFeatures.set('pokeSound',false);lab.poke('Alex','flash only')});
 assert.equal(await flashes(),2);
 checks.push('Background pokes from any server flash the taskbar, following TeamSpeak’s “flash on poke” setting and the switch, independently of the sound');
 await page.evaluate(()=>__tsixPokes.dispose());
 assert.equal(await page.evaluate(()=>lab.listeners.length),0);
 checks.push('Disposal unsubscribes');
 assert.deepEqual(errors,[]);
} finally {
 await browser.close();
}
for(const check of checks)console.log('PASS '+check);
