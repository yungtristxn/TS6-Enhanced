import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {version,compareVersions,displayVersion,selectRelease,releaseAsset,checkUpdate,verifyBytes,verifyInstaller,fetchBytes,stageUpdate,stageLatestUpdate,compatible,canApplyStyles,downloadStyles,createUpdateSession} from '../tools/updates.mjs';
const repo='example/layout',config={repository:repo,channel:'stable'};
const body=Buffer.alloc(128);body.write('MZ');body.writeUInt32LE(64,60);body.writeUInt32LE(0x4550,64);body.writeUInt16LE(0x14c,68);
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const manifest={version:'1.1.0',supportedClient:{resourceHashes:{'html/client_ui/main.js':'a'.repeat(64),'html/client_ui/main.css':'b'.repeat(64)}}};
const metadata=Buffer.from(JSON.stringify(manifest));
const asset=(name,bytes)=>({name,state:'uploaded',size:bytes.length,digest:digest(bytes),browser_download_url:`https://github.com/${repo}/releases/download/v1.1.0/${name}`});
const release={tag_name:'v1.1.0',draft:false,prerelease:false,published_at:'2026-10-21T10:00:00Z',assets:[asset('release.json',metadata),asset('TS6-Enhanced-1.1.0-Setup.exe',body)]};
const fetcher=async url=>new Response(url.includes('api.github.com')?JSON.stringify([release]):url.endsWith('release.json')?metadata:body,{status:200});
test('semantic versions order stable and numeric prereleases correctly',()=>{
 assert.equal(displayVersion('1.0.0'),'1.0');assert.equal(displayVersion('1.0.1'),'1.0.1');assert.ok(compareVersions('1.0.0','0.10.0-preview.10')>0);
 assert.ok(compareVersions('1.10.0','1.9.9')>0);assert.ok(compareVersions('1.0.0-preview.10','1.0.0-preview.2')>0);assert.ok(compareVersions('1.0.0','1.0.0-preview.10')>0);assert.equal(compareVersions('v1.0.0','1.0.0'),0);
 for(const bad of ['latest','../1.0.0','01.2.3','1.0.0;start'])assert.throws(()=>version(bad));
});
test('only newer published releases in the selected channel are offered',()=>{
 assert.equal(selectRelease([{...release,tag_name:'v1.0.0'}],'0.10.0-preview.10',{...config,channel:'preview'}).tag_name,'v1.0.0');
 const candidates=[{...release,draft:true,tag_name:'v9.0.0'},{...release,prerelease:true,tag_name:'v2.0.0-preview.1'},{...release,tag_name:'v3.0.0-dev.1'},release];
 assert.equal(selectRelease(candidates,'1.0.0',config).tag_name,'v1.1.0');assert.equal(selectRelease(candidates,'1.0.0',{...config,channel:'preview'}).tag_name,'v2.0.0-preview.1');assert.equal(selectRelease([release],'1.1.0',config),null);
});
test('release asset host, repository, size, digest and uniqueness are enforced',()=>{
 const a=release.assets[1];assert.equal(releaseAsset(release,a.name,repo,1024).size,body.length);
 for(const change of [{browser_download_url:'https://evil.example/payload.exe'},{size:2000},{digest:null},{state:'new'},{browser_download_url:a.browser_download_url.replace('/example/','/someone/')}])assert.throws(()=>releaseAsset({...release,assets:[{...a,...change}]},a.name,repo,1024));
 assert.throws(()=>releaseAsset({...release,assets:[a,a]},a.name,repo,1024));
});
test('check is disabled locally and verifies both manifest and installer contract',async()=>{
 assert.equal(await checkUpdate('1.0.0',{repository:null},{fetcher:()=>{throw Error('Must stay offline')}}),null);
 const found=await checkUpdate('1.0.0',config,{fetcher});assert.equal(found.version,'1.1.0');
 await assert.rejects(checkUpdate('1.0.0',config,{fetcher:async url=>url.endsWith('release.json')?new Response('tampered'):fetcher(url)}),/SHA-256/);
});
test('downloads reject an untrusted redirect and oversized contents',async()=>{
 await assert.rejects(fetchBytes(release.assets[0].browser_download_url,{limit:1000,fetcher:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})}),/redirect/);
 await assert.rejects(fetchBytes(release.assets[0].browser_download_url,{limit:2,fetcher:async()=>new Response('too large')}),/expected size/);
 assert.throws(()=>verifyBytes(Buffer.from('changed'),{size:7,sha256:'a'.repeat(64)}),/SHA-256/);
});
test('verified staging reuses exact bytes and replaces a corrupt cache only with verified bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tsix-updates-')),update=await checkUpdate('1.0.0',config,{fetcher});
 const path=await stageUpdate(update,root,{fetcher});assert.deepEqual(await readFile(path),body);
 assert.equal(await stageUpdate(update,root,{fetcher:()=>{throw Error('Must use verified cache')}}),path);
 const {writeFile,readdir}=await import('node:fs/promises');await writeFile(path,'changed');
 await assert.rejects(stageUpdate(update,root,{fetcher:async()=>new Response('bad replacement')}),/SHA-256/);
 await assert.rejects(readFile(path),{code:'ENOENT'});
 const rejected=(await readdir(root)).find(n=>n.endsWith('.rejected'));assert.equal(await readFile(join(root,rejected),'utf8'),'changed');
 assert.equal(await stageUpdate(update,root,{fetcher}),path);assert.deepEqual(await readFile(path),body);
});

