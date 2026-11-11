from decimal import Decimal
from django.db import connection
from django.utils import timezone
from negocio import models as m
from .base import CatalogTestCase, ADMIN


class ArticleTests(CatalogTestCase):
    def test_unit_labels_are_not_artificially_unique(self):
        self.create('unidades', codigo='AAA', nombre='Nombre compartido')
        self.create('unidades', codigo='BBB', nombre='Nombre compartido')

    def test_types_defaults_and_decimal_precision(self):
        for kind in ['INSUMO', 'VENTA', 'AMBOS']:
            data = self.article(tipo=kind, precio_venta='15.20', stock_minimo='0.125')
            self.assertEqual(data['precio_venta'], '15.20')
            self.assertEqual(data['stock_minimo'], '0.125')
            self.assertFalse(data['visible_catalogo'])
            self.assertEqual(m.Articulos.objects.get(pk=data['id']).stock_minimo, Decimal('0.125'))

    def test_validation_and_visibility(self):
        payload = {'nombre': 'Prueba', 'tipo': 'INSUMO', 'unidad_id': self.unit.pk}
        for field, value in [('precio_venta','-1'),('precio_venta','0.001'),('stock_minimo','-1'),
                             ('stock_minimo','0.0001'),('tipo','OTRO'),('unidad_id',999999),('sku','SKU CON ESPACIOS'),
                             ('nombre', 'x' * 161), ('visible_catalogo',True)]:
            with self.subTest(field=field):
                r=self.client.post(ADMIN+'articulos/',{**payload,field:value},format='json')
                self.assertEqual(r.status_code,400)
        obj=self.article(tipo='VENTA',visible_catalogo=True)
        self.assertEqual(self.patch('articulos',obj['id'],{'tipo':'INSUMO'}).status_code,400)
        self.assertEqual(self.patch('articulos',obj['id'],{'tipo':'INSUMO','visible_catalogo':False}).status_code,200)

    def test_sku_normalization_and_duplicates(self):
        first=self.article(sku=' ins-adh-001 ')
        self.assertEqual(first['sku'],'INS-ADH-001')
        response=self.client.post(ADMIN+'articulos/',{'nombre':'Otro','tipo':'INSUMO','unidad_id':self.unit.pk,'sku':'ins-adh-001'},format='json')
        self.assertEqual(response.status_code,409)
        self.article(sku=None)
        self.article(sku=None)

    def test_units_restricted_and_categories_without_fake_state(self):
        unit=self.create('unidades',codigo='  und ',nombre='Unidad')
        self.assertEqual(unit['codigo'],'UND')
        self.assertEqual(self.patch('unidades',unit['id'],{'codigo':'PIEZA'}).status_code,200)
        obj=self.article(unidad_id=unit['id'])
        self.assertEqual(self.patch('unidades',unit['id'],{'codigo':'OTRO'}).status_code,409)
        self.assertEqual(self.patch('unidades',unit['id'],{'nombre':'Pieza'}).status_code,200)
        self.assertEqual(self.patch('articulos',obj['id'],{'unidad_id':self.other_unit.pk}).status_code,200)
        self.assertEqual(self.client.delete(ADMIN+'unidades/'+str(unit['id'])+'/').status_code,405)
        category=self.create('categorias-articulo',nombre='Materiales')
        self.assertNotIn('activa',category)
        self.assertEqual(self.patch('categorias-articulo',category['id'],{'activa':False}).status_code,400)
        self.assertEqual(self.client.post(ADMIN+'categorias-articulo/'+str(category['id'])+'/desactivar/').status_code,404)

    def test_unit_change_blocked_by_recipe_and_type_venta_blocked(self):
        article=self.article()
        service=self.service()
        m.RecetasServicio.objects.create(servicio_id=service['id'],articulo_id=article['id'],cantidad_estimada=1)
        self.assertEqual(self.patch('articulos',article['id'],{'unidad_id':self.other_unit.pk}).status_code,409)
        self.assertEqual(self.patch('articulos',article['id'],{'tipo':'VENTA'}).status_code,409)
        self.assertEqual(self.patch('articulos',article['id'],{'tipo':'AMBOS'}).status_code,200)

    def test_unit_change_blocked_by_movements_and_purchases(self):
        for source in ['movement','purchase']:
            article=self.article()
            with connection.cursor() as c:
                if source=='movement':
                    c.execute("INSERT INTO movimientos_inventario(articulo_id,motivo,cantidad_firmada) VALUES (%s,'AJUSTE_ENTRADA',1)",[article['id']])
                else:
                    c.execute("INSERT INTO compras DEFAULT VALUES RETURNING id")
                    purchase=c.fetchone()[0]
                    c.execute("INSERT INTO detalles_compra(compra_id,articulo_id,cantidad,costo_unitario) VALUES (%s,%s,1,1)",[purchase,article['id']])
            self.assertEqual(self.patch('articulos',article['id'],{'unidad_id':self.other_unit.pk}).status_code,409)

    def test_filters_search_and_soft_delete(self):
        cat=self.create('categorias-articulo',nombre='Ficticios')
        a=self.article(tipo='VENTA',visible_catalogo=True,categoria_id=cat['id'],sku='SKU-TEST',nombre='Sérum')
        self.article(tipo='AMBOS')
        for params in [{'tipo':'VENTA'},{'categoria':cat['id']},{'search':'serum'},{'search':'sku-test'},{'visible_catalogo':'true'}]:
            self.assertEqual(self.client.get(ADMIN+'articulos/',params).json()['count'],1)
        self.assertEqual(self.client.post(ADMIN+'articulos/'+str(a['id'])+'/desactivar/').status_code,200)
        self.assertEqual(self.client.get(ADMIN+'articulos/',{'activo':'false'}).json()['count'],1)
        self.assertEqual(self.client.post(ADMIN+'articulos/'+str(a['id'])+'/reactivar/').status_code,200)
        self.assertEqual(self.client.delete(ADMIN+'articulos/'+str(a['id'])+'/').status_code,405)

