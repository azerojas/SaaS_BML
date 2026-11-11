from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import timedelta
from decimal import Decimal as D
from io import StringIO
import uuid
from django.db import connections
from negocio import models as m
from apps.agenda.application import bookings,administration,waitlist,expiry
from apps.agenda.domain.commands import BookingCommand
from apps.agenda.infrastructure.transactions import execute
from apps.agenda.domain.errors import AgendaError
from apps.finanzas.domain.errors import FinanceError
from apps.finanzas.infrastructure.idempotency import execute as finance_execute
from apps.finanzas.application import advances
from .base import AgendaTestCase,NOW,START


class ConcurrencyTests(AgendaTestCase):
    def race(self,callbacks):
        barrier=Barrier(len(callbacks))
        def run(callback):
            try:
                barrier.wait(timeout=10)
                return 'ok',callback()
            except (AgendaError,FinanceError) as error:return 'conflict',error.code
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=len(callbacks)) as pool:
            futures=[pool.submit(run,callback) for callback in callbacks]
            return [future.result(timeout=20) for future in futures]

    def reserve_callback(self,key=None,professional=None,client=None,start=START):
        command=BookingCommand(client or self.person.pk,professional or self.prof,(self.item.pk,),start)
        key=key or str(uuid.uuid4())
        return lambda:execute('cita.crear',key,{'client':command.clienta_id,'prof':command.profesional_id,'start':start},self.admin,
            lambda parsed:bookings.create(command,self.admin),201)

    def test_simultaneous_same_slot_one_winner_and_no_children_left_from_loser(self):
        outcomes=self.race([self.reserve_callback(),self.reserve_callback()])
        self.assertEqual(sorted(status for status,_ in outcomes),['conflict','ok'])
        self.assertEqual(m.Citas.objects.count(),1)
        self.assertEqual(m.CitaServicios.objects.count(),1)
        self.assertEqual(m.CitaEstadosHistorial.objects.count(),1)

    def test_identical_key_simultaneous_requests_return_one_result(self):
        key=str(uuid.uuid4())
        outcomes=self.race([self.reserve_callback(key),self.reserve_callback(key)])
        self.assertEqual({status for status,_ in outcomes},{'ok'})
        self.assertEqual(outcomes[0][1],outcomes[1][1])
        self.assertEqual(m.Citas.objects.count(),1)

    def test_global_block_and_booking_are_serialized_with_one_winner(self):
        data={'inicio_en':START,'fin_en':START+timedelta(hours=1),'motivo':'Bloqueo ficticio simultaneo'}
        block=lambda:execute('bloqueo.crear',str(uuid.uuid4()),data,self.admin,lambda key:administration.block(data,self.admin))
        outcomes=self.race([self.reserve_callback(),block])
        self.assertEqual(sorted(status for status,_ in outcomes),['conflict','ok'])
        self.assertEqual(m.Citas.objects.count()+m.BloqueosAgenda.objects.count(),1)

    def test_one_client_two_professionals_simultaneously_cannot_overlap(self):
        other=m.Profesionales.objects.create(nombres='Otra',apellidos='Ficticia')
        m.ProfesionalServicios.objects.create(profesional=other,servicio=self.item)
        m.HorariosProfesional.objects.create(profesional=other,dia_semana=2,hora_inicio='10:00',hora_fin='18:00')
        outcomes=self.race([self.reserve_callback(),self.reserve_callback(professional=other.pk)])
        self.assertEqual(sorted(status for status,_ in outcomes),['conflict','ok'])

    def test_expiration_and_late_deposit_confirmation_never_confirm_cash(self):
        m.Servicios.objects.filter(pk=self.item.pk).update(requiere_anticipo=True)
        appointment=self.reserve()
        response=self.mutate('anticipos/',{'cita_id':appointment,'metodo':'EFECTIVO','monto':'16.00'},expected=201)
        advance=response.json()['anticipo_id']
        m.Citas.objects.filter(pk=appointment).update(expira_en=NOW)
        data={'verificado_manualmente':True}
        confirm=lambda:finance_execute('anticipo.confirmar',str(uuid.uuid4()),data,self.admin,lambda key:(advances.confirm_advance(advance,data,self.admin),200))
        outcomes=self.race([lambda:expiry.expire_pending(),confirm])
        self.assertEqual(sorted(status for status,_ in outcomes),['conflict','ok'])
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'EXPIRADA')
        self.assertEqual(m.AnticiposCita.objects.get(pk=advance).estado,'PENDIENTE')
        self.assertEqual(m.Pagos.objects.count(),0)

    def test_waitlist_conversion_race_creates_only_one_booking(self):
        entry=self.call('lista-espera/',{'clienta_id':self.person.pk,'servicio_id':self.item.pk,'profesional_id':self.prof,'fecha_deseada':START.date().isoformat()},status=201).json()['espera_id']
        data={'inicio_en':START}
        def convert():return execute('espera.convertir',str(uuid.uuid4()),{'id':entry,'data':data},self.admin,lambda key:waitlist.resolve(entry,'convertir',data,self.admin),201)
        outcomes=self.race([convert,convert])
        self.assertEqual(sorted(status for status,_ in outcomes),['conflict','ok'])
        self.assertEqual(m.Citas.objects.count(),1)
        self.assertEqual(m.ListaEspera.objects.get(pk=entry).estado,'CONVERTIDA')
