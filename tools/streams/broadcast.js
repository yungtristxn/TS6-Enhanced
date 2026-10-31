// Sharing card for the user's own outbound streams.
// Read the same unfiltered outbound collection as TS6's stream manager.
// Its pure computed getter works without opening the menu or calling any
// media APIs, and remains independent of showOwnStreams / session.hidden.
function createBroadcast() {
  const root = document.querySelector('.tsv-window'),
    vm = root?.__vue__;
  if (!vm?.$watch) return { sync() {}, dispose() {} };
  const before = root.getAttribute('data-tsix-broadcast');
  let getter = null,
    methods = null,
    unwatch = null,
    host = null,
    signature = '',
    control = null,
    controlBefore = null,
    reservePane = null;
  const streamKeys = new WeakMap(),
    streamRows = new Map(),
    pending = new WeakSet();
  let nextStreamKey = 0;
  const outbound = () => (getter?.call({ data: null }) || []).filter(s => s.isInbound === false);
  const anchors = new Set();
  const positionObserver = new ResizeObserver(schedule);
  const controlParts = new Map();
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  function positionBadge() {
    const pane = host.parentElement,
      bounds = pane.getBoundingClientRect();
    const footer = pane.querySelector('.ts-server-status-bar');
    const current = new Set([root, pane, footer, host].filter(Boolean));
    for (const node of anchors)
      if (!current.has(node)) {
        positionObserver.unobserve(node);
        anchors.delete(node);
      }
    for (const node of current)
      if (!anchors.has(node)) {
        anchors.add(node);
        positionObserver.observe(node);
      }
    const visible = node => node?.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden';
    const bottom = visible(footer) ? Math.max(8, bounds.bottom - footer.getBoundingClientRect().top + 8) : 8;
    for (const [key, value] of Object.entries({
      '--tsix-broadcast-bottom': bottom,
      '--tsix-broadcast-column-width': bounds.width,
      '--tsix-broadcast-height': host.getBoundingClientRect().height
    })) {
      const pixels = `${value}px`;
      if (host.style.getPropertyValue(key) !== pixels) host.style.setProperty(key, pixels);
    }
    // The card floats over the end of the channel tree. Let the tree scroll
    // its last rows clear of it instead of hiding them underneath.
    const reserve = pane === document.fullscreenElement ? null : pane;
    if (reservePane && reservePane !== reserve) reservePane.style.removeProperty('--tsix-broadcast-reserve');
    reservePane = reserve;
    const pixels = `${Math.ceil(host.getBoundingClientRect().height) + 16}px`;
    if (reserve && reserve.style.getPropertyValue('--tsix-broadcast-reserve') !== pixels)
      reserve.style.setProperty('--tsix-broadcast-reserve', pixels);
  }
  function snapshot() {
    const sessions = outbound();
    const people = new Map();
    for (const session of sessions)
      for (const viewer of session.viewers || []) {
        const server = viewer.scHandlerId !== undefined && viewer.clientId !== undefined;
        const key = server ? `server:${viewer.scHandlerId}:${viewer.clientId}` : `chat:${viewer.otherUserId}`;
        if (people.has(key)) continue;
        // FindClient is TS6's in-memory lookup, also used by its viewer modal.
        const handler = session.client?.sc_handler;
        const client =
          server && String(handler?.id) === String(viewer.scHandlerId) ? handler.FindClient(viewer.clientId) : null;
        const name = client?.displayName || 'Viewer (name unavailable)';
        const avatar = client?.avatarImage;
        people.set(key, { key, name, avatar: avatar?.type === 'url' ? avatar.src : null });
      }
    const streams = sessions.map(session => {
      if (!streamKeys.has(session)) streamKeys.set(session, ++nextStreamKey);
      return {
        key: streamKeys.get(session),
        name: session.sourceInfo?.name || session.config?.name || 'Stream',
        paused: !!session.paused,
        busy: pending.has(session),
        open: typeof methods?.goToStream === 'function',
        settings: typeof methods?.openSettings === 'function',
        pause: typeof session.setPaused === 'function',
        stop: typeof session.leave === 'function'
      };
    });
    return {
      count: sessions.length,
      paused: sessions.length > 0 && sessions.every(s => s.paused),
      people: [...people.values()],
      streams
    };
  }
  function releaseControlPart(node, record) {
    node.removeEventListener('keydown', record.keydown);
    node.removeEventListener('keyup', record.keyup);
    node.removeEventListener('blur', record.blur);
    for (const [key, value] of Object.entries(record.before)) {
      setAttr(node, key, value);
    }
    controlParts.delete(node);
  }
  function releaseControl() {
    for (const [node, record] of controlParts) releaseControlPart(node, record);
    if (control) {
      if (controlBefore === null) control.removeAttribute('data-tsix-broadcast-control');
      else control.setAttribute('data-tsix-broadcast-control', controlBefore);
    }
    control = null;
  }
  function labelControl(node, label) {
    if (!node) return;
    if (!controlParts.has(node)) {
      const before = Object.fromEntries(
        ['role', 'tabindex', 'aria-label', 'aria-disabled', 'aria-haspopup', 'title'].map(k => [
          k,
          node.getAttribute(k)
        ])
      );
      let pressed = false;
      const activate = () => {
        if (controlDisabled(control) || controlDisabled(node)) return;
        const r = node.getBoundingClientRect();
        node.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2
          })
        );
      };
      const keydown = event => {
        if (event.target !== node || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (event.key === 'Enter') activate();
        else pressed = true;
      };
      const keyup = event => {
        if (event.target !== node || event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (pressed) activate();
        pressed = false;
      };
      const blur = () => {
        pressed = false;
      };
      node.addEventListener('keydown', keydown);
      node.addEventListener('keyup', keyup);
      node.addEventListener('blur', blur);
      controlParts.set(node, { before, keydown, keyup, blur });
    }
    const disabled = controlDisabled(control) || controlDisabled(node);
    setAttr(node, 'role', 'button');
    setAttr(node, 'tabindex', disabled ? '-1' : '0');
    setAttr(node, 'aria-disabled', disabled);
    setAttr(node, 'title', label);
    setAttr(node, 'aria-label', label);
    if (node.matches('.tsv-tool-button-context-menu-toggle')) setAttr(node, 'aria-haspopup', 'menu');
  }
  function clear() {
    positionObserver.disconnect();
    anchors.clear();
    streamRows.clear();
    host?.remove();
    host = null;
    reservePane?.style.removeProperty('--tsix-broadcast-reserve');
    reservePane = null;
    signature = '';
    releaseControl();
    if (before === null) root.removeAttribute('data-tsix-broadcast');
    else root.setAttribute('data-tsix-broadcast', before);
  }
  function setOpen(open) {
    if (!host) return;
    const list = host.querySelector('[data-tsix-viewer-list]'),
      toggle = host.querySelector('[data-tsix-viewer-toggle]');
    if (list.hidden === open) list.hidden = !open;
    if (open) setStreamsOpen(false);
    setAttr(toggle, 'aria-expanded', open);
    labelViewers();
  }
  function labelViewers() {
    const toggle = host.querySelector('[data-tsix-viewer-toggle]');
    const count = host.querySelector('[data-tsix-viewer-count]').textContent;
    setAttr(
      toggle,
      'aria-label',
      `${count}. ${toggle.getAttribute('aria-expanded') === 'true' ? 'Hide' : 'Show'} viewer list`
    );
  }
  function dismiss(event) {
    if (!host) return;
    const viewersOpen = !host.querySelector('[data-tsix-viewer-list]').hidden;
    const streamsOpen = !host.querySelector('[data-tsix-share-list]').hidden;
    if (!viewersOpen && !streamsOpen) return;
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      setStreamsOpen(false);
      host.querySelector(viewersOpen ? '[data-tsix-viewer-toggle]' : '[data-tsix-share-picker]').focus();
    } else if (event.type === 'pointerdown' && !host.contains(event.target)) {
      setOpen(false);
      setStreamsOpen(false);
    }
  }
  function setStreamsOpen(open) {
    if (!host) return;
    const panel = host.querySelector('[data-tsix-share-list]'),
      picker = host.querySelector('[data-tsix-share-picker]');
    if (panel.hidden === open) panel.hidden = !open;
    setAttr(picker, 'aria-expanded', open);
    if (open) setOpen(false);
  }
  function runAction(session, action) {
    if (disposed || pending.has(session) || !outbound().includes(session)) return;
    const actionMethod = action === 'open' ? methods?.goToStream : action === 'settings' ? methods?.openSettings : null;
    if (action === 'open' || action === 'settings') {
      if (typeof actionMethod !== 'function') return;
    } else if (action === 'pause') {
      if (typeof session.setPaused !== 'function') return;
    } else if (action !== 'stop' || typeof session.leave !== 'function') return;
    const error = host?.querySelector('[data-tsix-share-error]');
    if (error) setText(error, '');
    if (actionMethod && !host.querySelector('[data-tsix-share-list]').hidden) {
      setStreamsOpen(false);
      host.querySelector('[data-tsix-share-picker]').focus();
    }
    // These are the same actions as the native stream manager. In particular,
    // opening a stream may focus its existing popout; no media is remounted.
    pending.add(session);
    schedule();
    Promise.resolve()
      .then(() => {
        if (disposed || !outbound().includes(session)) return;
        if (actionMethod) return actionMethod.call({ data: null }, session);
        if (action === 'pause') return session.setPaused(!session.paused);
        return session.leave();
      })
      .catch(() => {
        const label = {
          open: 'open the stream',
          settings: 'open stream settings',
          pause: 'change the pause state',
          stop: 'stop the stream'
        }[action];
        if (!disposed && error?.isConnected) setText(error, `Could not ${label}. Try again.`);
      })
      .finally(() => {
        pending.delete(session);
        if (!disposed) schedule();
      });
  }
  // Decorative glyphs match the supported client's own stream controls.
  // Inline shapes keep the bar independent of whether a native player is visible.
  const iconShapes = {
    open: {
      viewBox: '0 0 22 22',
      paths: [
        {
          d: 'M7.5 17.25L4 17.25C3.0335 17.25 2.25 16.5038 2.25 15.5833L2.25 6.41667C2.25 5.49619 3.0335 4.75 4 4.75L18 4.75C18.9665 4.75 19.75 5.49619 19.75 6.41667L19.75 15.5833C19.75 16.5038 18.9665 17.25 18 17.25L14.5 17.25',
          'stroke-width': '1.75',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
          stroke: 'currentColor'
        },
        {
          d: 'M13.748 11.7476L11.0005 9L8.25293 11.7476',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
          stroke: 'currentColor'
        },
        {
          d: 'M11 17.25L11 10',
          'stroke-width': '1.75',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
          stroke: 'currentColor'
        }
      ]
    },
    pause: {
      viewBox: '0 0 16 16',
      paths: [
        {
          d: 'M5,2.7c-0.3,0-0.6,0.3-0.6,0.6v9.5c0,0.3,0.3,0.6,0.6,0.6h1.2c0.3,0,0.6-0.3,0.6-0.6V3.3c0-0.3-0.3-0.6-0.6-0.6 H5z',
          fill: 'currentColor'
        },
        {
          d: 'M9.8,2.7c-0.3,0-0.6,0.3-0.6,0.6v9.5c0,0.3,0.3,0.6,0.6,0.6H11c0.3,0,0.6-0.3,0.6-0.6V3.3 c0-0.3-0.3-0.6-0.6-0.6H9.8z',
          fill: 'currentColor'
        }
      ]
    },
    resume: {
      viewBox: '0 0 16 16',
      paths: [
        {
          d: 'M11.5,8.5c0.2-0.1,0.3-0.3,0.3-0.5c0-0.2-0.1-0.4-0.3-0.5C10.1,6.4,7,4.1,5.4,2.8C5.1,2.6,4.9,2.6,4.6,2.7 C4.4,2.9,4.3,3.1,4.3,3.4c0,2.3,0,7,0,9.3c0,0.3,0.1,0.5,0.4,0.6c0.2,0.1,0.5,0.1,0.7-0.1C7,11.9,10.1,9.6,11.5,8.5z',
          fill: 'currentColor'
        }
      ]
    },
    settings: {
      viewBox: '0 0 22 22',
      paths: [
        {
          d: 'M18.0602 9.54063L16.3878 9.25664C16.2932 8.95688 16.167 8.6729 16.025 8.38891L17.0031 7.01631C17.1451 6.81121 17.1294 6.52723 16.9558 6.35368L15.6148 5.01264C15.4412 4.83909 15.1572 4.80754 14.9521 4.96531L13.5795 5.94348C13.3113 5.80149 13.0116 5.67527 12.7118 5.58061L12.4436 3.92403C12.3963 3.67159 12.1912 3.49805 11.9387 3.49805H10.0455C9.79306 3.49805 9.58796 3.67159 9.54063 3.92403L9.25664 5.59639C8.95688 5.69105 8.6729 5.81726 8.38891 5.95926L7.01631 4.98108C6.81121 4.83909 6.52723 4.85487 6.35368 5.02841L5.01264 6.36946C4.83909 6.543 4.80754 6.82699 4.96531 7.03209L5.94348 8.40469C5.80149 8.6729 5.67527 8.97266 5.58061 9.27242L3.92403 9.54063C3.67159 9.58796 3.49805 9.79306 3.49805 10.0455V11.9387C3.49805 12.1912 3.67159 12.3963 3.92403 12.4436L5.59639 12.7276C5.69105 13.0273 5.81726 13.3113 5.95926 13.5953L4.98108 14.9679C4.83909 15.173 4.85487 15.457 5.02841 15.6305L6.36946 16.9716C6.543 17.1451 6.82699 17.1767 7.03209 17.0189L8.40469 16.0407C8.6729 16.1827 8.97266 16.309 9.27242 16.4036L9.55641 18.076C9.60374 18.3284 9.80884 18.502 10.0613 18.502H11.9545C12.2069 18.502 12.412 18.3284 12.4594 18.076L12.7276 16.3878C13.0273 16.2932 13.3113 16.167 13.5953 16.025L14.9679 17.0031C15.173 17.1451 15.457 17.1294 15.6305 16.9558L16.9716 15.6148C17.1451 15.4412 17.1767 15.1572 17.0189 14.9521L16.0407 13.5795C16.1827 13.3113 16.309 13.0116 16.4036 12.7118L18.076 12.4278C18.3284 12.3805 18.502 12.1754 18.502 11.923V10.0455C18.4862 9.79306 18.3126 9.58796 18.0602 9.54063ZM10.9921 13.69C9.4933 13.69 8.29425 12.4751 8.29425 10.9921C8.29425 9.4933 9.50908 8.29425 10.9921 8.29425C12.4751 8.29425 13.69 9.4933 13.69 10.9921C13.69 12.4909 12.4909 13.69 10.9921 13.69Z',
          fill: 'currentColor'
        }
      ]
    },
    stop: {
      viewBox: '0 0 22 22',
      paths: [
        {
          d: 'M15.2433 7.37903C16.0823 8.21822 16.6535 9.28732 16.8849 10.4512C17.1162 11.615 16.9973 12.8213 16.5431 13.9175C16.0889 15.0138 15.3199 15.9507 14.3332 16.6099C13.3466 17.2691 12.1866 17.621 11 17.621C9.8134 17.621 8.65344 17.2691 7.66678 16.6099C6.68013 15.9507 5.9111 15.0138 5.45691 13.9175C5.00273 12.8213 4.8838 11.615 5.11515 10.4512C5.3465 9.28732 5.91775 8.21822 6.75667 7.37903',
          'stroke-width': '1.75',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
          stroke: 'currentColor'
        },
        {
          d: 'M11 4.37903V10.379',
          'stroke-width': '1.75',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          fill: 'none',
          stroke: 'currentColor'
        }
      ]
    }
  };
  function shareIcon(name) {
    const shape = iconShapes[name],
      icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', shape.viewBox);
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('data-tsix-share-icon', name);
    for (const attributes of shape.paths) {
      const path = document.createElementNS(icon.namespaceURI, 'path');
      for (const [key, value] of Object.entries(attributes)) path.setAttribute(key, value);
      icon.append(path);
    }
    return icon;
  }
  function syncStreamActions(state) {
    const single = state.streams.length === 1,
      panel = host.querySelector('[data-tsix-share-list]');
    const picker = host.querySelector('[data-tsix-share-picker]');
    const focused = document.activeElement;
    const hadFocus = focused === picker || [...streamRows.values()].some(row => row.element.contains(focused));
    if (picker.hidden === !single) picker.hidden = single;
    setText(picker, `Manage ${state.count} streams`);
    if (single) setStreamsOpen(false);
    const live = new Set();
    for (const session of outbound()) {
      const key = streamKeys.get(session),
        info = state.streams.find(stream => stream.key === key);
      if (!info) continue;
      live.add(session);
      let row = streamRows.get(session);
      if (!row) {
        const element = document.createElement('div');
        element.setAttribute('data-tsix-share-stream', '');
        const actions = document.createElement('div');
        actions.setAttribute('data-tsix-share-actions', '');
        row = { element, buttons: {}, labels: {} };
        for (const [action, text] of [
          ['open', 'Open stream'],
          ['pause', 'Pause'],
          ['settings', 'Settings'],
          ['stop', 'Stop']
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          const label = document.createElement('span');
          label.setAttribute('data-tsix-share-label', '');
          label.textContent = text;
          button.append(shareIcon(action));
          if (action === 'pause') button.append(shareIcon('resume'));
          button.append(label);
          row.labels[action] = label;
          button.setAttribute('data-tsix-share-action', action);
          button.addEventListener('click', () => runAction(session, action));
          row.buttons[action] = button;
          (action === 'open' ? element : actions).append(button);
        }
        element.append(actions);
        streamRows.set(session, row);
      }
      const parent = single ? host : panel;
      if (row.element.parentElement !== parent) parent.append(row.element);
      row.element.toggleAttribute('data-paused', info.paused);
      setAttr(row.element, 'aria-busy', info.busy);
      for (const [action, button] of Object.entries(row.buttons)) {
        const label =
          action === 'open'
            ? info.name
            : action === 'pause'
              ? info.paused
                ? 'Resume'
                : 'Pause'
              : action === 'stop'
                ? 'Stop'
                : 'Settings';
        setText(row.labels[action], label);
        setAttr(button, 'aria-label', `${action === 'open' ? 'Open stream' : label}: ${info.name}`);
        setAttr(button, 'title', `${action === 'open' ? 'Open stream' : label}: ${info.name}`);
        const disabled = info.busy || !info[action];
        if (button.disabled !== disabled) button.disabled = disabled;
      }
    }
    for (const [session, row] of streamRows)
      if (!live.has(session)) {
        row.element.remove();
        streamRows.delete(session);
      }
    if (hadFocus) {
      const target =
        focused.isConnected && focused.getClientRects().length
          ? focused
          : single
            ? host.querySelector('[data-tsix-share-action="open"]')
            : picker;
      if (target !== document.activeElement) target?.focus();
    }
  }
  function avatar(person) {
    const icon = document.createElement('span');
    icon.setAttribute('data-tsix-viewer-icon', '');
    icon.title = person.name;
    icon.setAttribute('aria-hidden', 'true');
    const parts = person.name.trim().split(/\s+/);
    icon.textContent =
      person.name === 'Viewer (name unavailable)'
        ? '?'
        : [...parts[0]].slice(0, 1).join('') + (parts.length > 1 ? [...parts.at(-1)].slice(0, 1).join('') : '');
    if (typeof person.avatar === 'string' && /^(tsic:|blob:|data:image\/|https?:)/i.test(person.avatar)) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = person.avatar;
      img.addEventListener('error', () => img.remove(), { once: true });
      icon.append(img);
    }
    return icon;
  }
  function mount() {
    host = document.createElement('section');
    host.setAttribute('data-tsix-broadcast-bar', '');
    host.setAttribute('data-tsix-sharing-controls', '');
    host.setAttribute('aria-label', 'Your screen sharing');
    const state = document.createElement('span');
    state.setAttribute('data-tsix-broadcast-state', '');
    state.setAttribute('role', 'status');
    state.setAttribute('aria-live', 'polite');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.setAttribute('data-tsix-viewer-toggle', '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'tsix-broadcast-viewers');
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    const count = document.createElement('span');
    count.setAttribute('data-tsix-viewer-count', '');
    const icons = document.createElement('span');
    icons.setAttribute('data-tsix-viewer-icons', '');
    toggle.append(count, icons);
    const list = document.createElement('div');
    list.id = 'tsix-broadcast-viewers';
    list.hidden = true;
    list.setAttribute('data-tsix-viewer-list', '');
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', 'People watching your streams');
    const line = document.createElement('div');
    line.setAttribute('data-tsix-share-status', '');
    line.append(state, toggle);
    const picker = document.createElement('button');
    picker.type = 'button';
    picker.setAttribute('data-tsix-share-picker', '');
    picker.setAttribute('aria-expanded', 'false');
    picker.setAttribute('aria-controls', 'tsix-share-streams');
    picker.addEventListener('click', () => {
      const open = picker.getAttribute('aria-expanded') !== 'true';
      setStreamsOpen(open);
      if (open) host.querySelector('[data-tsix-share-list] button:not(:disabled)')?.focus();
    });
    const streams = document.createElement('div');
    streams.id = 'tsix-share-streams';
    streams.hidden = true;
    streams.setAttribute('data-tsix-share-list', '');
    streams.setAttribute('role', 'region');
    streams.setAttribute('aria-label', 'Your running streams');
    const error = document.createElement('div');
    error.setAttribute('data-tsix-share-error', '');
    error.setAttribute('role', 'status');
    host.append(line, picker, list, streams, error);
    root.append(host);
  }
  document.addEventListener('keydown', dismiss, true);
  document.addEventListener('pointerdown', dismiss, true);
  return {
    sync(enabled) {
      const active =
        enabled && getComputedStyle(document.documentElement).getPropertyValue('--tsix-broadcast-api').trim() === '1';
      if (!active) {
        unwatch?.();
        unwatch = null;
        clear();
        return;
      }
      const toolbar = root.querySelector('.tsv-central-toolbar')?.__vue__;
      const component = toolbar?.screenshareButton?.contextMenuData?.component;
      const options = component?.options || component;
      methods = options?.methods;
      const computed = options?.computed?.allSessions;
      const next = typeof computed === 'function' ? computed : computed?.get;
      if (next !== getter) {
        unwatch?.();
        unwatch = null;
        getter = next;
      }
      if (!getter) {
        clear();
        return;
      }
      if (!unwatch) unwatch = vm.$watch(() => JSON.stringify(snapshot()), schedule);
      const state = snapshot();
      if (!state.count) {
        clear();
        return;
      }
      if (!host) mount();
      const mode = state.paused ? 'paused' : 'live';
      if (root.getAttribute('data-tsix-broadcast') !== mode) root.setAttribute('data-tsix-broadcast', mode);
      setAttr(host, 'data-state', mode);
      // Only our own badge moves into fullscreen; native players stay put.
      const fullscreen = document.fullscreenElement;
      const parent =
        fullscreen && !['VIDEO', 'IFRAME', 'CANVAS'].includes(fullscreen.tagName)
          ? fullscreen
          : root.querySelector('.main-pane-layout') || root;
      if (host.parentElement !== parent) parent.append(host);
      host.toggleAttribute('data-fullscreen', parent === fullscreen);
      const native = [...root.querySelectorAll('.tsv-central-toolbar .tsv-tool-button')].find(
        e => e.__vue__?.button === toolbar?.screenshareButton
      );
      if (native !== control) {
        releaseControl();
        if (native) {
          control = native;
          controlBefore = native.getAttribute('data-tsix-broadcast-control');
          native.setAttribute('data-tsix-broadcast-control', '');
        }
      }
      const menu = control?.querySelector('.tsv-tool-button-context-menu-toggle');
      for (const [node, record] of controlParts)
        if (node !== control && node !== menu) releaseControlPart(node, record);
      labelControl(control, state.paused ? 'Resume screen sharing' : 'Pause screen sharing');
      labelControl(menu, 'Stream controls');
      host.toggleAttribute('data-native-control', !!control);
      setText(
        host.querySelector('[data-tsix-broadcast-state]'),
        state.paused ? 'Paused' : state.count === 1 ? 'Live' : `Live · ${state.count}`
      );
      setAttr(
        host.querySelector('[data-tsix-broadcast-state]'),
        'title',
        state.paused
          ? 'Sharing is paused. Your stream is still open.'
          : `You are sharing ${state.count === 1 ? 'your screen' : `${state.count} streams`}, even when the preview is hidden.`
      );
      syncStreamActions(state);
      const nextSignature = JSON.stringify(state.people);
      if (nextSignature !== signature) {
        signature = nextSignature;
        const toggle = host.querySelector('[data-tsix-viewer-toggle]'),
          icons = host.querySelector('[data-tsix-viewer-icons]'),
          list = host.querySelector('[data-tsix-viewer-list]');
        setText(host.querySelector('[data-tsix-viewer-count]'), `${state.people.length} watching`);
        labelViewers();
        toggle.title = state.people.length ? state.people.map(p => p.name).join('\n') : 'Nobody is watching yet';
        icons.replaceChildren(...state.people.slice(0, 3).map(avatar));
        if (state.people.length > 3) {
          const more = document.createElement('span');
          more.setAttribute('data-tsix-viewer-icon', '');
          more.textContent = `+${state.people.length - 3}`;
          icons.append(more);
        }
        const title = document.createElement('strong');
        title.textContent = 'Watching your stream';
        const ul = document.createElement('ul');
        for (const person of state.people) {
          const li = document.createElement('li'),
            name = document.createElement('span');
          name.textContent = person.name;
          name.title = person.name;
          li.append(avatar(person), name);
          ul.append(li);
        }
        if (!state.people.length) {
          const li = document.createElement('li');
          li.textContent = 'Nobody is watching yet';
          ul.append(li);
        }
        list.replaceChildren(title, ul);
      }
      positionBadge();
    },
    dispose() {
      unwatch?.();
      clear();
      document.removeEventListener('keydown', dismiss, true);
      document.removeEventListener('pointerdown', dismiss, true);
    }
  };
}
