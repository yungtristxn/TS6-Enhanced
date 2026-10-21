// Explicit live UI review: recovery disclosure, virtualized scrolling and
// native fullscreen. No messages, device changes, stream stop/pause or joins.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../tools/cdp.mjs';
const c=await connect(),reports=[];
const settle=()=>c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const key=async(key,code,vk)=>{
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});
  await settle();
};
const report=()=>c.evaluate(`(()=>{
  const v=document.querySelector('.tsv-screenshare video'),s=window.__tsixReviewQA;
  return {sameVideo:v===s.video,sameMedia:v?.srcObject===s.media,paused:v?.paused,initialPaused:s.paused,
    mediaActive:v?.srcObject?.active,fullscreen:!!document.fullscreenElement,
    stage:document.querySelector('.tsv-screenshare').getAttribute('data-tsix-stream-stage')};
})()`);
try {
  await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await c.evaluate(`(()=>{
    const v=document.querySelector('.tsv-screenshare video');
    if(!v||document.fullscreenElement)throw Error('Display one stream outside fullscreen');
    window.__tsixReviewQA={video:v,media:v.srcObject,paused:v.paused,focus:document.activeElement,
      scroll:document.querySelector('.ts-server-tree-scroller').scrollTop};
  })()`);
  if(await c.evaluate(`!!document.querySelector('[data-tsix-recovery-toggle]')`)) {
    for(const expanded of [true,false]) {
      await c.evaluate(`document.querySelector('[data-tsix-recovery-toggle]').focus()`);
      await key(' ','Space',32);
      const r=await c.evaluate(`(()=>{
        const e=document.querySelector('.ts-audio-device-recovery');
        return {expanded:e.querySelector('button').getAttribute('aria-expanded'),
          headings:[...e.querySelectorAll('h6')].every(e=>!!e.getClientRects().length),
          selectors:[...e.querySelectorAll('.ts-audio-device-selector')].every(e=>!!e.getClientRects().length),
          keyboardFocus:document.activeElement.hasAttribute('data-tsix-recovery-toggle')};
      })()`);
      assert.equal(r.expanded,String(expanded));assert.equal(r.selectors,expanded);
      assert.equal(r.headings,expanded);assert.ok(r.keyboardFocus);reports.push({test:'recovery-disclosure',...r});
    }
  }
  for(const height of [847,540]) {
    await c.send('Emulation.setDeviceMetricsOverride',{width:1322,height,deviceScaleFactor:1,mobile:false});
    for(const end of [true,false]) {
      await c.evaluate(`(()=>{const s=document.querySelector('.ts-server-tree-scroller');s.scrollTop=${end?'s.scrollHeight':'0'}})()`);
      await settle();
      const r=await c.evaluate(`(()=>{
        const s=document.querySelector('.ts-server-tree-scroller'),clip=s.getBoundingClientRect();
        const rows=[...s.querySelectorAll('.ts-server-tree-item-leaf')].map(e=>e.getBoundingClientRect())
          .filter(r=>r.bottom>clip.top&&r.top<clip.bottom).sort((a,b)=>a.y-b.y);
        return {height:innerHeight,top:s.scrollTop,max:s.scrollHeight-s.clientHeight,expectedHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tsix-row')),
          heights:[...new Set(rows.map(r=>r.height))],
          gaps:rows.slice(1).map((r,i)=>r.top-rows[i].bottom)};
      })()`);
      assert.ok(r.heights.every(h=>h===r.expectedHeight)&&r.gaps.every(g=>Math.abs(g)<1));
      assert.ok(end?Math.abs(r.top-r.max)<1:r.top===0);reports.push({test:'tree-scroll',...r});
    }
  }
  await c.send('Emulation.clearDeviceMetricsOverride');await settle();
  await c.evaluate(`document.querySelector('[aria-label="Toggle stream fullscreen"]').focus()`);
  await key('Enter','Enter',13);
  let r=await report();assert.ok(r.fullscreen&&r.sameVideo&&r.sameMedia);reports.push({test:'fullscreen-enter-keyboard',...r});
  await c.evaluate('document.exitFullscreen()');await settle();
  await new Promise(r=>setTimeout(r,350));
  r=await report();assert.ok(!r.fullscreen&&r.sameVideo&&r.sameMedia&&r.mediaActive);
  assert.equal(r.paused,r.initialPaused,'Fullscreen must retain the initial playback state');
  const bounds=await c.evaluate(`(()=>{const r=document.querySelector('.screen-overlay__bottom').getBoundingClientRect();return {bottom:r.bottom,viewport:innerHeight}})()`);
  assert.ok(bounds.bottom<=bounds.viewport,'Control strip returns inside the window after fullscreen');
  reports.push({test:'fullscreen-exit',...r});
} finally {
  await c.send('Emulation.clearDeviceMetricsOverride');
  await c.evaluate(`(async()=>{const s=window.__tsixReviewQA;if(s){
    if(document.fullscreenElement)await document.exitFullscreen();
    document.querySelector('.ts-server-tree-scroller').scrollTop=s.scroll;s.focus?.focus();delete window.__tsixReviewQA;}})()`);
  await settle();await c.send('Emulation.setFocusEmulationEnabled',{enabled:false});c.close();
  await writeFile('.local/v04-review-validation.json',JSON.stringify(reports,null,2));
}
console.log(`PASS: ${reports.length} disclosure, scrolling and fullscreen checks. Does not certify frame delivery or audio.`);
