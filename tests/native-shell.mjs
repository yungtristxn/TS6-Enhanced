// Native shell preservation, measured density, keyboard and idle stability.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {clientPath} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const routes=new Map([['/',new URL('./shell.html',import.meta.url)],['/layout.css',new URL('../theme/layout.css',import.meta.url)],['/workspace-runtime.js',new URL('../tools/workspace-runtime.js',import.meta.url)]]);
const server=createServer(async(req,res)=>{const file=routes.get(req.url);if(!file){res.writeHead(404).end();return}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})}),checks=[],errors=[];
try{
 const p=await browser.newPage({viewport:{width:1322,height:847}});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:${server.address().port}/`);assert.equal(await p.title(),'TS6 native shell fixture');
 // Model the native cache/tree contract separately from CSS row geometry.
 // An already-correct cache must stay untouched; later mounts and scale changes
 // still need their virtualized row offsets to agree with the stylesheet.
 await p.evaluate(()=>{
  const keys={'--ts-tree-client-height-compact':'clientHeightCompact','--ts-tree-client-height-default':'clientHeightDetailed','--ts-tree-channel-height-default':'channelHeightDefault','--ts-tree-spacer-height-default':'spacerHeightDefault'};
  const styles=getComputedStyle(lab.root),values=Object.entries(keys).map(([key,field])=>[key,field,parseFloat(styles.getPropertyValue(key))]);
  const main=document.createElement('main');document.body.append(main);
  const cache={element:lab.root,cache:new Map(values.map(([key,,value])=>[key,value])),recomputes:0,recomputeStyles(){this.recomputes++}};
  const tree={...Object.fromEntries(values.map(([,field,value])=>[field,value])),rebuilds:0,flattenServer(){this.rebuilds++},$nextTick(callback){queueMicrotask(callback)}};
  main.__vue__={variableCache:cache};lab.nativeTree.__vue__=tree;lab.cache=cache;lab.tree=tree;
 });
 const metricWrites=await p.evaluate(()=>new Promise(resolve=>{
  let changes=0;const observer=new MutationObserver(entries=>changes+=entries.length);observer.observe(document.body,{subtree:true,childList:true});
  window.__tsixWorkspace.refresh();setTimeout(()=>{observer.disconnect();resolve({changes,recomputes:lab.cache.recomputes,rebuilds:lab.tree.rebuilds})},0);
 }));
 assert.deepEqual(metricWrites,{changes:0,recomputes:0,rebuilds:0});
 checks.push('Correct native startup metrics need no DOM measurement, cache writes or tree rebuild');
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
 for(const [scale,height]of [['small',28],['medium',32],['large',36]]){await p.evaluate(scale=>{lab.root.className='tsv-window tsv-window-scale-'+scale},scale);await p.waitForFunction(height=>document.querySelector('.ts-server-tree-item-leaf').getBoundingClientRect().height===height&&lab.tree.clientHeightCompact===height&&lab.cache.cache.get('--ts-tree-client-height-compact')===height,height)}
 checks.push('Small, Medium and Large keep CSS rows, native cache and virtualized geometry aligned');
 await p.locator('#mic').press('Enter');assert.equal(await p.evaluate(()=>lab.actions),1);
 await p.evaluate(()=>{
  lab.preview();const preview=document.querySelector('.preview');
  preview.__vue__={clientHeightCompact:22,clientHeightDetailed:22,channelHeightDefault:22,spacerHeightDefault:22,rebuilds:0,flattenServer(){this.rebuilds++},$nextTick(callback){queueMicrotask(callback)}};
  lab.previewTree=preview.__vue__;
 });
 await p.waitForFunction(()=>lab.previewTree.clientHeightCompact===36);
 assert.equal(await p.evaluate(()=>lab.previewTree.rebuilds),1);
 assert.equal(await p.locator('[data-tsix-navigator]').count(),0);await p.evaluate(()=>lab.server());
 checks.push('A late Appearance preview inherits current row metrics without changing CSS or rebuilding settled trees');
 await p.evaluate(()=>{const style=document.createElement('style');style.id='metric-calc';style.textContent=':root{--ts-tree-client-height-compact:calc(17px * 2)!important}';document.head.append(style)});
 await p.waitForFunction(()=>lab.tree.clientHeightCompact===34);
 assert.equal(await p.evaluate(()=>lab.cache.cache.get('--ts-tree-client-height-compact')),34);
 await p.evaluate(()=>document.getElementById('metric-calc').remove());await p.waitForFunction(()=>lab.tree.clientHeightCompact===36);
 checks.push('Custom calc row sizes retain the measured fallback and revert cleanly');
 assert.equal(await p.getByLabel('Chat draft').inputValue(),'Preserve my draft');
 checks.push('Native actions stay operable; Appearance preview and draft remain intact');
 await p.evaluate('window.__tsixWorkspace.dispose()');assert.equal(await p.locator('[data-tsix-keyboard]').count(),0);
 const js=await readFile(routes.get('/workspace-runtime.js'),'utf8');await p.evaluate(js);await p.evaluate(js);await p.locator('#mic').press('Space');assert.equal(await p.evaluate(()=>lab.actions),2);
 checks.push('Disposal and reattachment restore listeners without duplicate actions');
 // Both helpers must remain dormant until their stylesheet arrives, then
 // activate without duplicate keyboard actions or replacing their instances.
 const streams=await readFile(new URL('../tools/streams-runtime.js',import.meta.url),'utf8');
 for(const delayed of [false,true]){
  await p.evaluate(delayed=>{
   window.__tsixStreams?.dispose();window.__tsixWorkspace?.dispose();
   window.tsclient_internal={getClientLibVersion:callback=>callback(null,1791901251)};
   const css=document.querySelector('link[href="/layout.css"]');
   if(delayed){css.remove();window.delayedTheme=css}else css.disabled=true;
  },delayed);
  await p.evaluate(js);await p.evaluate(streams);
  assert.equal(await p.locator('[data-tsix-keyboard]').count(),0);
  assert.equal(await p.evaluate(()=>!!window.__tsixStreams&&!!window.__tsixWorkspace),true);
  await p.evaluate(()=>{window.workspaceInstance=window.__tsixWorkspace;window.streamInstance=window.__tsixStreams});
  await p.evaluate(delayed=>{if(delayed)document.head.append(window.delayedTheme);else document.querySelector('link[href="/layout.css"]').disabled=false},delayed);
  await p.waitForFunction(()=>document.querySelector('#mic').getAttribute('data-tsix-keyboard')!==null);
  assert.equal(await p.evaluate(()=>window.workspaceInstance===window.__tsixWorkspace&&window.streamInstance===window.__tsixStreams),true);
  const before=await p.evaluate(()=>lab.actions);await p.locator('#mic').press('Enter');assert.equal(await p.evaluate(()=>lab.actions),before+1);
 }
 checks.push('Disabled and delayed CSS activate existing helpers once, without another launch or duplicate keyboard actions');
 // Native resource stacks can expose several sibling tabs. Keep this bounded
 // component fixture separate from the simplified shell geometry above.
 const sidebar=await browser.newPage();sidebar.on('pageerror',e=>errors.push(e.message));
 const nativeCss=await readFile(`${clientPath}/html/client_ui/main.css`,'utf8'),icon=await readFile(`${clientPath}/html/client_ui/images/icons/server.svg`,'utf8');
 const tab=name=>`<div class="tsv-tab-item tsv-bar-item" aria-label="${name}"><div class="tsv-flex tsv-flex-center tsv-action"><div class="tsv-magnify">${icon}</div></div></div>`;
 const expander='<div class="ts-expander tsv-tab-item" aria-label="Collapse"><div class="ts-expander-chevron">⌄</div></div>';
 await sidebar.setContent(`<title>Native sidebar tab fixture</title><div class="tsv-window"><div class="sidebar-pane-layout tsv-sidebar"><div class="tsv-body"><div class="tsv-resources-group"><div id="grouped" class="tsv-bar tsv-tabs tsv-tabs-slim">${tab('Servers')}${tab('Friends')}${tab('Chats')}<div class="tsv-bar-item tsv-flex-grow tsv-no-padding tsv-extended-expander-click-area"><div class="tsv-flex-grow"></div>${expander}</div></div><div id="single" class="tsv-bar tsv-tabs tsv-tabs-slim">${tab('Section')}<div class="tsv-bar-item tsv-flex-grow tsv-no-padding tsv-extended-expander-click-area"><div class="tsv-flex-grow"></div><div class="tsv-bar-item tsv-sidebar-header-accessories tsv-action-subtle tsv-no-padding-right"><div><div class="ts-sidebar-tab-sub-panel-accessory">${icon}</div></div></div>${expander}</div></div></div></div></div></div>`);
 await sidebar.addStyleTag({content:nativeCss});await sidebar.addStyleTag({content:await readFile(routes.get('/layout.css'),'utf8')});
 await sidebar.addStyleTag({content:'body{margin:0}.sidebar-pane-layout{width:220px}svg{width:22px;height:22px}'});
 for(const width of [360,640,1322]){
  await sidebar.setViewportSize({width,height:480});
  const tabs=await sidebar.locator('#grouped > .tsv-tab-item').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width,height:r.height,hittable:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}));
  assert.equal(tabs.length,3);assert.ok(tabs.every((tab,index)=>tab.width>=28&&tab.height>=28&&tab.hittable&&(!index||tab.x>=tabs[index-1].right)));
  const single=await sidebar.locator('#single').evaluate(node=>{const tab=node.querySelector(':scope > .tsv-tab-item').getBoundingClientRect(),tool=node.querySelector('.ts-sidebar-tab-sub-panel-accessory').getBoundingClientRect(),expander=node.querySelector('.ts-expander').getBoundingClientRect();return{toolBelow:tool.y>=tab.bottom,expanderBeside:expander.x>=tab.right,overflow:node.scrollWidth>node.clientWidth}});
  assert.deepEqual(single,{toolBelow:true,expanderBeside:true,overflow:false});
 }
 await sidebar.close();checks.push('Native-CSS grouped sidebar tabs stay distinct and hittable at 360/640/1322px; single-section tools remain below the heading');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks,errors},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r))}
