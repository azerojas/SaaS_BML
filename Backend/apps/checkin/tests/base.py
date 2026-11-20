from django.test import override_settings
from rest_framework.test import APIClient
from apps.catalogo.tests.base import CatalogTestCase
from apps.clientas import services as clients
from negocio import models as m

ADMIN='/api/admin/checkin/'
PUBLIC='/api/public/checkin/'


@override_settings(CHECKIN_DEMO_MODE=False, PUBLIC_CHECKIN_URL='https://app.example.com/checkin/',
    CHECKIN_PRIVACY_NOTICE_URL='https://app.example.com/privacidad/', CHECKIN_PRIVACY_NOTICE_VERSION='v1',
    CHECKIN_GET_IP_LIMIT=1000, CHECKIN_POST_IP_LIMIT=1000, CHECKIN_IP_DAY_LIMIT=10000, CHECKIN_PHONE_LIMIT=100)
class CheckinTestCase(CatalogTestCase):
    def setUp(self):
        super().setUp()
        self.public=APIClient(enforce_csrf_checks=True)
        r=self.client.post(ADMIN+'puntos/',{'nombre':'Entrada ficticia'},format='json')
        self.assertEqual(r.status_code,201,r.data)
        self.point=m.PuntosQr.objects.get(pk=r.json()['id'])
        self.url=PUBLIC+str(self.point.token)+'/'

    def person(self, phone='+51999123456', **changes):
        return clients.save_clienta({'nombres':'Daniela','apellidos':'Ficticia','telefono':phone,**changes},self.admin)

    def post(self, **changes):
        return self.public.post(self.url,{'telefono':'+51999123456',**changes},format='json')

    def seed_legacy_arrival(self, **changes):
        """Seed a pending record created before self-service visit registration."""
        from apps.checkin.application.commands import request_arrival
        from rest_framework.response import Response
        request_arrival(str(self.point.token), {'telefono': '+51999123456', **changes})
        return Response({}, status=202)

    def propose(self, phone='+51999123456'):
        r=self.seed_legacy_arrival(telefono=phone,nombres='Daniela',apellidos='Ficticia',consentimiento_datos=True,version_aviso='v1')
        self.assertEqual(r.status_code,202,r.data)
        return m.Llegadas.objects.get(clienta__telefono=phone,estado='PENDIENTE')

    def path(self, arrival, action=''):
        return ADMIN+'llegadas/'+str(arrival.pk)+'/'+(action+'/' if action else '')

    def confirm(self, arrival, **changes):
        return self.client.post(self.path(arrival,'confirmar'),{'identidad_verificada':True,'consentimiento_verificado':True,**changes},format='json')

