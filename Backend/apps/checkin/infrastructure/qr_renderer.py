from io import BytesIO
from urllib.parse import urlsplit
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
import segno


def checkin_url(token):
    root = settings.PUBLIC_CHECKIN_URL
    parts = urlsplit(root)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ImproperlyConfigured('PUBLIC_CHECKIN_URL invalida.')
    if not settings.CHECKIN_DEMO_MODE and parts.scheme != 'https':
        raise ImproperlyConfigured('El enlace de check-in real requiere HTTPS.')
    return root.rstrip('/') + '/' + str(token) + '/'


def render_qr(token, format='svg'):
    if format not in ('svg', 'png'):
        raise ValueError('Unsupported QR format.')
    output = BytesIO()
    qr = segno.make_qr(checkin_url(token), error='m')
    qr.save(output, kind=format, scale=8, border=4)
    return output.getvalue()

