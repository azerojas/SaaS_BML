from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from negocio import models as m
from .base import CatalogTestCase, ADMIN, PUBLIC


class PublicTests(CatalogTestCase):
    def setUp(self):
        super().setUp()
        self.anonymous=APIClient()

    def test_public_service_category_policy_and_null_slugs(self):
        category=self.create('categorias-servicio',nombre='Activa')
        shown=self.service(visible_catalogo=True,categoria_id=category['id'])
        self.service(visible_catalogo=False)
        self.service(activo=False)
        uncategorized=self.service(visible_catalogo=True)
        legacy=self.service(visible_catalogo=True)
        m.Servicios.objects.filter(pk=legacy['id']).update(slug=None)
        listed=self.anonymous.get(PUBLIC+'servicios/').json()
        self.assertEqual({x['id'] for x in listed['results']},{shown['id'],uncategorized['id']})
        self.client.post(ADMIN+'categorias-servicio/'+str(category['id'])+'/desactivar/')
        # Existing SQL view still emits the service with categoria=NULL.
        self.assertTrue(m.VwCatalogoServicios.objects.filter(pk=shown['id']).exists())
        self.assertEqual(self.anonymous.get(PUBLIC+'servicios/'+shown['slug']+'/').status_code,404)
        self.assertEqual(self.anonymous.get(PUBLIC+'servicios/').json()['count'],1)

    def test_public_fields_and_read_only(self):
        service=self.service(visible_catalogo=True,descripcion='Solo contenido publico')
        product=self.article(tipo='VENTA',visible_catalogo=True,sku='PRIVADO',stock_minimo='5')
        self.article(tipo='INSUMO')
        for resource,slug,allowed in [
            ('servicios',service['slug'],{'id','slug','nombre','descripcion','duracion_minutos','precio_base','reservable_online','requiere_anticipo','orden','categoria','imagen_principal','moneda'}),
            ('productos',product['slug'],{'id','slug','nombre','descripcion','precio_venta','orden','categoria','disponible','imagen_principal','moneda'})]:
            path=PUBLIC+resource+'/'+slug+'/'
            data=self.anonymous.get(path).json()
            self.assertEqual(set(data),allowed)
            self.assertEqual(data['moneda'],'PEN')
            for method in ['post','patch','put','delete']:
                self.assertEqual(getattr(self.anonymous,method)(path,{},format='json').status_code,405)
        self.assertFalse(self.anonymous.get(PUBLIC+'productos/'+product['slug']+'/').json()['disponible'])
        self.assertEqual(self.anonymous.get(PUBLIC+'productos/').json()['count'],1)
        hidden=self.article(tipo='AMBOS',visible_catalogo=False)
        self.assertEqual(self.anonymous.get(PUBLIC+'productos/'+hidden['slug']+'/').status_code,404)

    def test_public_categories_only_with_published_content(self):
        a=self.create('categorias-servicio',nombre='Publicada')
        self.create('categorias-servicio',nombre='Vacia')
        b=self.create('categorias-articulo',nombre='Productos')
        self.service(categoria_id=a['id'],visible_catalogo=True)
        self.article(categoria_id=b['id'],tipo='AMBOS',visible_catalogo=True)
        response=self.anonymous.get(PUBLIC+'categorias/').json()
        self.assertEqual({(x['tipo'],x['nombre']) for x in response['results']},{('servicio','Publicada'),('producto','Productos')})
        self.assertEqual(self.anonymous.post(PUBLIC+'categorias/',{},format='json').status_code,405)

    def test_stock_matches_view_and_is_readonly(self):
        obj=self.article(tipo='AMBOS',visible_catalogo=True,stock_minimo='2.500')
        with connection.cursor() as c:
            for motive,quantity in [('AJUSTE_ENTRADA','5.500'),('AJUSTE_SALIDA','-1.250')]:
                c.execute('INSERT INTO movimientos_inventario(articulo_id,motivo,cantidad_firmada) VALUES (%s,%s,%s)',[obj['id'],motive,quantity])
        before=m.MovimientosInventario.objects.count()
        response=self.client.get(ADMIN+'stock/',{'articulo':obj['id']})
        self.assertEqual(response.status_code,200)
        row=response.json()['results'][0]
        self.assertEqual(row['existencia'],'4.250')
        self.assertFalse(row['bajo_minimo'])
        self.assertTrue(self.anonymous.get(PUBLIC+'productos/'+obj['slug']+'/').json()['disponible'])
        self.assertEqual(self.client.post(ADMIN+'stock/',{},format='json').status_code,405)
        self.assertEqual(m.MovimientosInventario.objects.count(),before)

    def test_pagination_search_and_query_count(self):
        for i in range(23):
            self.service(nombre='Servicio ' + str(i).zfill(2),visible_catalogo=True)
            self.article(nombre='Producto ' + str(i).zfill(2),tipo='VENTA',visible_catalogo=True)
        with CaptureQueriesContext(connection) as queries:
            response=self.client.get(ADMIN+'articulos/',{'page_size':20})
            self.assertEqual(len(response.json()['results']),20)
        self.assertLessEqual(len(queries),3)
        with CaptureQueriesContext(connection) as queries:
            response=self.anonymous.get(PUBLIC+'servicios/',{'page_size':20})
            self.assertEqual(len(response.json()['results']),20)
        self.assertLessEqual(len(queries),3)
        self.assertEqual(response.json()['count'],23)
        self.assertIsNotNone(response.json()['next'])
        with CaptureQueriesContext(connection) as queries:
            products=self.anonymous.get(PUBLIC+'productos/',{'page_size':20})
            self.assertEqual(len(products.json()['results']),20)
        self.assertLessEqual(len(queries),3)
        self.assertEqual(self.anonymous.get(PUBLIC+'servicios/',{'search':'Servicio 05'}).json()['count'],1)
        self.assertEqual(self.anonymous.get(PUBLIC+'servicios/',{'search':"x' OR 1=1 --"}).json()['count'],0)
        self.assertEqual(self.anonymous.get(PUBLIC+'servicios/',{'categoria':'bad'}).status_code,400)

