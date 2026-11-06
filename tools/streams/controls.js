// Action dock, focus gestures, chat layout and keyboard semantics for native stream controls.
// Keep Vue's native action nodes in place. Owned buttons in the bottom strip
// forward to those handlers using the visible button's coordinates (menus
// otherwise open at 0,0). Never move a Vue-owned node between components.
function syncActionDock(record, enabled) {
  const { element } = record;
  const row =
    element.querySelector('[data-tsix-stream-row]') || element.querySelector('.screen-grid-wrapper')?.parentElement;
  const sources = row
    ? [
        ...row.querySelectorAll(
          ':scope > .screenshare__global-hover-actions-wrapper:last-child > .screenshare__global-hover-actions'
        )
      ]
    : [];
  if (
    !enabled ||
    !record.vm.showStreams ||
    record.vm.isGridOpenedInPopup ||
    document.fullscreenElement ||
    record.vm.presented ||
    record.vm.item?.layoutMode?.kind === 'fullscreen' ||
    !sources.length
  ) {
    clearActionDock(record);
    return;
  }
  const players = [
    ...row.querySelectorAll('.screen-grid > :is(.screen-video-wrapper,.screen-tile-wrapper) > .video-stream')
  ];
  const emptyContainer = !players.length && row.querySelector(':scope > .screen-grid-wrapper.is-empty');
  const empty = !!emptyContainer;
  const focused = players.find(p => p.closest('[data-tsix-tray-tile="focused"]'));
  const player = players.length === 1 ? players[0] : focused;
  const nativeBar = player?.querySelector('.screen-overlay__bottom');
  let dock = record.actionDock;
  if (!dock) {
    const group = document.createElement('div');
    group.setAttribute('data-tsix-view-actions', '');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Stream view controls');
    for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown'])
      group.addEventListener(type, e => e.stopPropagation());
    for (const type of ['keydown', 'keyup'])
      group.addEventListener(type, e => {
        if (['Enter', ' '].includes(e.key)) e.stopPropagation();
      });
    dock = record.actionDock = { group, footer: null, buttons: new Map(), sources: new Map() };
  }
  // An all-hidden viewer has no video footer to dock into. Keep its restore
  // menu beside the native empty message, without an orphaned player bar.
  if (dock.emptyRow && (!empty || dock.emptyRow !== row)) clearEmptyDock(dock);
  if (empty && dock.emptyRow !== row) {
    dock.emptyRow = row;
    dock.emptyRowBefore = row.getAttribute('data-tsix-empty-stream-row');
    setAttr(row, 'data-tsix-empty-stream-row', '');
  }
  let host = emptyContainer || nativeBar;
  if (!host) {
    const parent = player || row.parentElement;
    if (!dock.footer) {
      dock.footer = document.createElement('div');
      dock.footer.setAttribute('data-tsix-stream-footer', '');
    }
    setAttr(dock.footer, 'data-tsix-footer-grid', player ? null : '');
    if (dock.footer.parentElement !== parent) parent.append(dock.footer);
    host = dock.footer;
  }
  if (dock.group.parentElement !== host) host.append(dock.group);
  if (nativeBar || empty) {
    dock.footer?.remove();
    dock.footer = null;
  }
  const seen = new Set();
  // The native player already supplies pop-out. Only offer the viewer-level
  // equivalent when no visible player's own pop-out exists.
  const hasPlayerPopout = players.some(
    p => !p.closest('[inert]') && p.querySelector('.screen-overlay__bottom .tsv-button svg[name="expand"]')
  );
  for (const source of sources) {
    if (!dock.sources.has(source)) dock.sources.set(source, source.getAttribute('data-tsix-source-actions'));
    setAttr(source, 'data-tsix-source-actions', '');
    const native = source.querySelector('.tsv-button'),
      icon = native?.querySelector('svg[name]'),
      name = icon?.getAttribute('name');
    if (!native || !['dots', 'expand'].includes(name) || (name === 'expand' && (empty || hasPlayerPopout))) continue;
    seen.add(source);
    let entry = dock.buttons.get(source);
    if (!entry || entry.native !== native) {
      entry?.button.remove();
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-tsix-view-action', name);
      button.setAttribute('aria-label', labels[name]);
      button.title = labels[name];
      button.append(cloneIcon(icon));
      if (name === 'dots') button.setAttribute('aria-haspopup', 'menu');
      button.addEventListener('click', e => {
        e.stopPropagation();
        if (button.disabled || controlDisabled(native) || !native.isConnected) return;
        const b = button.getBoundingClientRect();
        // The native menu opens at the given point: below a labelled button,
        // so the menu never covers it; at the centre of an icon button.
        const below = button.hasAttribute('data-tsix-labelled');
        const point = {
          target: button,
          currentTarget: button,
          clientX: below ? b.left : b.x + b.width / 2,
          clientY: below ? b.bottom + 4 : b.y + b.height / 2
        };
        // The native overlay manager also owns its event.target. Dispatching
        // on the hidden source immediately dismisses its menu. Keep the
        // visible button as that owner, including keyboard activation.
        if (typeof native.__vue__?.clicked === 'function') native.__vue__.clicked(point);
        else native.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...point }));
      });
      dock.buttons.set(source, (entry = { native, button }));
      dock.group.append(button);
    }
    const disabled = controlDisabled(native);
    if (entry.button.disabled !== disabled) entry.button.disabled = disabled;
  }
  for (const [source, entry] of dock.buttons)
    if (!seen.has(source)) {
      entry.button.remove();
      dock.buttons.delete(source);
    }
  syncEmptyNotice(dock, empty);
  for (const [source, before] of dock.sources)
    if (!sources.includes(source)) {
      setAttr(source, 'data-tsix-source-actions', before);
      dock.sources.delete(source);
    }
}
// All streams hidden: a short notice and a labelled menu button replace the
// native sentence that points at a menu at the far edge of the pane.
const emptyText = 'All streams are hidden',
  emptyAction = 'Show streams';
