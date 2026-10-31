// Stream volume above 100%: native gain or Web Audio after the capped HTML media element.
function syncVolumes(enabled) {
  const seen = new Set();
  if (enabled)
    for (const element of new Set([...records.keys(), ...document.querySelectorAll('.tsv-screenshare-portal-ctx')])) {
      for (const slider of element.querySelectorAll('.screen-overlay__hero-actions__action-volume-slider:not(input)')) {
        const vm = slider.closest('.video-stream')?.__vue__;
        if (
          !vm?.session?.isInbound ||
          !vm.$watch ||
          !vm.videoRef ||
          typeof vm.volume !== 'number' ||
          typeof vm.onConnectionRef !== 'function'
        )
          continue;
        if (!volumes.has(slider)) {
          // Let native metadata and portal measurement settle before
          // enhancing the slider; existing controls keep their gain state.
          if (vm.videoRef.readyState < 2) continue;
          if (!volumeReady.has(slider)) {
            if (!volumeFrames.has(slider))
              volumeFrames.set(
                slider,
                requestAnimationFrame(() => {
                  volumeFrames.delete(slider);
                  volumeReady.add(slider);
                  schedule();
                })
              );
            continue;
          }
        }
        if (volumes.has(slider) && volumes.get(slider).session !== vm.session) {
          volumes.get(slider).dispose();
          volumes.delete(slider);
        }
        seen.add(slider);
        if (!volumes.has(slider)) volumes.set(slider, createVolume(slider, vm, volumeHandoffs, volumeRemembered));
      }
    }
  for (const [slider, control] of volumes)
    if (!seen.has(slider)) {
      control.dispose();
      volumes.delete(slider);
    }
}
// Volume per streamer: identity UID -> last chosen gain. 100% removes the
// entry; mute and 0% are left to TeamSpeak. No names, servers or channels.
const volumeMemoryKey = 'tsix.layout.streamVolumes';
const volumeMemoryLimit = 200;
const streamerOf = session => {
  const uid = session?.client?.properties?.uniqueIdentifier;
  return typeof uid === 'string' && uid ? uid : null;
};
function readVolumes() {
  try {
    const saved = JSON.parse(localStorage.getItem(volumeMemoryKey) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}
function rememberedVolume(session) {
  const uid = streamerOf(session),
    gain = uid ? readVolumes()[uid]?.gain : null;
  return Number.isFinite(gain) && gain > 0 && gain <= 3 ? gain : null;
}
function rememberVolume(session, gain) {
  const uid = streamerOf(session);
  if (!uid || !feature('volumeMemory') || !Number.isFinite(gain) || gain <= 0 || gain > 3) return;
  const saved = readVolumes();
  delete saved[uid];
  if (Math.abs(gain - 1) > 0.001) saved[uid] = { gain: Math.round(gain * 100) / 100, at: Date.now() };
  const entries = Object.entries(saved)
    .filter(([, entry]) => Number.isFinite(entry?.gain))
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, volumeMemoryLimit);
  try {
    if (entries.length) localStorage.setItem(volumeMemoryKey, JSON.stringify(Object.fromEntries(entries)));
    else localStorage.removeItem(volumeMemoryKey);
  } catch {
    /* The chosen volume still applies to the current stream. */
  }
}
function createVolume(slider, vm, handoffs = new WeakMap(), remembered = new WeakSet()) {
  const session = vm.session,
    before = slider.getAttribute('data-tsix-native-volume');
  // The hidden native 0..100 slider emits its clamped model value on mute
  // changes. Detach that model listener while our range owns volume, or
  // unmuting silently writes 100% back over the native 300% gain.
  let sliderVm = slider.__vue__;
  while (sliderVm?.$parent?.$el === slider) sliderVm = sliderVm.$parent;
  const modelListeners = [...(sliderVm?._events?.input || [])];
  for (const listener of modelListeners) sliderVm.$off('input', listener);
  const host = document.createElement('span'),
    input = document.createElement('input'),
    value = document.createElement('output');
  host.setAttribute('data-tsix-volume-control', '');
  input.type = 'range';
  input.min = '0';
  input.max = '300';
  input.step = '1';
  input.setAttribute('aria-label', 'Stream volume');
  input.className = 'screen-overlay__hero-actions__action-volume-slider';
  host.append(input, value);
  slider.after(host);
  slider.setAttribute('data-tsix-native-volume', '');
  // TS6's custom track contains video only: its stream audio is played by
  // the native session backend, whose volume setter accepts a gain value.
  // Standard audio tracks instead need Web Audio above HTML media's limit.
  const nativeAudio =
    !vm.videoRef.srcObject?.getAudioTracks().length && typeof navigator.createMediaStreamRequest === 'function';
  let percent = Math.round(Math.max(0, Math.min(nativeAudio ? 3 : 1, session.volume)) * 100);
  let graph = null,
    epoch = 0,
    dead = false,
    handedOff = false;
  const paint = () => {
    const shown = session.muted ? 0 : percent;
    if (input.value !== String(shown)) input.value = String(shown);
    if (value.textContent !== `${shown}%`) value.textContent = `${shown}%`;
    if (input.getAttribute('aria-valuetext') !== `${shown}%`) input.setAttribute('aria-valuetext', `${shown}%`);
  };
  // beta5 invokes this function ref with null and the video on each render.
  // A synchronous $watch on videoRef contaminates the active render's Vue
  // dependencies and creates an endless ref -> render -> ref cycle. Adapt
  // only the native HTML-volume assignment, retaining the same media/track
  // lifecycle. No synchronous watchers or session writes during rendering.
  const originalRef = vm.onConnectionRef;
  const volumeRef = element => {
    if (!nativeAudio) return originalRef.call(vm, element);
    vm.videoRef = element;
    if (element && element.srcObject !== vm.mediaStream) {
      vm.mediaStream?.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      element.srcObject = vm.mediaStream;
      vm.internalVolume = Math.max(0, Math.min(100, session.volume * 100));
    }
    // Native mute replies can arrive while media is being replaced. Apply
    // the current state even when the ref points at the same media object.
    if (element) {
      const level = session.muted ? 0 : Math.max(0, Math.min(1, session.volume));
      if (element.volume !== level) element.volume = level;
    }
  };
  if (nativeAudio) vm.onConnectionRef = volumeRef;
  function stopGraph() {
    if (!graph) return;
    const old = graph;
    graph = null;
    old.source.disconnect();
    old.gain.disconnect();
    old.video.removeEventListener('volumechange', reconcile);
    old.video.removeEventListener('play', reconcile);
    old.video.removeEventListener('pause', reconcile);
    old.context.removeEventListener('statechange', reconcile);
    old.context.close().catch(() => {});
    old.video.volume = session.muted ? 0 : Math.max(0, Math.min(1, session.volume));
  }
  function reconcile() {
    if (dead) return;
    if (nativeAudio) {
      percent = Math.round(Math.max(0, Math.min(3, session.volume)) * 100);
      if (vm.internalVolume !== Math.min(percent, 100)) vm.internalVolume = Math.min(percent, 100);
      const level = session.muted ? 0 : Math.min(1, session.volume);
      if (vm.videoRef && vm.videoRef.volume !== level) vm.videoRef.volume = level;
      paint();
      return;
    }
    if (graph) {
      // Media replacement and device changes fall back to native playback.
      // Never leave an old source playing after TS6 replaces its media.
      if (
        graph.video !== vm.videoRef ||
        graph.stream !== vm.videoRef?.srcObject ||
        graph.sink !== (vm.videoRef?.sinkId || '') ||
        graph.context.state === 'closed'
      ) {
        ++epoch;
        stopGraph();
        percent = Math.min(percent, 100);
      } else {
        graph.gain.gain.value =
          graph.active && !session.muted && !graph.video.muted && !graph.video.paused ? percent / 100 : 0;
        if (graph.active && graph.video.volume !== 0) graph.video.volume = 0;
      }
    }
    // Respect native volume updates, retaining boost across mute/unmute.
    if (Math.abs(session.volume - Math.min(percent, 100) / 100) > 0.0001) {
      ++epoch;
      stopGraph();
      percent = Math.round(Math.max(0, Math.min(1, session.volume)) * 100);
    }
    paint();
  }
  async function change() {
    const request = ++epoch,
      next = Number(input.value);
    input.removeAttribute('title');
    percent = next;
    if (nativeAudio) {
      vm.internalVolume = Math.min(next, 100);
      session.muted = next === 0;
      session.volume = next / 100;
      vm.videoRef.volume = Math.min(next, 100) / 100;
      paint();
      return;
    }
    // Keep the native setter inside HTMLMediaElement's legal 0..1 range.
    vm.volume = Math.min(next, 100);
    paint();
    if (next <= 100) {
      stopGraph();
      return;
    }
    try {
      if (!graph) {
        const video = vm.videoRef,
          stream = video.srcObject;
        if (!stream?.getAudioTracks().length) throw Error('This stream has no audio track available for amplification');
        const context = new AudioContext(),
          gain = context.createGain();
        gain.gain.value = 0;
        try {
          const source = context.createMediaStreamSource(stream);
          source.connect(gain);
          gain.connect(context.destination);
          graph = { video, stream, context, source, gain, sink: video.sinkId || '', active: false };
        } catch (error) {
          context.close().catch(() => {});
          throw error;
        }
        video.addEventListener('volumechange', reconcile);
        video.addEventListener('play', reconcile);
        video.addEventListener('pause', reconcile);
        context.addEventListener('statechange', reconcile);
      }
      const pending = graph;
      if (pending.sink) {
        if (!pending.context.setSinkId) throw Error('Amplification is unavailable on this audio output');
        await pending.context.setSinkId(pending.sink);
      }
      await pending.context.resume();
      if (dead || request !== epoch || graph !== pending) return;
      if (pending.context.state !== 'running') throw Error('Audio amplification could not start');
      pending.active = true;
      reconcile();
    } catch (error) {
      if (dead || request !== epoch) return;
      stopGraph();
      percent = Math.min(percent, 100);
      paint();
      input.title = `Volume limited to 100%: ${error.message}`;
    }
  }
  // Stop native tile focus/drag handlers while preserving range keyboard use.
  for (const type of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup'])
    host.addEventListener(type, event => event.stopPropagation());
  input.addEventListener('input', change);
  // Remember the committed choice (pointer release or key step), not every
  // intermediate drag value.
  const commit = () => rememberVolume(session, Number(input.value) / 100);
  input.addEventListener('change', commit);
  const unwatch = vm.$watch(() => `${session.volume}:${session.muted}`, reconcile);
  const unwatchMedia = nativeAudio ? () => {} : vm.$watch(() => vm.mediaStream, reconcile);
  const unwatchVideo = nativeAudio ? () => {} : vm.$watch(() => vm.videoRef, reconcile);
  // Fullscreen moves beta5's portal and creates a fresh player. Its first
  // native ref runs before we can enhance it, so keep that initial HTML
  // assignment legal and restore the chosen gain when its control mounts.
  const beforeDestroy = () => {
    if (!dead && nativeAudio && session.status === 4 && session.volume > 1) {
      handoffs.set(session, session.volume);
      handedOff = true;
      session.volume = 1;
    }
  };
  vm.$on?.('hook:beforeDestroy', beforeDestroy);
  // Apply a restored gain without touching mute state. Above 100%, standard
  // audio tracks go through the same Web Audio path as the range input.
  const setVolume = gain => {
    if (dead) return;
    if (nativeAudio) {
      session.volume = gain;
      percent = Math.round(gain * 100);
      vm.internalVolume = Math.min(percent, 100);
      vm.videoRef.volume = session.muted ? 0 : Math.min(1, gain);
      paint();
      return;
    }
    input.value = String(Math.round(gain * 100));
    void change();
  };
  if (handoffs.has(session)) {
    remembered.add(session);
    const gain = handoffs.get(session);
    handoffs.delete(session);
    if (session.status === 4 && session.volume === 1) setVolume(gain);
  } else if (!remembered.has(session)) {
    // Once per watched session, and only over TeamSpeak's untouched default:
    // a restored or already adjusted volume is never replaced.
    remembered.add(session);
    const gain = feature('volumeMemory') && session.status === 4 && session.volume === 1 && rememberedVolume(session);
    if (gain) setVolume(gain);
  }
  paint();
  return {
    session,
    gain: () => percent / 100,
    setVolume,
    dispose() {
      dead = true;
      ++epoch;
      stopGraph();
      unwatch();
      unwatchMedia();
      unwatchVideo();
      vm.$off?.('hook:beforeDestroy', beforeDestroy);
      if (nativeAudio && !handedOff && session.volume > 1) {
        session.volume = 1;
        vm.internalVolume = 100;
        if (vm.videoRef) vm.videoRef.volume = session.muted ? 0 : 1;
      }
      if (vm.onConnectionRef === volumeRef) vm.onConnectionRef = originalRef;
      if (sliderVm && !sliderVm._isDestroyed)
        for (const listener of modelListeners) {
          if (!sliderVm._events.input?.includes(listener)) sliderVm.$on('input', listener);
        }
      input.removeEventListener('input', change);
      input.removeEventListener('change', commit);
      host.remove();
      if (before === null) slider.removeAttribute('data-tsix-native-volume');
      else slider.setAttribute('data-tsix-native-volume', before);
    }
  };
}
