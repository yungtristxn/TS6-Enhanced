// Embedded in the native loader payload for the verified beta5 main renderer.
// TeamSpeak 6 plays the poke sound only under the "message received" sound
// setting and never while away or speaker-muted, and flashes the taskbar only
// for the open server tab. This helper listens to the same text-message event
// for every connection, plays TeamSpeak's own poke sound when TeamSpeak did not
// and flashes the taskbar. The native poke card is left unchanged.
(() => {
  window.__tsixPokes?.dispose();
  const feature = id => window.__tsixFeatures?.enabled(id) ?? true;
  // beta5 TextMessageTargetMode.POKE. Host messages without an invoker arrive
  // with the same mode, as in the native notification handler.
  const POKE = 4;
  const sound = 'you_were_poked';
  const root = () => document.querySelector('main')?.__vue__?.$root;
  const api = () => root()?._vm?.tsapi;
  // Like TeamSpeak, only while its window is in the background and its own
  // "flash on poke" setting is on. A second flash request is harmless.
  function flash() {
    if (document.hasFocus() || root()?.appController?.workflowSettings?.flashTaskBarOnPoke === false) return false;
    tsclient_internal.tsnotifications_flashTaskbar(() => {});
    return true;
  }
  // TeamSpeak's sound handler listens to the same event before this helper and
  // records each sound it plays; skip ours when it has just played the poke.
  function play(client) {
    const sounds = client.soundNotifications,
      last = sounds?.lastPlayed?.get?.(sound);
    if (typeof last === 'number' && Date.now() - last < 1500) return 'native';
    const settings = client.audio?.audioSettings;
    if ([0, 1].some(direction => settings?.[direction]?.notificationsDevice?.id === 'none')) return 'off';
    sounds?.lastPlayed?.set?.(sound, Date.now());
    if (typeof client.audio?.playNotificationSound === 'function') client.audio.playNotificationSound(sound);
    else tsclient_internal.playWaveFile(0, sound, () => {});
    return 'played';
  }
  let client = null,
    subscription = null,
    timer = 0,
    disposed = false,
    received = 0,
    lastSound = null,
    flashes = 0;
  // Sound and flash are independent: a failure in one must not skip the other.
  const attempt = action => {
    try {
      action();
    } catch (error) {
      if (window.__tsixPokes) window.__tsixPokes.error = error.message;
    }
  };
  function onMessage(event) {
    const own = event?.sc_handler?.ownClient;
    if (event?.targetMode !== POKE || !own || event.target?.id !== own.id) return;
    if (event.invoker && event.invoker === own) return;
    received++;
    if (feature('pokeSound')) attempt(() => (lastSound = play(client)));
    if (feature('pokeFlash')) attempt(() => flash() && flashes++);
  }
  // The event system is ready with the main window; retry briefly otherwise.
  function subscribe(attempt = 0) {
    if (disposed) return;
    client = api();
    if (typeof client?.eventSystem?.onTextMessage === 'function') {
      subscription = client.eventSystem.onTextMessage(onMessage);
      return;
    }
    if (attempt < 120) timer = setTimeout(() => subscribe(attempt + 1), 500);
  }
  subscribe();
  window.__tsixPokes = {
    version: '1.2.0',
    error: null,
    status: () => ({ subscribed: !!subscription, received, sound: lastSound, flashes }),
    dispose() {
      disposed = true;
      clearTimeout(timer);
      subscription?.dispose?.();
      subscription = null;
      delete window.__tsixPokes;
    }
  };
  return { subscribed: !!subscription };
})();
