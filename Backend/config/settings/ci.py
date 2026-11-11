import os
os.environ['DJANGO_ENV'] = 'ci'
from .base import *  # noqa: F403,E402
APP_ENV = 'ci'
DEBUG = False
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CHECKIN_DEMO_MODE = False
PUBLIC_CHECKIN_URL = 'https://app.example.test/checkin/'
CHECKIN_PRIVACY_NOTICE_URL = 'https://app.example.test/privacy/'
CHECKIN_PRIVACY_NOTICE_VERSION = 'synthetic-ci'
