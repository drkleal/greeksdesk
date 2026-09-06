import {levelColors,levelDetails,priceText,pathDirectionValid,directionTitle,decisionZones,setupRoom} from './plan.mjs';
export const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const svgNode=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;};
// Labels have their own collision-free positions. Price lines keep the linear scale.
export function labelPositions(positions,top=65,bottom=380,gap=50){
 const labels=positions.map(p=>Math.max(top,Math.min(bottom,p)));
 for(let i=1;i<labels.length;i++)labels[i]=Math.max(labels[i],labels[i-1]+gap);
 if(labels.length&&labels.at(-1)>bottom){labels[labels.length-1]=bottom;for(let i=labels.length-2;i>=0;i--)labels[i]=Math.min(labels[i],labels[i+1]-gap);}
 return labels;
}
export function renderMap(host,analysis,instrument,onSelect,onScenario=()=>{}){
 host.replaceChildren();host.classList.remove('empty');
 const levels=[...analysis.levels].sort((a,b)=>b.price-a.price);
 if(!levels.length){host.classList.add('empty');host.textContent='No verified levels yet. See the evidence findings on the left.';return;}
 const zones=decisionZones(levels);
 if(!zones.length){host.classList.add('empty');host.textContent='Watch only. No established price-reaction zones in this read. References remain in the Level key.';return;}
 const height=Math.max(340,zones.length*100+110),svg=svgNode('svg',{viewBox:`0 0 660 ${height}`,role:'group','aria-label':instrument+' conditional plan. Nearby structural levels form decision zones.'});
 const y=id=>65+zones.findIndex(z=>z.members.some(l=>l.id===id))*100;
 const defs=svgNode('defs');
 for(const [id,color]of [['up','#36ffb1'],['down','#ff4f85'],['neutral','#ffe85c']]){const m=svgNode('marker',{id:'arrow-'+id,viewBox:'0 0 12 12',refX:10,refY:6,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});m.append(svgNode('path',{d:'M 1 1 L 11 6 L 1 11 Z',fill:color}));defs.append(m);}
 svg.append(defs);
 for(const [i,z]of zones.entries()){
  const l=z.members[0],label=z.low===z.high?priceText(z.high):priceText(z.low)+'–'+priceText(z.high);
  const color=levelColors[l.kind]||levelColors.other,py=y(l.id),d=levelDetails(l,analysis),g=svgNode('g',{role:'button',tabindex:0,'aria-label':`L${i+1} ${priceText(l.price)} ${d.name}; show identity and evidence`});
  g.append(svgNode('rect',{x:12,y:py-22,width:636,height:44,rx:5,fill:'transparent'}));
  g.append(svgNode('line',{x1:208,x2:630,y1:py,y2:py,stroke:color,'stroke-width':2,opacity:.85}));
  g.append(svgNode('rect',{x:14,y:py-22,width:186,height:44,rx:6,fill:'#07344e',stroke:color}));
  const key=svgNode('text',{x:24,y:py+5,class:'level-key-code'});key.textContent='L'+(i+1);
  key.textContent='Z'+(i+1);
  const price=svgNode('text',{x:49,y:py+5,class:'level-price',style:z.low!==z.high?'font-size:12px':''});price.textContent=label;
  g.setAttribute('aria-label','Decision zone '+label+' '+instrument+'; show source evidence');
  const title=svgNode('title');title.textContent=d.name+' — '+d.description;g.append(key,price,title);
  g.addEventListener('click',()=>onSelect(l));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(l);}});svg.append(g);
 }
 for(const s of analysis.scenarios){
  if(s.status!=='conditional'||!pathDirectionValid(s,levels)||!setupRoom(s,levels).eligible||y(s.triggerId)===y(s.targetId))continue;
  const lane=s.direction==='up'?245:s.direction==='down'?405:555,start=y(s.triggerId),end=s.targetId?y(s.targetId):start+(s.direction==='up'?-42:42),color=s.direction==='up'?'#36ffb1':s.direction==='down'?'#ff4f85':'#ffe85c';
  const g=svgNode('g',{role:'button',tabindex:0,'aria-label':directionTitle(s.direction)+' conditional path: '+s.condition});
  const path=`M ${lane} ${start} L ${lane+28} ${start+(end-start)*.28} L ${lane+28} ${end}`;
  g.append(svgNode('path',{d:path,fill:'none',stroke:'transparent','stroke-width':26}));
  g.append(svgNode('path',{d:path,fill:'none',stroke:color,'stroke-width':4,'stroke-dasharray':'9 5','marker-end':'url(#arrow-'+s.direction+')',...(s.direction==='neutral'?{'marker-start':'url(#arrow-neutral)'}:{})}));
  const title=svgNode('title');title.textContent=s.condition+' '+(s.rationale||'');g.append(title);
  g.addEventListener('click',()=>onScenario(s));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onScenario(s);}});svg.append(g);
 }
 for(const [x,text,color]of [[200,'↑ Upside','#36ffb1'],[370,'↓ Downside','#ff4f85'],[525,'↔ Neutral','#ffe85c']]){const label=svgNode('text',{x,y:height-30,style:'fill:'+color});label.textContent=text;svg.append(label);}
 host.append(svg);
}

export function sourceLink(url,label='Open source platform ↗'){
 try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;const a=node('a',label);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}
}
