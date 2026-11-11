from datetime import datetime, date, timezone as utc
from decimal import Decimal as D
from unittest.mock import patch
from django.db import connection,IntegrityError,transaction
from negocio import models as m
from .base import ReportTestCase,RANGE
from apps.reporting.domain.periods import ZONE


class QualityTests(ReportTestCase):
    def test_cancelled_appointment_advance_excluded_without_faking_refund(self):
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Prueba','Cita') RETURNING id")
            professional=cursor.fetchone()[0]
            cursor.execute("INSERT INTO citas(clienta_id,profesional_id,inicio_en,fin_en,precio_total) VALUES (%s,%s,'2026-10-15 10:00-05','2026-10-15 11:00-05',30) RETURNING id",[self.person.pk,professional])
            appointment=cursor.fetchone()[0]
        m.AnticiposCita.objects.create(cita_id=appointment,estado='CONFIRMADO',metodo='YAPE',referencia='CANCELADA-TEST',monto=D('30'),pagado_en=datetime(2026,10,10,tzinfo=ZONE))
        with connection.cursor() as cursor:
            cursor.execute("UPDATE citas SET estado='CANCELADA',cancelada_en=now() WHERE id=%s",[appointment])
        result=self.get_report()
        self.assertEqual(result['indicadores']['anticipos_recibidos'],'0.00')
        self.assertIsNone(result['indicadores']['dinero_recaudado'])
        self.assertIn('ANTICIPOS_CITA_TERMINAL_EXCLUIDOS_SIN_INFERIR_REEMBOLSO',result['calidad']['advertencias'])
        self.assertEqual(m.AnticiposCita.objects.get().estado,'CONFIRMADO')

    def test_existing_database_constraints_reject_confirmed_sources_without_date(self):
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.Ventas.objects.create(estado='CONFIRMADA')
        self.assertEqual(self.get_report()['indicadores']['numero_ventas'],0)

    def test_legacy_service_empty_consumptions_are_not_assumed_free(self):
        sale,_=self.dated_sale(service=True)
        m.Auditoria.objects.filter(entidad='ventas',entidad_id=str(sale),accion='CONFIRMAR_VENTA').delete()
        result=self.get_report()
        self.assertIsNone(result['indicadores']['costo_directo'])
        self.assertIsNone(result['indicadores']['utilidad_estimada'])

    def test_global_discount_one_cent_allocation_and_three_decimal_quantity(self):
        first=self.service(price='1.00')
        second=self.service(price='1.00')
        visit=self.visit()
        sale=self.sale([self.service_line(first),self.service_line(second)],visit,descuento_global='0.01')
        groups=[{'detalle_id':row['id'],'insumos':[]} for row in self.detail(sale)['lineas']]
        self.assertEqual(self.confirm(sale,groups).status_code,200)
        when=datetime(2026,10,15,tzinfo=ZONE)
        m.Ventas.objects.filter(pk=sale).update(confirmada_en=when)
        m.Visitas.objects.filter(pk=visit).update(inicio_en=when,fin_en=when)
        ranked=self.get_report('top-services')['results']
        amounts={row['servicio_id']:D(row['ingreso']) for row in ranked}
        self.assertEqual(amounts[first.pk],D('0.99'))
        self.assertEqual(amounts[second.pk],D('1.00'))
        self.assertEqual(self.get_report()['indicadores']['ventas_confirmadas'],'1.99')

    def test_service_filter_is_single_exists_not_multi_join(self):
        sale,service=self.dated_sale(service=True,payment='10')
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Prueba','Otra') RETURNING id")
            professional=cursor.fetchone()[0]
        # Another line matching only the professional must not satisfy service+professional together.
        other=self.service()
        m.DetallesVenta.objects.create(venta_id=sale,tipo='SERVICIO',servicio=other,profesional_id=professional,descripcion_snapshot='Otra',cantidad=D('1'),precio_unitario=D('0'))
        result=self.get_report(query=RANGE+'&servicio_id='+str(service.pk)+'&profesional_id='+str(professional))
        self.assertEqual(result['indicadores']['numero_ventas'],0)

    def test_inactive_and_provisional_client_indicators_excluded(self):
        today=__import__('django.utils.timezone',fromlist=['localdate']).localdate(timezone=ZONE)
        m.Clientas.objects.filter(pk=self.person.pk).update(fecha_nacimiento=today.replace(year=2000))
        m.Auditoria.objects.create(entidad='clientas',entidad_id=str(self.person.pk),accion='ALTA_QR_PROVISIONAL',datos={},creada_en=datetime.now(utc.utc))
        self.assertEqual(self.get_report()['indicadores']['cumpleanios_proximos'],0)
        self.assertEqual(self.get_report()['indicadores']['clientas_inactivas'],0)
        m.Auditoria.objects.create(entidad='clientas',entidad_id=str(self.person.pk),accion='VALIDAR_ALTA_QR',datos={},creada_en=datetime.now(utc.utc))
        self.assertEqual(self.get_report()['indicadores']['cumpleanios_proximos'],1)
