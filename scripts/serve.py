#!/usr/bin/env python3
"""Local HTTP/AI transport. Recommendation and validation are MoonBit code."""
import json
import os
import math
import hashlib
import time
import threading
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
# Read a narrow local configuration format without executing shell expressions.
if (ROOT / '.env').exists():
    allowed = {'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AMAP_API_KEY', 'PORT', 'MOONTRIP_NODE'}
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' not in line or line.strip().startswith('#'):
            continue
        name, value = line.split('=', 1)
        if name.strip() in allowed:
            os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))
NODE = os.environ.get('MOONTRIP_NODE', 'node')
PORT = int(os.environ.get('PORT', '8787'))
KEY = os.environ.get('AI_API_KEY', '')
BASE = os.environ.get('AI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
MODEL = os.environ.get('AI_MODEL', 'gpt-4.1-mini')
AMAP_KEY = os.environ.get('AMAP_API_KEY', '')


def search_places(query):
    params = urllib.parse.urlencode({'key': AMAP_KEY, 'city': query['code'],
        'citylimit': 'true', 'types': '' if query['kind'] == 'food' and query.get('keywords') else query['types'], 'offset': 20,
        'page': 1, 'extensions': 'all', 'output': 'JSON',
        'keywords': query.get('keywords', '')})
    with urllib.request.urlopen('https://restapi.amap.com/v3/place/text?' + params,
                                timeout=15) as response:
        raw = response.read(1000001)
    if len(raw) > 1000000:
        raise ValueError('response too large')
    data = json.loads(raw)
    if data.get('status') != '1':
        return {'ok': False, 'errors': ['高德查询未成功，错误码 ' + str(data.get('infocode', '未知')) + '；请检查额度和密钥权限']}
    diverse = query['kind'] == 'food' and query.get('diverse', False)
    if diverse:
        broad = urllib.parse.urlencode({'key': AMAP_KEY, 'city': query['code'],
            'citylimit': 'true', 'types': '050100|050200|050300', 'offset': 20,
            'page': 1, 'extensions': 'all', 'output': 'JSON'})
        with urllib.request.urlopen('https://restapi.amap.com/v3/place/text?' + broad, timeout=15) as response:
            extra_raw = response.read(1000001)
        if len(extra_raw) > 1000000: raise ValueError('response too large')
        broad_data = json.loads(extra_raw)
        if broad_data.get('status') == '1':
            data['pois'] = data.get('pois', []) + broad_data.get('pois', [])
        def rating(poi):
            try: return float((poi.get('biz_ext') or {}).get('rating', 0))
            except (ValueError, TypeError, AttributeError): return 0
        data['pois'] = sorted(data.get('pois', []), key=rating, reverse=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    def string(value):
        return value if isinstance(value, str) else ''
    items = []
    for poi in data.get('pois', [])[:40 if diverse else 20]:
        city_name = poi.get('cityname')
        if isinstance(city_name, str) and city_name and city_name not in (query['city'], query['city'] + '市'):
            continue
        # Provider category metadata must describe dining, without a lodging category.
        if query['kind'] == 'food':
            codes = str(poi.get('typecode', '')).split('|')
            if not any(code.startswith('05') for code in codes) or any(code.startswith('10') for code in codes):
                continue
            if diverse and not any(code.startswith(('0501', '0502', '0503')) for code in codes):
                continue
            if '有限公司' in str(poi.get('name', '')):
                continue
        extra = poi.get('biz_ext')
        if not isinstance(extra, dict):
            extra = {}
        if query['kind'] == 'food' and query.get('keywords') and not diverse:
            evidence = ' '.join(string(value) for value in
                [poi.get('name'), poi.get('type'), extra.get('tag')])
            if not any(word in evidence for word in query['keywords'].split('|') if word):
                continue
        poi_id = string(poi.get('id'))
        items.append({'id': 'amap-' + poi_id if poi_id else '',
            'name': string(poi.get('name')), 'city': query['city'],
            'district': string(poi.get('adname')), 'address': string(poi.get('address')),
            'location': string(poi.get('location')), 'kind': query['kind'],
            'cost_hint': string(extra.get('cost')),
            'open_hint': string(extra.get('opentime2')) or string(extra.get('open_time')) or string(extra.get('opentime')),
            'fetched_at': timestamp, 'url': 'https://www.amap.com/place/' + urllib.parse.quote(poi_id, safe='')})
    result = bridge({'action': 'pending-places', 'items': items})
    if result.get('ok'): result['items'] = result['items'][:20]
    return result


# Bounded server-only route cache; keys never reach browser responses.
_ROUTE_CACHE = {}
_ROUTE_LOCK = threading.Lock()

def search_route(query):
    def point(p): return f"{p['longitude']:.6f},{p['latitude']:.6f}"
    origin, destination = point(query['origin']), point(query['destination'])
    cache_key = (query['city'], query['mode'], origin, destination)
    with _ROUTE_LOCK:
        cached = _ROUTE_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < 3600:
        raw = dict(cached[1])
    else:
        params = {'key': AMAP_KEY, 'origin': origin, 'destination': destination, 'output': 'JSON'}
        if query['mode'] == 'walking':
            endpoint = 'walking'
        else:
            endpoint = 'transit/integrated'
            params.update(city=query['city'], cityd=query['city'], strategy=0, extensions='all')
        with urllib.request.urlopen('https://restapi.amap.com/v3/direction/' + endpoint + '?' + urllib.parse.urlencode(params), timeout=15) as response:
            body = response.read(1000001)
        if len(body) > 1000000: raise ValueError('route response too large')
        data = json.loads(body)
        if data.get('status') != '1':
            return {'ok': False, 'errors': ['高德路线查询未成功，错误码 ' + str(data.get('infocode', '未知')) + '；请检查路线服务权限和额度']}
        plans = (data.get('route') or {}).get('paths' if query['mode'] == 'walking' else 'transits') or []
        valid = []
        timestamp = datetime.now(timezone.utc).isoformat()
        seen = set()
        for path in plans:
            try:
                seconds, distance = float(path['duration']), float(path['distance'])
                cost = 0 if query['mode'] == 'walking' else float(path['cost'])
                if not all(math.isfinite(n) and n >= 0 for n in (seconds, distance, cost)): continue
                if seconds > 86400 or distance > 1000000 or cost > 10000: continue
                if query['mode'] == 'walking':
                    walked, transfers, summary = math.ceil(distance), 0, '全程步行'
                else:
                    walked, transfers = None, None
                    try:
                        amount = float(path['walking_distance'])
                        if math.isfinite(amount) and 0 <= amount <= 1000000: walked = math.ceil(amount)
                    except (KeyError, ValueError, TypeError): pass
                    lines = []
                    segments = path.get('segments')
                    if isinstance(segments, list) and segments:
                        for segment in segments:
                            bus = segment.get('bus') or {}
                            buslines = bus.get('buslines') or []
                            if buslines and isinstance(buslines[0], dict):
                                name = buslines[0].get('name')
                                if isinstance(name, str) and name: lines.append(name)
                        if lines: transfers = max(0, len(lines) - 1)
                    summary = ' → '.join(lines)[:300] or '公交 / 地铁方案（线路详情未提供）'
                item = {'seconds': math.ceil(seconds), 'distance': math.ceil(distance),
                        'cost': math.ceil(cost), 'fetched_at': timestamp,
                        'walking_distance': walked, 'transfers': transfers, 'summary': summary}
                fingerprint = (item['seconds'], item['distance'], item['cost'], walked, transfers, summary)
                if fingerprint in seen: continue
                seen.add(fingerprint)
                item['id'] = query['mode'] + '-' + hashlib.sha256(repr((origin, destination, fingerprint)).encode()).hexdigest()[:16]
                valid.append(item)
            except (ValueError, KeyError, TypeError, AttributeError): continue
        if not valid:
            return {'ok': False, 'errors': ['没有包含时间、距离和费用的完整路线方案；不会按零费用处理，请换交通方式或保留估算']}
        raw = {'options': sorted(valid, key=lambda p: p['seconds'])[:5]}
        with _ROUTE_LOCK:
            if len(_ROUTE_CACHE) >= 1000: _ROUTE_CACHE.clear()
            _ROUTE_CACHE[cache_key] = (time.monotonic(), dict(raw))
    options = []
    for item in raw['options']:
        checked = bridge({'action': 'route-result', 'route': {**item, 'mode': query['mode'],
            'from_id': query['origin']['id'], 'to_id': query['destination']['id']}})
        if not checked['ok']: return checked
        option = {'id': item['id'], 'route': checked['route'], 'summary': item['summary']}
        for field in ('walking_distance', 'transfers'):
            if item[field] is not None: option[field] = item[field]
        options.append(option)
    return bridge({'action': 'route-options', 'options': options})


def bridge(payload):
    result = subprocess.run([NODE, str(ROOT / 'scripts/bridge.mjs')],
                            input=json.dumps(payload), text=True, capture_output=True,
                            timeout=10, check=True)
    return json.loads(result.stdout)


def ask_provider(prompt, current):
    payload = {'model': MODEL, 'messages': [
        {'role': 'system', 'content': prompt['system']},
        {'role': 'user', 'content': prompt['user']}],
        'response_format': {'type': 'json_object'}, 'max_tokens': 2048}
    if MODEL == 'kimi-k2.6':
        payload['thinking'] = {'type': 'disabled'}
    body = json.dumps(payload).encode()
    request = urllib.request.Request(BASE + '/chat/completions', data=body,
                                     headers={'Content-Type': 'application/json',
                                              'Authorization': 'Bearer ' + KEY})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(131073)
    if len(raw) > 131072:
        raise ValueError('provider response too large')
    data = json.loads(raw)
    content = data['choices'][0]['message']['content']
    if not isinstance(content, str):
        raise ValueError('provider content must be text')
    return bridge({'action': 'validate', 'content': content, 'current': current})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def reply(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/api/status':
            return self.reply(200, {'configured': bool(KEY), 'model': MODEL if KEY else None,
                                    'maps_configured': bool(AMAP_KEY)})
        super().do_GET()

    def do_POST(self):
        if self.path not in {'/api/assistant', '/api/places', '/api/routes'}:
            return self.reply(404, {'ok': False, 'errors': ['未知接口']})
        allowed_hosts = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
        if self.headers.get('Host') not in allowed_hosts:
            return self.reply(403, {'ok': False, 'errors': ['仅接受本机请求']})
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://{host}' for host in allowed_hosts}:
            return self.reply(403, {'ok': False, 'errors': ['请求来源不匹配']})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'ok': False, 'errors': ['请使用 JSON 请求']})
        if self.path == '/api/assistant' and not KEY:
            return self.reply(503, {'ok': False, 'errors': ['未配置 AI 服务；仍可用条件表单和三种示例生成行程']})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                return self.reply(413, {'ok': False, 'errors': ['请求过大或为空']})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('invalid payload')
            if self.path == '/api/routes':
                if not AMAP_KEY:
                    return self.reply(503, {'ok': False, 'errors': ['本机尚未配置高德 Web 服务密钥']})
                checked = bridge({'action': 'route-query', 'query': data})
                if not checked['ok']: return self.reply(422, checked)
                result = search_route(checked['query'])
                return self.reply(200 if result['ok'] else 502, result)
            if self.path == '/api/places':
                if not AMAP_KEY:
                    return self.reply(503, {'ok': False, 'errors': ['本机尚未配置高德 Web 服务密钥']})
                query = bridge({'action': 'place-query', 'query': data})
                if not query['ok']:
                    return self.reply(422, query)
                result = search_places(query)
                return self.reply(200 if result['ok'] else 502, result)
            message = data.get('message')
            if not isinstance(message, str) or not 1 <= len(message.strip()) <= 3000:
                raise ValueError('invalid message')
            current = data.get('current')
            if not isinstance(current, dict):
                raise ValueError('invalid current settings')
            prompt = bridge({'action': 'prompt', 'current': current, 'message': message})
            result = ask_provider(prompt, current)
            return self.reply(200 if result['ok'] else 422, result)
        except urllib.error.HTTPError as error:
            if self.path in {'/api/places', '/api/routes'}:
                return self.reply(502, {'ok': False, 'errors': ['高德服务拒绝查询，请检查密钥、额度或稍后重试']})
            message = {401: 'AI 密钥无效或已过期', 403: 'AI 服务访问被拒绝', 402: 'AI 服务余额不足', 429: 'AI 服务限流或余额不足，请稍后重试', 400: 'AI 请求参数或模型名称不被服务接受'}.get(error.code, 'AI 服务拒绝请求，请检查服务地址、模型和密钥')
            return self.reply(502, {'ok': False, 'errors': [message]})
        except (TimeoutError, subprocess.TimeoutExpired):
            return self.reply(504, {'ok': False, 'errors': ['服务请求超时，请稍后重试']})
        except (urllib.error.URLError, OSError, subprocess.CalledProcessError):
            return self.reply(502, {'ok': False, 'errors': ['外部服务或 MoonBit 桥接暂时不可用']})
        except (ValueError, KeyError, IndexError, TypeError):
            return self.reply(422, {'ok': False, 'errors': ['请求或模型输出格式不正确，请手动调整条件']})


def main():
    if not (WEB / 'engine.js').exists():
        raise SystemExit('请先运行 sh scripts/build.sh')
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'MoonTrip: http://127.0.0.1:{PORT} — AI {"已配置" if KEY else "未配置，条件演示可用"}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
