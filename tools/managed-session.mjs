// Follow the main renderer for this client session. Never start/restart TeamSpeak.
import {setTimeout as delay} from 'node:timers/promises';

export function isSessionTransition(error){
  return error.code==='TSIX_DISCOVERY_UNAVAILABLE'||/CDP disconnected|CDP connection (failed|timeout)|Expected one TS6 target|TS6 document identity check failed|Cannot find context|Execution context was destroyed|Inspected target navigated or closed|Main renderer is not ready|TeamSpeak did not answer its version check|Exit fullscreen before attaching/.test(error.message);
}

export async function maintainSession({open,attach,onState=()=>{},signal,retryMs=500,recoveryMs=30000}){
  let client,mainFrameId,contextRevision=0,closed=false,wake,deadline=Date.now()+recoveryMs,ready=false,everConnected=false;
  const contexts=new Map();let subscriptions=[];
  const changed=()=>{
    contextRevision++;
    if(ready){ready=false;deadline=Date.now()+recoveryMs;onState({status:'recovering'})}
    wake?.();wake=null;
  };
  const detach=()=>{
    for(const off of subscriptions)off();subscriptions=[];
    const old=client;client=null;old?.close();contexts.clear();mainFrameId=null;
  };
  signal?.addEventListener('abort',changed);
  await onState({status:'starting'});
  try{
    while(!signal?.aborted){
      try{
        if(!ready&&Date.now()>=deadline)throw Error('Main renderer recovery timed out. Launch the managed shortcut again to retry.');
        if(!client){
          client=await open();everConnected=true;closed=false;contexts.clear();
          subscriptions.push(client.on('Runtime.executionContextCreated',({context})=>{
            if(context.auxData?.isDefault){contexts.set(context.id,context);if(!mainFrameId||context.auxData.frameId===mainFrameId)changed()}
          }));
          subscriptions.push(client.on('Runtime.executionContextDestroyed',({executionContextId})=>{
            const context=contexts.get(executionContextId);
            if(contexts.delete(executionContextId)&&(!mainFrameId||context.auxData.frameId===mainFrameId))changed();
          }));
          subscriptions.push(client.on('Runtime.executionContextsCleared',()=>{contexts.clear();changed()}));
          const connection=client;
          client.onClose(()=>{if(client===connection){closed=true;changed()}});
          await client.send('Runtime.enable');
        }
        if(closed)throw Error('CDP disconnected');
        const revision=contextRevision;
        const {frameTree}=await client.send('Page.getFrameTree');
        mainFrameId=frameTree.frame.id;
        const context=[...contexts.values()].find(c=>c.origin==='tsui://default'&&c.auxData?.frameId===frameTree.frame.id);
        if(!context)throw Error('Main renderer is not ready');
        await attach(client,context.id);
        if(signal?.aborted)break;
        // A document may disappear while its attachment awaits the native bridge.
        if(closed||revision!==contextRevision){onState({status:'recovering'});continue}
        ready=true;await onState({status:'ready'});
        await new Promise(resolve=>{wake=resolve;if(closed||revision!==contextRevision||signal?.aborted){wake=null;resolve()}});
      }catch(error){
        if(signal?.aborted)break;
        // The browser listener disappears on normal client exit. Do not remain
        // as a background watcher or occupy the manager lease on the next launch.
        if(error.code==='TSIX_NO_LISTENER'&&everConnected)return;
        if(!isSessionTransition(error)||Date.now()>=deadline)throw error;
        if(closed||!client)detach();
        await delay(retryMs,undefined,{signal}).catch(error=>{if(error.name!=='AbortError')throw error});
      }
      if(closed)detach();
    }
  }finally{
    signal?.removeEventListener('abort',changed);detach();await onState({status:'stopped'});
  }
}
