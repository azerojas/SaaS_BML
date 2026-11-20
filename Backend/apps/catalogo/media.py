import ipaddress
import re
from urllib.parse import urlsplit
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.conf import settings
from rest_framework.exceptions import ValidationError


def local_photo(value):
    return isinstance(value, str) and re.fullmatch(r'/api/catalogo/fotos/[0-9a-f]{32}\.jpg', value) is not None


def validate_image_url(value):
    if local_photo(value):
        from .models import UploadedPhoto
        from uuid import UUID
        if UploadedPhoto.objects.filter(pk=UUID(value.rsplit('/', 1)[1][:-4])).exists():
            return value
        raise ValidationError('La fotografía subida no está disponible.')
    try:
        URLValidator(schemes=['https'])(value)
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
    except (ValueError, UnicodeError, DjangoValidationError):
        raise ValidationError('Usa una URL HTTPS de un dominio de imagenes aprobado.') from None
    return value


def public_image_url(value):
    if not value:
        return None
    if local_photo(value):
        return value
    try:
        return validate_image_url(value)
    except ValidationError:
        return None

