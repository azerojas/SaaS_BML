import json
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .throttling import consume_login_attempt


def user_data(user):
    return {'id': user.pk, 'username': user.username,
            'nombre': user.get_full_name(), 'is_staff': user.is_staff,
            'permissions': sorted(user.get_all_permissions())}


@never_cache
@require_GET
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({'detail': 'Cookie CSRF inicializada.'})


@never_cache
@require_POST
@csrf_protect
def login_view(request):
    try:
        data = json.loads(request.read(settings.DATA_UPLOAD_MAX_MEMORY_SIZE+1))
    except (ValueError, UnicodeDecodeError, RecursionError):
        return JsonResponse({'code': 'validacion', 'detail': 'JSON invalido.'}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({'code': 'validacion', 'detail': 'Se espera un objeto JSON.'}, status=400)
    if set(data)!={'username','password'}:
        return JsonResponse({'code':'validacion','detail':'Solo usuario y clave.'},status=400)
    username, password = data.get('username'), data.get('password')
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password or len(username) > 150 or len(password) > 4096:
        return JsonResponse({'code': 'validacion', 'detail': 'Usuario y clave requeridos.'}, status=400)
    if not consume_login_attempt(request, username):
        response = JsonResponse({'code': 'limite_login', 'detail': 'Demasiados intentos. Intenta mas tarde.'}, status=429)
        response['Retry-After'] = str(settings.LOGIN_RATE_WINDOW)
        return response
    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active or not user.is_staff:
        return JsonResponse({'code': 'credenciales_invalidas', 'detail': 'Credenciales invalidas.'}, status=401)
    from apps.operaciones.application.mfa import begin
    challenge=begin(request,user)
    if challenge:
        payload,status=challenge
        return JsonResponse(payload,status=status)
    login(request, user)
    return JsonResponse(user_data(user))


@api_view(['GET'])
@permission_classes([IsAdminUser])
def me(request):
    return Response(user_data(request.user))


@api_view(['GET'])
@permission_classes([IsAdminUser])
def presentation_config(request):
    return Response({'privacy_notice': {'version': settings.PRIVACY_NOTICE_VERSION,
                                       'url': settings.PRIVACY_NOTICE_URL},
                     'image_allowed_hosts': sorted(settings.CATALOG_IMAGE_ALLOWED_HOSTS)})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def logout_view(request):
    logout(request)
    return Response(status=204)

