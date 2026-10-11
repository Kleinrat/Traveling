import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('route_host',Path(__file__).with_name('serve.py'))
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
QUERY={'city':'杭州','mode':'walking','origin':{'id':'a','longitude':120.17,'latitude':30.24},'destination':{'id':'b','longitude':120.16,'latitude':30.25}}

class RouteTests(unittest.TestCase):
    def setUp(self): host._ROUTE_CACHE.clear()
    def result(self,data,query=QUERY):
        with patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(data).encode())):
            return host.search_route(query)
    def test_seconds_round_up_and_walking_is_free(self):
        result=self.result({'status':'1','route':{'paths':[{'duration':'61','distance':'80'}]}})
        self.assertTrue(result['ok']);self.assertEqual(result['route']['minutes'],2)
        self.assertEqual(result['route']['cost'],0);self.assertEqual(result['route']['distance'],80)
    def test_transit_unknown_fare_does_not_become_free(self):
        query={**QUERY,'mode':'transit'}
        result=self.result({'status':'1','route':{'transits':[{'duration':'80','distance':'200','cost':[]},{'duration':'125','distance':'300','cost':'2.5'}]}},query)
        self.assertTrue(result['ok']);self.assertEqual(result['route']['cost'],3)
        self.assertEqual(result['route']['minutes'],3)
        result=self.result({'status':'1','route':{'transits':[{'duration':'80','distance':'200','cost':[]}]}},{**query,'origin':{**query['origin'],'longitude':121.0}})
        self.assertFalse(result['ok'])
    def test_cache_reuses_coordinates_without_reusing_place_ids(self):
        with patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(b'{"status":"1","route":{"paths":[{"duration":"61","distance":"80"}]}}')) as fetch:
            host.search_route(QUERY)
            result=host.search_route({**QUERY,'origin':{**QUERY['origin'],'id':'new-a'}})
        self.assertEqual(fetch.call_count,1);self.assertEqual(result['route']['from_id'],'new-a')
    def test_invalid_coordinates_and_provider_values_are_rejected(self):
        checked=host.bridge({'action':'route-query','query':{**QUERY,'origin':{**QUERY['origin'],'longitude':0}}})
        self.assertFalse(checked['ok'])
        result=self.result({'status':'1','route':{'paths':[{'duration':'NaN','distance':'80'}]}})
        self.assertFalse(result['ok'])
        self.assertFalse(self.result({'status':'1','route':{'paths':[]}})['ok'])
    def test_multiple_options_and_transfer_details_are_retained(self):
        query={**QUERY,'mode':'transit'}
        paths=[{'duration':'600','distance':'3000','cost':'3','walking_distance':'420',
                'segments':[{'bus':{'buslines':[{'name':'地铁一号线'}]}},{'bus':{'buslines':[{'name':'公交三路'}]}}]},
               {'duration':'900','distance':'3100','cost':'2','walking_distance':'80',
                'segments':[{'bus':{'buslines':[{'name':'公交二路'}]}}]}]
        result=self.result({'status':'1','route':{'transits':paths+[paths[0]]}},query)
        self.assertTrue(result['ok']);self.assertEqual(len(result['options']),2)
        self.assertEqual(result['options'][0]['walking_distance'],420)
        self.assertEqual(result['options'][0]['transfers'],1)
        self.assertIn('地铁一号线',result['options'][0]['summary'])
        self.assertEqual(result['options'][1]['transfers'],0)
        self.assertEqual(result['options'][1]['route']['cost'],2)
    def test_missing_walking_and_transfers_are_unknown_not_zero(self):
        result=self.result({'status':'1','route':{'transits':[{'duration':'600','distance':'3000','cost':'3'}]}},{**QUERY,'mode':'transit'})
        self.assertTrue(result['ok']);self.assertNotIn('walking_distance',result['options'][0])
        self.assertNotIn('transfers',result['options'][0])
    def test_provider_denial_does_not_return_secrets(self):
        result=self.result({'status':'0','infocode':'10003','info':'secret-response'})
        self.assertFalse(result['ok']);self.assertNotIn('secret-response',json.dumps(result))

if __name__=='__main__':unittest.main()
