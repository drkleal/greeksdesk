"""Bounded market-data read. No brokerage or order API is used."""
import json
import logging
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from es_profile import read_profile

NY = ZoneInfo('America/New_York')
UTC = timezone.utc
DATASET = 'GLBX.MDP3'


def stamp(value):
    return value.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_time(value):
    return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(UTC)


def bar(record, seconds=60):
    prices = [int(getattr(record, k)) / 1e9 for k in ('open', 'high', 'low', 'close')]
    if not all(math.isfinite(p) and 0 < p < 1e6 for p in prices):
        raise ValueError('Invalid ES prices')
    start = datetime.fromtimestamp(record.ts_event / 1e9, UTC)
    return dict(zip(('open', 'high', 'low', 'close'), prices), timestamp=stamp(start),
                end=stamp(start + timedelta(seconds=seconds)), volume=int(record.volume),
                instrumentId=int(record.instrument_id))


def market_window(now):
    local = now.astimezone(NY)
    day, hour = local.weekday(), local.hour
    return day != 5 and not (day == 4 and hour >= 17) and not (day == 6 and hour < 18) and hour != 17


def safe_error(exc):
    # Never relay SDK exception text: authentication errors can contain key material.
    detail = (getattr(exc, 'json_body', None) or {}).get('detail', {})
    if isinstance(detail, dict) and detail.get('case') == 'dataset_unavailable_range':
        boundary = re.search(r'end time before (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)', str(detail.get('message', '')))
        permitted = ' before ' + boundary.group(1) if boundary else ' within an earlier historical window'
        return 'Databento access permits data' + permitted + '. This request extends beyond that availability window. Check this API key\u2019s CME subscription and licensing access; current ES prices have not been verified.'
    if 'licens' in str(exc).lower() or 'entitle' in str(exc).lower():
        return 'Databento live-data licensing or entitlement was rejected. Check the CME GLBX.MDP3 live license in the Databento portal; a configured key does not establish live access.'
    code = getattr(exc, 'http_status', None) or getattr(exc, 'status', None) or getattr(exc, 'status_code', None)
    if code in (401, 403):
        return 'Databento denied this market-data request. Check the key and CME data entitlement.'
    if code == 402:
        return 'Databento reported a market-data billing restriction.'
    return 'Databento could not supply this ES request. No automatic retry was made.'


def resolve_contract(client, symbol, date):
    if symbol != 'ES.v.0':
        return symbol
    # Databento allows continuous -> instrument_id -> raw_symbol, not a direct
    # continuous -> raw_symbol conversion. Keep both mappings date-specific.
    params = dict(dataset=DATASET, start_date=date, end_date=date + timedelta(days=1))
    resolved = client.symbology.resolve(symbols=[symbol], stype_in='continuous',
                                      stype_out='instrument_id', **params)
    ids = {str(row['s']) for row in resolved.get('result', {}).get(symbol, [])}
    if len(ids) != 1 or not next(iter(ids)).isdigit():
        raise ValueError('No unique ES instrument')
    instrument = ids.pop()
    named = client.symbology.resolve(symbols=[instrument], stype_in='instrument_id',
                                   stype_out='raw_symbol', **params)
    names = {row['s'] for row in named.get('result', {}).get(instrument, [])}
    if len(names) != 1:
        raise ValueError('No unique ES contract')
    contract = names.pop()
    if not re.fullmatch(r'ES[HMUZ][0-9]{1,2}', contract):
        raise ValueError('Unexpected ES mapping')
    return contract


def read_prior_context(client, db, contract, session_start, available, spent=0):
    """Same-contract hourly evidence strictly before the selected session."""
    requested_start = session_start - timedelta(days=10)
    context = dict(available=False, contract=contract, dataset=DATASET, schema='ohlcv-1h',
                   requestedFrom=stamp(requested_start), requestedThrough=stamp(session_start),
                   bars=[], estimatedCostUSD=0)
    try:
        schema_range = available.get('schema', {}).get('ohlcv-1h', available)
        end = min(session_start.astimezone(UTC), parse_time(schema_range['end']))
        end = end.replace(minute=0, second=0, microsecond=0)
        if end <= requested_start:
            context['message'] = 'Earlier ES hourly history is not available for this window.'
            return context
        params = dict(dataset=DATASET, symbols=[contract], stype_in='raw_symbol',
                      schema='ohlcv-1h', start=requested_start, end=end, limit=256)
        cost = client.metadata.get_cost(**params)
        if not math.isfinite(cost) or cost < 0 or spent + cost > 0.05:
            context['message'] = 'Earlier ES history skipped: combined estimated history cost exceeds $0.05.'
            return context
        rows = [bar(record, 3600) for record in client.timeseries.get_range(**params)
                if isinstance(record, db.OHLCVMsg)]
        if len(rows) >= 256:
            raise ValueError('Prior history reached the row limit')
        context.update(available=bool(rows), bars=rows, through=stamp(end), estimatedCostUSD=cost)
        if not rows:
            context['message'] = 'No earlier trades returned for this exact ES contract.'
    except Exception as exc:
        context['message'] = safe_error(exc)
    return context


