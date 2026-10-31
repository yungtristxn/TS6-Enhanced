// Real native CSS with tree rows that follow the beta5 channel/client templates.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {clientPath} from './client-path.mjs';
const {chromium}=await import(process.env.TSIX_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TSIX_PLAYWRIGHT_MODULE).href:'playwright');
const nativeCss=await readFile(`${clientPath}/html/client_ui/main.css`,'utf8');
const css=await readFile(new URL('../theme/layout.css',import.meta.url),'utf8');
const chevron='<svg class="ts-expander-chevron tsv-icon" viewBox="0 0 24 24" style="width:22px;height:22px"><path d="M7 10l5 5 5-5z"/></svg>';
const channel=({name,tags=[],children=false})=>`<div class="ts-server-tree-item-leaf channel" data-v-495a5258><div class="ts-server-tree-item-node" data-v-495a5258><div class="ts-server-tree-item-node-content channel ${children?'ts-server-tree-item-node-with-childs':'ts-server-tree-item-key-without-chevron'}" data-v-495a5258><span class="tsv-server-tree-icon channel" style="width:22px;height:22px;flex:0 0 22px" data-v-495a5258></span><span class="ts-server-tree-channel-info tsv-tree-preserve-spaces" data-v-495a5258><span>${name}</span></span><div class="tsv-flex-grow" data-v-495a5258></div>${tags.length||children?`<div class="tsv-item-accessory" data-v-495a5258>${tags.map(t=>`<span class="ts-server-tree-item-tag" data-v-495a5258>${t}</span>`).join('')}${children?`<div class="ts-expander ts-collapse-control" data-v-495a5258>${chevron}</div>`:`<span class="${tags.length?'ts-tag-spacing':''}" data-v-495a5258></span>`}</div>`:''}</div></div></div>`;
const client=({name,badges=1})=>`<div class="ts-server-tree-item-leaf client compact" data-v-65202ae9><div class="ts-server-tree-item-key ts-server-tree-item-key-without-chevron ts-server-tree-item-node-content client" data-v-65202ae9><span class="tsv-server-tree-icon client" style="width:22px;height:22px;flex:0 0 22px" data-v-65202ae9></span><div class="ts-server-tree-client-info compact" data-v-65202ae9><div class="ts-server-tree-client-info__name-row" data-v-65202ae9><span class="ts-server-tree-item-text ts-client-nick" data-v-65202ae9>${name}</span></div><div class="tsv-flex ts-server-tree-client-status-wrapper" data-v-65202ae9><div class="ts-server-tree-active-status">${'<div class="ts-server-tree-active-status__item"><span class="ts-server-tree-group-icon" style="display:block;background:#f90;border-radius:50%"></span></div>'.repeat(badges)}</div><div class="ts-server-tree-inactive-status"></div></div></div></div></div>`;
const rows=[
 channel({name:'Lobby',tags:['M'],children:true}),
 client({name:'Alex'}),
 client({name:'Sam with two badges',badges:2}),
 channel({name:'Moderated room',tags:['M']}),
 channel({name:'Parent',children:true}),
 channel({name:'Plain'})
].join('');
const browser=await chromium.launch({headless:true,...(process.env.TSIX_BROWSER_CHANNEL?{channel:process.env.TSIX_BROWSER_CHANNEL}:{})});
const checks=[],errors=[];
try {
 for(const scale of ['small','medium','large']){
  const page=await browser.newPage({viewport:{width:900,height:500}});page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<title>Tree alignment</title><div class="tsv-window tsv-window-scale-${scale}"><div class="main-pane-layout"><div class="ts-server-tree-wrapper" style="width:320px;display:block">${rows}</div></div></div>`);
  await page.addStyleTag({content:nativeCss});
  const measure=()=>page.evaluate(()=>{
   const right=n=>n&&Math.round(n.getBoundingClientRect().right*2)/2;
   const leaves=[...document.querySelectorAll('.ts-server-tree-item-leaf')];
   return leaves.map(leaf=>({
    edge:right(leaf.querySelector('.ts-expander,.ts-tag-spacing,.ts-server-tree-client-status-wrapper')),
    tag:right(leaf.querySelector('.ts-server-tree-item-tag'))
   }));
  });
  const before=await measure();
  await page.addStyleTag({content:css});
  const after=await measure();
  if(process.env.TSIX_DEBUG)console.log(scale,JSON.stringify(before),JSON.stringify(after),await page.evaluate(()=>[...document.querySelectorAll('.ts-server-tree-item-leaf')].map(l=>{const n=l.querySelector('.ts-server-tree-item-node-content');return [l.className,l.getBoundingClientRect().width,getComputedStyle(n).display,n.getBoundingClientRect().width,n.scrollWidth].join('|')}).join('\n')));
  // Lobby (tag + expander) and Moderated room (tag only) put "M" in one column.
  assert.equal(after[0].tag,after[3].tag,`${scale}: tag column`);
  const edges=after.map(r=>r.edge).filter(Boolean);
  assert.equal(new Set(edges).size,1,`${scale}: right edges ${JSON.stringify(after)}`);
  if(scale==='medium'){
   assert.notEqual(before[0].tag,before[3].tag,'Native layout reproduces the shifted tag column');
   assert.notEqual(new Set(before.map(r=>r.edge).filter(Boolean)).size,1,'Native layout reproduces the ragged right edge');
  }
  checks.push(`${scale}: expanders, tag spacing and client badges share one right edge; tags share one column`);
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks,errors,scope:'Native CSS with synthetic rows following the beta5 templates; no live server tree'},null,2));
} finally {await browser.close()}
