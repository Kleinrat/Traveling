#!/usr/bin/env python3
"""Local HTTP/AI transport. Recommendation and validation are MoonBit code."""
import json
import os
import subprocess
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
# Read a narrow local configuration format without executing shell expressions.
if (ROOT / '.env').exists():
    allowed = {'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'PORT', 'MOONTRIP_NODE'}
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
            return self.reply(200, {'configured': bool(KEY), 'model': MODEL if KEY else None})
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/assistant':
            return self.reply(404, {'ok': False, 'errors': ['未知接口']})
        allowed_hosts = {f'127.0.0.1:{PORT}', f'localhost:{PORT}'}
        if self.headers.get('Host') not in allowed_hosts:
            return self.reply(403, {'ok': False, 'errors': ['仅接受本机请求']})
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://{host}' for host in allowed_hosts}:
            return self.reply(403, {'ok': False, 'errors': ['请求来源不匹配']})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'ok': False, 'errors': ['请使用 JSON 请求']})
        if not KEY:
            return self.reply(503, {'ok': False, 'errors': ['未配置 AI 服务；仍可用条件表单和三种示例生成行程']})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                return self.reply(413, {'ok': False, 'errors': ['请求过大或为空']})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('invalid payload')
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
            message = {401: 'AI 密钥无效或已过期', 403: 'AI 服务访问被拒绝', 402: 'AI 服务余额不足', 429: 'AI 服务限流或余额不足，请稍后重试', 400: 'AI 请求参数或模型名称不被服务接受'}.get(error.code, 'AI 服务拒绝请求，请检查服务地址、模型和密钥')
            return self.reply(502, {'ok': False, 'errors': [message]})
        except (TimeoutError, subprocess.TimeoutExpired):
            return self.reply(504, {'ok': False, 'errors': ['AI 请求超时，请稍后重试']})
        except (urllib.error.URLError, OSError, subprocess.CalledProcessError):
            return self.reply(502, {'ok': False, 'errors': ['AI 服务或 MoonBit 桥接暂时不可用']})
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
