from rest_framework.permissions import BasePermission

REPORT_PERMISSIONS={'top-clients':'view_clients','inventory-alerts':'view_inventory'}


class ReportingPermission(BasePermission):
    def has_permission(self, request, view):
        user=request.user
        if not user or not user.is_authenticated or not user.is_active or not user.is_staff: return False
        report=request.query_params.get('report','overview') if view.report=='export' else view.report
        required=[REPORT_PERMISSIONS.get(report,'view_summary')]
        if view.report=='export': required.append('export')
        if view.report=='clients-retention': required=['view_clients']
        return all(user.has_perm('reporting.'+permission) for permission in required)
