// Owned management UI; native settings artwork is reused without changing it.
// Downloads and native actions remain in the authenticated local manager.
(() => {
  window.__tsixManager?.dispose();
  let root=document.querySelector('.tsv-window');if(!root)throw Error('No TeamSpeak main window');
  const host=document.createElement('div');host.id='tsix-manager';
  const style=document.createElement('style');style.textContent=`
    #tsix-manager{font:inherit;font-size:13px;font-weight:400;color:var(--tsv-font-color,#e6ebf4);--tsix-muted:var(--tsv-font-subtitle-color,#aeb9ca)}
    [data-tsix-manager-open]{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;box-sizing:border-box;margin:0 0 0 8px;padding:4px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--tsv-font-subtitle-color,#aeb9ca);font:inherit;font-size:12px;cursor:pointer;-webkit-app-region:no-drag}
    [data-tsix-manager-open]:not(:has(svg)){width:auto;flex-basis:auto;padding:4px 8px}
    [data-tsix-manager-open] svg{width:22px;height:22px;pointer-events:none}
    [data-tsix-manager-open] .tsv-icon-base-fill{fill:currentColor}
    [data-tsix-manager-open]::before{content:'';position:absolute;left:-6px;top:7px;height:16px;border-left:1px solid var(--tsv-separation-border-color,#39455a)}
    [data-tsix-manager-open]:hover,[data-tsix-manager-open][aria-expanded=true]{background:var(--tsv-shaded-bg,#263249);color:var(--tsv-font-color,#e6ebf4)}
    [data-tsix-manager-open][data-update]::after{content:'';position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--tsv-tint,#72bbff);box-shadow:0 0 0 2px var(--tsv-header-bg,#172034)}
    #tsix-manager dialog{font:inherit;width:360px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;margin:auto;padding:20px;border:1px solid var(--tsv-separation-border-color,#46536b);border-radius:8px;background:var(--tsv-shaded-bg,#202a3c);color:inherit;box-shadow:0 12px 48px #0007}
    #tsix-manager dialog::backdrop{background:#0006}
    #tsix-manager h2{margin:0;font-size:16px;line-height:24px;font-weight:600}
    #tsix-manager [data-version]{display:block;margin-top:2px;color:var(--tsix-muted);font-size:12px;line-height:18px}
    #tsix-manager p{margin:0;line-height:20px;font-weight:400;overflow-wrap:anywhere}
    #tsix-manager [data-overview]{margin-top:20px}
    #tsix-manager [data-status]{color:var(--tsix-muted)}
    #tsix-manager [data-update-action]{margin-top:12px}
    #tsix-manager button{font:inherit;line-height:18px;min-height:32px;cursor:pointer;border:1px solid var(--tsv-separation-border-color,#58677d);border-radius:5px;padding:6px 12px;color:inherit;background:var(--tsv-header-bg,#172034)}
    #tsix-manager button:hover:not(:disabled){filter:brightness(1.15)}
    #tsix-manager button:focus-visible,[data-tsix-manager-open]:focus-visible{outline:2px solid var(--tsv-tint,#78c5ff);outline-offset:2px}
    #tsix-manager button:disabled{opacity:.5;cursor:default}
    #tsix-manager [data-primary]{background:#255b91;border-color:#3978b6;color:#fff}
    #tsix-manager [data-destructive]{background:#803b48;border-color:#a1505e;color:#fff}
    #tsix-manager [data-remove]{padding-left:0;padding-right:0;border-color:transparent;background:transparent;color:#f2a8b2}
    #tsix-manager [data-footer]{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px;padding-top:14px;border-top:1px solid var(--tsv-separation-border-color,#39455a)}
    #tsix-manager [data-confirm]{margin-top:16px}
    #tsix-manager [data-consequence]{margin-top:10px;color:var(--tsix-muted)}
    #tsix-manager [data-confirm-actions]{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:20px}
    #tsix-manager details{margin-top:12px;color:var(--tsix-muted);font-size:12px}
    #tsix-manager summary{cursor:pointer}#tsix-manager details p{margin-top:8px;max-height:100px;overflow:auto;white-space:pre-wrap}
    #tsix-manager [data-toast]{position:fixed;top:48px;right:16px;width:272px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px;border-radius:8px;background:var(--tsv-shaded-bg,#24334b);border:1px solid var(--tsv-separation-border-color,#567fa4);box-shadow:0 6px 20px #0006;z-index:12}
    #tsix-manager [data-toast] strong{display:block;margin-bottom:4px;font-weight:600}#tsix-manager [data-toast] p{color:var(--tsix-muted)}
    #tsix-manager [data-toast-actions]{display:flex;gap:8px;margin-top:12px}
    #tsix-manager [hidden]{display:none!important}
    @media(forced-colors:active){#tsix-manager button,[data-tsix-manager-open]{border:1px solid ButtonText}#tsix-manager [data-remove]{color:ButtonText}#tsix-manager [data-status],#tsix-manager [data-version],#tsix-manager [data-consequence]{color:CanvasText}[data-tsix-manager-open][data-update]::after{background:Highlight}}
  `;
  const make=(tag,attribute,text)=>{const node=document.createElement(tag);if(attribute)node.setAttribute(attribute,'');if(text)node.textContent=text;return node};
  const action=(text,attribute)=>{const node=make('button',attribute,text);node.type='button';return node};
  const button=action('TS6 Enhanced','data-tsix-manager-open');button.title='TS6 Enhanced';button.setAttribute('aria-label','TS6 Enhanced');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','tsix-manager-dialog');
  const dialog=make('dialog');dialog.id='tsix-manager-dialog';dialog.setAttribute('aria-labelledby','tsix-manager-title');
  const title=make('h2',null,'TS6 Enhanced');title.id='tsix-manager-title';
  const version=make('span','data-version'),overview=make('div','data-overview'),status=make('p','data-status');status.id='tsix-manager-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.setAttribute('aria-describedby',status.id);
  const updateActions=make('div','data-update-action'),check=action('Check for updates'),update=action('Update…','data-primary');updateActions.append(check,update);
  const details=make('details'),summary=make('summary',null,'Details'),errorText=make('p');details.append(summary,errorText);details.hidden=true;
  const footer=make('div','data-footer'),remove=action('Uninstall…','data-remove'),close=action('Close');footer.append(remove,close);
  overview.append(status,updateActions,details,footer);
  const confirm=make('div','data-confirm');confirm.hidden=true;const warning=make('p',null,'TeamSpeak will restart and end any calls or streams.'),consequence=make('p','data-consequence');
  warning.id='tsix-manager-warning';consequence.id='tsix-manager-consequence';
  const confirmActions=make('div','data-confirm-actions'),accept=action(''),cancel=action('Cancel');confirmActions.append(cancel,accept);confirm.append(warning,consequence,confirmActions);
  const toast=make('div','data-toast');toast.setAttribute('role','status');toast.hidden=true;
  const toastTitle=make('strong',null,'Update available'),message=make('p'),toastActions=make('div','data-toast-actions'),review=action('View update'),dismiss=action('Later');toastActions.append(review,dismiss);toast.append(toastTitle,message,toastActions);
  dialog.append(title,version,overview,confirm);host.append(style,dialog,toast);root.append(host);
  let state={},nonce='',pending=null,notified='',initiator=null;
  const send=action=>{if(typeof window.__tsixMaintenanceRequest==='function'&&nonce)window.__tsixMaintenanceRequest(JSON.stringify({action,nonce}))};
  const reset=()=>{pending=null;confirm.hidden=true;overview.hidden=false;version.hidden=false;title.textContent='TS6 Enhanced';dialog.setAttribute('aria-describedby',status.id)};
  const open=()=>{toast.hidden=true;reset();if(!dialog.open)dialog.showModal();button.setAttribute('aria-expanded','true');close.focus()};
  const back=()=>{reset();initiator?.focus()};
  button.onclick=open;review.onclick=open;dismiss.onclick=()=>toast.hidden=true;close.onclick=()=>dialog.close();
  check.onclick=e=>{if(e.isTrusted&&!state.busy&&state.configured)send('check')};
  const ask=action=>{
    pending=action;initiator=action==='update'?update:remove;overview.hidden=true;version.hidden=true;confirm.hidden=false;
    title.textContent=action==='update'?'Update TS6 Enhanced?':'Uninstall TS6 Enhanced?';
    warning.textContent=action==='update'?'TeamSpeak stays open. Your calls and streams continue.':'TeamSpeak will restart and end any calls or streams.';
    dialog.setAttribute('aria-describedby',`${warning.id} ${consequence.id}`);
    consequence.textContent=action==='update'?'Download the latest release. Installation finishes next time you open TeamSpeak.':state.legacy?'Removes the theme. Other settings and personal data stay.':'Restores your previous appearance. Your accounts and chats stay.';
    accept.textContent=action==='update'?'Download update':'Uninstall';accept.toggleAttribute('data-primary',action==='update');accept.toggleAttribute('data-destructive',action==='uninstall');cancel.focus();
  };
  update.onclick=e=>{if(e.isTrusted&&!state.busy&&state.available)ask('update')};remove.onclick=e=>{if(e.isTrusted&&!state.busy)ask('uninstall')};cancel.onclick=back;
  accept.onclick=e=>{if(e.isTrusted&&pending&&!state.busy){send(pending);reset();close.focus()}};
  dialog.addEventListener('cancel',e=>{if(pending){e.preventDefault();back()}});
  dialog.addEventListener('close',()=>{reset();button.setAttribute('aria-expanded','false');button.focus()});
  const mount=()=>{
    root=document.querySelector('.tsv-window');if(!root)return;
    if(host.parentElement!==root)root.append(host);
    const toolbar=root.querySelector('.tsv-central-toolbar');if(toolbar&&button.parentElement!==toolbar)toolbar.append(button);
    if(!button.querySelector('svg')){
      const native=root.querySelector('svg[name="settings"],svg.tsv-icon-settings');
      if(native){const icon=native.cloneNode(true);icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');button.replaceChildren(icon)}
    }
  };
  const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();
  window.__tsixManager={setIcon(markup){
    if(button.querySelector('svg'))return;
    const svg=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;
    if(svg.localName!=='svg'||svg.getAttribute('viewBox')!=='0 0 22 22')throw Error('Unexpected native settings icon');
    const nodes=[svg,...svg.querySelectorAll('*')],tags=new Set(['svg','path','g','rect','circle']),attrs=new Set(['xmlns','width','height','viewBox','d','class','x','y','rx','ry','cx','cy','r']);
    if(nodes.some(node=>!tags.has(node.localName)))throw Error('Unexpected native settings artwork');
    for(const node of nodes)for(const attr of [...node.attributes])if(!attrs.has(attr.name))node.removeAttribute(attr.name);
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');button.replaceChildren(document.importNode(svg,true));
  },setState(next,token){
    if(pending==='update'&&next.available!==state.available){reset();close.focus()}
    state=next;nonce=token;version.textContent=`v${state.version}`;status.textContent=state.message;
    check.hidden=!state.configured||!!state.available||!!state.pending;check.disabled=!!state.busy;remove.disabled=!!state.busy;
    update.disabled=!!state.busy||!state.available;update.hidden=!state.available||!!state.pending;updateActions.hidden=check.hidden&&update.hidden;accept.disabled=!!state.busy;
    details.hidden=!state.detail;errorText.textContent=state.detail||'';if(!state.detail)details.open=false;
    button.toggleAttribute('data-update',!!state.available);button.title=state.available?'TS6 Enhanced — update available':'TS6 Enhanced';button.setAttribute('aria-label',button.title);
    if(!state.available)toast.hidden=true;
    if(state.available&&state.available!==notified){notified=state.available;message.textContent=`TS6 Enhanced ${state.available}`;toast.hidden=dialog.open}
  },dispose(){observer.disconnect();button.remove();host.remove();delete window.__tsixManager}};
  return {attached:true};
})()
