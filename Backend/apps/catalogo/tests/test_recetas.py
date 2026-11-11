from unittest.mock import patch
from negocio import models as m
from .base import CatalogTestCase, ADMIN


class RecipeTests(CatalogTestCase):
    def test_replace_clear_and_no_cost_or_movements(self):
        service=self.service()
        a=self.article()
        b=self.article(tipo='AMBOS',unidad_id=self.other_unit.pk)
        path=ADMIN+'servicios/'+str(service['id'])+'/receta/'
        response=self.client.put(path,{'insumos':[{'articulo_id':a['id'],'cantidad_estimada':'0.200'},{'articulo_id':b['id'],'cantidad_estimada':'2.000'}]},format='json')
        self.assertEqual(response.status_code,200,response.data)
        data=response.json()
        self.assertIsNone(data['costo_estimado'])
        self.assertEqual({x['unidad'] for x in data['insumos']},{'ML','GR'})
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        self.assertEqual(m.ConsumosServicio.objects.count(),0)
        self.assertEqual(self.client.get(path).status_code,200)
        self.assertEqual(self.client.put(path,{'insumos':[]},format='json').status_code,200)
        self.assertFalse(m.RecetasServicio.objects.filter(servicio_id=service['id']).exists())

    def test_invalid_ingredients_and_atomic_preservation(self):
        service=self.service()
        a=self.article()
        venta=self.article(tipo='VENTA')
        inactive=self.article(activo=False)
        path=ADMIN+'servicios/'+str(service['id'])+'/receta/'
        valid={'articulo_id':a['id'],'cantidad_estimada':'1.000'}
        self.assertEqual(self.client.put(path,{'insumos':[valid]},format='json').status_code,200)
        cases=[[valid,valid],[{'articulo_id':venta['id'],'cantidad_estimada':'1'}],
               [{'articulo_id':inactive['id'],'cantidad_estimada':'1'}],
               [{'articulo_id':999999,'cantidad_estimada':'1'}],
               [{**valid,'cantidad_estimada':'0'}],[{**valid,'cantidad_estimada':'-1'}],
               [{**valid,'cantidad_estimada':'0.0001'}],[{**valid,'unidad_id':self.unit.pk}]]
        for rows in cases:
            self.assertEqual(self.client.put(path,{'insumos':rows},format='json').status_code,400)
            self.assertEqual(list(m.RecetasServicio.objects.filter(servicio_id=service['id']).values_list('articulo_id',flat=True)),[a['id']])

    def test_audit_failure_rolls_back_replacement(self):
        service=self.service()
        a=self.article()
        b=self.article()
        path=ADMIN+'servicios/'+str(service['id'])+'/receta/'
        self.client.put(path,{'insumos':[{'articulo_id':a['id'],'cantidad_estimada':'1'}]},format='json')
        with patch('apps.catalogo.services.audit',side_effect=RuntimeError('test audit failure')):
            with self.assertRaises(RuntimeError):
                self.client.put(path,{'insumos':[{'articulo_id':b['id'],'cantidad_estimada':'2'}]},format='json')
        self.assertEqual(list(m.RecetasServicio.objects.filter(servicio_id=service['id']).values_list('articulo_id',flat=True)),[a['id']])

