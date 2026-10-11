import io
import json
import unittest
from unittest.mock import patch
import collect_hangzhou as c

class CollectionTests(unittest.TestCase):
    def test_split_and_overnight_windows_preserve_closures(self):
        self.assertEqual(c.daily_windows('周一至周日 10:30-14:00,17:00-22:00'),[{'open':630,'close':840},{'open':1020,'close':1320}])
        self.assertEqual(c.daily_windows('周一至周日 10:00-02:00'),[{'open':0,'close':120},{'open':600,'close':1440}])
        self.assertIsNone(c.daily_windows('周二至周日 10:00-17:00；周一闭馆'))
        self.assertIsNone(c.daily_windows('10:00-26:00'))
    def test_main_poi_precedes_nearby_child_and_same_named_county_park(self):
        raw={'status':'1','pois':[
          {'id':'county','name':'千岛湖风景区-湖滨公园','adname':'淳安县','cityname':'杭州市','location':'119,29'},
          {'id':'child','name':'杭州西湖风景名胜区-湖滨公园-雕像','parent':'main','adname':'上城区','cityname':'杭州市','location':'120.165,30.247'},
          {'id':'main','name':'杭州西湖风景名胜区-湖滨公园','parent':'westlake','adname':'上城区','cityname':'杭州市','location':'120.16,30.25'}]}
        with patch.object(c.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=c.find('湖滨公园','sight')
        self.assertEqual(result['id'],'amap-main')

if __name__=='__main__':unittest.main()
