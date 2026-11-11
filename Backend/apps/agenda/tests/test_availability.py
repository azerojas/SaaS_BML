from datetime import timedelta
from django.db import connection
from django.contrib.auth.models import Permission
from negocio import models as m
from .base import AgendaTestCase,API,NOW,START


class AvailabilityTests(AgendaTestCase):
    def test_sql_function_equivalent_without_expired_pending_and_adjacent_slots(self):
        result=self.get_slots()
        self.assertEqual(len(result['slots']),29)
        with connection.cursor() as cursor:
            cursor.execute('SELECT inicio_en,fin_en FROM fn_slots_disponibles(%s,%s,%s)',[self.prof,START.date(),60])
            sql=list(cursor.fetchall())
        from datetime import datetime
        self.assertEqual([(datetime.fromisoformat(row['inicio_en']),datetime.fromisoformat(row['fin_en'])) for row in result['slots']],sql)
        self.reserve()
        result=self.get_slots()
        self.assertEqual(result['slots'][0]['inicio_en'],(START+timedelta(hours=1)).isoformat())

    def test_global_and_professional_blocks_cannot_override_bookings(self):
        self.call('bloqueos/',{'inicio_en':START.isoformat(),'fin_en':(START+timedelta(hours=1)).isoformat(),'motivo':'Cierre global ficticio'},status=201)
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'],(START+timedelta(hours=1)).isoformat())
        self.call('citas/',self.booking(),status=409)
        self.reserve(start=START+timedelta(hours=1))
        self.call('bloqueos/',{'profesional_id':self.prof,'inicio_en':(START+timedelta(hours=1)).isoformat(),'fin_en':(START+timedelta(hours=2)).isoformat(),'motivo':'Bloqueo en cita ficticia'},status=409)

    def test_schedule_overlap_retirement_and_orphan_bookings_policy(self):
        self.call('horarios/',{'profesional_id':self.prof,'dia_semana':2,'hora_inicio':'11:00','hora_fin':'12:00'},status=409)
        self.call('horarios/',{'profesional_id':self.prof,'dia_semana':2,'hora_inicio':'22:00','hora_fin':'02:00'},status=400)
        self.reserve()
        self.call('horarios/'+str(self.schedule)+'/',{'confirmar_retiro':True,'motivo':'Retiro ficticio horario'},method='delete',status=409)

    def test_public_minimal_read_only_and_opt_out(self):
        from rest_framework.test import APIClient
        from django.test import override_settings
        public=APIClient()
        for resource in ['profesionales','servicios']:
            response=public.get('/api/v1/public/agenda/'+resource+'/')
            self.assertEqual(response.status_code,200)
            for forbidden in ['telefono','usuario_id','token_gestion','clienta_id','comision_porcentaje']:self.assertNotIn(forbidden,str(response.json()))
        self.assertEqual(public.post('/api/v1/public/agenda/disponibilidad/',self.booking(),format='json').status_code,405)
        self.assertEqual(public.get('/api/v1/public/agenda/profesionales/',{'telefono':'+51999123456'}).status_code,400)
        with override_settings(AGENDA_PUBLIC_READ_ENABLED=False):
            self.assertEqual(public.get('/api/v1/public/agenda/profesionales/').status_code,404)
        m.Profesionales.objects.filter(pk=self.prof).update(visible_reservas=False)
        self.assertEqual(public.get('/api/v1/public/agenda/disponibilidad/',{'fecha':'2026-11-10','profesional_id':self.prof,'servicios':str(self.item.pk)}).status_code,404)
