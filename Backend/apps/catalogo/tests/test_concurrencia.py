from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from types import SimpleNamespace
from django.db import connections, transaction
from django.test import TestCase
from rest_framework.exceptions import APIException
from negocio import models as m
from apps.catalogo import services


class CatalogConcurrencyTests(TestCase):
    """Real independent PostgreSQL transactions; never share TestCase fixture connections."""
    user = SimpleNamespace(pk=None)

    def isolated(self, function):
        def run():
            try:
                return function()
            finally:
                connections['default'].close()
        with ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(run).result(timeout=20)

    def seed(self):
        def create():
            unit=services.save_entity('unidades',{'codigo':'RACE-UNIT','nombre':'Unidad concurrencia'},self.user)
            service=services.save_entity('servicios',{'nombre':'Servicio concurrencia','precio_base':Decimal('1')},self.user)
            articles=[services.save_entity('articulos',{'nombre':'Insumo concurrencia '+str(i),'tipo':'INSUMO','unidad_id':unit.pk},self.user) for i in range(2)]
            return {'unit':unit.pk,'service':service.pk,'articles':[x.pk for x in articles]}
        return self.isolated(create)

    def cleanup(self):
        def remove():
            with transaction.atomic():
                m.ImagenesCatalogo.objects.all().delete()
                m.RecetasServicio.objects.all().delete()
                m.Auditoria.objects.filter(usuario_id__isnull=True).delete()
                m.Servicios.objects.all().delete()
                m.Articulos.objects.all().delete()
                m.UnidadesMedida.objects.filter(codigo='RACE-UNIT').delete()
        self.isolated(remove)

    def race(self, functions):
        barrier=Barrier(len(functions))
        def run(function):
            try:
                barrier.wait(timeout=10)
                return ('ok',function())
            except APIException as exc:
                return (exc.status_code,None)
            finally:
                connections['default'].close()
        with ThreadPoolExecutor(max_workers=len(functions)) as executor:
            return list(executor.map(run,functions))

    def test_generated_slug_collision_is_serialized(self):
        try:
            def create(name):
                return services.save_entity('servicios',{'nombre':name,'precio_base':Decimal('1')},self.user).slug
            results=self.race([lambda:create('Mismo!'),lambda:create('Mismo?')])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual({slug for _,slug in results},{'mismo','mismo-2'})
        finally:
            self.cleanup()

    def test_duplicate_sku_returns_controlled_conflict(self):
        try:
            seed=self.seed()
            def create(name):
                return services.save_entity('articulos',{'nombre':name,'tipo':'VENTA','unidad_id':seed['unit'],'sku':'RACE-SKU'},self.user).pk
            results=self.race([lambda:create('Primero'),lambda:create('Segundo')])
            self.assertEqual({status for status,_ in results},{'ok',409})
        finally:
            self.cleanup()

    def test_primary_image_switch_concurrent(self):
        try:
            seed=self.seed()
            def add():
                return [services.add_image('servicios',seed['service'],{'url':'https://images.example.com/'+str(i)},self.user).pk for i in range(2)]
            image_ids=self.isolated(add)
            results=self.race([lambda:services.set_primary_image(image_ids[0],self.user).pk,
                               lambda:services.set_primary_image(image_ids[1],self.user).pk])
            self.assertEqual({status for status,_ in results},{'ok'})
            def verify():
                return m.ImagenesCatalogo.objects.filter(servicio_id=seed['service'],es_principal=True).count()
            self.assertEqual(self.isolated(verify),1)
        finally:
            self.cleanup()

    def test_recipe_replacements_are_complete_and_do_not_change_stock(self):
        try:
            seed=self.seed()
            def replace(article):
                return services.replace_recipe(seed['service'],{'insumos':[{'articulo_id':article,'cantidad_estimada':Decimal('1')}]},self.user)
            results=self.race([lambda:replace(seed['articles'][0]),lambda:replace(seed['articles'][1])])
            self.assertEqual({status for status,_ in results},{'ok'})
            def verify():
                rows=list(m.RecetasServicio.objects.filter(servicio_id=seed['service']).values_list('articulo_id',flat=True))
                return rows,m.MovimientosInventario.objects.count(),m.ConsumosServicio.objects.count()
            rows,movements,consumptions=self.isolated(verify)
            self.assertEqual(len(rows),1)
            self.assertIn(rows[0],seed['articles'])
            self.assertEqual((movements,consumptions),(0,0))
        finally:
            self.cleanup()

    def test_recipe_and_change_to_sale_type_cannot_break_invariant(self):
        try:
            seed=self.seed()
            article=seed['articles'][0]
            results=self.race([
                lambda:services.replace_recipe(seed['service'],{'insumos':[{'articulo_id':article,'cantidad_estimada':Decimal('1')}]},self.user),
                lambda:services.save_entity('articulos',{'tipo':'VENTA'},self.user,article).pk,
            ])
            self.assertIn('ok',[status for status,_ in results])
            def verify():
                return m.RecetasServicio.objects.filter(articulo_id=article).exists(),m.Articulos.objects.get(pk=article).tipo
            used,kind=self.isolated(verify)
            self.assertFalse(used and kind=='VENTA')
        finally:
            self.cleanup()

