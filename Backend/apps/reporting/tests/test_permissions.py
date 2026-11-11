from unittest.mock import patch
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient
from apps.reporting.domain.errors import ReportError
from .base import ReportTestCase,BASE,RANGE


class PermissionTests(ReportTestCase):
    def routes(self):
        return [BASE+name+'/'+RANGE for name in ['overview','revenue-series','payment-methods','top-services','top-clients','inventory-alerts','expenses','clients/retention']]+[
            BASE+'month-comparison/?month=2026-10','/api/v1/reports/export.xlsx?report=overview&desde=2026-10-01&hasta=2026-11-01']

    def test_every_report_rejects_anonymous_nonstaff_and_staff_without_permissions(self):
        for user in [None,self.regular,self.staff]:
            client=APIClient()
            if user:client.force_authenticate(user)
            for route in self.routes():
                with self.subTest(route=route,user=user):self.assertEqual(client.get(route).status_code,403)

    def test_summary_does_not_grant_clients_inventory_or_export(self):
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='reporting',codename='view_summary'))
        self.client.force_authenticate(self.staff)
        self.get_report('overview')
        for name in ['top-clients','inventory-alerts','clients/retention']:self.get_report(name,status=403)
        response=self.client.get('/api/v1/reports/export.xlsx?report=overview')
        self.assertEqual(response.status_code,403)

    def test_export_permission_alone_does_not_grant_report_or_pii(self):
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='reporting',codename='export'))
        self.client.force_authenticate(self.staff)
        for report in ['overview','top-clients','inventory-alerts']:
            self.assertEqual(self.client.get('/api/v1/reports/export.xlsx?report='+report).status_code,403)

    def test_read_only_api_and_cache_headers(self):
        response=self.client.get(BASE+'overview/'+RANGE)
        self.assertEqual(response['Cache-Control'],'no-store, private')
        self.assertEqual(self.client.post(BASE+'overview/',{},format='json').status_code,405)
        self.assertEqual(self.client.delete(BASE+'overview/').status_code,405)

    def test_unactivated_permissions_return_503_only_after_access_check(self):
        with patch('apps.reporting.presentation.views.ensure_ready',side_effect=ReportError('fase6_permisos_pendientes','Pendiente','unavailable')):
            self.get_report(status=503)
            self.client.force_authenticate(self.staff)
            self.get_report(status=403)
