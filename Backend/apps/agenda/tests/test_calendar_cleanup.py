from apps.agenda.application.calendar_cleanup import clear_calendar
from apps.agenda.application.selectors import list_rows, detail
from apps.agenda.models import CalendarArchive, DailySchedule
from negocio import models as m
from .base import AgendaTestCase, START, API


class CalendarCleanupTests(AgendaTestCase):
    def test_cleanup_empties_agenda_preserving_advance_and_appointment_details(self):
        identifier=self.reserve()
        actor=self.admin
        # A real pending advance must keep its original FK and amount.
        m.AnticiposCita.objects.create(cita_id=identifier,metodo='EFECTIVO',monto='20.00',estado='PENDIENTE',registrado_por=actor)
        DailySchedule.objects.create(profesional_id=self.prof,fecha=START.date(),franjas=[{'inicio':'10:00','fin':'18:00','cupo_unico':True}])
        summary=clear_calendar(actor)
        self.assertEqual(summary['archived_appointments'],1)
        self.assertEqual(summary['cancelled_active'],1)
        self.assertFalse(list_rows('citas',{}).exists())
        self.assertFalse(DailySchedule.objects.exists())
        self.assertFalse(m.HorariosProfesional.objects.exists())
        self.assertEqual(m.Citas.objects.get(pk=identifier).estado,'CANCELADA')
        self.assertEqual(m.AnticiposCita.objects.get(cita_id=identifier).monto,20)
        self.assertEqual(detail(identifier)[0].pk,identifier)
        self.assertEqual(self.client.get(API+'citas/'+str(identifier)+'/').status_code,200)
        self.assertEqual(self.client.get(API+'citas/').json()['count'],0)
        self.assertTrue(CalendarArchive.objects.filter(appointment_id=identifier).exists())
        self.assertEqual(clear_calendar(actor)['archived_appointments'],0)

    def test_read_only_user_cannot_clear_calendar(self):
        from django.contrib.auth import get_user_model
        reader=get_user_model().objects.create_user('calendar_reader')
        with self.assertRaises(PermissionError):
            clear_calendar(reader)
        self.assertTrue(m.HorariosProfesional.objects.exists())
