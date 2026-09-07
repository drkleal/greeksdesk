import {node} from './map.mjs';
import {renderLevelBoard} from './level-board.mjs';
import {priceText,levelDetails,scenarioRoute,quoteStatus} from './plan.mjs';
import {appendPriceEvidence} from './price-evidence.mjs';
import {renderVerification} from './verification.mjs';
import {families,familyInventory,conversionFor,exposureColumns,levelConfluence,confluenceSummary,confluenceLabel,compact,signed,familyObservation} from './confluence.mjs';

const family=id=>families.find(f=>f.id===id)||families[0];
const button=(text,fn,cls='')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
const el=(tag,text,cls)=>node(tag,text,cls);
function chip(text,color){const c=el('span',text,'wb-chip');if(color)c.style.setProperty('--chip',color);return c;}
const when=t=>Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Time unavailable';
export function refreshWorkbenchAge(host){const badge=host?.querySelector('[data-quote-time]');if(badge)badge.textContent=quoteStatus({latestTimestamp:badge.dataset.quoteTime,freshness:badge.dataset.freshness});}
export function markWorkbenchOld(host){const notice=host?.querySelector('.wb-read-notice');if(notice)notice.hidden=false;}
export function refreshWorkbenchMarketData(host,date,sources){host?.querySelector('.wb-confluence-board')?.dispatchEvent(new CustomEvent('straddle-update',{detail:{date,sources}}));}
export function renderWorkbench(host,read,{panelButton,chartButton}={}){
 host.replaceChildren();const a=read.result.analysis,feed=read.sources.find(s=>s.id==='databento')?.data||{},conversion=conversionFor(read),inventory=familyInventory(read),columns=exposureColumns(read);
 const dialog=el('dialog',undefined,'wb-inspector');
 const close=button('Close ×',()=>dialog.close(),'wb-close'),body=el('div',undefined,'wb-inspector-body');dialog.append(close,body);host.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 function show(title,subtitle){body.replaceChildren(el('span','EVIDENCE INSPECTOR','eyebrow'),el('h2',title),el('p',subtitle,'muted'));if(!dialog.open)dialog.showModal();body.scrollTop=0;}
 function sourceDetail(source,panel){
  if(!source)return;const box=el('section',undefined,'wb-source-detail');box.append(el('h3',panel?.title||source.title),el('p',(panel?.instrument||source.data?.ticker||'Source')+' · '+(panel?.dateRole==='projected_session'?'Forward model ':'Session ')+(panel?.observedDate||source.sessionDate),'muted'));
  const insight=a.sources?.find(s=>s.id===source.id);
  if(panel?.shows||insight?.shows)box.append(el('p',panel?.shows||insight.shows));
  if(panel?.reason||insight?.importance)box.append(el('p',panel?.reason||insight.importance));
  if(panel&&panelButton){const b=panelButton(panel);b.addEventListener('click',()=>dialog.close());box.append(b);}
  else if(source.image&&chartButton){const b=chartButton(source);b.addEventListener('click',()=>dialog.close());box.append(b);}
  if(source.data){const details=el('details');details.append(el('summary','Exact source values'),el('pre',JSON.stringify(source.data,null,2)));box.append(details);}
  body.append(box);
 }
 function inspectLevel(l){
  const d=levelDetails(l,a);show(priceText(l.price)+' '+read.instrument+' · '+d.name,d.badge+' · '+read.date);
  body.append(el('p',d.derivation),el('h3','Confluence at this level'));
  const items=levelConfluence(read,l),summary=confluenceSummary(items);
  body.append(el('p',summary.support.length+' supporting evidence families · '+summary.oppose.length+' opposing · '+summary.context.length+' context. Counts describe coverage, not probability.','muted'));
  for(const item of items){const f=family(item.family),card=el('section',undefined,'wb-finding '+item.effect);card.append(chip(f.label,f.color),chip(item.effect),el('p',item.observation),el('p',item.mechanism,'muted'),el('p','Watch: '+item.watch));if(item.scopeNote)card.append(el('small',item.scopeNote));card.append(button(item.panel?.title||item.source.title,()=>sourceDetail(item.source,item.panel)));body.append(card);}
  body.append(el('h3','Price confirmation'),el('p',l.watch),el('h3','What invalidates the level'),el('p',l.invalidation));
  appendPriceEvidence(body,l,read.sources);
  for(const id of l.sourceIds||[]){const source=read.sources.find(s=>s.id===id),panel=a.panels?.find(p=>l.panelIds?.includes(p.id)&&p.sourceId===id);if(source?.image)sourceDetail(source,panel);}
 }
 function inspectFamily(f){
  show(f.label+' · tool coverage',f.items.length+' supplied panels / feeds. A provider may supply several views of the same underlying evidence.');
  for(const i of f.items){body.append(chip(i.status));sourceDetail(i.source,i.panel);const insight=a.sources?.find(s=>s.id===i.source.id);if(insight?.change)body.append(el('p','Change: '+insight.change));}
  if(!f.items.length)body.append(el('p','No matching feed or captured panel was supplied in this read. It has not been used to justify a level.'));
 }
 const head=el('div',undefined,'wb-heading'),title=el('div');title.append(el('span','GREEKSDESK / MARKET WORKBENCH','eyebrow'),el('h2','Evidence → levels → plan'));
 const stamps=el('div',undefined,'wb-stamps'),age=chip(read.instrument==='ES'&&feed.latestTimestamp?quoteStatus(feed):'Read snapshot');
 if(read.instrument==='ES'&&feed.latestTimestamp){age.dataset.quoteTime=feed.latestTimestamp;age.dataset.freshness=feed.freshness;}
 stamps.append(chip(read.instrument==='ES'?(feed.contract||'ES'):'SPX','#2ce2ff'),chip(read.date),age,chip('Analysis '+when(read.result.checkedAt)));if(read.result.review?.reviewedAt)stamps.append(chip('Reviewed '+when(read.result.review.reviewedAt),'#78e4ff'));head.append(title,stamps);host.append(head);
 const notice=el('p','Inputs changed · this board still shows the previous analysis. Update & analyze to rebuild it from the latest sources.','wb-read-notice');notice.hidden=true;host.append(notice);
 const thesis=el('div',undefined,'wb-thesis');thesis.append(el('strong',a.headline),el('span',conversion.label,'wb-basis'));
 if(conversion.reference)thesis.append(el('small','Anchor observations: ES '+priceText(conversion.reference.esPrice)+' at '+when(conversion.reference.esTime)+' / SPX '+priceText(conversion.reference.spxPrice)+' at '+when(conversion.reference.spxTime)+'. Approximate model overlays only.'));
 host.append(thesis);
 host.append(renderVerification(read,{inspectLevel}));
 const strip=el('div',undefined,'wb-family-strip');
 for(const f of inventory){const reviewed=f.items.filter(i=>['reviewed','partial','context','forward-model'].includes(i.status)),b=button('',()=>inspectFamily(f),'wb-family');b.style.setProperty('--family',f.color);b.append(el('span',f.label),el('strong',reviewed.length?reviewed.length+' reviewed':f.items.some(i=>i.status==='not-reviewed')?'Awaiting analysis':f.items.length?'Unavailable':'Not supplied'),el('p',familyObservation(read,f.id)||'','wb-family-observation'),el('small',f.items.some(i=>i.status==='forward-model')?'Includes forward model':f.items.some(i=>i.status==='partial')?'Partial coverage':reviewed.length?'Open findings & charts':f.items.some(i=>i.status==='not-reviewed')?'Data supplied · read pending':'Visible coverage gap'));strip.append(b);}host.append(strip);
 const board=el('section',undefined,'wb-confluence-board');host.append(board);renderLevelBoard(board,read,{inspectLevel,inspectScenario:s=>{const card=right.querySelector('[data-direction="'+s.direction+'"]');if(card){card.open=true;card.scrollIntoView({block:'nearest',behavior:'smooth'});}},inspectSource:(source,context)=>{if(!source)return;show(context?.title||source.title,source.data?.scope||read.date);for(const fact of context?.facts||[])body.append(el('p',fact));sourceDetail(source);}});
 const grid=el('div',undefined,'wb-grid'),left=el('section',undefined,'wb-levels'),right=el('section',undefined,'wb-plan');
 left.append(el('h3','Level identity & confluence'),el('p','Select a level to see the evidence behind it.','muted'));
 for(const l of [...a.levels].sort((x,y)=>y.price-x.price)){
  const d=levelDetails(l,a),items=levelConfluence(read,l),label=confluenceLabel(items),b=button('',()=>inspectLevel(l),'wb-level');
  b.style.setProperty('--level',l.kind==='support'?'#40ffc1':l.kind==='resistance'?'#ff5e90':'#ffe16a');
  const price=el('strong',priceText(l.price));if(label.stars)price.append(el('span',' '+label.stars,'wb-confluence-stars'));
  b.append(price,el('span',d.name),el('small',d.description));
  const tags=el('div',undefined,'wb-tags');for(const [i,id]of label.families.entries())tags.append(chip(label.labels[i],family(id).color));if(label.labels.length)b.append(tags);left.append(b);
 }
 if(!a.levels.length)left.append(el('p','No verified levels in this read. Open the evidence families to see the coverage.'));
 right.append(el('h3','If / then playbook'));
 for(const s of a.scenarios||[]){const route=scenarioRoute(s,a.levels,a.checkpoints),card=el('details',undefined,'wb-scenario '+s.direction);card.dataset.direction=s.direction;card.open=route.ready;
  const summary=el('summary');summary.append(el('strong',({up:'↑ Upside',down:'↓ Downside',neutral:'↔ Neutral'})[s.direction]),el('span',route.ready?priceText(route.totalPoints)+' pts across route':'Not established'));card.append(summary);
  if(route.ready){const trail=el('div',undefined,'wb-route');for(const [i,l]of [route.first.from,...route.stages.map(s=>s.to)].entries()){if(i)trail.append(el('span','→'));trail.append(button(priceText(l.price),()=>inspectLevel(l)));}card.append(trail);}
  card.append(el('p',s.condition));
  if(route.hasContinuation)card.append(el('p','Then: '+s.continuation.condition,'wb-then'));
  const details=el('details');details.append(el('summary','Reasons, confirmation & failure'),el('p',s.rationale||''),el('p','Confirm: '+s.confirmation),el('p','Invalidation: '+s.invalidation));
  for(const d of s.drivers||[]){const source=read.sources.find(x=>x.id===d.sourceId),panel=a.panels?.find(x=>x.id===d.panelId);const b=button((panel?.title||source?.title||'Source')+' · '+d.effect,()=>{show('Why this '+s.direction+' path',d.reason);sourceDetail(source,panel);},'wb-driver');details.append(b);}card.append(details);
  const checks=route.stages.flatMap(s=>s.checks);if(checks.length)card.append(el('p','Reassess: '+checks.map(l=>priceText(l.price)).join(' → '),'muted'));right.append(card);
 }
 right.append(el('small','Price distances are conditional routes, not expected profits. Stops and risk/reward require an established invalidation price.','muted'));grid.append(left,right);host.append(grid);

 const exposure=el('section',undefined,'wb-exposures'),exphead=el('div',undefined,'wb-map-head');exphead.append(el('h3','Exposure ladder · inspect the numbers behind the read'),chip(conversion.kind==='unmapped'?'SPX coordinates':conversion.kind==='anchor'?'Approximate ES reference':'ES / SPX aligned'));
 exposure.append(exphead,el('p','QD: signed call / put exposure; bright bars show the separate 0DTE slice. OD: signed model value. Each column has its own scale and units. Bar color shows sign, not a buy or sell instruction.','muted'));
 const scroll=el('div',undefined,'wb-table-scroll'),table=el('table',undefined,'wb-exposure-table'),thead=el('thead'),tr=el('tr');tr.append(el('th',conversion.kind==='unmapped'?'SPX strike / model price':read.instrument+' reference · SPX below'));
 for(const c of columns){const th=el('th');th.append(el('strong',c.title),el('small',c.unit+' · '+c.scope));tr.append(th);}thead.append(tr);table.append(thead);
 const tbody=el('tbody'),prices=[...new Set(columns.flatMap(c=>c.rows.map(r=>r.price)))].sort((x,y)=>y-x),spot=read.sources.find(s=>s.id==='qd-gamma')?.data?.stockPrice;
 const eligible=Number.isFinite(spot)?prices.filter(p=>Math.abs(p-spot)<=100):prices;
 const scales=columns.map(c=>Math.max(1,...c.rows.filter(r=>eligible.includes(r.price)).flatMap(r=>[r.call,r.put,r.net].filter(Number.isFinite).map(Math.abs))));
 for(const p of eligible){const row=el('tr'),label=el('th');label.scope='row';label.append(el('strong',(conversion.kind==='anchor'?'≈ ':'')+priceText(p+(conversion.basis??0))));if(conversion.kind!=='unmapped'&&read.instrument==='ES')label.append(el('small','SPX '+priceText(p)));row.append(label);
  columns.forEach((c,index)=>{const cell=el('td'),r=c.rows.find(r=>r.price===p);cell.dataset.column=c.id;if(!r){cell.append(el('span','—','wb-no-value'));row.append(cell);return;}
   const b=button('',()=>{show(c.title+' · SPX '+priceText(p),c.scope+' · '+c.unit);body.append(el('p','Net '+signed(r.net)+(Number.isFinite(r.call)?' · Call '+signed(r.call)+' · Put '+signed(r.put):'')),el('p',conversion.label,'muted'));sourceDetail(c.source);},'wb-bar-cell');b.setAttribute('aria-label',c.title+' SPX '+p+' net '+r.net);b.title=c.title+' · Net '+signed(r.net)+' '+c.unit;
   const track=el('span',undefined,'wb-bar-track');for(const value of Number.isFinite(r.call)?[r.call,r.put]:[r.net]){if(!Number.isFinite(value)||value===0)continue;const bar=el('i',undefined,value>=0?'positive':'negative'),width=Math.max(.5,Math.abs(value)/scales[index]*48);bar.style.width=width+'%';bar.style.left=(value>=0?50:50-width)+'%';track.append(bar);}b.append(track,el('small',compact(r.net)));cell.append(b);row.append(cell);
  });tbody.append(row);
 }
 table.append(tbody);scroll.append(table);exposure.append(scroll);
 if(!eligible.length)exposure.append(el('p','No numeric exposure rows in this read. Update data to collect the strike ladder.'));
 if(columns.some(c=>c.partial))exposure.append(el('p','This saved read contains ranked excerpts. The next data update retains the broader strike ladder and separate 0DTE values. Blank cells mean no supplied value, not zero.','muted'));
 const extra=el('details',undefined,'wb-extra-exposures');extra.append(el('summary','All exposure columns & exact values'),exposure);host.append(extra);
 const changes=el('section',undefined,'wb-watch'),watchhead=el('h3','What changed / what to watch');changes.append(watchhead);
 for(const text of (a.changes||[]).slice(0,3))changes.append(el('p',text));
 const gaps=el('details');gaps.append(el('summary',(a.gaps||[]).length+' gaps or conflicts to inspect'));for(const text of a.gaps||[])gaps.append(el('p',text));changes.append(gaps);host.append(changes);
}
