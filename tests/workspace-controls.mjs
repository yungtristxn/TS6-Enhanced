// Isolated interaction tests for the native-control keyboard adapter. No TS6
// client, account, microphone, sharing or server connections are involved.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const runtime=await readFile(new URL('../tools/workspace-runtime.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const errors=[],checks=[];
try {
 const page=await browser.newPage({viewport:{width:640,height:600}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<!doctype html><title>Workspace keyboard fixture</title>
 <style>:root{--tsix-workspace-api:1} .tsv-tool-button,.tsv-segmented-button{display:inline-flex;padding:12px;gap:12px}.tsv-tool-button-context-menu-toggle{padding:8px}</style>
 <div class="tsv-window"><div class="main-pane-layout"><div class="tsv-tool-button" id="audio" title="Original title"><span>Audio</span><div class="tsv-tool-button-context-menu-toggle" id="menu">Options</div></div><div class="tsv-central-toolbar"><div class="tsv-tool-button" id="share" aria-label="Native sharing">Share</div></div></div>
 <div class="tsv-activity-detail"><div class="tsv-segmented-button active" id="chat"><svg name="mode-chat"></svg>Chat</div><div class="tsv-segmented-button" id="info"><svg name="mode-info"></svg>Info</div></div></div>`);
 await page.evaluate(()=>{
  window.calls={audio:0,menu:0,chat:0,info:0,coords:null};
  document.querySelector('.tsv-window').__vue__={collapseSidebar(){},$watch(){return()=>{}}};
  document.querySelector('#audio').__vue__={button:{title:'Toggle speakers',disabled:false}};
  const sharing={title:'Sharing'};
  document.querySelector('.tsv-central-toolbar').__vue__={screenshareButton:sharing};
  document.querySelector('#share').__vue__={button:sharing};
  for(const id of ['audio','menu','chat','info'])document.getElementById(id).addEventListener('click',e=>{
   e.stopPropagation();calls[id]++;calls.coords=[e.clientX,e.clientY];
   if(id==='info'||id==='chat'){document.querySelectorAll('.tsv-segmented-button').forEach(n=>n.classList.toggle('active',n.id===id))}
  });
 });
 await page.evaluate(runtime);
 assert.equal(await page.locator('#share').getAttribute('data-tsix-keyboard'),null);
 assert.equal(await page.locator('#share').getAttribute('aria-label'),'Native sharing');
 checks.push('The stream helper retains exclusive ownership of the native sharing button');
 const audio=page.locator('#audio'), menu=page.locator('#menu');
 assert.equal(await audio.getAttribute('aria-label'),'Toggle speakers');
 await audio.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
 assert.equal(await page.evaluate(()=>calls.audio),2);
 checks.push('Enter and Space activate the native action exactly once');
 await menu.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
 assert.deepEqual(await page.evaluate(()=>[calls.audio,calls.menu]),[2,2]);
 const r=await menu.boundingBox(),coords=await page.evaluate(()=>calls.coords);
 assert.ok(coords[0]>=r.x&&coords[0]<=r.x+r.width&&coords[1]>=r.y&&coords[1]<=r.y+r.height);
 checks.push('Split-button keyboard activation opens only its menu at its own coordinates');
 await audio.focus();await page.keyboard.down('Space');await menu.focus();await page.keyboard.up('Space');
 assert.deepEqual(await page.evaluate(()=>[calls.audio,calls.menu]),[2,2]);
 checks.push('Moving focus cancels a pending Space activation');
 await page.evaluate(()=>{document.querySelector('#audio').__vue__.button.disabled=true;document.querySelector('#audio').classList.add('tsv-is-disabled')});
 await page.waitForFunction(()=>document.querySelector('#audio').getAttribute('aria-disabled')==='true');
 assert.equal(await audio.getAttribute('tabindex'),'-1');assert.equal(await menu.getAttribute('tabindex'),'-1');
 await audio.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>calls.audio),2);
 checks.push('Disabled actions and their menus cannot be activated with the keyboard');
 await page.locator('#info').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#info').getAttribute('aria-pressed')==='true');
 assert.equal(await page.locator('#chat').getAttribute('aria-pressed'),'false');
 checks.push('View switching updates the announced active state');
 await page.evaluate(()=>{window.saved=document.querySelector('#menu');saved.remove()});
 await page.waitForFunction(()=>!saved.hasAttribute('data-tsix-keyboard'));
 await page.evaluate(()=>{document.querySelector('#audio').append(saved)});
 await page.waitForFunction(()=>saved.hasAttribute('data-tsix-keyboard'));
 await page.evaluate('window.__tsixWorkspace.dispose()');
 assert.equal(await page.locator('[data-tsix-keyboard]').count(),0);
 assert.equal(await audio.getAttribute('title'),'Original title');assert.equal(await audio.getAttribute('role'),null);
 await page.evaluate(runtime);await page.evaluate(runtime);
 await page.locator('#info').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>calls.info),2);
 await page.evaluate(()=>{const style=document.createElement('style');style.textContent=':root{--tsix-workspace-api:0}';document.head.append(style)});
 await page.waitForFunction(()=>!document.querySelector('[data-tsix-keyboard]'));
 checks.push('Removed controls, disposal, reattachment and theme disable restore attributes and listeners');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
} finally {await browser.close()}
