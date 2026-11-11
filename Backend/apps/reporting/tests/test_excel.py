from io import BytesIO
from unittest.mock import patch
from openpyxl import load_workbook
from django.db import connection
from django.contrib.auth.models import Permission
from negocio import models as m
from .base import ReportTestCase,RANGE

EXPORT='/api/v1/reports/export.xlsx'


class ExcelTests(ReportTestCase):
    def test_client_only_export_does_not_expose_general_financial_summary(self):
        self.dated_sale(service=True)
        self.staff.user_permissions.add(*Permission.objects.filter(content_type__app_label='reporting',codename__in=['view_clients','export']))
        self.client.force_authenticate(self.staff)
        workbook=self.workbook('top-clients')
        labels={row[0].value for row in workbook['Resumen'].iter_rows(min_row=2)}
        self.assertNotIn('utilidad_estimada',labels)
        self.assertNotIn('costo_directo',labels)
        self.assertEqual(workbook['Clientas']['B2'].value,'Daniela Ficticia')
        self.assertEqual(self.client.get('/api/v1/analytics/overview/'+RANGE).status_code,403)

    def workbook(self, report='overview', query=RANGE):
        response=self.client.get(EXPORT+query+'&report='+report)
        self.assertEqual(response.status_code,200,getattr(response,'data',None))
        self.assertEqual(response['Content-Type'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertIn('attachment; filename="beauty_manager_reporte_',response['Content-Disposition'])
        self.assertIn('no-store',response['Cache-Control'])
        return load_workbook(BytesIO(response.content),data_only=False)

    def test_numeric_excel_totals_equal_dashboard_and_audit_does_not_store_pii(self):
        self.dated_sale(payment='5.00')
        report=self.get_report()
        workbook=self.workbook()
        self.assertEqual(workbook.sheetnames,['Resumen','Ingresos'])
        sheet=workbook['Ingresos']
        values={row[0].value:row[1] for row in sheet.iter_rows(min_row=2)}
        self.assertEqual(str(values['ventas_confirmadas'].value),str(int(report['indicadores']['ventas_confirmadas'].split('.')[0])))
        self.assertEqual(values['ventas_confirmadas'].data_type,'n')
        self.assertIn('S/',values['ventas_confirmadas'].number_format)
        self.assertIsNone(values['dinero_recaudado'].value)
        self.assertEqual(sheet.freeze_panes,'A2')
        self.assertTrue(sheet.auto_filter.ref)
        audit=m.Auditoria.objects.get(entidad='reporting',accion='EXPORTAR_XLSX')
        self.assertNotIn('Daniela',str(audit.datos))
        self.assertNotIn('telefono',str(audit.datos))
        self.assertEqual(m.Pagos.objects.count(),1)

    def test_client_formula_injection_is_literal_text_even_with_whitespace(self):
        self.dated_sale(service=True)
        for index,attack in enumerate(['=HYPERLINK("https://example.com")','  +SUM(1,1)','\t-1+2','\r@SUM(1,1)']):
            m.Clientas.objects.filter(pk=self.person.pk).update(nombres=attack)
            workbook=self.workbook('top-clients')
            cell=workbook['Clientas']['B2']
            self.assertEqual(cell.data_type,'s')
            self.assertTrue(cell.quotePrefix)
            self.assertTrue(cell.value.startswith(attack.replace('\r','\n')))
            self.assertIsNone(cell.hyperlink)
            self.assertFalse(any(cell.data_type=='f' for ws in workbook for row in ws for cell in row))
        self.assertEqual(m.Auditoria.objects.filter(entidad='reporting').count(),4)

    def test_all_report_types_are_valid_and_have_expected_sheets(self):
        for report,sheet in [('revenue-series','Ingresos'),('payment-methods','Pagos'),('top-services','Servicios'),('expenses','Gastos'),('inventory-alerts','Inventario')]:
            workbook=self.workbook(report)
            self.assertEqual(workbook.sheetnames,['Resumen',sheet])

    def test_unknown_report_filters_limits_and_success_rate(self):
        for suffix in ['&report=../../../private','&report=top-clients&limit=101','&report=overview&page=2','&report=overview&metodo=EFECTIVO']:
            self.assertEqual(self.client.get(EXPORT+RANGE+suffix).status_code,400)
        for _ in range(5):self.workbook()
        response=self.client.get(EXPORT+RANGE+'&report=overview')
        self.assertEqual(response.status_code,429)
        self.assertEqual(m.Auditoria.objects.filter(entidad='reporting').count(),5)

    def test_failed_file_generation_does_not_create_export_audit(self):
        with patch('apps.reporting.application.exports.build_workbook',side_effect=RuntimeError('Fallo controlado')):
            with self.assertRaises(RuntimeError):self.client.get(EXPORT+RANGE+'&report=overview')
        self.assertFalse(m.Auditoria.objects.filter(entidad='reporting').exists())

    def test_export_rows_are_bounded(self):
        from apps.reporting.domain.errors import ReportError
        self.dated_sale()
        with patch('apps.reporting.infrastructure.excel_export.MAX_EXPORT_ROWS',0):
            response=self.client.get(EXPORT+RANGE+'&report=overview')
            self.assertEqual(response.status_code,422)
        self.assertFalse(m.Auditoria.objects.filter(entidad='reporting').exists())