function syncEmptyNotice(dock, empty) {
  const menu = [...dock.buttons.values()].find(entry => entry.button.getAttribute('data-tsix-view-action') === 'dots');
  if (empty && menu) {
    if (!dock.notice) {
      dock.notice = document.createElement('span');
      dock.notice.setAttribute('data-tsix-empty-label', '');
      dock.notice.textContent = emptyText;
    }
    if (dock.group.firstChild !== dock.notice) dock.group.prepend(dock.notice);
    const button = menu.button;
    if (!button.querySelector(':scope > [data-tsix-view-action-text]')) {
      const text = document.createElement('span');
      text.setAttribute('data-tsix-view-action-text', '');
      text.textContent = emptyAction;
      button.append(text);
    }
    setAttr(button, 'data-tsix-labelled', '');
    setAttr(button, 'aria-label', 'Show hidden streams');
    setAttr(button, 'title', 'Show hidden streams');
    dock.labelled = button;
    return;
  }
  dock.notice?.remove();
  dock.notice = null;
  if (dock.labelled) {
    dock.labelled.querySelector(':scope > [data-tsix-view-action-text]')?.remove();
    dock.labelled.removeAttribute('data-tsix-labelled');
    setAttr(dock.labelled, 'aria-label', labels.dots);
    setAttr(dock.labelled, 'title', labels.dots);
    dock.labelled = null;
  }
}
function clearEmptyDock(dock) {
  if (!dock.emptyRow) return;
  setAttr(dock.emptyRow, 'data-tsix-empty-stream-row', dock.emptyRowBefore);
  dock.emptyRow = null;
}
function clearActionDock(record) {
  const dock = record.actionDock;
  if (!dock) return;
  clearEmptyDock(dock);
  for (const [source, before] of dock.sources) setAttr(source, 'data-tsix-source-actions', before);
  dock.group.remove();
  dock.footer?.remove();
  record.actionDock = null;
}
function syncPreviewJoins(enabled) {
  const seen = new Set();
  if (enabled)
    for (const element of records.keys())
      for (const preview of element.querySelectorAll('.video-stream > .stream-preview.is-joinable')) {
        const vm = preview.parentElement.__vue__,
          host = preview.querySelector('.stream-preview__user-card') || preview;
        if (!vm?.session?.isInbound || !vm.session.isJoinable || typeof vm.onJoin !== 'function') continue;
        if (joins.has(preview) && joins.get(preview).vm !== vm) {
          joins.get(preview).button.remove();
          joins.get(preview).label.remove();
          joins.delete(preview);
        }
        seen.add(preview);
        if (!joins.has(preview)) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Watch stream';
          button.setAttribute('data-tsix-preview-join', '');
          button.addEventListener('click', event => {
            event.stopPropagation();
            if (vm.session.isJoinable) vm.onJoin();
          });
          for (const type of ['mousedown', 'pointerdown', 'keydown', 'keyup'])
            button.addEventListener(type, event => event.stopPropagation());
          // Name the streamer and stream above the action; the native name
          // overlay is hidden while the stream is only joinable.
          const label = document.createElement('div');
          label.setAttribute('data-tsix-preview-label', '');
          const name = document.createElement('span'),
            title = document.createElement('span');
          name.setAttribute('data-tsix-preview-name', '');
          title.setAttribute('data-tsix-preview-title', '');
          label.append(name, title);
          joins.set(preview, { vm, button, label, name, title });
        }
        const join = joins.get(preview);
        const session = vm.session,
          streamer = session.client?.displayName ?? session.matrixChatMember?.displayName ?? '',
          stream = typeof session.config?.name === 'string' ? session.config.name.trim() : '';
        if (join.name.textContent !== streamer) join.name.textContent = streamer;
        if (join.title.textContent !== stream) join.title.textContent = stream;
        // Write only on change: attribute churn would keep the observer busy.
        const show = { name: !!streamer, title: !!stream && stream !== streamer };
        setAttr(join.name, 'hidden', show.name ? null : '');
        setAttr(join.title, 'hidden', show.title ? null : '');
        setAttr(join.label, 'hidden', show.name || show.title ? null : '');
        if (join.label.parentElement !== host || join.label.nextSibling !== join.button) host.append(join.label);
        if (join.button.parentElement !== host || join.button.previousSibling !== join.label) host.append(join.button);
      }
  for (const [preview, record] of joins)
    if (!seen.has(preview)) {
      record.button.remove();
      record.label.remove();
      joins.delete(preview);
    }
}
const streamControl = target =>
  target?.closest?.(
    'button,input,a,select,textarea,[role="button"],[role="slider"],.tsv-button,.ts-slider,.screen-overlay__bottom'
  );
