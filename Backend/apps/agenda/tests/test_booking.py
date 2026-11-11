from datetime import timedelta
from decimal import Decimal as D
from django.db import connection,IntegrityError,transaction
from django.contrib.auth.models import Permission
from negocio import models as m
from .base import AgendaTestCase,API,NOW,START


class BookingTests(AgendaTestCase):
    def test_create_snapshots_db_secrets_private_and_single_history(self):
        appointment=self.reserve()
        obj=m.Citas.objects.get(pk=appointment)
        self.assertEqual(obj.fin_en,START+timedelta(hours=1))
        self.assertEqual(obj.precio_total,D('80'))
        self.assertTrue(obj.codigo_reserva)
        self.assertTrue(obj.token_gestion)
        self.assertEqual(m.CitaEstadosHistorial.objects.filter(cita=obj).count(),1)
        history=m.CitaEstadosHistorial.objects.get(cita=obj)
        self.assertEqual(history.cambiado_por_id,self.admin.pk)
        response=self.client.get(API+'citas/'+str(appointment)+'/')
        self.assertEqual(response.status_code,200)
        self.assertNotIn('token_gestion',response.json())
        self.assertNotIn('codigo_reserva',response.json())
        self.assertNotIn('telefono',response.json())
        self.assertEqual(response.json()['servicios'][0]['precio_snapshot'],'80.00')
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(m.Visitas.objects.count(),0)

    def test_replay_and_changed_payload_are_not_duplicate_reservations(self):
        import uuid
        key=str(uuid.uuid4())
        one=self.call('citas/',self.booking(),key=key,status=201)
        two=self.call('citas/',self.booking(),key=key,status=201)
        self.assertEqual(one.json(),two.json())
        self.assertEqual(self.call('citas/',self.booking(start=START+timedelta(hours=1)),key=key).status_code,409)
        self.assertEqual(m.Citas.objects.count(),1)

    def test_adjacent_booking_allowed_overlap_unassigned_service_wrong_grid_rejected(self):
        self.reserve()
        self.reserve(start=START+timedelta(hours=1))
        for payload in [self.booking(start=START+timedelta(minutes=15)),self.booking(start=START+timedelta(hours=3,minutes=7)),self.booking(servicios=[self.item.pk,self.item.pk])]:
            self.assertIn(self.call('citas/',payload).status_code,[400,409])
        other=self.service()
        m.Servicios.objects.filter(pk=other.pk).update(duracion_minutos=30)
        self.assertEqual(self.call('citas/',self.booking(servicios=[other.pk])).status_code,400)

    def test_reschedule_preserves_snapshot_and_logs_old_new_without_state_duplication(self):
        appointment=self.reserve()
        m.Servicios.objects.filter(pk=self.item.pk).update(precio_base=D('90'),duracion_minutos=90)
        response=self.call('citas/'+str(appointment)+'/reprogramar/',{'inicio_en':(START+timedelta(hours=2)).isoformat(),'motivo':'Cambio de hora ficticio'},status=200)
        obj=m.Citas.objects.get(pk=appointment)
        self.assertEqual(obj.precio_total,D('80'))
        self.assertEqual(obj.duracion_total_minutos,60)
        self.assertEqual(m.CitaEstadosHistorial.objects.filter(cita=obj).count(),1)
        audit=m.Auditoria.objects.get(entidad='citas',entidad_id=str(appointment),accion='REPROGRAMAR_CITA')
        self.assertEqual(audit.datos['anterior']['servicios'][0]['precio_snapshot'],'80.00')
        self.assertEqual(obj.fin_en,START+timedelta(hours=3))

    def test_cancel_releases_slot_and_confirmation_state_machine(self):
        appointment=self.reserve()
        self.call('citas/'+str(appointment)+'/confirmar/',status=200)
        self.call('citas/'+str(appointment)+'/confirmar/',status=409)
        self.call('citas/'+str(appointment)+'/cancelar/',{'motivo':'Cancelacion ficticia'},status=200)
        self.assertEqual(m.Citas.objects.get(pk=appointment).cancelada_por,'NEGOCIO')
        self.reserve()
        self.call('citas/'+str(appointment)+'/confirmar/',status=409)

    def test_no_show_not_early_and_cancel_override_requires_extra_permission(self):
        appointment=self.reserve()
        self.call('citas/'+str(appointment)+'/no-asistio/',{'motivo':'Ausencia ficticia'},status=409)
        from unittest.mock import patch
        with patch('django.utils.timezone.now',return_value=START+timedelta(hours=2)):
            self.call('citas/'+str(appointment)+'/no-asistio/',{'motivo':'Ausencia ficticia'},status=200)
        second=self.reserve(start=START+timedelta(hours=2))
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='manage_appointments'))
        self.client.force_authenticate(self.staff)
        with patch('django.utils.timezone.now',return_value=START):
            self.call('citas/'+str(second)+'/cancelar/',{'motivo':'Fuera plazo ficticio','fuera_plazo_autorizado':True},status=403)

    def test_staff_user_assignment_and_deactivation_preserve_existing_bookings(self):
        self.reserve()
        self.call('profesionales/'+str(self.prof)+'/',{'activa':False},method='patch',status=409)
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='manage_professionals'))
        self.client.force_authenticate(self.staff)
        self.call('profesionales/'+str(self.prof)+'/',{'usuario_id':self.admin.pk},method='patch',status=403)
        self.client.force_authenticate(self.admin)
        self.call('profesionales/'+str(self.prof)+'/',{'usuario_id':self.regular.pk},method='patch',status=404)

    def test_exclusion_constraints_directly_enforce_client_and_professional(self):
        appointment=self.reserve()
        from apps.clientas import services
        other_client=services.save_clienta({'nombres':'Otra','apellidos':'Ficticia','telefono':'+51988123456'},self.admin)
        other_prof=m.Profesionales.objects.create(nombres='Otra',apellidos='Ficticia')
        for client,professional,constraint in [(other_client.pk,self.prof,'ex_citas_profesional_no_solape'),(self.person.pk,other_prof.pk,'ex_citas_clienta_no_solape')]:
            with self.assertRaises(IntegrityError) as caught,transaction.atomic():
                m.Citas.objects.create(clienta_id=client,profesional_id=professional,inicio_en=START,fin_en=START+timedelta(hours=1))
            self.assertEqual(caught.exception.__cause__.sqlstate,'23P01')
            self.assertEqual(caught.exception.__cause__.diag.constraint_name,constraint)
