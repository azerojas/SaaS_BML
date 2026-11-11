import uuid
from negocio import models as m
from .base import API,FinanceTestCase


class VisitTests(FinanceTestCase):
    def test_manual_open_notes_history_and_idempotent_retry(self):
        key=str(uuid.uuid4())
        first=self.mutate('visitas/',{'clienta_id':self.person.pk},key,expected=201)
        retry=self.mutate('visitas/',{'clienta_id':self.person.pk},key,expected=201)
        self.assertEqual(first.json(),retry.json())
        self.assertEqual(m.Visitas.objects.count(),1)
        pk=first.json()['visita_id']
        response=self.mutate('visitas/'+str(pk)+'/',{'notas':'Nota privada ficticia'},method='patch',expected=200)
        data=self.client.get(API+'visitas/'+str(pk)+'/').json()
        self.assertEqual(data['notas'],'Nota privada ficticia')
        self.assertTrue(data['historial'])
        self.assertEqual(self.mutate('visitas/',{'clienta_id':999999},key).status_code,409)

    def test_confirmed_checkin_integrity_and_one_visit(self):
        arrival=m.Llegadas.objects.create(clienta_id=self.person.pk,origen='MANUAL')
        self.assertEqual(self.mutate('visitas/',{'clienta_id':self.person.pk,'llegada_id':arrival.pk}).status_code,409)
        from django.utils import timezone
        arrival.estado,arrival.confirmada_en='CONFIRMADA',timezone.now()
        arrival.save(update_fields=['estado','confirmada_en'])
        pk=self.visit(llegada_id=arrival.pk,notas='Nota QR ficticia')
        self.assertEqual(m.Visitas.objects.get(pk=pk).clienta_id,self.person.pk)
        self.assertEqual(m.Visitas.objects.get(pk=pk).notas,'Nota QR ficticia')
        self.assertEqual(self.mutate('visitas/',{'clienta_id':self.person.pk,'llegada_id':arrival.pk}).status_code,409)

    def test_cancel_no_sale_and_finalize_policy(self):
        pk=self.visit()
        self.assertEqual(self.mutate('visitas/'+str(pk)+'/finalizar/').status_code,409)
        self.assertEqual(self.mutate('visitas/'+str(pk)+'/cancelar/',{'motivo':'Cancelacion ficticia'}).status_code,200)
        obj=m.Visitas.objects.get(pk=pk)
        self.assertEqual(obj.estado,'CANCELADA')
        self.assertIsNotNone(obj.fin_en)
        self.assertEqual(m.Auditoria.objects.get(entidad='visitas',entidad_id=str(pk),accion='CANCELAR_VISITA').datos['motivo'],'Cancelacion ficticia')
        self.assertEqual(self.mutate('visitas/'+str(pk)+'/cancelar/',{'motivo':'Otra cancelacion'}).status_code,409)

    def test_sale_requires_matching_open_visit_and_no_public_proposals(self):
        pk=self.visit()
        article=self.product()
        r=self.mutate('ventas/',{'visita_id':pk,'clienta_id':999999,'lineas':[self.product_line(article)]})
        self.assertEqual(r.status_code,409)
        sale=self.sale([self.product_line(article)],visit=pk)
        self.assertEqual(self.mutate('ventas/',{'visita_id':pk}).status_code,409)
        self.assertEqual(self.mutate('visitas/'+str(pk)+'/cancelar/',{'motivo':'Cancelacion ficticia'}).status_code,409)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/anular/',{'motivo':'Borrador equivocado'}).status_code,200)
        self.assertEqual(self.mutate('visitas/'+str(pk)+'/cancelar/',{'motivo':'Cancelacion ficticia'}).status_code,200)

