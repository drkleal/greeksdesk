import {levelDetails,scenarioRoute,priceText} from './plan.mjs';
import {confluenceLabel,levelConfluence,conversionFor,compact} from './confluence.mjs';

// Roles and destinations come from the validated route, never from a bar's color.
export function levelBrief(read,level,{expirationDate=read.date}={}){
 const a=read.result.analysis,items=levelConfluence(read,level,{expirationDate}),label=confluenceLabel(items),identity=levelDetails(level,a);
 const routes=(a.scenarios||[]).map(s=>({s,route:scenarioRoute(s,a.levels,a.checkpoints)})).filter(x=>x.route.ready);
 const trigger=routes.find(x=>x.s.triggerId===level.id&&x.s.direction!=='neutral');
 const target=routes.find(x=>x.s.targetId===level.id&&x.s.direction!=='neutral');
 const outer=routes.find(x=>x.route.hasContinuation&&x.s.continuation.targetId===level.id);
 let role='Watch level',condition=level.watch;
 if(trigger){role=(trigger.s.direction==='up'?'↑ Upside trigger':'↓ Downside trigger')+' → '+priceText(trigger.route.first.to.price);condition=trigger.s.condition;}
 else if(target){role=(target.s.direction==='up'?'↑':'↓')+' First objective'+(target.route.hasContinuation?' · then '+priceText(target.route.stages.at(-1).to.price):'');condition=target.route.hasContinuation?target.s.continuation.condition:level.watch;}
 else if(outer){role=(outer.s.direction==='up'?'↑':'↓')+' Continuation objective';condition=outer.s.continuation.condition;}
 const observations=items.filter(i=>label.families.includes(i.family)&&i.effect==='supports'&&!i.coordinateOnly);
 const chosen=[];for(const f of label.families){const i=observations.find(i=>i.family===f);if(i)chosen.push(i.observation);}
 const context=items.filter(i=>i.coordinateOnly&&['qd-gamma-0dte','qd-delta','qd-vanna','qd-oi-strike'].includes(i.column.id)),anchor=conversionFor(read);
 const modelText=context.length?'Nearby SPX '+priceText(context[0].row.price)+' (≈ ES '+priceText(context[0].row.price+anchor.basis)+'): '+context.map(i=>({gamma:'GEX exp '+expirationDate,delta:'DEX',vanna:'Vanna',positioning:'OI'})[i.family]+' '+(i.row.net>0?'+':'')+compact(i.row.net)).join(' · ')+'. Model context.':'';
 return {name:identity.name,role,condition,confluence:label,observations:chosen,invalidation:level.invalidation,modelText};
}

export function wrapBrief(text,limit=88){
 const lines=[];let line='';for(const word of String(text||'').split(/\s+/)){if(line&&line.length+word.length+1>limit){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines;
}
