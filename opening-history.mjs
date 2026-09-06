import {readFile,writeFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectStraddle} from './straddle-provider.mjs';
import {priorSessions} from './public/straddle.mjs';
import {cashSession} from './public/session.mjs';
// Market observations only. The browser also retains returned records so a
// stopped/replaced Fly machine does not discard the user's completed comparison.
export function createOpeningHistory({env=process.env,request=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),file=join(tmpdir(),'greeksdesk-opening-v1.json')}={}){
 let busy=false,lastCall=0;const records=new Map();
 const refresh=()=>readFile(file,'utf8').then(text=>{for(const r of JSON.parse(text))if(r?.version===1&&r.ready&&r.kind==='opening')records.set(r.sessionDate,r);}).catch(()=>{});
 let saving=Promise.resolve();
 const selected=date=>priorSessions(date).flatMap(d=>records.has(d)?[records.get(d)]:[]);
 function save(){saving=saving.catch(()=>{}).then(async()=>{const rows=[...records.values()].sort((a,b)=>b.sessionDate.localeCompare(a.sessionDate)).slice(0,160);await writeFile(file+'.next',JSON.stringify(rows));await rename(file+'.next',file);});return saving;}
 return {
  async records(date){await refresh();return selected(date);},
  async remember(opening){await refresh();if(opening?.ready&&opening.kind==='opening'&&opening.expirationDate===opening.sessionDate&&Number.isFinite(opening.ratio)){records.set(opening.sessionDate,opening);try{await save();}catch{/* In-memory cache still works. */}}},
  async batch(date,offset=0){
   if(!cashSession(date)||!Number.isInteger(offset)||offset<0||offset>=60)throw Error('Invalid history window');
   await refresh();if(!env.QUANT_DATA_API_KEY)return {ok:false,message:'Quant Data key is not configured.'};
   if(busy)return {ok:false,message:'An opening comparison is already loading. Try again when it completes.'};
   busy=true;let rateLimited=false,calls=0;const failures=[];
   try{
    const post=async(path,body,normalize)=>{
     if(rateLimited)return {available:false,message:'Provider rate limit reached. No retry made.'};
     // The straddle collector parallelizes inputs; reserve each request slot
     // before waiting so the shared account is not hit with a burst.
     const slot=Math.max(Date.now(),lastCall+650);lastCall=slot;await delay(Math.max(0,slot-Date.now()));calls++;
     if(rateLimited)return {available:false,message:'Provider rate limit reached. No retry made.'};
     try{const r=await request('https://api.quantdata.us'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.QUANT_DATA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.status===429){rateLimited=true;return {available:false,message:'Quant Data rate limit reached. Loading stopped.'};}
      if(!r.ok)return {available:false,message:'Provider returned HTTP '+r.status};
      return {available:true,...normalize(await r.json())};
     }catch{return {available:false,message:'History response unavailable; no automatic retry made.'};}
    };
    const dates=priorSessions(date).slice(offset,offset+3);
    for(const d of dates){
     if(records.has(d))continue;
     const source=await collectStraddle(d,post,new Date().toISOString(),{openingOnly:true}),r=source.data.opening;
     if(r?.ready&&Number.isFinite(r.ratio))records.set(d,r);else failures.push({date:d,message:r?.message||source.data.message});
     if(rateLimited)break;
    }
    try{await save();}catch{}
    return {ok:!rateLimited,records:selected(date),nextOffset:offset+dates.length,complete:offset+dates.length>=60,requestCount:calls,failures,...(rateLimited?{message:'Quant Data rate limit reached. Loading stopped; saved observations are retained.'}:{})};
   }finally{busy=false;}
  }
 };
}
