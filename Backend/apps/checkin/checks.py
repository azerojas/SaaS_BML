from urllib.parse import urlsplit
from django.conf import settings
from django.core.checks import Error, register


@register()
def checkin_settings_checks(app_configs, **kwargs):
    errors = []
    for name in ('CHECKIN_PENDING_TTL_MINUTES', 'CHECKIN_APPOINTMENT_WINDOW_MINUTES'):
        if not 1 <= getattr(settings, name) <= 1440:
            errors.append(Error(name + ' debe estar entre 1 y 1440.', id='checkin.E004'))
    for name in ('CHECKIN_POST_IP_LIMIT', 'CHECKIN_GET_IP_LIMIT', 'CHECKIN_IP_DAY_LIMIT', 'CHECKIN_PHONE_LIMIT'):
        if getattr(settings, name) < 1:
            errors.append(Error(name + ' debe ser positivo.', id='checkin.E005'))
    return errors


@register(deploy=True)
def checkin_deployment_checks(app_configs, **kwargs):
    errors = []
    if settings.CHECKIN_DEMO_MODE:
        errors.append(Error('El aviso de check-in es de prueba.', hint='Configura aviso y formulario reales; desactiva CHECKIN_DEMO_MODE.', id='checkin.E001'))
    for key in ('PUBLIC_CHECKIN_URL', 'CHECKIN_PRIVACY_NOTICE_URL'):
        value = getattr(settings, key)
        try:
            parts = urlsplit(value)
        except ValueError:
            errors.append(Error(key + ' no es una URL valida.', id='checkin.E002'))
            continue
        if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.fragment:
            errors.append(Error(key + ' requiere una URL HTTPS publica.', id='checkin.E002'))
    if not settings.CHECKIN_PRIVACY_NOTICE_VERSION:
        errors.append(Error('Falta la version del aviso de check-in.', id='checkin.E003'))
    return errors

