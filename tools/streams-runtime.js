// Embedded in the native loader payload for the verified main client context.
// Native media/session objects stay intact. The exact-build player ref adapter
// caps HTML volume; amplification uses native gain or Web Audio after input.
// Volume boost and viewer metadata stay in memory; no profile database access.
(() => {
  let trayCollapsed = window.__tsixStreams?.status().trayCollapsed ?? false;
  let chatVisible = window.__tsixStreams?.status().chatVisible ?? true;
  window.__tsixStreams?.dispose();
  const preferenceKey = 'tsix.layout.streamTrayCollapsed';
  const chatPreferenceKey = 'tsix.layout.chatVisible';
  try { trayCollapsed = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Keep the in-memory choice if storage is unavailable. */ }
  try { chatVisible = localStorage.getItem(chatPreferenceKey) !== 'false'; } catch { /* Chat remains available without storage. */ }
  const marker = 'data-tsix-stream-stage';
  const layoutMarker = 'data-tsix-stream-layout';
  const trayMarker = 'data-tsix-stream-tray';
  const records = new Map(), buttons = new Map(), volumes = new Map(), joins = new Map();
  const volumeReady = new WeakSet(), volumeFrames = new Map();
  const volumeHandoffs = new WeakMap();
  let disposed = false, queued = false, frame = 0;
  const broadcast = createBroadcast();
  const labels = {
    'status-recording': 'Stream viewers',
    'pause': 'Pause stream',
    'play': 'Resume stream',
    'stream-settings': 'Stream settings',
    'stream-maximize': 'Toggle stream fullscreen',
    'stream-minimize': 'Exit stream fullscreen',
    'stream-shutdown': 'Close stream',
    'stream-leave': 'Leave stream',
    'speaker': 'Mute stream audio',
    'speaker-slash': 'Unmute stream audio',
    'dots': 'Stream view settings',
    'expand': 'Pop out stream'
  };
  const attrs = ['role', 'tabindex', 'aria-label', 'title', 'aria-disabled'];
  const setAttr = (node,key,value) => { if(value===null){if(node.hasAttribute(key))node.removeAttribute(key)}else if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value)); };
  const controlDisabled = node => !!(node?.__vue__?.disabled || node?.__vue__?.button?.isDisabled || node?.__vue__?.button?.disabled ||
    (node?.matches('.tsv-tool-button-context-menu-toggle') && node.closest('.tsv-tool-button')?.__vue__?.button?.contextMenuButtonDisabled) ||
    node?.matches('.disabled,.tsv-is-disabled,.tsv-is-visually-disabled,[disabled]'));
  const cloneIcon = source => {
    const icon=source.cloneNode(true);icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
    // Native SVGs have IDs. Owned copies must not shadow those IDs or create
    // a second keyboard/accessibility target inside their labelled button.
    for(const node of [icon,...icon.querySelectorAll('[id]')])node.removeAttribute('id');
    return icon;
  };
  const themeActive = () => getComputedStyle(document.documentElement).getPropertyValue('--tsix-stream-stage-api').trim() === '1';
  const playerActive = (node, session) => !!node?.querySelector('video') || !!session?.isJoining ||
    (session?.isInbound===true && session.status===4) ||
    (session?.isInbound===false && [3,4].includes(session.captureStatus));
  // beta5 replaced layoutStreams/streamRefs with payload tiles. Read either
  // model without installing aliases or replacing native sessions/components.
  function layoutState(vm) {
    if (Array.isArray(vm.layoutStreams) && Array.isArray(vm.allSessions)) return {
      sessions:vm.allSessions, viewers:vm.layoutViewers,
      tiles:vm.layoutStreams.map(t=>{const session=t.item.item,node=vm.streamRefs?.[session.uniqueIdentifier];return{id:t.item.uniqueIdentifier,session,active:playerActive(node,session),focused:!!t.focused,x:t.x,w:t.w,y:t.y,h:t.h,node}}), drag:!!vm.inDragStream
    };
    if (!Array.isArray(vm.flatTiles) || !Array.isArray(vm.sortableStreamsContainer?.sortedStreams) ||
        typeof vm.refForTile !== 'function' || typeof vm.isFocused !== 'function' ||
        typeof vm.isStreamVisible !== 'function') return null;
    const video=vm.flatTiles.filter(t=>t.tile.payload.kind==='video');
    return {
      sessions:vm.sortableStreamsContainer.sortedStreams.filter(s=>typeof s.isInbound==='boolean' && vm.isStreamVisible(s)),
      viewers:vm.flatTiles.filter(t=>t.tile.payload.kind!=='video' || t.pip),
      tiles:video.map(t=>{const node=vm.refForTile(t.tile),session=t.tile.payload.session;return{id:t.tile.id,session,active:playerActive(node,session),focused:vm.isFocused(t.tile),x:t.x,w:t.w,y:t.y,h:t.h,node}}),
      drag:!!vm.inDragTile
    };
  }
  function schedule() {
    if (queued || disposed) return;
    queued = true;
    // Vue/native ResizeObservers may publish new geometry during delivery.
    // Reconcile on the next frame rather than writing layout in that cycle.
    frame = requestAnimationFrame(() => { frame = 0; queued = false; if (!disposed) sync(); });
  }
  function restoreTiles(record) {
    for (const [node, before] of record.tiles) {
      for (const [key, value] of Object.entries(before)) {
        if (value === null) node.removeAttribute(key); else node.setAttribute(key, value);
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
    const {element, vm} = record;
    const focused = state?.tiles.find(tile => tile.focused);
    // Layout refs are keyed by native session identifiers. Never reorder tiles
    // or change the session list: hiding a preview must not leave its stream.
    const hero = focused?.node;
    const wrapper = hero?.parentElement?.closest('.screen-grid-wrapper');
    const canToggle = active && state.sessions.length > 1 && !state.viewers.length && focused?.active && wrapper && !state.drag;
    const collapsed = trayCollapsed;
    const retainedToggle = record.toggle;
    if (!canToggle || document.fullscreenElement) {
      clearTray(record);
      syncChatRail(record,active);
      return;
    }
    const nodes=new Set(state.tiles.map(t=>t.node));
    for(const [node,before] of record.tiles)if(!nodes.has(node)){for(const [key,value]of Object.entries(before))setAttr(node,key,value);record.tiles.delete(node)}
    for (const tile of state.tiles) {
      const node = tile.node;
      if (!node) continue;
      if(!record.tiles.has(node))record.tiles.set(node,Object.fromEntries(['data-tsix-tray-tile','inert'].map(key=>[key,node.getAttribute(key)])));
      setAttr(node,'data-tsix-tray-tile',node===hero?'focused':'preview');
      setAttr(node,'inert',collapsed&&node!==hero?'':record.tiles.get(node).inert);
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
        try { localStorage.setItem(preferenceKey, String(trayCollapsed)); } catch { /* Toggling still works for this renderer session. */ }
        sync();
      });
      wrapper.parentElement.querySelector('.screenshare__global-hover-actions-wrapper:last-child')?.append(record.toggle);
    }
    const label = collapsed ? 'Show other streams' : 'Hide other streams';
    setAttr(record.toggle,'aria-label',label);setAttr(record.toggle,'title',label);setAttr(record.toggle,'aria-expanded',!collapsed);
    const host=wrapper.parentElement.querySelector('.screenshare__global-hover-actions-wrapper:last-child');
    if(!host){clearTray(record);syncChatRail(record,active);return}
    if(record.toggle.parentElement!==host)host.append(record.toggle);
    const previews=state.tiles.filter(t=>t!==focused);
    const side=previews.some(t=>t.x>=focused.x+focused.w-2);
    setAttr(record.toggle,'data-tsix-tray-axis',side?'horizontal':'vertical');
    const height=vm.gridHeight??vm.maximumVideoHeight;
    const center=collapsed?height/2:(Math.min(...previews.map(t=>t.y))+Math.max(...previews.map(t=>t.y+t.h)))/2;
    const offset=`${Math.round(center/Math.max(1,height)*10000)/100}%`;
    if(record.toggle.style.getPropertyValue('--tsix-tray-position')!==offset)record.toggle.style.setProperty('--tsix-tray-position',offset);
    setAttr(element,trayMarker,collapsed?'collapsed':'expanded');
    syncChatRail(record,active);
  }
  function clearChatRail(record){
    record.chatResize?.disconnect();record.chatResize=null;
    if(record.chatHost){
      if(record.chatHostBefore===null)record.chatHost.removeAttribute('data-tsix-chat-host');
      else record.chatHost.setAttribute('data-tsix-chat-host',record.chatHostBefore);
      record.chatHost=null;
    }
  }
  function syncChatRail(record,enabled){
    const bar=record.chatToolbar;if(!bar)return;
    const button=bar.firstChild,row=record.element.querySelector('.screen-grid-wrapper')?.parentElement;
    const host=enabled&&!document.fullscreenElement?row?.querySelector(':scope > .screenshare__global-hover-actions-wrapper:last-child'):null;
    const native=document.querySelector('svg[name="mode-chat"]');
    if(!host||(!record.chatIcon&&!native)){
      clearChatRail(record);bar.removeAttribute('data-tsix-chat-rail');
      const label=button.getAttribute('aria-label');if(button.textContent!==label)button.textContent=label;
      if(bar.parentElement!==record.element)record.element.insertBefore(bar,record.element.querySelector(':scope > .tsv-body'));
      return;
    }
    if(record.chatHost!==host){
      clearChatRail(record);record.chatHost=host;record.chatHostBefore=host.getAttribute('data-tsix-chat-host');host.setAttribute('data-tsix-chat-host','');
      record.chatResize=new ResizeObserver(schedule);record.chatResize.observe(host);
    }
    if(!record.chatIcon){
      record.chatIcon=cloneIcon(native);record.chatIcon.setAttribute('data-tsix-chat-icon','');
    }
    if(button.firstChild!==record.chatIcon)button.replaceChildren(record.chatIcon);
    if(bar.parentElement!==host)host.append(bar);
    if(!bar.hasAttribute('data-tsix-chat-rail'))bar.setAttribute('data-tsix-chat-rail','');
    const toggle=record.toggle,r=host.getBoundingClientRect();
    const y=toggle?.isConnected?toggle.getBoundingClientRect().bottom-r.top+8:r.height/2-14;
    const top=Math.round(Math.max(4,Math.min(y,r.height-32)))+'px';
    if(bar.style.getPropertyValue('--tsix-chat-top')!==top)bar.style.setProperty('--tsix-chat-top',top);
  }
  function update(record, enabled) {
    const {element, vm} = record;
    syncChatLayout(record, enabled);
    const state = layoutState(vm);
    const active = enabled && state?.sessions.length > 0 && vm.showStreams &&
      vm.screenshareViewingSupported && !vm.isGridOpenedInPopup && !vm.isPopout;
    const chat = element.querySelector('.ts-chat-container');
    const hasChat = !!chat;
    const playing = state?.tiles.some(tile => tile.active);
    const previewOnly = active && !playing && state.viewers.length === 0;
    // beta5 inserts a portal and display:contents context between fullArea
    // and the row. Mark the actual region rather than assuming beta4's DOM.
    if (active) {
      const grid = element.querySelector('.screen-grid-wrapper');
      const region = [...vm.$refs.fullArea.children].find(node => node.contains(grid));
      const current = new Set([region,grid?.parentElement]);
      for(const [node,attrs] of record.layoutNodes)if(!current.has(node)){for(const [key,value]of attrs){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)}record.layoutNodes.delete(node)}
      for (const [node, key] of [[region,'data-tsix-stream-region'],[grid?.parentElement,'data-tsix-stream-row']]) {
        if (!node) continue;
        if (!record.layoutNodes.has(node)) record.layoutNodes.set(node,new Map());
        const attrs=record.layoutNodes.get(node);if(!attrs.has(key))attrs.set(key,node.getAttribute(key));
        if (!node.hasAttribute(key)) node.setAttribute(key,'');
      }
    } else restoreLayoutNodes(record);
    if (active && hasChat) {
      if (!record.chatToolbar) {
        const bar = document.createElement('div'), button = document.createElement('button');
        bar.setAttribute('data-tsix-stream-toolbar',''); button.type = 'button'; button.setAttribute('data-tsix-chat-toggle','');
        button.addEventListener('click',event=>{event.stopPropagation();chatVisible=!chatVisible;try{localStorage.setItem(chatPreferenceKey,String(chatVisible))}catch{}sync()});
        for(const type of ['pointerdown','mousedown','dblclick'])button.addEventListener(type,event=>event.stopPropagation());
        bar.append(button); element.insertBefore(bar,element.querySelector(':scope > .tsv-body'));
        record.chatToolbar = bar;
      }
      syncChatVisibility(record, chat, !chatVisible);
      setAttr(element,'data-tsix-chat',chatVisible?'shown':'hidden');
      const button=record.chatToolbar.firstChild,label=chatVisible?'Hide chat':'Show chat';
      if(!record.chatToolbar.hasAttribute('data-tsix-chat-rail')&&button.textContent!==label)button.textContent=label;
      setAttr(button,'aria-label',label);setAttr(button,'title',label);setAttr(button,'aria-expanded',chatVisible);
    } else { syncChatVisibility(record, null, false); clearChatRail(record);record.chatToolbar?.remove(); record.chatToolbar=null; element.removeAttribute('data-tsix-chat'); }
    // Native fullscreen mode changes before requestFullscreen completes.
    // Stop allocating pane heights during that transition as well.
    if (document.fullscreenElement || vm.item?.layoutMode?.kind==='fullscreen' || vm.presented) { element.removeAttribute(marker);element.removeAttribute(layoutMarker);updateTray(record, false,state);syncFocusActions(record,false,state);return; }
    syncFocusActions(record,active,state);
    if (active && typeof vm.resizeVideoHeightOrigin==='number' && vm.resizeVideoHeightOrigin!==-1) {
      record.resizing=true;record.dragSplit=vm.overrideSplitPercentage;updateTray(record,active,state);return;
    }
    if(record.resizing){record.resizing=false;if(Number.isFinite(record.dragSplit)&&record.dragSplit>=0)record.savedSplit=record.dragSplit}
    let changed = false;
    if (active) {
      if (record.savedSplit === null) record.savedSplit = vm.overrideSplitPercentage;
      const unit=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tsix-unit'))||15;
      const nativeSplit=record.savedSplit===-1?vm.maxVideoAreaHeightPct:record.savedSplit;
      const height=Math.max(1,vm.maximumHeight);
      const chatMin=Math.min(unit*14,Math.max(80,height*.4));
      const chatLimit=Math.max(0,height-chatMin-8);
      const single=state.sessions.length===1&&state.tiles.length===1&&!state.viewers.length;
      const collapsedFocus=trayCollapsed&&state.tiles.some(t=>t.focused&&t.active);
      const focusAllocation=(single||collapsedFocus)&&record.savedSplit===-1?chatLimit:Math.min(height*nativeSplit,chatLimit);
      const limit=chatVisible&&hasChat?focusAllocation:height;
      // Joining changes the content of the stage, not its size. Reserve the
      // same chat budget and player frame before and after opening a stream.
      const footerHeight=record.actionDock?.footer?.hasAttribute('data-tsix-footer-grid')?
        record.actionDock.footer.getBoundingClientRect().height:0;
      const videoHeight=Math.max(0,limit-footerHeight);
      // Retain the native content-sized grid when it already leaves room for
      // chat. Forcing an explicit split otherwise adds a large empty block.
      const nativeAuto=!footerHeight&&chatVisible&&hasChat&&!single&&!collapsedFocus&&record.savedSplit===-1&&limit>=height*nativeSplit-.1;
      const split=nativeAuto?-1:videoHeight/height;
      const minValue=`${chatMin}px`;
      if(element.style.getPropertyValue('--tsix-chat-min-height')!==minValue)element.style.setProperty('--tsix-chat-min-height',minValue);
      if (vm.overrideSplitPercentage !== split) { vm.overrideSplitPercentage = split; changed = true; }
      if (vm.maximumHeight > 0 && Math.abs(vm.maximumVideoHeight-videoHeight)>.1) {
        vm.maximumVideoHeight = videoHeight; changed = true;
      }
    } else if (record.savedSplit !== null) {
      vm.overrideSplitPercentage = record.savedSplit;
      record.savedSplit = null;
      vm.maximumVideoHeight = vm.maximumHeight * (vm.overrideSplitPercentage === -1 ? vm.maxVideoAreaHeightPct : vm.overrideSplitPercentage);
      changed = true;
    }
    if (changed && vm.maximumWidth > 0 && vm.maximumHeight > 0) vm.doUpdateGrid();
    const stage = active && state.tiles.length ? (previewOnly ? 'preview' :
      (state.sessions.length === 1 && state.tiles.length === 1 && state.viewers.length === 0 && !state.drag ? 'single' : 'multiple')) : null;
    if (stage) { if (element.getAttribute(marker) !== stage) element.setAttribute(marker, stage); }
    else element.removeAttribute(marker);
    setAttr(element,layoutMarker,stage?(state.sessions.length===1&&state.tiles.length===1&&!state.viewers.length&&!state.drag?'single':'grid'):null);
    updateTray(record, active,state);
  }
  // Keep Vue's native action nodes in place. Owned buttons in the bottom strip
  // forward to those handlers using the visible button's coordinates (menus
  // otherwise open at 0,0). Never move a Vue-owned node between components.
  function syncActionDock(record, enabled) {
    const {element}=record;
    const row=element.querySelector('[data-tsix-stream-row]')||element.querySelector('.screen-grid-wrapper')?.parentElement;
    const sources=row?[...row.querySelectorAll(':scope > .screenshare__global-hover-actions-wrapper:last-child > .screenshare__global-hover-actions')]:[];
    if(!enabled||!record.vm.showStreams||record.vm.isGridOpenedInPopup||document.fullscreenElement||record.vm.presented||record.vm.item?.layoutMode?.kind==='fullscreen'||!sources.length){clearActionDock(record);return}
    const players=[...row.querySelectorAll('.screen-grid > :is(.screen-video-wrapper,.screen-tile-wrapper) > .video-stream')];
    const emptyContainer=!players.length&&row.querySelector(':scope > .screen-grid-wrapper.is-empty');
    const empty=!!emptyContainer;
    const focused=players.find(p=>p.closest('[data-tsix-tray-tile="focused"]'));
    const player=players.length===1?players[0]:focused;
    const nativeBar=player?.querySelector('.screen-overlay__bottom');
    let dock=record.actionDock;
    if(!dock){
      const group=document.createElement('div');group.setAttribute('data-tsix-view-actions','');group.setAttribute('role','group');group.setAttribute('aria-label','Stream view controls');
      for(const type of ['click','dblclick','mousedown','pointerdown'])group.addEventListener(type,e=>e.stopPropagation());
      for(const type of ['keydown','keyup'])group.addEventListener(type,e=>{if(['Enter',' '].includes(e.key))e.stopPropagation()});
      dock=record.actionDock={group,footer:null,buttons:new Map(),sources:new Map()};
    }
    // An all-hidden viewer has no video footer to dock into. Keep its restore
    // menu beside the native empty message, without an orphaned player bar.
    if(dock.emptyRow&&(!empty||dock.emptyRow!==row))clearEmptyDock(dock);
    if(empty&&dock.emptyRow!==row){
      dock.emptyRow=row;dock.emptyRowBefore=row.getAttribute('data-tsix-empty-stream-row');
      setAttr(row,'data-tsix-empty-stream-row','');
    }
    let host=emptyContainer||nativeBar;
    if(!host){
      const parent=player||row.parentElement;
      if(!dock.footer){dock.footer=document.createElement('div');dock.footer.setAttribute('data-tsix-stream-footer','')}
      setAttr(dock.footer,'data-tsix-footer-grid',player?null:'');
      if(dock.footer.parentElement!==parent)parent.append(dock.footer);
      host=dock.footer;
    }
    if(dock.group.parentElement!==host)host.append(dock.group);
    if(nativeBar||empty){dock.footer?.remove();dock.footer=null}
    const seen=new Set();
    // The native player already supplies pop-out. Only offer the viewer-level
    // equivalent when no visible player's own pop-out exists.
    const hasPlayerPopout=players.some(p=>!p.closest('[inert]')&&p.querySelector('.screen-overlay__bottom .tsv-button svg[name="expand"]'));
    for(const source of sources){
      if(!dock.sources.has(source))dock.sources.set(source,source.getAttribute('data-tsix-source-actions'));
      setAttr(source,'data-tsix-source-actions','');
      const native=source.querySelector('.tsv-button'),icon=native?.querySelector('svg[name]'),name=icon?.getAttribute('name');
      if(!native||!['dots','expand'].includes(name)||(name==='expand'&&(empty||hasPlayerPopout)))continue;
      seen.add(source);
      let entry=dock.buttons.get(source);
      if(!entry||entry.native!==native){
        entry?.button.remove();
        const button=document.createElement('button');button.type='button';button.setAttribute('data-tsix-view-action',name);
        button.setAttribute('aria-label',labels[name]);button.title=labels[name];button.append(cloneIcon(icon));
        if(name==='dots')button.setAttribute('aria-haspopup','menu');
        button.addEventListener('click',e=>{
          e.stopPropagation();if(button.disabled||controlDisabled(native)||!native.isConnected)return;
          const b=button.getBoundingClientRect();
          const point={target:button,currentTarget:button,clientX:b.x+b.width/2,clientY:b.y+b.height/2};
          // The native overlay manager also owns its event.target. Dispatching
          // on the hidden source immediately dismisses its menu. Keep the
          // visible button as that owner, including keyboard activation.
          if(typeof native.__vue__?.clicked==='function')native.__vue__.clicked(point);
          else native.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,...point}));
        });
        dock.buttons.set(source,entry={native,button});dock.group.append(button);
      }
      const disabled=controlDisabled(native);
      if(entry.button.disabled!==disabled)entry.button.disabled=disabled;
    }
    for(const [source,entry]of dock.buttons)if(!seen.has(source)){entry.button.remove();dock.buttons.delete(source)}
    for(const [source,before]of dock.sources)if(!sources.includes(source)){setAttr(source,'data-tsix-source-actions',before);dock.sources.delete(source)}
  }
  function clearEmptyDock(dock){
    if(!dock.emptyRow)return;
    setAttr(dock.emptyRow,'data-tsix-empty-stream-row',dock.emptyRowBefore);dock.emptyRow=null;
  }
  function clearActionDock(record){
    const dock=record.actionDock;if(!dock)return;
    clearEmptyDock(dock);
    for(const [source,before]of dock.sources)setAttr(source,'data-tsix-source-actions',before);
    dock.group.remove();dock.footer?.remove();record.actionDock=null;
  }
  function syncPreviewJoins(enabled) {
    const seen=new Set();
    if(enabled)for(const element of records.keys())for(const preview of element.querySelectorAll('.video-stream > .stream-preview.is-joinable')){
      const vm=preview.parentElement.__vue__,host=preview.querySelector('.stream-preview__user-card')||preview;
      if(!vm?.session?.isInbound||!vm.session.isJoinable||typeof vm.onJoin!=='function')continue;
      if(joins.has(preview)&&joins.get(preview).vm!==vm){joins.get(preview).button.remove();joins.delete(preview)}
      seen.add(preview);
      if(!joins.has(preview)){
        const button=document.createElement('button');button.type='button';button.textContent='Watch stream';button.setAttribute('data-tsix-preview-join','');
        button.addEventListener('click',event=>{event.stopPropagation();if(vm.session.isJoinable)vm.onJoin()});
        for(const type of ['mousedown','pointerdown','keydown','keyup'])button.addEventListener(type,event=>event.stopPropagation());
        joins.set(preview,{vm,button});host.append(button);
      }else if(joins.get(preview).button.parentElement!==host)host.append(joins.get(preview).button);
    }
    for(const [preview,record]of joins)if(!seen.has(preview)){record.button.remove();joins.delete(preview)}
  }
  const streamControl=target=>target?.closest?.('button,input,a,select,textarea,[role="button"],[role="slider"],.tsv-button,.ts-slider,.screen-overlay__bottom');
  function syncFocusActions(record,enabled,state) {
    const seen=new Set();
    if(enabled)for(const tile of state.tiles) {
      const node=tile.node?.querySelector('.video-stream'),vm=node?.__vue__;
      if(!tile.active||!vm||typeof vm.enterFocusModeAfterDelay!=='function'||typeof vm.toggleFullscreen!=='function'||(state.tiles.length<2&&!tile.focused))continue;
      seen.add(node);
      if(!record.focusActions.has(node)) {
        const before=Object.fromEntries(['role','tabindex','aria-label','aria-keyshortcuts'].map(k=>[k,node.getAttribute(k)]));
        const originalFocus=vm.enterFocusModeAfterDelay,originalFullscreen=vm.toggleFullscreen;
        let origin=null,moved=false,armed=false,previousMode,hasPreviousMode=false;
        const down=e=>{origin=[e.clientX,e.clientY];moved=false};
        const up=e=>{if(origin)moved=Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>5;origin=null};
        const focus=e=>{
          if(!themeActive()||document.fullscreenElement)return originalFocus.call(vm,e);
          if(node.closest('[inert]')||streamControl(e?.target)||e?.detail>1||moved||record.vm.inDragTile||record.vm.inDragStream)return;
          if(vm._dblClickTimeout){clearTimeout(vm._dblClickTimeout);vm._dblClickTimeout=null}
          previousMode=record.vm.item?.layoutMode;hasPreviousMode=true;
          const keepFocused=e?.type==='click'&&!!layoutState(record.vm)?.tiles.some(t=>t.focused&&t.node?.contains(node));
          // An immediate focus move can put a different tile under the second
          // click. Remember the originating player, not the later hit target.
          record.focusClick=e?.isTrusted&&e.type==='click'&&e.detail===1?
            {time:performance.now(),x:e.clientX,y:e.clientY,node,session:vm.session,vm,mode:previousMode,fullscreen:originalFullscreen,stationary:keepFocused}:null;
          // A focused surface stays focused. Only an explicit keyboard action
          // returns to the grid; native auto layout can promote our own stream.
          // Keep the first-click record so a double-click still enters fullscreen.
          if(keepFocused)return;
          vm.$emit('enter-focus-mode',vm.session);
          // Commit destination geometry in the click turn, before Vue paints
          // the native layout, rather than correcting it a frame afterward.
          update(record,true);
        };
        const fullscreen=e=>{if(themeActive()&&(node.closest('[inert]')||streamControl(e?.target)))return;if(e?.type==='dblclick'&&hasPreviousMode&&record.vm.item)record.vm.item.layoutMode=previousMode;hasPreviousMode=false;previousMode=undefined;return originalFullscreen.call(vm,e)};
        const keydown=e=>{if(e.target!==node||!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.repeat)return;if(e.key==='Enter'){moved=false;focus(e)}else armed=true};
        const keyup=e=>{if(e.target===node&&e.key===' '){e.preventDefault();e.stopPropagation();if(armed){moved=false;focus(e)}armed=false}};
        const blur=()=>{armed=false};
        vm.enterFocusModeAfterDelay=focus;vm.toggleFullscreen=fullscreen;
        node.addEventListener('pointerdown',down,true);node.addEventListener('pointerup',up,true);node.addEventListener('keydown',keydown);node.addEventListener('keyup',keyup);node.addEventListener('blur',blur);
        record.focusActions.set(node,{vm,before,originalFocus,originalFullscreen,focus,fullscreen,down,up,keydown,keyup,blur});
      }
      setAttr(node,'role','group');setAttr(node,'tabindex','0');setAttr(node,'aria-label',tile.focused?'Focused stream. Enter to return to grid':'Stream. Enter to focus');setAttr(node,'aria-keyshortcuts','Enter Space');
    }
    for(const [node,r]of record.focusActions)if(!seen.has(node))releaseFocus(record,node,r);
  }
  function releaseFocus(record,node,r) {
    if(r.vm.enterFocusModeAfterDelay===r.focus)r.vm.enterFocusModeAfterDelay=r.originalFocus;
    if(r.vm.toggleFullscreen===r.fullscreen)r.vm.toggleFullscreen=r.originalFullscreen;
    for(const [type,fn,capture]of [['pointerdown',r.down,true],['pointerup',r.up,true],['keydown',r.keydown],['keyup',r.keyup],['blur',r.blur]])node.removeEventListener(type,fn,capture);
    for(const [key,value]of Object.entries(r.before))setAttr(node,key,value);
    record.focusActions.delete(node);
  }
  function installFocusGestures(record) {
    const nearby=(saved,e)=>saved&&performance.now()-saved.time<400&&Math.hypot(e.clientX-saved.x,e.clientY-saved.y)<=5;
    record.captureClick=e=>{
      const first=record.focusClick;record.focusClick=null;
      if(!e.isTrusted||e.detail===0||(first?.stationary&&e.detail<2)||!nearby(first,e)||!record.element.contains(e.target)||
          !themeActive()||document.fullscreenElement||first.vm._isDestroyed||!first.node.isConnected||first.vm.session!==first.session||
          first.node.closest('[inert]')||record.vm.inDragTile||record.vm.inDragStream||
          (!e.target.closest('.video-stream')&&(first.stationary||!e.target.closest('.screen-grid-wrapper')))||streamControl(e.target))return;
      e.preventDefault();e.stopImmediatePropagation();
      record.fullscreenClick={time:performance.now(),x:e.clientX,y:e.clientY};
      if(record.vm.item)record.vm.item.layoutMode=first.mode;
      first.fullscreen.call(first.vm,e);
    };
    record.captureDouble=e=>{
      if(nearby(record.fullscreenClick,e)){e.preventDefault();e.stopImmediatePropagation()}
      record.fullscreenClick=null;
    };
    document.addEventListener('click',record.captureClick,true);
    document.addEventListener('dblclick',record.captureDouble,true);
  }
  function restoreLayoutNodes(record) {
    for(const [node,attrs] of record.layoutNodes)for(const [key,value]of attrs){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)}
    record.layoutNodes.clear();
    if(record.chatMinBefore)record.element.style.setProperty('--tsix-chat-min-height',record.chatMinBefore);else record.element.style.removeProperty('--tsix-chat-min-height');
  }
  // beta5's virtual list writes row geometry from both ResizeObservers. A
  // fullscreen portal resize can therefore resize a shallower observed row
  // during delivery. Keep its native validation/scroll anchoring, but perform
  // the transactions once per frame, outside observer delivery.
  function deferChatLayout(controller) {
    const originalMeasure=controller.measure,originalRefresh=controller.refreshLayout;
    const descriptors=Object.fromEntries(['measure','refreshLayout'].map(k=>[k,Object.getOwnPropertyDescriptor(controller,k)]));
    let frame=0,rows=new Map(),layout=false,dead=false;
    const flush=()=>{
      frame=0;const pending=[...rows.values()],refresh=layout;rows.clear();layout=false;
      if(dead||controller.disposed||!controller.rootElement?.isConnected)return;
      if(refresh)originalRefresh.call(controller);
      if(pending.length)originalMeasure.call(controller,pending);
    };
    const queue=()=>{if(!dead&&!frame)frame=requestAnimationFrame(flush)};
    const measure=entries=>{
      if(dead||controller.disposed)return;
      for(const entry of entries){
        // A late callback from a recycled row must not replace an already
        // queued current measurement. Native measure validates again at flush.
        if(rows.has(entry.key)){
          const geometry=controller.engine.geometry,index=geometry.indexOf(entry.key);
          if(index<0||geometry.versionAt(index)!==entry.version||geometry.epoch!==entry.epoch)continue;
        }
        rows.set(entry.key,entry);
      }
      queue();
    };
    const refreshLayout=()=>{if(dead||controller.disposed)return;controller.layoutDirty=true;layout=true;queue()};
    controller.measure=measure;controller.refreshLayout=refreshLayout;
    return {controller,dispose(){
      if(dead)return;if(frame)cancelAnimationFrame(frame);flush();dead=true;
      for(const [key,owned]of [['measure',measure],['refreshLayout',refreshLayout]])if(controller[key]===owned){
        if(descriptors[key])Object.defineProperty(controller,key,descriptors[key]);else delete controller[key];
      }
    }};
  }
  function syncChatVisibility(record, chat, hidden) {
    const previous = record.hiddenChat;
    if (previous && (previous.node !== chat || !hidden)) {
      for (const [key,value] of Object.entries(previous.attributes)) setAttr(previous.node,key,value);
      if (previous.height) previous.node.style.setProperty('--tsix-hidden-chat-height',previous.height,previous.priority);
      else previous.node.style.removeProperty('--tsix-hidden-chat-height');
      record.hiddenChat = null;
    }
    if (!hidden || !chat || record.hiddenChat) return;
    const height = chat.getBoundingClientRect().height;
    record.hiddenChat = {node:chat, attributes:Object.fromEntries(['inert','aria-hidden'].map(key=>[key,chat.getAttribute(key)])),
      height:chat.style.getPropertyValue('--tsix-hidden-chat-height'), priority:chat.style.getPropertyPriority('--tsix-hidden-chat-height')};
    // A measurable viewport lets the native virtual list keep rendering new
    // rows and following the bottom while the panel is visually hidden.
    if (height > 0) chat.style.setProperty('--tsix-hidden-chat-height',`${height}px`);
    setAttr(chat,'inert','');setAttr(chat,'aria-hidden','true');
  }
  function syncChatLayout(record, enabled) {
    const chat=record.element.querySelector('.ts-chat-container')?.__vue__;
    const controller=enabled?chat?.getVirtualList?.()?.getController?.():null;
    if(record.chatLayout?.controller===controller)return;
    record.chatLayout?.dispose();record.chatLayout=null;
    if(controller&&!controller.disposed&&typeof controller.measure==='function'&&typeof controller.refreshLayout==='function'&&controller.engine?.geometry)record.chatLayout=deferChatLayout(controller);
  }
  function release(record) {
    record.unwatch();
    clearChatRail(record);
    clearActionDock(record);
    record.chatLayout?.dispose();
    syncChatVisibility(record, null, false);
    document.removeEventListener('click',record.captureClick,true);
    document.removeEventListener('dblclick',record.captureDouble,true);
    for(const [node,r]of record.focusActions)releaseFocus(record,node,r);
    restoreLayoutNodes(record);
    clearTray(record);
    record.chatToolbar?.remove(); record.element.removeAttribute('data-tsix-chat');
    // Restore only our transient layout inputs, never media/session state.
    if (record.savedSplit !== null && !record.vm._isDestroyed) {
      record.vm.overrideSplitPercentage = record.savedSplit;
      record.vm.maximumVideoHeight = record.vm.maximumHeight * (record.savedSplit === -1 ? record.vm.maxVideoAreaHeightPct : record.savedSplit);
      if (!document.fullscreenElement) record.vm.doUpdateGrid();
    }
    if (record.beforeMarker === null) record.element.removeAttribute(marker);
    else record.element.setAttribute(marker, record.beforeMarker);
    setAttr(record.element,layoutMarker,record.beforeLayoutMarker);
    records.delete(record.element);
  }
  function releaseButton(node, record) {
    node.removeEventListener('keydown', record.keydown);
    node.removeEventListener('keyup', record.keyup);
    node.removeEventListener('blur', record.blur);
    for (const [key,value] of Object.entries(record.before)) {
      if (value === null) node.removeAttribute(key); else node.setAttribute(key,value);
    }
    buttons.delete(node);
  }
  function syncButtons(enabled) {
    const seen = new Set();
    if (enabled) for (const element of new Set([...records.keys(),...document.querySelectorAll('.tsv-screenshare-portal-ctx')])) {
      for (const node of element.querySelectorAll(':is(.screen-video-wrapper, .screen-tile-wrapper) .tsv-button, .screenshare__global-hover-actions-wrapper .tsv-button')) {
        const icon = node.querySelector('svg[name]')?.getAttribute('name');
        const label = icon === 'stream-shutdown' ?
          (node.closest('.video-stream')?.__vue__?.session?.isInbound ? 'Leave stream' : 'Stop sharing') : labels[icon];
        if (!label || node.tagName === 'BUTTON') continue;
        seen.add(node);
        if (!buttons.has(node)) {
          const before = Object.fromEntries(attrs.map(key=>[key,node.getAttribute(key)]));
          const activate = () => {
            if (controlDisabled(node) || node.getAttribute('aria-disabled') === 'true') return;
            // Native menus use the click coordinates. HTMLElement.click() uses
            // (0,0), sending keyboard-opened menus to the opposite window corner.
            const rect = node.getBoundingClientRect();
            node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true,
              view:window, clientX:rect.left + rect.width / 2, clientY:rect.top + rect.height / 2}));
          };
          let pressed = false;
          const keydown = event => {
            if (event.target !== node || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault(); event.stopPropagation();
            if (event.repeat) return;
            if (event.key === 'Enter') activate(); else pressed = true;
          };
          const keyup = event => { if (event.target === node && event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (pressed) activate(); pressed = false; } };
          const blur = () => { pressed = false; };
          node.addEventListener('keydown',keydown); node.addEventListener('keyup',keyup); node.addEventListener('blur',blur);
          buttons.set(node,{before,keydown,keyup,blur});
        }
        const disabled = controlDisabled(node);
        setAttr(node,'role','button');setAttr(node,'tabindex',disabled?'-1':'0');
        setAttr(node,'aria-label',label);setAttr(node,'title',label);setAttr(node,'aria-disabled',disabled);
      }
    }
    for (const [node,record] of buttons) if (!seen.has(node)) releaseButton(node,record);
  }
  function sync() {
    if (disposed) return;
    const enabled = themeActive();
    broadcast.sync(enabled);
    const live = new Set(document.querySelectorAll('.tsv-screenshare'));
    for (const element of live) {
      const vm = element.__vue__;
      if (!vm || vm._isDestroyed || vm.isPopout || typeof vm.doUpdateGrid !== 'function' ||
          typeof vm.overrideSplitPercentage !== 'number' || !vm.$refs.fullArea || !layoutState(vm)) continue;
      if (!records.has(element)) {
        const record = {element,vm,savedSplit:null,beforeMarker:element.getAttribute(marker),beforeLayoutMarker:element.getAttribute(layoutMarker),tiles:new Map(),toggle:null,layoutNodes:new Map(),focusActions:new Map(),chatMinBefore:element.style.getPropertyValue('--tsix-chat-min-height')};
        installFocusGestures(record);
        record.unwatch = vm.$watch(() => {
          const s=layoutState(vm);
          return [s?.sessions.length,s?.viewers.length,s?.drag,vm.maximumWidth,vm.maximumHeight,
            vm.isGridOpenedInPopup,vm.showStreams,vm.screenshareViewingSupported,vm.resizeVideoHeightOrigin,vm.overrideSplitPercentage,
            vm.presented,vm.fullscreenTileId,vm.item?.layoutMode?.kind,
            ...(s?.tiles||[]).map(t=>`${t.id}:${t.focused}:${t.active}:${t.x}:${t.w}:${t.y}:${t.h}`)].join(':');
        }, schedule);
        records.set(element,record);
      }
      update(records.get(element),enabled);
      syncActionDock(records.get(element),enabled);
    }
    for (const [element,record] of records) if (!live.has(element) || record.vm._isDestroyed) release(record);
    syncButtons(enabled);
    syncVolumes(enabled);
    syncPreviewJoins(enabled);
  }
  function syncVolumes(enabled) {
    const seen = new Set();
    if (enabled) for (const element of new Set([...records.keys(),...document.querySelectorAll('.tsv-screenshare-portal-ctx')])) {
      for (const slider of element.querySelectorAll('.screen-overlay__hero-actions__action-volume-slider:not(input)')) {
        const vm = slider.closest('.video-stream')?.__vue__;
        if (!vm?.session?.isInbound || !vm.$watch || !vm.videoRef || typeof vm.volume !== 'number' || typeof vm.onConnectionRef !== 'function') continue;
        if(!volumes.has(slider)) {
          // Let native metadata and portal measurement settle before
          // enhancing the slider; existing controls keep their gain state.
          if(vm.videoRef.readyState<2)continue;
          if(!volumeReady.has(slider)) {
            if(!volumeFrames.has(slider))volumeFrames.set(slider,requestAnimationFrame(()=>{volumeFrames.delete(slider);volumeReady.add(slider);schedule()}));
            continue;
          }
        }
        if (volumes.has(slider) && volumes.get(slider).session !== vm.session) {
          volumes.get(slider).dispose(); volumes.delete(slider);
        }
        seen.add(slider);
        if (!volumes.has(slider)) volumes.set(slider, createVolume(slider, vm, volumeHandoffs));
      }
    }
    for (const [slider, control] of volumes) if (!seen.has(slider)) {
      control.dispose(); volumes.delete(slider);
    }
  }
  function createVolume(slider, vm, handoffs = new WeakMap()) {
    const session = vm.session, before = slider.getAttribute('data-tsix-native-volume');
    // The hidden native 0..100 slider emits its clamped model value on mute
    // changes. Detach that model listener while our range owns volume, or
    // unmuting silently writes 100% back over the native 300% gain.
    let sliderVm = slider.__vue__;
    while (sliderVm?.$parent?.$el === slider) sliderVm = sliderVm.$parent;
    const modelListeners = [...(sliderVm?._events?.input || [])];
    for (const listener of modelListeners) sliderVm.$off('input', listener);
    const host = document.createElement('span'), input = document.createElement('input'), value = document.createElement('output');
    host.setAttribute('data-tsix-volume-control', '');
    input.type = 'range'; input.min = '0'; input.max = '300'; input.step = '1';
    input.setAttribute('aria-label', 'Stream volume');
    input.className = 'screen-overlay__hero-actions__action-volume-slider';
    host.append(input, value); slider.after(host); slider.setAttribute('data-tsix-native-volume', '');
    // TS6's custom track contains video only: its stream audio is played by
    // the native session backend, whose volume setter accepts a gain value.
    // Standard audio tracks instead need Web Audio above HTML media's limit.
    const nativeAudio = !vm.videoRef.srcObject?.getAudioTracks().length && typeof navigator.createMediaStreamRequest === 'function';
    let percent = Math.round(Math.max(0, Math.min(nativeAudio ? 3 : 1, session.volume)) * 100);
    let graph = null, epoch = 0, dead = false, handedOff = false;
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
      if (!nativeAudio) return originalRef.call(vm,element);
      vm.videoRef = element;
      if (element && element.srcObject !== vm.mediaStream) {
        vm.mediaStream?.getAudioTracks().forEach(track => { track.enabled = true; });
        element.srcObject = vm.mediaStream;
        vm.internalVolume = Math.max(0,Math.min(100,session.volume*100));
      }
      // Native mute replies can arrive while media is being replaced. Apply
      // the current state even when the ref points at the same media object.
      if(element){const level=session.muted?0:Math.max(0,Math.min(1,session.volume));if(element.volume!==level)element.volume=level}
    };
    if (nativeAudio) vm.onConnectionRef = volumeRef;
    function stopGraph() {
      if (!graph) return;
      const old = graph; graph = null;
      old.source.disconnect(); old.gain.disconnect();
      old.video.removeEventListener('volumechange', reconcile);
      old.video.removeEventListener('play', reconcile); old.video.removeEventListener('pause', reconcile);
      old.context.removeEventListener('statechange', reconcile);
      old.context.close().catch(() => {});
      old.video.volume = session.muted ? 0 : Math.max(0, Math.min(1, session.volume));
    }
    function reconcile() {
      if (dead) return;
      if (nativeAudio) {
        percent = Math.round(Math.max(0, Math.min(3, session.volume)) * 100);
        if(vm.internalVolume!==Math.min(percent,100))vm.internalVolume=Math.min(percent,100);
        const level=session.muted?0:Math.min(1,session.volume);
        if(vm.videoRef&&vm.videoRef.volume!==level)vm.videoRef.volume=level;
        paint(); return;
      }
      if (graph) {
        // Media replacement and device changes fall back to native playback.
        // Never leave an old source playing after TS6 replaces its media.
        if (graph.video !== vm.videoRef || graph.stream !== vm.videoRef?.srcObject ||
            graph.sink !== (vm.videoRef?.sinkId || '') || graph.context.state === 'closed') {
          ++epoch; stopGraph(); percent = Math.min(percent, 100);
        } else {
          graph.gain.gain.value = graph.active && !session.muted && !graph.video.muted && !graph.video.paused ? percent / 100 : 0;
          if (graph.active && graph.video.volume !== 0) graph.video.volume = 0;
        }
      }
      // Respect native volume updates, retaining boost across mute/unmute.
      if (Math.abs(session.volume - Math.min(percent, 100) / 100) > .0001) {
        ++epoch; stopGraph(); percent = Math.round(Math.max(0, Math.min(1, session.volume)) * 100);
      }
      paint();
    }
    async function change() {
      const request = ++epoch, next = Number(input.value);
      input.removeAttribute('title');
      percent = next;
      if (nativeAudio) {
        vm.internalVolume = Math.min(next, 100);
        session.muted = next === 0;
        session.volume = next / 100;
        vm.videoRef.volume = Math.min(next, 100) / 100;
        paint(); return;
      }
      // Keep the native setter inside HTMLMediaElement's legal 0..1 range.
      vm.volume = Math.min(next, 100);
      paint();
      if (next <= 100) { stopGraph(); return; }
      try {
        if (!graph) {
          const video = vm.videoRef, stream = video.srcObject;
          if (!stream?.getAudioTracks().length) throw Error('This stream has no audio track available for amplification');
          const context = new AudioContext(), gain = context.createGain();
          gain.gain.value = 0;
          try {
            const source = context.createMediaStreamSource(stream);
            source.connect(gain); gain.connect(context.destination);
            graph = {video, stream, context, source, gain, sink:video.sinkId || '', active:false};
          } catch (error) { context.close().catch(() => {}); throw error; }
          video.addEventListener('volumechange', reconcile);
          video.addEventListener('play', reconcile); video.addEventListener('pause', reconcile);
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
        pending.active = true; reconcile();
      } catch (error) {
        if (dead || request !== epoch) return;
        stopGraph(); percent = Math.min(percent, 100); paint();
        input.title = `Volume limited to 100%: ${error.message}`;
      }
    }
    // Stop native tile focus/drag handlers while preserving range keyboard use.
    for (const type of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup']) host.addEventListener(type, event => event.stopPropagation());
    input.addEventListener('input', change);
    const unwatch = vm.$watch(() => `${session.volume}:${session.muted}`, reconcile);
    const unwatchMedia = nativeAudio ? () => {} : vm.$watch(() => vm.mediaStream, reconcile);
    const unwatchVideo = nativeAudio ? () => {} : vm.$watch(() => vm.videoRef, reconcile);
    // Fullscreen moves beta5's portal and creates a fresh player. Its first
    // native ref runs before we can enhance it, so keep that initial HTML
    // assignment legal and restore the chosen gain when its control mounts.
    const beforeDestroy=()=>{
      if(!dead&&nativeAudio&&session.status===4&&session.volume>1){
        handoffs.set(session,session.volume);handedOff=true;session.volume=1;
      }
    };
    vm.$on?.('hook:beforeDestroy',beforeDestroy);
    if(nativeAudio&&handoffs.has(session)){
      const gain=handoffs.get(session);handoffs.delete(session);
      if(session.status===4&&session.volume===1){session.volume=gain;percent=Math.round(gain*100);vm.internalVolume=Math.min(percent,100);vm.videoRef.volume=session.muted?0:Math.min(1,gain)}
    }
    paint();
    return {session, dispose() {
      dead = true; ++epoch; stopGraph(); unwatch(); unwatchMedia(); unwatchVideo();
      vm.$off?.('hook:beforeDestroy',beforeDestroy);
      if (nativeAudio && !handedOff && session.volume > 1) {
        session.volume = 1; vm.internalVolume = 100;
        if (vm.videoRef) vm.videoRef.volume = session.muted ? 0 : 1;
      }
      if (vm.onConnectionRef === volumeRef) vm.onConnectionRef = originalRef;
      if (sliderVm && !sliderVm._isDestroyed) for (const listener of modelListeners) {
        if (!sliderVm._events.input?.includes(listener)) sliderVm.$on('input', listener);
      }
      input.removeEventListener('input', change); host.remove();
      if (before === null) slider.removeAttribute('data-tsix-native-volume'); else slider.setAttribute('data-tsix-native-volume', before);
    }};
  }
  function onFullscreenChange() {
    // Native doUpdateGrid deliberately returns while fullscreen is active.
    // Re-run on exit even when its last measured dimensions did not change.
    if (!document.fullscreenElement) for (const {vm} of records.values()) if (!vm._isDestroyed) vm.doUpdateGrid();
    schedule();
  }
  // Read the same unfiltered outbound collection as TS6's stream manager.
  // Its pure computed getter works without opening the menu or calling any
  // media APIs, and remains independent of showOwnStreams / session.hidden.
  function createBroadcast() {
    const root = document.querySelector('.tsv-window'), vm = root?.__vue__;
    if (!vm?.$watch) return {sync() {}, dispose() {}};
    const before = root.getAttribute('data-tsix-broadcast');
    let getter = null, methods = null, unwatch = null, host = null, signature = '', control = null, controlBefore = null;
    const streamKeys = new WeakMap(), streamRows = new Map(), pending = new WeakSet();
    let nextStreamKey = 0;
    const outbound = () => (getter?.call({data:null}) || []).filter(s => s.isInbound === false);
    const anchors = new Set();
    const positionObserver = new ResizeObserver(schedule);
    const controlParts = new Map();
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function positionBadge() {
      const pane = host.parentElement, bounds = pane.getBoundingClientRect();
      const footer = pane.querySelector('.ts-server-status-bar');
      const current = new Set([root, pane, footer, host].filter(Boolean));
      for (const node of anchors) if (!current.has(node)) { positionObserver.unobserve(node); anchors.delete(node); }
      for (const node of current) if (!anchors.has(node)) { anchors.add(node); positionObserver.observe(node); }
      const visible = node => node?.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden';
      const bottom = visible(footer) ? Math.max(8, bounds.bottom - footer.getBoundingClientRect().top + 8) : 8;
      for (const [key, value] of Object.entries({'--tsix-broadcast-bottom':bottom, '--tsix-broadcast-column-width':bounds.width, '--tsix-broadcast-height':host.getBoundingClientRect().height})) {
        const pixels = `${value}px`;
        if (host.style.getPropertyValue(key) !== pixels) host.style.setProperty(key, pixels);
      }
    }
    function snapshot() {
      const sessions = outbound();
      const people = new Map();
      for (const session of sessions) for (const viewer of session.viewers || []) {
        const server = viewer.scHandlerId !== undefined && viewer.clientId !== undefined;
        const key = server ? `server:${viewer.scHandlerId}:${viewer.clientId}` : `chat:${viewer.otherUserId}`;
        if (people.has(key)) continue;
        // FindClient is TS6's in-memory lookup, also used by its viewer modal.
        const handler = session.client?.sc_handler;
        const client = server && String(handler?.id) === String(viewer.scHandlerId) ? handler.FindClient(viewer.clientId) : null;
        const name = client?.displayName || 'Viewer (name unavailable)';
        const avatar = client?.avatarImage;
        people.set(key, {key, name, avatar:avatar?.type === 'url' ? avatar.src : null});
      }
      const streams = sessions.map(session => {
        if (!streamKeys.has(session)) streamKeys.set(session,++nextStreamKey);
        return {key:streamKeys.get(session),name:session.sourceInfo?.name||session.config?.name||'Stream',paused:!!session.paused,
          busy:pending.has(session),open:typeof methods?.goToStream==='function',settings:typeof methods?.openSettings==='function',
          pause:typeof session.setPaused==='function',stop:typeof session.leave==='function'};
      });
      return {count:sessions.length, paused:sessions.length > 0 && sessions.every(s => s.paused), people:[...people.values()],streams};
    }
    function releaseControlPart(node, record) {
      node.removeEventListener('keydown', record.keydown);
      node.removeEventListener('keyup', record.keyup);
      node.removeEventListener('blur', record.blur);
      for (const [key, value] of Object.entries(record.before)) {
        setAttr(node,key,value);
      }
      controlParts.delete(node);
    }
    function releaseControl() {
      for (const [node, record] of controlParts) releaseControlPart(node,record);
      if (control) {
        if (controlBefore === null) control.removeAttribute('data-tsix-broadcast-control');
        else control.setAttribute('data-tsix-broadcast-control', controlBefore);
      }
      control = null;
    }
    function labelControl(node, label) {
      if (!node) return;
      if (!controlParts.has(node)) {
        const before = Object.fromEntries(['role','tabindex','aria-label','aria-disabled','aria-haspopup','title'].map(k=>[k,node.getAttribute(k)]));
        let pressed=false;
        const activate = () => {
          if (controlDisabled(control) || controlDisabled(node)) return;
          const r = node.getBoundingClientRect();
          node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window, clientX:r.x+r.width/2, clientY:r.y+r.height/2}));
        };
        const keydown = event => {
          if (event.target !== node || !['Enter',' '].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();if(event.repeat)return;
          if(event.key==='Enter')activate();else pressed=true;
        };
        const keyup=event=>{if(event.target!==node||event.key!==' ')return;event.preventDefault();event.stopPropagation();if(pressed)activate();pressed=false};
        const blur=()=>{pressed=false};
        node.addEventListener('keydown',keydown);node.addEventListener('keyup',keyup);node.addEventListener('blur',blur);controlParts.set(node,{before,keydown,keyup,blur});
      }
      const disabled=controlDisabled(control)||controlDisabled(node);
      setAttr(node,'role','button');setAttr(node,'tabindex',disabled?'-1':'0');setAttr(node,'aria-disabled',disabled);
      setAttr(node,'title',label);setAttr(node,'aria-label',label);
      if(node.matches('.tsv-tool-button-context-menu-toggle'))setAttr(node,'aria-haspopup','menu');
    }
    function clear() {
      positionObserver.disconnect(); anchors.clear();
      streamRows.clear();
      host?.remove(); host = null; signature = ''; releaseControl();
      if (before === null) root.removeAttribute('data-tsix-broadcast');
      else root.setAttribute('data-tsix-broadcast', before);
    }
    function setOpen(open) {
      if (!host) return;
      const list=host.querySelector('[data-tsix-viewer-list]'),toggle=host.querySelector('[data-tsix-viewer-toggle]');
      if(list.hidden===open)list.hidden=!open;
      if (open) setStreamsOpen(false);
      setAttr(toggle,'aria-expanded',open);
      labelViewers();
    }
    function labelViewers() {
      const toggle=host.querySelector('[data-tsix-viewer-toggle]');
      const count=host.querySelector('[data-tsix-viewer-count]').textContent;
      setAttr(toggle,'aria-label',`${count}. ${toggle.getAttribute('aria-expanded')==='true'?'Hide':'Show'} viewer list`);
    }
    function dismiss(event) {
      if (!host) return;
      const viewersOpen = !host.querySelector('[data-tsix-viewer-list]').hidden;
      const streamsOpen = !host.querySelector('[data-tsix-share-list]').hidden;
      if (!viewersOpen && !streamsOpen) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); setStreamsOpen(false);
        host.querySelector(viewersOpen?'[data-tsix-viewer-toggle]':'[data-tsix-share-picker]').focus();
      } else if (event.type === 'pointerdown' && !host.contains(event.target)) { setOpen(false); setStreamsOpen(false); }
    }
    function setStreamsOpen(open) {
      if (!host) return;
      const panel = host.querySelector('[data-tsix-share-list]'), picker = host.querySelector('[data-tsix-share-picker]');
      if (panel.hidden === open) panel.hidden = !open;
      setAttr(picker,'aria-expanded',open);
      if (open) setOpen(false);
    }
    function runAction(session,action) {
      if (disposed || pending.has(session) || !outbound().includes(session)) return;
      const actionMethod = action==='open' ? methods?.goToStream : action==='settings' ? methods?.openSettings : null;
      if (action==='open' || action==='settings') { if (typeof actionMethod!=='function') return; }
      else if (action==='pause') { if (typeof session.setPaused!=='function') return; }
      else if (action!=='stop' || typeof session.leave!=='function') return;
      const error = host?.querySelector('[data-tsix-share-error]');
      if (error) setText(error,'');
      if (actionMethod && !host.querySelector('[data-tsix-share-list]').hidden) {
        setStreamsOpen(false); host.querySelector('[data-tsix-share-picker]').focus();
      }
      // These are the same actions as the native stream manager. In particular,
      // opening a stream may focus its existing popout; no media is remounted.
      pending.add(session); schedule();
      Promise.resolve().then(() => {
        if (disposed || !outbound().includes(session)) return;
        if (actionMethod) return actionMethod.call({data:null},session);
        if (action==='pause') return session.setPaused(!session.paused);
        return session.leave();
      }).catch(() => {
        const label = {open:'open the stream',settings:'open stream settings',pause:'change the pause state',stop:'stop the stream'}[action];
        if (!disposed && error?.isConnected) setText(error,`Could not ${label}. Try again.`);
      }).finally(() => { pending.delete(session); if (!disposed) schedule(); });
    }
    // Decorative glyphs match the supported client's own stream controls.
    // Inline shapes keep the bar independent of whether a native player is visible.
    const iconShapes = {
      open:{"viewBox":"0 0 22 22","paths":[{"d":"M7.5 17.25L4 17.25C3.0335 17.25 2.25 16.5038 2.25 15.5833L2.25 6.41667C2.25 5.49619 3.0335 4.75 4 4.75L18 4.75C18.9665 4.75 19.75 5.49619 19.75 6.41667L19.75 15.5833C19.75 16.5038 18.9665 17.25 18 17.25L14.5 17.25","stroke-width":"1.75","stroke-linecap":"round","stroke-linejoin":"round","fill":"none","stroke":"currentColor"},{"d":"M13.748 11.7476L11.0005 9L8.25293 11.7476","stroke-width":"1.5","stroke-linecap":"round","stroke-linejoin":"round","fill":"none","stroke":"currentColor"},{"d":"M11 17.25L11 10","stroke-width":"1.75","stroke-linecap":"round","stroke-linejoin":"round","fill":"none","stroke":"currentColor"}]},
      pause:{"viewBox":"0 0 16 16","paths":[{"d":"M5,2.7c-0.3,0-0.6,0.3-0.6,0.6v9.5c0,0.3,0.3,0.6,0.6,0.6h1.2c0.3,0,0.6-0.3,0.6-0.6V3.3c0-0.3-0.3-0.6-0.6-0.6 H5z","fill":"currentColor"},{"d":"M9.8,2.7c-0.3,0-0.6,0.3-0.6,0.6v9.5c0,0.3,0.3,0.6,0.6,0.6H11c0.3,0,0.6-0.3,0.6-0.6V3.3 c0-0.3-0.3-0.6-0.6-0.6H9.8z","fill":"currentColor"}]},
      resume:{"viewBox":"0 0 16 16","paths":[{"d":"M11.5,8.5c0.2-0.1,0.3-0.3,0.3-0.5c0-0.2-0.1-0.4-0.3-0.5C10.1,6.4,7,4.1,5.4,2.8C5.1,2.6,4.9,2.6,4.6,2.7 C4.4,2.9,4.3,3.1,4.3,3.4c0,2.3,0,7,0,9.3c0,0.3,0.1,0.5,0.4,0.6c0.2,0.1,0.5,0.1,0.7-0.1C7,11.9,10.1,9.6,11.5,8.5z","fill":"currentColor"}]},
      settings:{"viewBox":"0 0 22 22","paths":[{"d":"M18.0602 9.54063L16.3878 9.25664C16.2932 8.95688 16.167 8.6729 16.025 8.38891L17.0031 7.01631C17.1451 6.81121 17.1294 6.52723 16.9558 6.35368L15.6148 5.01264C15.4412 4.83909 15.1572 4.80754 14.9521 4.96531L13.5795 5.94348C13.3113 5.80149 13.0116 5.67527 12.7118 5.58061L12.4436 3.92403C12.3963 3.67159 12.1912 3.49805 11.9387 3.49805H10.0455C9.79306 3.49805 9.58796 3.67159 9.54063 3.92403L9.25664 5.59639C8.95688 5.69105 8.6729 5.81726 8.38891 5.95926L7.01631 4.98108C6.81121 4.83909 6.52723 4.85487 6.35368 5.02841L5.01264 6.36946C4.83909 6.543 4.80754 6.82699 4.96531 7.03209L5.94348 8.40469C5.80149 8.6729 5.67527 8.97266 5.58061 9.27242L3.92403 9.54063C3.67159 9.58796 3.49805 9.79306 3.49805 10.0455V11.9387C3.49805 12.1912 3.67159 12.3963 3.92403 12.4436L5.59639 12.7276C5.69105 13.0273 5.81726 13.3113 5.95926 13.5953L4.98108 14.9679C4.83909 15.173 4.85487 15.457 5.02841 15.6305L6.36946 16.9716C6.543 17.1451 6.82699 17.1767 7.03209 17.0189L8.40469 16.0407C8.6729 16.1827 8.97266 16.309 9.27242 16.4036L9.55641 18.076C9.60374 18.3284 9.80884 18.502 10.0613 18.502H11.9545C12.2069 18.502 12.412 18.3284 12.4594 18.076L12.7276 16.3878C13.0273 16.2932 13.3113 16.167 13.5953 16.025L14.9679 17.0031C15.173 17.1451 15.457 17.1294 15.6305 16.9558L16.9716 15.6148C17.1451 15.4412 17.1767 15.1572 17.0189 14.9521L16.0407 13.5795C16.1827 13.3113 16.309 13.0116 16.4036 12.7118L18.076 12.4278C18.3284 12.3805 18.502 12.1754 18.502 11.923V10.0455C18.4862 9.79306 18.3126 9.58796 18.0602 9.54063ZM10.9921 13.69C9.4933 13.69 8.29425 12.4751 8.29425 10.9921C8.29425 9.4933 9.50908 8.29425 10.9921 8.29425C12.4751 8.29425 13.69 9.4933 13.69 10.9921C13.69 12.4909 12.4909 13.69 10.9921 13.69Z","fill":"currentColor"}]},
      stop:{"viewBox":"0 0 22 22","paths":[{"d":"M15.2433 7.37903C16.0823 8.21822 16.6535 9.28732 16.8849 10.4512C17.1162 11.615 16.9973 12.8213 16.5431 13.9175C16.0889 15.0138 15.3199 15.9507 14.3332 16.6099C13.3466 17.2691 12.1866 17.621 11 17.621C9.8134 17.621 8.65344 17.2691 7.66678 16.6099C6.68013 15.9507 5.9111 15.0138 5.45691 13.9175C5.00273 12.8213 4.8838 11.615 5.11515 10.4512C5.3465 9.28732 5.91775 8.21822 6.75667 7.37903","stroke-width":"1.75","stroke-linecap":"round","stroke-linejoin":"round","fill":"none","stroke":"currentColor"},{"d":"M11 4.37903V10.379","stroke-width":"1.75","stroke-linecap":"round","stroke-linejoin":"round","fill":"none","stroke":"currentColor"}]}
    };
    function shareIcon(name) {
      const shape=iconShapes[name], icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
      icon.setAttribute('viewBox',shape.viewBox);icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
      icon.setAttribute('data-tsix-share-icon',name);
      for(const attributes of shape.paths){
        const path=document.createElementNS(icon.namespaceURI,'path');
        for(const [key,value] of Object.entries(attributes))path.setAttribute(key,value);
        icon.append(path);
      }
      return icon;
    }
    function syncStreamActions(state) {
      const single = state.streams.length === 1, panel = host.querySelector('[data-tsix-share-list]');
      const picker = host.querySelector('[data-tsix-share-picker]');
      const focused = document.activeElement;
      const hadFocus = focused === picker || [...streamRows.values()].some(row => row.element.contains(focused));
      if (picker.hidden === !single) picker.hidden = single;
      setText(picker,`Manage ${state.count} streams`);
      if (single) setStreamsOpen(false);
      const live = new Set();
      for (const session of outbound()) {
        const key = streamKeys.get(session), info = state.streams.find(stream => stream.key === key);
        if (!info) continue;
        live.add(session);
        let row = streamRows.get(session);
        if (!row) {
          const element = document.createElement('div'); element.setAttribute('data-tsix-share-stream','');
          const actions = document.createElement('div'); actions.setAttribute('data-tsix-share-actions','');
          row = {element,buttons:{},labels:{}};
          for (const [action,text] of [['open','Open stream'],['pause','Pause'],['settings','Settings'],['stop','Stop']]) {
            const button = document.createElement('button'); button.type = 'button';
            const label = document.createElement('span'); label.setAttribute('data-tsix-share-label',''); label.textContent = text;
            button.append(shareIcon(action));
            if(action==='pause')button.append(shareIcon('resume'));
            button.append(label);row.labels[action]=label;
            button.setAttribute('data-tsix-share-action',action);
            button.addEventListener('click',() => runAction(session,action));
            row.buttons[action] = button;
            (action==='open'?element:actions).append(button);
          }
          element.append(actions); streamRows.set(session,row);
        }
        const parent = single ? host : panel;
        if (row.element.parentElement !== parent) parent.append(row.element);
        row.element.toggleAttribute('data-paused',info.paused);
        setAttr(row.element,'aria-busy',info.busy);
        for (const [action,button] of Object.entries(row.buttons)) {
          const label = action==='open'?info.name:action==='pause'?(info.paused?'Resume':'Pause'):action==='stop'?'Stop':'Settings';
          setText(row.labels[action],label);
          setAttr(button,'aria-label',`${action==='open'?'Open stream':label}: ${info.name}`);
          setAttr(button,'title',`${action==='open'?'Open stream':label}: ${info.name}`);
          const disabled = info.busy || !info[action];
          if (button.disabled !== disabled) button.disabled = disabled;
        }
      }
      for (const [session,row] of streamRows) if (!live.has(session)) {
        row.element.remove(); streamRows.delete(session);
      }
      if (hadFocus) {
        const target = focused.isConnected && focused.getClientRects().length ? focused :
          single ? host.querySelector('[data-tsix-share-action="open"]') : picker;
        if (target !== document.activeElement) target?.focus();
      }
    }
    function avatar(person) {
      const icon = document.createElement('span'); icon.setAttribute('data-tsix-viewer-icon', '');
      icon.title = person.name; icon.setAttribute('aria-hidden', 'true');
      const parts = person.name.trim().split(/\s+/);
      icon.textContent = person.name === 'Viewer (name unavailable)' ? '?' : [...parts[0]].slice(0,1).join('') + (parts.length > 1 ? [...parts.at(-1)].slice(0,1).join('') : '');
      if (typeof person.avatar === 'string' && /^(tsic:|blob:|data:image\/|https?:)/i.test(person.avatar)) {
        const img = document.createElement('img'); img.alt = ''; img.src = person.avatar;
        img.addEventListener('error', () => img.remove(), {once:true}); icon.append(img);
      }
      return icon;
    }
    function mount() {
      host = document.createElement('section'); host.setAttribute('data-tsix-broadcast-bar', '');
      host.setAttribute('aria-label', 'Your screen sharing');
      const state = document.createElement('span'); state.setAttribute('data-tsix-broadcast-state', '');
      state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.setAttribute('data-tsix-viewer-toggle', '');
      toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'tsix-broadcast-viewers');
      toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      const count = document.createElement('span'); count.setAttribute('data-tsix-viewer-count', '');
      const icons = document.createElement('span'); icons.setAttribute('data-tsix-viewer-icons', ''); toggle.append(count, icons);
      const list = document.createElement('div'); list.id = 'tsix-broadcast-viewers'; list.hidden = true;
      list.setAttribute('data-tsix-viewer-list', ''); list.setAttribute('role', 'region'); list.setAttribute('aria-label', 'People watching your streams');
      const line = document.createElement('div'); line.setAttribute('data-tsix-share-status',''); line.append(state,toggle);
      const picker = document.createElement('button'); picker.type = 'button'; picker.setAttribute('data-tsix-share-picker','');
      picker.setAttribute('aria-expanded','false'); picker.setAttribute('aria-controls','tsix-share-streams');
      picker.addEventListener('click',() => {
        const open = picker.getAttribute('aria-expanded')!=='true';
        setStreamsOpen(open);
        if (open) host.querySelector('[data-tsix-share-list] button:not(:disabled)')?.focus();
      });
      const streams = document.createElement('div'); streams.id = 'tsix-share-streams'; streams.hidden = true;
      streams.setAttribute('data-tsix-share-list',''); streams.setAttribute('role','region'); streams.setAttribute('aria-label','Your running streams');
      const error = document.createElement('div'); error.setAttribute('data-tsix-share-error',''); error.setAttribute('role','status');
      host.append(line,picker,list,streams,error); root.append(host);
    }
    document.addEventListener('keydown', dismiss, true); document.addEventListener('pointerdown', dismiss);
    return {
      sync(enabled) {
        const active = enabled && getComputedStyle(document.documentElement).getPropertyValue('--tsix-broadcast-api').trim() === '1';
        if (!active) { unwatch?.(); unwatch = null; clear(); return; }
        const toolbar = root.querySelector('.tsv-central-toolbar')?.__vue__;
        const component = toolbar?.screenshareButton?.contextMenuData?.component;
        const options = component?.options || component;
        methods = options?.methods;
        const computed = options?.computed?.allSessions;
        const next = typeof computed === 'function' ? computed : computed?.get;
        if (next !== getter) { unwatch?.(); unwatch = null; getter = next; }
        if (!getter) { clear(); return; }
        if (!unwatch) unwatch = vm.$watch(() => JSON.stringify(snapshot()), schedule);
        const state = snapshot();
        if (!state.count) { clear(); return; }
        if (!host) mount();
        const mode = state.paused ? 'paused' : 'live';
        if (root.getAttribute('data-tsix-broadcast') !== mode) root.setAttribute('data-tsix-broadcast', mode);
        setAttr(host,'data-state',mode);
        // Only our own badge moves into fullscreen; native players stay put.
        const fullscreen = document.fullscreenElement;
        const parent = fullscreen && !['VIDEO','IFRAME','CANVAS'].includes(fullscreen.tagName) ? fullscreen : root.querySelector('.main-pane-layout') || root;
        if (host.parentElement !== parent) parent.append(host);
        host.toggleAttribute('data-fullscreen', parent === fullscreen);
        const native = [...root.querySelectorAll('.tsv-central-toolbar .tsv-tool-button')].find(e => e.__vue__?.button === toolbar?.screenshareButton);
        if (native !== control) { releaseControl(); if (native) { control = native; controlBefore = native.getAttribute('data-tsix-broadcast-control'); native.setAttribute('data-tsix-broadcast-control', ''); } }
        const menu=control?.querySelector('.tsv-tool-button-context-menu-toggle');
        for(const [node,record]of controlParts)if(node!==control&&node!==menu)releaseControlPart(node,record);
        labelControl(control, state.paused ? 'Resume screen sharing' : 'Pause screen sharing');
        labelControl(menu, 'Stream controls');
        host.toggleAttribute('data-native-control', !!control);
        setText(host.querySelector('[data-tsix-broadcast-state]'), state.paused ? 'Paused' : state.count === 1 ? 'Live' : `Live · ${state.count}`);
        setAttr(host.querySelector('[data-tsix-broadcast-state]'),'title',state.paused ? 'Sharing is paused. Your stream is still open.' : `You are sharing ${state.count === 1 ? 'your screen' : `${state.count} streams`}, even when the preview is hidden.`);
        syncStreamActions(state);
        const nextSignature = JSON.stringify(state.people);
        if (nextSignature !== signature) {
          signature = nextSignature;
          const toggle = host.querySelector('[data-tsix-viewer-toggle]'), icons = host.querySelector('[data-tsix-viewer-icons]'), list = host.querySelector('[data-tsix-viewer-list]');
          setText(host.querySelector('[data-tsix-viewer-count]'), `${state.people.length} watching`);
          labelViewers();
          toggle.title = state.people.length ? state.people.map(p=>p.name).join('\n') : 'Nobody is watching yet';
          icons.replaceChildren(...state.people.slice(0,3).map(avatar));
          if (state.people.length > 3) { const more = document.createElement('span'); more.setAttribute('data-tsix-viewer-icon', ''); more.textContent = `+${state.people.length-3}`; icons.append(more); }
          const title = document.createElement('strong'); title.textContent = 'Watching your stream';
          const ul = document.createElement('ul');
          for (const person of state.people) { const li = document.createElement('li'), name = document.createElement('span'); name.textContent = person.name; name.title = person.name; li.append(avatar(person),name); ul.append(li); }
          if (!state.people.length) { const li = document.createElement('li'); li.textContent = 'Nobody is watching yet'; ul.append(li); }
          list.replaceChildren(title,ul);
        }
        positionBadge();
      },
      dispose() { unwatch?.(); clear(); document.removeEventListener('keydown', dismiss, true); document.removeEventListener('pointerdown', dismiss); }
    };
  }
  // Native buttons express disabled state through classes. Watch those classes
  // narrowly; message/media class changes and our own markers need no pass.
  const observer = new MutationObserver(changes=>{if(changes.some(change=>{
    const node=change.target.nodeType===1?change.target:change.target.parentElement;
    if(change.attributeName==='class'&&!node?.matches('.tsv-button,.tsv-tool-button,.tsv-tool-button-context-menu-toggle,.tsv-window'))return false;
    return !node?.closest('.ts-chat-container,[data-tsix-volume-control],[data-tsix-stream-toolbar],[data-tsix-broadcast-bar]');
  }))schedule()});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href','disabled','class']});
  const onStyleLoad=event=>{if(event.target?.tagName==='LINK')schedule()};
  document.addEventListener('load',onStyleLoad,true);
  document.addEventListener('loadedmetadata',schedule,true);
  document.addEventListener('loadeddata',schedule,true);
  document.addEventListener('fullscreenchange',onFullscreenChange);
  window.__tsixStreams = {
    version:'1.0.10', sync,
    status: () => ({trayCollapsed,chatVisible,viewers:[...records.values()].map(r=>({stage:r.element.getAttribute(marker),savedSplit:r.savedSplit,tray:r.element.getAttribute(trayMarker)})),keyboardControls:buttons.size}),
    dispose() {
      if (document.fullscreenElement) throw Error('Exit fullscreen before removing or replacing the stream helper');
      disposed = true; observer.disconnect(); if(frame)cancelAnimationFrame(frame);
      for(const id of volumeFrames.values())cancelAnimationFrame(id);volumeFrames.clear();
      broadcast.dispose();
      for (const control of volumes.values()) control.dispose();
      volumes.clear();
      for(const {button}of joins.values())button.remove();joins.clear();
      document.removeEventListener('load',onStyleLoad,true);
      document.removeEventListener('loadedmetadata',schedule,true);
      document.removeEventListener('loadeddata',schedule,true);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      for (const record of records.values()) release(record);
      for (const [node,record] of buttons) releaseButton(node,record);
      delete window.__tsixStreams;
    }
  };
  sync();
  return {attachedViewers:records.size, keyboardControls:buttons.size};
})()
