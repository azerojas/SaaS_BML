import uuid
from apps.catalogo.tests.base import CatalogTestCase
from negocio import models as m

API='/api/'


class InventoryTestCase(CatalogTestCase):
    def provider(self, **changes):
        r=self.client.post(API+'proveedores/',{'nombre':'Proveedor ficticio',**changes},format='json')
        self.assertEqual(r.status_code,201,r.data)
        return r.json()

    def line(self, article=None, **changes):
        article=article or self.article()
        return {'articulo_id':article['id'],'unidad_id':article.get('unidad_id',self.unit.pk),
                'cantidad':'2.000','costo_unitario':'3.2500',**changes}

    def purchase(self, lines=None, **changes):
        data={**changes}
        if lines is not None:data['detalles']=lines
        r=self.client.post(API+'compras/',data,format='json')
        self.assertEqual(r.status_code,201,r.data)
        return r.json()

    def receive(self, purchase):
        return self.client.post(API+'compras/'+str(purchase['id'])+'/recibir/',{},format='json')

    def adjustment(self, article, tipo='AJUSTE_ENTRADA', cantidad='5.000', key=None, **changes):
        return self.client.post(API+'inventario/ajustes/',{
            'articulo_id':article['id'],'unidad_id':article.get('unidad_id',self.unit.pk),
            'tipo':tipo,'cantidad':cantidad,'justificacion':'Conteo fisico ficticio',**changes},
            format='json',HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))

    def stock_row(self, article):
        response=self.client.get(API+'inventario/stock/',{'articulo':article['id']})
        self.assertEqual(response.status_code,200,response.data)
        return response.json()['results'][0]

