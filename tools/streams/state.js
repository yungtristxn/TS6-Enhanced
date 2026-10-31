// Shared state and helpers for the stream helper. Concatenated by tools/streams/bundle.mjs.
let trayCollapsed = window.__tsixStreams?.status().trayCollapsed ?? false;
let chatVisible = window.__tsixStreams?.status().chatVisible ?? true;
window.__tsixStreams?.dispose();
const preferenceKey = 'tsix.layout.streamTrayCollapsed';
const chatPreferenceKey = 'tsix.layout.chatVisible';
try {
  trayCollapsed = localStorage.getItem(preferenceKey) === 'true';
} catch {
  /* Keep the in-memory choice if storage is unavailable. */
}
try {
  chatVisible = localStorage.getItem(chatPreferenceKey) !== 'false';
} catch {
  /* Chat remains available without storage. */
}
// Feature switches from the TS6 Enhanced dialog; enabled when unavailable.
const feature = id => window.__tsixFeatures?.enabled(id) ?? true;
const marker = 'data-tsix-stream-stage';
const layoutMarker = 'data-tsix-stream-layout';
const trayMarker = 'data-tsix-stream-tray';
const records = new Map(),
  buttons = new Map(),
  volumes = new Map(),
  joins = new Map();
const volumeReady = new WeakSet(),
  volumeFrames = new Map();
const volumeHandoffs = new WeakMap(),
  volumeRemembered = new WeakSet();
let disposed = false,
  queued = false,
  frame = 0;
const broadcast = createBroadcast();
const labels = {
  'status-recording': 'Stream viewers',
  pause: 'Pause stream',
  play: 'Resume stream',
  'stream-settings': 'Stream settings',
  'stream-maximize': 'Toggle stream fullscreen',
  'stream-minimize': 'Exit stream fullscreen',
  'stream-shutdown': 'Close stream',
  'stream-leave': 'Leave stream',
  speaker: 'Mute stream audio',
  'speaker-slash': 'Unmute stream audio',
  dots: 'Stream view settings',
  expand: 'Pop out stream'
};
const attrs = ['role', 'tabindex', 'aria-label', 'title', 'aria-disabled'];
const setAttr = (node, key, value) => {
  if (value === null) {
    if (node.hasAttribute(key)) node.removeAttribute(key);
  } else if (node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value));
};
const controlDisabled = node =>
  !!(
    node?.__vue__?.disabled ||
    node?.__vue__?.button?.isDisabled ||
    node?.__vue__?.button?.disabled ||
    (node?.matches('.tsv-tool-button-context-menu-toggle') &&
      node.closest('.tsv-tool-button')?.__vue__?.button?.contextMenuButtonDisabled) ||
    node?.matches('.disabled,.tsv-is-disabled,.tsv-is-visually-disabled,[disabled]')
  );
const cloneIcon = source => {
  const icon = source.cloneNode(true);
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  // Native SVGs have IDs. Owned copies must not shadow those IDs or create
  // a second keyboard/accessibility target inside their labelled button.
  for (const node of [icon, ...icon.querySelectorAll('[id]')]) node.removeAttribute('id');
  return icon;
};
const themeActive = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--tsix-stream-stage-api').trim() === '1';
const playerActive = (node, session) =>
  !!node?.querySelector('video') ||
  !!session?.isJoining ||
  (session?.isInbound === true && session.status === 4) ||
  (session?.isInbound === false && [3, 4].includes(session.captureStatus));
