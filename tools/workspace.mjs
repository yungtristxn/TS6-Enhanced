// Reversible native pane preset and keyboard support. Node 22+, no dependencies.
import {connect} from './cdp.mjs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const [command = 'status', ...args] = process.argv.slice(2);
if (!['apply', 'attach', 'remove', 'restore', 'status'].includes(command)) throw Error('Use apply, attach, remove, restore, or status');
const portIndex = args.indexOf('--port');
const port = Number(portIndex < 0 ? 9988 : args[portIndex + 1]);
const widthIndex = args.indexOf('--tree-width');
const treeWidth = Number(widthIndex < 0 ? 320 : args[widthIndex + 1]);
if (!Number.isFinite(treeWidth) || treeWidth < 220 || treeWidth > 600) throw Error('Tree width must be 220 to 600 CSS pixels');
const backupURL = new URL('../.local/workspace-before.json', import.meta.url);
const client = await connect({port});
try {
  const before = await client.evaluate(`(async () => {
    const build = await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));
    if (build !== 1791901251) throw Error('Unsupported build; re-audit native pane methods');
    const vm = document.querySelector('.tsv-window')?.__vue__, l = vm?.windowLayout;
    if (!l || l.windowSlots.length !== 3 || l.sidebarIndex !== 0 || l.mainIndex !== 1 ||
      ['resizeSlotStarted','resizeSlot','resizeSlotEnded','setSlotCollapsed'].some(k=>typeof l[k] !== 'function')) throw Error('Unexpected pane layout');
    return {build, sizes:l.windowSlots.map(s=>s.size), collapsed:vm.collapsedSidebar,
      preCollapseSize:l.windowSlots[0].preCollapseSize ?? null,
      treeCompact:document.querySelector('main').__vue__.appearanceSettings.tree_compact,
      helper:window.__tsixWorkspace?.version ?? null};
  })()`);
  if (command === 'status') console.log(JSON.stringify(before, null, 2));
  if (command === 'attach') {
    if (!await client.evaluate(`!!document.getElementById('userStyle')?.href.includes('/local.tsix.layout/')`)) throw Error('Select this project theme first');
    console.log(JSON.stringify(await client.evaluate(await readFile(new URL('./workspace-runtime.js', import.meta.url), 'utf8'))));
    console.log('Keyboard support attached; your current pane widths were retained.');
  }
  if (command === 'apply') {
    if (!await client.evaluate(`!!document.getElementById('userStyle')?.href.includes('/local.tsix.layout/')`)) throw Error('Select this project theme first');
    if (!await client.evaluate(`!!document.querySelector('.main-pane-layout .ts-server-tree-wrapper') && document.querySelector('.tsv-window').__vue__.windowLayout.isFull`)) throw Error('Open the server tree in a window wide enough for both panes first');
    await mkdir(new URL('../.local/', import.meta.url), {recursive:true});
    try {await writeFile(backupURL, JSON.stringify({...before, savedAt:new Date().toISOString()}, null, 2), {flag:'wx'});}
    catch (error) {if (error.code !== 'EEXIST') throw error;}
    // Native APIs persist pane sizes, like dragging the splitters. Keep the
    // original expanded navigation width for the user's Expand button.
    await client.send('Emulation.setFocusEmulationEnabled', {enabled:true});
    try {
      await client.evaluate(`(() => {
        const l=document.querySelector('.tsv-window').__vue__.windowLayout;
        l.setSlotCollapsed(l.sidebarIndex,true);
        l.resizeSlotStarted();
        l.resizeSlot(l.mainIndex,${treeWidth}-l.windowSlots[l.mainIndex].size);
        l.resizeSlotEnded();
      })()`);
      console.log(JSON.stringify(await client.evaluate(await readFile(new URL('./workspace-runtime.js', import.meta.url), 'utf8'))));
      await client.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    } finally {await client.send('Emulation.setFocusEmulationEnabled', {enabled:false});}
    console.log(`Applied native ${treeWidth} px channel pane and collapsed navigation. Backup: ` + fileURLToPath(backupURL));
  }
  if (command === 'remove' || command === 'restore') {
    // Validate the recovery file before any mutation. It contains only geometry.
    let backup;
    if (command === 'restore') {
      backup = JSON.parse(await readFile(backupURL, 'utf8'));
      if (backup.build !== before.build || !Array.isArray(backup.sizes) || backup.sizes.length !== 3 ||
          backup.sizes.some(n=>!Number.isFinite(n)||n<0||n>20000) ||
          !(backup.preCollapseSize === null || Number.isFinite(backup.preCollapseSize) && backup.preCollapseSize >= 200 && backup.preCollapseSize <= 420)) throw Error('Invalid layout backup');
    }
    await client.evaluate('window.__tsixWorkspace?.dispose()');
    if (backup) {
      await client.send('Emulation.setFocusEmulationEnabled', {enabled:true});
      try {
        // Reinstall just the numeric sizes captured from this native model; do
        // not replace profile configuration or touch unrelated layout settings.
        await client.evaluate(`(() => {
          const l=document.querySelector('.tsv-window').__vue__.windowLayout;
          ${JSON.stringify(backup.sizes)}.forEach((size,i)=>{l.windowSlots[i].size=size;l.windowSlots[i].change=0});
          if (${JSON.stringify(backup.preCollapseSize)} === null) delete l.windowSlots[0].preCollapseSize;
          else l.windowSlots[0].preCollapseSize=${JSON.stringify(backup.preCollapseSize)};
          l.resizeSlotStarted();l.resizeSlotEnded();
        })()`);
        await client.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      } finally {await client.send('Emulation.setFocusEmulationEnabled', {enabled:false});}
    }
    console.log(backup ? 'Original pane widths restored; recovery file retained. Tree Style is changed separately in Appearance.' : 'Keyboard enhancement removed; native sidebar controls and pane sizes retained.');
  }
} finally {client.close();}
