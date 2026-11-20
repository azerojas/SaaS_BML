"""Production-settings static checks with ephemeral keys, unreachable DB, and no SQL/deploy."""
import os
from pathlib import Path
import secrets
import subprocess
import sys
from cryptography.fernet import Fernet

root=Path(__file__).resolve().parents[1]
environment={**os.environ,'DJANGO_ENV':'production','DJANGO_SETTINGS_MODULE':'config.settings.production',
 'SECRET_KEY':secrets.token_urlsafe(64),'MFA_ENCRYPTION_KEY':Fernet.generate_key().decode(),
 'DATABASE_URL':'postgresql://build_only@127.0.0.1:1/build_only','DB_SSLMODE':'verify-full',
 'ALLOWED_HOSTS':'acceptance.example.test','CSRF_TRUSTED_ORIGINS':'https://acceptance.example.test',
 'PRIVACY_NOTICE_URL':'https://acceptance.example.test/privacy/','PRIVACY_NOTICE_VERSION':'synthetic-check-only',
 'PUBLIC_CHECKIN_URL':'https://acceptance.example.com/registro/','CHECKIN_PRIVACY_NOTICE_URL':'https://acceptance.example.com/privacy/','CHECKIN_PRIVACY_NOTICE_VERSION':'synthetic-check-only',
 'CHECKIN_DEMO_MODE':'False','DJANGO_DEBUG':'False','TRUST_PROXY_HTTPS':'True','HSTS_SECONDS':'31536000'}
raise SystemExit(subprocess.call([sys.executable,'manage.py','check','--deploy','--fail-level','ERROR'],cwd=root,env=environment))
