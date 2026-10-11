"""Refresh a small Hangzhou source snapshot. No credentials enter the output."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
import serve

SIGHTS = ['湖滨公园', '曲院风荷', '花港观鱼', '柳浪闻莺', '平湖秋月',
          '断桥残雪', '苏堤', '白堤', '太子湾公园', '雷峰塔景区', '灵隐寺',
          '飞来峰', '西溪国家湿地公园', '浙江省博物馆(之江馆区)', '清河坊', '南宋御街',
          '京杭大运河杭州景区', '桥西历史文化街区', '小河直街',
          '良渚古城遗址公园', '中国丝绸博物馆', '中国茶叶博物馆',
          '杭州植物园', '虎跑公园', '江洋畈生态公园']
FOOD = ['外婆家', '新白鹿', '绿茶餐厅', '知味观', '楼外楼', '奎元馆', '新周记',
        '四灶儿', '老头儿油爆虾', '弄堂里', '咬不得', '藏鲜工坊', '张生记', '兰边碗', '慧娟面馆']
FREE_SOURCE = 'https://www.hangzhou.gov.cn/art/2024/7/18/art_812262_59100193.html'
FREE = set(SIGHTS[:9])
JIANG_SOURCE = 'https://westlake.hangzhou.gov.cn/art/2023/5/17/art_1639430_59042393.html'

def daily_windows(hint):
    # Reject schedules with seasons, weekday variations or narrative exceptions.
    text = hint.strip().removeprefix('周一至周日 ').strip()
    text = text.removesuffix('；具体营业状态以当天开放情况为准')
    last_entry = re.search(r' 最晚进入(\d{1,2}:\d{2})$', text)
    if last_entry: text = text[:last_entry.start()]
    if text in ('24小时营业', '全天开放'): text = '00:00-24:00'
    if not re.fullmatch(r'\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}(?:\s*[,，;；]\s*\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})*', text): return None
    windows = []
    for a, b in re.findall(r'(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})', text):
        def minute(t):
            h, m = map(int, t.split(':'))
            if h > 24 or m > 59 or (h == 24 and m): raise ValueError('invalid hour')
            return h * 60 + m
        try: start, end = minute(a), minute(b)
        except ValueError: return None
        if start == end: return None
        if end < start:
            windows.extend([{'open': 0, 'close': end}, {'open': start, 'close': 1440}])
        else: windows.append({'open': start, 'close': end})
    if last_entry:
        try: limit = minute(last_entry.group(1))
        except ValueError: return None
        # Conservatively end the entire visit before last admission.
        windows = [{**w, 'close':min(w['close'],limit)} for w in windows]
    return sorted([w for w in windows if w['open'] < w['close']], key=lambda w: w['open']) or None

def find(keyword, kind, *, city='杭州', code='330100', districts=None,
         center=(120.165, 30.247), free_keywords=FREE):
    params = urllib.parse.urlencode({'key': serve.AMAP_KEY, 'keywords': keyword,
        'city': code, 'citylimit': 'true', 'extensions': 'all', 'offset': 20,
        'types': '050000' if kind == 'food' else '', 'children': 1, 'output': 'JSON'})
    with urllib.request.urlopen('https://restapi.amap.com/v3/place/text?' + params, timeout=15) as response:
        data = json.loads(response.read(1000000))
    if data.get('status') != '1': raise ValueError('高德错误码 ' + str(data.get('infocode', '未知')))
    candidates = data.get('pois', [])
    if keyword in free_keywords and city == '杭州':
        candidates = [p for p in candidates if p.get('adname') in ('西湖区', '上城区')]
    if kind == 'food':
        candidates = [p for p in candidates if p.get('adname') in (districts or ('西湖区','上城区','拱墅区','滨江区'))]
    def proximity(p):
        try:
            lon, lat = map(float, p['location'].split(','))
            return (lon - center[0]) ** 2 + (lat - center[1]) ** 2
        except (ValueError, KeyError, TypeError): return 100
    def main_score(p):
        name = str(p.get('name', ''))
        if name == keyword or name.endswith('-' + keyword) or re.fullmatch(re.escape(keyword)+r'[（(][^()（）]+[）)]', name): return 0
        if kind == 'sight':
            # A named main POI takes precedence over nearby statues and entrances.
            return 3 if p.get('parent') or '-' in name or '(打卡点)' in name else 1
        return 0
    candidates.sort(key=lambda p: (main_score(p), proximity(p)))
    for p in candidates:
        name = str(p.get('name', ''))
        if keyword not in name or any(x in name for x in ['酒店', '宾馆', '汤泉', '售票', '停车', '出入口', '游客中心', '有限公司', '分店公司', '大字墙', '机场', '售票处', '熟食店', '请香处', '咨询中心']): continue
        if p.get('cityname') not in (city+'市', city): continue
        codes = str(p.get('typecode','')).split('|')
        if kind == 'sight' and p.get('typecode') and not any(c.startswith('11') or c == '140100' for c in codes): continue
        if kind == 'food' and p.get('typecode') and (not any(c.startswith('05') for c in codes) or any(c.startswith('10') for c in codes)): continue
        # Prefer main POIs; avoid a restaurant branch posing as a museum.
        if kind == 'sight' and ('餐饮' in str(p.get('type', '')) or (p.get('parent') and main_score(p) != 0) or '(打卡点)' in name or name.endswith('店') or re.search(r'[（(][^()（）]*门[）)]',name)): continue
        extra = p.get('biz_ext') or {}
        def string(v): return v if isinstance(v, str) else ''
        return {'id': 'amap-' + p['id'], 'name': name, 'city': city,
            'district': string(p.get('adname')), 'address': string(p.get('address')),
            'location': string(p.get('location')), 'kind': kind,
            'cost_hint': string(extra.get('cost')),
            'open_hint': string(extra.get('opentime2')) or string(extra.get('open_time')) or string(extra.get('opentime')),
            'url': 'https://www.amap.com/place/' + p['id'],
            'fetched_at': datetime.now(timezone.utc).isoformat(), 'keyword': keyword}
    return None

def main():
    if not serve.AMAP_KEY: raise SystemExit('先在本地 .env 配置高德 Web 服务密钥')
    ready, pending = [], []
    for kind, keywords in [('sight', SIGHTS), ('food', FOOD)]:
        for keyword in keywords:
            time.sleep(0.3)
            try: p = find(keyword, kind)
            except Exception as error:
                print('查询未成功：'+keyword+'（'+type(error).__name__+'）'); continue
            if not p: print('未找到：' + keyword); continue
            windows = daily_windows(p['open_hint'])
            cost, evidence = None, ''
            if kind == 'food' and re.fullmatch(r'\d+(\.\d+)?', p['cost_hint']):
                import math
                cost = math.ceil(float(p['cost_hint']))
                evidence = '高德人均消费线索（估算，非菜单报价）'
            if kind == 'sight' and keyword in FREE:
                cost, evidence = 0, FREE_SOURCE + ' 仅环湖公共步行区，不含游船、登塔、展览等付费项目'
            if keyword == '江洋畈生态公园':
                cost, evidence = 0, JIANG_SOURCE + ' 页面发布于2023年，出行前复核'
                windows = [{'open':510,'close':1020}]
            if cost is None or not windows or not p['location']:
                pending.append(p); print('待补充：' + p['name']); continue
            ready.append({**p, 'name': keyword + ' · 公共步行区' if keyword in FREE else p['name'], 'cost':cost, 'duration':60 if kind == 'food' else 90,
                'open':min(w['open'] for w in windows), 'close':max(w['close'] for w in windows),
                'windows':windows, 'tags':['美食'] if kind == 'food' else ['自然','摄影'],
                'indoor':kind == 'food', 'family':False,
                'source':'资料整理于 '+p['fetched_at']+'；'+evidence+'；地址和时段来自高德。停留时长为规划建议，饮食和亲子条件未确认；营业异常、预约与排队请核实。\n'+p['url'],
                'data_status':'来源资料估算，出行前核实'})
            print('可试规划：' + p['name'])
    # All original POIs remain visible; unknown values never become zero.
    bundle = {'city':'杭州', 'updated_at':datetime.now(timezone.utc).isoformat(),
        'note':'人工选取查询关键词，不是热度排名；高德线索不等于经营者确认。来源缺失或复杂时段保留待补充。',
        'places':ready, 'pending':pending}
    target = serve.WEB/'data/hangzhou.json'; target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(bundle,ensure_ascii=False,indent=2))
    print(f'杭州资料：{len(ready)} 条可试规划，{len(pending)} 条待补充')

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Exceptions may embed the credential-bearing request URL.
        raise SystemExit('采集未完成：'+type(error).__name__+'；请检查网络、服务权限和额度')
