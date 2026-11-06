// The installed client's own grid layout function, wrapped by the owned grid
// chooser from tools/streams/layout.js. Synthetic streams; no client launched.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {clientPath} from './client-path.mjs';
const bundle=await readFile(`${clientPath}/html/client_ui/main.js`,'utf8');
const release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bundle).digest('hex').toUpperCase(),release.supportedClient.resourceHashes['html/client_ui/main.js']);
// Webpack modules by id. The stream view's runLayout calls a module-private
// layout function; find both by content, never by a build's minified names.
const moduleAt=start=>{const end=/},\d+:\((?:e,t,n|e,t|e)\)=>\{/.exec(bundle.slice(start));assert.ok(end);return bundle.slice(start,start+end.index)};
const headers=[...bundle.matchAll(/(\d+):\((?:e,t,n|e,t|e)\)=>\{/g)];
const moduleSource=id=>{const header=headers.find(h=>h[1]===String(id));assert.ok(header,'Missing native module '+id);return moduleAt(header.index+header[0].length)};
const owner=headers.filter(h=>h.index<bundle.indexOf('runLayout(e){const t=this.buildPageInput()')).at(-1);
const view=moduleAt(owner.index+owner[0].length);
const layoutName=/runLayout\(e\)\{[^]*?return ([$\w]+)\(\{\.\.\.t,pipPlacements/.exec(view)?.[1];
assert.ok(layoutName&&view.includes('chosen:"card-grid"'),'Native card-grid layout not found');
// Only the tile-spec and identity helpers run for real; other imports are
// inert stand-ins (the layout function is pure geometry over its input).
const helpers=new Set([...view.matchAll(/([$\w]+)=n\((\d+)\)/g)].filter(([,alias])=>new RegExp('\\(0,'+alias.replace('$','\\$')+'\\.[$\\w]+\\)\\(e\\)|'+alias.replace('$','\\$')+'\\.wI\\.').test(view)).map(([,,id])=>Number(id)));
const inert=()=>new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='prototype'?{}:k==='then'?undefined:inert(),apply:()=>inert(),construct:()=>inert()});
const loaded={};
const require=id=>{if(!helpers.has(id))return inert();if(loaded[id])return loaded[id].exports;const module={exports:{}};loaded[id]=module;new Function('e','t','n',moduleSource(id))(module,module.exports,require);return module.exports};
require.d=(target,props)=>{for(const [key,get] of Object.entries(props))if(!Object.hasOwn(target,key))Object.defineProperty(target,key,{get,enumerable:true})};require.r=()=>{};require.n=value=>()=>value;require.o=(o,k)=>Object.hasOwn(o,k);
const scope={};new Function('e','t','n','scope',`${view};scope.layout=${layoutName};`)({},{},require,scope);
// The owned chooser, exactly as shipped, with the theme marked active.
const owned=await readFile(new URL('../tools/streams/layout.js',import.meta.url),'utf8');
const chooser=owned.slice(owned.indexOf('const videoTiles ='),owned.indexOf('function releaseEvenGrid('));
assert.ok(chooser.includes('function installEvenGrid('));
const {installEvenGrid}=new Function(`const themeActive=()=>true;${chooser};return {installEvenGrid};`)();
const checks=[];
const stream=id=>({id,isInbound:true,idData:{serverSessionId:id},status:4,client:{properties:{uniqueIdentifier:'owner-'+id}}});
const view$=(count,mode={kind:'auto'},popout=false)=>{
 const input={calls:[],streams:[...Array(count)].map((_,i)=>stream('s'+i)),layoutMode:mode,tileMeasurements:{},pipPlacements:[],tileOrder:[],streamArrival:{},seatArrival:{}};
 const vm={calls:0,item:{layoutMode:mode},isPopout:popout,maximumWidth:0,maximumHeight:0,runLayout(box){this.calls++;return scope.layout(input,box)}};
 const native=box=>scope.layout(input,box);
 installEvenGrid({vm});return {vm,native};
};
const tiles=result=>result.blocks.flatMap(b=>b.positioned.flatMap(p=>p.tiles.filter(t=>t.tile?.payload?.kind==='video').map(t=>({x:b.origin.x+t.x,y:b.origin.y+p.y+t.y,w:t.w,h:t.h}))));
const box=(w,h)=>({w,h,gapX:8,gapY:12,page:0});
const area=list=>list.length*Math.min(...list.map(t=>t.w*t.h));
// Two streams on a tall stage (hidden chat): native keeps them side by side.
{
 const {vm,native}=view$(2);const before=tiles(native(box(1500,940))),after=tiles(vm.runLayout(box(1500,940)));
 assert.equal(before.length,2);assert.equal(Math.round(before[0].y),Math.round(before[1].y),'Native places two streams side by side');
 assert.equal(after.length,2);assert.ok(after[1].y>=after[0].y+after[0].h,'The chooser stacks them');
 assert.ok(Math.abs(after[0].w-after[1].w)<4&&Math.abs(after[0].h-after[1].h)<4,'Stacked streams are the same size');
 assert.ok(area(after)>=area(before)*1.15,`Each stream grows: ${Math.round(before[0].w)}x${Math.round(before[0].h)} -> ${Math.round(after[0].w)}x${Math.round(after[0].h)}`);
 const left=Math.min(...after.map(t=>t.x)),right=Math.max(...after.map(t=>t.x+t.w)),top=Math.min(...after.map(t=>t.y)),bottom=Math.max(...after.map(t=>t.y+t.h));
 assert.ok(Math.abs(left-(1500-right))<=1,'Centred horizontally');assert.ok(Math.abs(top-(940-bottom))<=2,'Centred vertically');
 assert.ok(right<=1500&&bottom<=940&&left>=0&&top>=0);
 const calls=vm.calls;vm.runLayout(box(1500,940));assert.equal(vm.calls-calls,2,'A repeated layout reuses the cached choice');
 checks.push(`Two streams on a tall stage stack at equal size and centre: ${Math.round(before[0].w)}x${Math.round(before[0].h)} -> ${Math.round(after[0].w)}x${Math.round(after[0].h)} each`);
}
// A short, wide stage: native side by side is already best and is kept as is.
{
 const {vm,native}=view$(2);assert.deepEqual(tiles(vm.runLayout(box(1500,620))),tiles(native(box(1500,620))));
 checks.push('A wide stage keeps the native side-by-side grid unchanged');
}
// Uneven native grids (one stream across the width over a thin row) become even.
for(const [count,w,h] of [[2,1200,940],[3,1500,620],[4,1900,1000],[5,1200,940]]){
 const {vm,native}=view$(count);const before=tiles(native(box(w,h))),after=tiles(vm.runLayout(box(w,h)));
 const heights=after.map(t=>t.h);assert.equal(after.length,before.length);
 assert.ok(Math.max(...heights)<=Math.min(...heights)*1.5,`${count} streams at ${w}x${h} are even`);
 assert.ok(area(after)>=area(before),`${count} streams at ${w}x${h}: the smallest stream does not shrink`);
 for(const t of after)assert.ok(t.x>=0&&t.y>=0&&t.x+t.w<=w+0.5&&t.y+t.h<=h+0.5,'Tiles stay inside the stage');
}
checks.push('Uneven native grids for 2-5 streams become even without shrinking the smallest stream or leaving the stage');
// Focus, pop-outs and single streams keep the native result.
for(const [label,args,size] of [['focus',[2,{kind:'focus',tileId:'x'}],box(1500,940)],['pop-out',[2,{kind:'auto'},true],box(1500,940)],['single stream',[1],box(1500,940)]]){
 const {vm,native}=view$(...args);assert.deepEqual(tiles(vm.runLayout(size)),tiles(native(size)),label+' keeps the native layout');
}
checks.push('Focus, pop-outs and a single stream keep the native layout');
// Large stages stay cheap enough for live resizing (cache misses only).
{
 const {vm}=view$(4);const started=performance.now();for(let i=0;i<10;i++)vm.runLayout(box(2500-i*7,1300));
 const each=(performance.now()-started)/10;assert.ok(each<150,`A new stage size costs ${each.toFixed(1)} ms`);
 checks.push(`A new 2500x1300 stage size costs ${each.toFixed(1)} ms with four streams`);
}
console.log(JSON.stringify({result:'PASS',checks,scope:'Installed native grid layout with synthetic streams; no client launched'},null,2));