test('download rechecks the latest release and never falls back to a stale offer',async()=>{
 const {mkdir,writeFile}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'tsix-latest-')),client=join(root,'client'),destination=join(root,'updates');
 await mkdir(join(client,'html/client_ui'),{recursive:true});
 const hashes={};for(const name of ['main.js','main.css']){const bytes=Buffer.from(name);await writeFile(join(client,'html/client_ui',name),bytes);hashes['html/client_ui/'+name]=digest(bytes).slice(7)}
 const responses=new Map(),downloads=[];
 const candidate=(v,resourceHashes=hashes)=>{
  const metadata=Buffer.from(JSON.stringify({version:v,updates:{deferredInstall:1},supportedClient:{resourceHashes}}));
  const bytes=Buffer.from(body);bytes.write(v,80);
  const assets=[['release.json',metadata],[`TS6-Enhanced-${v}-Setup.exe`,bytes]].map(([name,data])=>{const a={...asset(name,data),browser_download_url:`https://github.com/${repo}/releases/download/v${v}/${name}`};responses.set(a.browser_download_url,data);return a});
  return {...release,tag_name:'v'+v,assets};
 };
 const old=candidate('1.0.4'),latest=candidate('1.0.5');let published=[old],fail=false,lastHeaders;
 const fetcher=async(url,options)=>{
  if(url.includes('api.github.com')){lastHeaders=options.headers;if(fail)return new Response('',{status:503});return new Response(JSON.stringify(published))}
  if(url.endsWith('.exe'))downloads.push(url);
  assert.ok(responses.has(url));return new Response(responses.get(url));
 };
 const offer=await checkUpdate('1.0.3',config,{fetcher});assert.equal(offer.version,'1.0.4');
 published=[old,latest];let selected;
 const staged=await stageLatestUpdate('1.0.3',config,client,destination,{fetcher,onSelected:update=>selected=update.version});
 assert.equal(selected,'1.0.5');assert.equal(staged.update.version,'1.0.5');assert.equal(lastHeaders['Cache-Control'],'no-cache');
 assert.equal(downloads.length,1);assert.match(downloads[0],/1\.0\.5-Setup\.exe$/);assert.deepEqual(await readFile(staged.path),responses.get(downloads[0]));
 fail=true;await assert.rejects(stageLatestUpdate('1.0.3',config,client,destination,{fetcher}),/503/);
 fail=false;published=[];assert.equal(await stageLatestUpdate('1.0.3',config,client,destination,{fetcher}),null);
 published=[old,candidate('1.0.6',{'html/client_ui/main.js':'f'.repeat(64),'html/client_ui/main.css':hashes['html/client_ui/main.css']})];
 await assert.rejects(stageLatestUpdate('1.0.3',config,client,destination,{fetcher}),/different TeamSpeak version/);
 assert.equal(downloads.length,1,'A failed, withdrawn or incompatible release must not download an older installer');
});
test('installer format and installed TeamSpeak resources are checked before restart',async()=>{
 assert.throws(()=>verifyInstaller(Buffer.from('not a Windows installer')),/Windows/);assert.equal(verifyInstaller(body),body);
 const {mkdir,writeFile}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'tsix-compatibility-'));await mkdir(join(root,'html/client_ui'),{recursive:true});
 await writeFile(join(root,'html/client_ui/main.js'),'js fixture');await writeFile(join(root,'html/client_ui/main.css'),'css fixture');
 const hashes={'html/client_ui/main.js':digest(Buffer.from('js fixture')).slice(7),'html/client_ui/main.css':digest(Buffer.from('css fixture')).slice(7)},update={manifest:{supportedClient:{resourceHashes:hashes}}};
 assert.equal(await compatible(update,root),true);await writeFile(join(root,'html/client_ui/main.js'),'client update');assert.equal(await compatible(update,root),false);
 await assert.rejects(compatible({manifest:{supportedClient:{resourceHashes:{'../outside':'a'.repeat(64)}}}},root),/Unexpected/);
});

