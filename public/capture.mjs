// Local capture and history: images are not transmitted by this module.
export function chartImageBlob(image){
 const match=typeof image==='string'&&image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!match||image.length>6000000)throw Error('The saved chart image is unreadable. Paste a fresh ES screenshot.');
 return new Blob([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],{type:match[1]});
}
export async function resizeChart(blob){
 if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>15000000)throw Error('Choose a PNG, JPEG or WebP smaller than 15 MB.');
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,3200/bitmap.width,3200/bitmap.height);
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let result=canvas.toDataURL('image/jpeg',.92);
 for(const quality of [.85,.75,.65]){if(result.length<2900000)break;result=canvas.toDataURL('image/jpeg',quality);}
 if(result.length>=2900000)throw Error('This chart is too large to read clearly in one image. Copy a smaller chart region.');
 return result;
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
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('greeksdesk-reads',2);r.onupgradeneeded=()=>{for(const name of ['reads','drafts'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(Error('Local history is unavailable.'));});
export async function loadESDraft(date){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('es');r.onsuccess=()=>resolve(r.result?.sessionDate===date?r.result:null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function saveESDraft(source){const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');if(source)store.put({...source,id:'es'});else store.delete('es');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function listReads(){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('reads').objectStore('reads').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.id.localeCompare(a.id)));r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function saveRead(read){const existing=await listReads(),db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('reads','readwrite'),store=tx.objectStore('reads');store.put(read);for(const old of existing.slice(19))store.delete(old.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
