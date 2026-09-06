import {node} from './map.mjs';
import {levelDetails,priceText,levelColors,directionTitle} from './plan.mjs';
export function evidenceCoverage(read){
 const a=read.result.analysis,items=[];
 for(const source of read.sources){
  if(source.data){const insight=a.sources.find(s=>s.id===source.id);items.push({id:source.id,source,insight,title:source.title,status:source.data.available===false?'unavailable':insight?'reviewed':'not-reviewed'});}
  if(source.image){
   const panels=(a.panels||[]).filter(p=>p.sourceId===source.id);
   for(const p of panels)items.push({id:p.id,source,panel:p,title:p.title,status:p.status==='excluded'?'excluded':p.dateRole==='projected_session'?'forward-model':p.status==='context'?'context':'reviewed'});
   for(const p of source.capturedPanels||[])if(!panels.some(x=>x.capturedPanelId===p.id))items.push({id:source.id+'-'+p.id,source,title:p.title,status:'not-reviewed',captured:p});
   if(!panels.length&&!source.capturedPanels?.length)items.push({id:source.id,source,title:source.title,status:'not-reviewed'});
  }
 }
 return items;
}
export function renderEvidence(read,{panelButton,chartButton,onLevel}){
 const a=read.result.analysis,host=document.getElementById('panel-review'),guide=document.getElementById('level-guide');host.replaceChildren();guide.replaceChildren();
 const coverage=evidenceCoverage(read),reviewed=coverage.filter(i=>['reviewed','context','forward-model'].includes(i.status)).length;
 document.getElementById('coverage-summary').textContent=reviewed+' of '+coverage.length+' supplied panels / API feeds reviewed · '+new Date(read.result.checkedAt).toLocaleTimeString();
 for(const item of coverage){
  const card=node('details',undefined,'evidence-card '+item.status);card.dataset.evidenceId=item.id;
  const top=node('summary'),label=node('span',item.title),badge=node('small',({'not-reviewed':'Not reviewed','forward-model':'Next-session model',reviewed:'Reviewed',context:'Context',excluded:'Excluded',unavailable:'Unavailable'})[item.status],'evidence-badge');top.append(label,badge);card.append(top);
  const p=item.panel,s=item.insight;
  top.append(node('span',p?.shows||s?.shows||item.source.data?.message||'Supplied without a returned finding. Not counted as support.','evidence-observation'));
  card.append(node('p',(p?p.instrument+' · '+p.observedDate:item.source.data?.ticker+' · '+item.source.sessionDate),'muted'));
  if(p?.reason||s?.importance)card.append(node('h3','Why it matters'),node('p',p?.reason||s.importance));
  if(s?.change)card.append(node('h3','What changed'),node('p',s.change));
  if(s?.priceEffect)card.append(node('h3','Possible effect on price'),node('p',s.priceEffect));
  const drivers=a.scenarios.flatMap(sc=>(sc.drivers||[]).filter(d=>item.panel?d.panelId===item.id:d.sourceId===item.source.id&&!d.panelId).map(d=>({sc,d})));
  for(const {sc,d}of drivers)card.append(node('p',directionTitle(sc.direction)+' · '+d.effect+': '+d.reason,'driver '+sc.direction));
  if(s?.lookFor)card.append(node('p','Watch: '+s.lookFor));
  if(p)card.append(panelButton(p));else if(item.source.image)card.append(chartButton(item.source));
  if(item.source.data){const data=node('details');data.append(node('summary','Exact returned data'),node('pre',JSON.stringify(item.source.data,null,2)));card.append(data);}
  host.append(card);
 }
 for(const [i,l]of [...a.levels].sort((x,y)=>y.price-x.price).entries()){
  const d=levelDetails(l,a),button=node('button',undefined,'level-key');button.dataset.levelId=l.id;button.style.setProperty('--level-color',levelColors[l.kind]||levelColors.other);
  button.append(node('span','L'+(i+1)+' · '+priceText(l.price)+' '+read.instrument,'key-price'),node('strong',d.name),node('small',d.badge),node('span',d.description),node('small',d.source));
  button.addEventListener('click',()=>onLevel(l));guide.append(button);
 }
 if(!a.levels.length)guide.append(node('p','No verified levels in this read. The Evidence tab explains the gaps.'));
}
export function showEvidenceTab(name){for(const id of ['evidence','levels']){document.getElementById('tab-'+id).setAttribute('aria-selected',String(id===name));document.getElementById(id==='evidence'?'panel-review':'level-guide').hidden=id!==name;}}
export function focusEvidence(id){showEvidenceTab('evidence');const card=[...document.querySelectorAll('[data-evidence-id]')].find(e=>e.dataset.evidenceId===id);if(card){card.open=true;card.scrollIntoView({behavior:'smooth',block:'nearest'});}}
