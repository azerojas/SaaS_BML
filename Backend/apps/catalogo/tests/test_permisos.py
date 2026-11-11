from rest_framework.test import APIClient
from .base import CatalogTestCase, ADMIN


class PermissionTests(CatalogTestCase):
    def test_invalid_identifiers_are_404(self):
        for path in ['servicios/no-es-id/', 'articulos/no-es-id/', 'imagenes/no-es-id/principal/']:
            self.assertEqual(self.client.get(ADMIN+path).status_code,404)

    def routes(self):
        routes=[]
        for resource in ['categorias-servicio','categorias-articulo','unidades','servicios','articulos']:
            path=ADMIN+resource+'/'
            routes += [('get',path),('post',path),('get',path+'1/'),('patch',path+'1/')]
        for resource in ['categorias-servicio','servicios','articulos']:
            for action in ['desactivar','reactivar']:
                routes.append(('post',ADMIN+resource+'/1/'+action+'/'))
        for resource in ['servicios','articulos']:
            routes += [('get',ADMIN+resource+'/1/imagenes/'),('post',ADMIN+resource+'/1/imagenes/')]
        return routes+[('get',ADMIN+'servicios/1/receta/'),('put',ADMIN+'servicios/1/receta/'),
                       ('post',ADMIN+'imagenes/1/principal/'),('delete',ADMIN+'imagenes/1/'),('get',ADMIN+'stock/')]

    def test_all_admin_routes_reject_anonymous_and_non_staff(self):
        for user in [None,self.regular]:
            client=APIClient()
            if user:
                client.force_authenticate(user)
            for method,path in self.routes():
                with self.subTest(user=user,method=method,path=path):
                    self.assertEqual(getattr(client,method)(path,{},format='json').status_code,403)

    def test_all_writes_enforce_session_csrf(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        for method,path in self.routes():
            if method not in ['get']:
                with self.subTest(method=method,path=path):
                    self.assertEqual(getattr(client,method)(path,{},format='json').status_code,403)

    def test_csrf_valid_allows_write(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        client.get('/api/auth/csrf/')
        token=client.cookies['csrftoken'].value
        response=client.post(ADMIN+'servicios/',{'nombre':'CSRF test','precio_base':'10.00'},format='json',HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code,201)
        self.assertEqual(response['Cache-Control'],'no-store, private')

