from unittest.mock import patch
from django.db import connection
from negocio import models as m
from .base import CatalogTestCase, ADMIN


class IntegrityTests(CatalogTestCase):
    def test_legacy_defaults_are_preserved_separately_from_api_policy(self):
        service=m.Servicios.objects.create(nombre='Default SQL',precio_base='0')
        article=m.Articulos.objects.create(nombre='Default SQL',tipo='INSUMO',unidad_id=self.unit.pk)
        service.refresh_from_db()
        article.refresh_from_db()
        self.assertTrue(service.visible_catalogo)
        self.assertTrue(service.activo)
        self.assertFalse(service.reservable_online)
        self.assertEqual(service.orden,0)
        self.assertFalse(article.visible_catalogo)
        self.assertEqual(article.precio_venta,0)
        self.assertIsNotNone(article.actualizado_en)

    def test_prices_do_not_rewrite_sale_snapshots_and_no_deletion(self):
        service=self.service()
        article=self.article(tipo='VENTA')
        with connection.cursor() as c:
            c.execute('INSERT INTO ventas DEFAULT VALUES RETURNING id')
            sale=c.fetchone()[0]
            for kind,field,pk in [('SERVICIO','servicio_id',service['id']),('PRODUCTO','articulo_id',article['id'])]:
                c.execute('INSERT INTO detalles_venta(venta_id,tipo,'+field+',descripcion_snapshot,cantidad,precio_unitario) VALUES (%s,%s,%s,%s,1,10)',[sale,kind,pk,'Snapshot ficticio'])
        self.assertEqual(self.patch('servicios',service['id'],{'precio_base':'999.99'}).status_code,200)
        self.assertEqual(self.patch('articulos',article['id'],{'precio_venta':'999.99'}).status_code,200)
        self.assertEqual(list(m.DetallesVenta.objects.values_list('precio_unitario',flat=True)),[10,10])
        for resource,pk in [('servicios',service['id']),('articulos',article['id'])]:
            self.assertEqual(self.client.delete(ADMIN+resource+'/'+str(pk)+'/').status_code,405)
            self.assertEqual(self.client.post(ADMIN+resource+'/'+str(pk)+'/desactivar/').status_code,200)
        self.assertEqual(m.DetallesVenta.objects.count(),2)

    def test_audit_redacts_values_and_failure_rolls_back(self):
        obj=self.service(nombre='Nombre ficticio',descripcion='Descripcion privada interna de prueba')
        audit=m.Auditoria.objects.filter(entidad='servicios',entidad_id=str(obj['id']),accion='CREAR').get()
        self.assertIn('descripcion',audit.datos['campos'])
        self.assertNotIn('Descripcion privada',str(audit.datos))
        with patch('apps.catalogo.services.audit',side_effect=RuntimeError('test')):
            with self.assertRaises(RuntimeError):
                self.patch('servicios',obj['id'],{'precio_base':'900'})
        self.assertEqual(str(m.Servicios.objects.get(pk=obj['id']).precio_base),'80.10')

    def test_no_new_tables_or_changed_views(self):
        with connection.cursor() as c:
            c.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'auth_%' AND tablename NOT LIKE 'django_%' AND tablename <> 'autenticacion_loginattempt' AND tablename NOT LIKE 'operaciones_%' AND tablename NOT LIKE 'finanzas_%' AND tablename NOT LIKE 'agenda_%' AND tablename NOT IN ('idempotency_records','aplicaciones_anticipo','catalogo_uploadedphoto')")
            self.assertEqual(c.fetchone()[0],34)
            c.execute("SELECT count(*) FROM pg_views WHERE schemaname='public'")
            self.assertEqual(c.fetchone()[0],7)
        for cls in [m.Servicios,m.Articulos,m.ImagenesCatalogo,m.VwCatalogoServicios,m.VwCatalogoArticulos,m.VwStockActual]:
            self.assertFalse(cls._meta.managed)
        with self.assertRaises(TypeError):
            m.VwStockActual(articulo_id=1).save()

