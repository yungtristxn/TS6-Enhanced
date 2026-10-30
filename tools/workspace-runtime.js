// Embedded in the native loader payload for the verified beta5 main renderer.
// Preserve native navigation, panel ownership and normal document tab order.
// Native pane APIs retain the user's tree width; no server or audio actions.
(() => {
  window.__tsixWorkspace?.dispose();
  const root = document.querySelector('.tsv-window');
  const vm = root?.__vue__;
  if (!vm || typeof vm.collapseSidebar !== 'function') throw Error('Unexpected window component');
  const selector = '.main-pane-layout > .tsv-body > .tsv-resize-handle > .tsv-resize-handle-info';
  const tracked = new Map();
  const controls = new Map();
  const attributes = ['role', 'tabindex', 'aria-label', 'aria-expanded', 'title'];
  const attr = (node, key, value) => {
    if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  };
  let frame = 0,
    disposed = false;
  let community = null;
  function syncCommunity(enabled) {
    const node = root.querySelector('.sidebar-pane-layout .ts-join-community .tsv-button-content');
    if (community && (!enabled || community.node !== node)) {
      if (community.node.isConnected) community.node.replaceChildren(...community.children);
      community = null;
    }
    if (!enabled || !node || community) return;
    const native = root.querySelector('.sidebar-pane-layout .tsv-item-action svg[name="chat-contact-add"]');
    if (!native) return;
    community = { node, children: [...node.childNodes] };
    const icon = native.cloneNode(true);
    icon.setAttribute('data-tsix-community-icon', '');
    icon.setAttribute('aria-hidden', 'true');
    for (const n of [icon, ...icon.querySelectorAll('[id]')]) n.removeAttribute('id');
    node.replaceChildren(icon, document.createTextNode('Create community'));
  }
  function schedule() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!disposed) sync();
    });
  }
  function sync() {
    if (disposed) return;
    const enabled = getComputedStyle(document.documentElement).getPropertyValue('--tsix-workspace-api').trim() === '1';
    syncTreeMetrics();
    syncControls(enabled);
    syncCommunity(enabled);
    for (const node of enabled ? root.querySelectorAll(selector) : []) {
      if (!tracked.has(node)) {
        const before = Object.fromEntries(attributes.map(key => [key, node.getAttribute(key)]));
        let pressed = false;
        const keydown = event => {
          if (event.target !== node || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          if (event.key === 'Enter') node.click();
          else pressed = true;
        };
        const keyup = event => {
          if (event.target !== node || event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          if (pressed) node.click();
          pressed = false;
        };
        const blur = () => {
          pressed = false;
        };
        // Do not start the parent splitter's drag when pressing this button.
        const mousedown = event => event.stopPropagation();
        const click = event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const layout = vm.windowLayout;
          const treeWidth = layout.windowSlots[layout.mainIndex].size;
          vm.collapseSidebar();
          // TS6 normally transfers the collapsed width to the adjacent tree.
          // Transfer it to the right workspace instead, respecting native minima.
          layout.resizeSlotStarted();
          layout.resizeSlot(layout.mainIndex, treeWidth - layout.windowSlots[layout.mainIndex].size);
          layout.resizeSlotEnded();
          sync();
        };
        node.addEventListener('keydown', keydown);
        node.addEventListener('keyup', keyup);
        node.addEventListener('blur', blur);
        node.addEventListener('mousedown', mousedown);
        node.addEventListener('click', click, true);
        tracked.set(node, { before, keydown, keyup, blur, mousedown, click });
      }
      const label = vm.collapsedSidebar ? 'Expand sidebar' : 'Collapse sidebar';
      attr(node, 'role', 'button');
      attr(node, 'tabindex', '0');
      attr(node, 'aria-label', label);
      attr(node, 'title', label);
      attr(node, 'aria-expanded', String(!vm.collapsedSidebar));
    }
    for (const [node, record] of tracked) if (!enabled || !root.contains(node)) release(node, record);
  }
  function release(node, { before, keydown, keyup, blur, mousedown, click }) {
    node.removeEventListener('keydown', keydown);
    node.removeEventListener('keyup', keyup);
    node.removeEventListener('blur', blur);
    node.removeEventListener('mousedown', mousedown);
    node.removeEventListener('click', click, true);
    for (const [key, value] of Object.entries(before)) {
      if (value === null) node.removeAttribute(key);
      else attr(node, key, value);
    }
    tracked.delete(node);
  }
  // These audited native controls are clickable DIVs in beta5. Add keyboard
  // access to the existing click handlers, including split-button menus. Never
  // invoke an audio, connection or sharing API while reconciling the layout.
  function controlDisabled(node) {
    const owner = node.closest('.tsv-tool-button') || node,
      model = owner.__vue__?.button;
    return !!(
      model?.isDisabled ||
      model?.disabled ||
      owner.__vue__?.disabled ||
      (node.matches('.tsv-tool-button-context-menu-toggle') && model?.contextMenuButtonDisabled) ||
      node.matches('.tsv-is-disabled,.tsv-is-visually-disabled,[disabled]') ||
      owner.matches('.tsv-is-disabled,.tsv-is-visually-disabled,[disabled]')
    );
  }
  function syncControls(enabled) {
    const seen = new Set();
    const icons = { 'mode-info': 'Info', 'mode-chat': 'Chat', 'mode-files': 'Files' };
    const candidates = enabled
      ? root.querySelectorAll(
          '.main-pane-layout .tsv-tool-button, .main-pane-layout .tsv-tool-button-context-menu-toggle, ' +
            '.tsv-activity-detail .tsv-segmented-button, .sidebar-pane-layout > .tsv-footer .tsv-button, ' +
            '.sidebar-pane-layout > .tsv-footer .tsv-bar-item:has(> svg[name="settings"]), ' +
            '.sidebar-pane-layout .tsv-title-bar > .tsv-bar-item:has(svg[name="notifications"])'
        )
      : [];
    for (const node of candidates) {
      // The stream helper owns the live-sharing split button and its semantics.
      if (node.closest('[data-tsix-broadcast-control]') || node.matches('button')) continue;
      const view = icons[node.querySelector('svg[name]')?.getAttribute('name')];
      const menu = node.matches('.tsv-tool-button-context-menu-toggle');
      const owner = menu ? node.closest('.tsv-tool-button') : node;
      const model = owner.__vue__?.button;
      // Identify the native sharing button even between stream-helper detach
      // and reattach, when its marker is temporarily absent.
      if (model && model === owner.closest('.tsv-central-toolbar')?.__vue__?.screenshareButton) continue;
      const icon = node.querySelector('svg[name]')?.getAttribute('name');
      const label =
        view ||
        (menu
          ? `${owner.dataset.tsixControlLabel || model?.title || 'Control'} options`
          : (typeof model?.tooltip === 'string' && model.tooltip) ||
            model?.title ||
            { settings: 'Settings', notifications: 'Notifications', edit: 'Edit profile' }[icon]);
      if (typeof label !== 'string' || !label) continue;
      seen.add(node);
      if (!controls.has(node)) {
        const keys = [
          'role',
          'tabindex',
          'aria-label',
          'aria-disabled',
          'aria-pressed',
          'aria-haspopup',
          'title',
          'data-tsix-keyboard',
          'data-tsix-view-label'
        ];
        const before = Object.fromEntries(keys.map(key => [key, node.getAttribute(key)]));
        let pressed = false;
        const activate = () => {
          // State can change between keydown and keyup, before Vue updates the
          // DOM. Read the current native model as well as the announced state.
          if (controlDisabled(node) || node.getAttribute('aria-disabled') === 'true') return;
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
        controls.set(node, { before, keydown, keyup, blur });
      }
      const disabled = controlDisabled(node);
      attr(node, 'data-tsix-keyboard', '');
      attr(node, 'role', 'button');
      attr(node, 'tabindex', disabled ? '-1' : '0');
      attr(node, 'aria-disabled', String(disabled));
      attr(node, 'aria-label', label);
      attr(node, 'title', label);
      if (menu) attr(node, 'aria-haspopup', 'menu');
      if (view) {
        attr(node, 'data-tsix-view-label', view);
        attr(node, 'aria-pressed', String(node.classList.contains('active')));
      }
    }
    for (const [node, record] of controls) if (!seen.has(node)) releaseControl(node, record);
  }
  function releaseControl(node, { before, keydown, keyup, blur }) {
    node.removeEventListener('keydown', keydown);
    node.removeEventListener('keyup', keyup);
    node.removeEventListener('blur', blur);
    for (const [key, value] of Object.entries(before)) {
      if (value === null) node.removeAttribute(key);
      else attr(node, key, value);
    }
    controls.delete(node);
  }
  // Appearance changes regenerate the native style variables. Keep every tree,
  // including previews, measured from the same CSS instead of hardcoded rows.
  const metricKeys = {
    '--ts-tree-client-height-compact': 'clientHeightCompact',
    '--ts-tree-client-height-default': 'clientHeightDetailed',
    '--ts-tree-channel-height-default': 'channelHeightDefault',
    '--ts-tree-spacer-height-default': 'spacerHeightDefault'
  };
  let metricSignature = '',
    metricOwner = null,
    treeMetrics = null;
  function syncTreeMetrics() {
    const cache = document.querySelector('main')?.__vue__?.variableCache;
    if (!cache?.element?.parentElement || !(cache.cache instanceof Map) || typeof cache.recomputeStyles !== 'function')
      return;
    const computed = getComputedStyle(cache.element),
      entries = Object.entries(metricKeys);
    const values = entries.map(([key]) => computed.getPropertyValue(key).trim());
    // Early resource CSS lets TeamSpeak initialize these values correctly.
    // Literal pixel rows need no DOM probe, cache write or initial tree rebuild.
    const pixels = values.every(value => /^\d+(?:\.\d+)?px$/.test(value));
    const signature =
      values.join('|') + (pixels ? '' : `|${root.className}|${computed.fontSize}|${innerWidth}|${innerHeight}`);
    if (cache !== metricOwner || signature !== metricSignature) {
      let metrics;
      if (pixels) metrics = values.map(Number.parseFloat);
      else {
        const probe = document.createElement('div');
        probe.style.cssText =
          'position:absolute;visibility:hidden;pointer-events:none;height:0;padding:0;border:0;margin:0;box-sizing:content-box;min-width:0;max-width:none';
        cache.element.parentElement.append(probe);
        try {
          metrics = values.map(value => {
            probe.style.width = '';
            probe.style.width = value;
            return probe.style.width ? probe.getBoundingClientRect().width : NaN;
          });
        } finally {
          probe.remove();
        }
      }
      if (metrics.some(value => !Number.isFinite(value) || value < 20 || value > 200)) return;
      treeMetrics = Object.fromEntries(entries.map(([, field], index) => [field, metrics[index]]));
      metricOwner = cache;
      metricSignature = signature;
    }
    if (entries.some(([key, field]) => cache.cache.get(key) !== treeMetrics[field])) {
      cache.recomputeStyles();
      for (const [key, field] of entries) cache.cache.set(key, treeMetrics[field]);
    }
    // A preview or newly mounted server tree may arrive after the CSS signature
    // settled. Compare its actual model instead of skipping it with the cache.
    for (const element of root.querySelectorAll('.ts-server-tree-wrapper')) {
      const tree = element.parentElement.__vue__;
      if (
        !tree ||
        typeof tree.flattenServer !== 'function' ||
        Object.entries(treeMetrics).every(([key, value]) => tree[key] === value)
      )
        continue;
      const scroller = element.querySelector('.scroller'),
        top = scroller?.scrollTop;
      Object.assign(tree, treeMetrics);
      tree.flattenServer();
      tree.$nextTick(() => {
        if (
          !disposed &&
          element.isConnected &&
          element.parentElement.__vue__ === tree &&
          scroller &&
          Number.isFinite(top)
        )
          scroller.scrollTop = top;
      });
    }
  }
  // Chat messages, virtual tree rows and stream overlays do not change the
  // workspace controls or row metrics. Avoid rescanning the shell for their
  // frequent content/state updates; mounting their containers still reaches us.
  const observer = new MutationObserver(changes => {
    if (
      changes.some(change => {
        const node = change.target.nodeType === 1 ? change.target : change.target.parentElement;
        if (change.type === 'attributes')
          return (
            node === root ||
            node?.matches('.tsv-button,.tsv-tool-button,.tsv-tool-button-context-menu-toggle,.tsv-segmented-button')
          );
        if (node?.closest('.ts-server-tree-wrapper')) {
          // The virtual list's top slot also contains the native server header.
          // Its tools can mount independently of recycled channel/client rows.
          const tools = '.tsv-tool-button,.tsv-tool-button-context-menu-toggle';
          return (
            !!node.closest(tools) ||
            [...change.addedNodes, ...change.removedNodes].some(
              child => child.nodeType === 1 && (child.matches(tools) || child.querySelector(tools))
            )
          );
        }
        return !node?.closest(
          '.ts-chat-container,.tsv-screenshare,.tsv-screenshare-portal-ctx,[data-tsix-broadcast-bar]'
        );
      })
    )
      schedule();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  const themeObserver = new MutationObserver(schedule);
  themeObserver.observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'disabled']
  });
  const onStyleLoad = event => {
    if (event.target?.tagName === 'LINK') schedule();
  };
  document.addEventListener('load', onStyleLoad, true);
  window.addEventListener('resize', schedule);
  const unwatch = vm.$watch('collapsedSidebar', sync);
  sync();
  window.__tsixWorkspace = {
    version: '1.0.4',
    refresh: schedule,
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      syncCommunity(false);
      observer.disconnect();
      themeObserver.disconnect();
      unwatch();
      for (const [node, record] of controls) releaseControl(node, record);
      document.removeEventListener('load', onStyleLoad, true);
      window.removeEventListener('resize', schedule);
      for (const [node, record] of tracked) release(node, record);
      delete window.__tsixWorkspace;
    }
  };
  return { enhancedControls: tracked.size };
})();
