// Scroll to zoom on the focused/single/fullscreen stream, with real wheel input
// over synthetic canvas streams in the beta5 stage fixture. No client launched.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {settleLayout} from './browser-settle.mjs';
import {streamsRuntime} from '../tools/streams/bundle.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./stream-tray.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/streams-runtime.js',streamsRuntime]]);
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname,f=routes.get(path);if(!f){res.writeHead(404).end();return}res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(typeof f==='function'?await f():await readFile(f))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})}),errors=[],checks=[];
try{
 const p=await browser.newPage({viewport:{width:1322,height:847}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 const open=async(query='')=>{
  await p.goto(`http://127.0.0.1:${server.address().port}/?model=beta5&incoming=1${query}`);await p.locator('[data-tsix-tray-toggle],.video-stream').first().waitFor();
  await p.waitForFunction(()=>[...document.querySelectorAll('.video-stream > video')].every(v=>v.videoWidth>0));await settleLayout(p);
  // Count wheel events that still reach TeamSpeak's grid (it pages on wheel).
  await p.evaluate(()=>{window.gridWheels=0;document.querySelector('.tsv-screenshare').addEventListener('wheel',()=>gridWheels++)});
 };
 const video=id=>p.locator(`[data-tsix-test-id="${id}"]`);
 const mark=()=>p.evaluate(()=>{for(const [id,tile] of Object.entries(lab.refs))tile.querySelector('.video-stream > video')?.setAttribute('data-tsix-test-id',id)});
 // The element box, the letterboxed picture inside it, and the visible part of
 // the picture (fractions) from the owned object-view-box.
 const geometry=id=>p.evaluate(id=>{
  const v=document.querySelector(`[data-tsix-test-id="${id}"]`),r=v.getBoundingClientRect(),box={left:r.left,top:r.top,width:r.width,height:r.height};
  const fit=Math.min(box.width/v.videoWidth,box.height/v.videoHeight),pw=v.videoWidth*fit,ph=v.videoHeight*fit;
  const picture={left:r.left+(box.width-pw)/2,top:r.top+(box.height-ph)/2,width:pw,height:ph};
  // Chromium serialises inset() in CSS box shorthand (1-4 values).
  const values=(v.style.objectViewBox.match(/-?[\d.]+%/g)||['0%']).map(n=>parseFloat(n)/100);
  const [top,right=top,bottom=top,left=right]=values;
  return {scale:1/(1-left-right),view:{left,top,right,bottom},box,picture,zoomed:v.parentElement.hasAttribute('data-tsix-zoomed'),chip:v.parentElement.querySelector('[data-tsix-zoom]')?.textContent??null,viewBox:v.style.objectViewBox,transform:v.style.transform,overflow:[...document.querySelectorAll('.video-stream')].every(n=>n.scrollWidth<=n.clientWidth+1)};
 },id);
 const wheelAt=async(id,fx,fy,deltaY,modifiers=[])=>{const g=await geometry(id),x=g.picture.left+g.picture.width*fx,y=g.picture.top+g.picture.height*fy;await p.mouse.move(x,y);for(const k of modifiers)await p.keyboard.down(k);await p.mouse.wheel(0,deltaY);for(const k of modifiers)await p.keyboard.up(k);await p.waitForTimeout(150);return {x,y}};
 // The fixture starts with stream "a" focused among three.
 await open();await mark();
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');
 const before=await geometry('a');assert.equal(before.scale,1);
 const at=await wheelAt('a',0.3,0.4,-300);let g=await geometry('a');
 assert.ok(g.scale>1.6&&g.scale<2.5,`One wheel step zooms in (${g.scale})`);
 assert.ok(Math.abs(1/(1-g.view.top-g.view.bottom)-g.scale)<0.01,'The picture keeps its aspect');
 assert.deepEqual(g.box,before.box,'The video keeps its box');assert.equal(g.transform,'');
 assert.ok(g.zoomed);assert.equal(g.chip,`${g.scale.toFixed(1)}×`);
 // The picture point under the pointer stays under the pointer.
 const fx=(at.x-before.picture.left)/before.picture.width,fy=(at.y-before.picture.top)/before.picture.height;
 assert.ok(Math.abs(g.view.left+fx/g.scale-fx)<0.002&&Math.abs(g.view.top+fy/g.scale-fy)<0.002,'Zoom is anchored at the pointer');
 assert.equal(await p.evaluate(()=>gridWheels),0,'The wheel over the focused stream no longer pages the grid');
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');
 checks.push('Scrolling over the focused stream zooms towards the pointer, shows the level and no longer pages the grid');
 // From 1x, zooming at the very corner shows that corner at the 5x limit.
 await wheelAt('a',0.5,0.5,6000);await wheelAt('a',0.995,0.995,-6000);g=await geometry('a');
 assert.ok(Math.abs(g.scale-5)<0.001,'Zoom stops at 5x');assert.equal(g.chip,'5.0×');
 for(const edge of ['left','top','right','bottom'])assert.ok(g.view[edge]>=-1e-6,`Zooming at a corner never shows past the picture's ${edge} edge`);
 assert.ok(g.view.right<0.01&&g.view.bottom<0.01,'Zooming at the bottom-right corner shows that corner');
 assert.ok(g.overflow,'Nothing grows past a player');
 await wheelAt('a',0.5,0.5,6000);g=await geometry('a');
 assert.deepEqual({scale:g.scale,zoomed:g.zoomed,chip:g.chip,viewBox:g.viewBox},{scale:1,zoomed:false,chip:null,viewBox:''});
 checks.push('Zoom stops at 5x, never shows past the picture edges, and scrolling back out restores the untouched player');
 // The chip resets without a focus click, fullscreen or drag underneath.
 await wheelAt('a',0.5,0.5,-400);await p.locator('[data-tsix-zoom]').click();await p.waitForTimeout(250);
 g=await geometry('a');assert.equal(g.zoomed,false);assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');assert.equal(await p.evaluate(()=>document.fullscreenElement),null);
 await wheelAt('a',0.5,0.5,-400);await p.locator('[data-tsix-zoom]').focus();await p.keyboard.press('Enter');await p.waitForTimeout(250);
 assert.equal((await geometry('a')).zoomed,false);assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');
 checks.push('The level chip resets the zoom by mouse or keyboard without changing focus or entering fullscreen');
 // Dragging a zoomed picture moves the view by the dragged distance, without a
 // tile drag, focus click or fullscreen; it stops at the picture's edges.
 await wheelAt('a',0.5,0.5,-600);const z=await geometry('a');assert.ok(z.scale>2);
 await p.evaluate(()=>{window.tileDowns=0;document.querySelector('.tsv-screenshare').addEventListener('mousedown',()=>tileDowns++)});
 const cx=z.picture.left+z.picture.width/2,cy=z.picture.top+z.picture.height/2;
 await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+60,cy+40,{steps:6});await p.mouse.move(cx+120,cy+80,{steps:6});
 assert.equal(await p.evaluate(()=>document.querySelector('[data-tsix-panning]')?.tagName??null),'DIV','The player shows a grabbing cursor while dragging');
 await p.mouse.up();await p.waitForTimeout(300);
 let moved=await geometry('a');
 assert.ok(Math.abs(moved.scale-z.scale)<1e-6,'Dragging keeps the zoom level');
 assert.ok(Math.abs(z.view.left-moved.view.left-120/(z.picture.width*z.scale))<0.003,'Dragging right moves the view left by the dragged distance');
 assert.ok(Math.abs(z.view.top-moved.view.top-80/(z.picture.height*z.scale))<0.003,'Dragging down moves the view up by the dragged distance');
 assert.deepEqual(await p.evaluate(()=>({downs:tileDowns,focused:lab.focused?.uniqueIdentifier,fullscreen:!!document.fullscreenElement,panning:!!document.querySelector('[data-tsix-panning]')})),{downs:0,focused:'a',fullscreen:false,panning:false});
 await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+3000,cy+3000,{steps:4});await p.mouse.up();await p.waitForTimeout(300);
 moved=await geometry('a');assert.ok(moved.view.left<1e-4&&moved.view.top<1e-4,'Dragging past the edge stops at the picture corner');
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');
 // A plain click (no drag) still reaches TeamSpeak: it returns to the grid, which resets the zoom.
 await p.mouse.click(cx,cy);await p.waitForTimeout(350);await p.evaluate(()=>__tsixStreams.sync());
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier??null),null);assert.equal((await geometry('a')).zoomed,false);
 // Returning to the grid by click holds the grid until the next real input: refocus by clicking.
 await settleLayout(p);const grid=await geometry('a');await p.mouse.click(grid.picture.left+grid.picture.width/2,grid.picture.top+grid.picture.height/2);await p.waitForTimeout(350);await settleLayout(p);
 assert.equal(await p.evaluate(()=>lab.focused?.uniqueIdentifier),'a');
 checks.push('Dragging a zoomed picture moves the view and stops at its edges, without a tile drag, focus change or fullscreen; a plain click still returns to the grid');
 // Grid previews keep TeamSpeak's wheel; Ctrl+wheel is left alone.
 const wheelsBefore=await p.evaluate(()=>gridWheels);await wheelAt('b',0.5,0.5,-300);
 assert.equal((await geometry('b')).scale,1);assert.equal(await p.evaluate(()=>gridWheels),wheelsBefore+1);
 await wheelAt('a',0.5,0.5,-300,['Control']);assert.equal((await geometry('a')).scale,1);
 checks.push('Unfocused previews and Ctrl+wheel keep TeamSpeak’s own wheel behaviour');
 // Leaving focus resets; the switch turns it off and resets an active zoom.
 await wheelAt('a',0.5,0.5,-400);assert.equal((await geometry('a')).zoomed,true);
 await p.evaluate(()=>{lab.focus(null);__tsixStreams.sync()});await settleLayout(p);
 assert.equal((await geometry('a')).zoomed,false,'Returning to the grid resets the zoom');
 await p.evaluate(()=>{lab.focus(lab.vm.allSessions[0]);__tsixStreams.sync()});await settleLayout(p);
 await wheelAt('a',0.5,0.5,-400);assert.equal((await geometry('a')).zoomed,true);
 await p.evaluate(()=>{window.__tsixFeatures={enabled:id=>id!=='streamZoom'};window.dispatchEvent(new Event('tsix-features'))});await p.waitForTimeout(100);
 assert.equal((await geometry('a')).zoomed,false,'Turning the switch off resets the zoom');
 await wheelAt('a',0.5,0.5,-400);assert.equal((await geometry('a')).scale,1,'With the switch off the wheel does not zoom');
 await p.evaluate(()=>{delete window.__tsixFeatures;window.dispatchEvent(new Event('tsix-features'))});
 checks.push('Returning to the grid or turning the switch off resets the zoom; with the switch off nothing zooms');
 // A single stream zooms without being focused; disposal restores the player.
 await open('&single');await mark();await p.evaluate(()=>{lab.focus(null);__tsixStreams.sync()});await settleLayout(p);
 await wheelAt('a',0.5,0.5,-400);assert.equal((await geometry('a')).zoomed,true,'The only stream on the stage zooms');
 await p.evaluate(()=>__tsixStreams.dispose());
 g=await geometry('a');assert.deepEqual({scale:g.scale,zoomed:g.zoomed,chip:g.chip},{scale:1,zoomed:false,chip:null});
 await wheelAt('a',0.5,0.5,-400);assert.equal((await geometry('a')).scale,1,'A disposed helper leaves the wheel alone');
 checks.push('The only stream on the stage zooms without focus; disposing the helper restores the player and the wheel');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Stage fixture with synthetic canvas streams and real wheel input; no client launched'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
