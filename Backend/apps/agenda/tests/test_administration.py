from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test.utils import CaptureQueriesContext
from django.conf import settings
from django.utils import timezone
from time import perf_counter
import json
from negocio import models as m
from apps.agenda.application.availability import available
from apps.agenda.domain.commands import AvailabilityQuery
from .base import AgendaTestCase,API,NOW,START


class AdministrationTests(AgendaTestCase):
    def test_successful_schedule_and_block_retirements_are_audited_and_require_explicit_intent(self):
        self.call('horarios/'+str(self.schedule)+'/',{'motivo':'Retiro ficticio horario'},method='delete',status=400)
        self.call('horarios/'+str(self.schedule)+'/',{'motivo':'Retiro ficticio horario','confirmar_retiro':True},method='delete',status=200)
        self.assertFalse(m.HorariosProfesional.objects.filter(pk=self.schedule).exists())
        audit=m.Auditoria.objects.get(entidad='horarios_profesional',accion='RETIRAR_HORARIO')
        self.assertEqual(audit.datos['motivo'],'Retiro ficticio horario')
        block=self.call('bloqueos/',{'profesional_id':self.prof,'inicio_en':START.isoformat(),'fin_en':(START+timedelta(hours=1)).isoformat(),'motivo':'Bloqueo de prueba'},status=201).json()['bloqueo_id']
        self.call('bloqueos/'+str(block)+'/',{'confirmar_retiro':True,'motivo':'Fin bloqueo ficticio'},method='delete',status=200)
        self.assertFalse(m.BloqueosAgenda.objects.filter(pk=block).exists())

    def test_config_update_only_selected_fields_and_no_automatic_messages(self):
        self.call('calendario/configuracion/',{'anticipo_porcentaje':'25.00','reservas_online_activas':False},method='patch',status=200)
        config=self.client.get(API+'calendario/configuracion/').json()
        self.assertEqual(config['anticipo_porcentaje'],'25.00')
        self.assertEqual(config['intervalo_slots_minutos'],15)
        self.assertFalse(config['reservas_online_activas'])
        self.assertEqual(self.client.get('/api/v1/public/agenda/servicios/').status_code,404)
        self.reserve()
        self.assertEqual(m.NotificacionesCita.objects.count(),0)

    def test_history_trigger_and_agenda_view_agree_without_double_state_events(self):
        pk=self.reserve()
        self.call('citas/'+str(pk)+'/confirmar/',status=200)
        self.assertEqual(m.CitaEstadosHistorial.objects.filter(cita_id=pk).count(),2)
        with connection.cursor() as cursor:
            cursor.execute('SELECT cita_id,estado,fecha_local FROM vw_agenda_diaria WHERE cita_id=%s',[pk])
            result=cursor.fetchone()
        self.assertEqual(result,(pk,'CONFIRMADA',START.date()))
        rows=self.client.get(API+'calendario/',{'desde':START.date().isoformat(),'hasta':(START+timedelta(days=1)).date().isoformat()}).json()
        self.assertEqual(rows['count'],1)
        self.assertEqual(rows['results'][0]['id'],pk)

    def test_per_client_active_limit_and_no_deactivation_after_history_resolution(self):
        for hour in range(3):self.reserve(start=START+timedelta(hours=hour))
        self.call('citas/',self.booking(start=START+timedelta(hours=3)),status=409)
        for row in m.Citas.objects.all():
            self.call('citas/'+str(row.pk)+'/cancelar/',{'motivo':'Liberar citas ficticias'},status=200)
        self.call('profesionales/'+str(self.prof)+'/',{'activa':False},method='patch',status=200)
        self.assertEqual(m.Citas.objects.count(),3)
        self.assertEqual(m.CitaServicios.objects.count(),3)

    def test_service_replacement_keeps_old_snapshot_in_audit_and_blocks_deposit_overprice(self):
        pk=self.reserve()
        m.Servicios.objects.filter(pk=self.item.pk).update(precio_base=D('90'),duracion_minutos=30)
        self.call('citas/'+str(pk)+'/reprogramar/',{'inicio_en':(START+timedelta(hours=2)).isoformat(),'servicios':[self.item.pk],'motivo':'Actualizar servicio ficticio'},status=200)
        obj=m.Citas.objects.get(pk=pk)
        self.assertEqual(obj.precio_total,D('90'))
        self.assertEqual(obj.duracion_total_minutos,30)
        self.assertEqual(m.CitaServicios.objects.get(cita_id=pk).precio_snapshot,D('90'))
        audit=m.Auditoria.objects.get(entidad='citas',entidad_id=str(pk),accion='REPROGRAMAR_CITA')
        self.assertEqual(audit.datos['anterior']['servicios'][0]['precio_snapshot'],'80.00')
        m.AnticiposCita.objects.create(cita_id=pk,estado='CONFIRMADO',pagado_en=NOW,metodo='EFECTIVO',monto=D('85'))
        m.Servicios.objects.filter(pk=self.item.pk).update(precio_base=D('80'))
        self.call('citas/'+str(pk)+'/reprogramar/',{'inicio_en':START.isoformat(),'servicios':[self.item.pk],'motivo':'Precio menor al anticipo'},status=409)

    def test_cancel_confirmed_deposit_retains_cash_without_duplicate_payment(self):
        pk=self.reserve()
        advance=m.AnticiposCita.objects.create(cita_id=pk,estado='CONFIRMADO',pagado_en=NOW,metodo='EFECTIVO',monto=D('10'))
        self.call('citas/'+str(pk)+'/cancelar/',{'motivo':'Cancelacion con anticipo'},status=200)
        advance.refresh_from_db()
        self.assertEqual(advance.estado,'CONFIRMADO')
        self.assertEqual(m.Pagos.objects.count(),0)
        audit=m.Auditoria.objects.get(entidad='citas',entidad_id=str(pk),accion='CANCELAR_CITA')
        self.assertFalse(audit.datos['reembolso_automatico'])

    def test_permissions_proxy_migration_reversible_without_business_ddl(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT relname,relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') ORDER BY 1")
            original=cursor.fetchall()
        MigrationExecutor(connection).migrate([('agenda',None)])
        self.assertEqual(self.client.get(API+'citas/').status_code,503)
        MigrationExecutor(connection).migrate([('agenda','0001_agenda_permissions')])
        with connection.cursor() as cursor:
            cursor.execute("SELECT relname,relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') ORDER BY 1")
            self.assertEqual(original,cursor.fetchall())

    def test_availability_is_bounded_queries_and_read_only_with_many_bookings(self):
        query=AvailabilityQuery(self.prof,(self.item.pk,),START.date())
        with CaptureQueriesContext(connection) as empty:available(query)
        m.Citas.objects.bulk_create([m.Citas(clienta=self.person,profesional_id=self.prof,inicio_en=START+timedelta(minutes=15*i),fin_en=START+timedelta(minutes=15*i+1)) for i in range(30)])
        count=m.Auditoria.objects.count()
        start=perf_counter()
        with CaptureQueriesContext(connection) as busy:result=available(query)
        elapsed=perf_counter()-start
        self.assertEqual(len(empty),len(busy))
        self.assertLessEqual(len(busy),8)
        self.assertEqual(result['slots'],[])
        self.assertEqual(m.Auditoria.objects.count(),count)
        evidence={'appointments':30,'queries':len(busy),'empty_queries':len(empty),'elapsed_seconds':round(elapsed,6)}
        (settings.BASE_DIR/'backups/phase7-performance.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
