import {cashSession,nyTime} from './session.mjs';

const time=t=>typeof t==='number'?t:typeof t==='string'?Date.parse(t):NaN;
const when=t=>new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})+' ET';
export function sourceStatus(source,date,now=Date.now()){
 const d=source.data||{},base={title:source.title,state:'context',label:'Observation time unverified',detail:'A successful request does not establish when these values changed.'};
 if(source.sessionDate&&source.sessionDate!==date)return {...base,label:'Different session',detail:`Saved source for ${source.sessionDate}; not an observation for ${date}.`};
 if(d.available===false||d.ok===false)return {...base,state:'unavailable',label:'Unavailable',detail:d.message||'No usable data returned on this update.'};
 if(d.snapshotFallback)return {...base,label:'Earlier model snapshot',detail:`Using ${d.actualSlot||d.collectionSlot} (provider time coordinate). The selected after-close snapshot was empty; this is dated context, not live dealer activity.`};
 if(source.id==='timestamps'||source.id.startsWith('od-')||source.id==='gamma')return {...base,label:'Model context',detail:'Model time coordinates are not verified update times. Do not treat this as confirmation of new dealer activity.'};
 if(source.id==='databento'){
  const t=time(d.latestTimestamp),age=(now-t)/1000,fresh=d.freshness==='fresh'&&age>=0&&age<=20;
  return {...base,state:fresh?'fresh':'context',label:fresh?'Fresh ES observation':'ES price is not live',detail:(Number.isFinite(t)?`${d.contract||'ES'} ${d.latestPrice} · ${when(t)}. `:'No verified ES timestamp. ')+(d.messages||[]).join(' ')};
 }
 const rows=d.rows||[],recent=d.recentBuckets||[];
 const tradeTimes=rows.map(r=>time(r.tradeTime)).filter(Number.isFinite);
 const t=tradeTimes.length?Math.max(...tradeTimes):time(d.latestTimestamp);
 if(Number.isFinite(t)){
  const sameDay=nyTime(t)?.date===date,age=(now-t)/1000,fresh=sameDay&&age>=0&&age<=180;
  const cashClosed=!cashSession(date);
  return {...base,state:fresh?'fresh':'context',label:fresh?(tradeTimes.length?'Recent option trades':'Recent data buckets'):'Earlier observation',detail:`${when(t)}${tradeTimes.length?' · latest trade in this returned sample':recent.length?' · latest returned bucket':''}.`+(cashClosed?' Cash SPX is closed; the attached stock price is not a live ES quote or a matched basis.':'')};
 }
 if(d.rowCount===0||d.bucketCount===0)return {...base,state:'unavailable',label:'No observations returned',detail:'This source supplies no data for the selected request.'};
 return base;
}

export function renderSourceStatus(host,date,sources,now=Date.now()){
 if(!host)return;
 const expanded=host.querySelector('details')?.open;
 const make=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 host.replaceChildren(make('h2','Source freshness · '+date));
 host.append(make('p',!cashSession(date)?'Cash market closed. Futures and eligible overnight options can still trade. Each source must establish its own observation time.':'Source observations and analysis update separately. A fresh quote does not refresh an older trade plan.','muted'));
 if(!sources.length){host.append(make('p','Use Update data to check this session. No current source observations have been loaded.'));return;}
 const fallback=sources.find(s=>s.data?.snapshotFallback&&s.data.available);
 if(fallback)host.append(make('p','OptionsDepth positions: using '+(fallback.data.actualSlot||fallback.data.collectionSlot)+' because the selected after-close snapshot was empty. Heatmaps keep their separately requested time.','muted'));
 const grid=make('div','','source-freshness-grid'),more=make('details'),rest=make('div','','source-freshness-grid');let extra=0;
 for(const source of sources){const s=sourceStatus(source,date,now),card=make('article','',`source-freshness-card ${s.state}`);card.append(make('strong',s.title),make('b',s.label),make('p',s.detail));if(['databento','quantdata','timestamps','qd-order-flow-unconsolidated'].includes(source.id))grid.append(card);else{rest.append(card);extra++;}}
 host.append(grid);if(extra){more.open=!!expanded;more.append(make('summary',`Check timestamps for ${extra} other panels`),rest);host.append(more);}
}
