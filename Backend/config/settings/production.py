import os
from urllib.parse import urlsplit
from django.core.exceptions import ImproperlyConfigured
os.environ['DJANGO_ENV'] = 'production'
from .base import *  # noqa: F403,E402

APP_ENV = 'production'
FRONTEND_CONTRACT_VERSION = '1'
DEBUG = False
if env.bool('DJANGO_DEBUG', default=False):  # noqa: F405
    raise ImproperlyConfigured('DEBUG no esta permitido en produccion.')
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 12 or SECRET_KEY.startswith(('django-insecure', 'REEMPLAZAR', 'CHANGE')):  # noqa: F405
    raise ImproperlyConfigured('SECRET_KEY requiere un secreto aleatorio independiente.')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS')  # noqa: F405
if not ALLOWED_HOSTS or any('*' in host or host.startswith('.') or '/' in host for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured('ALLOWED_HOSTS debe contener hosts exactos.')
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS')  # noqa: F405
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[])  # noqa: F405
for origin in CSRF_TRUSTED_ORIGINS + CORS_ALLOWED_ORIGINS:
    parsed=urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or '*' in origin or parsed.username or parsed.path not in ('','/'):
        raise ImproperlyConfigured('Origenes deben ser HTTPS exactos, sin credenciales.')
if not CSRF_TRUSTED_ORIGINS:
    raise ImproperlyConfigured('Falta el origen HTTPS autorizado.')
DATABASES = {'default': env.db('DATABASE_URL')}  # noqa: F405
DATABASES['default']['CONN_MAX_AGE'] = 60
DATABASES['default']['CONN_HEALTH_CHECKS'] = True
DATABASES['default']['OPTIONS'] = {
    'connect_timeout': 5,
    'sslmode': env('DB_SSLMODE', default='verify-full'),  # noqa: F405
    'options': '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000',
}
if env('DB_SSLROOTCERT', default=''):  # noqa: F405
    DATABASES['default']['OPTIONS']['sslrootcert'] = env('DB_SSLROOTCERT')  # noqa: F405
if DATABASES['default']['OPTIONS']['sslmode'] not in ('require','verify-ca','verify-full'):
    raise ImproperlyConfigured('La conexion de base debe exigir TLS.')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_AGE = 7200
SECURE_SSL_REDIRECT = True
SECURE_REDIRECT_EXEMPT = [r'^health/live$',r'^health/ready$']
SECURE_HSTS_SECONDS = env.int('HSTS_SECONDS', default=3600)  # noqa: F405
SECURE_HSTS_PRELOAD = False
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
if env.bool('TRUST_PROXY_HTTPS', default=False):  # noqa: F405
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO','https')
USE_X_FORWARDED_HOST = False
ADMIN_ENABLED = False
MFA_REQUIRED = True
MFA_OPTIONAL_ENABLED = True
MFA_ENCRYPTION_KEY = env('MFA_ENCRYPTION_KEY')  # noqa: F405
from cryptography.fernet import Fernet
try: Fernet(MFA_ENCRYPTION_KEY.encode())
except (ValueError,TypeError): raise ImproperlyConfigured('MFA_ENCRYPTION_KEY debe ser una clave Fernet valida.') from None
CHECKIN_DEMO_MODE = False
if env.bool('CHECKIN_DEMO_MODE', default=False):  # noqa: F405
    raise ImproperlyConfigured('No se permite modo QR ficticio en produccion.')
ALLOW_MAINTENANCE_JOBS = env.bool('ALLOW_MAINTENANCE_JOBS', default=False)  # noqa: F405
MIDDLEWARE.insert(MIDDLEWARE.index('django.middleware.security.SecurityMiddleware')+1,'whitenoise.middleware.WhiteNoiseMiddleware')  # noqa: F405
STORAGES = {
    'default': {'BACKEND':'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND':'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
LOGGING = {
    'version':1,'disable_existing_loggers':False,
    'formatters':{'safe_json':{'()':'apps.operaciones.infrastructure.logging.SafeJSONFormatter'}},
    'handlers':{'console':{'class':'logging.StreamHandler','formatter':'safe_json'}},
    'root':{'handlers':['console'],'level':'INFO'},
    'loggers':{'django':{'handlers':['console'],'level':'WARNING','propagate':False}},
}
