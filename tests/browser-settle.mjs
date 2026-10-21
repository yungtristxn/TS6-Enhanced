// Wait for actual geometry to settle, not just a changed model attribute.
export const settleLayout = page => page.evaluate(()=>new Promise((resolve,reject)=>{
 let previous='',steady=0;const start=performance.now();
 const sample=()=>{
  const next=JSON.stringify([...document.querySelectorAll('.screen-grid,.screen-video-wrapper,.screen-tile-wrapper,.ts-chat-container')].map(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10)}));
  steady=next===previous?steady+1:0;previous=next;
  if(steady>=3&&performance.now()-start>=130)return resolve();
  if(performance.now()-start>1000)return reject(Error('Layout did not settle within one second'));
  requestAnimationFrame(sample);
 };requestAnimationFrame(sample);
}));
