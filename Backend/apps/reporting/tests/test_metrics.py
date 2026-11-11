from datetime import datetime, timedelta
from decimal import Decimal as D
from django.db import connection
from django.utils import timezone
from negocio import models as m
from apps.finanzas.models import AdvanceApplication
from .base import ReportTestCase,BASE,RANGE
from apps.reporting.domain.periods import ZONE
import uuid


class MetricTests(ReportTestCase):
    def test_empty_range_zero_and_blocked_net_cash(self):
        result=self.get_report()
        self.assertEqual(result['indicadores']['ventas_confirmadas'],'0.00')
        self.assertEqual(result['indicadores']['ticket_promedio'],'0.00')
        self.assertEqual(result['indicadores']['utilidad_estimada'],'0.00')
        self.assertIsNone(result['indicadores']['dinero_recaudado'])
        self.assertFalse(result['calidad']['recaudacion_conciliada'])

    def test_multiple_lines_discounts_actual_costs_commission_and_expenses(self):
        visit=self.visit()
        service=self.service()
        product=self.product()
        supply=self.product(kind='INSUMO',cost='2.0000')
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO profesionales(nombres,apellidos,comision_porcentaje) VALUES ('Prueba','Persona',10) RETURNING id")
            professional=cursor.fetchone()[0]
        sale=self.sale([self.service_line(service,descuento_linea='10.00',profesional_id=professional),self.product_line(product,'2.000')],visit,descuento_global='10.00',propina='5.00')
        detail=self.detail(sale)['lineas'][0]['id']
        self.assertEqual(self.confirm(sale,[{'detalle_id':detail,'insumos':[{'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'0.300'}]}]).status_code,200)
        when=datetime(2026,10,15,12,tzinfo=ZONE)
        m.Ventas.objects.filter(pk=sale).update(confirmada_en=when)
        m.Visitas.objects.filter(pk=visit).update(inicio_en=when,fin_en=when)
        for amount in ['10.00','20.00']:
            self.assertEqual(self.pay(sale,amount).status_code,201)
        m.Pagos.objects.all().update(pagado_en=when)
        category=m.CategoriasGasto.objects.create(nombre='Alquiler')
        m.GastosOperativos.objects.create(categoria=category,descripcion='Ficticio',monto=D('7'),fecha=when.date(),creado_en=when)
        result=self.get_report()['indicadores']
        expected={'ventas_confirmadas':'105.00','ingreso_por_servicios':'63.64','ingreso_por_productos':'36.36','propinas':'5.00',
                  'cobros_registrados':'30.00','costo_directo':'6.60','comisiones':'6.36','margen_contribucion':'93.40',
                  'margen_tras_comisiones':'87.04','gastos_operativos':'7.00','utilidad_estimada':'80.04','saldo_pendiente':'75.00','ticket_promedio':'105.00'}
        for key,value in expected.items(): self.assertEqual(result[key],value,key)
        self.assertEqual(result['numero_ventas'],1)
        self.assertEqual(result['visitas_finalizadas'],1)
        self.assertEqual(result['clientas_unicas_atendidas'],1)
        ranked=self.get_report('top-services')['results'][0]
        self.assertEqual(ranked['ingreso'],'63.64')
        self.assertEqual(ranked['costo_directo'],'0.60')
        # Purchases already represented in consumed costs are not subtracted as expense.
        self.assertEqual(m.Compras.objects.count(),2)

    def test_sales_payment_dates_and_local_exclusive_month_boundary(self):
        sale,_=self.dated_sale(payment='5.00')
        boundary=datetime(2026,11,1,5,tzinfo=__import__('datetime').timezone.utc)
        m.Pagos.objects.all().update(pagado_en=boundary)
        october=self.get_report()['indicadores']
        self.assertEqual(october['ventas_confirmadas'],'20.00')
        self.assertEqual(october['cobros_registrados'],'0.00')
        self.assertEqual(october['saldo_pendiente'],'15.00')
        november=self.get_report(query='?desde=2026-11-01&hasta=2026-11-02')['indicadores']
        self.assertEqual(november['ventas_confirmadas'],'0.00')
        self.assertEqual(november['cobros_registrados'],'5.00')
        m.Pagos.objects.all().update(pagado_en=boundary-timedelta(microseconds=1))
        self.assertEqual(self.get_report()['indicadores']['cobros_registrados'],'5.00')

    def test_series_fills_empty_days_weeks_months_and_separates_cash(self):
        self.dated_sale(day='2026-10-15',payment='5.00')
        result=self.get_report('revenue-series')['results']
        self.assertEqual(len(result),31)
        self.assertEqual(result[14]['ventas_confirmadas'],'20.00')
        self.assertEqual(result[14]['cobros_registrados'],'5.00')
        self.assertEqual(result[0]['ventas_confirmadas'],'0.00')
        weekly=self.get_report('revenue-series',RANGE+'&granularidad=week')['results']
        self.assertEqual(weekly[0]['inicio_periodo'],'2026-09-28')
        monthly=self.get_report('revenue-series','?desde=2026-09-01&hasta=2026-12-01&granularidad=month')['results']
        self.assertEqual([row['ventas_confirmadas'] for row in monthly],['0.00','20.00','0.00'])

    def test_partial_advance_applications_are_not_new_cash_and_legacy_is_blocked(self):
        sale,_=self.dated_sale(service=True)
        visit=m.Ventas.objects.get(pk=sale).visita_id
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Prueba','Cita') RETURNING id")
            professional=cursor.fetchone()[0]
            cursor.execute("INSERT INTO citas(clienta_id,profesional_id,visita_id,inicio_en,fin_en,precio_total) VALUES (%s,%s,%s,%s,%s,80) RETURNING id",[self.person.pk,professional,visit,datetime(2026,10,15,10,tzinfo=ZONE),datetime(2026,10,15,11,tzinfo=ZONE)])
            appointment=cursor.fetchone()[0]
        advance=m.AnticiposCita.objects.create(cita_id=appointment,estado='CONFIRMADO',monto=D('30'),metodo='EFECTIVO',pagado_en=datetime(2026,9,30,12,tzinfo=ZONE))
        for amount in ['10.00','20.00']:
            AdvanceApplication.objects.create(anticipo_id=advance.pk,venta_id=sale,monto=D(amount),clave_operacion=uuid.uuid4(),creado_por=self.admin)
        self.assertEqual(self.pay(sale,'50').status_code,201)
        m.Pagos.objects.all().update(pagado_en=datetime(2026,10,15,12,tzinfo=ZONE))
        result=self.get_report()['indicadores']
        self.assertEqual(result['saldo_pendiente'],'0.00')
        self.assertEqual(result['anticipos_recibidos'],'0.00')
        self.assertEqual(result['cobros_registrados'],'50.00')
        september=self.get_report(query='?desde=2026-09-01&hasta=2026-10-01')['indicadores']
        self.assertEqual(september['anticipos_recibidos'],'30.00')
        self.assertEqual(m.Pagos.objects.count(),1)
        advance.venta_id=sale
        advance.save(update_fields=['venta_id'])
        ambiguous=self.get_report()
        self.assertIsNone(ambiguous['indicadores']['saldo_pendiente'])
        self.assertIn('ANTICIPO_LEGACY_SIN_ASIGNACION_VERIFICABLE',ambiguous['calidad']['advertencias'])

    def test_annuled_sales_payments_and_cancelled_visits_excluded(self):
        sale,_=self.dated_sale(payment='5')
        m.Pagos.objects.all().update(estado='ANULADO')
        self.assertEqual(self.get_report()['indicadores']['cobros_registrados'],'0.00')
        m.Ventas.objects.filter(pk=sale).update(estado='ANULADA')
        m.Pagos.objects.all().update(estado='CONFIRMADO')
        result=self.get_report()['indicadores']
        self.assertEqual(result['ventas_confirmadas'],'0.00')
        self.assertEqual(result['cobros_registrados'],'0.00')
        m.Visitas.objects.create(clienta=self.person,estado='CANCELADA',inicio_en=datetime(2026,10,10,tzinfo=ZONE),fin_en=datetime(2026,10,10,tzinfo=ZONE))
        self.assertEqual(self.get_report()['indicadores']['visitas_finalizadas'],0)

    def test_missing_cost_provenance_and_inconsistent_totals_disable_derived_kpis(self):
        sale,_=self.dated_sale()
        m.MovimientosInventario.objects.filter(detalle_venta__venta_id=sale).delete()
        result=self.get_report()
        self.assertIsNone(result['indicadores']['costo_directo'])
        self.assertIsNone(result['indicadores']['utilidad_estimada'])
        m.Ventas.objects.filter(pk=sale).update(subtotal=D('21'),total=D('21'))
        result=self.get_report()
        self.assertEqual(result['indicadores']['ventas_confirmadas'],'21.00')
        self.assertIsNone(result['indicadores']['ingreso_por_productos'])
        self.assertIn('TOTALES_NO_CONCILIAN',result['calidad']['advertencias'])

    def test_filtered_cohort_includes_whole_sales_and_does_not_allocate_global_expenses(self):
        sale,service=self.dated_sale(service=True)
        result=self.get_report(query=RANGE+'&servicio_id='+str(service.pk))
        self.assertEqual(result['indicadores']['ventas_confirmadas'],'80.00')
        self.assertIsNone(result['indicadores']['utilidad_estimada'])
        self.assertEqual(result['periodo']['alcance_ventas'],'COHORTE_VENTAS_COMPLETAS')
        methods=self.get_report('payment-methods',RANGE+'&servicio_id='+str(service.pk))
        self.assertEqual(methods['results'],[])

    def test_client_ranking_is_private_minimal_stable_and_paginated(self):
        self.dated_sale(service=True)
        result=self.get_report('top-clients',RANGE+'&page_size=1')
        row=result['results'][0]
        self.assertEqual(set(row),{'clienta_id','nombre','ventas_confirmadas','numero_ventas','visitas_finalizadas'})
        self.assertEqual(row['visitas_finalizadas'],1)
        self.assertEqual(result['count'],1)
        self.get_report('top-clients',RANGE+'&page=2',status=404)

    def test_inventory_view_active_low_stock_and_negative_legacy_warning(self):
        article=self.product(stock='1')
        m.Articulos.objects.filter(pk=article.pk).update(stock_minimo=D('1'))
        inactive=self.product(stock=None)
        m.Articulos.objects.filter(pk=inactive.pk).update(activo=False)
        result=self.get_report('inventory-alerts')
        self.assertEqual(result['estadisticas']['articulos_activos'],1)
        self.assertEqual(result['count'],1)
        self.assertEqual(result['results'][0]['existencia'],'1.000')
        self.assertTrue(result['foto_actual'])
        self.assertIsNone(result['valoracion_total'])

    def test_month_comparison_full_month_zero_base(self):
        self.dated_sale()
        result=self.get_report('month-comparison','?month=2026-10')
        self.assertFalse(result['parcial_mismo_dia'])
        self.assertEqual(result['comparacion']['ventas_confirmadas']['diferencia'],'20.00')
        self.assertIsNone(result['comparacion']['ventas_confirmadas']['variacion_porcentaje'])

    def test_retention_birthdays_counts_no_messages_or_pii(self):
        today=timezone.localdate(timezone=ZONE)
        self.person.fecha_nacimiento=today.replace(year=2000)
        self.person.save(update_fields=['fecha_nacimiento'])
        result=self.get_report('clients/retention')
        self.assertEqual(result['indicadores']['cumpleanios_proximos'],1)
        self.assertEqual(result['indicadores']['clientas_inactivas'],1)
        self.assertNotIn('telefono',str(result))
