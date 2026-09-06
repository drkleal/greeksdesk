"""Session VWAP and volume-at-price from actual ES trade events."""
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
NY = ZoneInfo('America/New_York')
UTC = timezone.utc


def stamp(t):
    return t.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def summarize_trades(records, contract, start, through, cash_close, limit=1_000_000):
    day = start.astimezone(NY).date() + timedelta(days=1)
    local = datetime.combine(day, datetime.min.time(), NY)
    windows = {'Asia': (start, local + timedelta(hours=3)),
               'London': (local + timedelta(hours=3), local + timedelta(hours=9, minutes=30)),
               'Overnight': (start, local + timedelta(hours=9, minutes=30)),
               'RTH': (local + timedelta(hours=9, minutes=30), cash_close)}
    stats = {name: dict(volume=0, weighted=0, high=None, low=None, trades=0) for name in windows}
    ticks, ids, count, first, last = {}, set(), 0, None, None
    for r in records:
        if not hasattr(r, 'price') or not hasattr(r, 'size'):
            continue
        count += 1
        if count >= limit:
            return dict(available=False, message='Trade profile reached its record cap. Paste VP to supply the complete profile.')
        t = datetime.fromtimestamp(r.ts_event / 1e9, UTC)
        price, size = int(r.price), int(r.size)
        if not start <= t < through or price <= 0 or price >= 10**15 or price % 250_000_000 or size <= 0:
            raise ValueError('Invalid ES trade')
        ids.add(int(r.instrument_id))
        if len(ids) > 1:
            raise ValueError('Mixed ES contracts')
        first = t if first is None else min(first, t)
        last = t if last is None else max(last, t)
        ticks[price] = ticks.get(price, 0) + size
        for name, (lo, hi) in windows.items():
            if lo <= t < hi:
                s = stats[name]
                s['volume'] += size
                s['weighted'] += price * size
                s['high'] = price if s['high'] is None else max(price, s['high'])
                s['low'] = price if s['low'] is None else min(price, s['low'])
                s['trades'] += 1
    if not ticks:
        return dict(available=False, message='No trades returned in the selected profile window.')
    profiles = {}
    for name, s in stats.items():
        if not s['volume']:
            continue
        lo, hi = windows[name]
        profiles[name] = dict(high=s['high']/1e9, low=s['low']/1e9,
                              vwap=s['weighted']/s['volume']/1e9, volume=s['volume'], tradeCount=s['trades'],
                              **{'from': stamp(lo), 'through': stamp(min(through, hi))},
                              sessionComplete=through >= hi, vwapMethod='sum(trade price × contracts) / sum(contracts)')
    # One-point buckets; each marker uses a real tick, the busiest inside its bin.
    bins = {}
    for price, size in ticks.items():
        key = price // 1_000_000_000
        b = bins.setdefault(key, dict(volume=0, price=price, peak=0))
        b['volume'] += size
        if size > b['peak']:
            b['price'], b['peak'] = price, size
    lo, hi = min(bins), max(bins)
    if hi - lo > 1000:
        raise ValueError('Profile exceeds bounded price range')
    rows = [dict(lower=float(k), upper=k+.75, price=bins[k]['price']/1e9, volume=bins[k]['volume'])
            if k in bins else dict(lower=float(k), upper=k+.75, price=float(k), volume=0) for k in range(lo, hi+1)]
    peak = max(range(len(rows)), key=lambda i: rows[i]['volume'])
    nodes = [dict(kind='POC', price=rows[peak]['price'], volume=rows[peak]['volume'],
                  reason='Busiest one-point bucket; marker is its highest-volume traded tick.')]
    hvns = [i for i in range(1, len(rows)-1) if rows[i]['volume'] > max(rows[i-1]['volume'], rows[i+1]['volume'])]
    chosen = [peak]
    for i in sorted(hvns, key=lambda i: -rows[i]['volume']):
        if all(abs(i-j) >= 4 for j in chosen):
            chosen.append(i)
            nodes.append(dict(kind='HVN', price=rows[i]['price'], volume=rows[i]['volume'], reason='Local volume peak, separated by at least four points from other selected peaks.'))
            if len(chosen) == 4:
                break
    for left, right in zip(sorted(chosen), sorted(chosen)[1:]):
        candidates = range(left+1, right)
        if not candidates:
            continue
        i = min(candidates, key=lambda i: rows[i]['volume'])
        if rows[i]['volume'] < .5 * min(rows[left]['volume'], rows[right]['volume']):
            nodes.append(dict(kind='LVN', price=rows[i]['price'], volume=rows[i]['volume'], reason='Volume valley between selected peaks, below half the smaller peak’s volume.'))
    return dict(available=True, contract=contract, instrumentId=ids.pop(), dataset='GLBX.MDP3', schema='trades',
                **{'from': stamp(start), 'through': stamp(through)}, firstTrade=stamp(first), lastTrade=stamp(last),
                tradeCount=count, totalVolume=sum(ticks.values()), completeWindow=True,
                method='Actual trade volume in one-point ES buckets. POC is the busiest bucket; HVN/LVN are disclosed local-peak/valley heuristics, not trade signals.',
                rows=rows, nodes=nodes, sessionProfiles=profiles)


def read_profile(client, contract, start, end, available, cash_close, spent=0):
    try:
        schema_range = available.get('schema', {}).get('trades', available)
        available_end = datetime.fromisoformat(str(schema_range['end']).replace('Z', '+00:00')).astimezone(UTC)
        through = min(end.astimezone(UTC), datetime.now(UTC), available_end)
        if through <= start:
            return dict(available=False, message='Trade history for this session is not available yet.')
        params = dict(dataset='GLBX.MDP3', symbols=[contract], stype_in='raw_symbol', schema='trades', start=start, end=through, limit=1_000_000)
        cost = client.metadata.get_cost(**params)
        if not math.isfinite(cost) or cost < 0 or spent+cost > .05:
            return dict(available=False, message='Trade profile exceeds the combined $0.05 history cap. Paste VP for profile levels.', estimatedCostUSD=cost if math.isfinite(cost) else None)
        result = summarize_trades(client.timeseries.get_range(**params), contract, start, through, cash_close)
        result['estimatedCostUSD'] = cost
        return result
    except Exception:
        return dict(available=False, message='Trade profile was unavailable or failed its contract/time checks. No automatic retry made.')
