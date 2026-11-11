from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.views.decorators.cache import never_cache
from django.utils import timezone
from rest_framework.decorators import api_view,permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from apps.operaciones.application.health import readiness
from apps.operaciones.domain.alerts import stale_jobs
from apps.operaciones.models import JobState


@never_cache
@require_GET
def live(request):
    return JsonResponse({'status':'live'})


@never_cache
@require_GET
def ready(request):
    ok=readiness()
    return JsonResponse({'status':'ready' if ok else 'not_ready'},status=200 if ok else 503)


class OperationsPermission(BasePermission):
    def has_permission(self,request,view):
        u=request.user
        return bool(u and u.is_authenticated and u.is_active and u.is_staff and u.has_perm('operaciones.view_operations'))


@api_view(['GET'])
@permission_classes([OperationsPermission])
def status(request):
    if not readiness():
        return Response({'detail':'Operación no disponible; revise las migraciones y la base de datos.'},status=503)
    states=list(JobState.objects.values('key','status','started_at','finished_at','last_success_at'))
    return Response({'jobs':states,'alerts':stale_jobs({row['key']:row for row in states},timezone.now())})
