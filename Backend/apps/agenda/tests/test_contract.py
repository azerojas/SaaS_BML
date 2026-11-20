import json
from django.conf import settings
from django.test import SimpleTestCase
from django.urls import resolve
from django.http import QueryDict
from apps.agenda.presentation import serializers as s
from apps.agenda.presentation.views import availability_input


class ContractTests(SimpleTestCase):
    def test_json_examples_validate_against_real_dtos(self):
        examples=json.loads((settings.BASE_DIR/'apps/agenda/examples/api-examples.json').read_text(encoding='utf-8'))
        cases={'profesional':s.ProfessionalInput,'especialidades':s.SpecialtiesInput,'horario':s.ScheduleInput,'bloqueo':s.BlockInput,
            'crear_cita':s.BookingInput,'reprogramar':s.RescheduleInput,'cancelar':s.CancelInput,'confirmar_o_completar_o_expirar':s.StrictInput,
            'vincular_llegada':s.LinkInput,'lista_espera':s.WaitInput,'oferta_manual':s.OfferInput,'convertir_espera':s.ConvertInput,
            'retirar_horario_o_bloqueo':s.RetireInput,'configurar':s.ConfigInput}
        for name,cls in cases.items():
            with self.subTest(name=name):
                serializer=cls(data=examples[name])
                self.assertTrue(serializer.is_valid(),serializer.errors)
        availability_input(QueryDict(examples['disponibilidad_query']))

    def test_openapi_routes_methods_security_and_idempotency_headers(self):
        doc=json.loads((settings.BASE_DIR/'docs/openapi.json').read_text(encoding='utf-8'))
        paths={path:spec for path,spec in doc['paths'].items() if path.startswith(('/api/v1/agenda/','/api/v1/public/agenda/')) and not path.startswith('/api/v1/agenda/solicitudes/')}
        self.assertEqual(len(paths),31)
        for path,spec in paths.items():
            match=resolve(path.replace('{id}','1').replace('{key}','550e8400-e29b-41d4-a716-446655440000'))
            public='/public/' in path
            for method,operation in spec.items():
                with self.subTest(path=path,method=method):
                    if public:
                        self.assertEqual(method,'get')
                        self.assertEqual(operation['security'],[])
                        self.assertIn('429',operation['responses'])
                    else:
                        self.assertIn(method,match.func.actions)
                        self.assertNotEqual(operation.get('security'),[])
                        self.assertIn('agenda.',operation['description'])
                        if method in ('post','put','patch','delete'):
                            headers={item['name'] for item in operation['parameters'] if item['in']=='header'}
                            expected={'X-CSRFToken'}
                            if path!='/api/v1/agenda/profesionales/mi-agenda/':
                                expected.add('Idempotency-Key')
                            self.assertEqual(headers,expected)
