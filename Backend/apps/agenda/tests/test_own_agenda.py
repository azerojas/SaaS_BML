from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from apps.agenda.models import DailySchedule
from negocio import models as m
from .base import AgendaTestCase, API, START


class OwnAgendaTests(AgendaTestCase):
    def setUp(self):
        super().setUp()
        self.own_id = self.reserve()
        self.other_client = m.Clientas.objects.create(nombres='Otra', apellidos='Clienta', telefono='+51999123457', activa=True, acepta_recordatorios=False, canal_preferido='EMAIL')
        self.other_prof = m.Profesionales.objects.create(nombres='Otra', apellidos='Especialista', activa=True)
        m.ProfesionalServicios.objects.create(profesional=self.other_prof, servicio=self.item)
        m.HorariosProfesional.objects.create(profesional=self.other_prof, dia_semana=2, hora_inicio='10:00', hora_fin='18:00')
        self.other_id = self.call('citas/', self.booking(clienta_id=self.other_client.pk, profesional_id=self.other_prof.pk), status=201).json()['cita_id']
        self.specialist = get_user_model().objects.create_user('own_agenda_test', is_staff=True)
        self.specialist.user_permissions.add(Permission.objects.get(content_type__app_label='agenda', codename='view_own_agenda'))
        m.Profesionales.objects.filter(pk=self.prof).update(usuario=self.specialist)
        self.client.force_authenticate(self.specialist)

    def test_calendar_and_list_are_scoped_even_with_foreign_filters(self):
        for endpoint in ('citas/', 'calendario/'):
            params = {'desde': START.date().isoformat(), 'hasta': (START + timedelta(days=1)).date().isoformat()}
            response = self.client.get(API + endpoint, params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row['id'] for row in response.json()['results']], [self.own_id])
            response = self.client.get(API + endpoint, {**params, 'profesional_id': self.other_prof.pk})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['results'], [])

    def test_own_detail_contains_names_and_foreign_detail_is_not_found(self):
        response = self.client.get(API + f'citas/{self.own_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['clienta_nombre'], 'Daniela Ficticia')
        self.assertEqual(response.json()['servicios_nombres'], [self.item.nombre])
        self.assertEqual(self.client.get(API + f'citas/{self.other_id}/').status_code, 404)

    def test_professionals_and_weekly_hours_do_not_disclose_other_specialists(self):
        for endpoint, key, expected in [('profesionales/', 'id', self.prof), ('horarios/', 'profesional_id', self.prof)]:
            response = self.client.get(API + endpoint)
            self.assertEqual(response.status_code, 200)
            self.assertEqual({row[key] for row in response.json()['results']}, {expected})
        self.assertEqual(self.client.get(API + f'profesionales/{self.other_prof.pk}/').status_code, 404)

    def test_blocks_and_dated_hours_include_shared_entries_but_not_other_specialists(self):
        for identifier in (None, self.prof, self.other_prof.pk):
            m.BloqueosAgenda.objects.create(profesional_id=identifier, inicio_en=START + timedelta(hours=4), fin_en=START + timedelta(hours=5), motivo='Bloqueo de prueba')
            DailySchedule.objects.create(profesional_id=identifier, fecha=START.date(), franjas=[{'inicio': '10:00', 'fin': '18:00'}])
        response = self.client.get(API + 'bloqueos/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['profesional_id'] for row in response.json()['results']}, {None, self.prof})
        response = self.client.get(API + 'disponibilidad-diaria/', {'desde': START.date().isoformat(), 'hasta': (START + timedelta(days=1)).date().isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['profesional_id'] for row in response.json()['results']}, {None, self.prof})

    def test_own_only_accounts_cannot_write_even_with_an_accidental_mutation_permission(self):
        self.specialist.user_permissions.add(Permission.objects.get(content_type__app_label='agenda', codename='manage_appointments'))
        self.client.force_authenticate(get_user_model().objects.get(pk=self.specialist.pk))
        self.assertEqual(self.call(f'citas/{self.other_id}/confirmar/').status_code, 403)
        self.assertEqual(self.call(f'citas/{self.own_id}/confirmar/').status_code, 403)
        self.assertEqual(self.call('citas/', self.booking()).status_code, 403)

    def test_global_private_modules_are_denied(self):
        for endpoint in ('lista-espera/', 'solicitudes/', 'calendario/configuracion/', 'calendario/disponibilidad/'):
            self.assertEqual(self.client.get(API + endpoint).status_code, 403, endpoint)
        for endpoint in ('/api/clientas/', '/api/ventas/', '/api/v1/analytics/overview/'):
            self.assertEqual(self.client.get(endpoint).status_code, 403, endpoint)

    def test_inactive_or_unlinked_specialist_fails_closed(self):
        m.Profesionales.objects.filter(pk=self.prof).update(activa=False)
        self.assertEqual(self.client.get(API + 'citas/').status_code, 403)
        m.Profesionales.objects.filter(pk=self.prof).update(activa=True, usuario=None)
        self.assertEqual(self.client.get(API + 'profesionales/').status_code, 403)

    def test_administrator_keeps_both_simultaneous_bookings_and_cannot_double_book_a_specialist(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(API + 'citas/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.json()['results']}, {self.own_id, self.other_id})
        conflict = self.call('citas/', self.booking(clienta_id=self.other_client.pk))
        self.assertEqual(conflict.status_code, 409)
