import {node} from './map.mjs';
import {esPremiumRange,openingQuartile,vixDailyRange,straddleBands,straddleSigmaLabel} from './straddle.mjs';
const storageKey='greeksdesk-opening-straddles-v1';
const price=v=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const time=t=>t?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Time unavailable';
function saved(){try{return JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{return [];}}
function remember(rows){
 const unique=new Map([...saved(),...rows].filter(r=>r?.ready&&r.version===1&&r.kind==='opening').map(r=>[r.sessionDate,r]));
 const result=[...unique.values()].sort((a,b)=>b.sessionDate.localeCompare(a.sessionDate)).slice(0,160);
 try{localStorage.setItem(storageKey,JSON.stringify(result));}catch{}return result;
}
export function mountStraddlePanel(host,read,onChange){
 let source=read.sources.find(s=>s.id==='qd-straddle'),data=source?.data||{},feed=read.sources.find(s=>s.id==='databento')?.data,refreshed=false;
 let history=remember([...(data.history||[]),...(data.opening?.ready?[data.opening]:[])]),loading=false;
 const box=node('div',undefined,'wb-straddle-summary'),select=node('select'),stats=node('div',undefined,'wb-straddle-stats'),build=node('button','Build 60-session comparison'),progress=node('span',undefined,'wb-straddle-progress'),multiples=node('input'),toggle=node('label');
 select.setAttribute('aria-label','Straddle reference');for(const [value,text]of [['latest','Updated premium'],['opening','9:36 ET · fixed opening']]){const option=node('option',text);option.value=value;select.append(option);}
 select.value=read.result.straddleBands?.selected||(data.state==='cash-session'&&data.latest?.ready?'latest':'opening');multiples.type='checkbox';toggle.append(multiples,document.createTextNode('Show 2× opening premium'));
 box.append(select,stats,toggle,build,progress);host.append(box);
 function view(){
  const observation=data[select.value],mapping=read.instrument==='ES'?esPremiumRange(observation,feed):observation?.ready?{ready:true,anchor:observation.spot,lower:observation.spot-observation.premium,upper:observation.spot+observation.premium,basis:0}:{};
  const opening=read.instrument==='ES'?esPremiumRange(data.opening,feed):data.opening?.ready?{ready:true,anchor:data.opening.spot}:{};
  const bands=!refreshed&&read.result.straddleBands?read.result.straddleBands[select.value]:straddleBands(observation,mapping);
  const q=openingQuartile(data.opening||{sessionDate:read.date},history);
  const label=select.value==='opening'?'9:36 fixed':data.state==='cash-session'?'Updated minute':data.state==='prior-session'?'Prior-session indicative':'Historical close';
  const facts=observation?.ready?[
   'Expiration '+observation.expirationDate+' · SPX strike '+price(observation.strike)+' · '+time(observation.timestamp),
   'Call '+price(observation.call)+' + put '+price(observation.put)+' = '+price(observation.premium)+' SPX points. Matched-minute volume: '+observation.callVolume+' calls / '+observation.putVolume+' puts.',
   'SPX '+price(observation.spot)+(mapping.ready&&read.instrument==='ES'?' · ES '+price(mapping.anchor)+' · matching basis '+price(mapping.basis):''),
   observation.ratio?'VIX '+price(observation.vix)+' · straddle/VIX daily ratio '+observation.ratio.toFixed(3)+'×. This compares volatility measures; it is not a fitted correlation coefficient.':'No timestamp-matched VIX observation; ratio withheld.',
   select.value==='opening'?(q.ready?'Opening ratio Q'+q.quartile+' against the preceding 60 sessions. Current session excluded.':'Opening history '+q.count+'/60 valid prior sessions. Quartile withheld until complete.'):'Opening ratio and quartile use a separate fixed 9:36 reference.',
   observation.limitation,...(bands.ready?[bands.oneSigma.label+' · ±'+price(bands.oneSigma.points)+' pts · '+price(bands.oneSigma.lower)+' – '+price(bands.oneSigma.upper),bands.breakeven.label+' · ±'+price(bands.rawStraddle)+' pts · '+price(bands.breakeven.lower)+' – '+price(bands.breakeven.upper),bands.method]:[]),...(refreshed?['This measurement was refreshed after the plan. The playbook remains at its displayed analysis time.']:[])
  ]:[observation?.message||data.message||'Update data to read both ATM option legs and VIX.'];
  return {source,observation,mapping,bands,vixRange:vixDailyRange(observation,mapping),opening: data.opening,openingMapping:opening,label,facts,multiples:multiples.checked,quartile:q};
 }
 function render(){
  const v=view();stats.replaceChildren(node('strong',v.observation?.ready?v.label+' · raw straddle S = '+price(v.observation.premium)+' pts':v.label+' · unavailable'));
  if(v.observation?.ready){
   stats.append(node('span',v.bands.ready?'Expected range · '+straddleSigmaLabel+' · estimate · ±'+price(v.bands.oneSigma.points)+' pts · '+price(v.bands.oneSigma.lower)+' – '+price(v.bands.oneSigma.upper)+' '+read.instrument:v.bands.message||'No matching price anchor'));
   if(v.bands.ready)stats.append(node('span','Outer dotted breakeven band · ±S = ±'+price(v.bands.rawStraddle)+' pts · '+price(v.bands.breakeven.lower)+' – '+price(v.bands.breakeven.upper)));
   stats.append(node('span','VIX '+price(v.observation.vix)+' · ratio '+(Number.isFinite(v.observation.ratio)?v.observation.ratio.toFixed(3)+'×':'unavailable')));
   if(v.bands.ready)stats.append(node('small','Bands use the matched price anchor. Exact option breakevens (strike ±S), mapped to '+read.instrument+': '+price(v.bands.exactOptionBreakevens.lower)+' – '+price(v.bands.exactOptionBreakevens.upper)+'. The 1σ estimate is not calibrated probability.'));
   if(v.vixRange.ready)stats.append(node('span','VIX daily benchmark ±'+price(v.vixRange.points)+' pts'));
  }else stats.append(node('span',v.facts[0]));
  stats.append(node('span',v.quartile.ready?'9:36 ratio · Q'+v.quartile.quartile+' / 60 prior sessions':'9:36 comparison · '+v.quartile.count+'/60 · quartile pending'));
  build.hidden=v.quartile.count===60;build.disabled=loading;
 }
 select.onchange=()=>{render();onChange();};multiples.onchange=onChange;
 build.onclick=async()=>{
  if(loading)return;loading=true;render();progress.textContent='Loading matched opening observations…';
  let gaps=0;
  try{
   for(let offset=0;offset<60;offset+=3){
    if(!box.isConnected)break;
    const r=await fetch('/api/check?provider=straddle-history&date='+encodeURIComponent(read.date)+'&offset='+offset,{method:'POST',headers:{'X-GreeksDesk-Action':'manual-check'}}),result=await r.json();
    history=remember(result.records||[]);gaps+=(result.failures||[]).length;render();onChange();
    if(!r.ok||!result.ok)throw Error(result.message||'History request failed.');
    progress.textContent='Checked '+Math.min(60,offset+3)+'/60 sessions · '+view().quartile.count+' matched';
   }
   progress.textContent=view().quartile.ready?'60-session comparison ready.':gaps+' sessions need valid matched data. No quartile inferred.';
  }catch(error){progress.textContent=error.message+' Saved observations retained.';}
  finally{loading=false;render();}
 };
 host.addEventListener('straddle-update',event=>{if(event.detail.date!==read.date)return;source=event.detail.sources.find(s=>s.id==='qd-straddle');data=source?.data||{};feed=event.detail.sources.find(s=>s.id==='databento')?.data;history=remember([...(data.history||[]),...(data.opening?.ready?[data.opening]:[])]);refreshed=true;render();onChange();});
 const frozen=read.result.straddleBands;
 const record=node('details',undefined,'wb-straddle-record');record.append(node('summary','Scoreboard · ranges recorded with this read'));
 if(frozen){record.append(node('p','Recorded '+time(frozen.recordedAt)+'. Later data updates and reference changes do not replace these bounds.'));for(const kind of ['opening','latest']){const b=frozen[kind];record.append(node('p',b?.ready?kind+' · '+time(b.timestamp)+' · '+straddleSigmaLabel+': '+price(b.oneSigma.lower)+' – '+price(b.oneSigma.upper)+' · ±S: '+price(b.breakeven.lower)+' – '+price(b.breakeven.upper)+' '+read.instrument:kind+' · '+(b?.message||'Unavailable')));}}else record.append(node('p','This older read did not record both bands. Display values are calculated from its saved inputs, not a new forecast.'));
 box.append(record);render();return {view};
}
