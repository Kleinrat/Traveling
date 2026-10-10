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
