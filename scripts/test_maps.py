# coding: utf-8
"""Map transport preserves unknown fields and rejects invalid queries before any fetch."""
import importlib.util
import io
import json
import unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('map_host',Path(__file__).with_name('serve.py'))
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
class MapTests(unittest.TestCase):
    def test_local_cuisine_requires_provider_evidence(self):
        raw={'status':'1','pois':[{'id':'local','name':'菜馆','typecode':'050100','type':'餐饮服务;中餐厅;浙江菜'}, {'id':'other','name':'北京小吃','typecode':'050100','type':'餐饮服务;中餐厅;北京菜'}]}
        with patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=host.search_places({'city':'杭州','code':'330100','kind':'food','types':'050100','keywords':'杭帮菜|浙江菜'})
        self.assertEqual([p['id'] for p in result['items']],['amap-local'])
    def test_real_v3_opening_fields_are_preserved(self):
        raw={'status':'1','pois':[{'id':'restaurant','name':'测试餐厅','typecode':'050100','biz_ext':{'cost':'44.00','opentime2':'周一至周日 10:00-22:00','open_time':'10:00-22:00'}}, {'id':'hotel','name':'住宿地点','typecode':'100100|050100'}, {'id':'other','name':'未知类别'}]}
        with patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=host.search_places({'city':'杭州','code':'330100','kind':'food','types':'050000'})
        self.assertEqual(result['items'][0]['cost_hint'],'44.00')
        self.assertEqual(result['items'][0]['open_hint'],'周一至周日 10:00-22:00')
        self.assertEqual(len(result['items']),1)
    def test_missing_fields_stay_unknown_and_credentials_do_not_escape(self):
        raw={'status':'1','pois':[{'id':'test-poi','name':'测试地点','address':[], 'location':'120,30', 'biz_ext':{'cost':[],'opentime':[]}}]}
        with patch.object(host,'AMAP_KEY','test-only-map-key'), patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=host.search_places({'city':'杭州','code':'330100','kind':'sight','types':'110000'})
        self.assertTrue(result['ok']);self.assertEqual(result['items'][0]['cost_hint'],'');self.assertEqual(result['items'][0]['open_hint'],'')
        self.assertNotIn('test-only-map-key',json.dumps(result));self.assertEqual(result['status'],'待核对')
    def test_provider_denial_returns_only_code(self):
        with patch.object(host.urllib.request,'urlopen',return_value=io.BytesIO(b'{"status":"0","infocode":"10003","info":"private key details"}')):
            result=host.search_places({'code':'330100','kind':'food','city':'杭州','types':'050000'})
        self.assertFalse(result['ok']);self.assertIn('10003',result['errors'][0]);self.assertNotIn('private key details',json.dumps(result))
if __name__=='__main__':unittest.main()
