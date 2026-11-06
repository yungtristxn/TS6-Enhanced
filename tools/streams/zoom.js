// Scroll to zoom the focused, single or fullscreen stream at the pointer, and
// drag to move around while zoomed. The
// native <video> keeps its box; an owned object-view-box shows a smaller part
// of the picture at the same aspect, so nothing grows past the player or under
// its controls. The stream, player and controls are untouched.
const zoomed = new Map();
const zoomLimit = 5;
const zoomSupported = typeof CSS !== 'undefined' && CSS.supports?.('object-view-box', 'inset(10% 10% 10% 10%)');
const zoomExcluded =
  '.screen-overlay__bottom,.screen-overlay__hero-actions,button,input,[role="slider"],[data-tsix-volume-control]';
// The player under the pointer, when it may zoom: fullscreen, or the focused
// stream, or the only stream on the stage. Grid tiles keep TeamSpeak's wheel.
function zoomPlayer(target) {
  const player = target?.closest?.('.video-stream');
  const video = player?.querySelector(':scope > video');
  if (!video || target.closest(zoomExcluded)) return null;
  if (player.classList.contains('is-fullscreen') || document.fullscreenElement?.contains(player)) return video;
  for (const record of records.values()) {
    if (!record.element.contains(player)) continue;
    const state = layoutState(record.vm);
    const tile = state?.tiles.find(t => t.node?.contains(player));
    if (tile?.active && !state.drag && (tile.focused || state.tiles.length === 1)) return video;
  }
  return null;
}
// The visible picture inside the element box (object-fit: contain letterboxes it).
function zoomPicture(video) {
  const box = video.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const picture = { left: box.left, top: box.top, width: box.width, height: box.height };
  if (getComputedStyle(video).objectFit === 'contain' && video.videoWidth && video.videoHeight) {
    const fit = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    picture.width = video.videoWidth * fit;
    picture.height = video.videoHeight * fit;
    picture.left += (box.width - picture.width) / 2;
    picture.top += (box.height - picture.height) / 2;
  }
  return picture;
}
const zoomPercent = value => `${Math.round(value * 1e5) / 1e3}%`;
function resetZoom(video) {
  const entry = zoomed.get(video);
  if (!entry) return;
  zoomed.delete(video);
  video.style.objectViewBox = entry.viewBox;
  entry.chip.remove();
  entry.player.removeAttribute('data-tsix-zoomed');
  entry.player.removeAttribute('data-tsix-panning');
  if (zoomPan?.video === video) zoomPan = null;
}
// entry.x/y: the visible part's top-left as a fraction of the picture.
function applyZoom(video, entry) {
  if (entry.scale <= 1.001) {
    resetZoom(video);
    return;
  }
  const size = 1 / entry.scale;
  entry.x = Math.min(1 - size, Math.max(0, entry.x));
  entry.y = Math.min(1 - size, Math.max(0, entry.y));
  // inset(top right bottom left), as fractions of the picture.
  const value = `inset(${[entry.y, 1 - entry.x - size, 1 - entry.y - size, entry.x].map(zoomPercent).join(' ')})`;
  if (video.style.objectViewBox !== value) video.style.objectViewBox = value;
  setAttr(entry.player, 'data-tsix-zoomed', '');
  const level = `${entry.scale.toFixed(1)}×`;
  if (entry.chip.textContent !== level) entry.chip.textContent = level;
  setAttr(entry.chip, 'aria-label', `Reset zoom (${level})`);
  if (entry.chip.parentElement !== entry.player) entry.player.append(entry.chip);
}
function zoomChip(video) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.title = 'Reset zoom';
  chip.setAttribute('data-tsix-zoom', '');
  chip.addEventListener('click', event => {
    event.stopPropagation();
    event.preventDefault();
    resetZoom(video);
  });
  // Never a focus click, fullscreen double-click or tile drag underneath.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'wheel'])
    chip.addEventListener(type, event => event.stopPropagation());
  return chip;
}
function onZoomWheel(event) {
  if (disposed || !zoomSupported || !feature('streamZoom') || event.ctrlKey || !event.deltaY) return;
  const video = zoomPlayer(event.target);
  if (!video) return;
  let entry = zoomed.get(video);
  // A view box we do not own (none in the supported client) is left alone.
  if (!entry && video.style.objectViewBox) return;
  const picture = zoomPicture(video);
  if (
    !picture ||
    event.clientX < picture.left ||
    event.clientX > picture.left + picture.width ||
    event.clientY < picture.top ||
    event.clientY > picture.top + picture.height
  )
    return;
  // Over a zoomable picture the wheel zooms; it no longer pages the grid.
  event.preventDefault();
  event.stopPropagation();
  if (!entry) {
    if (event.deltaY > 0) return;
    entry = { player: video.parentElement, scale: 1, x: 0, y: 0, viewBox: '', chip: zoomChip(video) };
    zoomed.set(video, entry);
  }
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? picture.height : 1);
  const scale = Math.min(zoomLimit, Math.max(1, entry.scale * Math.exp(-delta * 0.0028)));
  // Keep the picture point under the pointer in place.
  const u = (event.clientX - picture.left) / picture.width,
    v = (event.clientY - picture.top) / picture.height;
  entry.x += u / entry.scale - u / scale;
  entry.y += v / entry.scale - v / scale;
  entry.scale = scale;
  applyZoom(video, entry);
}
// Dragging a zoomed picture moves the view. Cancelling the pointerdown stops
// the compatibility mouse events (TeamSpeak's tile drag listens to mousedown),
// and the click that ends a drag never reaches focus or fullscreen handling.
let zoomPan = null,
  zoomClickBlock = 0;
