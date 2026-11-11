import json
from django.conf import settings
from django.test import SimpleTestCase
from django.urls import resolve
from apps.finanzas.presentation import serializers as s


class FinanceContractTests(SimpleTestCase):
    def test_documented_examples_validate_against_real_dtos(self):
        examples=json.loads((settings.BASE_DIR/'apps/finanzas/examples/api-examples.json').read_text(encoding='utf-8'))
        cases={
            'abrir_visita':s.VisitCreate,'crear_venta':s.SaleCreate,'previsualizar':s.Preview,
            'confirmar_venta':s.ConfirmSale,'confirmar_solo_productos':s.ConfirmSale,
            'confirmar_servicio_sin_insumos':s.ConfirmSale,'pago_parcial':s.PaymentInput,
            'crear_anticipo':s.AdvanceCreate,'confirmar_anticipo':s.AdvanceConfirm,
            'aplicar_anticipo':s.AdvanceApply,'anular_error_pago':s.VoidPayment,
            'anular_borrador_o_anticipo_pendiente':s.Reason,
        }
        for name,cls in cases.items():
            with self.subTest(name=name):
                serializer=cls(data=examples[name])
                self.assertTrue(serializer.is_valid(),serializer.errors)

    def test_finance_contract_methods_permissions_and_idempotency_match_routes(self):
        document=json.loads((settings.BASE_DIR/'docs/openapi.json').read_text(encoding='utf-8'))
        paths={path:spec for path,spec in document['paths'].items()
               if path.startswith(('/api/visitas/','/api/ventas/','/api/pagos/','/api/anticipos/'))}
        self.assertEqual(len(paths),21)
        for path,spec in paths.items():
            match=resolve(path.replace('{id}','1'))
            for method,operation in spec.items():
                if method=='parameters':continue
                with self.subTest(path=path,method=method):
                    self.assertIn(method,match.func.actions)
                    self.assertNotEqual(operation.get('security'),[])
                    self.assertIn('finanzas.',operation['description'])
                    self.assertIn('503',operation['responses'])
                    headers={param['name'] for param in operation.get('parameters',[]) if param['in']=='header'}
                    if method in ('post','patch'):
                        self.assertIn('X-CSRFToken',headers)
                        if 'previsualizar' not in path:self.assertIn('Idempotency-Key',headers)
