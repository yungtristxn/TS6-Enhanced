// Embedded in the native loader payload for the verified beta5 main renderer.
// Groups runs of join/leave/timeout lines in TeamSpeak's server and channel
// chats. Message objects and history stay untouched: only the chat's filtered
// list, which TeamSpeak itself replaces when system messages are toggled, is
// computed with each run folded into its latest event.
(() => {
  window.__tsixChat?.dispose();
  const feature = id => window.__tsixFeatures?.enabled(id) ?? true;
  const themeActive = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--tsix-chat-api').trim() === '1';
  // Connection events without a moderator or reason. Kicks, bans, moves by
  // another client and pokes stay visible individually.
  const presencePath =
    /^(?:channel\.chat\.events\.client\.(?:joined(?:\.from_channel)?|left)|server\.log\.events\.client\.(?:disconnected|timeout))$/;
  const minimumRun = 3;
  const isPresence = message =>
    !!message?.isSystem &&
    !message.isPoke &&
    typeof message.i18nPath === 'string' &&
    presencePath.test(message.i18nPath);
  const sameDay = (a, b) =>
    a?.time instanceof Date && b?.time instanceof Date && a.time.toDateString() === b.time.toDateString();
  // Pure: returns the visible list and, for each folded or expanded run, its
  // last event with the run's size. Runs never cross a day boundary.
  function fold(messages, expanded) {
    const list = [],
      runs = new Map();
    for (let i = 0; i < messages.length;) {
      if (!isPresence(messages[i])) {
        list.push(messages[i++]);
        continue;
      }
      let end = i + 1;
      while (end < messages.length && isPresence(messages[end]) && sameDay(messages[end - 1], messages[end])) end++;
      const run = messages.slice(i, end);
      if (run.length < minimumRun) list.push(...run);
      else {
        const key = String(run[0].id),
          open = expanded.has(key);
        if (open) list.push(...run);
        else list.push(run[run.length - 1]);
        runs.set(run[run.length - 1], { key, count: run.length, open });
      }
      i = end;
    }
    return { list, runs };
  }
  const chats = new Map(),
    views = new Map();
  let disposed = false,
    frame = 0;
  const schedule = () => {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed) sync();
    });
  };
  // TeamSpeak's legacy chat model: one object per server/channel/private chat.
  function supported(chat) {
    const proto = chat && Object.getPrototypeOf(chat);
    return (
      !!proto &&
      Array.isArray(chat.messages) &&
      Array.isArray(chat.filteredMessages) &&
      typeof chat._showSystemMessages === 'boolean' &&
      typeof chat.constructor?.stampGrouping === 'function' &&
      ['updateFilteredMessages', 'updateFilteredMessagesAfterPush', 'updateFilteredMessagesAfterUnshift'].every(
        name => typeof proto[name] === 'function'
      )
    );
  }
  const grouping = chat => themeActive() && feature('chatGroupEvents') && chat._showSystemMessages !== false;
  function refold(chat, state) {
    const { list, runs } = fold(chat.messages, state.expanded);
    state.runs = runs;
    const next = runs.size ? list : chat.messages;
    let previous = null;
    for (const message of next) {
      chat.constructor.stampGrouping(message, previous);
      previous = message;
    }
    chat.filteredMessages = next;
    chat._onMessagesChanged?.fire?.({});
    schedule();
  }
  // Native filtering, including TeamSpeak's own "hide system messages" option.
  function unfold(chat, state) {
    state.runs = new Map();
    Object.getPrototypeOf(chat).updateFilteredMessages.call(chat, chat._showSystemMessages);
  }
  function attach(chat) {
    if (chats.has(chat) || !supported(chat)) return;
    const proto = Object.getPrototypeOf(chat),
      state = { expanded: new Set(), runs: new Map(), active: false };
    // Own properties shadow the shared prototype for this chat only; removing
    // them restores the native methods.
    chat.updateFilteredMessages = function (show) {
      proto.updateFilteredMessages.call(this, show);
      state.active = grouping(this);
      if (state.active) refold(this, state);
    };
    chat.updateFilteredMessagesAfterPush = function () {
      if (!state.active) return proto.updateFilteredMessagesAfterPush.call(this);
      refold(this, state);
    };
    chat.updateFilteredMessagesAfterUnshift = function (count) {
      if (!state.active) return proto.updateFilteredMessagesAfterUnshift.call(this, count);
      refold(this, state);
    };
    chats.set(chat, state);
    reconcile(chat, state);
  }
  // Only transitions refold. Every refold re-renders the list, and its DOM
  // mutations schedule another sync.
  function reconcile(chat, state) {
    const active = grouping(chat);
    if (active && !state.active) {
      state.active = true;
      refold(chat, state);
    } else if (!active && state.active) {
      state.active = false;
      unfold(chat, state);
    }
  }
  function detach(chat, state) {
    for (const name of [
      'updateFilteredMessages',
      'updateFilteredMessagesAfterPush',
      'updateFilteredMessagesAfterUnshift'
    ])
      delete chat[name];
    if (state.active) unfold(chat, state);
    chats.delete(chat);
  }
  // A legacy row's Vue chain shares one root element: the event row wraps
  // TeamSpeak's system line component, which receives the message object.
  function messageOf(element) {
    for (let vm = element.__vue__; vm; vm = vm.$children?.find(child => child.$el === element)) {
      if (vm.legacyEvent) return vm.legacyEvent;
      if (vm.event && 'i18nPath' in vm.event) return vm.event;
    }
    return null;
  }
  const summary = run => `${run.count} join and leave events`;
  function decorate(container, state) {
    const seen = new Set();
    if (state?.runs.size)
      for (const row of container.querySelectorAll('.ts-chat-room-event-detailed.is-system')) {
        const run = state.runs.get(messageOf(row));
        const body = row.querySelector(':scope > .ts-chat-message-system-body');
        if (!run || !body) continue;
        let button = body.querySelector(':scope > [data-tsix-chat-run]');
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('data-tsix-chat-run', '');
          // Keep native row selection, context menus and drag from starting.
          for (const type of ['mousedown', 'pointerdown', 'contextmenu']) button.addEventListener(type, stop);
          button.addEventListener('click', toggle);
          body.append(button);
        }
        const text = run.open ? 'Fold' : `+${run.count - 1} more`;
        const label = run.open ? `Fold ${summary(run)}` : `Show ${summary(run)}`;
        if (button.textContent !== text) button.textContent = text;
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        if (button.title !== label) button.title = label;
        button.setAttribute('aria-expanded', String(run.open));
        button.dataset.tsixRunKey = run.key;
        seen.add(button);
      }
    // Virtual-list rows are recycled for other messages; remove stale buttons.
    for (const button of container.querySelectorAll('[data-tsix-chat-run]')) if (!seen.has(button)) button.remove();
  }
  function stop(event) {
    event.stopPropagation();
  }
  function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    const container = event.currentTarget.closest('.ts-chat-container'),
      chat = views.get(container?.__vue__)?.chat,
      state = chats.get(chat),
      key = event.currentTarget.dataset.tsixRunKey;
    if (!state || !key) return;
    if (state.expanded.has(key)) state.expanded.delete(key);
    else state.expanded.add(key);
    refold(chat, state);
    // The button's row may be recycled; return focus to the same run.
    requestAnimationFrame(() =>
      container.querySelector(`[data-tsix-chat-run][data-tsix-run-key="${CSS.escape(key)}"]`)?.focus()
    );
  }
  function sync() {
    if (disposed) return;
    const live = new Set();
    for (const container of document.querySelectorAll('.ts-chat-container')) {
      const vm = container.__vue__;
      if (!vm || vm._isDestroyed || !vm.isLegacy || typeof vm.$watch !== 'function') continue;
      live.add(vm);
      if (!views.has(vm)) {
        const view = { chat: null, container, observer: new MutationObserver(schedule) };
        view.observer.observe(container, { childList: true, subtree: true });
        view.unwatch = vm.$watch(() => vm.item, schedule);
        views.set(vm, view);
      }
      const view = views.get(vm);
      view.container = container;
      view.chat = vm.item;
      if (supported(vm.item)) {
        attach(vm.item);
        reconcile(vm.item, chats.get(vm.item));
      }
      decorate(container, chats.get(vm.item));
    }
    for (const [vm, view] of views)
      if (!live.has(vm)) {
        view.observer.disconnect();
        view.unwatch();
        views.delete(vm);
      }
  }
  // Chat containers mount when a server, channel or private chat opens.
  const observer = new MutationObserver(changes => {
    for (const change of changes)
      for (const node of change.addedNodes)
        if (node.nodeType === 1 && (node.matches('.ts-chat-container') || node.querySelector('.ts-chat-container'))) {
          schedule();
          return;
        }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const onStyleLoad = event => {
    if (event.target?.tagName === 'LINK') schedule();
  };
  document.addEventListener('load', onStyleLoad, true);
  window.addEventListener('tsix-features', schedule);
  window.__tsixChat = {
    version: '1.0.0',
    sync,
    fold: messages => fold(messages, new Set()),
    status: () => ({
      chats: chats.size,
      folded: [...chats.values()].reduce((sum, state) => sum + [...state.runs.values()].filter(r => !r.open).length, 0)
    }),
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('load', onStyleLoad, true);
      window.removeEventListener('tsix-features', schedule);
      for (const view of views.values()) {
        view.observer.disconnect();
        view.unwatch();
        for (const button of view.container.querySelectorAll('[data-tsix-chat-run]')) button.remove();
      }
      views.clear();
      for (const [chat, state] of chats) detach(chat, state);
      delete window.__tsixChat;
    }
  };
  sync();
  return { chats: chats.size };
})();
