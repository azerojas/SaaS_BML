from rest_framework.permissions import BasePermission


class FinancePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active or not user.is_staff:
            return False
        permission = view.action_permissions.get(view.action, 'view_finance')
        return user.has_perm('finanzas.' + permission)

