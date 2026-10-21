// Optional development helper; Node 22+ and Windows PowerShell, no npm packages.
import { connect, targets } from './cdp.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const [command = 'inspect', ...args] = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const port = Number(value('--port') ?? 9988);
const targetId = value('--target');
const context = value('--context') ?? 'main';
if (!['main', 'popup'].includes(context)) throw Error('Context must be main or popup');
if (context === 'popup' && !targetId) throw Error('Pop-out inspection requires --target ID');
if (command === 'targets') {
  console.log(JSON.stringify((await targets(port)).map(t => ({ id: t.id, context: new URL(t.url).searchParams.has('popup') ? 'popup' : 'main' })), null, 2));
} else {
  const client = await connect({ port, targetId, context });
  try {
    if (command === 'inspect') {
      const result = await client.evaluate(`(async () => {
        const version = await new Promise(resolve => tsclient_internal.getClientLibVersion((error, build, version) => resolve({error, build, version})));
        const rows = [...document.querySelectorAll('.ts-server-tree-wrapper .ts-server-tree-item-leaf')];
        const trees = [...document.querySelectorAll('.ts-server-tree-wrapper')].map(e => {
          const v = e.parentElement.__vue__;
          return { renderedRows:e.querySelectorAll('.ts-server-tree-item-leaf').length, metrics:v && {channel:v.channelHeightDefault, spacer:v.spacerHeightDefault, compact:v.clientHeightCompact, detailed:v.clientHeightDetailed} };
        });
        return {version, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}, themeLoaded:!!document.getElementById('userStyle')?.sheet,
          projectThemeLoaded:document.getElementById('userStyle')?.href.includes('/local.tsix.layout/') ?? false, trees,
          rowHeights:[...new Set(rows.map(e=>e.getBoundingClientRect().height))],
          viewerCount:[...document.querySelectorAll('.tsv-screenshare')].filter(e=>e.__vue__?.$refs.fullArea).length, videoTileCount:document.querySelectorAll('.screen-video-wrapper,.screen-tile-wrapper--video').length,
          chatCount:document.querySelectorAll('.ts-chat-container').length, fullscreen:!!document.fullscreenElement};
      })()`);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'refresh-tree') {
      if (context !== 'main') throw Error('Tree refresh is only supported in the main window');
      // Read-only preflight finishes before changing any layout state.
      const result = await client.evaluate(`(async () => {
        const build = await new Promise(resolve => tsclient_internal.getClientLibVersion((error, build) => resolve(error ? -1 : build)));
        if (build !== 1791901251) throw Error('Unsupported build; re-audit the tree internals before using this helper');
        const root = document.querySelector('main')?.__vue__;
        const cache = root?.variableCache;
        if (!cache || !(cache.cache instanceof Map) || !cache.element?.parentElement || typeof cache.recomputeStyles !== 'function') throw Error('Unexpected CSS variable cache');
        const fields = {
          '--ts-tree-client-height-compact':'clientHeightCompact',
          '--ts-tree-client-height-default':'clientHeightDetailed',
          '--ts-tree-channel-height-default':'channelHeightDefault',
          '--ts-tree-spacer-height-default':'spacerHeightDefault'
        };
        const liveTrees = [...document.querySelectorAll('.ts-server-tree-wrapper')].filter(e=>!e.closest('.preview')).map(e=>({element:e,vm:e.parentElement.__vue__}));
        if (!liveTrees.length && ${!args.includes('--allow-empty')}) throw Error('Open the server tree before refreshing');
        for (const {vm} of liveTrees) {
          if (!vm || typeof vm.flattenServer !== 'function' || Object.values(fields).some(f=>typeof vm[f] !== 'number')) throw Error('Unexpected tree component');
        }
        // Resolve pixel expressions synchronously in the same parent as TS6's
        // measuring element. Its updateSingle({}) waits on animation frames and
        // can hang while the native window is hidden/minimized.
        cache.recomputeStyles();
        const metrics = {};
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;padding:0;border:0;margin:0;box-sizing:content-box;min-width:0;max-width:none;';
        cache.element.parentElement.appendChild(probe);
        try {
          for (const [variable,field] of Object.entries(fields)) {
            const expression = getComputedStyle(cache.element).getPropertyValue(variable);
            if (!expression.trim() || !CSS.supports('width',expression)) throw Error('Invalid row expression: ' + variable);
            probe.style.width = expression;
            const size = probe.getBoundingClientRect().width;
            if (!Number.isFinite(size) || size < 20 || size > 200) throw Error('Unexpected row size: ' + variable);
            metrics[field] = size;
          }
        } finally { probe.remove(); }
        for (const [variable,field] of Object.entries(fields)) {
          cache.cache.set(variable, metrics[field]);
        }
        for (const {element,vm} of liveTrees) {
          const scroller = element.querySelector('.scroller');
          const previousScroll = scroller?.scrollTop;
          Object.assign(vm, metrics);
          vm.flattenServer();
          await vm.$nextTick();
          if (scroller) scroller.scrollTop = previousScroll;
        }
        return {build, refreshedTrees:liveTrees.length, metrics};
      })()`);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'export-fixture-styles') {
      const css = await client.evaluate(`[...document.styleSheets].filter(s=>!s.href&&s.cssRules.length>100).map(s=>[...s.cssRules].map(r=>r.cssText).join(String.fromCharCode(10))).join(String.fromCharCode(10))`);
      if (!css.includes('--tsv-bg')) throw Error('Expected stock theme variables were not found');
      await mkdir('.local/fixture', { recursive: true });
      await writeFile('.local/fixture/base-theme.css', css);
      console.log('Wrote stock style rules to .local/fixture/base-theme.css; no DOM or personal text exported.');
    } else if (command === 'screenshot') {
      // Screenshots contain real account/server/chat data. Keep them git-ignored.
      const out = resolve(value('--out') ?? '.local/screenshots/client.png');
      const local = resolve('.local') + '\\';
      if (!out.toLowerCase().startsWith(local.toLowerCase()) || !out.endsWith('.png')) throw Error('Save screenshots as .local/**/*.png from the project directory');
      await mkdir(dirname(out), { recursive: true });
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(out, Buffer.from(shot.data, 'base64'));
      console.log(out);
    } else throw Error('Use inspect, targets, refresh-tree, export-fixture-styles, or screenshot');
  } finally { client.close(); }
}
