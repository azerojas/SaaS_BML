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
