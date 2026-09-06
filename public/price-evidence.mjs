import {node} from './map.mjs';
const stamp=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
const price=value=>value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

export function priceEvidence(level,sources){
 const o=level.apiOrigin,source=sources.find(s=>s.id===o?.sourceId),d=source?.data;
 if(!o||!d?.available||d.ticker!=='ES'||d.dataset!=='GLBX.MDP3'||!/^ES[HMUZ]\d{1,2}$/.test(d.contract))return null;
 let rows,selected,frame=o.timeframe,scope;
 if(o.sessionDate!==source.sessionDate){
  const c=d.priorContext;if(o.timeframe!=='1h'||!c?.available||c.contract!==d.contract||o.sessionDate>=source.sessionDate)return null;
  rows=c.sessions?.find(s=>s.sessionDate===o.sessionDate)?.bars;
 }else if(['session','cash_session'].includes(frame)){
  scope=d[frame==='session'?'session':'cashSession'];if(!scope||Date.parse(scope.from)!==Date.parse(o.timestamp)||scope[o.field]!==level.price)return null;
  rows=d.bars5m?.filter(b=>Date.parse(b.timestamp)>=Date.parse(scope.from)&&Date.parse(b.observedThrough??b.end)<=Date.parse(scope.through));frame='5m';
 }else rows=d[{'1m':'recentBars','5m':'bars5m','15m':'bars15m'}[frame]];
 if(!Array.isArray(rows)||!rows.length||rows.length>400)return null;
 rows=[...rows].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 if(rows.some(b=>!Number.isFinite(Date.parse(b.timestamp))||!Number.isFinite(Date.parse(b.end))||Date.parse(b.end)<=Date.parse(b.timestamp)||!['open','high','low','close'].every(k=>Number.isFinite(b[k]))||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)))return null;
 if(!scope){selected=rows.findIndex(b=>Date.parse(b.timestamp)===Date.parse(o.timestamp)&&b[o.field]===level.price);if(selected<0)return null;}
 return {contract:d.contract,date:o.sessionDate,frame,rows,selected:selected??null,scope,field:o.field};
}

export function appendPriceEvidence(host,level,sources){
 const e=priceEvidence(level,sources);if(!e)return;
 const box=node('section',undefined,'price-evidence'),caption=node('p',undefined,'price-bar-caption');
 box.append(node('h3',e.contract+' price evidence · '+e.date),node('p','Databento '+e.frame+' trade bars · '+(e.scope?'session summary reference':'white outline marks the cited bar')+' · select any bar for its prices.','muted'));
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 960 300');svg.setAttribute('role','group');svg.setAttribute('aria-label',e.contract+' '+e.date+' source price bars');
 const add=(tag,attrs={},text)=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.append(el);return el;};
 const start=Date.parse(e.rows[0].timestamp),end=Date.parse(e.rows.at(-1).end),lo=Math.min(level.price,...e.rows.map(b=>b.low)),hi=Math.max(level.price,...e.rows.map(b=>b.high)),padding=Math.max(.5,(hi-lo)*.06),bottom=lo-padding,top=hi+padding;
 const x=t=>16+830*(t-start)/(end-start),y=p=>14+230*(top-p)/(top-bottom),select=(b,g)=>{for(const item of svg.querySelectorAll('[data-bar]'))item.classList.toggle('active-bar',item===g);caption.textContent=stamp(b.timestamp)+'–'+stamp(b.observedThrough??b.end)+' | Open '+price(b.open)+' · High '+price(b.high)+' · Low '+price(b.low)+' · Close '+price(b.close)+(b.complete===false?' · Partial interval':'');};
 for(let i=0;i<5;i++){const value=bottom+(top-bottom)*i/4;add('line',{x1:16,x2:848,y1:y(value),y2:y(value),stroke:'#245574'});add('text',{x:858,y:y(value)+4,fill:'#c0dded','font-size':12},price(value));}
 e.rows.forEach((b,index)=>{
  const t=Date.parse(b.timestamp),finish=Date.parse(b.end),cx=x((t+finish)/2),width=Math.max(1.5,Math.min(18,830*(finish-t)/(end-start)*.6)),color=b.close>=b.open?'#14ffc9':'#ff4d8c';
  const g=add('g',{'data-bar':index,tabindex:0,role:'button','aria-label':stamp(t)+' open '+b.open+' high '+b.high+' low '+b.low+' close '+b.close,'class':index===e.selected?'cited-bar':'','style':'cursor:pointer'});
  const part=(tag,attrs)=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));g.append(el);return el;};
  part('rect',{x:cx-width/2-2,y:10,width:width+4,height:240,fill:'transparent','class':'bar-hit'});
  part('line',{x1:cx,x2:cx,y1:y(b.high),y2:y(b.low),stroke:color,'stroke-width':1.5});
  part('rect',{x:cx-width/2,y:Math.min(y(b.open),y(b.close)),width,height:Math.max(1,Math.abs(y(b.open)-y(b.close))),fill:color,stroke:index===e.selected?'white':color,'stroke-width':index===e.selected?2:1});
  g.addEventListener('click',()=>select(b,g));g.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(b,g);}});
 });
 add('line',{x1:16,x2:848,y1:y(level.price),y2:y(level.price),stroke:'#ffe15a','stroke-dasharray':'5 4','pointer-events':'none'});
 add('text',{x:858,y:y(level.price)-6,fill:'#ffe15a','font-size':13,'font-weight':700},price(level.price));
 for(const [t,anchor]of [[start,'start'],[(start+end)/2,'middle'],[end,'end']])add('text',{x:x(t),y:280,fill:'#c0dded','font-size':12,'text-anchor':anchor},stamp(t));
 const selected=e.selected===null?null:e.rows[e.selected];if(selected)select(selected,svg.querySelector('[data-bar="'+e.selected+'"]'));else caption.textContent='Verified '+e.field+' over '+stamp(e.scope.from)+'–'+stamp(e.scope.through)+'. The horizontal line marks that summary price.';
 box.append(svg,caption,node('small','Bars plot returned trade data. Missing intervals stay blank. High/low prices occurred within each interval; the bar-start time is not an exact trade time.','muted'));host.append(box);
}
