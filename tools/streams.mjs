// Optional main-window stream stage. Node 22+, same loopback/process checks as
// the workspace helper. No client launch, native patches or stream start/stop.
import {connect} from './cdp.mjs';
import {readFile} from 'node:fs/promises';
const [command='status',...args]=process.argv.slice(2);
if(!['attach','remove','status'].includes(command))throw Error('Use attach, remove, or status');
const i=args.indexOf('--port'),port=Number(i<0?9988:args[i+1]);
const c=await connect({port});
try {
  await c.evaluate(`(async()=>{
    const build=await new Promise(r=>tsclient_internal.getClientLibVersion((e,b)=>r(e?-1:b)));
    if(build!==1791901251)throw Error('Unsupported build; re-audit stream layout before attaching');
  })()`);
  if(command==='attach') {
    if(!await c.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--tsix-stream-stage-api').trim()==='1'`))throw Error('Load the project theme first');
    console.log(JSON.stringify(await c.evaluate(await readFile(new URL('./streams-runtime.js',import.meta.url),'utf8'))));
  }
  if(command==='remove')await c.evaluate('window.__tsixStreams?.dispose()');
  console.log(JSON.stringify(await c.evaluate(`({helper:window.__tsixStreams?.version??null,viewers:[...document.querySelectorAll('.tsv-screenshare')].filter(e=>e.__vue__?.$refs.fullArea).map(e=>({stage:e.getAttribute('data-tsix-stream-stage'),split:e.__vue__.overrideSplitPercentage,availableHeight:e.__vue__.maximumHeight,videoHeight:e.__vue__.maximumVideoHeight,tiles:e.querySelectorAll('.screen-video-wrapper,.screen-tile-wrapper--video').length}))})`),null,2));
} finally {c.close();}
