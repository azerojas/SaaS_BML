from rest_framework.test import APIClient
from .base import API, InventoryTestCase


class PermissionTests(InventoryTestCase):
    def test_authenticated_options_does_not_fail(self):
        for path in ['inventario/ajustes/', 'admin/catalogo/imagenes/1/principal/']:
            self.assertEqual(self.client.options(API+path).status_code,200)

    def routes(self):
        routes=[]
        for resource in ['proveedores','compras']:
            routes += [('get',API+resource+'/'),('post',API+resource+'/'),('get',API+resource+'/1/'),('patch',API+resource+'/1/')]
        routes += [('post',API+'proveedores/1/desactivar/'),('post',API+'proveedores/1/reactivar/'),
                   ('post',API+'compras/1/recibir/'),('post',API+'compras/1/anular/'),
                   ('get',API+'inventario/stock/'),('get',API+'inventario/movimientos/'),
                   ('get',API+'inventario/movimientos/1/'),('post',API+'inventario/ajustes/'),
                   ('get',API+'inventario/alertas/'),('get',API+'inventario/costos-receta/1/')]
        return routes

    def test_all_routes_block_anonymous_and_non_staff(self):
        for user in [None,self.regular]:
            client=APIClient()
            if user:client.force_authenticate(user)
            for method,path in self.routes():
                with self.subTest(user=user,method=method,path=path):
                    self.assertEqual(getattr(client,method)(path,{},format='json').status_code,403)

    def test_all_writes_require_csrf(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        for method,path in self.routes():
            if method!='get':
                self.assertEqual(getattr(client,method)(path,{},format='json').status_code,403)

    def test_valid_session_csrf_and_invalid_identifiers(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        client.get('/api/auth/csrf/')
        response=client.post(API+'proveedores/',{'nombre':'Proveedor CSRF ficticio'},format='json',HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code,201)
        for path in ['proveedores/no-id/','compras/no-id/','inventario/movimientos/no-id/','inventario/costos-receta/no-id/']:
            self.assertEqual(self.client.get(API+path).status_code,404)

