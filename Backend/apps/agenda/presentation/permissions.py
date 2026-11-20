from rest_framework.permissions import BasePermission


class AgendaPermission(BasePermission):
    def has_permission(self,request,view):
        user=request.user
        if not user or not user.is_authenticated or not user.is_active or not user.is_staff:return False
        if request.method in ('GET','HEAD','OPTIONS'):
            if user.has_perm('agenda.view_agenda'):
                return True
            return (user.has_perm('agenda.view_own_agenda')
                    and getattr(view, 'own_agenda_read', False)
                    and getattr(view, 'action', None) in ('list', 'retrieve'))
        if user.has_perm('agenda.view_own_agenda') and not user.has_perm('agenda.view_agenda'):
            return (user.has_perm('agenda.manage_own_schedule')
                    and getattr(view, 'own_schedule_write', False)
                    and getattr(view, 'action', None) in getattr(view, 'own_schedule_actions', ('create',)))
        permission=view.action_permissions.get(view.action,'view_agenda')
        return user.has_perm('agenda.'+permission)
