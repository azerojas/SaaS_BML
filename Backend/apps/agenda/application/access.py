"""Scope individual agenda access at the database, independently of UI filters."""
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from negocio import models as m


def own_professional(user):
    if user.has_perm('agenda.view_agenda'):
        return None
    if not user.has_perm('agenda.view_own_agenda'):
        raise PermissionDenied()
    identifier = m.Profesionales.objects.filter(usuario_id=user.pk, activa=True).values_list('pk', flat=True).first()
    if identifier is None:
        raise PermissionDenied('Tu cuenta no tiene una especialista activa vinculada. Contacta a la administración.')
    return identifier


def scope_rows(queryset, kind, user):
    identifier = own_professional(user)
    if identifier is None:
        return queryset
    if kind == 'profesionales':
        return queryset.filter(pk=identifier)
    if kind in ('bloqueos', 'daily'):
        return queryset.filter(Q(profesional_id=identifier) | Q(profesional_id__isnull=True))
    if kind in ('citas', 'horarios'):
        return queryset.filter(profesional_id=identifier)
    raise PermissionDenied()
