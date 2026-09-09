import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {validatePacket,validateAnalysis} from './analysis.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createAnalysisRecovery({secret,now=Date.now}){
 const sign=value=>createHmac('sha256',secret).update('GreeksDesk analysis recovery v1\n'+JSON.stringify(value)).digest('hex');
 function issue({packet,analysis,checkedAt,model,usage}){
  if(!secret)return null;
  const payload={version:1,packetHash:digest(packet),analysis,checkedAt,model,usage,expiresAt:now()+72*3600000};
  return {...payload,signature:sign(payload)};
 }
 function recover(input){
  try{
   const r=input?.recovery;
   if(!secret||r?.version!==1||!Number.isFinite(r.expiresAt)||r.expiresAt<now()||typeof r.signature!=='string'||! /^[a-f0-9]{64}$/.test(r.signature))throw Error();
   const payload={version:r.version,packetHash:r.packetHash,analysis:r.analysis,checkedAt:r.checkedAt,model:r.model,usage:r.usage,expiresAt:r.expiresAt};
   if(!timingSafeEqual(Buffer.from(r.signature,'hex'),Buffer.from(sign(payload),'hex')))throw Error();
   const packet=validatePacket(input.packet);
   if(digest(packet)!==r.packetHash)throw Error();
   let analysis;
   try{analysis=validateAnalysis(structuredClone(r.analysis),packet);}catch{return {ok:false,code:'recovery_validation',message:'This saved response still fails the evidence checks. It remains saved; no new AI request or charge was made.'};}
   return {ok:true,analysis,checkedAt:r.checkedAt,model:r.model,usage:r.usage,recoveredAt:new Date(now()).toISOString(),recovered:true,message:'Saved response rechecked without a new AI request. Its original chart and market-data times are unchanged.'};
  }catch{return {ok:false,code:'recovery_invalid',message:'This saved response is expired or does not match its original inputs. No AI request or charge was made.'};}
 }
 return {issue,recover};
}
