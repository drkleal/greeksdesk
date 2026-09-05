// A single-tab loop: no overlapping cycles or retries, and no saved on-state.
export function createUpdateLoop({run, notify=()=>{}, later=setTimeout, cancel=clearTimeout, now=Date.now}) {
 let timer,active=false,busy=false,generation=0,remaining=0,delay=0,endsAt=0;
 function stop(reason='Auto updates off') {active=false;generation++;if(timer!==undefined)cancel(timer);timer=undefined;notify({active,busy,remaining,message:reason});}
 async function tick() {
  if(busy)return false;
  if(active&&(remaining<=0||now()>=endsAt)){stop('Auto session finished.');return false;}
  const version=generation;busy=true;if(active)remaining--;notify({active,busy,remaining,message:'Updating…'});
  let ok=false;try{ok=await run();}catch{ok=false;}finally{busy=false;}
  if(version!==generation){notify({active,busy,remaining,message:'Auto updates off. In-flight check finished.'});return ok;}
  if(active&&!ok){stop('Auto updates stopped after an unsuccessful check. Review the results.');return false;}
  if(active&&(remaining<=0||now()>=endsAt)){stop('Auto session finished.');return ok;}
  if(active){notify({active,busy,remaining,nextAt:now()+delay,message:'Waiting for next update'});timer=later(()=>{timer=undefined;tick();},delay);}
  else notify({active,busy,remaining,message:ok?'Update complete':'Check the provider results below'});
  return ok;
 }
 return {
  start({intervalMs,maxCycles,durationMs}){
   if(busy||active)return false;
   if(!Number.isFinite(intervalMs)||intervalMs<60000||!Number.isInteger(maxCycles)||maxCycles<1||maxCycles>480||!Number.isFinite(durationMs)||durationMs<60000||durationMs>8*3600000)throw Error('Invalid update settings');
   generation++;active=true;delay=intervalMs;remaining=maxCycles;endsAt=now()+durationMs;tick();return true;
  },
  stop,
  once(){if(active){if(timer!==undefined)cancel(timer);timer=undefined;}return tick();},
  status(){return {active,busy,remaining};}
 };
}
