from datetime import timedelta
from apps.agenda.models import DailySchedule
from negocio import models as m
from .base import AgendaTestCase, API, START


class TeamCalendarTests(AgendaTestCase):
    def test_team_queries_exclude_admin_appointments_hours_and_roster_entry(self):
        own=self.client.post(API+'profesionales/mi-agenda/',{},format='json').json()['id']
        m.ProfesionalServicios.objects.create(profesional_id=own,servicio=self.item)
        other_booking=self.reserve()
        DailySchedule.objects.create(profesional_id=own,fecha=START.date(),franjas=[{'inicio':'12:00','fin':'14:00','cupo_unico':True}])
        DailySchedule.objects.create(profesional_id=self.prof,fecha=START.date(),franjas=[{'inicio':'10:00','fin':'18:00'}])
        DailySchedule.objects.create(profesional_id=None,fecha=START.date(),franjas=[{'inicio':'10:00','fin':'18:00'}])
        self.reserve(profesional_id=own,start=START.replace(hour=12))
        filters={'desde':START.date().isoformat(),'hasta':(START+timedelta(days=1)).date().isoformat(),'excluir_profesional_id':own}
        calendar=self.client.get(API+'calendario/',filters)
        self.assertEqual(calendar.status_code,200,calendar.data)
        self.assertEqual([row['id'] for row in calendar.json()['results']],[other_booking])
        roster=self.client.get(API+'profesionales/',{'excluir_profesional_id':own}).json()
        self.assertNotIn(own,[row['id'] for row in roster['results']])
        daily=self.client.get(API+'disponibilidad-diaria/',filters)
        self.assertEqual(daily.status_code,200,daily.data)
        self.assertEqual({row['profesional_id'] for row in daily.json()['results']},{None,self.prof})

    def test_exclusion_filter_requires_a_positive_identifier(self):
        filters={'desde':START.date().isoformat(),'hasta':(START+timedelta(days=1)).date().isoformat(),'excluir_profesional_id':'-1'}
        for endpoint in ['calendario/','disponibilidad-diaria/']:
            self.assertEqual(self.client.get(API+endpoint,filters).status_code,400)
