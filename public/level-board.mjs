import {node} from './map.mjs';
import {conversionFor,exposureColumns,compact,signed,levelConfluence,confluenceLabel} from './confluence.mjs';
import {priceText,levelDetails,scenarioRoute} from './plan.mjs';
import {mountStraddlePanel} from './straddle-panel.mjs';
import {levelBrief,wrapBrief} from './level-brief.mjs';
import {barValues,seriesScale,gammaConcentrations} from './exposure-display.mjs';
const ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={},text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
function active(e,click){e.setAttribute('tabindex','0');e.setAttribute('role','button');e.addEventListener('click',click);e.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();click();}});}
export function renderLevelBoard(host,read,{inspectLevel,inspectSource,inspectScenario}){
 const a=read.result.analysis,conversion=conversionFor(read),feed=read.sources.find(s=>s.id==='databento')?.data;
 const title=node('div',undefined,'wb-board-heading');title.append(node('h3','Conditional paths & confluence · '+read.instrument),node('p','Each exposure series uses its own visible-range scale. Bright bars: selected expiration; dim bars: all expirations. Compare magnitude within a series.','muted'));
 const controls=node('div',undefined,'controls'),range=node('select');range.setAttribute('aria-label','Confluence chart range');for(const [value,label]of [[80,'±80 points'],[40,'±40 points'],[150,'±150 points']]){const o=node('option',label);o.value=value;range.append(o);}
 const expiry=node('select');expiry.setAttribute('aria-label','Highlighted Gamma expiration');const dates=read.sources.find(s=>s.id==='qd-gamma')?.data?.expirationDates||[read.date];for(const d of dates){const o=node('option','Gamma exp '+d+(d===read.date?' · session':' · forward'));o.value=d;expiry.append(o);}expiry.value=dates.includes(read.overlayExpiration)?read.overlayExpiration:read.date;
 controls.append(node('span',conversion.label,'wb-basis'),range,expiry);title.append(controls);host.append(title);
 const tooltip=node('div',undefined,'wb-board-tooltip');tooltip.hidden=true;tooltip.id='confluence-hover';tooltip.setAttribute('role','tooltip');tooltip.setAttribute('popover','manual');host.append(tooltip);
 let dismissEvents,detachObserver,leaveTimer,currentTarget;
 const hideTip=()=>{clearTimeout(leaveTimer);dismissEvents?.abort();detachObserver?.disconnect();if(tooltip.matches(':popover-open'))tooltip.hidePopover();tooltip.hidden=true;currentTarget=null;};
 const leaveTip=()=>{clearTimeout(leaveTimer);leaveTimer=setTimeout(hideTip,120);};
 tooltip.addEventListener('mouseenter',()=>clearTimeout(leaveTimer));tooltip.addEventListener('mouseleave',leaveTip);
 function tip(target,heading,lines,action){
  // ARIA supplies the accessible name; an SVG title would create a second,
  // browser-owned tooltip on top of this explanation.
  target.setAttribute('aria-label',heading);target.setAttribute('aria-describedby',tooltip.id);
  const show=()=>{
   hideTip();currentTarget=target;
   tooltip.replaceChildren(node('strong',heading),...lines.map(l=>node('p',l)),node('small','Click the marker for complete evidence · Esc to dismiss'));
   tooltip.hidden=false;tooltip.showPopover?.();
   // Anchor to the label/card, not the price line spanning the entire SVG.
   const anchor=target.querySelector('[data-level-card],rect[rx],text')||target,b=anchor.getBoundingClientRect(),t=tooltip.getBoundingClientRect(),pad=12,gap=16,vw=document.documentElement.clientWidth,vh=innerHeight;
   const left=b.left-gap-t.width,right=b.right+gap,preferLeft=(b.left+b.right)/2>vw/2;
   let x=preferLeft?left:right,y=b.top+(b.height-t.height)/2;
   if(x<pad||x+t.width>vw-pad)x=preferLeft?right:left;
   if(x<pad||x+t.width>vw-pad){x=(b.left+b.right-t.width)/2;y=b.bottom+gap;if(y+t.height>vh-pad)y=b.top-gap-t.height;}
   tooltip.style.left=Math.max(pad,Math.min(vw-t.width-pad,x))+'px';tooltip.style.top=Math.max(pad,Math.min(vh-t.height-pad,y))+'px';
   dismissEvents=new AbortController();const options={signal:dismissEvents.signal};
   window.addEventListener('scroll',event=>{if(!tooltip.contains(event.target))hideTip();},{...options,capture:true});
   window.addEventListener('resize',hideTip,options);window.addEventListener('keydown',event=>{if(event.key==='Escape')hideTip();},options);
   // A refreshed read can remove the board while the pointer is still over it.
   detachObserver=new MutationObserver(()=>{if(!target.isConnected)hideTip();});detachObserver.observe(host.parentNode,{childList:true,subtree:true});
  };
  target.addEventListener('mouseenter',show);target.addEventListener('focus',()=>requestAnimationFrame(()=>{if(document.activeElement===target)show();}));target.addEventListener('mouseleave',()=>{if(currentTarget===target)leaveTip();});target.addEventListener('blur',()=>{if(currentTarget===target)hideTip();});active(target,()=>{hideTip();action();});
 }
 let visibleSpan=80;
 const straddle=mountStraddlePanel(host,read,()=>draw());
 const stage=node('div',undefined,'wb-board-stage'),plot=node('div',undefined,'wb-board-scroll'),rail=node('div',undefined,'wb-zoom-rail'),zoom=node('input'),zoomIn=node('button','+'),zoomOut=node('button','−'),reset=node('button','Reset');
 zoom.type='range';zoom.min='20';zoom.max='150';zoom.step='5';zoom.value=String(visibleSpan);zoom.setAttribute('aria-label','Chart vertical zoom');zoom.setAttribute('aria-orientation','vertical');zoomIn.setAttribute('aria-label','Zoom in');zoomOut.setAttribute('aria-label','Zoom out');
 function setZoom(value){visibleSpan=Math.max(20,Math.min(150,value));zoom.value=String(visibleSpan);zoom.setAttribute('aria-valuetext','Plus or minus '+visibleSpan+' points');for(const o of [...range.options])if(o.dataset.custom)o.remove();if(![40,80,150].includes(visibleSpan)){const o=node('option','±'+visibleSpan+' points');o.value=String(visibleSpan);o.dataset.custom='true';range.append(o);}range.value=String(visibleSpan);draw();}
 zoom.oninput=()=>setZoom(Number(zoom.value));zoomIn.onclick=()=>setZoom(visibleSpan-10);zoomOut.onclick=()=>setZoom(visibleSpan+10);reset.onclick=()=>setZoom(80);rail.append(zoomIn,zoom,zoomOut,reset);stage.append(plot,rail);host.append(stage);
 const groups=[{label:'GAMMA',ids:['qd-gamma','qd-gamma-0dte','od-gex-mm-strike'],x:120,w:220},{label:'DEX',ids:['qd-delta','od-dex-mm-strike'],x:360,w:160},{label:'VANNA',ids:['qd-vanna','od-vex-mm-strike'],x:540,w:160},{label:'OPEN INTEREST',ids:['qd-oi-strike','qd-oi-strike-0dte'],x:720,w:150}];
 function draw(){
  hideTip();plot.replaceChildren();const columns=exposureColumns(read,{expirationDate:expiry.value}),canMap=conversion.kind!=='unmapped',basis=conversion.basis||0;
  const last=read.instrument==='ES'?feed?.latestPrice:read.sources.find(s=>s.id==='quantdata')?.data?.latestPrice;
  const spot=Number.isFinite(last)?last:(a.levels[0]?.price||0),span=visibleSpan,min=Math.floor((spot-span)/5)*5,max=Math.ceil((spot+span)/5)*5;
  const levels=a.levels.filter(l=>l.role==='structure'&&l.price>=min&&l.price<=max).sort((a,b)=>b.price-a.price);
  if(!spot){plot.append(node('p','Verified price levels will appear here after the first analysis.','muted'));return;}
  const briefs=new Map(levels.map(l=>{const b=levelBrief(read,l,{expirationDate:expiry.value}),lines=wrapBrief(b.condition);return [l.id,{...b,lines,height:70+lines.length*15+(b.confluence.text?16:0)+wrapBrief(b.modelText,90).length*15}];}));
  // Increase price scale density to keep the full condition on its own level.
  // Text is never displaced to another price or silently shortened.
  const density=Math.min(24,Math.max(6,...levels.slice(0,-1).map((l,i)=>(briefs.get(l.id).height+8)/Math.max(1,l.price-levels[i+1].price))));
  const H=Math.max(950,(max-min)*density+180),W=1920,top=65,bottom=H-110,y=p=>top+(max-p)/(max-min)*(bottom-top);
  const root=svg('svg',{viewBox:`-160 0 ${W+160} ${H}`,class:'wb-level-board','aria-label':'Full width price and exposure confluence chart'}),defs=svg('defs');
  for(const [d,c]of [['up','#40ffc1'],['down','#ff5e90'],['neutral','#ffe16a']]){const m=svg('marker',{id:'board-arrow-'+d,markerWidth:8,markerHeight:8,refX:6,refY:3,orient:'auto'});m.append(svg('path',{d:'M0,0 L0,6 L7,3 z',fill:c}));defs.append(m);}root.append(defs);
  root.append(svg('text',{x:14,y:23,fill:'#cce6ff','font-size':14},read.instrument+' LEVEL'),svg('text',{x:890,y:23,fill:'#cce6ff','font-size':14},'SESSION / PROFILE / DEPTH'),svg('text',{x:1350,y:23,fill:'#cce6ff','font-size':14},'LEVEL / CONDITIONAL PLAN / CONFLUENCE'));
  const premium=straddle.view(),clip=p=>Math.max(top,Math.min(bottom,y(p)));
  root.append(svg('text',{x:-92,y:23,fill:'#40ffc1','font-size':10,'font-weight':700},'STRADDLE'),svg('text',{x:-150,y:23,fill:'#8abaff','font-size':10,'font-weight':700},'VIX 1D'));
  if(premium.vixRange.ready){
   const v=premium.vixRange,g=svg('g',{'data-vix-bar':'true'}),c='#8abaff';
   g.append(svg('rect',{x:-136,y:clip(v.upper),width:13,height:Math.max(2,clip(v.lower)-clip(v.upper)),rx:3,fill:c,opacity:.38,stroke:c,'stroke-width':2}));
   for(const [p,sign]of [[v.upper,'+'],[v.lower,'−']])g.append(svg('line',{x1:-144,x2:-115,y1:clip(p),y2:clip(p),stroke:c,'stroke-width':2}),svg('text',{x:-129,y:clip(p)+(sign==='+'?-8:16),'text-anchor':'middle',fill:c,'font-size':10},(p>max?'↑ ':p<min?'↓ ':'')+sign+priceText(v.points)));
   tip(g,'VIX daily benchmark · ±'+priceText(v.points)+' points',[v.method,'VIX '+priceText(premium.observation.vix)+' · SPX '+priceText(premium.observation.spot)+' · '+v.timestamp,'ES bounds '+priceText(v.lower)+' – '+priceText(v.upper)+' · same-time anchor '+priceText(v.anchor)],()=>inspectSource(premium.source,{title:'VIX daily range benchmark',facts:[v.method,'±'+priceText(v.points)+' points · '+v.timestamp]}));root.append(g);
  }
  if(premium.observation?.ready&&premium.mapping.ready){
   const {lower,upper,anchor}=premium.mapping,g=svg('g',{'data-straddle-bar':'true'}),c='#40ffc1';
   g.append(svg('rect',{x:-62,y:clip(upper),width:14,height:Math.max(2,clip(lower)-clip(upper)),rx:3,fill:c,opacity:.25,stroke:c,'stroke-width':2}));
   for(const [p,label]of [[upper,'+'+priceText(premium.observation.premium)],[lower,'−'+priceText(premium.observation.premium)]])g.append(svg('line',{x1:-70,x2:-35,y1:clip(p),y2:clip(p),stroke:c,'stroke-width':2}),svg('text',{x:-55,y:clip(p)+(p===upper?-8:16),'text-anchor':'middle',fill:c,'font-size':11,'font-weight':700},(p>max?'↑ ':p<min?'↓ ':'')+label));
   g.append(svg('line',{x1:-70,x2:7,y1:clip(anchor),y2:clip(anchor),stroke:c,'stroke-dasharray':'2 3'}),svg('text',{x:-55,y:42,'text-anchor':'middle',fill:'#aee9df','font-size':10},premium.label));
   tip(g,premium.label+' straddle · ±'+priceText(premium.observation.premium)+' points',premium.facts,()=>inspectSource(premium.source,{title:premium.label+' straddle / VIX',facts:premium.facts}));root.append(g);
   if(premium.multiples&&premium.opening?.ready&&premium.openingMapping.ready){
    for(const sign of [-1,1]){const p=premium.openingMapping.anchor+sign*2*premium.opening.premium;if(p<min||p>max)continue;root.append(svg('line',{x1:-30,x2:1645,y1:y(p),y2:y(p),stroke:'#c797ff','stroke-dasharray':'2 6',opacity:.7}),svg('text',{x:120,y:y(p)-5,fill:'#cfb2ff','font-size':11},'2× opening premium · '+priceText(p)));}
   }
  }else root.append(svg('text',{x:-104,y:44,fill:'#a8bad2','font-size':10},'Unavailable'));
  if(!canMap)root.append(svg('text',{x:130,y:43,fill:'#ffe16a','font-size':13},'SPX columns require a matching basis. Native ES structure remains visible.'));
  for(let p=min;p<=max;p+=5){const yy=y(p);root.append(svg('line',{x1:10,x2:1645,y1:yy,y2:yy,stroke:'#17395b'}));if(levels.some(l=>Math.abs(l.price-p)<3))continue;root.append(svg('text',{x:100,y:yy+4,'text-anchor':'end',fill:'#e5f5ff','font-size':14,'font-weight':700},priceText(p)));if(canMap&&read.instrument==='ES')root.append(svg('text',{x:100,y:yy+15,'text-anchor':'end',fill:'#89a8ce','font-size':10},'SPX '+priceText(p-basis)));}
  for(const group of groups){
   root.append(svg('text',{x:group.x,y:23,fill:'#8fbbf4','font-size':14},group.label));
   const selected=group.ids.map(id=>columns.find(c=>c.id===id)).filter(Boolean),baseX=group.x+group.w/2;
   root.append(svg('line',{x1:baseX,x2:baseX,y1:top,y2:bottom,stroke:'#486381'}));
   selected.forEach((col,i)=>{
    const rows=canMap?col.rows.filter(r=>r.price+basis>=min&&r.price+basis<=max):[];
    const scale=seriesScale(col,rows);
    for(const r of rows){const yy=y(r.price+basis),g=svg('g'),od=col.id.startsWith('od-'),oi=col.id.startsWith('qd-oi-strike'),zero=col.id.endsWith('-0dte');
     const vals=barValues(col,r),h=od?4:zero?22:28,offset=od?16:0;
     for(const v of vals){if(!Number.isFinite(v)||v===0)continue;const width=Math.max(.8,Math.abs(v)/scale*(group.w/2-8)),color=oi?(v>=0?'#67b8ff':'#c797ff'):od?'#ffffff':v>=0?'#40ffc1':'#ff5e90';g.append(svg('rect',{x:v>=0?baseX:baseX-width,y:yy-h/2+offset,width,height:h,fill:color,opacity:od?.9:zero?1:oi||group.ids.length===3?.38:.78}));}
     // Whole row is focusable so small exposures are still inspectable.
     g.append(svg('rect',{x:group.x,y:yy-7+offset,width:group.w,height:od?5:13,fill:'transparent'}));
     const values=oi?'Calls '+compact(r.call)+' · Puts '+compact(r.put):'Net '+signed(r.net)+(Number.isFinite(r.call)&&Number.isFinite(r.put)?' · Call contribution '+signed(r.call)+' · Put contribution '+signed(r.put):'');
     tip(g,col.title+' · '+priceText(r.price)+' SPX',[col.unit+' · '+col.scope,values,'Independent series scale · longest visible leg/value '+compact(scale)+' '+col.unit,col.source?.data?.limitation||'Provider observation'],()=>inspectSource(col.source,{title:col.title+' · SPX '+priceText(r.price),facts:[col.unit+' · '+col.scope,values]}));root.append(g);
    }
   });
   root.append(svg('text',{x:group.x,y:H-12,fill:'#8eabd0','font-size':9},group.label==='OPEN INTEREST'?'All dim / session expiry bright':group.label==='GAMMA'?'QD all dim / selected expiry bright · OD white':'QD net signed bars · OD white'));
  }
  const references=[];
  const gammaSlice=columns.find(c=>c.id==='qd-gamma-0dte');if(canMap)for(const r of gammaConcentrations(gammaSlice,min,max,basis))references.push({price:r.price+basis,name:'≈ QD GEX '+(r.net>0?'+':'')+compact(r.net),source:gammaSlice.source,model:true,detail:'SPX '+r.price+' · expiration '+expiry.value+' · '+gammaSlice.unit+' · call '+signed(r.call)+' / put '+signed(r.put)+' / net '+signed(r.net)+'. One of the six largest gross call/put concentrations in the visible supplied slice. '+conversion.label+'. Source concentration, not a confirmed trade trigger.'});
  for(const [name,data]of [['Futures session',feed?.session],...(!feed?.sessionProfiles?.RTH?[['RTH',feed?.cashSession]]:[]),...Object.entries(feed?.sessionProfiles||{})]){
   if(!data)continue;
   for(const [kind,key]of [['high','high'],['low','low'],['VWAP','vwap']])if(Number.isFinite(data[key]))references.push({price:data[key],name:name+' '+kind,source:read.sources.find(s=>s.id==='databento'),detail:feed.contract+' · '+(data.from||'')+' → '+(data.through||'')+(kind==='VWAP'?' · '+(data.vwapMethod||'trade-weighted'):' · observed session extreme')+(Number.isFinite(data.volume)?' · '+compact(data.volume)+' contracts':'')});
  }
  for(const l of [...a.levels,...(a.checkpoints||[])])if(/poc|hvn|lvn|vwap|\bvah\b|\bval\b|profile|value area/i.test(l.identity?.name||l.label)&&!l.sourceIds?.some(id=>read.sources.find(s=>s.id===id)?.data?.chartScope==='multi_day_context'))references.push({price:l.price,name:l.apiOrigin?.timeframe==='volume_profile'?l.apiOrigin.field.toUpperCase():l.identity?.name||l.label,level:l,detail:l.evidence});
  const profile=feed?.volumeProfile;if(profile?.available)for(const r of profile.nodes||[]){const reference={price:r.price,name:r.kind,source:read.sources.find(s=>s.id==='databento'),detail:feed.contract+' · '+compact(r.volume)+' contracts in this one-point bucket · '+(r.reason||profile.method)+' Window '+profile.from+' → '+profile.through},existing=references.find(item=>item.name===r.kind&&item.price===r.price);if(existing)Object.assign(existing,reference);else references.push(reference);}
  const visibleReferences=[...new Map(references.filter(r=>r.price>=min&&r.price<=max).map(r=>[r.name+':'+r.price,r])).values()].sort((a,b)=>b.price-a.price);
  const samePrices=new Map();for(const r of visibleReferences){const key=r.price+':'+(r.source?.id||r.level?.sourceIds?.join(',')||'');if(!samePrices.has(key))samePrices.set(key,[]);samePrices.get(key).push(r);}
  const placedReferences=[],referenceLayer=svg('g',{'data-price-references':'true'}),measure=document.createElement('canvas').getContext('2d');measure.font='10px Arial';
  for(const rows of samePrices.values()){
   const r=rows[0],yy=y(r.price),g=svg('g'),names=rows.map(r=>r.name),compactName=name=>name.replace('Futures session','Session').replace('Overnight','ON');
   const suffix=names.every(n=>n.endsWith(' high'))?'high':names.every(n=>n.endsWith(' low'))?'low':null;
   const name=rows.length>1&&suffix?names.map(n=>compactName(n).slice(0,-suffix.length-1)).join('/')+' '+suffix:names.map(compactName).join(' / ');
   // Keep every reference on its exact price coordinate. Neighbors use another
   // horizontal lane; identical prices share a label instead of moving in price.
   const text=name+' '+priceText(r.price),width=measure.measureText(text).width+14;
   let x=890;for(const prior of placedReferences.filter(p=>Math.abs(p.y-yy)<12).sort((a,b)=>a.x-b.x)){if(x+width<=prior.x)break;if(x<prior.x+prior.width)x=prior.x+prior.width+8;}
   placedReferences.push({x,y:yy,width});
   const color=r.model?'#bba3ff':names.some(n=>/POC/i.test(n))?'#ff80df':'#d5e8ff',heading=names.join(' / ')+' · '+priceText(r.price),facts=rows.map(item=>item.name+': '+item.detail);
   g.append(svg('line',{x1:10,x2:1320,y1:yy,y2:yy,stroke:'#afc7e8','stroke-dasharray':names.some(n=>/VWAP/.test(n))?'7 4':'2 4',opacity:.35}),svg('circle',{cx:x,cy:yy,r:2.5,fill:color}),svg('text',{x:x+6,y:yy,'dominant-baseline':'central',fill:color,'font-size':10,stroke:'#061937','stroke-width':3,'paint-order':'stroke'},name+' '+priceText(r.price)));
   tip(g,heading,facts,()=>rows.length===1&&r.level?inspectLevel(r.level):r.source?inspectSource(r.source,{title:heading,facts}):inspectLevel(r.level));referenceLayer.append(g);
  }
  const depth=read.sources.find(s=>s.id==='od-depth-gex');if(canMap&&depth?.data.available)for(const d of (depth.data.byStrike||[]).filter(r=>r.strike+basis>=min&&r.strike+basis<=max).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)).slice(0,12)){const g=svg('g');g.append(svg('rect',{x:1302,y:y(d.strike+basis)-5,width:10,height:10,fill:'#a7c9ef'}));const cells=(depth.data.rows||[]).filter(r=>r.strike===d.strike);tip(g,'Depth View · '+priceText(d.strike+basis)+' '+read.instrument,['SPX '+d.strike+' · net '+signed(d.net)+' OD units',...cells.slice(0,4).map(r=>r.expirationDate+': '+signed(r.net))],()=>inspectSource(depth,{title:'Depth View · '+priceText(d.strike+basis)+' '+read.instrument,facts:['SPX '+d.strike+' · net '+signed(d.net)+' OD units',...cells.slice(0,6).map(r=>r.expirationDate+': '+signed(r.net))]}));root.append(g);}
  const priceLabels=svg('g',{'data-trade-price-labels':'true'});
  for(const l of levels){
   const yy=y(l.price),g=svg('g',{'data-level-id':l.id}),d=levelDetails(l,a),items=levelConfluence(read,l),label=confluenceLabel(items),decision=l.role==='structure';
   const color=l.kind==='support'?'#40ffc1':l.kind==='resistance'?'#ff5e90':'#ffe16a';
   const priceLabel=svg('g');priceLabel.append(svg('rect',{x:8,y:yy-11,width:100,height:22,rx:3,fill:'#061937'}),svg('text',{x:100,y:yy,'text-anchor':'end','dominant-baseline':'central',fill:color,'font-size':14,'font-weight':750},priceText(l.price)));
   if(label.stars)priceLabel.append(svg('text',{x:10,y:yy,'dominant-baseline':'central',fill:'#ffd34f','font-size':14,class:'wb-confluence-stars'},label.stars));
   tip(priceLabel,d.name+' · '+priceText(l.price),[label.text||d.derivation],()=>inspectLevel(l));priceLabels.append(priceLabel);
   g.append(svg('line',{x1:10,x2:1330,y1:yy,y2:yy,stroke:color,'stroke-width':decision?4:1.5,opacity:decision?1:.6}));
   const brief=briefs.get(l.id),next=levels[levels.indexOf(l)+1],height=next?Math.max(34,Math.min(brief.height,y(next.price)-yy-6)):brief.height;
   g.append(svg('line',{x1:1330,x2:1350,y1:yy,y2:yy,stroke:color,'stroke-width':2}));
   const frame=svg('foreignObject',{x:1350,y:yy-14,width:554,height,'data-level-card':l.id}),card=node('div',undefined,'wb-level-card'),header=node('header'),price=node('strong',priceText(l.price));
   card.style.setProperty('--level',color);if(label.stars)price.append(node('span',' '+label.stars,'wb-confluence-stars'));
   header.append(price,node('span',d.name));card.append(header,node('p',brief.role,'wb-level-role'),node('p',brief.condition));
   if(label.text)card.append(node('p',label.text,'wb-level-facts'));if(brief.modelText)card.append(node('p',brief.modelText,'wb-level-context'));frame.append(card);g.append(frame);
   tip(g,d.name+' · '+priceText(l.price),[...(label.text?[label.text]:[]),d.derivation,...items.filter(i=>i.effect==='supports'&&!i.coordinateOnly).slice(0,3).map(i=>i.observation)],()=>inspectLevel(l));root.append(g);
  }
  for(const s of a.scenarios||[]){
   const route=scenarioRoute(s,a.levels,a.checkpoints);if(!route.ready)continue;
   const x=({up:1322,down:1332,neutral:1342})[s.direction],c=({up:'#40ffc1',down:'#ff5e90',neutral:'#ffe16a'})[s.direction];
   for(const [i,stage]of route.stages.entries()){
    if(stage.from.price<min||stage.from.price>max||stage.to.price<min||stage.to.price>max)continue;
    const path=svg('path',{d:`M${x},${y(stage.from.price)} L${x},${y(stage.to.price)}`,stroke:c,'stroke-width':2.5,fill:'none','marker-end':'url(#board-arrow-'+s.direction+')',...(i?{'stroke-dasharray':'5 4'}:{})}),conditions=i?s.continuation:s;
    tip(path,s.direction+' conditional path',[conditions.condition,'Confirm: '+conditions.confirmation,'Invalidation: '+conditions.invalidation],()=>inspectScenario?inspectScenario(s):inspectLevel(stage.from));root.append(path);
    for(const cp of stage.checks){const dot=svg('circle',{cx:x,cy:y(cp.price),r:4,fill:'#071b36',stroke:c,'stroke-width':2});tip(dot,'Checkpoint · '+priceText(cp.price)+' · '+levelDetails(cp,a).name,[cp.evidence,cp.watch],()=>inspectLevel(cp));root.append(dot);}
   }
  }
  if(Number.isFinite(last))root.append(svg('line',{x1:10,x2:1330,y1:y(last),y2:y(last),stroke:'#2ce2ff','stroke-width':2,'stroke-dasharray':'5 4'}),svg('rect',{x:112,y:y(last)-21,width:176,height:19,rx:3,fill:'#082442'}),svg('text',{x:120,y:y(last)-7,fill:'#42e8ff','font-size':14,'font-weight':700},'Observed '+priceText(last)));
  root.append(referenceLayer,priceLabels);plot.append(root);
 }
 range.onchange=()=>setZoom(Number(range.value));expiry.onchange=draw;draw();
 const legend=node('p',undefined,'wb-board-legend');legend.append(node('span','★ 3 supporting families     ★★ 4 or more','wb-confluence-stars'),node('span',' · Repeated views count once. Hover for the contribution; click for complete evidence.'));host.append(legend);
 const detail=node('details',undefined,'wb-board-method');detail.append(node('summary','How the chart combines sources'),node('p','Stars count distinct supporting families, not trade probability. Conflicting, unavailable and coordinate-only evidence stays in the inspector. Each exposure column keeps its own scale and units. SPY dark-pool prints remain in the evidence inventory until a verified SPY-to-ES mapping is available.','muted'));host.append(detail);
}