function syncFocusActions(record, enabled, state) {
  const seen = new Set();
  if (enabled)
    for (const tile of state.tiles) {
      const node = tile.node?.querySelector('.video-stream'),
        vm = node?.__vue__;
      if (
        !tile.active ||
        !vm ||
        typeof vm.enterFocusModeAfterDelay !== 'function' ||
        typeof vm.toggleFullscreen !== 'function' ||
        (state.tiles.length < 2 && !tile.focused)
      )
        continue;
      seen.add(node);
      if (!record.focusActions.has(node)) {
        const before = Object.fromEntries(
          ['role', 'tabindex', 'aria-label', 'aria-keyshortcuts'].map(k => [k, node.getAttribute(k)])
        );
        const originalFocus = vm.enterFocusModeAfterDelay,
          originalFullscreen = vm.toggleFullscreen;
        let origin = null,
          moved = false,
          armed = false;
        const down = e => {
          origin = [e.clientX, e.clientY];
          moved = false;
        };
        const up = e => {
          if (origin) moved = Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 5;
          origin = null;
        };
        const focus = e => {
          if (!themeActive() || document.fullscreenElement) return originalFocus.call(vm, e);
          if (
            node.closest('[inert]') ||
            streamControl(e?.target) ||
            e?.detail > 1 ||
            moved ||
            record.vm.inDragTile ||
            record.vm.inDragStream
          )
            return;
          // A native delayed focus (from a tile this helper does not wrap) must
          // not land after this choice and focus a different stream.
          cancelDelayedFocus(record);
          // An immediate focus change can put a different tile under the second
          // click of a double-click. Remember this click so that one is ignored.
          record.focusClick =
            e?.isTrusted && e.type === 'click' && e.detail === 1
              ? { time: performance.now(), x: e.clientX, y: e.clientY }
              : null;
          const leaving = !!layoutState(record.vm)?.tiles.find(t => t.node?.contains(node))?.focused;
          // Same as native and the keyboard: a preview gains focus, and the
          // focused stream returns to the grid.
          vm.$emit('enter-focus-mode', vm.session);
          // Returning to the grid is the user's choice. Until they click or
          // press a key again, a focus that arrives on its own is undone.
          record.gridIntent = leaving ? { at: performance.now() } : null;
          // Commit destination geometry in the click turn, before Vue paints
          // the native layout, rather than correcting it a frame afterward.
          update(record, true);
        };
        const fullscreen = e => {
          // The player's own fullscreen/exit buttons and menu item call this
          // with their click event. Clicking around the stage must never enter
          // fullscreen, so a double-click on the player only acts as one click.
          if (e?.type === 'dblclick' && themeActive() && !document.fullscreenElement) return;
          return originalFullscreen.call(vm, e);
        };
        const keydown = e => {
          if (e.target !== node || !['Enter', ' '].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) return;
          if (e.key === 'Enter') {
            moved = false;
            focus(e);
          } else armed = true;
        };
        const keyup = e => {
          if (e.target === node && e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            if (armed) {
              moved = false;
              focus(e);
            }
            armed = false;
          }
        };
        const blur = () => {
          armed = false;
        };
        vm.enterFocusModeAfterDelay = focus;
        vm.toggleFullscreen = fullscreen;
        node.addEventListener('pointerdown', down, true);
        node.addEventListener('pointerup', up, true);
        node.addEventListener('keydown', keydown);
        node.addEventListener('keyup', keyup);
        node.addEventListener('blur', blur);
        record.focusActions.set(node, {
          vm,
          before,
          originalFocus,
          originalFullscreen,
          focus,
          fullscreen,
          down,
          up,
          keydown,
          keyup,
          blur
        });
      }
      setAttr(node, 'role', 'group');
      setAttr(node, 'tabindex', '0');
      setAttr(node, 'aria-label', tile.focused ? 'Focused stream. Enter to return to grid' : 'Stream. Enter to focus');
      setAttr(node, 'aria-keyshortcuts', 'Enter Space');
    }
  for (const [node, r] of record.focusActions) if (!seen.has(node)) releaseFocus(record, node, r);
}
function releaseFocus(record, node, r) {
  if (r.vm.enterFocusModeAfterDelay === r.focus) r.vm.enterFocusModeAfterDelay = r.originalFocus;
  if (r.vm.toggleFullscreen === r.fullscreen) r.vm.toggleFullscreen = r.originalFullscreen;
  for (const [type, fn, capture] of [
    ['pointerdown', r.down, true],
    ['pointerup', r.up, true],
    ['keydown', r.keydown],
    ['keyup', r.keyup],
    ['blur', r.blur]
  ])
    node.removeEventListener(type, fn, capture);
  for (const [key, value] of Object.entries(r.before)) setAttr(node, key, value);
  record.focusActions.delete(node);
}
function cancelDelayedFocus(record) {
  for (const node of record.element.querySelectorAll('.video-stream')) {
    const vm = node.__vue__;
    if (vm?._dblClickTimeout) {
      clearTimeout(vm._dblClickTimeout);
      vm._dblClickTimeout = null;
    }
  }
}
// Called from update(): keep the grid the user returned to. A later click or
// key press (not the second click of a double-click) ends the guard, so every
// deliberate focus change still applies.
const gridIntentWindow = 700;
function holdGridIntent(record) {
  const intent = record.gridIntent,
    vm = record.vm;
  if (!intent) return;
  if (performance.now() - intent.at > gridIntentWindow || (record.inputAt ?? 0) > intent.at) {
    record.gridIntent = null;
    return;
  }
  if (vm.item?.layoutMode?.kind !== 'focus') return;
  cancelDelayedFocus(record);
  vm.item.layoutMode = { kind: 'auto' };
}
function installFocusGestures(record) {
  // A new deliberate input ends the return-to-grid guard.
  record.captureInput = e => {
    if (e.isTrusted && (e.type === 'keydown' || e.detail <= 1)) record.inputAt = performance.now();
  };
  document.addEventListener('mousedown', record.captureInput, true);
  document.addEventListener('keydown', record.captureInput, true);
  const nearby = (saved, e) =>
    saved && performance.now() - saved.time < 400 && Math.hypot(e.clientX - saved.x, e.clientY - saved.y) <= 5;
  record.captureClick = e => {
    const first = record.focusClick;
    record.focusClick = null;
    // Two separate single clicks are not a double-click, however close.
    if (e.detail < 2 || !nearby(first, e) || !stageSurface(e)) return;
    // The second click of a double-click keeps the first click's layout.
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  // Native players enter fullscreen on double-click, including previews this
  // helper does not wrap. In the stage that only happens from the button.
  record.captureDouble = e => {
    if (!stageSurface(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const stageSurface = e =>
    e.isTrusted &&
    record.element.contains(e.target) &&
    themeActive() &&
    !document.fullscreenElement &&
    !record.vm.inDragTile &&
    !record.vm.inDragStream &&
    !!e.target.closest('.video-stream,.screen-grid-wrapper') &&
    !streamControl(e.target);
  document.addEventListener('click', record.captureClick, true);
  document.addEventListener('dblclick', record.captureDouble, true);
}
function restoreLayoutNodes(record) {
  for (const [node, attrs] of record.layoutNodes)
    for (const [key, value] of attrs) {
      if (value === null) node.removeAttribute(key);
      else node.setAttribute(key, value);
    }
  record.layoutNodes.clear();
  if (record.chatMinBefore) record.element.style.setProperty('--tsix-chat-min-height', record.chatMinBefore);
  else record.element.style.removeProperty('--tsix-chat-min-height');
}
// beta5's virtual list writes row geometry from both ResizeObservers. A
// fullscreen portal resize can therefore resize a shallower observed row
// during delivery. Keep its native validation/scroll anchoring, but perform
// the transactions once per frame, outside observer delivery.
function deferChatLayout(controller) {
  const originalMeasure = controller.measure,
    originalRefresh = controller.refreshLayout;
  const descriptors = Object.fromEntries(
    ['measure', 'refreshLayout'].map(k => [k, Object.getOwnPropertyDescriptor(controller, k)])
  );
  let frame = 0,
    rows = new Map(),
    layout = false,
    dead = false;
  const flush = () => {
    frame = 0;
    const pending = [...rows.values()],
      refresh = layout;
    rows.clear();
    layout = false;
    if (dead || controller.disposed || !controller.rootElement?.isConnected) return;
    if (refresh) originalRefresh.call(controller);
    if (pending.length) originalMeasure.call(controller, pending);
  };
  const queue = () => {
    if (!dead && !frame) frame = requestAnimationFrame(flush);
  };
  const measure = entries => {
    if (dead || controller.disposed) return;
    for (const entry of entries) {
      // A late callback from a recycled row must not replace an already
      // queued current measurement. Native measure validates again at flush.
      if (rows.has(entry.key)) {
        const geometry = controller.engine.geometry,
          index = geometry.indexOf(entry.key);
        if (index < 0 || geometry.versionAt(index) !== entry.version || geometry.epoch !== entry.epoch) continue;
      }
      rows.set(entry.key, entry);
    }
    queue();
  };
  const refreshLayout = () => {
    if (dead || controller.disposed) return;
    controller.layoutDirty = true;
    layout = true;
    queue();
  };
  controller.measure = measure;
  controller.refreshLayout = refreshLayout;
  return {
    controller,
    dispose() {
      if (dead) return;
      if (frame) cancelAnimationFrame(frame);
      flush();
      dead = true;
      for (const [key, owned] of [
        ['measure', measure],
        ['refreshLayout', refreshLayout]
      ])
        if (controller[key] === owned) {
          if (descriptors[key]) Object.defineProperty(controller, key, descriptors[key]);
          else delete controller[key];
        }
    }
  };
}
function syncChatVisibility(record, chat, hidden) {
  const previous = record.hiddenChat;
  if (previous && (previous.node !== chat || !hidden)) {
    for (const [key, value] of Object.entries(previous.attributes)) setAttr(previous.node, key, value);
    if (previous.height)
      previous.node.style.setProperty('--tsix-hidden-chat-height', previous.height, previous.priority);
    else previous.node.style.removeProperty('--tsix-hidden-chat-height');
    record.hiddenChat = null;
  }
  if (!hidden || !chat || record.hiddenChat) return;
  const height = chat.getBoundingClientRect().height;
  record.hiddenChat = {
    node: chat,
    attributes: Object.fromEntries(['inert', 'aria-hidden'].map(key => [key, chat.getAttribute(key)])),
    height: chat.style.getPropertyValue('--tsix-hidden-chat-height'),
    priority: chat.style.getPropertyPriority('--tsix-hidden-chat-height')
  };
  // A measurable viewport lets the native virtual list keep rendering new
  // rows and following the bottom while the panel is visually hidden.
  if (height > 0) chat.style.setProperty('--tsix-hidden-chat-height', `${height}px`);
  setAttr(chat, 'inert', '');
  setAttr(chat, 'aria-hidden', 'true');
}
function syncChatLayout(record, enabled) {
  const chat = record.element.querySelector('.ts-chat-container')?.__vue__;
  const controller = enabled ? chat?.getVirtualList?.()?.getController?.() : null;
  if (record.chatLayout?.controller === controller) return;
  record.chatLayout?.dispose();
  record.chatLayout = null;
  if (
    controller &&
    !controller.disposed &&
    typeof controller.measure === 'function' &&
    typeof controller.refreshLayout === 'function' &&
    controller.engine?.geometry
  )
    record.chatLayout = deferChatLayout(controller);
}
function release(record) {
  record.unwatch();
  clearChatRail(record);
  clearActionDock(record);
  record.chatLayout?.dispose();
  syncChatVisibility(record, null, false);
  document.removeEventListener('click', record.captureClick, true);
  document.removeEventListener('dblclick', record.captureDouble, true);
  document.removeEventListener('mousedown', record.captureInput, true);
  document.removeEventListener('keydown', record.captureInput, true);
  record.gridIntent = null;
  releaseEvenGrid(record);
  for (const [node, r] of record.focusActions) releaseFocus(record, node, r);
  restoreLayoutNodes(record);
  clearTray(record);
  clearStageChrome(record);
  record.chatToolbar?.remove();
  record.element.removeAttribute('data-tsix-chat');
  // Restore only our transient layout inputs, never media/session state.
  if (record.savedSplit !== null && !record.vm._isDestroyed) {
    record.vm.overrideSplitPercentage = record.savedSplit;
    record.vm.maximumVideoHeight =
      record.vm.maximumHeight * (record.savedSplit === -1 ? record.vm.maxVideoAreaHeightPct : record.savedSplit);
    if (!document.fullscreenElement) record.vm.doUpdateGrid();
  }
  if (record.beforeMarker === null) record.element.removeAttribute(marker);
  else record.element.setAttribute(marker, record.beforeMarker);
  setAttr(record.element, layoutMarker, record.beforeLayoutMarker);
  records.delete(record.element);
}
function releaseButton(node, record) {
  node.removeEventListener('keydown', record.keydown);
  node.removeEventListener('keyup', record.keyup);
  node.removeEventListener('blur', record.blur);
  for (const [key, value] of Object.entries(record.before)) {
    if (value === null) node.removeAttribute(key);
    else node.setAttribute(key, value);
  }
  buttons.delete(node);
}
function syncButtons(enabled) {
  const seen = new Set();
  if (enabled)
    for (const element of new Set([...records.keys(), ...document.querySelectorAll('.tsv-screenshare-portal-ctx')])) {
      for (const node of element.querySelectorAll(
        ':is(.screen-video-wrapper, .screen-tile-wrapper) .tsv-button, .screenshare__global-hover-actions-wrapper .tsv-button'
      )) {
        const icon = node.querySelector('svg[name]')?.getAttribute('name');
        const label =
          icon === 'stream-shutdown'
            ? node.closest('.video-stream')?.__vue__?.session?.isInbound
              ? 'Leave stream'
              : 'Stop sharing'
            : labels[icon];
        if (!label || node.tagName === 'BUTTON') continue;
        seen.add(node);
        if (!buttons.has(node)) {
          const before = Object.fromEntries(attrs.map(key => [key, node.getAttribute(key)]));
          const activate = () => {
            if (controlDisabled(node) || node.getAttribute('aria-disabled') === 'true') return;
            // Native menus use the click coordinates. HTMLElement.click() uses
            // (0,0), sending keyboard-opened menus to the opposite window corner.
            const rect = node.getBoundingClientRect();
            node.dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2
              })
            );
          };
          let pressed = false;
          const keydown = event => {
            if (event.target !== node || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (event.key === 'Enter') activate();
            else pressed = true;
          };
          const keyup = event => {
            if (event.target === node && event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              if (pressed) activate();
              pressed = false;
            }
          };
          const blur = () => {
            pressed = false;
          };
          node.addEventListener('keydown', keydown);
          node.addEventListener('keyup', keyup);
          node.addEventListener('blur', blur);
          buttons.set(node, { before, keydown, keyup, blur });
        }
        const disabled = controlDisabled(node);
        setAttr(node, 'role', 'button');
        setAttr(node, 'tabindex', disabled ? '-1' : '0');
        setAttr(node, 'aria-label', label);
        setAttr(node, 'title', label);
        setAttr(node, 'aria-disabled', disabled);
      }
    }
  for (const [node, record] of buttons) if (!seen.has(node)) releaseButton(node, record);
}
function sync() {
  if (disposed) return;
  const enabled = themeActive();
  broadcast.sync(enabled);
  const live = new Set(document.querySelectorAll('.tsv-screenshare'));
  for (const element of live) {
    const vm = element.__vue__;
    if (
      !vm ||
      vm._isDestroyed ||
      vm.isPopout ||
      typeof vm.doUpdateGrid !== 'function' ||
      typeof vm.overrideSplitPercentage !== 'number' ||
      !vm.$refs.fullArea ||
      !layoutState(vm)
    )
      continue;
    if (!records.has(element)) {
      const record = {
        element,
        vm,
        savedSplit: null,
        beforeMarker: element.getAttribute(marker),
        beforeLayoutMarker: element.getAttribute(layoutMarker),
        tiles: new Map(),
        toggle: null,
        layoutNodes: new Map(),
        focusActions: new Map(),
        chatMinBefore: element.style.getPropertyValue('--tsix-chat-min-height')
      };
      installFocusGestures(record);
      record.unwatch = vm.$watch(() => {
        const s = layoutState(vm);
        return [
          s?.sessions.length,
          s?.viewers.length,
          s?.drag,
          vm.maximumWidth,
          vm.maximumHeight,
          vm.isGridOpenedInPopup,
          vm.showStreams,
          vm.screenshareViewingSupported,
          vm.resizeVideoHeightOrigin,
          vm.overrideSplitPercentage,
          vm.presented,
          vm.fullscreenTileId,
          vm.item?.layoutMode?.kind,
          ...(Array.isArray(vm.hostIndicators) ? vm.hostIndicators : []).map(i => `${i.id}:${!!i.issueIcon}`),
          ...(s?.tiles || []).map(t => `${t.id}:${t.focused}:${t.active}:${t.x}:${t.w}:${t.y}:${t.h}`)
        ].join(':');
      }, schedule);
      records.set(element, record);
    }
    update(records.get(element), enabled);
    syncActionDock(records.get(element), enabled);
  }
  for (const [element, record] of records) if (!live.has(element) || record.vm._isDestroyed) release(record);
  syncVolumes(enabled && feature('volumeBoost'));
  // Before keyboard semantics, so a new fallback mute button gets them at once.
  syncFallbackVolumes(enabled);
  syncButtons(enabled);
  syncPreviewJoins(enabled);
  syncZoom();
}