def read(request):
    import databento as db
    date = datetime.strptime(request['date'], '%Y-%m-%d').date()
    symbol = request.get('symbol', 'ES.v.0')
    if not re.fullmatch(r'ES(?:\.v\.0|[HMUZ][0-9]{1,2})', symbol):
        raise ValueError('Unsupported contract')
    now = datetime.now(UTC)
    start = datetime.combine(date - timedelta(days=1), datetime.min.time(), NY) + timedelta(hours=18)
    end = datetime.combine(date, datetime.min.time(), NY) + timedelta(hours=17)
    if start >= now:
        return {'ok': False, 'message': 'The selected ES session has not begun.'}
    historical = db.Historical()
    raw_symbol = resolve_contract(historical, symbol, date)
    if not re.fullmatch(r'ES[HMUZ][0-9]{1,2}', raw_symbol):
        raise ValueError('Unexpected ES mapping')

    result = {'ok': True, 'contract': raw_symbol, 'requestedSymbol': symbol,
              'dataset': DATASET, 'sessionDate': str(date), 'checkedAt': stamp(now),
              'bars': [], 'quote': None, 'messages': []}
    available = None
    try:
        available = historical.metadata.get_dataset_range(dataset=DATASET)
        schema_range = available.get('schema', {}).get('ohlcv-1m', available)
        available_end = parse_time(schema_range['end'])
        requested_end = min(end.astimezone(UTC), now, available_end)
        requested_end = requested_end.replace(second=0, microsecond=0)
        if requested_end > start:
            params = dict(dataset=DATASET, symbols=[raw_symbol], stype_in='raw_symbol',
                          schema='ohlcv-1m', start=start, end=requested_end, limit=1500)
            cost = historical.metadata.get_cost(**params)
            if not math.isfinite(cost) or cost < 0 or cost > 0.05:
                result['messages'].append('Historical ES sample skipped: estimated cost exceeded $0.05 per update.')
            else:
                result['estimatedHistoryCostUSD'] = cost
                data = historical.timeseries.get_range(**params)
                result['bars'] = [bar(record) for record in data if isinstance(record, db.OHLCVMsg)]
                result['historyThrough'] = stamp(requested_end)
        else:
            result['messages'].append('Historical ES bars for this session are not available yet.')
    except Exception as exc:
        result['messages'].append(safe_error(exc))

    if request.get('cached_context_contract') == raw_symbol:
        result['contextReused'] = True
    elif available:
        result['priorContext'] = read_prior_context(historical, db, raw_symbol, start, available,
                                                  result.get('estimatedHistoryCostUSD', 0))
    else:
        result['priorContext'] = {'available': False, 'message': 'Earlier ES history availability could not be checked.'}

    if request.get('cached_profile_contract') == raw_symbol:
        result['profileReused'] = True
    elif available and request.get('cash_close'):
        spent = result.get('estimatedHistoryCostUSD', 0) + result.get('priorContext', {}).get('estimatedCostUSD', 0)
        result['volumeProfile'] = read_profile(historical, raw_symbol, start, end, available, parse_time(request['cash_close']), spent)

    # Live capture is short-lived and invoked only by an explicit update cycle.
    # It replays one minute, then accepts a fresh completed one-second trade bar.
    if start <= now < end and market_window(now):
        live = db.Live(reconnect_policy='none')
        received = []
        def receive(record):
            if isinstance(record, db.OHLCVMsg):
                row = bar(record, 1)
                received.append(row)
                if (datetime.now(UTC) - parse_time(row['end'])).total_seconds() < 5:
                    live.stop()
        try:
            live.subscribe(dataset=DATASET, schema='ohlcv-1s', symbols=[raw_symbol],
                           stype_in='raw_symbol', start=now - timedelta(seconds=60))
            live.add_callback(receive)
            live.start()
            try:
                live.block_for_close(timeout=12)
            except TimeoutError:
                live.stop()
            if received:
                row = max(received, key=lambda r: r['end'])
                result['quote'] = dict(price=row['close'], timestamp=row['end'],
                                      intervalStart=row['timestamp'], instrumentId=row['instrumentId'],
                                      kind='Completed 1-second trade bar')
            else:
                result['messages'].append('No fresh ES trade bar was received from the live connection.')
        except Exception as exc:
            result['messages'].append(safe_error(exc))
        finally:
            try:
                live.terminate()
            except Exception:
                pass
    if not result['bars'] and not result['quote']:
        return {'ok': False, 'message': ' '.join(result['messages']) or 'No ES data returned for this session.'}
    return result


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    try:
        output = read(json.loads(sys.stdin.read(2000)))
    except Exception as error:
        output = {'ok': False, 'message': safe_error(error)}
    print(json.dumps(output, allow_nan=False, separators=(',', ':')), flush=True)
