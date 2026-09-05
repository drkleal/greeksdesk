import {createUpdateLoop} from './update-loop.mjs';
const date=document.getElementById('date'),auto=document.getElementById('auto-toggle'),nowButton=document.getElementById('update-now'),interval=document.getElementById('interval'),duration=document.getElementById('duration'),status=document.getElementById('update-status');
const previous=new Map(),pending=new Map();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
function display(provider,result,session){
 const output=document.getElementById(provider);let text=result.message;
 if(result.ok){
  text+='\nSession: '+session+' · '+result.count+' '+(provider==='quantdata'?'buckets':'timestamps');
  if(provider==='quantdata'){
   text+='\nScope: '+result.scope+'\nCall premium total: '+money.format(result.callPremium)+'\nPut premium total: '+money.format(result.putPremium)+'\nLatest data bucket (UTC): '+(result.latestTimestamp||'None')+'\nSPX price in latest bucket: '+(result.latestPrice??'Unavailable');
   const before=previous.get(provider);
   if(before?.sessionDate===session)text+='\nChange since previous successful check: calls '+money.format(result.callPremium-before.callPremium)+'; puts '+money.format(result.putPremium-before.putPremium)+'. Changes can include provider revisions; they are not trade signals.';
  }else{
   window.setGammaSlots(result.slots,session);
   text+='\nTimestamp availability is not exposure freshness.';
  }
  previous.set(provider,result);
 }
 if(result.checkedAt)text+='\nRequest checked: '+new Date(result.checkedAt).toLocaleString();
 if(result.cached)text+='\nCached result; no new provider request.';
 output.textContent=text;
}
async function check(provider){
 if(!date.reportValidity())return false;
 if(pending.has(provider))return pending.get(provider);
 const session=date.value,button=document.querySelector('[data-provider="'+provider+'"]');
 const job=(async()=>{
  button.disabled=true;document.getElementById(provider).textContent='Checking…';
  try{
   const response=await fetch('/api/check?'+new URLSearchParams({provider,date:session}),{method:'POST',headers:{'X-GreeksDesk-Action':'manual-check'}});
   if(!response.ok)throw Error();const result=await response.json();
   if(date.value!==session)return false;
   display(provider,result,session);return result.ok&&result.count>0;
  }catch{document.getElementById(provider).textContent='Unable to check. Verify you are signed in. No automatic retry was made.';return false;}
  finally{button.disabled=false;pending.delete(provider);}
 })();pending.set(provider,job);return job;
}
const loop=createUpdateLoop({
 run:async()=>{
  if(loop.status().active&&(date.value!==today()||document.hidden))return false;
  const results=await Promise.all([check('quantdata'),check('optionsdepth')]);
  if(results.every(Boolean))document.getElementById('last-update').textContent='Both checks completed: '+new Date().toLocaleString()+'. See each source timestamp below.';
  return results.every(Boolean);
 },
 notify:s=>{auto.textContent=s.active?'Auto updates: ON · Stop':'Auto updates: OFF';auto.setAttribute('aria-pressed',String(s.active));nowButton.disabled=s.busy;interval.disabled=s.active;duration.disabled=s.active;status.textContent=s.message+(s.active?' · '+s.remaining+' cycles left':'')+(s.nextAt?' · Next: '+new Date(s.nextAt).toLocaleTimeString():'');}
});
nowButton.addEventListener('click',()=>{if(date.reportValidity())loop.once();});
auto.addEventListener('click',()=>{
 if(loop.status().active){loop.stop();return;}
 if(!date.reportValidity())return;
 if(date.value!==today()){status.textContent='Auto updates require today’s New York date. Use Update now for historical sessions.';return;}
 if(pending.size){status.textContent='Wait for the current check to finish.';return;}
 const intervalMs=Number(interval.value)*60000,durationMs=Number(duration.value)*60000;
 loop.start({intervalMs,durationMs,maxCycles:Math.ceil(durationMs/intervalMs)});
});
for(const button of document.querySelectorAll('[data-provider]'))button.addEventListener('click',()=>check(button.dataset.provider));
date.addEventListener('change',()=>{
 loop.stop('Date changed. Auto updates off.');previous.clear();
 for(const provider of ['quantdata','optionsdepth'])document.getElementById(provider).textContent='Not checked for the selected date.';
 document.getElementById('last-update').textContent='No completed update for this date.';
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&loop.status().active)loop.stop('Paused because this page is hidden. Turn Auto updates on to resume.');});
window.addEventListener('pagehide',()=>loop.stop());
