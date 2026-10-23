// Inspection and uninstall recovery transport. No client launch or remote hosts.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// CEF may expose its bridge before the native callback is ready. A timer keeps
// the resolver alive (avoiding "Promise was collected") and bounds each try.
export async function readClientBuild(c) {
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const build=await c.evaluate(`new Promise(resolve=>{
        const timer=setTimeout(()=>resolve(null),2000);
        try{tsclient_internal.getClientLibVersion((error,build)=>{clearTimeout(timer);resolve(error?null:build)})}
        catch{clearTimeout(timer);resolve(null)}
      })`);
      if(Number.isInteger(build))return build;
    }catch(error){if(!/Promise was collected|Cannot find context|Execution context was destroyed/.test(error.message))throw error}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('TeamSpeak did not answer its version check. Wait for startup to finish and retry.');
}

export function verifyListener(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port');
  const script = `$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq ${port}); if (!$listeners.Count) { 'missing'; exit 0 }; $expected=Join-Path $env:LOCALAPPDATA 'Programs\\TeamSpeak\\TeamSpeak.exe'; foreach($listener in $listeners) { if($listener.LocalAddress -notin @('127.0.0.1','::1')) { throw 'Non-loopback listener refused' }; $owner=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$listener.OwningProcess); if($owner.ExecutablePath -ne $expected) { throw 'Listener is not the installed TeamSpeak client' } }; 'verified'`;
  // Node does not perform PowerShell 7's WinPSModulePath handoff. In particular,
  // a portable PS7 install must not supply its modules to Windows PowerShell.
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH'));
  const powershell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  let result;
  try {result=execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'pipe', env, timeout:30000 }).toString().trim();}
  catch(error){throw Error(`Could not verify TeamSpeak's local connection. ${String(error.stderr||error.message).trim()}`);}
  if(result==='missing')throw Object.assign(Error('TeamSpeak has no local inspection listener. Use scripts/Start-Inspection.ps1 while the client is closed.'),{code:'TSIX_NO_LISTENER'});
  if(result!=='verified')throw Error('Unexpected TeamSpeak listener verification result');
}

export async function targets(port = 9988) {
  verifyListener(port);
  let response;
  try{response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000), redirect: 'error' })}
  catch(error){throw Object.assign(Error(`TeamSpeak target discovery is temporarily unavailable: ${error.message}`),{code:'TSIX_DISCOVERY_UNAVAILABLE'})}
  if (!response.ok) throw Error(`Target discovery failed: ${response.status}`);
  return (await response.json()).filter(t => t.type === 'page' && t.url.startsWith('tsui://default/index.html'));
}

export async function connect({ port = 9988, targetId, context = 'main' } = {}) {
  const candidates = (await targets(port)).filter(t => targetId ? t.id === targetId : !new URL(t.url).searchParams.has('popup'));
  if (candidates.length !== 1) throw Error('Expected one TS6 target; select an explicit target ID.');
  const target = candidates[0];
  const url = new URL(target.url);
  const actualContext = url.searchParams.has('popup') ? 'popup' : 'main';
  if (actualContext !== context) throw Error(`Expected ${context}, found ${actualContext}`);
  const wsUrl = new URL(target.webSocketDebuggerUrl);
  if (wsUrl.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(wsUrl.hostname) || Number(wsUrl.port) !== port || wsUrl.pathname !== `/devtools/page/${target.id}`) throw Error('Unexpected debugger URL');
  wsUrl.hostname = '127.0.0.1';
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(Error('CDP connection timeout')); }, 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('CDP connection failed')); }, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  const failAll = () => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('CDP disconnected')); } pending.clear(); };
  ws.addEventListener('close', failAll);
  ws.addEventListener('error', failAll);
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if(data.method){for(const callback of listeners.get(data.method)||[])callback(data.params);return}
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    data.error ? entry.reject(Error(data.error.message)) : entry.resolve(data.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if(ws.readyState!==WebSocket.OPEN){reject(Error('CDP disconnected'));return}
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description ?? ''));
    return result.result.value;
  };
  try {
    const identity = await evaluate('({origin:location.origin,path:location.pathname,popup:new URLSearchParams(location.search).has("popup"),bridge:typeof tsclient_internal})');
    if (identity.origin !== 'tsui://default' || identity.path !== '/index.html' || identity.bridge !== 'object' || identity.popup !== (context === 'popup')) throw Error('TS6 document identity check failed');
  } catch(error) {ws.close();failAll();throw error;}
  return { send, evaluate, on(method,callback){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(callback);return()=>listeners.get(method)?.delete(callback)},
    onClose(callback){ws.addEventListener('close',callback,{once:true})},close: () => ws.close(), targetId: target.id, context: actualContext };
}
