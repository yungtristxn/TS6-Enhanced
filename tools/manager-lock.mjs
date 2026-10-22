// Kernel-owned pipe: complete owner state, automatic crash cleanup, no PID file.
import {createServer,createConnection} from 'node:net';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export async function claimManager(root){
  const id=createHash('sha256').update(resolve(root).toLowerCase()).digest('hex').slice(0,32);
  const path=process.platform==='win32'?`\\\\.\\pipe\\ts6-enhanced-${id}`:`\0ts6-enhanced-${id}`;
  let state={status:'starting'};
  const server=createServer(socket=>{socket.on('error',()=>{});socket.end(JSON.stringify(state))});
  try{
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(path,()=>{server.removeListener('error',fail);ok()})});
    return {owner:true,setState:value=>{state=value},close:()=>new Promise(r=>server.close(r))};
  }catch(e){if(!['EADDRINUSE','EACCES'].includes(e.code))throw e}
  // A second launcher must wait for the actual owner to attach, not equate a
  // running process with a working maintenance panel.
  for(let attempt=0;attempt<600;attempt++){
    const current=await new Promise((ok,fail)=>{
      const socket=createConnection(path);let text='';
      socket.setTimeout(1000,()=>socket.destroy(Error('Manager status timed out')));
      socket.on('data',data=>{text+=data;if(text.length>8192)socket.destroy(Error('Invalid manager status'))});
      socket.on('error',fail);socket.on('end',()=>{try{ok(JSON.parse(text))}catch(e){fail(e)}});
    });
    if(current.status==='ready')return {owner:false};
    if(current.status==='failed')throw Error(current.message||'Maintenance initialization failed');
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Maintenance controls did not finish loading. Launch TeamSpeak from Start Menu again.');
}
