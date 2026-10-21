// Injected only into the verified beta5 main renderer by session.mjs.
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
  const attr=(node,key,value)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value)};
  let queued = false, disposed = false;
  function schedule() { if (queued || disposed) return; queued = true; queueMicrotask(() => { queued = false; if (!disposed) sync(); }); }
  function sync() {
    if(disposed)return;
    const enabled = getComputedStyle(document.documentElement).getPropertyValue('--tsix-workspace-api').trim() === '1';
    syncTreeMetrics();
    syncControls(enabled);
    for (const node of enabled ? root.querySelectorAll(selector) : []) {
      if (!tracked.has(node)) {
        const before = Object.fromEntries(attributes.map(key => [key, node.getAttribute(key)]));
        let pressed = false;
        const keydown = event => {
          if (event.target !== node || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault(); event.stopPropagation();
          if (event.repeat) return;
          if (event.key === 'Enter') node.click(); else pressed = true;
        };
        const keyup = event => {
          if (event.target !== node || event.key !== ' ') return;
          event.preventDefault(); event.stopPropagation(); if (pressed) node.click(); pressed = false;
        };
        const blur = () => { pressed = false; };
        // Do not start the parent splitter's drag when pressing this button.
        const mousedown = event => event.stopPropagation();
        const click = event => {
          event.preventDefault(); event.stopImmediatePropagation();
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
        tracked.set(node, {before, keydown, keyup, blur, mousedown, click});
      }
      const label = vm.collapsedSidebar ? 'Expand sidebar' : 'Collapse sidebar';
      attr(node,'role', 'button');
      attr(node,'tabindex', '0');
      attr(node,'aria-label', label);
      attr(node,'title', label);
      attr(node,'aria-expanded', String(!vm.collapsedSidebar));
    }
    for (const [node, record] of tracked) if (!enabled || !root.contains(node)) release(node, record);
  }
  function release(node, {before, keydown, keyup, blur, mousedown, click}) {
    node.removeEventListener('keydown', keydown);
    node.removeEventListener('keyup', keyup);
    node.removeEventListener('blur', blur);
    node.removeEventListener('mousedown', mousedown);
    node.removeEventListener('click', click, true);
    for (const [key, value] of Object.entries(before)) {
      if (value === null) node.removeAttribute(key); else attr(node,key, value);
    }
    tracked.delete(node);
  }
  // These audited native controls are clickable DIVs in beta5. Add keyboard
  // access to the existing click handlers, including split-button menus. Never
  // invoke an audio, connection or sharing API while reconciling the layout.
  function syncControls(enabled) {
    const seen = new Set();
    const icons = {'mode-info':'Info', 'mode-chat':'Chat', 'mode-files':'Files'};
    const candidates = enabled ? root.querySelectorAll(
      '.main-pane-layout .tsv-tool-button, .main-pane-layout .tsv-tool-button-context-menu-toggle, ' +
      '.tsv-activity-detail .tsv-segmented-button, .sidebar-pane-layout > .tsv-footer .tsv-button, ' +
      '.sidebar-pane-layout > .tsv-footer .tsv-bar-item:has(> svg[name="settings"]), ' +
      '.sidebar-pane-layout .tsv-title-bar > .tsv-bar-item:has(svg[name="notifications"])'
    ) : [];
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
      const label = view || (menu ? `${owner.dataset.tsixControlLabel || model?.title || 'Control'} options` :
        (typeof model?.tooltip === 'string' && model.tooltip) || model?.title ||
        ({settings:'Settings',notifications:'Notifications',edit:'Edit profile'}[icon]));
      if (typeof label !== 'string' || !label) continue;
      seen.add(node);
      if (!controls.has(node)) {
        const keys = ['role','tabindex','aria-label','aria-disabled','aria-pressed','aria-haspopup','title','data-tsix-keyboard','data-tsix-view-label'];
        const before = Object.fromEntries(keys.map(key => [key,node.getAttribute(key)]));
        let pressed = false;
        const activate = () => {
          if (node.getAttribute('aria-disabled') === 'true') return;
          const r = node.getBoundingClientRect();
          node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
        };
        const keydown = event => {
          if (event.target !== node || !['Enter',' '].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          if (event.repeat) return;
          if (event.key === 'Enter') activate(); else pressed = true;
        };
        const keyup = event => {
          if (event.target !== node || event.key !== ' ') return;
          event.preventDefault(); event.stopPropagation();
          if (pressed) activate(); pressed = false;
        };
        const blur = () => { pressed = false; };
        node.addEventListener('keydown',keydown); node.addEventListener('keyup',keyup); node.addEventListener('blur',blur);
        controls.set(node,{before,keydown,keyup,blur});
      }
      const disabled = !!(model?.disabled || owner.__vue__?.disabled ||
        node.matches('.tsv-is-disabled,.tsv-is-visually-disabled') || owner.matches('.tsv-is-disabled,.tsv-is-visually-disabled'));
      attr(node,'data-tsix-keyboard','');
      attr(node,'role','button'); attr(node,'tabindex',disabled ? '-1' : '0');
      attr(node,'aria-disabled',String(disabled)); attr(node,'aria-label',label); attr(node,'title',label);
      if (menu) attr(node,'aria-haspopup','menu');
      if (view) {
        attr(node,'data-tsix-view-label',view);
        attr(node,'aria-pressed',String(node.classList.contains('active')));
      }
    }
    for (const [node,record] of controls) if (!seen.has(node)) releaseControl(node,record);
  }
  function releaseControl(node,{before,keydown,keyup,blur}) {
    node.removeEventListener('keydown',keydown); node.removeEventListener('keyup',keyup); node.removeEventListener('blur',blur);
    for (const [key,value] of Object.entries(before)) {
      if (value === null) node.removeAttribute(key); else attr(node,key,value);
    }
    controls.delete(node);
  }
  // Appearance changes regenerate the native style variables. Keep every tree,
  // including previews, measured from the same CSS instead of hardcoded rows.
  let metricSignature='';
  function syncTreeMetrics() {
    const cache=document.querySelector('main')?.__vue__?.variableCache;
    if(!cache?.element?.parentElement||!(cache.cache instanceof Map))return;
    const keys={'--ts-tree-client-height-compact':'clientHeightCompact','--ts-tree-client-height-default':'clientHeightDetailed','--ts-tree-channel-height-default':'channelHeightDefault','--ts-tree-spacer-height-default':'spacerHeightDefault'};
    const signature=root.className+'|'+Object.keys(keys).map(k=>getComputedStyle(cache.element).getPropertyValue(k)).join('|');
    if(signature===metricSignature)return;
    cache.recomputeStyles();const probe=document.createElement('div');probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;height:0;padding:0;border:0;margin:0;box-sizing:content-box;min-width:0;max-width:none';cache.element.parentElement.append(probe);
    const metrics={};
    try{for(const [key,field] of Object.entries(keys)){probe.style.width=getComputedStyle(cache.element).getPropertyValue(key);const n=probe.getBoundingClientRect().width;if(!Number.isFinite(n)||n<20||n>200)return;metrics[field]=n;cache.cache.set(key,n)}}finally{probe.remove()}
    metricSignature=signature;
    for(const e of root.querySelectorAll('.ts-server-tree-wrapper')){const t=e.parentElement.__vue__;if(!t||typeof t.flattenServer!=='function')continue;
      if(Object.entries(metrics).every(([k,v])=>t[k]===v))continue;const s=e.querySelector('.scroller'),top=s?.scrollTop;Object.assign(t,metrics);t.flattenServer();t.$nextTick(()=>{if(s&&Number.isFinite(top))s.scrollTop=top});}
  }
  const observer = new MutationObserver(schedule);
  observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  const themeObserver = new MutationObserver(schedule);
  themeObserver.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href','disabled']});
  document.addEventListener('load',sync,true);
  window.addEventListener('resize',schedule);
  const unwatch = vm.$watch('collapsedSidebar', sync);
  sync();
  window.__tsixWorkspace = {
    version: '1.0.0',
    refresh: schedule,
    dispose() {
      disposed = true;
      observer.disconnect(); themeObserver.disconnect(); unwatch();
      for (const [node, record] of controls) releaseControl(node, record);
      document.removeEventListener('load',sync,true);
      window.removeEventListener('resize',schedule);
      for (const [node, record] of tracked) release(node, record);
      delete window.__tsixWorkspace;
    }
  };
  return {enhancedControls: tracked.size};
})()
