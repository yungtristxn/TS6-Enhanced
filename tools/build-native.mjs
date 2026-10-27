import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const output=resolve(process.argv[2]);
const root=fileURLToPath(new URL('../',import.meta.url));
const release=JSON.parse(await readFile(join(root,'release.json'),'utf8'));
await mkdir(output,{recursive:true});
const css=await readFile(join(root,'theme/layout.css'),'utf8');
if(/--tsix-layout-version:\s*([^;]+);/.exec(css)?.[1].trim()!==release.version)throw Error('CSS version marker differs from release.json');
const parts=[`const release=${JSON.stringify(release)};`];
for(const [name,file]of [['attachWorkspace','workspace-runtime.js'],['attachStreams','streams-runtime.js'],['attachManager','manager-runtime.js'],['attachSession','session-runtime.js'],['attachSessionGuard','session-guard.js']])parts.push(`function ${name}(){\n${await readFile(join(root,'tools',file),'utf8')}\n}`);
parts.push(await readFile(join(root,'tools/native-runtime.js'),'utf8'));
await writeFile(join(output,'payload.js'),parts.join('\n'));
await writeFile(join(output,'layout.css'),css);
await writeFile(join(output,'payload.rc'),'101 RCDATA "payload.js"\n102 RCDATA "layout.css"\n');
let header='#pragma once\n#include <array>\n';
const cssHash=release.supportedClient.resourceHashes?.['html/client_ui/main.css'];
if(!/^[a-f0-9]{64}$/i.test(cssHash||''))throw Error('Missing supported CSS SHA256');
header+=`constexpr std::array<unsigned char,32> TSIX_CSS_HASH={${cssHash.match(/../g).map(byte=>'0x'+byte).join(',')}};\n`;
for(const [name,file]of [['EXE','TeamSpeak.exe'],['CLIENT','TeamSpeak.dll'],['CEF','libcef.dll']]){
 const value=release.supportedClient.nativeImages?.[file];
 if(!Number.isInteger(value?.timestamp)||!Number.isInteger(value?.imageSize)||! /^[a-f0-9]{64}$/i.test(value?.sha256||''))throw Error(`Missing native compatibility metadata: ${file}`);
 header+=`constexpr unsigned long TSIX_${name}_STAMP=${value.timestamp}UL,TSIX_${name}_SIZE=${value.imageSize}UL;\n`;
}
await writeFile(join(output,'compatibility.h'),header);
