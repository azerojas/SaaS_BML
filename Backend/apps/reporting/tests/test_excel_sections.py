from datetime import datetime
from decimal import Decimal
import uuid
from django.contrib.auth.models import Permission
from negocio import models as m
from apps.finanzas.models import Refund
from apps.reporting.domain.periods import ZONE
from .test_excel import ExcelTests
from .base import ReportTestCase


class ExcelSectionTests(ReportTestCase):
    workbook=ExcelTests.workbook
    def make_visit(self,name,start='2026-10-15T10:00:00',state='ABIERTA'):
        client=m.Clientas.objects.create(nombres=name,apellidos='Prueba',telefono='+51988000'+str(m.Clientas.objects.count()).zfill(3),activa=True)
        when=datetime.fromisoformat(start).replace(tzinfo=ZONE)
        return m.Visitas.objects.create(clienta=client,inicio_en=when,estado=state,
            fin_en=when if state=='FINALIZADA' else None)

    def test_all_visitors_are_included_even_without_sale_and_end_date_is_exclusive(self):
        first=self.make_visit('Sin pago','2026-10-01T00:00:00')
        self.make_visit('Finalizada sin venta','2026-10-31T23:59:00','FINALIZADA')
        self.make_visit('Fuera del período','2026-11-01T00:00:00')
        workbook=self.workbook()
        rows=list(workbook['Visitas'].iter_rows(min_row=5,values_only=True))
        self.assertEqual([row[1] for row in rows],['Sin pago Prueba','Finalizada sin venta Prueba'])
        self.assertEqual(rows[0][2],datetime(2026,10,1))
        self.assertEqual(rows[0][4],'Abierta')
        self.assertEqual(rows[1][4],'Finalizada')
        self.assertEqual(rows[0][0],first.pk)
        self.assertFalse(m.Ventas.objects.exists())

    def test_visitor_list_is_not_truncated_by_client_ranking_limit(self):
        self.make_visit('Primera')
        self.make_visit('Segunda')
        workbook=self.workbook('top-clients',query='?desde=2026-10-01&hasta=2026-11-01&limit=1')
        self.assertEqual(workbook['Visitas'].max_row,6)

    def test_financial_export_does_not_grant_access_to_visitor_names(self):
        self.make_visit('Persona reservada')
        self.staff.user_permissions.add(*Permission.objects.filter(content_type__app_label='reporting',codename__in=['view_summary','export']))
        self.client.force_authenticate(self.staff)
        workbook=self.workbook()
        self.assertNotIn('Visitas',workbook.sheetnames)
        self.assertFalse(any('Persona reservada' in str(cell.value) for sheet in workbook for row in sheet for cell in row))

    def test_workbook_uses_business_labels_and_has_no_technical_metadata(self):
        self.dated_sale(service=True)
        workbook=self.workbook()
        forbidden={'desde','hasta','hasta_exclusiva','timezone','moneda','granularidad','filtros','alcance_ventas','generado_en'}
        self.assertFalse(any(cell.value in forbidden for sheet in workbook for row in sheet for cell in row))
        self.assertFalse(any('_' in str(cell.value) for sheet in workbook for row in sheet for cell in row if isinstance(cell.value,str)))
        self.assertEqual(workbook['Resumen']['A2'].value,'Del 01/10/2026 al 31/10/2026')
        self.assertEqual(workbook['Ingresos']['B4'].value,'Ventas confirmadas')

    def test_requested_treatment_without_sale_is_shown_separately_from_billed_quantity(self):
        service=self.service()
        professional=m.Profesionales.objects.create(nombres='Ana',apellidos='Prueba',activa=True)
        start=datetime(2026,10,15,10,tzinfo=ZONE)
        appointment=m.Citas.objects.create(clienta=self.person,profesional=professional,estado='CONFIRMADA',
            inicio_en=start,fin_en=start.replace(hour=11),duracion_total_minutos=60,precio_total=Decimal('55.00'))
        m.CitaServicios.objects.create(cita=appointment,servicio=service,orden=1,duracion_minutos=60,precio_snapshot=Decimal('55.00'))
        workbook=self.workbook()
        row=list(workbook['Tratamientos'].iter_rows(min_row=5,values_only=True))[0]
        self.assertEqual(row[0],service.nombre)
        self.assertEqual(row[1:],(0,1,1,0,0,0))
        # A reservation received in October for a later visit is still October demand.
        m.Citas.objects.filter(pk=appointment.pk).update(creada_en=start,inicio_en=start.replace(month=11),fin_en=start.replace(month=11,hour=11))
        workbook=self.workbook()
        row=list(workbook['Tratamientos'].iter_rows(min_row=5,values_only=True))[0]
        self.assertEqual(row[1:4],(1,0,0))

    def test_expenses_and_refunds_are_separate_from_income_and_not_double_counted(self):
        sale,_=self.dated_sale(payment='5.00')
        when=datetime(2026,10,15,12,tzinfo=ZONE)
        category=m.CategoriasGasto.objects.create(nombre='Alquiler')
        m.GastosOperativos.objects.create(categoria=category,descripcion='No exportar notas',monto=Decimal('7.00'),fecha=when.date(),creado_en=when)
        Refund.objects.create(pago_id=m.Pagos.objects.get(venta_id=sale).pk,monto=Decimal('2.00'),metodo='EFECTIVO',
            motivo='No exportar referencias privadas',clave_operacion=uuid.uuid4(),creada_en=when,creado_por=self.admin)
        workbook=self.workbook()
        rows=list(workbook['Egresos'].iter_rows(min_row=5,values_only=True))
        self.assertEqual(sum(row[5] for row in rows),9)
        self.assertEqual({row[1] for row in rows},{'Gasto operativo','Reembolso'})
        self.assertFalse(any('No exportar' in str(cell.value) for sheet in workbook for row in sheet for cell in row))
