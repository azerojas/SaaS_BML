from rest_framework.permissions import BasePermission


class AgendaPermission(BasePermission):
    def has_permission(self,request,view):
        user=request.user
        if not user or not user.is_authenticated or not user.is_active or not user.is_staff:return False
        permission='view_agenda' if request.method in ('GET','HEAD','OPTIONS') else view.action_permissions.get(view.action,'view_agenda')
        return user.has_perm('agenda.'+permission)
