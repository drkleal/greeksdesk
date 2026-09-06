import unittest
from types import SimpleNamespace
from datetime import datetime, timezone
from es_profile import summarize_trades, read_profile

UTC=timezone.utc
start=datetime(2026,9,3,22,tzinfo=UTC)
end=datetime(2026,9,4,21,tzinfo=UTC)
close=datetime(2026,9,4,20,tzinfo=UTC)
def trade(hour, minute, price, size, instrument=12):
    return SimpleNamespace(ts_event=int(datetime(2026,9,4,hour,minute,tzinfo=UTC).timestamp()*1e9), price=int(price*1e9),size=size,instrument_id=instrument)

class ProfileTests(unittest.TestCase):
    def test_actual_volume_weighting_and_nonoverlapping_trading_windows(self):
        rows=[trade(1,0,7700,2),trade(8,0,7710,3),trade(13,30,7720,1),trade(15,0,7722,3),trade(20,30,7725,2)]
        r=summarize_trades(rows,'ESU6',start,end,close)
        self.assertEqual(r['totalVolume'],11)
        self.assertEqual(r['sessionProfiles']['Asia']['vwap'],7700)
        self.assertEqual(r['sessionProfiles']['London']['vwap'],7710)
        self.assertEqual(r['sessionProfiles']['Overnight']['vwap'],7706)
        self.assertEqual(r['sessionProfiles']['RTH']['vwap'],7721.5)
        self.assertEqual(r['sessionProfiles']['RTH']['volume'],4)
        self.assertTrue(r['completeWindow'])
    def test_mixed_contracts_and_record_cap_do_not_make_a_complete_profile(self):
        with self.assertRaises(ValueError): summarize_trades([trade(14,0,7700,1),trade(14,1,7701,1,13)],'ESU6',start,end,close)
        self.assertFalse(summarize_trades([trade(14,0,7700,1)]*2,'ESU6',start,end,close,limit=2)['available'])
    def test_developing_session_carries_its_actual_through_time(self):
        through=datetime(2026,9,4,15,tzinfo=UTC)
        r=summarize_trades([trade(14,0,7720,2)],'ESU6',start,through,close)
        self.assertFalse(r['sessionProfiles']['RTH']['sessionComplete'])
        self.assertEqual(r['sessionProfiles']['RTH']['through'],'2026-09-04T15:00:00.000Z')
    def test_poc_uses_real_traded_tick_and_bucket_volume(self):
        r=summarize_trades([trade(14,0,7720,1),trade(14,1,7720.75,9),trade(14,2,7721,2)],'ESU6',start,end,close)
        self.assertEqual(r['nodes'][0]['kind'],'POC')
        self.assertEqual(r['nodes'][0]['price'],7720.75)
        self.assertEqual(r['nodes'][0]['volume'],10)
    def test_combined_cost_cap_prevents_trade_download(self):
        def no_download(**kw): raise AssertionError('Must not download')
        client=SimpleNamespace(metadata=SimpleNamespace(get_cost=lambda **kw:.04),timeseries=SimpleNamespace(get_range=no_download))
        r=read_profile(client,'ESU6',start,end,{'schema':{'trades':{'end':'2026-09-04T21:00:00Z'}}},close,spent=.02)
        self.assertFalse(r['available']);self.assertIn('cap',r['message'])

if __name__=='__main__': unittest.main()
