from datetime import datetime,time,date,timedelta
from decimal import Decimal as D
from unittest.mock import patch
from django.test import override_settings
import uuid
from apps.reporting.tests.base import ReportTestCase
from apps.agenda.domain.rules import ZONE
from negocio import models as m

API='/api/v1/agenda/'
# Always a future Tuesday relative to the real PostgreSQL clock (which isn't mocked).
_today=datetime.now(ZONE).date()
_tuesday=_today+timedelta(days=(1-_today.weekday())%7+7)
START=datetime.combine(_tuesday,time(10),ZONE)
NOW=START-timedelta(hours=26)


@override_settings(AGENDA_REQUIRE_DEPOSITS=True)
class AgendaTestCase(ReportTestCase):
    def setUp(self):
        super().setUp()
        clock=patch('django.utils.timezone.now',return_value=NOW)
        clock.start()
        self.addCleanup(clock.stop)
        m.ConfiguracionReservas.objects.create(id=1,reservas_online_activas=True,intervalo_slots_minutos=15,anticipacion_minima_minutos=0,
            anticipacion_maxima_dias=60,horas_limite_cancelacion=24,anticipo_porcentaje=D('20'),minutos_expiracion_pago=30,
            max_citas_activas_por_clienta=3,actualizado_en=NOW)
        self.prof=self.call('profesionales/',{'nombres':'Profesional','apellidos':'Ficticia','visible_reservas':True},status=201).json()['profesional_id']
        self.item=self.service()
        self.item.duracion_minutos=60
        self.item.reservable_online=True
        self.item.save(update_fields=['duracion_minutos','reservable_online'])
        self.call('profesionales/'+str(self.prof)+'/especialidades/',{'servicios':[self.item.pk]},method='put',status=200)
        self.schedule=self.call('horarios/',{'profesional_id':self.prof,'dia_semana':2,'hora_inicio':'10:00','hora_fin':'18:00'},status=201).json()['horario_id']

    def call(self,path,data=None,method='post',key=None,status=None):
        response=getattr(self.client,method)(API+path,data or {},format='json',HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))
        if status is not None:self.assertEqual(response.status_code,status,getattr(response,'data',None))
        return response

    def booking(self,start=START,**changes):
        return {'clienta_id':self.person.pk,'profesional_id':self.prof,'servicios':[self.item.pk],'inicio_en':start.isoformat(),**changes}

    def reserve(self,**changes):
        return self.call('citas/',self.booking(**changes),status=201).json()['cita_id']

    def get_slots(self,public=False,**changes):
        params={'fecha':START.date().isoformat(),'profesional_id':self.prof,'servicios':str(self.item.pk),**changes}
        path='/api/v1/public/agenda/disponibilidad/' if public else API+'calendario/disponibilidad/'
        response=self.client.get(path,params)
        self.assertEqual(response.status_code,200,response.data)
        return response.json()
