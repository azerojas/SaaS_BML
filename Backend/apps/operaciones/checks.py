from django.conf import settings
from django.core.checks import Error,register


@register(deploy=True)
def deployment_policy(app_configs,**kwargs):
    if settings.APP_ENV not in ('production','staging'):return []
    errors=[]
    if not settings.MFA_REQUIRED:errors.append(Error('MFA obligatorio para personal administrativo.',id='operations.E001'))
    if settings.DATABASES['default']['OPTIONS'].get('sslmode')!='verify-full':
        errors.append(Error('Validar certificado y hostname PostgreSQL con verify-full antes de GO.',id='operations.E002'))
    if settings.ADMIN_ENABLED:errors.append(Error('Admin generico deshabilitado en entorno comercial.',id='operations.E003'))
    if not settings.PRIVACY_NOTICE_URL.startswith('https://') or not settings.PRIVACY_NOTICE_VERSION:
        errors.append(Error('Falta aviso real de privacidad versionado HTTPS.',id='operations.E004'))
    return errors
