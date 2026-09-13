import {node} from './map.mjs';
import {selectESSource,priceText} from './plan.mjs';
import {sourceStatus} from './source-status.mjs';
import {marketClock} from './session.mjs';
import {conversionFor,signed} from './confluence.mjs';

const when=t=>Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})+' ET':'Time unverified';
const range=s=>s&&Number.isFinite(s.high)&&Number.isFinite(s.low)?`${priceText(s.low)}–${priceText(s.high)}`:null;
export function currentFacts({date,instrument='ES',sources=[],charts=[],read=null},now=Date.now()){
 const selected=sources.filter(s=>s.sessionDate===date),clock=marketClock(now);
 const states=selected.map(s=>({source:s,status:sourceStatus(s,date,now)}));
 const usable=states.filter(s=>s.status.state!=='unavailable'),missing=states.filter(s=>s.status.state==='unavailable');
 const feed=selectESSource(selected)?.data,structure=selected.find(s=>s.id==='databento'&&s.data?.available===true)?.data;
 const facts=[];
 if(instrument==='ES'&&feed&&Number.isFinite(feed.latestPrice))facts.push({title:`${feed.contract} · last observed price`,value:priceText(feed.latestPrice),detail:sourceStatus({id:'databento',data:feed},date,now).label+' · '+when(feed.latestTimestamp)});
 if(instrument==='SPX'){
  const d=selected.find(s=>s.id==='quantdata'&&s.data?.ok!==false&&s.data?.available!==false)?.data;
  if(Number.isFinite(d?.latestPrice))facts.push({title:'SPX · last observed price',value:priceText(d.latestPrice),detail:when(d.latestTimestamp)});
 }
 if(instrument==='ES'&&structure){
  for(const [label,stats]of [['Futures session range',structure.session],['Cash session range',structure.cashSession]])if(range(stats))facts.push({title:label+' · '+structure.contract,value:range(stats),detail:'Observed range · '+date+' · not a projected move'});
  const p=structure.volumeProfile;
  if(p?.available&&p.schema==='trades'&&p.contract===structure.contract&&p.completeWindow===true){
   for(const n of p.nodes||[])if(n.kind==='POC'&&Number.isFinite(n.price)){facts.push({title:'Trade volume POC · '+structure.contract,value:priceText(n.price),detail:'Through '+when(p.through)+' · reference only'});break;}
   const rth=structure.sessionProfiles?.RTH;
   if(Number.isFinite(rth?.vwap))facts.push({title:'RTH trade VWAP · '+structure.contract,value:priceText(rth.vwap),detail:'Through '+when(rth.through)+' · developing unless the full window is complete'});
  }
 }
 const modelTimes=[...new Set(usable.filter(x=>x.source.id.startsWith('od-')).map(x=>x.source.data.actualSlot||x.source.data.collectionSlot).filter(Boolean))];
 const chartNotes=charts.filter(c=>c.sessionDate===date).map(c=>({title:c.title,value:c.observation?.timestamp?'Observed '+when(c.observation.timestamp):'Chart observation time unverified',detail:'Attached '+when(c.capturedAt)+' · fixed image; attachment time is not market time'}));
 const matched=feed?.basisResult;
 const conversion=conversionFor({date,instrument,basis:matched?.ok&&Number.isFinite(matched.basis)?matched.basis:null,sources:selected});
 return {date,clock,facts,available:usable.length,unavailable:missing.length,gaps:[...missing.map(x=>x.source.title),...(structure?.volumeProfile?.available===false?['ES trade profile: '+structure.volumeProfile.message]:[]),...(structure?.priorContext?.available===false?['Earlier ES history: '+structure.priorContext.message]:[])],modelTimes,chartNotes,
  conversion:instrument==='ES'&&conversion.kind!=='unmapped'?(conversion.kind==='anchor'?'Frozen cash-close difference: ':'Matched difference: ')+signed(conversion.basis)+' ES points · '+when(conversion.reference?.esTime||feed?.basisResult?.esTime):'No verified conversion loaded',
  analysis:read?'Analysis snapshot below: '+read.date+' · '+when(read.result.checkedAt)+' · its inputs are preserved separately.':'No analysis has been applied.',
  note:!selected.length?'Use Update data to load this session.':date!==clock.esSession&&instrument==='ES'?'Historical session selected. These are dated observations.':'Source facts come directly from the loaded snapshot for this session. Analysis does not refresh these values; Update data does.'};
}
export function renderCurrentFacts(host,input,now=Date.now()){
 if(!host)return;
 const state=currentFacts(input,now),signature=JSON.stringify(state);
 // Do not replace focused or expanded controls on each display-clock tick.
 if(host.dataset.facts===signature)return;host.dataset.facts=signature;
 const expanded=host.querySelector('details')?.open;
 host.replaceChildren(node('span','CURRENT SOURCE FACTS · '+state.date,'eyebrow'),node('h2','What your source snapshot contains'),node('p',state.note,'muted'));
 host.append(node('p',state.clock.futures+' · Cash SPX '+(state.clock.cashOpen?'open':'closed')+' now. Prices below keep their own observation times.'));
 const grid=node('div',undefined,'facts-grid');
 for(const f of state.facts){const card=node('article',undefined,'fact-card');card.append(node('h3',f.title),node('strong',f.value),node('small',f.detail));grid.append(card);}host.append(grid);
 host.append(node('p',state.available+' sources with returned context · '+state.unavailable+' unavailable · '+state.chartNotes.length+' fixed chart images.'));
 if(input.instrument==='ES')host.append(node('p',state.conversion,'muted'));
 host.append(node('p',state.analysis,'facts-analysis'));
 const more=node('details');more.open=!!expanded;more.append(node('summary','Model times, chart ages and missing sources'));
 more.append(node('p',state.modelTimes.length?'OptionsDepth model coordinates: '+state.modelTimes.join(' / ')+'. Provider coordinates are not verified live update times.':'No OptionsDepth model coordinates loaded.'));
 for(const c of state.chartNotes)more.append(node('h3',c.title),node('p',c.value+' · '+c.detail));
 if(!state.chartNotes.length)more.append(node('p','DeepGamma / DeepCharts image evidence has not been attached for this session.'));
 if(state.gaps.length)more.append(node('p','Unavailable: '+state.gaps.join('; ')));
 host.append(more);
}
