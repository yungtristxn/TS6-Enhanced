import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect } from './cdp.mjs';
import { restoreAppearance } from './appearance.mjs';
import { captureBaseline, stateRoot, atomicJSON } from './install-state.mjs';
let c;
const deadline = Date.now() + 15000;
while (!c) {
  try {
    c = await connect();
  } catch (error) {
    if (Date.now() >= deadline || !/Expected one TS6 target|TS6 document identity check failed/.test(error.message))
      throw error;
    await new Promise(r => setTimeout(r, 250));
  }
}
try {
  let baseline;
  try {
    baseline = JSON.parse(await readFile(join(stateRoot(), 'before-install.json'), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    baseline = await captureBaseline(c);
  }
  await restoreAppearance(c, baseline);
  await atomicJSON(join(stateRoot(), 'restoration.json'), {
    schema: 1,
    restoredAt: new Date().toISOString(),
    legacy: baseline.legacy
  });
  console.log('Saved appearance and layout preferences restored. Personal TeamSpeak data was not modified.');
} finally {
  c.close();
}
