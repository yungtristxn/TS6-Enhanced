// Optional development helper; Node 22+ and Windows PowerShell, no npm packages.
import { connect, targets } from './cdp.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const [command = 'inspect', ...args] = process.argv.slice(2);
const value = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const port = Number(value('--port') ?? 9988);
const targetId = value('--target');
const context = value('--context') ?? 'main';
if (!['main', 'popup'].includes(context)) throw Error('Context must be main or popup');
if (context === 'popup' && !targetId) throw Error('Pop-out inspection requires --target ID');
if (command === 'targets') {
  console.log(
    JSON.stringify(
      (await targets(port)).map(t => ({
        id: t.id,
        context: new URL(t.url).searchParams.has('popup') ? 'popup' : 'main'
      })),
      null,
      2
    )
  );
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
        return {version, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}, themeLoaded:!!document.getElementById('userStyle')?.sheet,nativeEnhanced:window.__tsixNative?.status??null,
          projectThemeLoaded:!!document.getElementById('tsix-native-style')?.sheet, trees,
          rowHeights:[...new Set(rows.map(e=>e.getBoundingClientRect().height))],
          viewerCount:[...document.querySelectorAll('.tsv-screenshare')].filter(e=>e.__vue__?.$refs.fullArea).length, videoTileCount:document.querySelectorAll('.screen-video-wrapper,.screen-tile-wrapper--video').length,
          chatCount:document.querySelectorAll('.ts-chat-container').length, fullscreen:!!document.fullscreenElement};
      })()`);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'export-fixture-styles') {
      const css = await client.evaluate(
        `[...document.styleSheets].filter(s=>!s.href&&s.cssRules.length>100).map(s=>[...s.cssRules].map(r=>r.cssText).join(String.fromCharCode(10))).join(String.fromCharCode(10))`
      );
      if (!css.includes('--tsv-bg')) throw Error('Expected stock theme variables were not found');
      await mkdir('.local/fixture', { recursive: true });
      await writeFile('.local/fixture/base-theme.css', css);
      console.log('Wrote stock style rules to .local/fixture/base-theme.css; no DOM or personal text exported.');
    } else if (command === 'screenshot') {
      // Screenshots contain real account/server/chat data. Keep them git-ignored.
      const out = resolve(value('--out') ?? '.local/screenshots/client.png');
      const local = resolve('.local') + '\\';
      if (!out.toLowerCase().startsWith(local.toLowerCase()) || !out.endsWith('.png'))
        throw Error('Save screenshots as .local/**/*.png from the project directory');
      await mkdir(dirname(out), { recursive: true });
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(out, Buffer.from(shot.data, 'base64'));
      console.log(out);
    } else throw Error('Use inspect, targets, export-fixture-styles, or screenshot');
  } finally {
    client.close();
  }
}
