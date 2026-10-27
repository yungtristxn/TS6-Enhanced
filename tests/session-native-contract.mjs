// Execute the supported client's actual capture/publish methods against a
// recording bridge, so adapter tests do not merely agree with their own mocks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {clientPath} from './client-path.mjs';
export async function nativeSessionProtocol(source,quality,config,handlerId){
 const bundle=await readFile(clientPath+'/html/client_ui/main.js','utf8');
 const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
 const module=id=>{const signature=id+':(e,t,n)=>{',start=bundle.indexOf(signature)+signature.length,end=/},\d+:\(e,t,n\)=>\{/.exec(bundle.slice(start));assert.ok(start>=signature.length&&end);return bundle.slice(start,start+end.index)};
 const method=(text,name)=>{
  const start=text.indexOf(name);assert.ok(start>=0);
  let depth=0,quote=null,escape=false;
  for(let i=text.indexOf('{',start);i<text.length;i++){
   const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue}
   if(c==='"'||c==="'"||c===String.fromCharCode(96)){quote=c;continue}
   if(c==='{')depth++;else if(c==='}'&&!--depth)return text.slice(start,i+1);
  }
  throw Error('Native method boundary not found');
 };
 const outbound=module(20076),types=module(78087),calls=[];
 const audio=new Function('g','return '+method(types,'function r(e,t=!1)'))({INCLUDE_ONLY:0});
 class Channel{constructor(){this.sc_handler={id:handlerId}}}
 const backend={VIT:{Ok:0},c3w:Channel,Ay$:{screenshareSupport:{appAudio:{available:true}}}};
 const vm={_published:false,_publishingPromiseData:null,_loading:false,_refreshInFlight:false,_sourceRevision:0,id:-1,_quality:quality,config:structuredClone(config),
  close:()=>Promise.resolve(),updateFromInfo(value){this.id=value.sessionId},maybeDeleteAudioStats(){},drainRefreshQueue(){}};
 const bridge={postMessage(message,callback){calls.push(structuredClone(message));callback({err:0,payload:{session:{sessionId:41}}});if(message.cmd==='publishSession')vm._publishingPromiseData.resolve()}};
 const methods=[method(outbound,'switchSource(e){'),method(outbound,'publish(e){'),method(outbound,'getQualityWithCamOverrides(){')];
 Object.assign(vm,new Function('s','a','o','tsclient_internal','return ({'+methods.join(',')+'})')({Hp:{VOICE:5},Vr:audio,Ou:audio},backend,{warn(){}},bridge));
 await vm.switchSource(source);await vm.publish(new Channel());return calls;
}
