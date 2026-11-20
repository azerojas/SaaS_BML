class PrivateApiCacheMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, private'
        return response


class FrontendContractMiddleware:
    """Fail closed for incompatible writes. GET recovery remains available across releases."""
    def __init__(self, get_response):
        self.get_response=get_response

    def __call__(self, request):
        from django.conf import settings
        from django.http import JsonResponse
        version=getattr(settings,'FRONTEND_CONTRACT_VERSION','')
        if version and request.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS') and request.headers.get('X-Beauty-Contract')!=version:
            # 503 deliberately preserves UUIDs in older clients after uncertain writes.
            return JsonResponse({'code':'APP_UPDATE_REQUIRED','detail':'Actualiza la aplicacion antes de registrar operaciones.'},status=503)
        return self.get_response(request)
