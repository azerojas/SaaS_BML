"""Isolated browser acceptance only. Never selected by normal development/staging/production."""
import os
from .ci import *  # noqa: F403
MFA_REQUIRED=True
MFA_OPTIONAL_ENABLED=True
MFA_ENCRYPTION_KEY=os.environ['FRONTEND_TEST_MFA_KEY']
CSRF_TRUSTED_ORIGINS=['https://localhost:4443']
SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO','https')
LOGIN_RATE_LIMIT=1000
SESSION_COOKIE_AGE=7200
PRIVACY_NOTICE_VERSION='synthetic-frontend-phase2'
PRIVACY_NOTICE_URL='https://localhost:4443/privacy/'
CATALOG_IMAGE_ALLOWED_HOSTS=['images.example.test']
# Public check-in uses the same synthetic HTTPS origin as Angular. Never used outside this harness.
DEBUG=True
CHECKIN_DEMO_MODE=True
PUBLIC_CHECKIN_URL='https://localhost:4443/registro/'
CHECKIN_PRIVACY_NOTICE_URL='https://localhost:4443/api/public/checkin/aviso-prueba/'
CHECKIN_PRIVACY_NOTICE_VERSION='synthetic-frontend-phase4'
CHECKIN_POST_IP_LIMIT=1000
CHECKIN_GET_IP_LIMIT=1000
CHECKIN_IP_DAY_LIMIT=10000
CHECKIN_PHONE_LIMIT=1000
