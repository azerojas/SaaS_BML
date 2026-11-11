from datetime import datetime,time
from decimal import Decimal as D
from types import SimpleNamespace
from django.test import SimpleTestCase
from apps.agenda.domain.rules import transition,overlaps,fits,amounts,ZONE
from apps.agenda.domain.errors import AgendaError
from apps.agenda.presentation.serializers import BookingInput,ProfessionalInput


class RuleTests(SimpleTestCase):
    def test_half_open_intervals_adjacency_and_iso_weekday(self):
        a=datetime(2026,11,10,10,tzinfo=ZONE)
        b=a.replace(hour=11)
        self.assertFalse(overlaps(a,b,b,b.replace(hour=12)))
        self.assertTrue(fits(a,b,[(2,time(10),time(18))],15))
        self.assertFalse(fits(a.replace(minute=7),b,[(2,time(10),time(18))],15))
        self.assertFalse(fits(a,b,[(1,time(10),time(18))],15))

    def test_transitions_terminal_and_money_rounding(self):
        transition('PROGRAMADA','CONFIRMADA')
        for state in ['CANCELADA','COMPLETADA','EXPIRADA','NO_ASISTIO']:
            with self.assertRaises(AgendaError):transition(state,'PROGRAMADA')
        row=SimpleNamespace(precio_base=D('0.05'),duracion_minutos=30,requiere_anticipo=True)
        self.assertEqual(amounts([row],SimpleNamespace(anticipo_porcentaje=D('10'))),(D('.05'),30,D('.01')))
        with self.assertRaises(AgendaError):amounts([row],SimpleNamespace(anticipo_porcentaje=D('0')))

    def test_strict_timezone_unknown_fields_and_decimal_strings(self):
        data={'clienta_id':1,'profesional_id':1,'servicios':[1],'inicio_en':'2026-11-10T10:00:00'}
        self.assertFalse(BookingInput(data=data).is_valid())
        self.assertFalse(BookingInput(data={**data,'inicio_en':data['inicio_en']+'-05:00','precio_total':'1.00'}).is_valid())
        self.assertFalse(ProfessionalInput(data={'nombres':'Test','apellidos':'Test','comision_porcentaje':10}).is_valid())
