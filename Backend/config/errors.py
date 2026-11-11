from django.http import JsonResponse
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        import logging
        from rest_framework.response import Response
        logging.getLogger('beauty.operations').error('api_error',extra={'event':'api_error','error_type':type(exc).__name__,
            'request_id':getattr(context.get('request'),'request_id','')})
        from django.conf import settings
        if not settings.DEBUG and getattr(settings,'APP_ENV','development') in ('production','staging'):
            return Response({'code':'internal_error','detail':'No se pudo completar la solicitud.'},status=500)
    if response is not None:
        if isinstance(exc, ValidationError):
            response.data = {'code': 'validacion', 'detail': 'Revisa los campos.', 'errors': response.data}
        elif isinstance(exc, PermissionDenied) and str(exc.detail).startswith('CSRF Failed:'):
            # DRF SessionAuthentication 3.18 raises PermissionDenied for CSRF failures.
            # Classify the response only; enforcement stays in Django/DRF.
            response.data = {'code':'csrf','detail':'Verificacion CSRF rechazada.'}
        elif not isinstance(response.data, dict) or 'code' not in response.data:
            detail = response.data.get('detail', 'Solicitud rechazada.') if isinstance(response.data, dict) else 'Solicitud rechazada.'
            response.data = {'code': getattr(exc, 'default_code', 'error'), 'detail': detail}
    return response


def csrf_failure(request, reason=''):
    return JsonResponse({'code': 'csrf', 'detail': 'Verificacion CSRF rechazada.'}, status=403)

