import json
import os
import secrets
import subprocess
import sys
from cryptography.fernet import Fernet
from django.test import SimpleTestCase


class SettingsTests(SimpleTestCase):
    def environment(self):
        return {**os.environ,'DJANGO_ENV':'production','DJANGO_SETTINGS_MODULE':'config.settings.production',
            'SECRET_KEY':secrets.token_urlsafe(64),'DATABASE_URL':'postgresql://synthetic:synthetic@localhost:65432/unreachable',
            'MFA_ENCRYPTION_KEY':Fernet.generate_key().decode(),'ALLOWED_HOSTS':'commercial.example.test',
            'CSRF_TRUSTED_ORIGINS':'https://commercial.example.test','CORS_ALLOWED_ORIGINS':'',
            'DJANGO_DEBUG':'False','TRUST_PROXY_HTTPS':'False','DB_SSLMODE':'verify-full','CHECKIN_DEMO_MODE':'False','PRIVACY_NOTICE_URL':'https://commercial.example.test/privacy/',
            'PRIVACY_NOTICE_VERSION':'synthetic','CHECKIN_PRIVACY_NOTICE_URL':'https://commercial.example.test/privacy/',
            'CHECKIN_PRIVACY_NOTICE_VERSION':'synthetic','PUBLIC_CHECKIN_URL':'https://commercial.example.test/checkin/'}

    def run_settings(self,changes=None,remove=()):
        env=self.environment()
        env.update(changes or {})
        for key in remove:env.pop(key,None)
        code="from django.conf import settings as s; import json; print(json.dumps({'debug':s.DEBUG,'mfa':s.MFA_REQUIRED,'secure':s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE,'database':s.DATABASES['default']['NAME'],'admin':s.ADMIN_ENABLED,'proxy':getattr(s,'SECURE_PROXY_SSL_HEADER',None)}))"
        return subprocess.run([sys.executable,'-X','utf8','-c',code],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)

    def test_production_is_strict_and_never_uses_local_dotenv(self):
        result=self.run_settings()
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(json.loads(result.stdout),{'debug':False,'mfa':True,'secure':True,'database':'unreachable','admin':False,'proxy':None})
        self.assertNotEqual(self.run_settings(remove=['SECRET_KEY']).returncode,0)

    def test_insecure_flags_hosts_origins_and_key_fail_closed(self):
        for change in [{'DJANGO_DEBUG':'True'},{'ALLOWED_HOSTS':'*'},{'CSRF_TRUSTED_ORIGINS':'http://unsafe.test'},
            {'MFA_ENCRYPTION_KEY':'invalid'},{'DB_SSLMODE':'disable'},{'CHECKIN_DEMO_MODE':'True'}]:
            with self.subTest(change=change):self.assertNotEqual(self.run_settings(change).returncode,0)

    def test_trust_proxy_is_explicit_not_inferred(self):
        result=self.run_settings({'TRUST_PROXY_HTTPS':'True'})
        self.assertEqual(json.loads(result.stdout)['proxy'],['HTTP_X_FORWARDED_PROTO','https'])