function onZoomPointerDown(event) {
  if (event.button !== 0 || !feature('streamZoom')) return;
  const video = zoomPlayer(event.target),
    entry = video && zoomed.get(video),
    picture = entry && zoomPicture(video);
  if (
    !picture ||
    event.clientX < picture.left ||
    event.clientX > picture.left + picture.width ||
    event.clientY < picture.top ||
    event.clientY > picture.top + picture.height
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  zoomPan = {
    video,
    entry,
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    startX: entry.x,
    startY: entry.y,
    picture,
    moved: false
  };
}
function onZoomPointerMove(event) {
  const pan = zoomPan;
  if (!pan || event.pointerId !== pan.id) return;
  const dx = event.clientX - pan.x,
    dy = event.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 4) return;
  if (!pan.moved) {
    pan.moved = true;
    setAttr(pan.entry.player, 'data-tsix-panning', '');
  }
  event.preventDefault();
  pan.entry.x = pan.startX - dx / (pan.picture.width * pan.entry.scale);
  pan.entry.y = pan.startY - dy / (pan.picture.height * pan.entry.scale);
  applyZoom(pan.video, pan.entry);
}
function onZoomPointerUp(event) {
  const pan = zoomPan;
  if (!pan || event.pointerId !== pan.id) return;
  zoomPan = null;
  pan.entry.player.removeAttribute('data-tsix-panning');
  if (pan.moved) zoomClickBlock = performance.now() + 500;
}
function onZoomClick(event) {
  if (performance.now() > zoomClickBlock) return;
  zoomClickBlock = 0;
  event.preventDefault();
  event.stopImmediatePropagation();
}
// Leaving focus or fullscreen, a replaced player, a closed stream or the
// switch turned off reset the zoom.
function syncZoom() {
  for (const [video, entry] of [...zoomed])
    if (!feature('streamZoom') || !video.isConnected || video.parentElement !== entry.player || !zoomPlayer(video))
      resetZoom(video);
}
document.addEventListener('wheel', onZoomWheel, { capture: true, passive: false });
document.addEventListener('pointerdown', onZoomPointerDown, true);
window.addEventListener('pointermove', onZoomPointerMove, true);
window.addEventListener('pointerup', onZoomPointerUp, true);
window.addEventListener('pointercancel', onZoomPointerUp, true);
document.addEventListener('click', onZoomClick, true);
