import unittest
from types import SimpleNamespace
from datetime import date, datetime, timezone
from databento_worker import bar, market_window, safe_error, resolve_contract, read_prior_context

class WorkerTests(unittest.TestCase):
    def test_price_scale_and_bar_time(self):
        record = SimpleNamespace(open=7715000000000, high=7716000000000, low=7714000000000,
            close=7715500000000, volume=4, instrument_id=12,
            ts_event=int(datetime(2026,9,4,19,59,tzinfo=timezone.utc).timestamp()*1e9))
        result=bar(record)
        self.assertEqual(result['close'],7715.5)
        self.assertEqual(result['end'],'2026-09-04T20:00:00.000Z')
    def test_weekend_and_maintenance_are_not_fresh_sessions(self):
        self.assertFalse(market_window(datetime(2026,9,6,12,tzinfo=timezone.utc)))
        self.assertTrue(market_window(datetime(2026,9,6,22,tzinfo=timezone.utc)))
        self.assertFalse(market_window(datetime(2026,9,4,22,tzinfo=timezone.utc)))
    def test_exception_text_is_not_forwarded(self):
        self.assertNotIn('private-key',safe_error(ValueError('private-key')))
    def test_continuous_contract_uses_supported_two_step_mapping(self):
        calls=[]
        def resolve(**args):
            calls.append(args)
            if args['stype_in']=='continuous' and args['stype_out']=='instrument_id':
                return {'result':{'ES.v.0':[{'d0':'2026-09-04','d1':'2026-09-05','s':'123'}]}}
            if args['stype_in']=='instrument_id' and args['stype_out']=='raw_symbol':
                self.assertEqual(args['symbols'],['123'])
                return {'result':{'123':[{'d0':'2026-09-04','d1':'2026-09-05','s':'ESU6'}]}}
            raise AssertionError('Unsupported Databento symbology conversion')
        client=SimpleNamespace(symbology=SimpleNamespace(resolve=resolve))
        self.assertEqual(resolve_contract(client,'ES.v.0',date(2026,9,4)),'ESU6')
        self.assertEqual(len(calls),2)
        self.assertTrue(all(c['start_date']==date(2026,9,4) and c['end_date']==date(2026,9,5) for c in calls))
    def test_ambiguous_contract_is_not_selected_arbitrarily(self):
        client=SimpleNamespace(symbology=SimpleNamespace(resolve=lambda **args:{'result':{'ES.v.0':[{'s':'123'},{'s':'456'}]}}))
        with self.assertRaises(ValueError): resolve_contract(client,'ES.v.0',date(2026,9,4))

    def prior_fixture(self, cost=0.001, count=1):
        calls=[]
        record=SimpleNamespace(open=7715000000000, high=7716000000000, low=7714000000000,
            close=7715500000000, volume=4, instrument_id=12,
            ts_event=int(datetime(2026,9,3,19,tzinfo=timezone.utc).timestamp()*1e9))
        def get_cost(**args):
            calls.append(('estimate',args))
            return cost
        def get_range(**args):
            calls.append(('download',args))
            return [record]*count
        client=SimpleNamespace(metadata=SimpleNamespace(get_cost=get_cost),timeseries=SimpleNamespace(get_range=get_range))
        available={'schema':{'ohlcv-1h':{'end':'2026-09-04T21:00:00Z'}}}
        result=read_prior_context(client,SimpleNamespace(OHLCVMsg=SimpleNamespace),'ESU6',
            datetime(2026,9,3,22,tzinfo=timezone.utc),available,spent=0.005)
        return result,calls

    def test_prior_context_uses_same_named_contract_and_ends_before_selected_session(self):
        result,calls=self.prior_fixture()
        self.assertTrue(result['available'])
        self.assertEqual(result['bars'][0]['end'],'2026-09-03T20:00:00.000Z')
        self.assertEqual(result['through'],'2026-09-03T22:00:00.000Z')
        for _,args in calls:
            self.assertEqual(args['symbols'],['ESU6'])
            self.assertEqual(args['stype_in'],'raw_symbol')
            self.assertEqual(args['schema'],'ohlcv-1h')
            self.assertEqual(args['start'],datetime(2026,8,24,22,tzinfo=timezone.utc))
            self.assertEqual(args['end'],datetime(2026,9,3,22,tzinfo=timezone.utc))

    def test_combined_cost_limit_prevents_prior_download(self):
        for cost in [0.046,float('nan'),-1]:
            result,calls=self.prior_fixture(cost=cost)
            self.assertFalse(result['available'])
            self.assertEqual([action for action,_ in calls],['estimate'])

    def test_prior_download_limit_is_not_presented_as_complete(self):
        result,_=self.prior_fixture(count=256)
        self.assertFalse(result['available'])
        self.assertEqual(result['bars'],[])

if __name__=='__main__': unittest.main()
