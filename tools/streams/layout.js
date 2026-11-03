// Stage, tray and chat-rail layout for the native stream grid.
// Read the supported beta5 tile model without replacing native sessions.
function layoutState(vm) {
  if (
    !Array.isArray(vm.flatTiles) ||
    !Array.isArray(vm.sortableStreamsContainer?.sortedStreams) ||
    typeof vm.refForTile !== 'function' ||
    typeof vm.isFocused !== 'function' ||
    typeof vm.isStreamVisible !== 'function'
  )
    return null;
  const video = vm.flatTiles.filter(t => t.tile.payload.kind === 'video');
  return {
    sessions: vm.sortableStreamsContainer.sortedStreams.filter(
      s => typeof s.isInbound === 'boolean' && vm.isStreamVisible(s)
    ),
    viewers: vm.flatTiles.filter(t => t.tile.payload.kind !== 'video' || t.pip),
    tiles: video.map(t => {
      const node = vm.refForTile(t.tile),
        session = t.tile.payload.session;
      return {
        id: t.tile.id,
        session,
        active: playerActive(node, session),
        focused: vm.isFocused(t.tile),
        x: t.x,
        w: t.w,
        y: t.y,
        h: t.h,
        node
      };
    }),
    drag: !!vm.inDragTile
  };
}
function schedule() {
  if (queued || disposed) return;
  queued = true;
  // Vue/native ResizeObservers may publish new geometry during delivery.
  // Reconcile on the next frame rather than writing layout in that cycle.
  frame = requestAnimationFrame(() => {
    frame = 0;
    queued = false;
    if (!disposed) sync();
  });
}
function restoreTiles(record) {
  for (const [node, before] of record.tiles) {
    for (const [key, value] of Object.entries(before)) {
      if (value === null) node.removeAttribute(key);
      else node.setAttribute(key, value);
    }
  }
  record.tiles.clear();
}
function clearTray(record) {
  restoreTiles(record);
  record.toggle?.remove();
  record.toggle = null;
  record.element.removeAttribute(trayMarker);
}
function updateTray(record, active, state = layoutState(record.vm)) {
  const { element, vm } = record;
  const focused = state?.tiles.find(tile => tile.focused);
  // Layout refs are keyed by native session identifiers. Never reorder tiles
  // or change the session list: hiding a preview must not leave its stream.
  const hero = focused?.node;
  const wrapper = hero?.parentElement?.closest('.screen-grid-wrapper');
  const canToggle =
    active && state.sessions.length > 1 && !state.viewers.length && focused?.active && wrapper && !state.drag;
  const collapsed = trayCollapsed;
  const retainedToggle = record.toggle;
  if (!canToggle || document.fullscreenElement) {
    clearTray(record);
    syncChatRail(record, active);
    return;
  }
  const nodes = new Set(state.tiles.map(t => t.node));
  for (const [node, before] of record.tiles)
    if (!nodes.has(node)) {
      for (const [key, value] of Object.entries(before)) setAttr(node, key, value);
      record.tiles.delete(node);
    }
  for (const tile of state.tiles) {
    const node = tile.node;
    if (!node) continue;
    if (!record.tiles.has(node))
      record.tiles.set(
        node,
        Object.fromEntries(['data-tsix-tray-tile', 'inert'].map(key => [key, node.getAttribute(key)]))
      );
    setAttr(node, 'data-tsix-tray-tile', node === hero ? 'focused' : 'preview');
    setAttr(node, 'inert', collapsed && node !== hero ? '' : record.tiles.get(node).inert);
  }
  if (!retainedToggle?.isConnected) {
    record.toggle = document.createElement('button');
    record.toggle.type = 'button';
    record.toggle.setAttribute('data-tsix-tray-toggle', '');
    // Native button semantics provide Enter/Space activation automatically.
    record.toggle.addEventListener('mousedown', event => event.stopPropagation());
    record.toggle.addEventListener('click', event => {
      event.stopPropagation();
      trayCollapsed = !trayCollapsed;
      try {
        localStorage.setItem(preferenceKey, String(trayCollapsed));
      } catch {
        /* Toggling still works for this renderer session. */
      }
      sync();
    });
    wrapper.parentElement.querySelector('.screenshare__global-hover-actions-wrapper:last-child')?.append(record.toggle);
  }
  const label = collapsed ? 'Show other streams' : 'Hide other streams';
  setAttr(record.toggle, 'aria-label', label);
  setAttr(record.toggle, 'title', label);
  setAttr(record.toggle, 'aria-expanded', !collapsed);
  const host = wrapper.parentElement.querySelector('.screenshare__global-hover-actions-wrapper:last-child');
  if (!host) {
    clearTray(record);
    syncChatRail(record, active);
    return;
  }
  if (record.toggle.parentElement !== host) host.append(record.toggle);
  const previews = state.tiles.filter(t => t !== focused);
  const side = previews.some(t => t.x >= focused.x + focused.w - 2);
  setAttr(record.toggle, 'data-tsix-tray-axis', side ? 'horizontal' : 'vertical');
  const height = vm.gridHeight ?? vm.maximumVideoHeight;
  const center =
    collapsed || !previews.length
      ? height / 2
      : (Math.min(...previews.map(t => t.y)) + Math.max(...previews.map(t => t.y + t.h))) / 2;
  const offset = `${Math.round((center / Math.max(1, height)) * 10000) / 100}%`;
  if (record.toggle.style.getPropertyValue('--tsix-tray-position') !== offset)
    record.toggle.style.setProperty('--tsix-tray-position', offset);
  setAttr(element, trayMarker, collapsed ? 'collapsed' : 'expanded');
  syncChatRail(record, active);
}
// Native stream-issue badges are placed from the native tile model, which the
// stage layout resizes. Anchor each badge to its visible player frame instead,
// and hide it with a preview the tray hides.
const indicatorVars = ['--tsix-indicator-x', '--tsix-indicator-y'];
function clearStageChrome(record) {
  for (const node of record.indicators ?? []) {
    for (const key of indicatorVars) node.style.removeProperty(key);
    node.removeAttribute('data-tsix-indicator');
  }
  record.indicators?.clear();
  record.element.style.removeProperty('--tsix-footer-height');
  record.element.removeAttribute('data-tsix-footer-align');
}
function setVar(node, key, value) {
  if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
}
function syncStageChrome(record, active, state) {
  const { element, vm } = record;
  const grid = active && element.querySelector('.screen-grid');
  const nodes = grid ? [...grid.querySelectorAll(':scope > .screen-host-indicators')] : [];
  const list = Array.isArray(vm.hostIndicators) ? vm.hostIndicators : [];
  record.indicators ??= new Set();
  for (const node of record.indicators)
    if (!nodes.includes(node)) {
      for (const key of indicatorVars) node.style.removeProperty(key);
      node.removeAttribute('data-tsix-indicator');
      record.indicators.delete(node);
    }
  if (nodes.length && nodes.length === list.length) {
    const origin = grid.getBoundingClientRect();
    nodes.forEach((node, i) => {
      const tile = state.tiles.find(t => t.id === list[i].id);
      const frame = tile?.node?.querySelector('.video-stream') ?? tile?.node;
      const box = frame?.getBoundingClientRect();
      record.indicators.add(node);
      if (!box?.width || tile.node.closest('[inert]')) {
        setAttr(node, 'data-tsix-indicator', 'hidden');
        return;
      }
      setAttr(node, 'data-tsix-indicator', 'frame');
      setVar(node, '--tsix-indicator-x', `${Math.round(box.right - origin.left - 8)}px`);
      setVar(node, '--tsix-indicator-y', `${Math.round(box.top - origin.top + 8)}px`);
    });
  }
  // A stage that reaches the window's bottom edge shares the footer line of
  // the side columns: its player bar top meets their footer top.
  const footer = document.querySelector('.main-pane-layout .tsv-footer'),
    row = element.querySelector('[data-tsix-stream-row]');
  const a = footer?.getBoundingClientRect(),
    b = row?.getBoundingClientRect();
  if (a?.height && b && Math.abs(a.bottom - b.bottom) < 2) {
    setVar(element, '--tsix-footer-height', `${Math.round(a.height)}px`);
    setAttr(element, 'data-tsix-footer-align', '');
  } else {
    element.style.removeProperty('--tsix-footer-height');
    setAttr(element, 'data-tsix-footer-align', null);
  }
  // Several streams: the shared view-actions strip sits below the grid. When
  // chat is hidden and the stage reaches the window's bottom edge, it takes the
  // side footer's height, so its divider continues their footer line. Decide
  // from the stage area, never from the strip itself: its own height (and the
  // grid's height transition) moves its edge and would make this oscillate.
  const strip = record.actionDock?.footer?.hasAttribute('data-tsix-footer-grid') ? record.actionDock.footer : null;
  const area = vm.$refs.fullArea?.getBoundingClientRect();
  const value =
    strip &&
    a?.height &&
    area?.height &&
    element.getAttribute('data-tsix-chat') !== 'shown' &&
    Math.abs(a.bottom - area.bottom) < 2
      ? `${Math.round(a.height)}px`
      : '';
  if (strip && strip.style.getPropertyValue('--tsix-footer-height') !== value) {
    if (value) strip.style.setProperty('--tsix-footer-height', value);
    else strip.style.removeProperty('--tsix-footer-height');
    // The video budget subtracts the strip's measured height.
    schedule();
  }
}
function clearChatRail(record) {
  record.chatResize?.disconnect();
  record.chatResize = null;
  if (record.chatHost) {
    if (record.chatHostBefore === null) record.chatHost.removeAttribute('data-tsix-chat-host');
    else record.chatHost.setAttribute('data-tsix-chat-host', record.chatHostBefore);
    record.chatHost = null;
  }
}
function syncChatRail(record, enabled) {
  const bar = record.chatToolbar;
  if (!bar) return;
  const button = bar.firstChild,
    row = record.element.querySelector('.screen-grid-wrapper')?.parentElement;
  const host =
    enabled && !document.fullscreenElement
      ? row?.querySelector(':scope > .screenshare__global-hover-actions-wrapper:last-child')
      : null;
  const native = document.querySelector('svg[name="mode-chat"]');
  if (!host || (!record.chatIcon && !native)) {
    clearChatRail(record);
    bar.removeAttribute('data-tsix-chat-rail');
    const label = button.getAttribute('aria-label');
    if (button.textContent !== label) button.textContent = label;
    if (bar.parentElement !== record.element)
      record.element.insertBefore(bar, record.element.querySelector(':scope > .tsv-body'));
    return;
  }
  if (record.chatHost !== host) {
    clearChatRail(record);
    record.chatHost = host;
    record.chatHostBefore = host.getAttribute('data-tsix-chat-host');
    host.setAttribute('data-tsix-chat-host', '');
    record.chatResize = new ResizeObserver(schedule);
    record.chatResize.observe(host);
  }
  if (!record.chatIcon) {
    record.chatIcon = cloneIcon(native);
    record.chatIcon.setAttribute('data-tsix-chat-icon', '');
  }
  if (button.firstChild !== record.chatIcon) button.replaceChildren(record.chatIcon);
  if (bar.parentElement !== host) host.append(bar);
  if (!bar.hasAttribute('data-tsix-chat-rail')) bar.setAttribute('data-tsix-chat-rail', '');
  const toggle = record.toggle,
    r = host.getBoundingClientRect();
  const y = toggle?.isConnected ? toggle.getBoundingClientRect().bottom - r.top + 8 : r.height / 2 - 14;
  const top = Math.round(Math.max(4, Math.min(y, r.height - 32))) + 'px';
  if (bar.style.getPropertyValue('--tsix-chat-top') !== top) bar.style.setProperty('--tsix-chat-top', top);
}
// beta5's card grid maximises tile area. Once the stage is taller than one
// full-width 16:9 tile plus a minimum row (which happens here because hidden
// chat gives the stage the whole height; natively it stops at 66%), it puts
// one stream across the full width and shrinks the others to a thin row, so
// the grid looks like that stream is focused. In the grid (auto) only, keep
// the rows even: lay out at the tallest height that does, centred vertically.
// Focus, fullscreen and pop-outs keep the native result.
const evenRows = result => {
  const heights = result.blocks.flatMap(b =>
    b.positioned.flatMap(p => p.tiles.filter(t => t.tile?.payload?.kind === 'video').map(t => t.h))
  );
  return heights.length < 2 || Math.max(...heights) <= Math.min(...heights) * 1.5;
};
function installEvenGrid(record) {
  const { vm } = record;
  if (record.evenGrid || typeof vm.runLayout !== 'function') return;
  const original = vm.runLayout;
  let cache = null;
  const layout = function (box) {
    const result = original.call(this, box);
    if (
      !themeActive() ||
      box?.popout ||
      this.isPopout ||
      (this.item?.layoutMode?.kind ?? 'auto') !== 'auto' ||
      !(box?.h > 0) ||
      evenRows(result)
    )
      return result;
    const key = [
      box.w,
      box.h,
      box.page,
      box.gapX,
      box.gapY,
      ...result.blocks.flatMap(b => b.positioned.flatMap(p => p.tiles.map(t => t.tile?.id)))
    ].join('|');
    let height = cache?.key === key ? cache.height : 0;
    if (!height) {
      // Step down to an even layout, then search for the tallest one.
      let good = 0,
        bad = box.h;
      for (let h = box.h * 0.9; h >= box.h * 0.3; h *= 0.9)
        if (evenRows(original.call(this, { ...box, h }))) {
          good = h;
          break;
        } else bad = h;
      if (!good) return result;
      for (let i = 0; i < 8 && bad - good > 2; i++) {
        const h = (good + bad) / 2;
        if (evenRows(original.call(this, { ...box, h }))) good = h;
        else bad = h;
      }
      height = good;
      cache = { key, height };
    }
    const even = original.call(this, { ...box, h: height });
    const bottom = Math.max(0, ...even.blocks.map(b => b.origin.y + b.size.h));
    const offset = Math.floor(Math.max(0, box.h - bottom) / 2);
    for (const block of even.blocks) block.origin = { ...block.origin, y: block.origin.y + offset };
    return even;
  };
  vm.runLayout = layout;
  record.evenGrid = { original, layout };
  if (vm.maximumWidth > 0 && vm.maximumHeight > 0 && !document.fullscreenElement) vm.doUpdateGrid();
}
function releaseEvenGrid(record) {
  const entry = record.evenGrid;
  if (!entry) return;
  if (record.vm.runLayout === entry.layout) record.vm.runLayout = entry.original;
  record.evenGrid = null;
  if (!record.vm._isDestroyed && !document.fullscreenElement) record.vm.doUpdateGrid();
}
function update(record, enabled) {
  const { element, vm } = record;
  syncChatLayout(record, enabled);
  if (enabled) {
    holdGridIntent(record);
    installEvenGrid(record);
  }
  const state = layoutState(vm);
  const active =
    enabled &&
    state?.sessions.length > 0 &&
    vm.showStreams &&
    vm.screenshareViewingSupported &&
    !vm.isGridOpenedInPopup &&
    !vm.isPopout;
  const chat = element.querySelector('.ts-chat-container');
  const hasChat = !!chat;
  const playing = state?.tiles.some(tile => tile.active);
  const previewOnly = active && !playing && state.viewers.length === 0;
  // beta5 inserts a portal and display:contents context between fullArea
  // and the row. Mark the actual region rather than assuming beta4's DOM.
  if (active) {
    const grid = element.querySelector('.screen-grid-wrapper');
    const region = [...vm.$refs.fullArea.children].find(node => node.contains(grid));
    const current = new Set([region, grid?.parentElement]);
    for (const [node, attrs] of record.layoutNodes)
      if (!current.has(node)) {
        for (const [key, value] of attrs) {
          if (value === null) node.removeAttribute(key);
          else node.setAttribute(key, value);
        }
        record.layoutNodes.delete(node);
      }
    for (const [node, key] of [
      [region, 'data-tsix-stream-region'],
      [grid?.parentElement, 'data-tsix-stream-row']
    ]) {
      if (!node) continue;
      if (!record.layoutNodes.has(node)) record.layoutNodes.set(node, new Map());
      const attrs = record.layoutNodes.get(node);
      if (!attrs.has(key)) attrs.set(key, node.getAttribute(key));
      if (!node.hasAttribute(key)) node.setAttribute(key, '');
    }
  } else restoreLayoutNodes(record);
  if (active && hasChat) {
    if (!record.chatToolbar) {
      const bar = document.createElement('div'),
        button = document.createElement('button');
      bar.setAttribute('data-tsix-stream-toolbar', '');
      button.type = 'button';
      button.setAttribute('data-tsix-chat-toggle', '');
      button.addEventListener('click', event => {
        event.stopPropagation();
        chatVisible = !chatVisible;
        try {
          localStorage.setItem(chatPreferenceKey, String(chatVisible));
        } catch {}
        sync();
      });
      for (const type of ['pointerdown', 'mousedown', 'dblclick'])
        button.addEventListener(type, event => event.stopPropagation());
      bar.append(button);
      element.insertBefore(bar, element.querySelector(':scope > .tsv-body'));
      record.chatToolbar = bar;
    }
    syncChatVisibility(record, chat, !chatVisible);
    setAttr(element, 'data-tsix-chat', chatVisible ? 'shown' : 'hidden');
    const button = record.chatToolbar.firstChild,
      label = chatVisible ? 'Hide chat' : 'Show chat';
    if (!record.chatToolbar.hasAttribute('data-tsix-chat-rail') && button.textContent !== label)
      button.textContent = label;
    setAttr(button, 'aria-label', label);
    setAttr(button, 'title', label);
    setAttr(button, 'aria-expanded', chatVisible);
  } else {
    syncChatVisibility(record, null, false);
    clearChatRail(record);
    record.chatToolbar?.remove();
    record.chatToolbar = null;
    element.removeAttribute('data-tsix-chat');
  }
  // Native fullscreen mode changes before requestFullscreen completes.
  // Stop allocating pane heights during that transition as well.
  if (document.fullscreenElement || vm.item?.layoutMode?.kind === 'fullscreen' || vm.presented) {
    element.removeAttribute(marker);
    element.removeAttribute(layoutMarker);
    updateTray(record, false, state);
    syncFocusActions(record, false, state);
    clearStageChrome(record);
    return;
  }
  syncFocusActions(record, active && feature('clickFocus'), state);
  if (active && typeof vm.resizeVideoHeightOrigin === 'number' && vm.resizeVideoHeightOrigin !== -1) {
    record.resizing = true;
    record.dragSplit = vm.overrideSplitPercentage;
    updateTray(record, active, state);
    return;
  }
  if (record.resizing) {
    record.resizing = false;
    if (Number.isFinite(record.dragSplit) && record.dragSplit >= 0) record.savedSplit = record.dragSplit;
  }
  let changed = false;
  if (active) {
    if (record.savedSplit === null) record.savedSplit = vm.overrideSplitPercentage;
    const unit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tsix-unit')) || 15;
    const nativeSplit = record.savedSplit === -1 ? vm.maxVideoAreaHeightPct : record.savedSplit;
    const height = Math.max(1, vm.maximumHeight);
    const chatMin = Math.min(unit * 14, Math.max(80, height * 0.4));
    const chatLimit = Math.max(0, height - chatMin - 8);
    const single = state.sessions.length === 1 && state.tiles.length === 1 && !state.viewers.length;
    const collapsedFocus = trayCollapsed && state.tiles.some(t => t.focused && t.active);
    const focusAllocation =
      (single || collapsedFocus) && record.savedSplit === -1 ? chatLimit : Math.min(height * nativeSplit, chatLimit);
    const limit = chatVisible && hasChat ? focusAllocation : height;
    // Joining changes the content of the stage, not its size. Reserve the
    // same chat budget and player frame before and after opening a stream.
    const footerHeight = record.actionDock?.footer?.hasAttribute('data-tsix-footer-grid')
      ? record.actionDock.footer.getBoundingClientRect().height
      : 0;
    const videoHeight = Math.max(0, limit - footerHeight);
    // Retain the native content-sized grid when it already leaves room for
    // chat. Forcing an explicit split otherwise adds a large empty block.
    const nativeAuto =
      !footerHeight &&
      chatVisible &&
      hasChat &&
      !single &&
      !collapsedFocus &&
      record.savedSplit === -1 &&
      limit >= height * nativeSplit - 0.1;
    const split = nativeAuto ? -1 : videoHeight / height;
    const minValue = `${chatMin}px`;
    if (element.style.getPropertyValue('--tsix-chat-min-height') !== minValue)
      element.style.setProperty('--tsix-chat-min-height', minValue);
    if (vm.overrideSplitPercentage !== split) {
      vm.overrideSplitPercentage = split;
      changed = true;
    }
    if (vm.maximumHeight > 0 && Math.abs(vm.maximumVideoHeight - videoHeight) > 0.1) {
      vm.maximumVideoHeight = videoHeight;
      changed = true;
    }
  } else if (record.savedSplit !== null) {
    vm.overrideSplitPercentage = record.savedSplit;
    record.savedSplit = null;
    vm.maximumVideoHeight =
      vm.maximumHeight * (vm.overrideSplitPercentage === -1 ? vm.maxVideoAreaHeightPct : vm.overrideSplitPercentage);
    changed = true;
  }
  if (changed && vm.maximumWidth > 0 && vm.maximumHeight > 0) vm.doUpdateGrid();
  const stage =
    active && state.tiles.length
      ? previewOnly
        ? 'preview'
        : state.sessions.length === 1 && state.tiles.length === 1 && state.viewers.length === 0 && !state.drag
          ? 'single'
          : 'multiple'
      : null;
  if (stage) {
    if (element.getAttribute(marker) !== stage) element.setAttribute(marker, stage);
  } else element.removeAttribute(marker);
  setAttr(
    element,
    layoutMarker,
    stage
      ? state.sessions.length === 1 && state.tiles.length === 1 && !state.viewers.length && !state.drag
        ? 'single'
        : 'grid'
      : null
  );
  updateTray(record, active, state);
  if (active && stage) syncStageChrome(record, active, state);
  else clearStageChrome(record);
}
