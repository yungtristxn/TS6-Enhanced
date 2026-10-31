// Observers, lifecycle and the window.__tsixStreams API.
function onFullscreenChange() {
  // Native doUpdateGrid deliberately returns while fullscreen is active.
  // Re-run on exit even when its last measured dimensions did not change.
  if (!document.fullscreenElement) for (const { vm } of records.values()) if (!vm._isDestroyed) vm.doUpdateGrid();
  schedule();
}
// Native buttons express disabled state through classes. Watch those classes
// narrowly; message/media class changes and our own markers need no pass.
const observer = new MutationObserver(changes => {
  if (
    changes.some(change => {
      const node = change.target.nodeType === 1 ? change.target : change.target.parentElement;
      if (
        change.attributeName === 'class' &&
        !node?.matches('.tsv-button,.tsv-tool-button,.tsv-tool-button-context-menu-toggle,.tsv-window')
      )
        return false;
      return !node?.closest(
        '.ts-chat-container,[data-tsix-volume-control],[data-tsix-stream-toolbar],[data-tsix-broadcast-bar]'
      );
    })
  )
    schedule();
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['href', 'disabled', 'class']
});
const onStyleLoad = event => {
  if (event.target?.tagName === 'LINK') schedule();
};
document.addEventListener('load', onStyleLoad, true);
document.addEventListener('loadedmetadata', schedule, true);
document.addEventListener('loadeddata', schedule, true);
document.addEventListener('fullscreenchange', onFullscreenChange);
window.addEventListener('tsix-features', schedule);
window.__tsixStreams = {
  version: '1.1.0',
  sync,
  volumeForSession: session =>
    volumeHandoffs.get(session) ??
    [...volumes.values()].find(control => control.session === session)?.gain() ??
    session.volume,
  restoreVolume(session, value) {
    if (disposed || !Number.isFinite(value) || value < 0 || value > 3) throw Error('Invalid stream volume');
    // A restored session keeps its saved volume, never the per-streamer one.
    volumeRemembered.add(session);
    const control = [...volumes.values()].find(control => control.session === session);
    if (value > 1 && control) {
      volumeHandoffs.delete(session);
      control.setVolume(value);
    } else if (value > 1) {
      // Keep the first native HTML-media ref legal. createVolume applies the
      // requested gain once its capped ref adapter or Web Audio path is ready.
      volumeHandoffs.set(session, value);
      session.volume = 1;
      schedule();
    } else {
      volumeHandoffs.delete(session);
      session.volume = value;
    }
  },
  status: () => ({
    trayCollapsed,
    chatVisible,
    viewers: [...records.values()].map(r => ({
      stage: r.element.getAttribute(marker),
      savedSplit: r.savedSplit,
      tray: r.element.getAttribute(trayMarker)
    })),
    keyboardControls: buttons.size
  }),
  dispose() {
    if (document.fullscreenElement) throw Error('Exit fullscreen before removing or replacing the stream helper');
    disposed = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    for (const id of volumeFrames.values()) cancelAnimationFrame(id);
    volumeFrames.clear();
    broadcast.dispose();
    for (const control of volumes.values()) control.dispose();
    volumes.clear();
    for (const { button } of joins.values()) button.remove();
    joins.clear();
    document.removeEventListener('load', onStyleLoad, true);
    document.removeEventListener('loadedmetadata', schedule, true);
    document.removeEventListener('loadeddata', schedule, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('tsix-features', schedule);
    for (const record of records.values()) release(record);
    for (const [node, record] of buttons) releaseButton(node, record);
    delete window.__tsixStreams;
  }
};
sync();
return { attachedViewers: records.size, keyboardControls: buttons.size };
