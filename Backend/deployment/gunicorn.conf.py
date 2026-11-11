import os

bind='0.0.0.0:'+os.environ.get('PORT','8000')
workers=int(os.environ.get('WEB_WORKERS','2'))
if not 1<=workers<=4:raise ValueError('WEB_WORKERS entre1 y4.')
worker_class='gthread'
threads=2
timeout=45
graceful_timeout=30
keepalive=5
max_requests=1000
max_requests_jitter=100
accesslog=None
errorlog='-'
capture_output=True
forwarded_allow_ips='*' if os.environ.get('TRUST_PROXY_HTTPS')=='True' else '127.0.0.1'
# Network exposure must be restricted to Railway's trusted proxy before enabling forwarded headers.
limit_request_line=4094
limit_request_fields=50
limit_request_field_size=8190
logger_class='apps.operaciones.infrastructure.gunicorn.SafeLogger'
