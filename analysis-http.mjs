// Return only known classifications, never a raw upstream message or account ID.
export function analysisHTTPFailure(status,body={},retryAfter=null){
 const code=body?.error?.code,type=body?.error?.type,suffix=' Previous plan retained; no automatic retry.';
 const limits={credit_balance_exhausted:'The analysis API has no prepaid credits remaining.',organization_spend_limit_exceeded:'The analysis API organization reached its spend limit.',project_spend_limit_exceeded:'The analysis API project reached its spend limit.',organization_usage_limit_exceeded:'The analysis API organization reached its assigned usage limit.',insufficient_quota:'The analysis API reports insufficient quota. Check its credit balance and usage limits.'};
 if(status===429&&(limits[code]||type==='insufficient_quota'))return {ok:false,code:'analysis_quota',providerCode:limits[code]?code:'insufficient_quota',message:(limits[code]||limits.insufficient_quota)+suffix};
 if(status===429){
  const delay=Number(retryAfter),message=String(body?.error?.message||''),limit=Number(message.match(/Limit:\s*(\d+)/i)?.[1]),requested=Number(message.match(/Requested:\s*(\d+)/i)?.[1]);
  const oversized=Number.isFinite(limit)&&Number.isFinite(requested)&&requested>limit;
  return {ok:false,code:oversized?'analysis_request_limit':'analysis_rate_limit',...(Number.isFinite(delay)&&delay>0&&delay<=86400?{retryAfterSeconds:Math.ceil(delay)}:{}),message:(oversized?'This single analysis request exceeds the provider’s token-rate allowance. The complete evidence packet needs a larger allowance or a compact representation.':'The analysis API rate limit was reached.'+(Number.isFinite(delay)&&delay>0?' Wait at least '+Math.ceil(delay)+' seconds before another read.':''))+suffix};
 }
 return {ok:false,code:'analysis_http',message:'Analysis service returned HTTP '+status+'.'+([401,403].includes(status)?' Check the app’s API access.':'')+suffix};
}
