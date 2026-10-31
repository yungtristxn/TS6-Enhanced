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
    #tsix-manager dialog{font:inherit;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;margin:auto;padding:24px;border:1px solid var(--tsix-chrome-border,#3b4c61);border-radius:var(--tsix-surface-radius,8px);background:var(--tsix-content-bg,#202936);color:inherit;box-shadow:var(--tsix-surface-shadow,0 8px 24px #0005)}
    #tsix-manager dialog::backdrop{background:#0006}
    #tsix-manager h2{margin:0;font-size:18px;line-height:24px;font-weight:600}
    #tsix-manager [data-version]{display:block;margin-top:2px;color:var(--tsix-muted);font-size:12px;line-height:18px}
    #tsix-manager p{margin:0;line-height:20px;font-weight:400;overflow-wrap:anywhere}
    #tsix-manager [data-overview]{margin-top:20px}
    #tsix-manager [data-status]{color:var(--tsix-muted)}
    #tsix-manager [data-update-action]{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
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
    #tsix-manager [data-footer]{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--tsix-chrome-border,#3b4c61)}
    #tsix-manager [data-confirm]{margin-top:16px}
    #tsix-manager [data-consequence]{margin-top:10px;color:var(--tsix-muted)}
    #tsix-manager [data-confirm-actions]{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:20px}
    #tsix-manager details{margin-top:12px;color:var(--tsix-muted);font-size:12px}
    #tsix-manager summary{width:fit-content;cursor:pointer;border-radius:var(--tsix-chrome-radius,4px)}#tsix-manager summary:focus-visible{outline:2px solid var(--tsix-chrome-accent,#8bc4ff);outline-offset:2px}#tsix-manager details p{margin-top:8px;max-height:100px;overflow:auto;white-space:pre-wrap}
    #tsix-manager [data-features]{margin-top:20px;padding-top:16px;border-top:1px solid var(--tsix-chrome-border,#3b4c61)}
    #tsix-manager h3{margin:0;font-size:14px;line-height:20px;font-weight:600}
    #tsix-manager [data-feature-group]{margin:12px 0 0;color:var(--tsix-muted);font-size:12px;line-height:16px;font-weight:600}
    #tsix-manager [data-feature]{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 16px;padding:6px 0;cursor:pointer}
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
    @media(forced-colors:active){#tsix-manager dialog,#tsix-manager [data-toast]{border-color:CanvasText}#tsix-manager button,[data-tsix-manager-open]{border:1px solid ButtonText}#tsix-manager [data-remove]{color:ButtonText}#tsix-manager button:disabled{opacity:1;color:GrayText;border-color:GrayText}#tsix-manager button:focus-visible,#tsix-manager summary:focus-visible,[data-tsix-manager-open]:focus-visible{outline-color:Highlight}#tsix-manager [data-status],#tsix-manager [data-version],#tsix-manager [data-consequence],#tsix-manager [data-feature] small{color:CanvasText}[data-tsix-manager-open][data-update]::after{background:Highlight}#tsix-manager [data-feature] input{border-color:ButtonText}#tsix-manager [data-feature] input::before{background:ButtonText}#tsix-manager [data-feature] input:checked{background:Highlight}#tsix-manager [data-feature] input:checked::before{background:HighlightText}}
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
  // Escape hatches for individual helpers. Changes apply immediately.
  const features = make('section', 'data-features');
  features.setAttribute('aria-labelledby', 'tsix-manager-features');
  const renderFeatures = () => {
    const api = window.__tsixFeatures;
    features.hidden = !api;
    if (!api) return;
    const heading = make('h3', null, 'Features');
    heading.id = 'tsix-manager-features';
    const nodes = [heading];
    let group = '';
    for (const feature of api.definitions()) {
      if (feature.group !== group) {
        group = feature.group;
        nodes.push(make('p', 'data-feature-group', group));
      }
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
      nodes.push(row);
    }
    // Rebuilding would drop keyboard focus from the switch that was toggled.
    const focused = document.activeElement?.dataset?.featureId;
    features.replaceChildren(...nodes);
    if (focused) features.querySelector(`[data-feature-id="${focused}"]`)?.focus();
  };
  const onFeatures = () => {
    if (dialog.open) renderFeatures();
  };
  window.addEventListener('tsix-features', onFeatures);
  const footer = make('div', 'data-footer'),
    remove = action('Uninstall…', 'data-remove'),
    close = action('Close');
  footer.append(remove, close);
  overview.append(status, updateActions, details, features, footer);
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
    review = action('View update', 'data-primary'),
    dismiss = action('Later');
  toastActions.append(review, dismiss);
  toast.append(toastTitle, message, toastActions);
  dialog.append(title, version, overview, confirm);
  host.append(style, dialog, toast);
  root.append(host);
  let state = {},
    nonce = '',
    pending = null,
    notified = '',
    initiator = null;
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
    if (!dialog.open) dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
    close.focus();
  };
  const back = () => {
    reset();
    initiator?.focus();
  };
  button.onclick = open;
  review.onclick = open;
  dismiss.onclick = () => (toast.hidden = true);
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
      button.title = state.available ? 'TS6 Enhanced — update available' : 'TS6 Enhanced';
      button.setAttribute('aria-label', button.title);
      if (!state.available) toast.hidden = true;
      if (state.available && state.available !== notified) {
        notified = state.available;
        message.textContent = `TS6 Enhanced ${state.available}`;
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
