export function normalizeGamma(data,date,selection){
 if(!Array.isArray(data))throw Error('Unexpected response');
 const normalized=data.map(r=>{
  const field=typeof r?.sim_datetime==='string'?'sim_datetime':'effectiveDatetime',time=r?.[field];
  if(!Number.isFinite(r?.price)||!Number.isFinite(r?.value)||typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time)||!Number.isFinite(Date.parse(time)))throw Error('Unexpected response');
  return {price:r.price,value:r.value,effectiveDatetime:time,timestampField:field};
 });
 const eligible=normalized.filter(r=>r.effectiveDatetime.startsWith(date+'T')&&r.effectiveDatetime<=selection.slot&&r.price>=selection.min&&r.price<=selection.max);
 const actualSlot=eligible.map(r=>r.effectiveDatetime).sort().at(-1)||null;
 const rows=eligible.filter(r=>r.effectiveDatetime===actualSlot).sort((a,b)=>a.price-b.price);
 if(new Set(rows.map(r=>r.price)).size!==rows.length)throw Error('Ambiguous duplicate price rows');
 return {rows,actualSlot,receivedCount:data.length};
}
export function createProviderChecks({ env = process.env, request = fetch } = {}) {
  const pending = new Map();
  const recent = new Map();
  return async function check(provider, date, selection = {}) {
    if (!['quantdata', 'optionsdepth', 'optionsdepth-gamma'].includes(provider)) throw new Error('Unknown provider');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Choose a valid session date');
    const secret = env[provider === 'quantdata' ? 'QUANT_DATA_API_KEY' : 'OPTIONSDEPTH_API_KEY'];
    if (!secret) return { ok: false, message: 'API key is not configured in Fly.io.' };
    const exposure = provider === 'optionsdepth-gamma';
    if (exposure && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(selection.slot || '') || !selection.slot.startsWith(date+'T') || !Number.isFinite(Date.parse(selection.slot)) || !Number.isFinite(selection.min) || !Number.isFinite(selection.max) || selection.min <= 0 || selection.max <= selection.min || selection.max-selection.min > 300)) throw new Error('Invalid exposure selection');
    const id = `${provider}:${date}:${exposure ? JSON.stringify(selection) : ''}`;
    if (recent.has(id) && Date.now() - recent.get(id).time < (exposure ? 600000 : 60000)) return { ...recent.get(id).result, cached: true };
    if (pending.has(provider)) return { ok: false, message: 'A check is already running. Please wait.' };
    pending.set(provider, true);
    let result;
    let stage = 'request';
    try {
      let url = provider === 'quantdata'
        ? 'https://api.quantdata.us/v1/options/tool/net-drift'
        : `https://api.optionsdepth.com/options-depth-api/v1/intraday-timeslots/?key=${encodeURIComponent(secret)}&model=intraday&date=${date}`;
      if(exposure) url = 'https://api.optionsdepth.com/options-depth-api/v1/heatmap/?' + new URLSearchParams({key:secret,model:'intraday',date,ticker:'SPX',type:'gamma',date_time:selection.slot.replace('T',' '),min_price:String(selection.min),max_price:String(selection.max),is_upcoming_day:'false'});
      const options = { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { Accept: 'application/json' } };
      if (provider === 'quantdata') Object.assign(options, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionDate: date, aggregationPeriod: '1m', filter: { ticker: 'SPX' } })
      });
      const response = await request(url, options);
      if (!response.ok) {
        const explanation = [401,403].includes(response.status) ? 'Access was rejected. Check the key and subscription.' : response.status === 429 ? 'Rate limit reached.' : [400,422].includes(response.status) ? 'The request parameters were rejected.' : response.status === 404 ? 'The requested endpoint or resource was not found.' : response.status >= 500 ? 'The provider or an intermediary returned a server error.' : 'The request was not completed.';
        result = { ok: false, status: response.status, message: `HTTP ${response.status}: ${explanation} No automatic retry was made.` };
      } else {
        stage = 'decode';
        const data = await response.json();
        stage = 'shape';
        if (provider === 'quantdata') {
          if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new Error('Unexpected response');
          const rows = Object.entries(data.data).map(([timestamp, row]) => ({ timestamp: Number(timestamp), call: row?.netCallPremium, put: row?.netPutPremium, price: row?.stockPrice })).sort((a,b)=>a.timestamp-b.timestamp);
          if (rows.some(r=>!Number.isFinite(r.timestamp)||!Number.isFinite(r.call)||!Number.isFinite(r.put))) throw new Error('Unexpected response');
          const last = rows.at(-1);
          result = { ok: true, provider: 'Quant Data', sessionDate: date, ticker: 'SPX', scope: 'All expirations; 1-minute buckets', count: rows.length, latestTimestamp: last ? new Date(last.timestamp).toISOString() : null, latestPrice: Number.isFinite(last?.price) ? last.price : null, priceObservations: rows.filter(r=>Number.isFinite(r.price)).map(r=>({timestamp:new Date(r.timestamp).toISOString(),price:r.price})), callPremium: rows.reduce((s,r)=>s+r.call,0), putPremium: rows.reduce((s,r)=>s+r.put,0), message: rows.length ? 'Net Drift received. Totals are rebuilt from buckets, not added to a previous check. Compare with the same date and all-expiration filters on your platform.' : 'Request succeeded but returned no data for this date.' };
        } else if(exposure) {
          const {rows,actualSlot,receivedCount}=normalizeGamma(data,date,selection);
          result={ok:true,provider:'OptionsDepth Gamma',ticker:'SPX',sessionDate:date,count:rows.length,rows,actualSlot,timeRole:'heatmap_coordinate',timezone:null,modelUpdatedAt:null,receivedCount,requestedSlot:selection.slot,range:[selection.min,selection.max],message:rows.length?'Gamma sample received. Selected heatmap time coordinate: '+actualSlot+' (latest returned coordinate at or before the requested slot). Other coordinates are excluded, not added together. This does not establish the model update time or timezone. Prices are SPX; unit scaling still requires comparison with the platform.':'Request succeeded but returned no matching Gamma rows. This request may still consume API units.'};
        } else {
          const slots = data?.timeslots;
          if (!Array.isArray(slots) || slots.some(x=>typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(x) || !Number.isFinite(Date.parse(x)))) throw new Error('Unexpected response');
          result = { ok: true, provider: 'OptionsDepth', sessionDate: date, count: slots.length, slots, message: slots.length ? 'Timestamp list received. Choose one below to check a Gamma sample. Timestamp timezone is as supplied by OptionsDepth.' : 'Request succeeded but returned no timestamps for this date.' };
        }
      }
    } catch (error) {
      const reason = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'Provider request timed out.' : stage === 'decode' ? 'Provider responded, but the response was not valid JSON.' : stage === 'shape' ? 'Provider responded, but the data format did not match the expected fields.' : 'Network connection to provider failed.';
      result = { ok: false, message: reason + ' No automatic retry was made.' };
    } finally { pending.delete(provider); }
    result.checkedAt = new Date().toISOString();
    recent.set(id, { time: Date.now(), result });
    if (recent.size > 100) recent.delete(recent.keys().next().value);
    return result;
  };
}
