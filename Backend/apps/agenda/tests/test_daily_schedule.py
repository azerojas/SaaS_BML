from datetime import timedelta
import uuid
from django.contrib.auth.models import Permission
from django.test import override_settings
from apps.agenda.models import DailySchedule, PublicBookingRequest
from negocio import models as m
from .base import AgendaTestCase, START, NOW, API


@override_settings(AGENDA_REQUIRE_DEPOSITS=False)
class DailyScheduleTests(AgendaTestCase):
    def payload(self, **changes):
        return {'profesional_id': self.prof, 'fecha': START.date().isoformat(),
            'franjas': [{'inicio':'09:00','fin':'12:00'},{'inicio':'15:00','fin':'18:00'}], **changes}

    def set_day(self, **changes):
        return self.call('disponibilidad-diaria/', self.payload(**changes))

    def test_dated_hours_replace_weekly_and_reach_real_booking_validation(self):
        response = self.set_day()
        self.assertEqual(response.status_code,200,response.data)
        slots = self.get_slots()['slots']
        starts = {row['inicio_en'] for row in slots}
        self.assertIn(START.replace(hour=9).isoformat(),starts)
        self.assertIn(START.replace(hour=15).isoformat(),starts)
        self.assertNotIn(START.replace(hour=13).isoformat(),starts)
        self.call('citas/',self.booking(start=START.replace(hour=9)),status=201)
        self.call('citas/',self.booking(start=START.replace(hour=13)),status=409)
        other = self.get_slots(fecha=(START+timedelta(days=7)).date().isoformat())
        self.assertEqual(other['slots'][0]['inicio_en'],(START+timedelta(days=7)).isoformat())

    def test_closed_day_is_distinct_from_weekly_fallback(self):
        response=self.set_day(franjas=[])
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(response.data['cerrado'])
        self.assertEqual(self.get_slots()['slots'],[])
        self.call('citas/',self.booking(),status=409)

    def test_public_availability_obeys_same_day_override(self):
        self.item.visible_catalogo=True
        self.item.save(update_fields=['visible_catalogo'])
        self.set_day(franjas=[{'inicio':'15:00','fin':'18:00'}])
        self.assertEqual(self.get_slots(public=True)['slots'][0]['inicio_en'],START.replace(hour=15).isoformat())

    def test_invalid_overlapping_reverse_and_past_ranges_do_not_write(self):
        for changes in [
            {'franjas':[{'inicio':'10:00','fin':'11:00'},{'inicio':'10:30','fin':'12:00'}]},
            {'franjas':[{'inicio':'13:00','fin':'10:00'}]},
            {'fecha':(NOW-timedelta(days=1)).date().isoformat()},
            {'franjas':[{'inicio':'24:00','fin':'25:00'}]},
        ]:
            response=self.set_day(**changes)
            self.assertEqual(response.status_code,400,response.data)
        self.assertFalse(DailySchedule.objects.exists())

    def test_adjacent_intervals_merge_and_allow_service_across_boundary(self):
        response=self.set_day(franjas=[{'inicio':'10:00','fin':'10:30'},{'inicio':'10:30','fin':'11:00'}])
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['franjas'],[{'inicio':'10:00','fin':'11:00'}])
        self.call('citas/',self.booking(),status=201)

    def test_cannot_remove_coverage_of_existing_appointment(self):
        pk=self.reserve()
        response=self.set_day(franjas=[{'inicio':'15:00','fin':'18:00'}])
        self.assertEqual(response.status_code,409,response.data)
        self.assertEqual(response.data['code'],'DAY_HAS_BOOKINGS')
        self.assertFalse(DailySchedule.objects.exists())
        self.assertEqual(m.Citas.objects.get(pk=pk).inicio_en,START)

    def test_pending_online_request_also_preserves_day_coverage(self):
        PublicBookingRequest.objects.create(nombres='Solicitud',apellidos='Ficticia',telefono='+51987654321',
            profesional_id=self.prof,servicios=[],inicio_en=START,fin_en=START+timedelta(hours=1),
            precio_total='80',duracion_minutos=60,version_aviso='test',expira_en=NOW+timedelta(minutes=30))
        response=self.set_day(franjas=[])
        self.assertEqual(response.status_code,409,response.data)
        self.assertFalse(DailySchedule.objects.exists())

    def test_restore_weekly_is_idempotent_and_rejects_uncovered_booking(self):
        self.set_day()
        pk=self.call('citas/',self.booking(start=START.replace(hour=9)),status=201).json()['cita_id']
        data={'fecha':START.date().isoformat(),'profesional_id':self.prof}
        self.call('disponibilidad-diaria/restablecer/',data,status=409)
        self.call(f'citas/{pk}/cancelar/',{'motivo':'Cancelación solicitada para probar restauración'},status=200)
        self.call('disponibilidad-diaria/restablecer/',data,status=200)
        self.call('disponibilidad-diaria/restablecer/',data,status=200)
        self.assertFalse(DailySchedule.objects.exists())
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'],START.isoformat())

    def test_weekly_edit_respects_dated_override_of_future_appointment(self):
        self.set_day()
        self.call('citas/',self.booking(start=START.replace(hour=9)),status=201)
        self.call(f'horarios/{self.schedule}/',{'hora_inicio':'11:00','hora_fin':'17:00'},method='patch',status=200)
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'],START.isoformat())

    def test_permissions_and_unknown_fields(self):
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='view_agenda'))
        self.client.force_authenticate(self.staff)
        response=self.set_day()
        self.assertEqual(response.status_code,403)
        response=self.client.get(API+'disponibilidad-diaria/',{'desde':START.date().isoformat(),'hasta':(START+timedelta(days=1)).date().isoformat()})
        self.assertEqual(response.status_code,200,response.data)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.set_day(usuario_id=self.staff.pk).status_code,400)

    def test_retry_and_read_only_intent_recovery(self):
        key=str(uuid.uuid4())
        first=self.call('disponibilidad-diaria/',self.payload(),key=key,status=200)
        second=self.call('disponibilidad-diaria/',self.payload(),key=key,status=200)
        self.assertEqual(first.json(),second.json())
        self.assertEqual(DailySchedule.objects.count(),1)
        result=self.client.get(API+f'intentos/{key}/',{'operacion':'agenda.jornada.guardar'})
        self.assertEqual(result.status_code,200,result.data)
        self.assertTrue(result.data['encontrado'])
