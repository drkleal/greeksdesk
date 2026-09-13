import {node} from './map.mjs';
import {resizeChart,saveChartDraft,loadChartDrafts} from './capture.mjs';
import {createChartRestore} from './chart-restore.mjs';
export const chartSlots=[{id:'paste-dg',title:'DeepGamma · DG',hint:'Gamma levels and regime'},{id:'es-snapshot',title:'DeepCharts · 1 minute',hint:'Entry detail, sessions, VAH, VAL, POC and order flow. Keep ES, date and time visible.',timeframe:'1m'},{id:'es-five-minute',title:'DeepCharts · 5 minutes',hint:'Broader trend, swings and acceptance or rejection of levels. Keep ES, date and time visible.',timeframe:'5m'},{id:'paste-vp',title:'VP · Sessions & daily',hint:'Session / daily VAH, VAL, POC, HVN, LVN and VWAP',scope:'session_daily'},{id:'paste-vp-prior',title:'VP · Previous day',hint:'Previous daily profile; keep its date visible',scope:'previous_daily'},{id:'paste-vp-composite',title:'VP · Multi-day context',hint:'Several-day profile for background analysis; no composite VAH/VAL on the chart',scope:'multi_day_context'}];
export function mountChartIntake(host,{accept,remove,analyze,currentDate,locked,changed}){
 const previews=new Map(),versions=new Map();
 host.append(node('h2','Paste your trading charts'),node('p','Click a box and press Ctrl+V. Replace a chart by pasting again. Paste the 1-minute and 5-minute DeepCharts images in their separate boxes. Each chart is attached once; Update & analyze all evidence combines both with the available API data.'));
 const grid=node('div',undefined,'chart-paste-grid');host.append(grid);
 for(const slot of chartSlots){
  const box=node('section',undefined,'chart-paste-box');box.tabIndex=0;box.dataset.pasteSlot=slot.id;box.setAttribute('aria-label','Paste '+slot.title);
  let currentSource=null;
  const confirmation=node('input');confirmation.type='checkbox';const confirmationLabel=node('label',undefined,'check');const confirmationText=node('span');confirmationLabel.append(confirmation,confirmationText);confirmationLabel.hidden=true;
  const img=node('img');img.hidden=true;img.alt=slot.title+' pasted chart';
  const status=node('p','Click here → Ctrl+V','paste-chart-status');status.setAttribute('role','status');
  const clear=node('button','Remove'),open=node('button','Enlarge');clear.hidden=open.hidden=true;
  box.append(node('h3',slot.title),node('small',slot.hint),img,status,confirmationLabel,open,clear);grid.append(box);
  async function paste(file){if(locked()||!file)return;const version=(versions.get(slot.id)||0)+1,date=currentDate();versions.set(slot.id,version);try{status.textContent='Attaching chart…';const source={id:slot.id,title:slot.title,sessionDate:date,capturedAt:new Date().toISOString(),image:await resizeChart(file),...(slot.scope?{data:{chartScope:slot.scope,family:'acceptance',scope:slot.hint}}:slot.timeframe?{data:{requestedTimeframe:slot.timeframe,scope:slot.hint}}:{})};if(versions.get(slot.id)!==version||currentDate()!==date||locked())return;if(!await accept(source))throw Error('Choose the session date before pasting.');await saveChartDraft(source).catch(()=>{});sync(source);changed();}catch(e){if(versions.get(slot.id)===version)status.textContent=e.message;}}
  function sync(source){currentSource=source;confirmationLabel.hidden=!source||!slot.timeframe;confirmation.checked=!!source?.confirmedContext;confirmation.disabled=locked();confirmationText.textContent='This is my ES '+(slot.timeframe==='5m'?'5-minute':'1-minute')+' chart for '+currentDate()+' (confirm if its header is cropped)';img.hidden=!source;clear.hidden=open.hidden=!source;img.src=source?.image||'';status.textContent=source?'Ready for next analysis · '+source.sessionDate+' · pasted '+new Date(source.capturedAt).toLocaleTimeString():'Click here → Ctrl+V';box.classList.toggle('has-chart',!!source);}
  confirmation.addEventListener('change',async()=>{if(locked()||!currentSource)return;const source={...currentSource};if(confirmation.checked)source.confirmedContext={instrument:'ES',sessionDate:currentDate(),timezone:'America/New_York',priceTime:null};else delete source.confirmedContext;if(await accept(source)){await saveChartDraft(source).catch(()=>{});sync(source);changed();}});
  box.addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(f){e.preventDefault();e.stopPropagation();paste(f);}});
  box.addEventListener('dragover',e=>e.preventDefault());box.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();paste([...e.dataTransfer.files].find(f=>f.type.startsWith('image/')));});
  clear.addEventListener('click',async()=>{if(locked())return;versions.set(slot.id,(versions.get(slot.id)||0)+1);remove(slot.id);sync(null);await saveChartDraft(null,slot.id).catch(()=>{});changed();});
  open.addEventListener('click',()=>{const d=node('dialog',undefined,'chart-viewer'),full=node('img'),close=node('button','Close');full.src=img.src;full.alt=slot.title;close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.append(close,node('h2',slot.title),full);document.body.append(d);d.showModal();});
  previews.set(slot.id,sync);
 }
 const run=node('button','Update & analyze all evidence','primary');run.onclick=()=>{if(!locked())analyze();};
 const progress=node('p','Ready. Update & analyze combines these charts with the available API data.','analysis-progress');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 host.append(run,progress,node('p','Include the instrument, session date, and chart time where possible. A pasted image stays fixed until you replace it; Auto updates do not refresh screenshots.','muted'));
 const restoration=createChartRestore({load:loadChartDrafts,accept,currentDate,locked,versions,onRestored:s=>previews.get(s.id)?.(s)});
 function restore(){return restoration.restore().catch(()=>{progress.textContent='Saved charts could not be restored in this browser. Paste the charts again before analysis.';});}
 restore();
 return {restore,whenReady:()=>restoration.whenReady().catch(()=>{}),setProgress:text=>{progress.textContent=text;},setBusy:value=>{for(const input of grid.querySelectorAll('input'))input.disabled=value;run.disabled=value;run.textContent=value?'Working… please wait':'Update & analyze all evidence';progress.classList.toggle('is-busy',value);},syncAll:sources=>{for(const [id,sync]of previews)sync(sources.find(s=>s.id===id&&(s.sessionDate===currentDate()||id==='paste-dg'))||null);},forget:id=>versions.set(id,(versions.get(id)||0)+1)};
}
