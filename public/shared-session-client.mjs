export const hasWork=s=>!!(s?.charts?.length||s?.read);
export const sessionKey=s=>JSON.stringify({date:s.date,instrument:s.instrument,basis:s.basis,charts:s.charts.map(c=>({id:c.id,title:c.title,image:c.image,sessionDate:c.sessionDate,capturedAt:c.capturedAt,confirmedContext:c.confirmedContext||null,data:c.data||null})).sort((a,b)=>a.id.localeCompare(b.id)),read:s.read?{id:s.read.id,checkedAt:s.read.result.checkedAt}:null});
export function createSharedController({getState,applyState,backup,request=fetch,status,locked=()=>false,delay=1000}){
 let ready=false,paused=false,applying=false,saving=false,etag=null,baseline=null,timer,revision=0;
 async function call(body){
  const response=await request('/api/shared-session',{method:body?'POST':'GET',signal:AbortSignal.timeout(40000),headers:body?{'Content-Type':'application/json','X-GreeksDesk-Action':'manual-check'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!result.ok){const e=Error(result.message||'Shared saving is unavailable. Your local work is preserved.');e.code=result.code;throw e;}return result;
 }
 async function adopt(remote){
  const local=getState();if(hasWork(local)&&sessionKey(local)!==sessionKey(remote.state))await backup(local);
  applying=true;try{await applyState(remote.state);baseline=sessionKey(getState());etag=remote.etag;paused=false;status('Shared session opened · '+remote.state.date+' · '+remote.state.charts.length+' charts. Saved prices and analysis times are unchanged.');}finally{applying=false;}
 }
 async function start(){
  const before=revision;
  try{const remote=await call();etag=remote.etag;ready=true;
   if(before!==revision||locked()){paused=true;status('Your browser changed while shared saving connected. Use Save this browser’s session or Open shared session.');return;}
   const local=getState();
   if(remote.state&&!hasWork(local)){await adopt(remote);return;}
   if(remote.state&&sessionKey(local)!==sessionKey(remote.state)){paused=true;status('This browser has different saved work. Save this browser’s session to share it, or Open shared session to view the other copy. Neither copy has been replaced.');return;}
   if(!remote.state&&hasWork(local)){await save(false);return;}
   baseline=sessionKey(local);status(remote.state?'Shared session connected · '+remote.state.date+'.':'Shared saving is ready. Paste charts or generate a result; they will be saved privately.');
  }catch(e){status(e.message);}
 }
 async function save(manual=true){
  if(locked()||saving)return;
  clearTimeout(timer);saving=true;
  try{
   if(!ready||paused){if(!manual)return;const remote=await call();etag=remote.etag;ready=true;}
   const state=getState(),key=sessionKey(state);
   if(!manual&&key===baseline)return;
   if(!manual&&!state.charts.length&&(!state.read||state.read.date!==state.date)){baseline=key;status('No charts or analysis for the selected date yet. The existing shared session has been kept.');return;}
   status('Saving shared session… Keep this tab open.');
   const r=await call({etag,state});etag=r.etag;baseline=key;paused=false;
   status('Saved privately · '+state.date+' · '+state.charts.length+' charts'+(state.read?' · analysis '+state.read.date:' · no completed analysis')+' · '+new Date(r.savedAt).toLocaleTimeString()+'. Other browsers can open this session.');
  }catch(e){paused=true;status(e.message+' Your browser copy remains available.');}
  finally{saving=false;if(ready&&!paused&&sessionKey(getState())!==baseline)changed();}
 }
 function changed(){if(applying)return;revision++;clearTimeout(timer);if(ready&&!paused&&!locked())timer=setTimeout(()=>save(false),delay);}
 async function open(){
  if(locked()||saving)return;clearTimeout(timer);const before=revision;
  try{const remote=await call();ready=true;
   if(before!==revision||locked()){status('Your browser changed while loading. Nothing was replaced; open the shared session again when ready.');return;}
   if(!remote.state){status('No shared session yet. In the browser showing your charts, choose Save this browser’s session.');return;}
   await adopt(remote);
  }catch(e){status(e.message);}
 }
 return {start,changed,save,open};
}
export function mountSharedSession(host,options){
 const title=document.createElement('h2');title.textContent='Shared session';
 const note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');note.textContent='Connecting to shared saving…';
 const save=document.createElement('button');save.textContent='Save this browser’s session';
 const open=document.createElement('button');open.textContent='Open shared session';
 const backupButton=document.createElement('button');backupButton.textContent='Download browser backup';backupButton.hidden=true;
 let localBackup=null;
 const controller=createSharedController({...options,status:text=>{note.textContent=text;},backup:async state=>{await options.backup(state);localBackup=state;backupButton.hidden=false;}});
 save.onclick=()=>controller.save();open.onclick=()=>controller.open();
 backupButton.onclick=()=>{if(!localBackup)return;const url=URL.createObjectURL(new Blob([JSON.stringify(localBackup)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='greeksdesk-browser-backup-'+localBackup.date+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 options.loadBackup?.().then(state=>{if(state){localBackup=state;backupButton.hidden=false;}}).catch(()=>{});
 const help=document.createElement('p');help.className='muted';help.textContent='The latest chart set and completed read are shared through your private app. Older read history stays in this browser. Saving and opening a session do not run analysis or refresh prices.';
 host.append(title,note,save,open,backupButton,help);return controller;
}
