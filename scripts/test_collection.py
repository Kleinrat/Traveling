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

    def test_explicit_all_day_and_last_admission_without_guessing_calendar(self):
        self.assertEqual(c.daily_windows('周一至周日 00:00-24:00；具体营业状态以当天开放情况为准'),[{'open':0,'close':1440}])
        self.assertEqual(c.daily_windows('周一至周日 08:00-17:00 最晚进入16:30'),[{'open':480,'close':990}])
        self.assertIsNone(c.daily_windows('03-16至10-31 周一至周日 07:30-17:00 最晚进入17:00'))

    def test_chengdu_does_not_take_hangzhou_or_scenic_gate(self):
        raw={'status':'1','pois':[
            {'id':'hz','name':'人民公园','cityname':'杭州市','adname':'上城区'},
            {'id':'gate','name':'人民公园(南门)','cityname':'成都市','adname':'青羊区','typecode':'110000'},
            {'id':'main','name':'人民公园','cityname':'成都市','adname':'青羊区','typecode':'110202'}]}
        with patch.object(c.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=c.find('人民公园','sight',city='成都',code='510100',free_keywords=set())
        self.assertEqual(result['id'],'amap-main')

    def test_historic_street_query_does_not_choose_a_school(self):
        raw={'status':'1','pois':[
            {'id':'school','name':'锦里小学','cityname':'成都市','typecode':'141204'},
            {'id':'street','name':'锦里古街','cityname':'成都市','typecode':'110000'}]}
        with patch.object(c.urllib.request,'urlopen',return_value=io.BytesIO(json.dumps(raw).encode())):
            result=c.find('锦里','sight',city='成都',code='510100',free_keywords=set())
        self.assertEqual(result['id'],'amap-street')

if __name__=='__main__':unittest.main()
