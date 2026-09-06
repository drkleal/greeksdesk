import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisHTTPFailure} from '../analysis-http.mjs';
test('quota failures name the actual cause without exposing upstream account information',()=>{
 for(const code of ['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded','insufficient_quota']){const r=analysisHTTPFailure(429,{error:{code,message:'private account sk-secret'}});assert.equal(r.code,'analysis_quota');assert.equal(r.providerCode,code);assert.ok(!JSON.stringify(r).includes('sk-secret'));}
});
test('transient rate limits retain wait instructions and oversized requests are distinguished',()=>{
 const r=analysisHTTPFailure(429,{error:{code:'rate_limit_exceeded'}},'12');assert.equal(r.code,'analysis_rate_limit');assert.equal(r.retryAfterSeconds,12);
 const large=analysisHTTPFailure(429,{error:{message:'Limit: 30000, Requested: 90000. Private org 123'}});assert.equal(large.code,'analysis_request_limit');assert.ok(!large.message.includes('123'));
 assert.equal(analysisHTTPFailure(401).code,'analysis_http');
});
