import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient
from negocio import models as m
from apps.catalogo import services as catalog
from apps.clientas import services as clients
from apps.inventario import services as inventory

API='/api/'


class FinanceTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin=get_user_model().objects.create_superuser('finance_admin_test',email='finance@example.com',password=None)
        cls.regular=get_user_model().objects.create_user('finance_regular_test')
        cls.staff=get_user_model().objects.create_user('finance_staff_test',is_staff=True)
        cls.cashier=get_user_model().objects.create_user('finance_cashier_test',is_staff=True)
        cls.cashier.user_permissions.add(*Permission.objects.filter(content_type__app_label='finanzas').exclude(codename__in=['override_price','void_payment']))
        cls.unit=m.UnidadesMedida.objects.create(codigo='UND',nombre='Unidad')
        cls.other_unit=m.UnidadesMedida.objects.create(codigo='ML',nombre='Mililitro')
        cls.person=clients.save_clienta({'nombres':'Daniela','apellidos':'Ficticia','telefono':'+51999123456'},cls.admin)

    def setUp(self):
        self.client=APIClient()
        self.client.force_authenticate(self.admin)
        self.sequence=0

    def mutate(self,path,data=None,key=None,method='post',expected=None):
        response=getattr(self.client,method)(API+path,data or {},format='json',HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))
        if expected is not None:self.assertEqual(response.status_code,expected,getattr(response,'data',response.content))
        return response

    def visit(self,**changes):
        return self.mutate('visitas/',{'clienta_id':self.person.pk,**changes},expected=201).json()['visita_id']

    def product(self,kind='VENTA',price='20.00',stock='10',cost='3.0000'):
        self.sequence+=1
        obj=catalog.save_entity('articulos',{'nombre':'Articulo '+str(self.sequence),'tipo':kind,
            'unidad_id':self.unit.pk,'precio_venta':Decimal(price)},self.admin)
        if stock is not None:
            purchase=inventory.save_purchase({'detalles':[{'articulo_id':obj.pk,'unidad_id':self.unit.pk,
                'cantidad':Decimal(stock),'costo_unitario':Decimal(cost)}]},self.admin)
            inventory.receive_purchase(purchase.pk,self.admin)
        return obj

    def service(self,price='80.00'):
        self.sequence+=1
        return catalog.save_entity('servicios',{'nombre':'Servicio '+str(self.sequence),'precio_base':Decimal(price)},self.admin)

    def product_line(self,article,quantity='1.000',**changes):
        return {'tipo':'PRODUCTO','articulo_id':article.pk,'unidad_id':article.unidad_id,'cantidad':quantity,**changes}

    def service_line(self,service,quantity='1.000',**changes):
        return {'tipo':'SERVICIO','servicio_id':service.pk,'cantidad':quantity,**changes}

    def sale(self,lines,visit=None,**changes):
        payload={'lineas':lines,**changes}
        if visit is not None:payload['visita_id']=visit
        response=self.mutate('ventas/',payload,expected=201)
        return response.json()['venta_id']

    def detail(self,pk):
        r=self.client.get(API+'ventas/'+str(pk)+'/')
        self.assertEqual(r.status_code,200,r.data)
        return r.json()

    def confirm(self,pk,groups=None,key=None,**changes):
        return self.mutate('ventas/'+str(pk)+'/confirmar/',{'consumos_revisados':True,'consumos_reales':groups or [],**changes},key)

    def pay(self,pk,amount='10.00',method='EFECTIVO',reference=None,key=None):
        return self.mutate('ventas/'+str(pk)+'/pagar/',{'metodo':method,'monto':amount,
            'referencia':reference,'verificado_manualmente':True},key)

