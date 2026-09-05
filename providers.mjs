export function createProviderChecks({ env = process.env, request = fetch } = {}) {
  const pending = new Map();
  const recent = new Map();
  return async function check(provider, date) {
    if (!['quantdata', 'optionsdepth'].includes(provider)) throw new Error('Unknown provider');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Choose a valid session date');
    const secret = env[provider === 'quantdata' ? 'QUANT_DATA_API_KEY' : 'OPTIONSDEPTH_API_KEY'];
    if (!secret) return { ok: false, message: 'API key is not configured in Fly.io.' };
    const id = `${provider}:${date}`;
    if (recent.has(id) && Date.now() - recent.get(id).time < 60000) return { ...recent.get(id).result, cached: true };
    if (pending.has(provider)) return { ok: false, message: 'A check is already running. Please wait.' };
    pending.set(provider, true);
    let result;
    try {
      const url = provider === 'quantdata'
        ? 'https://api.quantdata.us/v1/options/tool/net-drift'
        : `https://api.optionsdepth.com/options-depth-api/v1/intraday-timeslots/?key=${encodeURIComponent(secret)}&date=${date}`;
      const options = { signal: AbortSignal.timeout(20000), redirect: 'error' };
      if (provider === 'quantdata') Object.assign(options, {
        method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionDate: date, aggregationPeriod: '1m', filter: { ticker: 'SPX' } })
      });
      const response = await request(url, options);
      if (!response.ok) {
        result = { ok: false, status: response.status, message: [401,403].includes(response.status) ? 'Provider rejected access. Check your key and subscription.' : response.status === 429 ? 'Provider rate limit reached. No automatic retry was made.' : 'Provider could not complete the request. No automatic retry was made.' };
      } else {
        const data = await response.json();
        if (provider === 'quantdata') {
          if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new Error('Unexpected response');
          const rows = Object.entries(data.data).map(([timestamp, row]) => ({ timestamp: Number(timestamp), call: row?.netCallPremium, put: row?.netPutPremium, price: row?.stockPrice })).sort((a,b)=>a.timestamp-b.timestamp);
          if (rows.some(r=>!Number.isFinite(r.timestamp)||!Number.isFinite(r.call)||!Number.isFinite(r.put))) throw new Error('Unexpected response');
          const last = rows.at(-1);
          result = { ok: true, provider: 'Quant Data', sessionDate: date, ticker: 'SPX', scope: 'All expirations; 1-minute buckets', count: rows.length, latestTimestamp: last ? new Date(last.timestamp).toISOString() : null, latestPrice: Number.isFinite(last?.price) ? last.price : null, callPremium: rows.reduce((s,r)=>s+r.call,0), putPremium: rows.reduce((s,r)=>s+r.put,0), message: rows.length ? 'Net Drift received. Totals are rebuilt from buckets, not added to a previous check. Compare with the same date and all-expiration filters on your platform.' : 'Request succeeded but returned no data for this date.' };
        } else {
          if (!Array.isArray(data) || data.some(x=>typeof x !== 'string')) throw new Error('Unexpected response');
          result = { ok: true, provider: 'OptionsDepth', sessionDate: date, count: data.length, message: data.length ? 'Timestamp list received. This confirms the timestamp endpoint responds; it does not yet verify paid exposure access or fresh market data.' : 'Request succeeded but returned no timestamps for this date.' };
        }
      }
    } catch {
      result = { ok: false, message: 'Connection timed out or returned an unexpected response. No automatic retry was made.' };
    } finally { pending.delete(provider); }
    result.checkedAt = new Date().toISOString();
    recent.set(id, { time: Date.now(), result });
    if (recent.size > 100) recent.delete(recent.keys().next().value);
    return result;
  };
}