test('live styles require the same runtime and verified self-contained CSS',async()=>{
 const bytes=Buffer.from(':root { --tsix-layout-version: 1.1.0; }');
 const liveUpdate={schema:1,runtimeHash:'c'.repeat(64)};
 const metadata=Buffer.from(JSON.stringify({...manifest,liveUpdate}));
 const cssAsset=asset('TS6-Enhanced-1.1.0-layout.css',bytes);
 const candidate={...release,assets:[asset('release.json',metadata),release.assets[1],cssAsset]};
 const fetcher=async url=>new Response(url.includes('api.github.com')?JSON.stringify([candidate]):url.endsWith('release.json')?metadata:bytes);
 const update=await checkUpdate('1.0.0',config,{fetcher});
 assert.equal(canApplyStyles({liveUpdate},update),true);
 assert.equal(canApplyStyles({liveUpdate:{...liveUpdate,runtimeHash:'d'.repeat(64)}},update),false);
 assert.equal(canApplyStyles({},update),false);
 assert.equal(await downloadStyles(update,{fetcher}),bytes.toString());
 await assert.rejects(downloadStyles(update,{fetcher:async()=>new Response('tampered')}),/SHA-256/);
 const external=Buffer.from('@import "https://example.com/style.css";');
 const remote={...update,stylesheet:{size:external.length,sha256:digest(external).slice(7),browser_download_url:cssAsset.browser_download_url}};
 await assert.rejects(downloadStyles(remote,{fetcher:async()=>new Response(external)}),/external content/);
});

