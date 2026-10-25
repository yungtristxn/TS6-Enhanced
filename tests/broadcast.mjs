// Browser-only state/lifecycle coverage. No live broadcasting or native APIs.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const files=new Map([['/',new URL('./broadcast.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/streams-runtime.js',new URL('../tools/streams-runtime.js',import.meta.url)]]);
const runtime=await readFile(files.get('/streams-runtime.js'),'utf8');
const server=createServer(async(req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const errors=[],checks=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1322,height:847}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
 const url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__tsixStreams);assert.equal(page.url(),url);assert.equal(await page.title(),'TS6 broadcast fixture');
 const bar=page.locator('[data-tsix-broadcast-bar]'),toggle=page.locator('[data-tsix-viewer-toggle]'),list=page.locator('[data-tsix-viewer-list]');
 const check=async(name,fn)=>{await fn();checks.push(name)};
 const screenshot=async(locator,name)=>{
  // Use the same CEF-compatible capture path as the full-window evidence;
  // Playwright's element capture can hang awaiting platform fonts here.
  const capture=await page.context().newCDPSession(page);
  try{const bounds=await locator.boundingBox();assert.ok(bounds);
   const shot=await capture.send('Page.captureScreenshot',{format:'png',clip:{...bounds,scale:1}});
   await writeFile(`${process.env.TSIX_SCREENSHOT_DIR}/${name}.png`,Buffer.from(shot.data,'base64'));
  }finally{await capture.detach()}
 };
 const shell=()=>page.evaluate(()=>[...document.querySelectorAll('.tsv-activity,.sidebar-pane-layout,.main-pane-layout,.fixtureStage,.ts-tree,.ts-server-status-bar,.fixtureFooter,.ts-chat-input-container')].map(e=>{
  const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
 }));
 const idleShell=await shell();
 await check('idle has no live indicator',async()=>assert.equal(await bar.count(),0));
 await check('hidden own stream shows real viewers without changing sessions',async()=>{
  await page.evaluate(()=>lab.start());await bar.waitFor();assert.equal(await bar.getAttribute('data-state'),'live');
  assert.equal(await toggle.getAttribute('aria-label'),'2 watching. Show viewer list');assert.match(await toggle.getAttribute('title'),/Alex Viewer\nSam Friend/);assert.equal(await page.locator('[data-tsix-viewer-icons] [data-tsix-viewer-icon]').count(),2);
  assert.deepEqual(await page.evaluate(()=>lab.report()),{actions:0,watchers:1,sameVideo:true,sameMedia:true,hidden:true,showOwn:false});
  assert.deepEqual(await shell(),idleShell,'Starting sharing must not resize or move native content');
 });
 await check('grouped controls retain readable labels, native glyphs and visible focus/press feedback',async()=>{
  const action=kind=>bar.locator(`[data-tsix-share-action="${kind}"]`);
  if(process.env.TSIX_SCREENSHOT_DIR)await screenshot(bar,'sharing-rest');
  const contrast=await bar.locator('[data-tsix-share-actions]').evaluate(group=>{
   const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const bg=luminance(getComputedStyle(group).backgroundColor);
   return [...group.querySelectorAll('button')].map(button=>{
    const fg=luminance(getComputedStyle(button).color);return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
   });
  });
  assert.ok(contrast.every(ratio=>ratio>=4.5),'Action text must contrast with the grouped background');
  assert.ok(await bar.locator('svg').evaluateAll(icons=>icons.every(icon=>icon.getAttribute('aria-hidden')==='true'&&icon.getAttribute('focusable')==='false'&&icon.childElementCount>0)));
  assert.equal(await action('open').innerText(),'Chrome — Factorio');
  for(const kind of ['pause','settings','stop']){
   const metrics=await action(kind).evaluate(button=>{
    const r=button.getBoundingClientRect(),label=button.querySelector('[data-tsix-share-label]');return {height:r.height,width:r.width,textWidth:label.scrollWidth,available:label.clientWidth};
   });
   assert.ok(metrics.height>=32&&metrics.width>=32&&metrics.textWidth<=metrics.available,`${kind}: ${JSON.stringify(metrics)}`);
  }
  await page.mouse.move(600,100);
  if(process.env.TSIX_SCREENSHOT_DIR)await screenshot(bar,'sharing-rest');
  const background=()=>action('settings').evaluate(button=>getComputedStyle(button).backgroundColor);
  const rest=await background();await action('settings').hover();const hover=await background();assert.notEqual(hover,rest);
  await page.mouse.down();const pressed=await background();assert.notEqual(pressed,hover);await page.mouse.move(600,100);await page.mouse.up();
  await action('pause').focus();await page.keyboard.press('Tab');
  assert.ok(await action('settings').evaluate(button=>button===document.activeElement&&getComputedStyle(button).outlineStyle==='solid'));
  if(process.env.TSIX_SCREENSHOT_DIR)await screenshot(bar,'sharing-focus');
  for(const kind of ['pause','stop']){
   await page.evaluate(()=>{lab.pause(true);__tsixStreams.sync()});
   await action(kind).hover();await page.mouse.down();
   const ratio=await action(kind).evaluate(button=>{
    const luminance=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const style=getComputedStyle(button),fg=luminance(style.color),bg=luminance(style.backgroundColor);
    return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
   });
   assert.ok(ratio>=4.5,`${kind} pressed contrast: ${ratio}`);
   await page.mouse.move(600,100);await page.mouse.up();
  }
  await page.evaluate(()=>{lab.pause(false);__tsixStreams.sync()});
 });
 await check('viewer list supports keyboard, Friends overlay, Escape and outside dismissal',async()=>{
  await toggle.focus();await toggle.press('Enter');await list.waitFor({state:'visible'});assert.match(await list.innerText(),/Sam Friend/);
  assert.equal(await toggle.getAttribute('aria-label'),'2 watching. Hide viewer list');
  await page.evaluate(()=>document.querySelector('.fixtureFriends').hidden=false);
  assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));
  await page.evaluate(()=>document.querySelector('.fixtureFriends').hidden=true);
  await page.keyboard.press('Escape');await list.waitFor({state:'hidden'});assert.ok(await toggle.evaluate(e=>e===document.activeElement));
  assert.equal(await toggle.getAttribute('aria-label'),'2 watching. Show viewer list');
  await toggle.click();await page.locator('.fixtureStage p').click();await list.waitFor({state:'hidden'});
 });
 await check('sharing controls expose disabled state, reject pending key input and settle without idle writes',async()=>{
  const native=page.locator('#nativeShare');
  await native.focus();await page.keyboard.down('Space');
  await page.evaluate(()=>{lab.native.__vue__.button.isDisabled=true});
  await page.keyboard.up('Space');assert.equal(await page.evaluate(()=>lab.state.actions),0);
  await page.evaluate(()=>lab.native.classList.add('tsv-is-visually-disabled'));
  await page.waitForFunction(()=>lab.native.getAttribute('aria-disabled')==='true');
  assert.equal(await native.getAttribute('aria-disabled'),'true');assert.equal(await native.getAttribute('tabindex'),'-1');
  await page.evaluate(()=>{lab.native.__vue__.button.isDisabled=false;lab.native.classList.remove('tsv-is-visually-disabled')});
  await page.waitForFunction(()=>lab.native.getAttribute('aria-disabled')==='false');
  assert.equal(await native.getAttribute('aria-disabled'),'false');assert.equal(await native.getAttribute('tabindex'),'0');
  const writes=await page.evaluate(()=>new Promise(resolve=>{
   let count=0;const observer=new MutationObserver(entries=>count+=entries.length);
   observer.observe(lab.root,{subtree:true,childList:true,attributes:true});
   for(let i=0;i<50;i++)window.__tsixStreams.sync();
   queueMicrotask(()=>{observer.disconnect();resolve(count)});
  }));
  assert.equal(writes,0,'An unchanged live badge must not keep rewriting attributes');
  const imageLoads=await page.evaluate(async()=>{
   const chat=document.createElement('div'),image=document.createElement('img');chat.className='ts-chat-container';chat.append(image);lab.root.append(chat);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const original=window.getComputedStyle;let reads=0;
   window.getComputedStyle=(node,...args)=>{if(node===document.documentElement)reads++;return original(node,...args)};
   try{
    for(let i=0;i<30;i++){image.dispatchEvent(new Event('load'));await new Promise(r=>setTimeout(r,0))}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return reads;
   }finally{window.getComputedStyle=original;chat.remove()}
  });
  assert.equal(imageLoads,0,'Chat image loads must not trigger stream reconciliation');
 });
 await check('join, leave, rename, overflow and zero viewers update reactively',async()=>{
  await page.evaluate(()=>lab.viewers([1,2,3,4,5,6]));await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-count]').textContent==='6 watching');
  await toggle.click();assert.equal(await list.locator('li').count(),6);assert.equal(await list.locator('[data-tsix-viewer-icon]').count(),6);await page.keyboard.press('Escape');
  await page.evaluate(()=>{lab.clients.get(1).displayName='A <script> Name';lab.tick()});await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-toggle]').getAttribute('title').includes('A <script> Name'));
  assert.equal(await bar.locator('script').count(),0);await page.evaluate(()=>lab.viewers([]));await page.waitForFunction(()=>document.querySelector('[data-tsix-viewer-count]').textContent==='0 watching');
  await toggle.click();assert.match(await list.innerText(),/Nobody is watching yet/);await page.keyboard.press('Escape');
 });
 await check('replacing a native split menu restores detached controls and removes their keyboard handlers',async()=>{
  await page.evaluate(()=>{
   window.menuCalls=0;window.removedMenus=[];
   const menu=document.createElement('div');menu.className='tsv-tool-button-context-menu-toggle';menu.id='sharing-menu';menu.title='Original menu';
   menu.addEventListener('click',event=>{event.stopPropagation();menuCalls++});lab.native.append(menu);
  });
  await page.waitForFunction(()=>document.querySelector('#sharing-menu').getAttribute('role')==='button');
  for(let i=0;i<5;i++){
   await page.evaluate(()=>{
    const old=document.querySelector('#sharing-menu'),next=document.createElement('div');
    next.id=old.id;next.className=old.className;next.title='Original menu';
    next.addEventListener('click',event=>{event.stopPropagation();menuCalls++});old.replaceWith(next);removedMenus.push(old);
   });
   await page.waitForFunction(()=>document.querySelector('#sharing-menu').getAttribute('role')==='button');
  }
  assert.deepEqual(await page.evaluate(()=>{
   for(const menu of removedMenus)menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
   return {calls:menuCalls,restored:removedMenus.every(menu=>!menu.hasAttribute('role')&&!menu.hasAttribute('tabindex')&&menu.title==='Original menu')};
  }),{calls:0,restored:true});
  await page.locator('#sharing-menu').press('Enter');assert.equal(await page.evaluate(()=>menuCalls),1);
  await page.locator('#sharing-menu').evaluate(node=>node.remove());
 });
 await check('paused remains visible; multiple streams deduplicate viewers',async()=>{
  await page.evaluate(()=>{lab.viewers([1,2]);lab.pause(true)});await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='paused');
  assert.deepEqual(await shell(),idleShell,'Pausing must not shift the layout');
  await page.evaluate(()=>lab.add([2,3]));await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='live');
  assert.equal(await page.locator('[data-tsix-viewer-count]').innerText(),'3 watching');assert.match(await page.locator('[data-tsix-broadcast-state]').innerText(),/Live · 2/);
 });
 await check('middle-column badge stays above Start Stream and preserves shell geometry at every size',async()=>{
  for(const [width,height,column] of [[1322,847,320],[820,600,320],[640,480,320]]){
   // This fixture has no workspace ResizeObserver. Pin both the native column
   // and navigator width to exercise the minimum supported width deliberately.
   await page.setViewportSize({width,height});await page.evaluate(column=>{lab.root.style.setProperty('--tsix-navigator-width',`${column}px`);const pane=document.querySelector('.main-pane-layout');pane.style.width=`${column}px`;pane.style.minWidth=`${column}px`},column);
   await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});const before=await shell();
   await page.evaluate(()=>lab.start([1,2,3,4,5,6]));await bar.waitFor();assert.deepEqual(await shell(),before);
   assert.ok(await bar.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('button'),br=b.getBoundingClientRect(),pane=document.querySelector('.main-pane-layout'),pr=pane.getBoundingClientRect(),footer=pane.querySelector('.ts-server-status-bar').getBoundingClientRect(),start=document.querySelector('#startStream').getBoundingClientRect();return e.parentElement===pane&&r.width<=260&&r.height>=100&&r.height<=124&&r.left===pr.left+12&&r.right<=pr.right-12&&r.left<=start.left+1&&r.right>=start.left&&r.bottom===footer.top-8&&br.left>=r.left&&br.right<=r.right&&b.contains(document.elementFromPoint(br.x+br.width/2,br.y+br.height/2))}));
   await toggle.click();assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect(),pane=document.querySelector('.main-pane-layout').getBoundingClientRect();return r.x>=pane.x&&r.y>=0&&r.right<=pane.right&&r.bottom<=document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect().top}));await page.keyboard.press('Escape');
   await page.evaluate(()=>lab.pause(true));await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').dataset.state==='paused');assert.deepEqual(await shell(),before);
   assert.ok((await bar.boundingBox()).width<=260);await page.evaluate(()=>lab.pause(false));
  }
  await page.locator('#nativeShare').click();assert.equal(await page.evaluate(()=>lab.state.actions),1);
  assert.equal(await page.locator('#nativeShare').getAttribute('aria-label'),'Pause screen sharing');
  await page.locator('#nativeShare').press('Enter');await page.locator('#nativeShare').press('Space');
  assert.equal(await page.evaluate(()=>lab.state.actions),3,'Keyboard uses the existing native action');
  await page.evaluate(()=>lab.pause(true));await page.waitForFunction(()=>lab.native.getAttribute('aria-label')==='Resume screen sharing');
  await page.evaluate(()=>lab.pause(false));
 });
 await check('pane resizing and sidebar movement keep the badge above the footer and out of chat',async()=>{
  await page.setViewportSize({width:640,height:600});await page.evaluate(()=>{lab.root.removeAttribute('data-tsix-navigator-view');__tsixStreams.sync()});
  const position=await bar.boundingBox();
  await page.locator('[aria-label="Chat draft"]').fill('Draft stays usable while sharing');
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').style.height='156px');
  assert.deepEqual(await bar.boundingBox(),position);
  await page.locator('#send').click();assert.equal(await page.locator('[aria-label="Chat draft"]').inputValue(),'Draft stays usable while sharing');
  await toggle.click();assert.ok(await list.evaluate(e=>e.getBoundingClientRect().top>=0));await page.keyboard.press('Escape');
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').hidden=true);
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>document.querySelector('.ts-chat-input-container').hidden=false);
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>{const input=document.querySelector('.ts-chat-input-container'),replacement=input.cloneNode(true);replacement.hidden=false;replacement.style.height='64px';input.replaceWith(replacement)});
  assert.deepEqual(await bar.boundingBox(),position);
  await page.evaluate(()=>{const pane=document.querySelector('.main-pane-layout');pane.style.width='220px';pane.style.minWidth='220px';document.querySelector('.sidebar-pane-layout').style.width='40px';document.querySelector('.ts-server-status-bar').style.height='80px'});
  await page.waitForFunction(()=>{const r=document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect(),p=document.querySelector('.main-pane-layout').getBoundingClientRect(),f=document.querySelector('.ts-server-status-bar').getBoundingClientRect();return r.left===p.left+12&&r.right<=p.right-12&&r.bottom===f.top-8});
  for(const paused of [true,false]){
   await page.evaluate(paused=>{lab.pause(paused);__tsixStreams.sync()},paused);
   assert.ok(await bar.locator('[data-tsix-share-actions] [data-tsix-share-label]').evaluateAll(labels=>labels.every(label=>label.scrollWidth<=label.clientWidth)),'Narrow actions must keep their complete labels');
  }
  await toggle.click();assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.main-pane-layout').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right}));await page.keyboard.press('Escape');
  await page.locator('#startStream').click();
  if(process.env.TSIX_SCREENSHOT_DIR){
   await page.setViewportSize({width:1322,height:847});await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').getBoundingClientRect().bottom===document.querySelector('.ts-server-status-bar').getBoundingClientRect().top-8);
   const capture=await page.context().newCDPSession(page);
   for(const name of ['broadcast-column','broadcast-viewers']){
    if(name==='broadcast-viewers')await toggle.click();
    const shot=await capture.send('Page.captureScreenshot',{format:'png'});await writeFile(`${process.env.TSIX_SCREENSHOT_DIR}/${name}.png`,Buffer.from(shot.data,'base64'));
   }
   await capture.detach();await page.keyboard.press('Escape');
   await screenshot(bar,'sharing-bar');
  }
 });
 await check('fullscreen keeps warning and viewer list within the fullscreen element',async()=>{
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>document.querySelector('[data-tsix-broadcast-bar]').hasAttribute('data-fullscreen'));
  assert.ok(await bar.evaluate(e=>{const r=e.getBoundingClientRect();return document.fullscreenElement.contains(e)&&r.top===12&&r.right===innerWidth-12&&r.width<=260}));await toggle.click();await list.waitFor({state:'visible'});
  assert.ok(await list.evaluate(e=>{const r=e.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight}));
  await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.querySelector('[data-tsix-broadcast-bar]').hasAttribute('data-fullscreen'));
 });
 await check('explicit actions target native sessions without touching hidden previews or media',async()=>{
  const previous=await bar.locator('[data-tsix-share-stream]').elementHandle();
  await page.evaluate(()=>{lab.start();lab.state.events=[]});
  await page.waitForFunction(node=>!node.isConnected,previous);
  const action=kind=>bar.locator(`[data-tsix-share-action="${kind}"]`);
  await action('open').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('[data-tsix-share-action="settings"]').disabled);
  await action('settings').press('Space');
  await page.waitForFunction(()=>lab.state.events.length===2,{},{timeout:3000}).catch(async error=>{throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({events:lab.state.events,error:document.querySelector('[data-tsix-share-error]').textContent,buttons:[...document.querySelectorAll('[data-tsix-share-action]')].map(b=>({action:b.dataset.tsixShareAction,disabled:b.disabled})),methods:Object.keys(lab.options.methods)}))))});
  assert.deepEqual(await page.evaluate(()=>lab.state.events),[['open',1],['settings',1]]);
  await action('pause').click();await page.waitForFunction(()=>document.querySelector('[data-tsix-share-action="pause"]').textContent==='Resume');
  assert.equal(await action('pause').innerText(),'Resume');
  assert.equal(await bar.locator('[data-tsix-share-stream]').getAttribute('data-paused'),'');
  assert.equal(await page.locator('[data-tsix-broadcast-state]').innerText(),'Paused');
  assert.deepEqual(await bar.locator('[data-tsix-share-actions] button').allTextContents(),['Resume','Settings','Stop']);
  if(process.env.TSIX_SCREENSHOT_DIR)await screenshot(bar,'sharing-paused');
  await action('pause').click();await page.waitForFunction(()=>document.querySelector('[data-tsix-share-action="pause"]').textContent==='Pause');
  await page.evaluate(()=>{lab.streams[0].data.defer=true});
  await action('pause').dblclick();await page.waitForFunction(()=>!!lab.streams[0].data.finish);
  assert.equal((await page.evaluate(()=>lab.state.events)).filter(e=>e[0]==='pause').length,3,'Pending double clicks must reach native pause only once');
  await page.waitForFunction(()=>document.querySelector('[data-tsix-share-action="pause"]').disabled);
  assert.equal(await bar.locator('[data-tsix-share-stream]').getAttribute('aria-busy'),'true');
  await page.evaluate(()=>{lab.streams[0].data.finish();lab.streams[0].data.defer=false});
  await page.waitForFunction(()=>!document.querySelector('[data-tsix-share-action="pause"]').disabled);
  await page.evaluate(()=>{lab.streams[0].data.fail=true});
  await action('stop').click();await page.waitForFunction(()=>document.querySelector('[data-tsix-share-error]').textContent.includes('Try again'));
  assert.ok(await action('stop').isEnabled());
  await page.evaluate(()=>{lab.streams[0].data.fail=false});
  assert.ok(await page.evaluate(()=>lab.report().sameMedia&&lab.report().sameVideo&&lab.report().hidden&&!lab.report().showOwn));
  await action('stop').click();await bar.waitFor({state:'detached'});
 });
 await check('multiple streams keep independent actions and removed rows cannot act on stale sessions',async()=>{
  await page.evaluate(()=>{lab.start();lab.add([2,3]);lab.state.events=[]});await bar.waitFor();
  const picker=bar.locator('[data-tsix-share-picker]'),panel=bar.locator('[data-tsix-share-list]');
  await picker.press('Enter');await panel.waitFor({state:'visible'});
  assert.equal(await panel.locator('[data-tsix-share-stream]').count(),2);
  assert.ok(await panel.locator('button').first().evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
  assert.ok(await picker.evaluate(e=>e===document.activeElement));
  await picker.press('Space');await panel.waitFor({state:'visible'});
  await panel.locator('[data-tsix-share-stream]').nth(1).locator('[data-tsix-share-action="open"]').click();
  assert.deepEqual(await page.evaluate(()=>lab.state.events),[['open',2]]);
  await panel.waitFor({state:'hidden'});assert.ok(await picker.evaluate(e=>e===document.activeElement));
  await picker.click();await panel.locator('[data-tsix-share-stream]').nth(1).locator('[data-tsix-share-action="pause"]').click();
  await page.waitForFunction(()=>lab.streams[1].data.paused);assert.equal(await page.evaluate(()=>lab.streams[0].data.paused),false);
  if(process.env.TSIX_SCREENSHOT_DIR)await screenshot(panel,'sharing-streams');
  await page.evaluate(()=>{window.staleButton=document.querySelectorAll('[data-tsix-share-action="stop"]')[1]});
  await panel.locator('[data-tsix-share-stream]').nth(1).locator('[data-tsix-share-action="stop"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-tsix-share-stream]').length===1);
  const before=await page.evaluate(()=>lab.state.events.length);await page.evaluate(()=>staleButton.click());assert.equal(await page.evaluate(()=>lab.state.events.length),before);
  assert.ok(await bar.locator('[data-tsix-share-action="open"]').isVisible());
  await page.evaluate(()=>{lab.options.methods={};__tsixStreams.sync()});
  assert.ok(await bar.locator('[data-tsix-share-action="open"]').isDisabled());assert.ok(await bar.locator('[data-tsix-share-action="settings"]').isDisabled());
 });
 await check('stream-count changes preserve keyboard focus and long disclosures fit short windows',async()=>{
  await page.evaluate(()=>{lab.options.methods.openSettings=()=>{};lab.options.methods.goToStream=()=>{};lab.start();__tsixStreams.sync()});
  const picker=bar.locator('[data-tsix-share-picker]'),panel=bar.locator('[data-tsix-share-list]');
  await bar.locator('[data-tsix-share-action="settings"]').focus();
  await page.evaluate(()=>lab.add([]));await picker.waitFor({state:'visible'});
  assert.ok(await picker.evaluate(node=>node===document.activeElement));
  await picker.press('Enter');await panel.locator('[data-tsix-share-action="settings"]').first().focus();
  await page.evaluate(()=>{lab.streams.pop();lab.state.sessions=lab.streams.map(s=>s.value);lab.tick()});
  await picker.waitFor({state:'hidden'});
  assert.ok(await bar.locator('[data-tsix-share-action="settings"]').evaluate(node=>node===document.activeElement));
  await page.setViewportSize({width:640,height:480});
  await page.evaluate(()=>{lab.viewers(Array.from({length:12},(_,i)=>i+1));for(let i=0;i<8;i++)lab.add([])});
  await picker.waitFor({state:'visible'});await picker.click();
  assert.ok(await panel.evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&node.scrollHeight>node.clientHeight}));
  const last=panel.locator('[data-tsix-share-action="stop"]').last();await last.focus();await last.scrollIntoViewIfNeeded();
  assert.ok(await last.evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('[data-tsix-share-list]').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom}));
  await page.keyboard.press('Escape');await toggle.click();
  assert.ok(await list.evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&node.scrollHeight>node.clientHeight}));
  await page.keyboard.press('Escape');
 });
 await check('theme disable, reattach and stop restore owned DOM and watchers',async()=>{
  await page.addStyleTag({content:':root{--tsix-broadcast-api:0!important}',id:'unused'}).then(e=>e.evaluate(n=>n.id='disable-test'));
  await bar.waitFor({state:'detached'});assert.equal(await page.locator('[data-tsix-broadcast-control]').count(),0);assert.equal(await page.evaluate(()=>lab.watchers.size),0);
  assert.equal(await page.locator('#nativeShare').getAttribute('role'),null);assert.equal(await page.locator('#nativeShare').getAttribute('title'),'Native sharing control');
  await page.evaluate(()=>document.getElementById('disable-test').remove());await bar.waitFor();await page.evaluate(runtime);await page.evaluate(runtime);
  assert.equal(await bar.count(),1);assert.equal(await page.evaluate(()=>lab.watchers.size),1);
  await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});assert.equal(await page.locator('[data-tsix-broadcast]').count(),0);
  const afterStop=await shell();await page.evaluate(()=>lab.start());await bar.waitFor();assert.deepEqual(await shell(),afterStop);await page.evaluate(()=>lab.stop());await bar.waitFor({state:'detached'});assert.deepEqual(await shell(),afterStop);
  await page.evaluate(()=>{const previous=window.__tsixStreams;previous.dispose();previous.sync()});
  assert.equal(await page.evaluate(()=>lab.watchers.size),0);
  assert.equal(await bar.count(),0,'A stale helper handle must not recreate its watcher or owned DOM after disposal');
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Synthetic state, geometry and lifecycle; native streaming is checked separately'},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
