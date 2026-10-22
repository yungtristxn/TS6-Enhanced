// Native shell preservation, measured density, keyboard and idle stability.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {attachSession} from '../tools/session.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./shell.html',import.meta.url)],['/layout.css',new URL('../theme/local.tsix.layout/layout.css',import.meta.url)],['/workspace-runtime.js',new URL('../tools/workspace-runtime.js',import.meta.url)]]);
const server=createServer(async(req,res)=>{const file=routes.get(req.url);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})}),checks=[],errors=[];
try{
 const p=await browser.newPage({viewport:{width:1322,height:847}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/`);assert.equal(await p.title(),'TS6 native shell fixture');
 assert.equal(await p.locator('[data-tsix-navigator],[data-tsix-navigation],[data-tsix-recovery-toggle],[inert]').count(),0);
 for(const name of ['Bookmark','Friend','Group chat','Native device selector'])assert.ok(await p.getByRole('button',{name,exact:true}).isVisible());
 assert.ok(await p.locator('.tsv-central-toolbar').evaluate(e=>getComputedStyle(e).position==='static'));
 assert.ok(await p.locator('.sidebar-pane-layout').evaluate(e=>getComputedStyle(e).position==='static'));
 checks.push('Native sidebar resources, voice toolbar and device warnings remain in their original layout');
 const writes=await p.evaluate(()=>new Promise(resolve=>{let n=0;const o=new MutationObserver(m=>n+=m.length);o.observe(document.querySelector('.tsv-window'),{childList:true,subtree:true});setTimeout(()=>{o.disconnect();resolve(n)},150)}));assert.ok(writes<10);
 checks.push('Idle reconciliation settles');
 const attributeWrites=await p.evaluate(async()=>{
  let writes=0;const o=new MutationObserver(m=>writes+=m.length);
  for(const node of document.querySelectorAll('[data-tsix-keyboard],.tsv-resize-handle-info'))o.observe(node,{attributes:true});
  for(let i=0;i<5;i++){window.__tsixWorkspace.refresh();await new Promise(r=>setTimeout(r,0))}
  o.disconnect();return writes;
 });assert.equal(attributeWrites,0);checks.push('Unchanged reconciliation performs no accessibility attribute writes');
 await p.getByPlaceholder('Search / Connect').focus();await p.keyboard.press('Tab');
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Connected server');
 checks.push('Tab follows native DOM order without a custom keyboard trap');
 for(const [scale,height]of [['small',28],['medium',32],['large',36]]){await p.evaluate(scale=>{lab.root.className='tsv-window tsv-window-scale-'+scale},scale);await p.waitForFunction(height=>document.querySelector('.ts-server-tree-item-leaf').getBoundingClientRect().height===height,height)}
 checks.push('Small, Medium and Large share measured row sizing');
 await p.locator('#mic').press('Enter');assert.equal(await p.evaluate(()=>lab.actions),1);
 await p.evaluate(()=>lab.preview());assert.equal(await p.locator('[data-tsix-navigator]').count(),0);await p.evaluate(()=>lab.server());
 assert.equal(await p.getByLabel('Chat draft').inputValue(),'Preserve my draft');
 checks.push('Native actions stay operable; Appearance preview and draft remain intact');
 await p.evaluate('window.__tsixWorkspace.dispose()');assert.equal(await p.locator('[data-tsix-keyboard]').count(),0);
 const js=await readFile(routes.get('/workspace-runtime.js'),'utf8');await p.evaluate(js);await p.evaluate(js);await p.locator('#mic').press('Space');assert.equal(await p.evaluate(()=>lab.actions),2);
 checks.push('Disposal and reattachment restore listeners without duplicate actions');
 // Exercise the actual session entry point before the theme is selected or its
 // stylesheet arrives, rather than testing only an already attached runtime.
 for(const delayed of [false,true]){
  await p.evaluate(delayed=>{
   window.__tsixStreams?.dispose();window.__tsixWorkspace?.dispose();
   window.tsclient_internal={getClientLibVersion:callback=>callback(null,1791901251)};
   const css=document.querySelector('link[href="/layout.css"]');
   if(delayed){css.remove();window.delayedTheme=css}else css.disabled=true;
  },delayed);
  let refreshes=0;
  await attachSession({evaluate:expression=>p.evaluate(expression)},{refreshTree:()=>refreshes++});
  assert.equal(refreshes,0);assert.equal(await p.locator('[data-tsix-keyboard]').count(),0);
  assert.equal(await p.evaluate(()=>!!window.__tsixStreams&&!!window.__tsixWorkspace),true);
  await p.evaluate(()=>{window.workspaceInstance=window.__tsixWorkspace;window.streamInstance=window.__tsixStreams});
  await p.evaluate(delayed=>{if(delayed)document.head.append(window.delayedTheme);else document.querySelector('link[href="/layout.css"]').disabled=false},delayed);
  await p.waitForFunction(()=>document.querySelector('#mic').getAttribute('data-tsix-keyboard')!==null);
  assert.equal(await p.evaluate(()=>window.workspaceInstance===window.__tsixWorkspace&&window.streamInstance===window.__tsixStreams),true);
  const before=await p.evaluate(()=>lab.actions);await p.locator('#mic').press('Enter');assert.equal(await p.evaluate(()=>lab.actions),before+1);
 }
 checks.push('Disabled and delayed CSS activate existing helpers once, without another launch or duplicate keyboard actions');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
