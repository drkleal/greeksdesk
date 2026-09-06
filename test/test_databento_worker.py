import unittest
from types import SimpleNamespace
from datetime import date, datetime, timezone
from databento_worker import bar, market_window, safe_error, resolve_contract

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

if __name__=='__main__': unittest.main()
