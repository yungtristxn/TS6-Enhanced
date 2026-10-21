import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {plainPath} from './install-state.mjs';
export function version(value){
  const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if(!m)throw Error('Invalid release version');
  return {text:value.replace(/^v/,''),core:m.slice(1,4).map(Number),pre:m[4]?.split('.')||[]};
}
export function compareVersions(a,b){
  const x=version(a),y=version(b);
  for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return Math.sign(x.core[i]-y.core[i]);
  if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1;
  for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
    const p=x.pre[i],q=y.pre[i];if(p===q)continue;if(p===undefined)return -1;if(q===undefined)return 1;
    const n=/^\d+$/.test(p),m=/^\d+$/.test(q);if(n&&m)return Math.sign(Number(p)-Number(q));if(n!==m)return n?-1:1;return p<q?-1:1;
  }return 0;
}
export function displayVersion(value){
  const v=version(value);
  return !v.pre.length&&v.core[2]===0?v.core.slice(0,2).join('.'):v.text;
}
export function repository(value){if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value)||value.split('/')[1]==='..')throw Error('Invalid GitHub repository');return value}
export function selectRelease(releases,current,config){
  repository(config.repository);version(current);
  if(!Array.isArray(releases))throw Error('Unexpected GitHub response');
  return releases.filter(r=>{
    if(r.draft||!r.published_at||(r.prerelease&&config.channel!=='preview'))return false;
    try{return compareVersions(r.tag_name,current)>0&&!version(r.tag_name).pre.includes('dev')}catch{return false}
  }).sort((a,b)=>compareVersions(b.tag_name,a.tag_name))[0]||null;
}
export function releaseAsset(release,name,repo,maxBytes){
  const matches=release.assets?.filter(a=>a.name===name)||[];
  if(matches.length!==1)throw Error(`Release is incomplete: ${name}`);
  const a=matches[0],url=new URL(a.browser_download_url);
  const expected=`/${repository(repo)}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`;
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.search||url.hash||url.pathname!==expected)throw Error('Release asset is outside the configured repository');
  if(a.state!=='uploaded'||!Number.isSafeInteger(a.size)||a.size<=0||a.size>maxBytes||!/^sha256:[a-f0-9]{64}$/i.test(a.digest||''))throw Error('Release asset has no valid size or SHA-256 digest');
  return {...a,sha256:a.digest.slice(7).toLowerCase()};
}
export async function fetchBytes(url,{limit,fetcher=fetch,accept='application/octet-stream'}={}){
  let current=new URL(url);
  const hosts=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
  for(let i=0;i<6;i++){
    if(current.protocol!=='https:'||!hosts.has(current.hostname)||current.username||current.password)throw Error('Unexpected download redirect');
    const response=await fetcher(current.href,{headers:{Accept:accept,'User-Agent':'TS6-Enhanced','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(120000)});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');if(!next)throw Error('Missing redirect');current=new URL(next,current);continue}
    if(!response.ok)throw Error(response.status===403||response.status===429?'GitHub update checks are temporarily rate limited':`Download failed (${response.status})`);
    const chunks=[];let size=0;
    for await(const part of response.body){size+=part.length;if(size>limit)throw Error('Download exceeded its expected size');chunks.push(part)}
    return Buffer.concat(chunks);
  }throw Error('Too many download redirects');
}
export function verifyBytes(bytes,asset){if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Downloaded release failed SHA-256 verification');return bytes}
export function verifyInstaller(bytes){
  const offset=bytes.length>=64?bytes.readUInt32LE(60):0;
  if(bytes.toString('ascii',0,2)!=='MZ'||offset<64||offset+6>bytes.length||bytes.readUInt32LE(offset)!==0x4550||![0x14c,0x8664].includes(bytes.readUInt16LE(offset+4)))throw Error('Release asset is not a Windows x86/x64 installer');
  return bytes;
}
export async function checkUpdate(current,config,{fetcher=fetch}={}){
  if(!config?.repository)return null;
  const raw=await fetchBytes(`https://api.github.com/repos/${repository(config.repository)}/releases?per_page=30`,{limit:2*1024*1024,fetcher,accept:'application/vnd.github+json'});
  const selected=selectRelease(JSON.parse(raw),current,config);if(!selected)return null;
  const v=version(selected.tag_name).text;
  const metadata=releaseAsset(selected,'release.json',config.repository,65536);
  const manifest=JSON.parse(verifyBytes(await fetchBytes(metadata.browser_download_url,{limit:metadata.size,fetcher}),metadata));
  if(manifest.version!==v)throw Error('Release metadata does not match its tag');
  const hashes=manifest.supportedClient?.resourceHashes;
  if(!hashes||Object.keys(hashes).length!==2||!['html/client_ui/main.js','html/client_ui/main.css'].every(p=>/^[a-f0-9]{64}$/i.test(hashes[p]||'')))throw Error('Invalid TeamSpeak compatibility metadata');
  const installer=releaseAsset(selected,`TS6-Enhanced-${v}-Setup.exe`,config.repository,512*1024*1024);
  return {version:v,manifest,installer};
}
export async function compatible(update,client){
  for(const [file,hash]of Object.entries(update.manifest.supportedClient.resourceHashes)){
    if(!['html/client_ui/main.js','html/client_ui/main.css'].includes(file))throw Error('Unexpected client resource');
    const bytes=await readFile(join(client,file));if(createHash('sha256').update(bytes).digest('hex').toLowerCase()!==hash.toLowerCase())return false;
  }return true;
}
export async function stageUpdate(update,root,options={}){
  await plainPath(root);await mkdir(root,{recursive:true});
  const name=`TS6-Enhanced-${version(update.version).text}-Setup.exe`,path=join(root,name);
  await plainPath(path);
  let cached;
  try{cached=await readFile(path)}catch(e){if(e.code!=='ENOENT')throw e}
  if(cached){
    try{verifyInstaller(verifyBytes(cached,update.installer));return path}
    catch{await rename(path,`${path}.${randomUUID()}.rejected`)}
  }
  const bytes=verifyInstaller(verifyBytes(await fetchBytes(update.installer.browser_download_url,{...options,limit:update.installer.size}),update.installer));
  const partial=`${path}.${randomUUID()}.partial`;
  try{await writeFile(partial,bytes,{flag:'wx'});await rename(partial,path)}finally{await unlink(partial).catch(e=>{if(e.code!=='ENOENT')throw e})}
  return path;
}
