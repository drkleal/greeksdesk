import {node} from './map.mjs';
import {resizeChart,saveChartDraft,loadChartDrafts} from './capture.mjs';
export const chartSlots=[{id:'paste-dg',title:'DeepGamma · DG',hint:'Gamma levels and regime'},{id:'es-snapshot',title:'DeepCharts · DC',hint:'ES price structure and session levels'},{id:'paste-vp',title:'VP · Sessions & daily',hint:'Session / daily VAH, VAL, POC, HVN, LVN and VWAP',scope:'session_daily'},{id:'paste-vp-prior',title:'VP · Previous day',hint:'Previous daily profile; keep its date visible',scope:'previous_daily'},{id:'paste-vp-composite',title:'VP · Multi-day context',hint:'Several-day profile for background analysis; no composite VAH/VAL on the chart',scope:'multi_day_context'}];
export function mountChartIntake(host,{accept,remove,analyze,currentDate,locked,changed}){
 const previews=new Map(),versions=new Map(),restoreDate=currentDate();
 host.append(node('h2','Paste your trading charts'),node('p','Click a box and press Ctrl+V. Replace a chart by pasting again. Then choose Update & analyze to combine these charts with the API data.'));
 const grid=node('div',undefined,'chart-paste-grid');host.append(grid);
 for(const slot of chartSlots){
  const box=node('section',undefined,'chart-paste-box');box.tabIndex=0;box.dataset.pasteSlot=slot.id;box.setAttribute('aria-label','Paste '+slot.title);
  const img=node('img');img.hidden=true;img.alt=slot.title+' pasted chart';
  const status=node('p','Click here → Ctrl+V','paste-chart-status');status.setAttribute('role','status');
  const clear=node('button','Remove'),open=node('button','Enlarge');clear.hidden=open.hidden=true;
  box.append(node('h3',slot.title),node('small',slot.hint),img,status,open,clear);grid.append(box);
  async function paste(file){if(locked()||!file)return;const version=(versions.get(slot.id)||0)+1,date=currentDate();versions.set(slot.id,version);try{status.textContent='Attaching chart…';const source={id:slot.id,title:slot.title,sessionDate:date,capturedAt:new Date().toISOString(),image:await resizeChart(file),...(slot.scope?{data:{chartScope:slot.scope,family:'acceptance',scope:slot.hint}}:{})};if(versions.get(slot.id)!==version||currentDate()!==date||locked())return;if(!await accept(source))throw Error('Choose the session date before pasting.');await saveChartDraft(source).catch(()=>{});sync(source);changed();}catch(e){if(versions.get(slot.id)===version)status.textContent=e.message;}}
  function sync(source){img.hidden=!source;clear.hidden=open.hidden=!source;img.src=source?.image||'';status.textContent=source?'Ready for next analysis · '+source.sessionDate+' · pasted '+new Date(source.capturedAt).toLocaleTimeString():'Click here → Ctrl+V';box.classList.toggle('has-chart',!!source);}
  box.addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(f){e.preventDefault();e.stopPropagation();paste(f);}});
  box.addEventListener('dragover',e=>e.preventDefault());box.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();paste([...e.dataTransfer.files].find(f=>f.type.startsWith('image/')));});
  clear.addEventListener('click',async()=>{if(locked())return;versions.set(slot.id,(versions.get(slot.id)||0)+1);remove(slot.id);sync(null);await saveChartDraft(null,slot.id).catch(()=>{});changed();});
  open.addEventListener('click',()=>{const d=node('dialog',undefined,'chart-viewer'),full=node('img'),close=node('button','Close');full.src=img.src;full.alt=slot.title;close.onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.append(close,node('h2',slot.title),full);document.body.append(d);d.showModal();});
  previews.set(slot.id,sync);
 }
 const run=node('button','Update & analyze all evidence','primary');run.onclick=()=>{if(!locked())analyze();};
 const progress=node('p','Ready. Update & analyze combines these charts with the available API data.','analysis-progress');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 host.append(run,progress,node('p','Include the instrument, session date, and chart time where possible. A pasted image stays fixed until you replace it; Auto updates do not refresh screenshots.','muted'));
 loadChartDrafts(restoreDate).then(async drafts=>{for(const s of drafts)if(!versions.has(s.id)&&currentDate()===restoreDate&&!locked()&&await accept(s))previews.get(s.id)?.(s);}).catch(()=>{});
 return {setProgress:text=>{progress.textContent=text;},setBusy:value=>{run.disabled=value;run.textContent=value?'Working… please wait':'Update & analyze all evidence';progress.classList.toggle('is-busy',value);},syncAll:sources=>{for(const [id,sync]of previews)sync(sources.find(s=>s.id===id&&s.sessionDate===currentDate())||null);},forget:id=>versions.set(id,(versions.get(id)||0)+1)};
}
