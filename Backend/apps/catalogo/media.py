import ipaddress
from urllib.parse import urlsplit
from django.conf import settings
from rest_framework.exceptions import ValidationError


def validate_image_url(value):
    try:
        parts = urlsplit(value)
        host = (parts.hostname or '').lower()
        if parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None, 443) or parts.fragment:
            raise ValueError
        if not host or host == 'localhost' or host.endswith(('.local', '.internal', '.localhost')):
            raise ValueError
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError
        if host not in {h.lower() for h in settings.CATALOG_IMAGE_ALLOWED_HOSTS}:
            raise ValueError
    except (ValueError, UnicodeError):
        raise ValidationError('Usa una URL HTTPS de un dominio de imagenes aprobado.') from None
    return value


def public_image_url(value):
    if not value:
        return None
    try:
        return validate_image_url(value)
    except ValidationError:
        return None

