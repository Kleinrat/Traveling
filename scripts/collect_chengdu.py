"""Collect a bounded Chengdu snapshot using explicit place and brand names."""
import json
import math
import re
import time
from datetime import datetime, timezone
import serve
from collect_hangzhou import find, daily_windows

SIGHTS = ['人民公园', '宽窄巷子', '浣花溪公园', '塔子山公园', '文殊院',
          '昭觉寺', '成都大熊猫繁育研究基地', '武侯祠', '杜甫草堂', '金沙遗址博物馆',
          '成都博物馆', '四川博物院', '锦里', '望江楼公园', '青羊宫',
          '东郊记忆', '成都植物园', '青龙湖湿地公园', '安顺廊桥', '黄龙溪古镇']
FOOD = ['陈麻婆豆腐', '陶德砂锅', '马旺子', '明婷饭店', '盘飧市', '龙抄手',
        '钟水饺', '陈兴记', '夫妻肺片', '何师烧烤', '小龙坎', '蜀九香', '玉林串串香',
        '李雪牛杂', '皇城老妈']
CITY_GUIDE = 'https://m.thepaper.cn/newsDetail_forward_3864205'
PARK_GUIDE = 'https://m.cd.bendibao.com/tour/212760.shtm?src=amap'
# Fee evidence is separate from provider consumption hints. Public areas only.
FEES = {name:(0, CITY_GUIDE+' 成都发布2019年资料，仅公共游览区，旧资料出行前复核')
        for name in ['宽窄巷子', '浣花溪公园', '塔子山公园', '文殊院', '昭觉寺']}
FEES['人民公园'] = (0, PARK_GUIDE+' 2026年资料，免费入园；茶饮、游船和服务另计')
FEES['成都大熊猫繁育研究基地'] = (55, 'https://m.panda.org.cn/jp/ 官方全价成人票55元；须按时段实名预约，观光车另计30元，当前预算不含观光车')

def enrich(p):
    windows = daily_windows(p['open_hint'])
    cost, evidence = None, ''
    if p['kind'] == 'food' and re.fullmatch(r'\d+(\.\d+)?', p['cost_hint']):
        cost = math.ceil(float(p['cost_hint']))
        evidence = '高德人均消费线索（估算，非菜单报价）'
    elif p['keyword'] in FEES:
        cost, evidence = FEES[p['keyword']]
    # Admission sessions and seasons cannot be represented by the daily-window model.
    if p['keyword'] == '成都大熊猫繁育研究基地':
        return None
    if cost is None or not windows or not p['location']:
        return None
    culture = p['keyword'] in ['宽窄巷子', '文殊院', '昭觉寺']
    return {**p, 'cost':cost, 'duration':60 if p['kind']=='food' else 180 if p['keyword']=='成都大熊猫繁育研究基地' else 90,
        'open':min(w['open'] for w in windows), 'close':max(w['close'] for w in windows),
        'windows':windows, 'tags':['美食'] if p['kind']=='food' else ['文化','历史','摄影'] if culture else ['自然','摄影'],
        'indoor':p['kind']=='food', 'family':False,
        'source':'资料查询于 '+p['fetched_at']+'；'+evidence+'；地址、普通营业时段来自高德，停留时长为规划建议。费用不含店内额外消费；饮食和亲子条件未确认，闭馆日、排队与预约请另行复核。\n'+p['url'],
        'data_status':'来源资料估算，出行前核实'}

def main():
    if not serve.AMAP_KEY: raise SystemExit('先在本地 .env 配置高德 Web 服务密钥')
    ready, pending, seen = [], [], set()
    for kind, keywords in [('sight',SIGHTS),('food',FOOD)]:
        for keyword in keywords:
            time.sleep(0.3)
            try:
                p = find(keyword,kind,city='成都',code='510100',
                    districts=('锦江区','青羊区','金牛区','武侯区','成华区'),
                    center=(104.066,30.657),free_keywords=set())
            except Exception as error:
                print('查询未成功：'+keyword+'（'+type(error).__name__+'）',flush=True); continue
            if not p: print('未找到：'+keyword,flush=True); continue
            if p['id'] in seen: continue
            seen.add(p['id'])
            complete = enrich(p)
            (ready if complete else pending).append(complete or p)
            print(('可试规划：' if complete else '待补充：')+p['name'],flush=True)
    if not ready: raise ValueError('没有可规划记录，保留旧文件')
    bundle = {'city':'成都','updated_at':datetime.now(timezone.utc).isoformat(),
        'note':'杭州、成都首版；关键词人工选取，不代表热度榜。费用和时段为来源线索，不是实时承诺；缺失资料、分时预约和季节时段保留待补充。',
        'places':ready,'pending':pending}
    target = serve.WEB/'data/chengdu.json'; target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(bundle,ensure_ascii=False,indent=2))
    print(f'成都资料：{len(ready)} 条可试规划，{len(pending)} 条待补充',flush=True)

if __name__ == '__main__':
    try: main()
    except Exception as error:
        raise SystemExit('采集未完成：'+type(error).__name__+'；请检查网络、服务权限和额度')
