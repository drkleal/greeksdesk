// Local capture and history: images are not transmitted by this module.
export async function resizeChart(blob){
 if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>15000000)throw Error('Choose a PNG, JPEG or WebP smaller than 15 MB.');
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,1800/bitmap.width,1800/bitmap.height);
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 return canvas.toDataURL('image/jpeg',.88);
}
export async function startChartShare(){
 if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Tab sharing is unavailable in this browser. Open the app in Chrome or Edge, or attach a screenshot.');
 const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
 const video=document.createElement('video');video.muted=true;video.srcObject=stream;
 try{await video.play();}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
 return {stream,stop(){stream.getTracks().forEach(t=>t.stop());video.srcObject=null;},frame(){
  if(stream.getVideoTracks()[0]?.readyState!=='live'||!video.videoWidth)throw Error('Chart sharing ended. Share the chart again.');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1800/video.videoWidth,1800/video.videoHeight);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.88);
 }};
}
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('greeksdesk-reads',1);r.onupgradeneeded=()=>r.result.createObjectStore('reads',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Local history is unavailable.'));});
export async function listReads(){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('reads').objectStore('reads').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.id.localeCompare(a.id)));r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function saveRead(read){const existing=await listReads(),db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('reads','readwrite'),store=tx.objectStore('reads');store.put(read);for(const old of existing.slice(19))store.delete(old.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
