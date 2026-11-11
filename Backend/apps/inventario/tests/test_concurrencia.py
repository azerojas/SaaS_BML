import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from types import SimpleNamespace
from django.db import connections, transaction
from django.test import TestCase
from rest_framework.exceptions import APIException
from negocio import models as m
from apps.catalogo import services as catalog
from apps.inventario import services


class InventoryConcurrencyTests(TestCase):
    user=SimpleNamespace(pk=None)

    def isolated(self, function):
        def run():
            try:
                with connections['default'].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '8s'")
                return function()
            finally:
                connections['default'].close()
        with ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(run).result(timeout=20)

    def seed(self):
        def create():
            unit=catalog.save_entity('unidades',{'codigo':'INV-RACE','nombre':'Unidad concurrencia'},self.user)
            other=catalog.save_entity('unidades',{'codigo':'INV-OTHER','nombre':'Otra unidad'},self.user)
            articles=[catalog.save_entity('articulos',{'nombre':'Articulo carrera '+str(i),'tipo':'INSUMO','unidad_id':unit.pk},self.user).pk for i in range(2)]
            return {'unit':unit.pk,'other_unit':other.pk,'articles':articles}
        return self.isolated(create)

    def cleanup(self):
        def remove():
            assert connections['default'].settings_dict['NAME'].startswith('test_lasheo_phase1_')
            with transaction.atomic():
                m.MovimientosInventario.objects.all().delete()
                m.DetallesCompra.objects.all().delete()
                m.Compras.objects.all().delete()
                m.Auditoria.objects.filter(usuario_id__isnull=True).delete()
                m.Articulos.objects.all().delete()
                m.Proveedores.objects.all().delete()
                m.UnidadesMedida.objects.filter(codigo__in=['INV-RACE','INV-OTHER']).delete()
        self.isolated(remove)

    def race(self, functions):
        barrier=Barrier(len(functions))
        def run(function):
            try:
                with connections['default'].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '8s'")
                barrier.wait(timeout=10)
                return ('ok',function())
            except APIException as exc:
                return (exc.status_code,None)
            finally:
                connections['default'].close()
        with ThreadPoolExecutor(max_workers=len(functions)) as executor:
            return list(executor.map(run,functions))

    def purchase(self, seed, articles=None):
        rows=[{'articulo_id':pk,'unidad_id':seed['unit'],'cantidad':Decimal('1.000'),'costo_unitario':Decimal('2.0000')} for pk in (articles or seed['articles'][:1])]
        return self.isolated(lambda:services.save_purchase({'detalles':rows},self.user).pk)

    def adjust(self, seed, kind='AJUSTE_ENTRADA', quantity='1', key=None):
        return services.adjust_stock({'articulo_id':seed['articles'][0],'unidad_id':seed['unit'],'tipo':kind,
            'cantidad':Decimal(quantity),'justificacion':'Ajuste ficticio concurrente'},self.user,key or str(uuid.uuid4()))

    def test_same_purchase_received_twice_only_once_in_ledger(self):
        try:
            seed=self.seed()
            pk=self.purchase(seed)
            results=self.race([lambda:services.receive_purchase(pk,self.user).estado,lambda:services.receive_purchase(pk,self.user).estado])
            self.assertEqual(results,[('ok','RECIBIDA'),('ok','RECIBIDA')])
            def verify():
                return m.MovimientosInventario.objects.count(),services.balance(seed['articles'][0]),m.Auditoria.objects.filter(accion='RECIBIR').count()
            self.assertEqual(self.isolated(verify),(1,Decimal('1'),1))
        finally:
            self.cleanup()

    def test_purchase_creation_intent_replayed_in_parallel(self):
        try:
            seed=self.seed()
            key=str(uuid.uuid4())
            payload={'detalles':[{'articulo_id':seed['articles'][0],'unidad_id':seed['unit'],
                'cantidad':Decimal('1.125'),'costo_unitario':Decimal('2.5000')}]}
            results=self.race([lambda:services.create_purchase_idempotent(payload,self.user,key)[0].pk,
                               lambda:services.create_purchase_idempotent(payload,self.user,key)[0].pk])
            self.assertEqual([status for status,_ in results],['ok','ok'])
            self.assertEqual(results[0][1],results[1][1])
            self.assertEqual(self.isolated(lambda:m.Compras.objects.count()),1)
        finally:
            self.cleanup()

    def test_two_simultaneous_exits_cannot_overdraw(self):
        try:
            seed=self.seed()
            self.isolated(lambda:self.adjust(seed))
            results=self.race([lambda:self.adjust(seed,'AJUSTE_SALIDA'),lambda:self.adjust(seed,'AJUSTE_SALIDA')])
            self.assertEqual({status for status,_ in results},{'ok',409})
            self.assertEqual(self.isolated(lambda:services.balance(seed['articles'][0])),0)
            self.assertEqual(self.isolated(lambda:m.MovimientosInventario.objects.count()),2)
        finally:
            self.cleanup()

    def test_same_adjustment_key_replayed_in_parallel(self):
        try:
            seed=self.seed()
            key=str(uuid.uuid4())
            results=self.race([lambda:self.adjust(seed,key=key),lambda:self.adjust(seed,key=key)])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual({value[1] for _,value in results},{True,False})
            self.assertEqual(results[0][1][0],results[1][1][0])
            self.assertEqual(self.isolated(lambda:m.MovimientosInventario.objects.count()),1)
        finally:
            self.cleanup()

    def test_receipts_lock_articles_in_stable_order(self):
        try:
            seed=self.seed()
            first=self.purchase(seed,seed['articles'])
            second=self.purchase(seed,list(reversed(seed['articles'])))
            results=self.race([lambda:services.receive_purchase(first,self.user).estado,lambda:services.receive_purchase(second,self.user).estado])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual(self.isolated(lambda:[services.balance(pk) for pk in seed['articles']]),[2,2])
            self.assertEqual(self.isolated(lambda:m.MovimientosInventario.objects.count()),4)
        finally:
            self.cleanup()

    def test_receipt_and_exit_observe_serial_stock(self):
        try:
            seed=self.seed()
            purchase=self.purchase(seed)
            results=self.race([lambda:services.receive_purchase(purchase,self.user).estado,lambda:self.adjust(seed,'AJUSTE_SALIDA')])
            self.assertIn('ok',[status for status,_ in results])
            result=self.isolated(lambda:services.balance(seed['articles'][0]))
            self.assertIn(result,[Decimal('0'),Decimal('1')])
            if results[1][0]=='ok':
                self.assertEqual(result,0)
            else:
                self.assertEqual(results[1][0],409)
                self.assertEqual(result,1)
        finally:
            self.cleanup()

    def test_catalog_unit_change_and_adjustment_cannot_disagree(self):
        try:
            seed=self.seed()
            results=self.race([lambda:self.adjust(seed),lambda:catalog.save_entity('articulos',{'unidad_id':seed['other_unit']},self.user,seed['articles'][0]).pk])
            def verify():
                return m.Articulos.objects.get(pk=seed['articles'][0]).unidad_id,m.MovimientosInventario.objects.count()
            unit,count=self.isolated(verify)
            if results[0][0]=='ok':
                self.assertEqual((unit,count),(seed['unit'],1))
                self.assertEqual(results[1][0],409)
            else:
                self.assertEqual(results[0][0],400)
                self.assertEqual((unit,count),(seed['other_unit'],0))
        finally:
            self.cleanup()

