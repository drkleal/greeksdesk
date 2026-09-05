export const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const svgNode=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;};
export function renderMap(host,analysis,instrument,onSelect){
 host.replaceChildren();host.classList.remove('empty');
 const levels=[...analysis.levels].sort((a,b)=>b.price-a.price);
 if(!levels.length){host.classList.add('empty');host.textContent='The evidence does not establish reliable price levels yet. Read the missing evidence below.';return;}
 const svg=svgNode('svg',{viewBox:'0 0 850 430',role:'img','aria-label':instrument+' conditional scenario map. Click a level for source evidence.'});
 const min=Math.min(...levels.map(l=>l.price)),max=Math.max(...levels.map(l=>l.price)),span=Math.max(10,max-min),y=p=>55+(max+span*.08-p)/(span*1.16)*315;
 const colors={support:'#22efb6',resistance:'#ff5788',gamma:'#c699ff',reference:'#25d9ff',other:'#ffdc68'};
 const defs=svgNode('defs');for(const [id,color]of [['up','#22efb6'],['down','#ff5788'],['neutral','#ffdc68']]){const m=svgNode('marker',{id:'arrow-'+id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto'});m.append(svgNode('path',{d:'M 1 1 L 9 5 L 1 9',fill:'none',stroke:color,'stroke-width':1.5}));defs.append(m);}svg.append(defs);
 for(const [index,l]of levels.entries()){
  const color=colors[l.kind]||colors.other,g=svgNode('g',{role:'button',tabindex:0,'aria-label':l.label+' '+l.price+'; show evidence'});
  g.append(svgNode('rect',{x:12,y:y(l.price)-16,width:826,height:32,fill:'transparent'}));g.append(svgNode('line',{x1:22,x2:820,y1:y(l.price),y2:y(l.price),stroke:color,'stroke-width':2,opacity:.7}));
  const label=svgNode('text',{x:28,y:y(l.price)-7});label.textContent=(index+1)+'. '+l.label;const price=svgNode('text',{x:815,y:y(l.price)-7,'text-anchor':'end'});price.textContent=l.price.toLocaleString(undefined,{maximumFractionDigits:2});g.append(label,price);g.addEventListener('click',()=>onSelect(l));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(l);}});svg.append(g);
 }
 for(const s of analysis.scenarios){const from=levels.find(l=>l.id===s.triggerId),to=levels.find(l=>l.id===s.targetId);if(!from||s.status==='insufficient')continue;const x=s.direction==='up'?450:s.direction==='down'?590:690,start=y(from.price),end=to?y(to.price):Math.max(25,Math.min(375,start+(s.direction==='up'?-38:s.direction==='down'?38:0)));svg.append(svgNode('path',{d:`M ${x} ${start} L ${x+35} ${(start+end)/2} L ${x+65} ${end}`,fill:'none',stroke:s.direction==='up'?'#22efb6':s.direction==='down'?'#ff5788':'#ffdc68','stroke-width':3,'stroke-dasharray':'6 4','marker-end':'url(#arrow-'+s.direction+')'}));if(!to){const note=svgNode('text',{x:x+70,y:end+4});note.textContent='if confirmed';svg.append(note);}}
 const footer=svgNode('text',{x:24,y:408});footer.textContent='Conditional paths · '+instrument+' price coordinates · not a time axis';svg.append(footer);host.append(svg);
}
export function sourceLink(url,label='Open original chart ↗'){
 try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;const a=node('a',label);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}
}
