// Owned management UI with its own toolbar artwork, distinct from TS settings.
// Downloads and native actions remain in the authenticated local manager.
(() => {
  window.__tsixManager?.dispose();
  let root = document.querySelector('.tsv-window'),
    toolbar = null;
  if (!root) throw Error('No TeamSpeak main window');
  const host = document.createElement('div');
  host.id = 'tsix-manager';
  const style = document.createElement('style');
  style.textContent = `
    #tsix-manager{font:400 14px/20px var(--tsv-font-family,"Segoe UI",sans-serif);color:var(--tsix-chrome-text,#edf2f7);--tsix-muted:var(--tsix-chrome-muted,#b6c5d8)}
    [data-tsix-manager-open]{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;box-sizing:border-box;margin:0 0 0 8px;padding:4px;border:1px solid transparent;border-radius:var(--tsix-chrome-radius,4px);background:transparent;color:var(--tsix-chrome-muted,#b6c5d8);font:inherit;font-size:12px;cursor:pointer;-webkit-app-region:no-drag}
    [data-tsix-manager-open]:not(:has(svg)){width:auto;flex-basis:auto;padding:4px 8px}
    [data-tsix-manager-open] svg{width:22px;height:22px;pointer-events:none}
    [data-tsix-manager-open] svg path{fill:currentColor}
    [data-tsix-manager-open]::before{content:'';position:absolute;left:-6px;top:7px;height:16px;border-left:1px solid var(--tsix-chrome-border,#3b4c61)}
    [data-tsix-manager-open]:hover,[data-tsix-manager-open][aria-expanded=true]{background:var(--tsix-control-hover,#344b64);color:var(--tsix-chrome-text,#edf2f7)}
    [data-tsix-manager-open]:active{background:var(--tsix-control-pressed,#3e5873)}
    [data-tsix-manager-open][data-update]::after{content:'';position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--tsix-chrome-accent,#8bc4ff);box-shadow:0 0 0 2px var(--tsix-chrome-bg,#18212e)}
    #tsix-manager dialog{font:inherit;width:440px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);box-sizing:border-box;margin:auto;padding:0;border:1px solid var(--tsix-chrome-border,#3b4c61);border-radius:var(--tsix-surface-radius,8px);background:var(--tsix-content-bg,#202936);color:inherit;box-shadow:var(--tsix-surface-shadow,0 8px 24px #0005);overflow:hidden}
    #tsix-manager dialog[open]{display:flex;flex-direction:column}
    #tsix-manager [data-header]{display:flex;align-items:center;gap:8px;flex:none;padding:16px 16px 12px 20px}
    #tsix-manager [data-close]{margin-left:auto;width:32px;height:32px;min-height:32px;padding:0;display:inline-grid;place-items:center;border-color:transparent;background:transparent;color:var(--tsix-muted)}
    #tsix-manager [data-close]::before,#tsix-manager [data-close]::after{content:"";grid-area:1/1;width:14px;height:1.5px;border-radius:1px;background:currentColor;transform:rotate(45deg)}
    #tsix-manager [data-close]::after{transform:rotate(-45deg)}
    #tsix-manager [data-close]:hover:not(:disabled){color:var(--tsix-chrome-text,#edf2f7)}
    #tsix-manager [role=tablist]{display:flex;flex:none;margin:0 20px;border-radius:var(--tsix-chrome-radius,4px);background:var(--tsix-control-bg,#27374b)}
    #tsix-manager [role=tab]{flex:1 1 0;min-height:32px;padding:0 12px;border:0;border-radius:var(--tsix-chrome-radius,4px);background:transparent;color:var(--tsix-muted)}
    #tsix-manager [role=tab][aria-selected=true],#tsix-manager [role=tab][aria-selected=true]:hover{background:var(--tsix-control-selected,var(--tsix-control-pressed,#3e5873));color:var(--tsix-chrome-text,#edf2f7)}
    #tsix-manager [role=tab][data-update]::after{content:"";display:inline-block;width:6px;height:6px;margin:0 0 1px 6px;border-radius:50%;background:var(--tsix-chrome-accent,#8bc4ff);vertical-align:middle}
    #tsix-manager [role=tabpanel]{min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px 20px 16px}
    #tsix-manager [role=tabpanel]:focus-visible{outline:2px solid var(--tsix-chrome-accent,#8bc4ff);outline-offset:-2px}
    #tsix-manager dialog::backdrop{background:#0006}
    #tsix-manager h2{margin:0;font-size:18px;line-height:24px;font-weight:600}
    #tsix-manager [data-version]{margin-top:3px;color:var(--tsix-muted);font-size:12px;line-height:18px}
    #tsix-manager p{margin:0;line-height:20px;font-weight:400;overflow-wrap:anywhere}
    #tsix-manager [data-overview]{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
    #tsix-manager [data-status]{color:var(--tsix-muted)}
    #tsix-manager [data-update-action]{display:flex;gap:8px;flex-wrap:wrap}
    #tsix-manager [data-update-panel]{display:flex;flex-direction:column;gap:12px;padding-top:12px}
    #tsix-manager [data-uninstall-row]{margin-top:4px;padding-top:12px;border-top:1px solid var(--tsix-chrome-border,#3b4c61)}
    #tsix-manager button{font:inherit;line-height:20px;min-height:34px;cursor:pointer;border:1px solid var(--tsix-control-border,#526780);border-radius:var(--tsix-chrome-radius,4px);padding:6px 12px;color:inherit;background:var(--tsix-control-bg,#27374b)}
    #tsix-manager button:hover:not(:disabled){background:var(--tsix-control-hover,#344b64)}
    #tsix-manager button:active:not(:disabled){background:var(--tsix-control-pressed,#3e5873)}
    #tsix-manager button:focus-visible,[data-tsix-manager-open]:focus-visible{outline:2px solid var(--tsix-chrome-accent,#8bc4ff);outline-offset:2px}
    #tsix-manager button:disabled{opacity:.5;cursor:default}
    #tsix-manager [data-primary]{background:var(--tsix-primary-bg,#255b91);border-color:var(--tsix-primary-border,#4a89c5);color:#fff}
    #tsix-manager [data-primary]:hover:not(:disabled){background:var(--tsix-primary-hover,#2d6ba6)}
    #tsix-manager [data-primary]:active:not(:disabled){background:var(--tsix-primary-pressed,#1e4c7a)}
    #tsix-manager [data-destructive]{background:var(--tsix-danger-bg,#803b48);border-color:var(--tsix-danger-border,#bd7180);color:#fff}
    #tsix-manager [data-destructive]:hover:not(:disabled){background:var(--tsix-danger-hover,#964454)}
    #tsix-manager [data-destructive]:active:not(:disabled){background:var(--tsix-danger-bg,#803b48)}
    #tsix-manager [data-remove]{margin-left:-8px;padding-left:8px;padding-right:8px;border-color:transparent;background:transparent;color:var(--tsix-danger-text,#ffb7c1)}
    #tsix-manager [data-confirm]{padding:4px 20px 20px}
    #tsix-manager [data-consequence]{margin-top:10px;color:var(--tsix-muted)}
    #tsix-manager [data-confirm-actions]{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:20px}
    #tsix-manager details{color:var(--tsix-muted);font-size:12px}
    #tsix-manager summary{width:fit-content;cursor:pointer;border-radius:var(--tsix-chrome-radius,4px)}#tsix-manager summary:focus-visible{outline:2px solid var(--tsix-chrome-accent,#8bc4ff);outline-offset:2px}#tsix-manager details p{margin-top:8px;max-height:100px;overflow:auto;white-space:pre-wrap}
    #tsix-manager [data-feature]{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 16px;padding:12px 0;border-bottom:1px solid var(--tsix-chrome-border,#3b4c61);cursor:pointer}
    #tsix-manager [data-feature]:last-child{border-bottom:0}
    #tsix-manager [data-feature] small{grid-column:1;color:var(--tsix-muted);font-size:12px;line-height:16px}
    #tsix-manager [data-feature] input{grid-column:2;grid-row:1/span 2;appearance:none;position:relative;width:34px;height:20px;margin:0;border:1px solid var(--tsix-control-border,#526780);border-radius:10px;background:var(--tsix-control-bg,#27374b);cursor:pointer;transition:background-color .12s}
    #tsix-manager [data-feature] input::before{content:'';position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:var(--tsix-chrome-muted,#b6c5d8);transition:transform .12s}
    #tsix-manager [data-feature] input:checked{background:var(--tsix-primary-bg,#255b91);border-color:var(--tsix-primary-border,#4a89c5)}
    #tsix-manager [data-feature] input:checked::before{transform:translateX(14px);background:#fff}
    #tsix-manager [data-feature] input:focus-visible{outline:2px solid var(--tsix-chrome-accent,#8bc4ff);outline-offset:2px}
    #tsix-manager [data-feature]:has(input:disabled){cursor:default;opacity:.55}
    #tsix-manager [data-feature] input:disabled{cursor:default}
    @media(prefers-reduced-motion:reduce){#tsix-manager [data-feature] input,#tsix-manager [data-feature] input::before{transition:none}}
    #tsix-manager [data-toast]{position:fixed;top:48px;right:16px;width:300px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px;border-radius:var(--tsix-surface-radius,8px);background:var(--tsix-content-bg,#202936);border:1px solid var(--tsix-chrome-border,#3b4c61);box-shadow:var(--tsix-surface-shadow,0 8px 24px #0005);z-index:12}
    #tsix-manager [data-toast] strong{display:block;margin-bottom:4px;font-weight:600}#tsix-manager [data-toast] p{color:var(--tsix-muted)}
    #tsix-manager [data-toast-actions]{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    #tsix-manager [hidden]{display:none!important}
    @media(max-width:420px){#tsix-manager dialog{padding:20px}}
    @media(forced-colors:active){#tsix-manager dialog,#tsix-manager [data-toast]{border-color:CanvasText}#tsix-manager button,[data-tsix-manager-open]{border:1px solid ButtonText}#tsix-manager [data-remove]{color:ButtonText}#tsix-manager button:disabled{opacity:1;color:GrayText;border-color:GrayText}#tsix-manager button:focus-visible,#tsix-manager summary:focus-visible,[data-tsix-manager-open]:focus-visible{outline-color:Highlight}#tsix-manager [data-status],#tsix-manager [data-version],#tsix-manager [data-consequence],#tsix-manager [data-feature] small{color:CanvasText}[data-tsix-manager-open][data-update]::after{background:Highlight}#tsix-manager [role=tab][aria-selected=true]{outline:1px solid Highlight;outline-offset:-1px}#tsix-manager [data-feature] input{border-color:ButtonText}#tsix-manager [data-feature] input::before{background:ButtonText}#tsix-manager [data-feature] input:checked{background:Highlight}#tsix-manager [data-feature] input:checked::before{background:HighlightText}}
  `;
  const make = (tag, attribute, text) => {
    const node = document.createElement(tag);
    if (attribute) node.setAttribute(attribute, '');
    if (text) node.textContent = text;
    return node;
  };
  const action = (text, attribute) => {
    const node = make('button', attribute, text);
    node.type = 'button';
    return node;
  };
  // A four-point sparkle: unlike the TeamSpeak settings cog beside it.
  const icon = () => {
    const ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of [
      'M10 3c.5 4.2 2.8 6.5 7 7-4.2.5-6.5 2.8-7 7-.5-4.2-2.8-6.5-7-7 4.2-.5 6.5-2.8 7-7Z',
      'M18 13c.3 2.2 1.3 3.2 3.5 3.5-2.2.3-3.2 1.3-3.5 3.5-.3-2.2-1.3-3.2-3.5-3.5 2.2-.3 3.2-1.3 3.5-3.5Z',
      'M18.5 2c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2Z'
    ]) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  };
  const button = action('TS6 Enhanced', 'data-tsix-manager-open');
  button.replaceChildren(icon());
  button.title = 'TS6 Enhanced';
  button.setAttribute('aria-label', 'TS6 Enhanced');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'tsix-manager-dialog');
  const dialog = make('dialog');
  dialog.id = 'tsix-manager-dialog';
  dialog.setAttribute('aria-labelledby', 'tsix-manager-title');
  const title = make('h2', null, 'TS6 Enhanced');
  title.id = 'tsix-manager-title';
  const version = make('span', 'data-version'),
    overview = make('div', 'data-overview'),
    status = make('p', 'data-status');
  status.id = 'tsix-manager-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  dialog.setAttribute('aria-describedby', status.id);
  const updateActions = make('div', 'data-update-action'),
    check = action('Check for updates'),
    update = action('Update…', 'data-primary');
  updateActions.append(check, update);
  const details = make('details'),
    summary = make('summary', null, 'Details'),
    errorText = make('p');
  details.append(summary, errorText);
  details.hidden = true;
  // Tabs keep the dialog short: one panel per feature group, plus updates.
  // Switches apply immediately; the last tab is remembered.
  const tabKey = 'tsix.layout.managerTab';
  const tablist = make('div');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'TS6 Enhanced settings');
  const tabs = new Map(),
    panels = new Map();
  for (const [key, label] of [
    ['streams', 'Streams'],
    ['chat', 'Chat'],
    ['updates', 'Updates']
  ]) {
    const tab = action(label),
      panel = make('div');
    tab.setAttribute('role', 'tab');
    tab.id = 'tsix-manager-tab-' + key;
    panel.id = 'tsix-manager-panel-' + key;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.setAttribute('aria-controls', panel.id);
    tab.onclick = () => select(key);
    tablist.append(tab);
    tabs.set(key, tab);
    panels.set(key, panel);
  }
  let selected = 'streams';
  try {
    if (tabs.has(localStorage.getItem(tabKey))) selected = localStorage.getItem(tabKey);
  } catch {
    /* Storage is optional. */
  }
  function select(key, focus = false) {
    selected = key;
    for (const [name, tab] of tabs) {
      const active = name === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels.get(name).hidden = !active;
    }
    if (focus) tabs.get(key).focus();
    try {
      localStorage.setItem(tabKey, key);
    } catch {
      /* Storage is optional. */
    }
  }
  tablist.addEventListener('keydown', event => {
    const keys = [...tabs.keys()],
      index = keys.indexOf(selected);
    const next =
      event.key === 'ArrowRight'
        ? keys[(index + 1) % keys.length]
        : event.key === 'ArrowLeft'
          ? keys[(index + keys.length - 1) % keys.length]
          : event.key === 'Home'
            ? keys[0]
            : event.key === 'End'
              ? keys.at(-1)
              : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  });
  const renderFeatures = () => {
    const api = window.__tsixFeatures;
    const groups = new Map([
      ['Streams', []],
      ['Chat', []]
    ]);
    for (const feature of api ? api.definitions() : []) {
      const row = make('label', 'data-feature'),
        text = make('span', null, feature.label),
        detail = make('small', null, feature.detail),
        input = make('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.setAttribute('aria-label', feature.label);
      input.checked = feature.value;
      input.dataset.featureId = feature.id;
      const inactive = feature.requires && !api.enabled(feature.requires);
      input.disabled = !!inactive;
      detail.id = `tsix-feature-${feature.id}`;
      input.setAttribute('aria-describedby', detail.id);
      if (inactive)
        detail.textContent = `${feature.detail} Requires “${api.definitions().find(item => item.id === feature.requires)?.label}”.`;
      input.onchange = () => {
        api.set(feature.id, input.checked);
      };
      row.append(text, detail, input);
      (groups.get(feature.group) ?? groups.get('Streams')).push(row);
    }
    // Rebuilding would drop keyboard focus from the switch that was toggled.
    const focused = document.activeElement?.dataset?.featureId;
    panels.get('streams').replaceChildren(...groups.get('Streams'));
    panels.get('chat').replaceChildren(...groups.get('Chat'));
    tabs.get('streams').hidden = tabs.get('chat').hidden = !api;
    if (focused) dialog.querySelector('[data-feature-id="' + focused + '"]')?.focus();
  };
  const onFeatures = () => {
    if (dialog.open) renderFeatures();
  };
  window.addEventListener('tsix-features', onFeatures);
  const remove = action('Uninstall…', 'data-remove'),
    close = action('', 'data-close');
  close.setAttribute('aria-label', 'Close');
  close.title = 'Close';
  const updatePanel = make('div', 'data-update-panel'),
    uninstallRow = make('div', 'data-uninstall-row');
  uninstallRow.append(remove);
  updatePanel.append(status, updateActions, details, uninstallRow);
  panels.get('updates').append(updatePanel);
  overview.append(tablist, ...panels.values());
  const header = make('div', 'data-header');
  const confirm = make('div', 'data-confirm');
  confirm.hidden = true;
  const warning = make('p', null, 'TeamSpeak will restart and end any calls or streams.'),
    consequence = make('p', 'data-consequence');
  warning.id = 'tsix-manager-warning';
  consequence.id = 'tsix-manager-consequence';
  const confirmActions = make('div', 'data-confirm-actions'),
    accept = action(''),
    cancel = action('Cancel');
  confirmActions.append(cancel, accept);
  confirm.append(warning, consequence, confirmActions);
  const toast = make('div', 'data-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  const toastTitle = make('strong', null, 'Update available'),
    message = make('p'),
    toastActions = make('div', 'data-toast-actions'),
    review = action('Update', 'data-primary'),
    dismiss = action('Later');
  toastActions.append(review, dismiss);
  toast.append(toastTitle, message, toastActions);
  header.append(title, version, close);
  dialog.append(header, overview, confirm);
  host.append(style, dialog, toast);
  root.append(host);
  let state = {},
    nonce = '',
    pending = null,
    notified = '',
    initiator = null,
    // The popup's Update button starts the update directly; the popup then
    // shows its progress, and only a stopped update offers Close.
    toastRunning = false;
  const showToast = () => {
    toastTitle.textContent = toastRunning ? 'Updating TS6 Enhanced' : 'Update available';
    if (toastRunning) message.textContent = state.detail ? `${state.message} ${state.detail}` : state.message || '';
    review.hidden = toastRunning;
    dismiss.textContent = toastRunning ? 'Close' : 'Later';
    toastActions.hidden = toastRunning && !!state.busy;
  };
  const send = action => {
    if (typeof window.__tsixMaintenanceRequest === 'function' && nonce)
      window.__tsixMaintenanceRequest(JSON.stringify({ action, nonce }));
  };
  const reset = () => {
    pending = null;
    confirm.hidden = true;
    overview.hidden = false;
    version.hidden = false;
    title.textContent = 'TS6 Enhanced';
    dialog.setAttribute('aria-describedby', status.id);
  };
  const open = () => {
    toast.hidden = true;
    reset();
    renderFeatures();
    // A waiting update opens on its tab; otherwise the last tab used.
    select(state.available || state.pending || !window.__tsixFeatures ? 'updates' : selected);
    if (!dialog.open) dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
    close.focus();
  };
  const back = () => {
    reset();
    initiator?.focus();
  };
  button.onclick = open;
  review.onclick = e => {
    if (!e.isTrusted || state.busy || !state.available) return;
    toastRunning = true;
    state = { ...state, busy: true, message: 'Downloading the update…', detail: null };
    showToast();
    send('update');
  };
  dismiss.onclick = () => {
    toast.hidden = true;
    toastRunning = false;
    showToast();
  };
  close.onclick = () => dialog.close();
  check.onclick = e => {
    if (e.isTrusted && !state.busy && state.configured) send('check');
  };
  const ask = action => {
    pending = action;
    initiator = action === 'update' ? update : remove;
    overview.hidden = true;
    version.hidden = true;
    confirm.hidden = false;
    title.textContent = action === 'update' ? 'Update TS6 Enhanced?' : 'Uninstall TS6 Enhanced?';
    warning.textContent =
      action === 'update'
        ? 'TeamSpeak will briefly disconnect and restart after the download is verified.'
        : 'TeamSpeak will restart and end any calls or streams.';
    dialog.setAttribute('aria-describedby', `${warning.id} ${consequence.id}`);
    consequence.textContent =
      action === 'update'
        ? 'Reconnect to your servers and channels, restore mute state, and resume your shared streams. Watched streams may need to be rejoined.'
        : 'Restores your previous appearance. Your accounts and chats stay.';
    accept.textContent = action === 'update' ? 'Restart and update' : 'Uninstall';
    accept.toggleAttribute('data-primary', action === 'update');
    accept.toggleAttribute('data-destructive', action === 'uninstall');
    cancel.focus();
  };
  update.onclick = e => {
    if (e.isTrusted && !state.busy && (state.available || state.pending)) ask('update');
  };
  remove.onclick = e => {
    if (e.isTrusted && !state.busy) ask('uninstall');
  };
  cancel.onclick = back;
  accept.onclick = e => {
    if (e.isTrusted && pending && !state.busy) {
      send(pending);
      reset();
      close.focus();
    }
  };
  dialog.addEventListener('cancel', e => {
    if (pending) {
      e.preventDefault();
      back();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    reset();
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  });
  const mount = () => {
    if (!root?.isConnected) root = document.querySelector('.tsv-window');
    if (!root) return;
    if (host.parentElement !== root) root.append(host);
    if (!toolbar?.isConnected || !root.contains(toolbar)) toolbar = root.querySelector('.tsv-central-toolbar');
    if (toolbar && button.parentElement !== toolbar) toolbar.append(button);
    if (!button.querySelector('svg')) button.replaceChildren(icon());
    // Detaching an open dialog removes it from the modal top layer but retains
    // its open attribute. Restore the backdrop and focus containment after a
    // native remount; the queued close event must not reset this reopened view.
    if (dialog.open && !dialog.matches(':modal')) {
      dialog.close();
      dialog.showModal();
      (pending ? cancel : close).focus();
    }
  };
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
  window.__tsixManager = {
    setState(next, token) {
      // Polls may refresh transport metadata without changing anything visible.
      // Avoid rewriting live status text or waking our own mount observer then.
      if (
        ['version', 'configured', 'busy', 'available', 'pending', 'detail', 'message'].every(
          key => next[key] === state[key]
        )
      ) {
        state = next;
        nonce = token;
        return;
      }
      if (pending === 'update' && next.available !== state.available) {
        reset();
        close.focus();
      }
      state = next;
      nonce = token;
      version.textContent = `v${state.version}`;
      status.textContent = state.message;
      check.hidden = !state.configured || !!state.available;
      check.disabled = !!state.busy;
      remove.disabled = !!state.busy;
      const canUpdate = state.available || state.pending;
      update.textContent = state.available ? 'Update…' : 'Restart and update…';
      update.disabled = !!state.busy || !canUpdate;
      update.hidden = !canUpdate;
      updateActions.hidden = check.hidden && update.hidden;
      accept.disabled = !!state.busy;
      details.hidden = !state.detail;
      errorText.textContent = state.detail || '';
      if (!state.detail) details.open = false;
      button.toggleAttribute('data-update', !!state.available);
      tabs.get('updates').toggleAttribute('data-update', !!(state.available || state.pending));
      button.title = state.available ? 'TS6 Enhanced — update available' : 'TS6 Enhanced';
      button.setAttribute('aria-label', button.title);
      if (toastRunning) {
        showToast();
        return;
      }
      if (!state.available) toast.hidden = true;
      if (state.available && state.available !== notified) {
        notified = state.available;
        message.textContent = `TS6 Enhanced ${state.available}. TeamSpeak restarts briefly and restores your session.`;
        showToast();
        toast.hidden = dialog.open;
      }
    },
    dispose() {
      observer.disconnect();
      window.removeEventListener('tsix-features', onFeatures);
      button.remove();
      host.remove();
      delete window.__tsixManager;
    }
  };
  return { attached: true };
})();