test('live updates finish without a pending notice and newer downloads replace the queue safely',async t=>{
 const {mkdir,writeFile,rm}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'tsix-update-session-')),client=join(root,'client');
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(client,'html/client_ui'),{recursive:true});
 const hashes={};for(const name of ['main.js','main.css']){await writeFile(join(client,'html/client_ui',name),name);hashes['html/client_ui/'+name]=digest(Buffer.from(name)).slice(7)}
 const installed={version:'1.0.8',updates:config,liveUpdate:{schema:1,runtimeHash:'c'.repeat(64)}};
 const responses=new Map();let published=[],failDownload=false,allowStyles=true,applied;
 const publish=(v,runtimeHash=installed.liveUpdate.runtimeHash)=>{
  const css=Buffer.from(`:root{--tsix-layout-version:${v}}`),metadata=Buffer.from(JSON.stringify({version:v,themeVersion:v,updates:{deferredInstall:1},supportedClient:{resourceHashes:hashes},liveUpdate:{schema:1,runtimeHash}}));
  const assets=[['release.json',metadata],[`TS6-Enhanced-${v}-Setup.exe`,body],[`TS6-Enhanced-${v}-layout.css`,css]].map(([name,data])=>{
   const a={...asset(name,data),browser_download_url:`https://github.com/${repo}/releases/download/v${v}/${name}`};responses.set(a.browser_download_url,data);return a;
  });
  published.push({...release,tag_name:'v'+v,assets});
 };
 const options={fetcher:async url=>new Response(url.includes('api.github.com')?JSON.stringify(published):failDownload&&url.endsWith('.exe')?'bad download':responses.get(url)),applyStyles:async(css,v)=>{if(!allowStyles)return false;applied=v;return true}};
 const start=()=>createUpdateSession(installed,client,root,options),receipt=join(root,'pending-update.json');
 let session=await start();publish('1.0.9');
 let state=await session.download();assert.equal(state.version,'1.0.9');assert.equal(state.pending,null);assert.equal(applied,'1.0.9');assert.doesNotMatch(state.message,/restart|launch|install/i);
 assert.equal((await session.check()).available,null,'Do not offer the already applied release again');
 session=await start();state=await session.restore({reset:true});assert.equal(state.version,'1.0.9');assert.equal(state.pending,null,'Reattachment restores the verified live appearance');
 publish('1.0.10');assert.equal((await session.check()).available,'1.0.10');
 state=await session.download();assert.equal(state.version,'1.0.10');assert.equal(state.pending,null);
 let saved=JSON.parse(await readFile(receipt,'utf8'));assert.equal(saved.version,'1.0.10');assert.equal(saved.fromVersion,'1.0.8','The installer must still target the actual installed base');
 publish('1.0.11','d'.repeat(64));state=await session.download();assert.equal(state.version,'1.0.10');assert.equal(state.pending,'1.0.11');assert.match(state.message,/next time/);
 saved=JSON.parse(await readFile(receipt));
 await writeFile(join(root,'native-error.json'),JSON.stringify({message:'Fixture installer failure',update:{version:saved.version,sha256:saved.sha256}}));
 state=await session.check();assert.match(state.message,/couldn’t finish/);assert.equal(state.detail,'Fixture installer failure');
 publish('1.0.12','d'.repeat(64));assert.equal((await session.check()).available,'1.0.12','A queued runtime update must not block checks');
 const previous=await readFile(receipt);failDownload=true;await assert.rejects(session.download(),/SHA-256/);assert.deepEqual(await readFile(receipt),previous);assert.equal(session.snapshot().pending,'1.0.11');
 failDownload=false;state=await session.download();assert.equal(state.pending,'1.0.12');assert.equal(JSON.parse(await readFile(receipt,'utf8')).version,'1.0.12');
 assert.equal(state.detail,null,'A newer queued update must not inherit the previous installer failure');
 session=await start();state=await session.restore({reset:true});assert.equal(state.version,'1.0.10');assert.equal(state.pending,'1.0.12','Restore active CSS while a newer runtime waits');
 publish('1.0.13');allowStyles=false;state=await session.download();assert.equal(state.ready,'1.0.13');assert.equal(state.pending,null,'Temporarily blocked CSS does not require a restart');assert.doesNotMatch(state.message,/restart|next time/i);
 const withdrawn=published.pop(),savedReady=await readFile(receipt);await assert.rejects(session.download(),/no longer published/);assert.deepEqual(await readFile(receipt),savedReady,'Retry must not replace a withdrawn release with an older download');published.push(withdrawn);
 const publishedBefore=published;published=[];assert.match((await session.download()).message,/no longer published/);assert.deepEqual(await readFile(receipt),savedReady);published=publishedBefore;
 allowStyles=true;state=await session.download();assert.equal(state.version,'1.0.13');assert.equal(state.ready,null);assert.equal(state.pending,null);
 saved=JSON.parse(await readFile(receipt,'utf8'));saved.liveStyles.css+='tampered';await writeFile(receipt,JSON.stringify(saved));
 session=await start();state=await session.restore({reset:true});assert.equal(state.version,'1.0.8');assert.equal(state.ready,'1.0.13');assert.equal(state.pending,null);assert.match(state.detail,/SHA-256/);
});
