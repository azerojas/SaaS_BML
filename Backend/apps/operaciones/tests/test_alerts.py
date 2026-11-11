import json
import secrets
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from django.test import SimpleTestCase,override_settings
from apps.operaciones.infrastructure.alerts import deliver


class AlertTests(SimpleTestCase):
    def test_real_local_webhook_receives_safe_alert(self):
        received=[]
        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                self.send_response(204)
                self.end_headers()
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Receiver)
        thread=Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            with override_settings(APP_ENV='ci',ALLOW_LOCAL_ALERT_TESTS=True,ALERT_WEBHOOK_URL='http://127.0.0.1:'+str(server.server_port),ALERT_WEBHOOK_TOKEN=secrets.token_urlsafe(32)):
                deliver([{'code':'JOB_STALE','job':'backup','severity':'high'}])
            self.assertEqual(received,[{'service':'beauty-manager','alerts':[{'code':'JOB_STALE','job':'backup','severity':'high'}]}])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)

    def test_unconfigured_or_non_https_destination_fails(self):
        with override_settings(ALERT_WEBHOOK_URL='http://unsafe.example.test',ALLOW_LOCAL_ALERT_TESTS=False):
            with self.assertRaises(ValueError):deliver([])

    def test_real_redirect_is_rejected_without_second_request(self):
        from urllib.error import HTTPError
        received=[]
        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                received.append(self.path)
                self.send_response(302)
                self.send_header('Location','/must-not-receive-token')
                self.end_headers()
            def log_message(self,*args):pass
        server=ThreadingHTTPServer(('127.0.0.1',0),Receiver)
        thread=Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            with override_settings(APP_ENV='ci',ALLOW_LOCAL_ALERT_TESTS=True,ALERT_WEBHOOK_URL='http://127.0.0.1:'+str(server.server_port),ALERT_WEBHOOK_TOKEN=secrets.token_urlsafe(32)):
                with self.assertRaises(HTTPError):deliver([])
            self.assertEqual(received,['/'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
