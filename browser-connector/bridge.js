// This bridge is injected only into the two private GreeksDesk origins.
window.addEventListener('message',async event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='greeksdesk-connector-request')return;
 const {id,type}=event.data;if(typeof id!=='string'||id.length>80||!['status','capture','disconnect'].includes(type))return;
 let result;try{result=await chrome.runtime.sendMessage({type});}catch{result={ok:false,message:'Reload GreeksDesk after installing or updating the connector.'};}
 window.postMessage({channel:'greeksdesk-connector-response',id,result},location.origin);
});
