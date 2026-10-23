// Real Web Audio signal and rendered controls; no TS6 account or live media.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href : 'playwright');
const routes=new Map([
 ['/',new URL('./stream-tray.html',import.meta.url)],
 ['/layout.css',new URL('../theme/layout.css',import.meta.url)],
 ['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]
]);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname,file=routes.get(path);
 if(!file){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html');
 res.end(await readFile(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--mute-audio','--autoplay-policy=no-user-gesture-required'],...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const errors=[],checks=[];
try {
 const page=await browser.newPage({viewport:{width:1322,height:847}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 await page.addInitScript(()=>{
  const NativeAudioContext=window.AudioContext;
  window.audioGraphs=[];
  window.AudioContext=class extends NativeAudioContext {
   createMediaStreamSource(stream){const source=super.createMediaStreamSource(stream);window.audioGraphs.push({context:this,source});return source}
   createGain(){const gain=super.createGain(),analyser=super.createAnalyser();gain.connect(analyser);this.testGain=gain;this.testAnalyser=analyser;return gain}
  };
 });
 const url=`http://127.0.0.1:${server.address().port}/?incoming=1&volume-test=1&model=beta5`;
 await page.goto(url);assert.equal(page.url(),url);assert.match(await page.title(),/stream tray fixture/);
 assert.ok(await page.locator('.ts-chat-container').isVisible());
 const input=page.locator('[data-tsix-tray-tile="focused"] input[type="range"]');
 const info=()=>page.evaluate(()=>{const vm=lab.refs.a.querySelector('.video-stream').__vue__,g=audioGraphs.at(-1);return {percent:Number(document.querySelector('[data-tsix-tray-tile="focused"] input[type="range"]').value),native:vm.session.volume,muted:vm.session.muted,video:vm.videoRef.volume,gain:g?.context.testGain.gain.value,context:g?.context.state,identity:lab.report().identity}});
 const set=async(value)=>{await input.fill(String(value));await page.waitForFunction(value=>Number(document.querySelector('[data-tsix-tray-tile="focused"] input[type="range"]').value)===value,value)};
 assert.equal(await input.getAttribute('max'),'300');assert.equal((await info()).percent,50);
 await set(75);assert.equal((await info()).native,.75);assert.equal((await info()).video,.75);
 assert.equal(await page.evaluate(()=>audioGraphs.length),0);
 checks.push('0–100% uses native playback without an audio graph');
 await set(300);await page.waitForFunction(()=>audioGraphs.at(-1)?.context.testGain.gain.value===3);
 let r=await info();assert.equal(r.native,1);assert.equal(r.video,0);assert.equal(r.context,'running');assert.ok(r.identity);
 const rms=()=>page.evaluate(()=>{const a=audioGraphs.at(-1).context.testAnalyser,b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.sqrt(b.reduce((sum,n)=>sum+n*n,0)/b.length)});
 await page.waitForFunction(()=>{const a=audioGraphs.at(-1).context.testAnalyser,b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);const rms=Math.sqrt(b.reduce((s,n)=>s+n*n,0)/b.length);return rms>.10&&rms<.12});
 const full=await rms();assert.ok(full>.09&&full<.12,`300% RMS: ${full}`);
 await set(150);await page.waitForFunction(()=>audioGraphs.at(-1).context.testGain.gain.value===1.5);
 // Wait for the analyser's full sample window to reflect the new gain.
 await page.waitForFunction(()=>{const a=audioGraphs.at(-1).context.testAnalyser,b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);const rms=Math.sqrt(b.reduce((s,n)=>s+n*n,0)/b.length);return rms>.051&&rms<.055});
 const half=await rms();assert.ok(full/half>1.8&&full/half<2.2);
 checks.push('real audio samples at 300% have twice the amplitude of 150%; native video is silent');
 await input.press('End');await page.waitForFunction(()=>audioGraphs.at(-1).context.testGain.gain.value===3);
 await input.press('ArrowLeft');assert.equal((await info()).percent,299);
 await input.press('End');
 const mute=page.locator('[data-tsix-tray-tile="focused"] .screen-overlay__hero-actions__action-volume-wrapper > .tsv-button');
 await mute.click();await page.waitForFunction(()=>audioGraphs.at(-1).context.testGain.gain.value===0);assert.equal((await info()).percent,0);
 await mute.click();await page.waitForFunction(()=>audioGraphs.at(-1).context.testGain.gain.value===3);assert.equal((await info()).percent,300);assert.equal((await info()).video,0);
 checks.push('keyboard reaches 300%; native mute silences boost and unmute restores it');
 for(const [width,height] of [[1322,847],[640,480]]) {
  await page.setViewportSize({width,height});
  await page.waitForFunction(()=>lab.vm.maximumWidth===document.querySelector('main').clientWidth);
  assert.ok(await input.evaluate(n=>{const b=n.getBoundingClientRect();return b.width>=40&&b.left>=0&&b.right<=innerWidth&&n===document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)}));
  if(process.env.TSIX_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/stream-volume-${width}.png`});
 }
 checks.push('rendered slider and 300% label fit desktop and narrow viewports');
 if(process.env.TSIX_SCREENSHOT_DIR) {
  await page.setViewportSize({width:1322,height:847});
  await page.getByRole('button',{name:'Hide other streams',exact:true}).click();
  await page.locator('[data-tsix-tray-tile="focused"] .screen-overlay__hero-actions__action-volume-wrapper').screenshot({path:`${process.env.TSIX_SCREENSHOT_DIR}/stream-volume-control.png`});
 }
 await set(50);assert.equal((await info()).video,.5);await page.waitForFunction(()=>audioGraphs.at(-1).context.state==='closed');
 await set(300);await page.waitForFunction(()=>audioGraphs.at(-1).context.testGain.gain.value===3);
 await page.evaluate(()=>{const v=lab.refs.a.querySelector('video');v.srcObject=v.srcObject.clone();for(const w of lab.watchers){const n=w.get();if(n!==w.value){w.value=n;w.cb()}}});
 await page.waitForFunction(()=>audioGraphs.at(-1).context.state==='closed');assert.equal((await info()).percent,100);assert.equal((await info()).video,1);
 checks.push('returning below 100% and replacing media close the graph and restore native playback');
 await set(300);await set(25);await page.waitForFunction(()=>audioGraphs.at(-1).context.state==='closed');assert.equal((await info()).video,.25);
 await page.evaluate(()=>{const v=lab.refs.a.querySelector('video');for(const t of v.srcObject.getAudioTracks())v.srcObject.removeTrack(t)});
 await input.fill('300');await page.waitForFunction(()=>document.querySelector('[data-tsix-tray-tile="focused"] input[type="range"]').value==='100');
 assert.match(await input.getAttribute('title'),/no audio track/);assert.equal((await info()).video,1);
 checks.push('rapid changes and unavailable audio fail back to native playback');
 await page.evaluate(()=>window.__tsixStreams.dispose());
 assert.equal(await page.locator('[data-tsix-volume-control],[data-tsix-native-volume]').count(),0);
 assert.equal(await page.evaluate(()=>lab.watchers.size),0);
 assert.ok(await page.evaluate(()=>audioGraphs.every(g=>g.context.state==='closed')));
 assert.deepEqual(errors,[]);
 checks.push('disposal restores native sliders, releases watchers and closes every context; no console errors');
 await page.goto(url+'&native-audio=1');
 await set(300);r=await info();assert.equal(r.percent,300);assert.equal(r.native,3);assert.equal(r.video,1);
 assert.equal(await page.evaluate(()=>audioGraphs.length),0);
 await mute.click();assert.equal((await info()).muted,true);assert.equal((await info()).video,0);
 await mute.click();assert.equal((await info()).native,3);assert.equal((await info()).video,1);
 await input.press('Home');assert.equal((await info()).native,0);assert.equal((await info()).muted,true);
 await input.press('End');assert.equal((await info()).native,3);assert.equal((await info()).muted,false);
 await page.evaluate(()=>{const v=lab.refs.a.querySelector('video');v.srcObject=v.srcObject.clone();for(const w of lab.watchers){const n=w.get();if(n!==w.value){w.value=n;w.cb()}}});
 assert.equal((await info()).native,3);assert.equal((await info()).percent,300);
 await set(300);
 await page.evaluate(()=>{document.documentElement.style.setProperty('--tsix-stream-stage-api','0');window.__tsixStreams.sync()});
 assert.equal(await page.evaluate(()=>lab.refs.a.querySelector('.video-stream').__vue__.session.volume),1);
 assert.equal(await page.locator('[data-tsix-volume-control]').count(),0);
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--tsix-stream-stage-api');window.__tsixStreams.sync()});
 await set(300);
 await page.evaluate(()=>window.__tsixStreams.dispose());
 assert.equal(await page.evaluate(()=>lab.refs.a.querySelector('.video-stream').__vue__.session.volume),1);
 assert.equal(await page.locator('[data-tsix-volume-control],[data-tsix-native-volume]').count(),0);
 assert.equal(await page.evaluate(()=>lab.watchers.size),0);assert.deepEqual(errors,[]);
 checks.push('TS6 video-only transport sends native gain 3, keeps HTML volume legal across refs, and resets on removal');
 console.log(JSON.stringify({passed:checks.length,checks,signal:{rms300:full,rms150:half},errors},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r))}
