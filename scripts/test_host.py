"""Exercise the actual HTTP -> provider -> compiled MoonBit validation path."""
import importlib.util
import json
import threading
import unittest
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('moontrip_server', Path(__file__).with_name('serve.py'))
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)
VALID = {'city': '成都', 'days': 2, 'budget': 250, 'start': 600, 'end': 990,
         'interests': ['亲子', '科技'], 'family': True, 'rain': False, 'relaxed': True}

class Provider(BaseHTTPRequestHandler):
    content = json.dumps(VALID)
    observed = None
    def do_POST(self):
        Provider.observed = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        data = json.dumps({'choices': [{'message': {'content': Provider.content}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *_):
        pass

class HostTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.provider = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        cls.host = ThreadingHTTPServer(('127.0.0.1', 0), server_module.Handler)
        server_module.PORT = cls.host.server_port
        server_module.BASE = f'http://127.0.0.1:{cls.provider.server_port}/v1'
        for instance in (cls.provider, cls.host):
            threading.Thread(target=instance.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.host.server_port}'
    @classmethod
    def tearDownClass(cls):
        for instance in (cls.host, cls.provider):
            instance.shutdown()
            instance.server_close()
    def setUp(self):
        server_module.KEY = 'test-only-fake-key'
        Provider.content = json.dumps(VALID)
    def post(self, body=None, **headers):
        data = json.dumps(body if body is not None else {'current': VALID, 'message': '亲子慢游'}).encode()
        request = urllib.request.Request(self.url + '/api/assistant', data=data,
                                         headers={'Content-Type': 'application/json', **headers})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as response:
            return response.code, json.load(response)
    def test_valid_provider_roundtrip(self):
        status, result = self.post()
        self.assertEqual(status, 200)
        self.assertEqual(result['request'], VALID)
        self.assertEqual(Provider.observed['messages'][0]['role'], 'system')
        self.assertEqual(Provider.observed['response_format'], {'type': 'json_object'})
    def test_invalid_model_range(self):
        Provider.content = json.dumps({**VALID, 'days': 99})
        status, result = self.post()
        self.assertEqual(status, 422)
        self.assertFalse(result['ok'])
    def test_malformed_provider_content(self):
        Provider.content = 'not-json'
        self.assertEqual(self.post()[0], 422)
    def test_no_key_preserves_demo(self):
        server_module.KEY = ''
        self.assertEqual(self.post()[0], 503)
        with urllib.request.urlopen(self.url + '/api/status') as response:
            self.assertFalse(json.load(response)['configured'])
    def test_cross_origin_rejected(self):
        self.assertEqual(self.post(Origin='https://untrusted.example')[0], 403)
    def test_invalid_message(self):
        self.assertEqual(self.post({'current': VALID, 'message': 42})[0], 422)
        self.assertEqual(self.post({'current': VALID, 'message': 'x' * 3001})[0], 422)

if __name__ == '__main__':
    unittest.main()
