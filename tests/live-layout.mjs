// Explicitly invoked local QA. Requires the theme selected and a server tree and
// channel chat visible. No chat text is entered, and no server actions are used.
// Captures real client data under .local only. Renderer/DPR emulation is not an
// actual Windows display-setting test. Leave client running throughout.
import { connect } from '../tools/cdp.mjs';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const c = await connect();
const reports = [];
const skipComparison=process.argv.includes('--skip-theme-comparison');
const reportPath=skipComparison?'.local/v02-live-layout-results.json':'.local/live-layout-results.json';
const pause = ms => new Promise(r => setTimeout(r, ms));
const refresh = () => execFileSync(process.execPath, ['tools/client.mjs','refresh-tree'], {windowsHide:true,stdio:'pipe'});
const metrics = `(()=>{
 const t=document.querySelector('.ts-server-tree-wrapper'),s=t?.querySelector('.scroller'),v=t?.parentElement.__vue__;
 const clip=s?.getBoundingClientRect();
 // TS6 retains recycled nodes parked at -9999px. Only measure rows intersecting
 // the scroller; hidden pool nodes are not gaps or overlapping visible rows.
 const rows=t?[...t.querySelectorAll('.ts-server-tree-item-leaf')].map(e=>{const r=e.getBoundingClientRect();return {y:r.y,h:r.height,type:e.classList.contains('client')?'client':'channel'};}).filter(r=>r.y+r.h>clip.top&&r.y<clip.bottom).sort((a,b)=>a.y-b.y):[];
 const gaps=rows.slice(1).map((r,i)=>+(r.y-rows[i].y-rows[i].h).toFixed(2));
 const editor=document.querySelector('.ts-chat-input-container [contenteditable=true]'); const rect=editor?.getBoundingClientRect();
 return {viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},tree:!!t,
  cached:v&&{channel:v.channelHeightDefault,compact:v.clientHeightCompact,detailed:v.clientHeightDetailed},
  rowCount:rows.length,heights:[...new Set(rows.map(r=>r.h))],gaps,
  scroll:s&&{top:s.scrollTop,total:s.scrollHeight,visible:s.clientHeight},
  chat:!!editor,editorRect:rect&&{x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom},
  fullscreen:!!document.fullscreenElement,videoTiles:document.querySelectorAll('.screen-video-wrapper').length};
})()`;
try {
  await mkdir('.local/screenshots',{recursive:true});
  await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const ready = await c.evaluate(`(()=>{
    const link=document.getElementById('userStyle'),tree=document.querySelector('.ts-server-tree-wrapper');
    if(!link?.href.includes('/local.tsix.layout/')||!tree)throw Error('Select the project theme and open the server tree first');
    if(document.querySelector('.screen-video-wrapper'))throw Error('Run this QA with no streams displayed; chat intentionally collapses during streams');
    window.__tsixLiveTestState={focus:document.activeElement,scroll:tree.querySelector('.scroller').scrollTop,disabled:link.disabled};
    return true;
  })()`);
  await pause(350);
  // Capture baseline and themed views using the same channel/chat/viewport.
  for (const [disabled,label] of (skipComparison?[]:[[true,'client-before'],[false,'client-after']])) {
    await c.evaluate(`document.getElementById('userStyle').disabled=${disabled}`);
    refresh(); await pause(400);
    reports.push({label,result:await c.evaluate(metrics)});
    const shot=await c.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`.local/screenshots/${label}.png`,Buffer.from(shot.data,'base64'));
  }
  for (const [width,height,deviceScaleFactor] of [[1322,915,1],[1100,720,1.25],[900,650,1.5],[1920,1080,1],[1280,720,1.5],[960,540,2]]) {
    await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor,mobile:false});
    await pause(500);
    await c.evaluate(`(()=>{const s=document.querySelector('.ts-server-tree-wrapper .scroller');if(s)s.scrollTop=0})()`);
    await pause(150);
    const top=await c.evaluate(metrics);
    await c.evaluate(`(()=>{const s=document.querySelector('.ts-server-tree-wrapper .scroller');if(s)s.scrollTop=s.scrollHeight})()`);
    await pause(250);
    const bottom=await c.evaluate(metrics);
    reports.push({label:'renderer-emulation',top,bottom});
    if (top.gaps.some(x=>Math.abs(x)>1)||bottom.gaps.some(x=>Math.abs(x)>1)) throw Error(`Row gap/overlap at ${width}x${height}`);
  }
  await c.send('Emulation.clearDeviceMetricsOverride'); await pause(300);
  await c.evaluate(`document.querySelector('.ts-server-tree-wrapper .scroller').focus()`);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  reports.push({label:'tab-from-tree',focus:await c.evaluate(`({class:document.activeElement.className,tag:document.activeElement.tagName})`)});
  await c.evaluate(`document.querySelector('.ts-chat-input-container [contenteditable=true]').focus()`);
  reports.push({label:'chat-focus-without-typing',focused:await c.evaluate(`document.activeElement.matches('.ts-chat-input-container [contenteditable=true]')`)});
} finally {
  await c.send('Emulation.clearDeviceMetricsOverride');
  await c.evaluate(`(()=>{const s=window.__tsixLiveTestState;if(!s)return;document.getElementById('userStyle').disabled=s.disabled;const scroller=document.querySelector('.ts-server-tree-wrapper .scroller');if(scroller)scroller.scrollTop=s.scroll;if(s.focus?.isConnected)s.focus.focus();delete window.__tsixLiveTestState})()`);
  try { refresh(); } finally { await c.send('Emulation.setFocusEmulationEnabled',{enabled:false}); c.close(); }
  await writeFile(reportPath,JSON.stringify(reports,null,2));
}
console.log(JSON.stringify(reports,null,2));
