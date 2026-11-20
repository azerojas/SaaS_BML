from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.catalogo.serializers.inputs import ServicioInput, ArticuloInput


class DescriptionLimitsTests(SimpleTestCase):
    def test_optional_descriptions_share_nonempty_length_limits(self):
        for serializer in (ServicioInput, ArticuloInput):
            field=serializer().fields['descripcion']
            with self.subTest(serializer=serializer.__name__):
                self.assertEqual(field.run_validation(''), '')
                self.assertIsNone(field.run_validation(None))
                for length in (10, 2000):
                    self.assertEqual(len(field.run_validation('a'*length)),length)
                for length in (9, 2001):
                    with self.assertRaises(ValidationError):
                        field.run_validation('a'*length)
