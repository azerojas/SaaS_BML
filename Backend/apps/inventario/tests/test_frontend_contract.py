import uuid
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from negocio import models as m
from .base import InventoryTestCase, API


class FrontendInventoryContractTests(InventoryTestCase):
    def test_drf_csrf_is_distinguished_from_permission_rejection(self):
        from rest_framework.test import APIClient
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        response=client.post(API+'inventario/ajustes/',{},format='json')
        self.assertEqual(response.status_code,403)
        self.assertEqual(response.json()['code'],'csrf')
        self.assertNotIn('CSRF Failed',response.json()['detail'])

    def test_create_purchase_replay_conflict_and_private_recovery(self):
        key=str(uuid.uuid4())
        payload={'detalles':[self.line()], 'numero_documento':'FRONTEND-INTENT'}
        first=self.client.post(API+'compras/',payload,format='json',HTTP_IDEMPOTENCY_KEY=key)
        second=self.client.post(API+'compras/',payload,format='json',HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(second.status_code,200,second.data)
        self.assertEqual(first.json()['id'],second.json()['id'])
        self.assertEqual(m.Compras.objects.count(),1)
        changed=self.client.post(API+'compras/',{**payload,'numero_documento':'OTHER'},format='json',HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(changed.status_code,409)
        recovered=self.client.get(API+'compras/estado-intento/',{'clave':key})
        self.assertTrue(recovered.json()['encontrada'])
        self.assertEqual(recovered.json()['compra']['id'],first.json()['id'])
        other=get_user_model().objects.create_superuser('inventory_other_operator',password=None)
        self.client.force_authenticate(other)
        self.assertFalse(self.client.get(API+'compras/estado-intento/',{'clave':key}).json()['encontrada'])

    def test_stock_metadata_summary_recipe_uses_and_receipt_consistency(self):
        article=self.article(sku='FRONTEND-STOCK',stock_minimo='1.000')
        service=self.service()
        self.client.put('/api/admin/catalogo/servicios/'+str(service['id'])+'/receta/',{'insumos':[{'articulo_id':article['id'],'cantidad_estimada':'0.125'}]},format='json')
        row=self.stock_row(article)
        self.assertEqual(row['sku'],'FRONTEND-STOCK')
        self.assertEqual(row['unidad_id'],article['unidad_id'])
        self.assertTrue(row['activo'])
        summary=self.client.get(API+'inventario/stock/resumen/').json()
        self.assertEqual(summary['articulos_activos'],1)
        self.assertEqual(summary['sin_movimientos'],1)
        uses=self.client.get(API+'inventario/stock/usos-receta/',{'articulo':article['id']}).json()
        self.assertEqual(uses['results'][0]['servicio_id'],service['id'])
        purchase=self.purchase([self.line(article),self.line(article)])
        self.assertEqual(self.receive(purchase).status_code,200)
        rows=self.client.get(API+'inventario/stock/',{'compra':purchase['id']}).json()
        self.assertEqual(rows['count'],1)  # No duplicated stock rows from multi-line join.
        self.assertEqual(rows['results'][0]['existencia'],'4.000')
        latest=self.client.get(API+'inventario/stock/resumen/').json()['ultimos_movimientos']
        self.assertEqual(len(latest),2)
        self.assertEqual(latest[0]['registrado_por_id'],self.admin.pk)

    def test_summary_does_not_disclose_movements_without_permission(self):
        staff=get_user_model().objects.create_user('inventory_reader',is_staff=True)
        staff.user_permissions.add(Permission.objects.get(content_type__app_label='negocio',codename='view_articulos'))
        self.client.force_authenticate(staff)
        response=self.client.get(API+'inventario/stock/resumen/')
        self.assertEqual(response.status_code,200)
        self.assertIsNone(response.json()['ultimos_movimientos'])
        self.assertEqual(self.client.get(API+'inventario/stock/usos-receta/',{'articulo':1}).status_code,403)

    def test_adjustment_recovery_returns_original_result_without_new_movement(self):
        article=self.article()
        key=str(uuid.uuid4())
        result=self.adjustment(article,key=key)
        self.assertEqual(result.status_code,201,result.data)
        recovered=self.client.get(API+'inventario/ajustes/estado/',{'clave':key})
        self.assertEqual(recovered.status_code,200,recovered.data)
        self.assertEqual(recovered.json()['resultado'],result.json())
        self.assertEqual(m.MovimientosInventario.objects.count(),1)
