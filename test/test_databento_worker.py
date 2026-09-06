import unittest
from types import SimpleNamespace
from datetime import datetime, timezone
from databento_worker import bar, market_window, safe_error

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

if __name__=='__main__': unittest.main()
