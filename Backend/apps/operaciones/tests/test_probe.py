from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from io import StringIO
from django.test import SimpleTestCase,override_settings
from django.core.management import call_command,CommandError


class ProbeTests(SimpleTestCase):
    @override_settings(APP_ENV='ci')
    def test_real_local_ready_and_outage_produce_distinct_exit_status(self):
        state=[200]
        class Receiver(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(state[0])
                self.end_headers()
                self.wfile.write(b'{"status":"ready"}')
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Receiver)
        thread=Thread(target=server.serve_forever,daemon=True)
        thread.start()
        url=f'http://127.0.0.1:{server.server_port}/health/ready'
        try:
            call_command('probe_service',url=url,stdout=StringIO())
            state[0]=503
            with self.assertRaises(CommandError):call_command('probe_service',url=url,stdout=StringIO())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)

    @override_settings(APP_ENV='production')
    def test_production_rejects_plain_http_even_loopback(self):
        with self.assertRaises(CommandError):
            call_command('probe_service',url='http://127.0.0.1/health/ready',stdout=StringIO())
