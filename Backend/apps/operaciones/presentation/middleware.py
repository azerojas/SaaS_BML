import logging
import time
import uuid
import re
from django.conf import settings
from django.http import JsonResponse

log=logging.getLogger('beauty.operations')


class RequestSecurityMiddleware:
    def __init__(self,get_response):self.get_response=get_response
    def __call__(self,request):
        request.request_id=uuid.uuid4().hex
        start=time.perf_counter()
        try:
            size=int(request.META.get('CONTENT_LENGTH') or 0)
        except (TypeError,ValueError):size=-1
        photo = (request.method in ('POST', 'PATCH') and request.content_type == 'multipart/form-data'
                 and re.fullmatch(r'/api/admin/catalogo/servicios/(?:[1-9]\d*/)?', request.path))
        limit = (settings.CATALOG_PHOTO_MAX_BYTES + settings.DATA_UPLOAD_MAX_MEMORY_SIZE + 2048
                 if photo else settings.DATA_UPLOAD_MAX_MEMORY_SIZE)
        if size<0 or size>limit:
            response=JsonResponse({'code':'request_too_large','detail':'Solicitud demasiado grande.'},status=413)
        else:response=self.get_response(request)
        response['X-Request-ID']=request.request_id
        response.setdefault('Referrer-Policy','no-referrer')
        response.setdefault('Permissions-Policy','camera=(), microphone=(), geolocation=()')
        if request.path.startswith(('/api/','/health/')):
            response.setdefault('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if request.path.startswith('/api/'):response['Cache-Control']='no-store, private'
        route=getattr(getattr(request,'resolver_match',None),'route',None) or 'unresolved'
        log.info('request',extra={'event':'http_request','request_id':request.request_id,'route':route,
            'method':request.method[:8],'status':response.status_code,'duration_ms':round((time.perf_counter()-start)*1000,3)})
        return response


class MFAGateMiddleware:
    def __init__(self,get_response):self.get_response=get_response
    def __call__(self,request):
        from apps.operaciones.application.mfa import session_valid
        if settings.MFA_REQUIRED and request.path.startswith(('/api/','/admin/')) and request.path not in (
            '/api/auth/csrf/','/api/auth/login/','/api/auth/mfa/verify/','/api/auth/logout/'):
            if request.user.is_authenticated and not session_valid(request):
                return JsonResponse({'code':'mfa_required','detail':'Segundo factor requerido.'},status=403)
        return self.get_response(request)
