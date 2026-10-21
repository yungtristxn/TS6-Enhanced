import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {version,compareVersions,selectRelease,releaseAsset,checkUpdate,verifyBytes,verifyInstaller,fetchBytes,stageUpdate,compatible} from '../tools/updates.mjs';
const repo='example/layout',config={repository:repo,channel:'stable'};
const body=Buffer.alloc(128);body.write('MZ');body.writeUInt32LE(64,60);body.writeUInt32LE(0x4550,64);body.writeUInt16LE(0x14c,68);
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const manifest={version:'1.1.0',supportedClient:{resourceHashes:{'html/client_ui/main.js':'a'.repeat(64),'html/client_ui/main.css':'b'.repeat(64)}}};
const metadata=Buffer.from(JSON.stringify(manifest));
const asset=(name,bytes)=>({name,state:'uploaded',size:bytes.length,digest:digest(bytes),browser_download_url:`https://github.com/${repo}/releases/download/v1.1.0/${name}`});
const release={tag_name:'v1.1.0',draft:false,prerelease:false,published_at:'2026-10-21T10:00:00Z',assets:[asset('release.json',metadata),asset('TS6-Enhanced-1.1.0-Setup.exe',body)]};
const fetcher=async url=>new Response(url.includes('api.github.com')?JSON.stringify([release]):url.endsWith('release.json')?metadata:body,{status:200});
test('semantic versions order stable and numeric prereleases correctly',()=>{
 assert.ok(compareVersions('1.10.0','1.9.9')>0);assert.ok(compareVersions('1.0.0-preview.10','1.0.0-preview.2')>0);assert.ok(compareVersions('1.0.0','1.0.0-preview.10')>0);assert.equal(compareVersions('v1.0.0','1.0.0'),0);
 for(const bad of ['latest','../1.0.0','01.2.3','1.0.0;start'])assert.throws(()=>version(bad));
});
test('only newer published releases in the selected channel are offered',()=>{
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
test('installer format and installed TeamSpeak resources are checked before restart',async()=>{
 assert.throws(()=>verifyInstaller(Buffer.from('not a Windows installer')),/Windows/);assert.equal(verifyInstaller(body),body);
 const {mkdir,writeFile}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'tsix-compatibility-'));await mkdir(join(root,'html/client_ui'),{recursive:true});
 await writeFile(join(root,'html/client_ui/main.js'),'js fixture');await writeFile(join(root,'html/client_ui/main.css'),'css fixture');
 const hashes={'html/client_ui/main.js':digest(Buffer.from('js fixture')).slice(7),'html/client_ui/main.css':digest(Buffer.from('css fixture')).slice(7)},update={manifest:{supportedClient:{resourceHashes:hashes}}};
 assert.equal(await compatible(update,root),true);await writeFile(join(root,'html/client_ui/main.js'),'client update');assert.equal(await compatible(update,root),false);
 await assert.rejects(compatible({manifest:{supportedClient:{resourceHashes:{'../outside':'a'.repeat(64)}}}},root),/Unexpected/);
});
