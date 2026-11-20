from datetime import timedelta
from decimal import Decimal
import uuid
from django.utils import timezone
from negocio import models as m
from .base import API, FinanceTestCase


class AppointmentCheckoutTests(FinanceTestCase):
    def appointment(self, visit=None, client=None, price='65.00'):
        professional = m.Profesionales.objects.create(nombres='Profesional', apellidos='Prueba')
        service = self.service(price='95.00')
        now = timezone.now() + timedelta(minutes=45 * m.Citas.objects.count())
        appointment = m.Citas.objects.create(
            clienta_id=client or self.person.pk, profesional=professional, visita_id=visit,
            inicio_en=now, fin_en=now + timedelta(minutes=45), precio_total=Decimal(price))
        m.CitaServicios.objects.create(cita=appointment, servicio=service, orden=1,
                                      duracion_minutos=45, precio_snapshot=Decimal(price))
        return appointment, service

    def test_unique_qr_visit_proposes_existing_booking_without_writing(self):
        visit = self.visit()
        appointment, _ = self.appointment()
        response = self.client.get(API + f'visitas/{visit}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['cita_para_cobro']['id'], appointment.pk)
        self.assertEqual(response.json()['cita_para_cobro']['total'], '65.00')
        appointment.refresh_from_db()
        self.assertIsNone(appointment.visita_id)
        self.assertFalse(m.Ventas.objects.exists())

    def test_booking_snapshot_seeds_sale_without_exception_permission_and_retry_does_not_duplicate(self):
        visit = self.visit()
        appointment, service = self.appointment(visit)
        self.client.force_authenticate(self.cashier)
        key = str(uuid.uuid4())
        body = {'visita_id': visit, 'cita_id': appointment.pk}
        response = self.mutate('ventas/', body, key=key, expected=201)
        sale = response.json()['venta_id']
        line = m.DetallesVenta.objects.get(venta_id=sale)
        self.assertEqual(line.servicio_id, service.pk)
        self.assertEqual(line.profesional_id, appointment.profesional_id)
        self.assertEqual(line.precio_unitario, Decimal('65.00'))
        detail = self.detail(sale)
        self.assertEqual(detail['lineas'][0]['profesional_nombre'], 'Profesional Prueba')
        self.assertEqual(detail['lineas'][0]['duracion_minutos'], 45)
        self.assertEqual(self.mutate('ventas/', body, key=key, expected=201).json()['venta_id'], sale)
        self.assertEqual(m.Ventas.objects.count(), 1)
        self.assertEqual(m.Visitas.objects.get(pk=visit).estado, 'ABIERTA')
        self.assertFalse(m.Pagos.objects.exists())

    def test_ambiguous_candidates_are_not_selected_and_other_client_is_rejected(self):
        visit = self.visit()
        self.appointment()
        self.appointment()
        self.assertIsNone(self.client.get(API + f'visitas/{visit}/').json()['cita_para_cobro'])
        other = m.Clientas.objects.create(nombres='Otra', apellidos='Prueba', telefono='+51955444555')
        appointment, _ = self.appointment(client=other.pk)
        self.mutate('ventas/', {'visita_id': visit, 'cita_id': appointment.pk}, expected=409)
        self.assertFalse(m.Ventas.objects.exists())

    def test_cancelled_booking_cannot_be_charged_and_client_price_still_requires_permission(self):
        visit = self.visit()
        appointment, service = self.appointment(visit)
        self.client.force_authenticate(self.cashier)
        self.mutate('ventas/', {'visita_id': visit, 'cita_id': appointment.pk,
            'lineas': [self.service_line(service, precio_unitario='1.00', motivo_precio='Intento no autorizado')]}, expected=403)
        m.Citas.objects.filter(pk=appointment.pk).update(estado='CANCELADA', cancelada_en=timezone.now(), cancelada_por='NEGOCIO', motivo_cancelacion='Cancelacion de prueba')
        self.mutate('ventas/', {'visita_id': visit, 'cita_id': appointment.pk}, expected=409)
        self.assertFalse(m.Ventas.objects.exists())
