import {S3Client,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {gzipSync,gunzipSync} from 'node:zlib';
import {validatePacket} from './analysis.mjs';
export const sessionLimit=52000000;
const defaultKey='greeksdesk/shared-session-v1.json.gz';
export function validateSharedSession(value){
 if(!value||value.version!==1)throw Error('Invalid shared session.');
 const packet=validatePacket({...value,sources:value.charts?.length?value.charts:[{id:'empty-session',title:'Empty session',sessionDate:value.date}]});
 if(!Array.isArray(value.charts)||value.charts.length>8||value.charts.some(c=>!c.image))throw Error('Invalid shared charts.');
 let read=null;
 if(value.read!=null){
  const r=value.read,a=r.result?.analysis;
  if(typeof r.id!=='string'||!Number.isFinite(Date.parse(r.id))||r.result?.ok!==true||!a||typeof a.headline!=='string'||typeof a.summary!=='string'||!['levels','scenarios','sources','gaps','changes'].every(k=>Array.isArray(a[k])))throw Error('Only a completed saved read can be shared.');
  const p=validatePacket({...r,sources:r.sources});
  read={id:r.id,date:p.date,instrument:p.instrument,basis:p.basis,sources:p.sources,result:r.result};
 }
 return {version:1,date:packet.date,instrument:packet.instrument,basis:packet.basis,charts:value.charts.length?packet.sources:[],read};
}
export function createSharedSession({env=process.env,client,objectKey=defaultKey,now=()=>new Date().toISOString()}={}){
 const key=objectKey;
 const configured=!!client||!!(env.BUCKET_NAME&&env.AWS_ENDPOINT_URL_S3&&env.AWS_ACCESS_KEY_ID&&env.AWS_SECRET_ACCESS_KEY);
 const s3=client||(configured?new S3Client({endpoint:env.AWS_ENDPOINT_URL_S3,region:env.AWS_REGION||'auto',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:env.AWS_ACCESS_KEY_ID,secretAccessKey:env.AWS_SECRET_ACCESS_KEY}}):null);
 if(s3?.middlewareStack)s3.middlewareStack.add(next=>async args=>{args.request.headers['x-tigris-consistent']='true';return next(args);},{step:'build',name:'consistentDeskState'});
 const send=command=>s3.send(command,{abortSignal:AbortSignal.timeout(25000)});
 async function load(){
  if(!configured)return {ok:false,code:'not_configured',message:'Shared saving is not configured. Your browser copy is unchanged.'};
  try{const r=await send(new GetObjectCommand({Bucket:env.BUCKET_NAME,Key:key}));
   const bytes=await r.Body.transformToByteArray();
   const envelope=JSON.parse(gunzipSync(bytes,{maxOutputLength:sessionLimit}).toString());
   return {ok:true,etag:r.ETag,savedAt:envelope.savedAt,state:validateSharedSession(envelope.state)};
  }catch(e){if(e.name==='NoSuchKey'||e.$metadata?.httpStatusCode===404)return {ok:true,etag:null,savedAt:null,state:null};throw e;}
 }
 async function save(input){
  if(!configured)return {ok:false,code:'not_configured',message:'Shared saving is not configured. Your browser copy is unchanged.'};
  if(input.etag!==null&&(typeof input.etag!=='string'||!/^"[a-zA-Z0-9-]{1,100}"$/.test(input.etag)))throw Error('Invalid shared revision.');
  const state=validateSharedSession(input.state),savedAt=now(),raw=JSON.stringify({savedAt,state});
  if(Buffer.byteLength(raw)>sessionLimit)throw Error('The shared session is too large. Download the result and use fewer charts.');
  try{const r=await send(new PutObjectCommand({Bucket:env.BUCKET_NAME,Key:key,Body:gzipSync(raw),ContentType:'application/json',ContentEncoding:'gzip',...(input.etag===null?{IfNoneMatch:'*'}:{IfMatch:input.etag})}));
   return {ok:true,etag:r.ETag,savedAt};
  }catch(e){if([409,412].includes(e.$metadata?.httpStatusCode))return {ok:false,code:'conflict',message:'Another browser saved a different session. Your local work is preserved. Open the shared session to compare before replacing it.'};throw e;}
 }
 return {configured,load,save};
}
