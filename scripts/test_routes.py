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
    def test_provider_denial_does_not_return_secrets(self):
        result=self.result({'status':'0','infocode':'10003','info':'secret-response'})
        self.assertFalse(result['ok']);self.assertNotIn('secret-response',json.dumps(result))

if __name__=='__main__':unittest.main()
