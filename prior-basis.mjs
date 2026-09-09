import {cashBasisReference} from './basis.mjs';
import {cashSession,esSessionDate,nyTime} from './public/session.mjs';
export function previousCashSession(date){
 for(let i=1;i<=10;i++){const day=new Date(Date.parse(date+'T12:00:00Z')-i*86400000).toISOString().slice(0,10);if(cashSession(day))return day;}
 return null;
}
// Only a matched close from the same unadjusted contract can become a dated overlay.
export function createPriorCashBasis({readES,readSPX,now=Date.now}){
 const cache=new Map(),pending=new Map();
 return async(es,date)=>{
  const clock=nyTime(now()),hours=cashSession(date);
  if(!es?.ok||es.ticker!=='ES'||!/^ES[HMUZ]\d{1,2}$/.test(es.contract)||date!==esSessionDate(now())||(clock.date===date&&hours&&clock.seconds>=hours.open))return null;
  const prior=previousCashSession(date);if(!prior)return null;
  const key=es.contract+'|'+date,old=cache.get(key);if(old&&now()-old.at<(old.value?86400000:60000))return old.value;
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{let value=null;try{
   const [past,spx]=await Promise.all([readES(prior,es.contract),readSPX(prior)]);
   if(past?.contract===es.contract&&spx?.ok){const r=cashBasisReference(past,spx,prior),close=cashSession(prior).close;
    if(r&&[r.esTime,r.spxTime].every(t=>{const p=nyTime(t);return p?.date===prior&&p.seconds>=close-300&&p.seconds<=close;}))value={...r,comparisonSessionDate:date,method:'prior_cash_close',usage:'Approximate premarket SPX-to-ES coordinates using the prior matched cash close. Not a live basis or independent trade confirmation.'};
   }
  }catch{/* Missing reference must not remove the current ES price. */}
  cache.set(key,{at:now(),value});if(cache.size>8)cache.delete(cache.keys().next().value);return value;})();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 };
}
