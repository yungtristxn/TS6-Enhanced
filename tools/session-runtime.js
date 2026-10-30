// Exact beta5 adapter for a confirmed update. It uses the same controller,
// connection methods and IPC payloads as the supported native client.
(() => {
  window.__tsixUpdateSession?.dispose?.();
  const recoveryWatches = new Map();
  let currentFence = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, message, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await delay(100);
    }
    throw Error(message);
  };
  const native = () => {
    const vm = document.querySelector('main')?.__vue__?.$root;
    const app = vm?.appController,
      api = vm?._vm?.tsapi;
    if (
      !app?.openConnection ||
      !app.applyWorkflowSettings ||
      !api?.IsReady?.() ||
      !Array.isArray(api.serverConnectionHandlers)
    )
      throw Error('TeamSpeak session restoration is unavailable for this client');
    return { app, api };
  };
  const callback = (fn, ...args) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('TeamSpeak did not answer a session request')), 5000);
      try {
        fn(...args, (error, value) => {
          clearTimeout(timer);
          error === 0 ? resolve(value) : reject(Error('TeamSpeak rejected a session request (' + error + ')'));
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  const post = (cmd, payload) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('TeamSpeak did not answer ' + cmd)), 5000);
      tsclient_internal.postMessage({ cmd, payload }, response => {
        clearTimeout(timer);
        response.err === 0
          ? resolve(response.payload)
          : reject(Error('TeamSpeak rejected ' + cmd + ' (' + response.err + ')'));
      });
    });
  const sources = async () => {
    if (document.querySelector('.ts-setup-stream')) throw Error('Close stream setup before restarting for an update');
    if (typeof tsclient_internal.subscribeAvailableSourcesWithScreenshots !== 'function')
      throw Error('Capture source validation is unavailable');
    try {
      tsclient_internal.setSubscribedScreenshotWhitelist?.(true, [], true, [], () => {});
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Capture sources did not become available')), 5000);
        tsclient_internal.subscribeAvailableSourcesWithScreenshots((error, value) => {
          if (error) {
            clearTimeout(timer);
            reject(Error('Capture sources could not be read'));
            return;
          }
          if (value?.screens && value?.windows && value?.cameras) {
            clearTimeout(timer);
            resolve(value);
          }
        });
      });
    } finally {
      tsclient_internal.unsubscribeAvailableSourcesWithScreenshots?.(() => {});
    }
  };
  const findSource = (catalogue, source) => {
    const list = source.type === 1 ? catalogue.cameras : source.type === 2 ? catalogue.screens : catalogue.windows;
    return list?.arr.find(item => String(source.type === 1 ? item.uniqueName : item.sourceId) === String(source.id));
  };
  const sourceTitle = (source, item) => String(source.type === 1 ? item.name : (item.title ?? ''));
  const validateAudioSelections = async streams => {
    const identities = new Set(
      streams
        .filter(s => s.config.audio)
        .flatMap(s => s.config.appAudio?.entries || [])
        .map(entry => entry.identity)
    );
    if (!identities.size) return;
    if (typeof tsclient_internal.subscribeCapturableAudioApps !== 'function')
      throw Error('Application audio cannot be validated for restoration');
    try {
      const apps = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Application audio did not become available')), 5000);
        tsclient_internal.subscribeCapturableAudioApps((error, value) => {
          if (error) {
            clearTimeout(timer);
            reject(Error('Application audio cannot be read'));
            return;
          }
          if (Array.isArray(value?.apps) && value.status !== 'loading') {
            clearTimeout(timer);
            resolve(value.apps);
          }
        });
      });
      if ([...identities].some(identity => !apps.some(app => app.identity === identity && app.persistable !== false)))
        throw Error('An unavailable or temporary application-audio selection cannot be safely restored');
    } finally {
      tsclient_internal.unsubscribeCapturableAudioApps?.(() => {});
    }
  };
  const key = handler => String(handler.properties.uniqueIdentifier) + '|' + String(handler.connectInfo.identity || '');
  const fields = [
    'address',
    'port',
    'nickname',
    'phonetic_nickname',
    'identity',
    'server_password',
    'default_channel',
    'default_channel_password',
    'default_channel_id',
    'sound_pack',
    'show_serverquery_clients',
    'send_mytsid',
    'announce_to_chat',
    'connect_muted',
    'uuid'
  ];
  const workflow = app => ({
    restoreOpenedActivities: !!app.workflowSettings.restoreOpenedActivities,
    autoConnectSkipActivityCheck: app.workflowSettings.autoConnectSkipActivityCheck
  });
  const bounded = (promise, message, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(message)), timeout);
      Promise.resolve(promise).then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  function activityFence(mode, api) {
    currentFence?.dispose();
    let cancelled = false,
      defaultsChanged = false,
      banner = null,
      blocking = mode === 'shutdown',
      writingDefaults = false;
    const watches = [],
      voiceWatches = new Map();
    const showStatus = text => {
      if (banner) return;
      banner = document.createElement('div');
      banner.setAttribute('role', 'status');
      banner.textContent = text;
      banner.setAttribute('data-tsix-restart-pending', '');
      banner.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(20,29,40,.94);color:white;font:16px sans-serif';
      document.body.append(banner);
    };
    const events = ['pointerdown', 'click', 'keydown', 'keyup', 'beforeinput', 'input', 'change'];
    const fence = {
      get cancelled() {
        return cancelled;
      },
      get defaultsChanged() {
        return defaultsChanged;
      },
      userIntent() {
        if (blocking) return false;
        cancelled = true;
        return true;
      },
      lockAudio() {
        fence.check();
        blocking = true;
        showStatus('Restoring audio… Please wait.');
      },
      unlockAudio() {
        blocking = mode === 'shutdown';
        banner?.remove();
        banner = null;
      },
      setDefaults(value) {
        writingDefaults = true;
        try {
          api.defaultClientSelfProperties.inputMuted = value.inputMuted;
          api.defaultClientSelfProperties.outputMuted = value.outputMuted;
        } finally {
          writingDefaults = false;
        }
      },
      check() {
        if (mode === 'restore' && api.activeCallSessions?.length) cancelled = true;
        if (cancelled) throw Error('Your session changed; automatic restoration stopped to preserve your choices');
      },
      watchDefaults() {
        const watch = document.querySelector('main')?.__vue__?.$watch?.(
          () =>
            String(api.defaultClientSelfProperties.inputMuted) +
            ':' +
            String(api.defaultClientSelfProperties.outputMuted),
          () => {
            if (!writingDefaults) {
              defaultsChanged = true;
              cancelled = true;
            }
          },
          { sync: true }
        );
        if (watch) watches.push(watch);
      },
      watchVoice(handler) {
        const stop = document.querySelector('main')?.__vue__?.$watch?.(
          () =>
            String(handler.ownClient?.properties.inputMuted) + ':' + String(handler.ownClient?.properties.outputMuted),
          () => {
            cancelled = true;
          },
          { sync: true }
        );
        if (stop) voiceWatches.set(handler, stop);
      },
      releaseVoice(handler) {
        voiceWatches.get(handler)?.();
        voiceWatches.delete(handler);
      },
      dispose() {
        for (const stop of watches) stop();
        for (const stop of voiceWatches.values()) stop();
        voiceWatches.clear();
        for (const name of events) document.removeEventListener(name, onInput, true);
        banner?.remove();
        if (currentFence === fence) currentFence = null;
      }
    };
    const onInput = event => {
      if (!event.isTrusted) return;
      if (!fence.userIntent()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    for (const name of events) document.addEventListener(name, onInput, true);
    if (mode === 'shutdown') showStatus('Restarting TeamSpeak… Please wait.');
    currentFence = fence;
    return fence;
  }
  async function restoreClosePolicy(api, snapshot) {
    if (!snapshot.closePolicy) return;
    const value = snapshot.closePolicy.ignoreExit;
    if (api.preferences.getValue('application.ignore_exit_request') === value) return;
    api.preferences.setValue('application.ignore_exit_request', value);
    await wait(
      () => api.preferences.getValue('application.ignore_exit_request') === value,
      'The window-close preference could not be restored',
      5000
    );
  }
  const restoreWorkflow = async (app, saved, normalStartup = false) => {
    const guard = window.__tsixSessionGuard;
    if (!guard?.active) return;
    const original = guard.release() || {};
    const values = {
      restoreOpenedActivities: original.restoreOpenedActivities ?? saved.restoreOpenedActivities,
      autoConnectSkipActivityCheck: original.autoConnectSkipActivityCheck ?? saved.autoConnectSkipActivityCheck
    };
    await saveWorkflow(app, values);
    if (normalStartup && !app.connections.length) {
      if (values.restoreOpenedActivities) app.restoreOpenedActivities?.();
      app.checkAutoConnect?.();
    }
  };
  async function saveWorkflow(app, value) {
    app.applyWorkflowSettings(value);
    for (let attempt = 0; attempt < 20; attempt++) {
      const raw = await callback(tsclient_internal.getJsonBlob.bind(tsclient_internal), 'general_settings');
      const saved = JSON.parse(raw || '{}').workflow;
      if (saved && Object.entries(value).every(([name, v]) => saved[name] === v)) return;
      await delay(50);
    }
    throw Error('TeamSpeak could not confirm saved startup preferences');
  }
  async function capture() {
    const { app, api } = native();
    if (!window.__tsixSessionGuard?.supported || !window.__tsixSessionGuard.early)
      throw Error('Safe startup session restoration is unavailable');
    if (api.activeCallSessions?.length)
      throw Error('Finish private or group calls before updating; they require a new call handshake');
    if (document.fullscreenElement) throw Error('Exit stream fullscreen before updating');
    const all = api.allOutboundStreams?.() || api.outboundStreams || [];
    if (all.some(stream => !stream.client?.sc_handler))
      throw Error('Finish chat-room sharing before updating; server-channel sharing can be restored');
    const catalogue = all.length ? await sources() : null;
    await validateAudioSelections(all);
    if (typeof api.preferences?.getValue !== 'function' || typeof api.preferences?.setValue !== 'function')
      throw Error('Window-close preferences are unavailable');
    const snapshot = {
      schema: 1,
      build: 1791901251,
      capturedAt: Date.now(),
      workflow: workflow(app),
      closePolicy: { ignoreExit: !!api.preferences.getValue('application.ignore_exit_request') },
      defaults: {
        inputMuted: !!api.defaultClientSelfProperties.inputMuted,
        outputMuted: !!api.defaultClientSelfProperties.outputMuted
      },
      activeServer: '',
      captureServer: '',
      connections: [],
      drafts: [],
      views: []
    };
    for (const handler of api.serverConnectionHandlers) {
      if (!handler.isEstablished) {
        if (handler.isActivelyConnecting || handler.isReconnecting)
          throw Error('Wait for server connections to settle before updating');
        continue;
      }
      const own = handler.ownClient,
        channel = own?.channel;
      if (!channel) throw Error('The current channel is unavailable');
      const info = {};
      for (const name of fields) if (handler.connectInfo[name] !== undefined) info[name] = handler.connectInfo[name];
      if (typeof own.properties.nickname === 'string') info.nickname = own.properties.nickname;
      let channelPassword =
        String(info.default_channel_id) === String(channel.id) ? String(info.default_channel_password || '') : '';
      if (channel.properties?.flagPassword && !channelPassword)
        throw Error('The current password-protected channel cannot be restored automatically');
      const connection = {
        key: key(handler),
        serverUid: String(handler.properties.uniqueIdentifier),
        selfUid: String(own.properties.uniqueIdentifier || ''),
        channelId: String(channel.id),
        channelPassword,
        connectInfo: clone(info),
        voice: {
          inputMuted: !!own.properties.inputMuted,
          outputMuted: !!own.properties.outputMuted,
          inputDeactivated: !!own.properties.inputDeactivated,
          away: !!own.properties.away,
          awayMessage: String(own.properties.awayMessage || '')
        },
        outbound: [],
        inbound: []
      };
      for (const stream of handler.outboundStreams || []) {
        if (stream.isCall || !stream.sourceInfo || !stream.config || !stream.quality)
          throw Error('An active stream cannot be saved');
        const item = findSource(catalogue, stream.sourceInfo);
        if (!item) throw Error('The shared capture source is no longer available');
        const config = {};
        for (const name of ['bitrate', 'access', 'mode', 'viewerLimit', 'audio', 'appAudio', 'name', 'type'])
          if (stream.config[name] !== undefined) config[name] = stream.config[name];
        connection.outbound.push({
          source: clone({ ...stream.sourceInfo, id: String(stream.sourceInfo.id) }),
          catalogue: { id: String(stream.sourceInfo.id), title: sourceTitle(stream.sourceInfo, item) },
          config: clone(config),
          quality: clone(stream.quality),
          paused: !!stream.paused,
          hidden: !!stream.hidden
        });
      }
      for (const stream of handler.joinedStreams?.inbound || []) {
        if (stream.status !== 4) throw Error('Wait for watched streams to finish connecting before updating');
        if (!stream.client?.properties?.uniqueIdentifier) throw Error('The watched stream owner cannot be verified');
        connection.inbound.push({
          id: String(stream.idData.serverSessionId),
          ownerUid: String(stream.client?.properties?.uniqueIdentifier || ''),
          volume: window.__tsixStreams?.volumeForSession?.(stream) ?? stream.volume,
          muted: !!stream.muted,
          hidden: !!stream.hidden
        });
      }
      if (api.activeAudioTarget === handler) snapshot.activeServer = connection.key;
      if (api.currentCaptureOwner === handler) snapshot.captureServer = connection.key;
      snapshot.connections.push(connection);
    }
    const drafts = new Map();
    const addDraft = (identifier, draft) => {
      if (!draft) return;
      if (draft.previewItems?.length || draft.attachmentItems?.length)
        throw Error('Finish unsent message attachments before updating');
      if (!draft.message) return;
      const handler = api.serverConnectionHandlers.find(
        h => h.isEstablished && h.identifier != null && identifier.endsWith('#' + h.identifier)
      );
      if (!handler) throw Error('An unsent draft cannot be restored to its original conversation');
      const chatKey = identifier.slice(0, -String(handler.identifier).length - 1);
      drafts.set(identifier, { connectionKey: key(handler), chatKey, content: clone(draft.message) });
    };
    for (const [identifier, draft] of api.chatInputCache?.mappedInputs || []) addDraft(identifier, draft);
    for (const node of document.querySelectorAll('.ts-chat-input-container')) {
      const vm = node.__vue__;
      if (!vm?.chatInputText?.length && !vm?.attachmentItems?.length && !vm?.previewItems?.length) continue;
      if (!vm.chat?.GetUniqueChatIdentifier || !vm.chatInputField)
        throw Error('This unsent draft cannot be restored automatically');
      addDraft(vm.chat.GetUniqueChatIdentifier(), {
        message: vm.chatInputField.underlyingContent,
        previewItems: vm.previewItems,
        attachmentItems: vm.attachmentItems
      });
    }
    snapshot.drafts = [...drafts.values()];
    for (const node of document.querySelectorAll('.tsv-screenshare')) {
      const vm = node.__vue__,
        handler = vm?.item?.sc_handler;
      if (!handler || vm.item.layoutMode?.kind !== 'focus' || !Array.isArray(vm.flatTiles)) continue;
      const tile = vm.flatTiles.find(t => t.tile.id === vm.item.layoutMode.tileId),
        stream = tile?.tile?.payload?.session;
      if (!stream) continue;
      snapshot.views.push({
        connectionKey: key(handler),
        channelId: String(vm.item.id),
        focus: stream.isInbound
          ? { direction: 'inbound', id: String(stream.idData.serverSessionId) }
          : { direction: 'outbound', id: String(stream.sourceInfo.id), type: stream.sourceInfo.type }
      });
    }
    return snapshot;
  }
  const fingerprint = snapshot => {
    const value = clone(snapshot);
    delete value.capturedAt;
    return JSON.stringify(value);
  };
  async function prepare(snapshot) {
    const { api } = native(),
      fence = activityFence('shutdown', api);
    const stillPreparing = () => {
      if (currentFence !== fence) throw Error('Restart preparation was cancelled');
    };
    try {
      if (fingerprint(await capture()) !== fingerprint(snapshot))
        throw Error('Your session changed while preparing the update. Please try again');
      stillPreparing();
      // WM_CLOSE must actually exit even for Hide on Close profiles. The
      // encrypted snapshot restores the original preference on cancel/startup.
      if (snapshot.closePolicy?.ignoreExit) {
        api.preferences.setValue('application.ignore_exit_request', false);
        await wait(
          () => api.preferences.getValue('application.ignore_exit_request') === false,
          'TeamSpeak did not prepare to exit',
          5000
        );
      }
      const latest = await capture();
      latest.closePolicy = snapshot.closePolicy;
      stillPreparing();
      if (fingerprint(latest) !== fingerprint(snapshot))
        throw Error('Your session changed before shutdown. Please try again');
    } catch (error) {
      if (currentFence === fence) await cancel(snapshot);
      throw error;
    }
  }
  async function cancel(snapshot) {
    try {
      await restoreClosePolicy(native().api, snapshot);
    } finally {
      currentFence?.dispose();
    }
  }
  const sameIdentity = (handler, saved) =>
    handler?.isEstablished &&
    String(handler.properties?.uniqueIdentifier) === saved.serverUid &&
    String(handler.ownClient?.properties?.uniqueIdentifier) === saved.selfUid &&
    String(handler.connectInfo?.identity || '') === String(saved.connectInfo.identity || '');
  function draftRecovery(job, api) {
    const { snapshot } = job,
      recovered = new Set(),
      drafts = snapshot.drafts || [];
    const indices = job.draftIndices || drafts.map((_, index) => index);
    const connections = new Map(snapshot.connections.map(connection => [connection.key, connection]));
    const recover = (attachVisible = false) => {
      const editors = new Map(
        [...document.querySelectorAll('.ts-chat-input-container')]
          .map(node => node.__vue__)
          .filter(vm => vm?.chatInputField && vm.chat?.GetUniqueChatIdentifier)
          .map(vm => [vm.chat.GetUniqueChatIdentifier(), vm])
      );
      for (const [index, draft] of drafts.entries()) {
        if (recovered.has(index) && !attachVisible) continue;
        const saved = connections.get(draft.connectionKey);
        // Draft recovery never authorizes voice/media restoration. Match the
        // actual user as well as the server, including default-identity changes.
        const handler = saved && api.serverConnectionHandlers.find(handler => sameIdentity(handler, saved));
        if (!handler || !api.chatInputCache?.setCachedInputForIdentifier) continue;
        const identifier = draft.chatKey + '#' + handler.identifier;
        const editor = editors.get(identifier);
        if (
          editor?.chatInputText?.length &&
          JSON.stringify(editor.chatInputField.underlyingContent) !== JSON.stringify(draft.content)
        )
          continue;
        const existing = api.chatInputCache.getCachedInputForIdentifier?.(identifier);
        if (existing?.message && JSON.stringify(existing.message) !== JSON.stringify(draft.content)) continue;
        if (editor) {
          editor.chatInputField.underlyingContent = clone(draft.content);
          api.chatInputCache.clearCachedInputForIdentifier?.(identifier);
        } else
          api.chatInputCache.setCachedInputForIdentifier(identifier, {
            message: clone(draft.content),
            previewItems: [],
            attachmentItems: []
          });
        recovered.add(index);
      }
    };
    return {
      recover,
      get done() {
        return recovered.size === drafts.length;
      },
      indices: () => [...recovered].map(index => indices[index]),
      watch() {
        if (!job.draftOnly || recovered.size === drafts.length) return;
        recoveryWatches.get(job.id)?.();
        const unwatch = document.querySelector('main')?.__vue__?.$watch?.(
          () =>
            api.serverConnectionHandlers
              .map(
                h =>
                  String(h.id) +
                  ':' +
                  h.connectionStatus +
                  ':' +
                  h.isEstablished +
                  ':' +
                  h.ownClient?.properties?.uniqueIdentifier
              )
              .join('|'),
          () => {
            recover();
            if (recovered.size)
              window.__tsixSessionRecovered?.(
                job.id,
                [...recovered].map(index => indices[index])
              );
            if (recovered.size === drafts.length) {
              recoveryWatches.get(job.id)?.();
              recoveryWatches.delete(job.id);
            }
          }
        );
        if (unwatch) recoveryWatches.set(job.id, unwatch);
      }
    };
  }
  async function restore(job) {
    const { snapshot, restoreSession, validateWindow } = job;
    const { app, api } = await wait(
      () => {
        try {
          return native();
        } catch {
          return null;
        }
      },
      'TeamSpeak session data did not finish loading',
      30000
    );
    const warnings = [],
      restored = new Map(),
      resumedVolumes = [],
      drafts = draftRecovery(job, api);
    if (job.draftOnly) {
      drafts.recover();
      drafts.watch();
      return {
        warnings: [],
        preferencesRestored: true,
        draftsRestored: drafts.done,
        recoveredDrafts: drafts.indices()
      };
    }
    const fence = activityFence('restore', api);
    const deadline = Date.now() + 60000;
    const checkpoint = () => {
      fence.check();
      if (Date.now() >= deadline) throw Error('Session restoration timed out; remaining media stayed stopped');
    };
    const until = (test, message, timeout = 15000) =>
      wait(test, message, Math.max(1, Math.min(timeout, deadline - Date.now())));
    const step = async (promise, message, timeout = 15000) => {
      const result = await bounded(promise, message, Math.max(1, Math.min(timeout, deadline - Date.now())));
      checkpoint();
      return result;
    };
    let preferencesRestored = false,
      defaultsGuarded = false,
      closeRestored = false;
    try {
      await restoreClosePolicy(api, snapshot);
      closeRestored = true;
      checkpoint();
      if (!restoreSession) throw Error('Automatic session restoration expired; only startup preferences were restored');
      if (!window.__tsixSessionGuard?.active || !window.__tsixSessionGuard.supported)
        throw Error('The startup guard was unavailable; session replay was stopped');
      if (
        api.connectedServerConnectionHandlers?.length ||
        api.activeCallSessions?.length ||
        (api.allOutboundStreams?.() || []).length
      )
        throw Error('The session has already changed; automatic restoration was stopped');
      defaultsGuarded = true;
      api.defaultClientSelfProperties.inputMuted = true;
      api.defaultClientSelfProperties.outputMuted = true;
      fence.watchDefaults();
      // Recreate native saved activity tabs while autoconnect is still disabled.
      app.restoreOpenedActivities?.();
      for (const saved of snapshot.connections) {
        checkpoint();
        try {
          const info = {
            ...saved.connectInfo,
            default_channel_id: saved.channelId,
            default_channel: '',
            default_channel_password: saved.channelPassword,
            connect_muted: true
          };
          const activity =
            app.connections.find(item => {
              const current = item.serverConnectionHandler?.connectInfo || item.connectInfo;
              return (
                current &&
                current.address === info.address &&
                current.port === info.port &&
                current.identity === info.identity
              );
            }) || app.openConnection(info, true);
          if (
            !activity.serverConnectionHandler &&
            activity.suspended &&
            typeof activity.spawnServerConnectionHandler === 'function'
          ) {
            const copy = activity.connectInfo?.getAsNewConnectInfoBase?.() || {};
            activity.connectInfo = Object.assign(copy, info);
            await step(activity.spawnServerConnectionHandler(true, true), 'The saved server tab could not reconnect');
          }
          const handler = await until(() => activity.serverConnectionHandler, 'Server connection could not be created');
          checkpoint();
          if (!handler.isEstablished && !handler.isActivelyConnecting && !handler.isReconnecting)
            handler.Connect(info, true);
          await until(() => handler.isEstablished && handler.ownClient?.channel, 'Server did not reconnect', 30000);
          checkpoint();
          if (String(handler.properties.uniqueIdentifier) !== saved.serverUid)
            throw Error('The server identity changed');
          if (String(handler.ownClient.properties.uniqueIdentifier) !== saved.selfUid)
            throw Error('The connected user identity changed');
          if (String(handler.ownClient.channel.id) !== saved.channelId) {
            const target = handler.FindChannel(saved.channelId);
            if (!target) throw Error('The previous channel is unavailable');
            await step(
              handler.RequestMoveClientsToChannel([handler.ownClient], target, saved.channelPassword),
              'Channel move did not finish'
            );
            await until(
              () => String(handler.ownClient?.channel?.id) === saved.channelId,
              'The previous channel could not be joined'
            );
          }
          restored.set(saved.key, handler);
          fence.watchVoice(handler);
        } catch (error) {
          warnings.push('Server/channel restoration failed: ' + error.message);
        }
      }
      checkpoint();
      // Voice is the critical path. Capture enumeration, stream joins and view
      // restoration may time out; none of them should keep a verified channel muted.
      const active = restored.get(snapshot.activeServer) || restored.values().next().value;
      fence.lockAudio();
      try {
        if (active) api.setActiveAudioTarget?.(active);
        const captureHandler = restored.get(snapshot.captureServer);
        const captureSaved = snapshot.connections.find(saved => saved.key === snapshot.captureServer);
        if (
          captureSaved &&
          sameIdentity(captureHandler, captureSaved) &&
          String(captureHandler.ownClient?.channel?.id) === captureSaved.channelId
        )
          await step(captureHandler.audio.ActivateCaptureDevice(), 'Microphone device could not be reactivated');
        for (const saved of snapshot.connections) {
          checkpoint();
          const handler = restored.get(saved.key);
          if (!handler) continue;
          if (!sameIdentity(handler, saved) || String(handler.ownClient?.channel?.id) !== saved.channelId) {
            warnings.push('Channel or identity changed during restoration; microphone remains muted');
            continue;
          }
          fence.releaseVoice(handler);
          try {
            await step(handler.SetClientSelfProperties({ ...saved.voice }, true, false), 'Audio state did not settle');
            await until(
              () =>
                sameIdentity(handler, saved) &&
                String(handler.ownClient?.channel?.id) === saved.channelId &&
                handler.ownClient.properties.inputMuted === saved.voice.inputMuted &&
                handler.ownClient.properties.outputMuted === saved.voice.outputMuted,
              'Audio state did not settle',
              5000
            );
          } catch {
            warnings.push('Audio state could not be fully restored');
          } finally {
            fence.watchVoice(handler);
          }
        }
        checkpoint();
        fence.setDefaults(snapshot.defaults);
        defaultsGuarded = false;
      } finally {
        fence.unlockAudio();
      }
      const catalogue = snapshot.connections.some(c => c.outbound.length) ? await sources().catch(() => null) : null;
      let audioValid = true;
      try {
        await validateAudioSelections(snapshot.connections.flatMap(connection => connection.outbound));
      } catch (error) {
        audioValid = false;
        warnings.push(error.message);
      }
      for (const saved of snapshot.connections) {
        const handler = restored.get(saved.key);
        if (!handler) continue;
        for (const stream of saved.outbound) {
          checkpoint();
          let id = null,
            published = false;
          try {
            if (String(handler.ownClient?.channel?.id) !== saved.channelId)
              throw Error('The channel changed during restoration');
            if (!audioValid && stream.config.audio) throw Error('Application audio could not be restored safely');
            const item = catalogue && findSource(catalogue, stream.source);
            const windowValid =
              stream.source.type !== 3 ||
              (typeof validateWindow === 'function' && (await validateWindow(stream.source.id)) === true);
            if (!item || sourceTitle(stream.source, item) !== stream.catalogue.title || !windowValid)
              throw Error('The original capture source is unavailable or changed');
            checkpoint();
            const audio = stream.config.appAudio,
              captureAudio =
                !!stream.config.audio &&
                !!api.screenshareSupport?.appAudio?.available &&
                !!audio &&
                (audio.scope !== 0 || audio.entries.some(entry => entry.captured !== false));
            const created = await post('createOutboundSession', {
              type: stream.source.type,
              source_id: stream.source.id,
              quality: {
                ...stream.quality,
                cameraHeight: stream.source.cameraHeight || 0,
                cameraWidth: stream.source.cameraWidth || 0
              },
              wanted_capability_video_type: stream.source.pixelFormat,
              wanted_capability_interlaced: stream.source.interlaced,
              capture_audio: captureAudio,
              app_audio: audio
            });
            id = created?.session?.sessionId;
            if (!Number.isSafeInteger(id)) throw Error('Capture session was not created');
            checkpoint();
            // Start paused, verify the published session belongs to the saved
            // channel, then resume. Never emit frames into an unexpected channel.
            await post('pauseSession', { id, isPaused: true });
            checkpoint();
            if (String(handler.ownClient?.channel?.id) !== saved.channelId)
              throw Error('The channel changed during restoration');
            await post('publishSession', {
              id,
              name: stream.source.name,
              type: stream.source.type,
              bitrate: stream.config.bitrate,
              access: stream.config.access,
              mode: stream.config.mode,
              viewerLimit: stream.config.viewerLimit,
              audio: captureAudio,
              sessionIdentifier: { scHandlerId: handler.id, serverSessionId: '' }
            });
            const session = await until(
              () => (api.allOutboundStreams?.() || api.outboundStreams || []).find(s => s.id === id),
              'Sharing did not restart'
            );
            checkpoint();
            if (
              String(session.client?.channel?.id) !== saved.channelId ||
              String(handler.ownClient?.channel?.id) !== saved.channelId
            )
              throw Error('The restored broadcast target changed');
            session.hidden = stream.hidden;
            if (!stream.paused) await post('pauseSession', { id, isPaused: false });
            await until(() => session.paused === stream.paused, 'The stream pause state could not be restored');
            published = true;
          } catch (error) {
            warnings.push('Sharing restoration failed: ' + error.message);
          } finally {
            if (id !== null && !published) await post('closeSession', { id }).catch(() => {});
          }
        }
        for (const stream of saved.inbound) {
          checkpoint();
          try {
            if (String(handler.ownClient?.channel?.id) !== saved.channelId)
              throw Error('The channel changed during restoration');
            const session = await until(
              () => handler.GetInboundSession({ scHandlerId: handler.id, serverSessionId: stream.id }),
              'The watched stream is no longer available'
            );
            checkpoint();
            if (String(session.client?.properties?.uniqueIdentifier || '') !== stream.ownerUid)
              throw Error('The stream owner changed');
            session.volume = Math.min(1, stream.volume);
            session.muted = stream.muted;
            await step(session.join(), 'The stream owner has not accepted the new connection');
            await until(() => session.status === 4, 'The stream did not reconnect');
            checkpoint();
            session.hidden = stream.hidden;
            resumedVolumes.push({ session, volume: stream.volume });
          } catch (error) {
            warnings.push('Watched stream restoration failed: ' + error.message);
          }
        }
      }
      try {
        drafts.recover();
        checkpoint();
        if (active) await step(app.showItem(active.ownClient.channel, 'Chat'), 'The previous view could not be opened');
        for (const { session, volume } of resumedVolumes) {
          checkpoint();
          if (window.__tsixStreams?.restoreVolume) window.__tsixStreams.restoreVolume(session, volume);
          else if (volume <= 1) session.volume = volume;
          else warnings.push('Boosted stream volume could not be restored');
        }
        for (const view of snapshot.views || []) {
          const handler = restored.get(view.connectionKey);
          if (!handler) continue;
          try {
            const vm = await until(
              () =>
                [...document.querySelectorAll('.tsv-screenshare')]
                  .map(node => node.__vue__)
                  .find(
                    vm =>
                      vm?.item?.sc_handler === handler &&
                      String(vm.item.id) === view.channelId &&
                      Array.isArray(vm.flatTiles)
                  ),
              'Previous stream focus could not be restored',
              3000
            );
            const tile = vm.flatTiles.find(t => {
              const s = t.tile?.payload?.session;
              return (
                s &&
                (view.focus.direction === 'inbound'
                  ? s.isInbound && String(s.idData?.serverSessionId) === view.focus.id
                  : !s.isInbound &&
                    String(s.sourceInfo?.id) === view.focus.id &&
                    s.sourceInfo?.type === view.focus.type)
              );
            });
            if (tile) vm.item.layoutMode = { kind: 'focus', tileId: tile.tile.id };
            else warnings.push('The previously focused stream is unavailable');
          } catch (error) {
            warnings.push(error.message);
          }
        }
        drafts.recover(true);
      } catch (error) {
        warnings.push('View restoration failed: ' + error.message);
      }
      checkpoint();
    } catch (error) {
      warnings.push(error.message);
    } finally {
      const preserveChoices = fence.cancelled || fence.defaultsChanged;
      fence.dispose();
      if (defaultsGuarded && !preserveChoices) {
        api.defaultClientSelfProperties.inputMuted = snapshot.defaults.inputMuted;
        api.defaultClientSelfProperties.outputMuted = snapshot.defaults.outputMuted;
      }
      try {
        drafts.recover();
      } catch {}
      if (!drafts.done)
        warnings.push(
          'Unsent drafts remain encrypted for recovery and will return when their original servers reconnect.'
        );
      try {
        if (!closeRestored) await restoreClosePolicy(api, snapshot);
        await restoreWorkflow(app, snapshot.workflow, !restoreSession);
        preferencesRestored = true;
      } catch {
        warnings.push('Startup preferences could not be restored; recovery will remain available');
      }
    }
    return {
      warnings: warnings.slice(0, 16),
      preferencesRestored,
      draftsRestored: drafts.done,
      recoveredDrafts: drafts.indices()
    };
  }
  const controller = {
    capture,
    prepare,
    cancel,
    restore,
    userIntent() {
      return currentFence?.userIntent() ?? true;
    },
    dispose() {
      currentFence?.dispose();
      for (const unwatch of recoveryWatches.values()) unwatch();
      recoveryWatches.clear();
      if (window.__tsixUpdateSession === controller) delete window.__tsixUpdateSession;
    }
  };
  window.__tsixUpdateSession = controller;
})();
