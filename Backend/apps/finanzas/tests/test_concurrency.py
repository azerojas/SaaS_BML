import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal as D
from threading import Barrier
from django.contrib.auth import get_user_model
from django.db import connections,transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import APIException
from negocio import models as m
from apps.catalogo import services as catalog
from apps.clientas import services as clients
from apps.inventario import services as inventory
from apps.finanzas.application import sales,payments,advances
from apps.finanzas.infrastructure.idempotency import execute
from apps.finanzas.models import IdempotencyRecord,AdvanceApplication
from apps.finanzas.domain.errors import FinanceError


class FinancialConcurrencyTests(TestCase):
    def test_service_consumption_confirmation_retries_are_single_ledger_issue(self):
        try:
            seed=self.seed()
            def prepare():
                catalog.save_entity('articulos',{'tipo':'AMBOS'},seed['actor'],seed['article'])
                visit=m.Visitas.objects.create(clienta_id=seed['client'],creada_por_id=seed['actor'].pk)
                service=catalog.save_entity('servicios',{'nombre':'Servicio carrera','precio_base':D('80')},seed['actor'])
                data={'visita_id':visit.pk,'lineas':[
                    {'tipo':'PRODUCTO','articulo_id':seed['article'],'unidad_id':seed['unit'],'cantidad':D('1')},
                    {'tipo':'SERVICIO','servicio_id':service.pk,'cantidad':D('1')}]}
                sale=self.run_operation('venta.crear',str(uuid.uuid4()),data,seed['actor'],lambda key:sales.create_sale_draft(data,seed['actor']))[0]['venta_id']
                detail=m.DetallesVenta.objects.get(venta_id=sale,tipo='SERVICIO')
                return sale,detail.pk
            sale,detail=self.isolated(prepare)
            data={'consumos_revisados':True,'consumos_reales':[{'detalle_id':detail,'insumos':[
                {'articulo_id':seed['article'],'unidad_id':seed['unit'],'cantidad':D('.500')}]}]}
            key=str(uuid.uuid4())
            def confirm_actual():
                return self.run_operation('venta.confirmar',key,{'sale':sale,'data':data},seed['actor'],
                    lambda parsed:sales.confirm_sale(sale,data,seed['actor']))
            result=self.race([confirm_actual,confirm_actual])
            self.assertEqual({status for status,_ in result},{'ok'})
            self.assertEqual(self.isolated(lambda:m.ConsumosServicio.objects.count()),1)
            self.assertEqual(self.isolated(lambda:m.MovimientosInventario.objects.filter(motivo='CONSUMO_SERVICIO').count()),1)
            self.assertEqual(self.isolated(lambda:inventory.balance(seed['article'])),D('8.500'))
        finally:self.cleanup()

    def isolated(self,function):
        def run():
            try:
                with connections['default'].cursor() as c:c.execute("SET lock_timeout = '10s'")
                return function()
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=1) as pool:return pool.submit(run).result(timeout=25)
    def race(self,functions):
        barrier=Barrier(len(functions))
        def run(function):
            try:
                with connections['default'].cursor() as c:c.execute("SET lock_timeout = '10s'")
                barrier.wait(timeout=10)
                return ('ok',function())
            except FinanceError as exc:return ({'invalid':400,'forbidden':403,'unavailable':503,'conflict':409}[exc.kind],None)
            except APIException as exc:return (exc.status_code,None)
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=len(functions)) as pool:return list(pool.map(run,functions))
    def seed(self,stock='10',price='20'):
        def create():
            user=get_user_model().objects.create_superuser('finance_race_test',password=None)
            unit=m.UnidadesMedida.objects.create(codigo='FIN-RACE',nombre='Unidad')
            article=catalog.save_entity('articulos',{'nombre':'Producto carrera','tipo':'VENTA','unidad_id':unit.pk,'precio_venta':D(price)},user)
            purchase=inventory.save_purchase({'detalles':[{'articulo_id':article.pk,'unidad_id':unit.pk,'cantidad':D(stock),'costo_unitario':D('1')}]},user)
            inventory.receive_purchase(purchase.pk,user)
            client=clients.save_clienta({'nombres':'Ficticia','apellidos':'Carrera','telefono':'+51999777666'},user)
            return {'actor':user,'article':article.pk,'unit':unit.pk,'client':client.pk}
        return self.isolated(create)
    def run_operation(self,operation,key,payload,actor,callback):
        return execute(operation,key,payload,actor,lambda parsed:(callback(parsed),200))
    def draft(self,seed,visit=None):
        data={'lineas':[{'tipo':'PRODUCTO','articulo_id':seed['article'],'unidad_id':seed['unit'],'cantidad':D('1')}]}
        if visit is not None:data['visita_id']=visit
        return self.isolated(lambda:self.run_operation('venta.crear',str(uuid.uuid4()),data,seed['actor'],lambda key:sales.create_sale_draft(data,seed['actor']))[0]['venta_id'])
    def confirm(self,seed,sale,key=None):
        data={'consumos_revisados':True,'consumos_reales':[]}
        return self.run_operation('venta.confirmar',key or str(uuid.uuid4()),{'sale':sale,'data':data},seed['actor'],lambda parsed:sales.confirm_sale(sale,data,seed['actor']))
    def pay(self,seed,sale,amount='10',key=None,reference=None):
        data={'metodo':'YAPE' if reference else 'EFECTIVO','monto':D(amount),'verificado_manualmente':True,'referencia':reference}
        return self.run_operation('pago.registrar',key or str(uuid.uuid4()),{'sale':sale,'data':data},seed['actor'],lambda parsed:payments.register_payment(sale,data,seed['actor']))
    def cleanup(self):
        def remove():
            assert connections['default'].settings_dict['NAME'].startswith('test_lasheo_phase1_')
            with transaction.atomic():
                AdvanceApplication.objects.all().delete()
                IdempotencyRecord.objects.all().delete()
                m.MovimientosInventario.objects.all().delete()
                m.ConsumosServicio.objects.all().delete()
                m.Pagos.objects.all().delete()
                m.AnticiposCita.objects.all().delete()
                m.DetallesVenta.objects.all().delete()
                m.Ventas.objects.all().delete()
                m.Citas.objects.all().delete()
                m.Visitas.objects.all().delete()
                m.Llegadas.objects.all().delete()
                m.DetallesCompra.objects.all().delete()
                m.Compras.objects.all().delete()
                m.RecetasServicio.objects.all().delete()
                m.Articulos.objects.all().delete()
                m.Profesionales.objects.all().delete()
                m.Clientas.objects.all().delete()
                m.Auditoria.objects.all().delete()
                m.UnidadesMedida.objects.filter(codigo='FIN-RACE').delete()
                get_user_model().objects.filter(username='finance_race_test').delete()
        self.isolated(remove)

    def test_same_confirmation_key_executes_once(self):
        try:
            seed=self.seed()
            sale=self.draft(seed)
            key=str(uuid.uuid4())
            result=self.race([lambda:self.confirm(seed,sale,key),lambda:self.confirm(seed,sale,key)])
            self.assertEqual({status for status,_ in result},{'ok'})
            self.assertEqual(result[0][1],result[1][1])
            self.assertEqual(self.isolated(lambda:m.MovimientosInventario.objects.filter(motivo='VENTA_PRODUCTO').count()),1)
        finally:self.cleanup()

    def test_different_keys_same_sale_do_not_duplicate_stock(self):
        try:
            seed=self.seed()
            sale=self.draft(seed)
            result=self.race([lambda:self.confirm(seed,sale),lambda:self.confirm(seed,sale)])
            self.assertEqual({status for status,_ in result},{'ok',409})
            self.assertEqual(self.isolated(lambda:inventory.balance(seed['article'])),9)
        finally:self.cleanup()

    def test_two_sales_cannot_sell_same_last_unit(self):
        try:
            seed=self.seed(stock='1')
            first,second=self.draft(seed),self.draft(seed)
            result=self.race([lambda:self.confirm(seed,first),lambda:self.confirm(seed,second)])
            self.assertEqual({status for status,_ in result},{'ok',409})
            self.assertEqual(self.isolated(lambda:inventory.balance(seed['article'])),0)
        finally:self.cleanup()

    def test_sale_issue_and_phase3_adjustment_share_article_locks(self):
        try:
            seed=self.seed(stock='1')
            sale=self.draft(seed)
            def adjust():
                return inventory.adjust_stock({'articulo_id':seed['article'],'unidad_id':seed['unit'],'tipo':'AJUSTE_SALIDA',
                    'cantidad':D('1'),'justificacion':'Conteo de concurrencia ficticio'},seed['actor'],str(uuid.uuid4()))
            result=self.race([lambda:self.confirm(seed,sale),adjust])
            self.assertEqual({status for status,_ in result},{'ok',409})
            self.assertEqual(self.isolated(lambda:inventory.balance(seed['article'])),0)
        finally:self.cleanup()

    def test_two_payments_do_not_overpay(self):
        try:
            seed=self.seed(price='10')
            sale=self.draft(seed)
            self.isolated(lambda:self.confirm(seed,sale))
            result=self.race([lambda:self.pay(seed,sale,'8'),lambda:self.pay(seed,sale,'8')])
            self.assertEqual({status for status,_ in result},{'ok',409})
            self.assertEqual(self.isolated(lambda:m.Pagos.objects.count()),1)
        finally:self.cleanup()

    def test_payment_retries_share_persistent_record(self):
        try:
            seed=self.seed(price='10')
            sale=self.draft(seed)
            self.isolated(lambda:self.confirm(seed,sale))
            key=str(uuid.uuid4())
            result=self.race([lambda:self.pay(seed,sale,key=key),lambda:self.pay(seed,sale,key=key)])
            self.assertEqual({status for status,_ in result},{'ok'})
            self.assertEqual(result[0][1],result[1][1])
            self.assertEqual(self.isolated(lambda:m.Pagos.objects.count()),1)
        finally:self.cleanup()

    def test_partial_advance_cannot_be_overallocated_concurrently(self):
        try:
            seed=self.seed(price='40')
            def prepare():
                visit=m.Visitas.objects.create(clienta_id=seed['client'],creada_por_id=seed['actor'].pk)
                with connections['default'].cursor() as c:
                    c.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Prueba','Carrera') RETURNING id")
                    professional=c.fetchone()[0]
                    now=timezone.now()
                    c.execute('INSERT INTO citas(clienta_id,profesional_id,visita_id,inicio_en,fin_en,precio_total) VALUES (%s,%s,%s,%s,%s,40) RETURNING id',
                        [seed['client'],professional,visit.pk,now,now+timedelta(minutes=30)])
                    appointment=c.fetchone()[0]
                advance=m.AnticiposCita.objects.create(cita_id=appointment,metodo='EFECTIVO',monto=D('30'),estado='CONFIRMADO',pagado_en=timezone.now())
                return visit.pk,advance.pk
            visit,advance=self.isolated(prepare)
            sale=self.draft(seed,visit)
            self.isolated(lambda:self.confirm(seed,sale))
            data={'anticipo_id':advance,'monto':D('20')}
            def apply():
                return self.run_operation('anticipo.aplicar',str(uuid.uuid4()),{'sale':sale,'data':data},seed['actor'],
                    lambda key:advances.apply_advance(sale,data,seed['actor'],key))
            result=self.race([apply,apply])
            self.assertEqual({status for status,_ in result},{'ok',409})
            self.assertEqual(self.isolated(lambda:AdvanceApplication.objects.count()),1)
            self.assertEqual(self.isolated(lambda:m.Pagos.objects.count()),0)
        finally:self.cleanup()

