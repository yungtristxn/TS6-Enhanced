// CSS-only handoff. Never reload helpers, dispose audio graphs or replace media nodes.
export async function applyLiveStyles(client,css,themeVersion){
  if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(themeVersion||''))throw Error('Invalid theme version');
  return client.evaluate(`(() => {
    const current=document.getElementById('userStyle');
    if(!current?.href.includes('/local.tsix.layout/')||current.disabled)return false;
    const id='tsix-live-release-style',previous=document.getElementById(id),old=previous?.textContent;
    if(previous?.media==='all'&&old===${JSON.stringify(css)}&&getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()===${JSON.stringify(themeVersion)})return true;
    if(document.fullscreenElement)return false;
    const style=previous||document.createElement('style'),oldMedia=style.media;style.id=id;
    try {
      style.textContent=${JSON.stringify(css)};
      style.media='all';
      if(!previous)document.head.append(style);
      if(getComputedStyle(document.documentElement).getPropertyValue('--tsix-layout-version').trim()!==${JSON.stringify(themeVersion)})throw Error('Live stylesheet version did not match');
      if(window.__tsixLiveStyles?.element!==style){
        window.__tsixLiveStyles?.dispose();
        const refresh=()=>{
          const link=document.getElementById('userStyle');
          const media=link?.href.includes('/local.tsix.layout/')&&!link.disabled?'all':'not all';
          if(style.media!==media){style.media=media;window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync()}
        };
        const observer=new MutationObserver(refresh);
        observer.observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:['href','disabled']});
        window.__tsixLiveStyles={element:style,dispose(){observer.disconnect();style.remove();delete window.__tsixLiveStyles}};
        refresh();
      }
      window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync();
      return true;
    }catch(error){
      if(previous){previous.textContent=old;previous.media=oldMedia}else style.remove();
      window.__tsixWorkspace?.refresh();window.__tsixStreams?.sync();throw error;
    }
  })()`);
}
