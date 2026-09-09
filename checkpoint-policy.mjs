// Run only after every level's price, source, panel and identity checks pass.
// A reference is not promoted to structure to make a generated route pass.
export function separateReferenceCheckpoints(analysis) {
 const references=(analysis.checkpoints||[]).filter(l=>l.role!=='structure'||!['structure','provider'].includes(l.identity?.category));
 if(!references.length)return;
 analysis.referenceCheckpoints=references;
 analysis.checkpoints=analysis.checkpoints.filter(l=>!references.includes(l));
 const withheld=[];
 for(const scenario of analysis.scenarios){
  if(scenario.status!=='conditional')continue;
  const text=[scenario.condition,scenario.confirmation,scenario.invalidation,scenario.rationale,...Object.values(scenario.continuation||{})].join(' ');
  const numbers=[...text.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map(m=>Number(m[0].replaceAll(',','')));
  const endpoints=[scenario.triggerId,scenario.targetId,scenario.continuation?.targetId].filter(Boolean).map(id=>analysis.levels.find(l=>l.id===id)?.price).filter(Number.isFinite);
  const affected=references.filter(l=>text.includes(l.id)||numbers.includes(l.price)||(endpoints.length>1&&l.price>=Math.min(...endpoints)&&l.price<=Math.max(...endpoints)));
  if(!affected.length)continue;
  const prices=affected.map(l=>String(l.price)).join(', ');
  Object.assign(scenario,{status:'insufficient',triggerId:null,targetId:null,
   condition:'This path was withheld because '+prices+' was supplied as a reference, without established price structure.',
   confirmation:'An observed reversal or repeated price response is needed before this reference can serve as a route checkpoint.',
   invalidation:'No trading path is established from this rejected checkpoint.',
   rationale:'The other source observations remain available. The reference has not been promoted to support or resistance.',
   continuation:{targetId:null,condition:'No continuation is established.',confirmation:'First establish the missing price structure.',invalidation:'The initial path is withheld.',rationale:'A farther objective cannot rely on the rejected checkpoint.'}});
  withheld.push(scenario.direction);
 }
 analysis.reviewStatus='limited';
 analysis.headline='Evidence reviewed · reference checkpoints need price confirmation';
 analysis.summary='The supported levels, chart findings and source observations are available below. '+(withheld.length?'The '+withheld.join(' and ')+' trading paths were withheld because they relied on a reference without established price response. ':'Unconfirmed reference checkpoints were separated from the structural paths. ')+ 'The references remain available for inspection; they are not confirmed support or resistance.';
 analysis.gaps.unshift('Checkpoint review: '+references.map(l=>l.price+' ('+l.identity.name+')').join('; ')+'. Reference only; not established price structure.'+(withheld.length?' Withheld paths: '+withheld.join(', ')+'.':''));
}
