// Joins the stream helper modules into the single closure embedded in the DLL.
// The parts share one scope, so their order is the original statement order.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const streamParts = ['state.js', 'layout.js', 'controls.js', 'volume.js', 'broadcast.js', 'api.js'];
const header = `// Embedded in the native loader payload for the verified main client context.
// Native media/session objects stay intact. The exact-build player ref adapter
// caps HTML volume; amplification uses native gain or Web Audio after input.
// Viewer metadata stays in memory. Volume choices per streamer use local storage.`;

export async function streamsRuntime() {
  const parts = await Promise.all(streamParts.map(name => readFile(new URL(name, import.meta.url), 'utf8')));
  return `${header}\n(() => {\n${parts.map(part => part.trimEnd()).join('\n')}\n})();\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Syntax check without executing the browser code.
  new Function(await streamsRuntime());
  console.log(`Stream helper parts: ${streamParts.join(', ')}`);
}
