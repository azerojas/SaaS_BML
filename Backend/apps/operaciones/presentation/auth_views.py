import json
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST
from apps.checkin.infrastructure.abuse_protection import consume
from apps.operaciones.application import mfa
from rest_framework.exceptions import Throttled


@never_cache
@require_POST
@csrf_protect
def verify_mfa(request):
    try:
        consume([('mfa-ip',request.META.get('REMOTE_ADDR','unknown'),15,60)])
        data=json.loads(request.read(settings.DATA_UPLOAD_MAX_MEMORY_SIZE+1))
        if not isinstance(data,dict) or set(data)!={'code'} or not isinstance(data['code'],str) or not 6<=len(data['code'])<=128:raise ValueError
    except Throttled:
        return JsonResponse({'code':'mfa_locked','detail':'Demasiados intentos.'},status=429)
    except (ValueError,UnicodeError,RecursionError):
        return JsonResponse({'code':'validacion','detail':'Codigo requerido.'},status=400)
    result,status=mfa.verify(request,data['code'])
    return JsonResponse(result,status=status)
