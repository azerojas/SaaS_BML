from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from apps.catalogo.pagination import CatalogPagination
from apps.finanzas.domain.errors import FinanceError
from apps.finanzas.infrastructure.schema import ensure_ready
from apps.finanzas.infrastructure.idempotency import execute, canonical
from apps.finanzas.application import visits, sales, payments, advances, selectors
from apps.finanzas.models import AdvanceApplication
from negocio import models as m
from .permissions import FinancePermission
from . import serializers as s


class FinanceViewSet(viewsets.GenericViewSet):
    permission_classes=[FinancePermission]
    pagination_class=CatalogPagination
    lookup_value_regex='[0-9]+'
    action_permissions={}
    http_method_names=['get','post','patch','head','options']

    def initial(self, request, *args, **kwargs):
        super().initial(request,*args,**kwargs)
        ensure_ready()

    def handle_exception(self, exc):
        if isinstance(exc,FinanceError):
            status={'invalid':400,'forbidden':403,'unavailable':503,'conflict':409}[exc.kind]
            return Response({'code':exc.code,'detail':exc.detail},status=status)
        return super().handle_exception(exc)

    def parse(self, cls):
        serializer=cls(data=self.request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def mutate(self, operation, target, data, callback, status=200):
        body,response_status=execute(operation,self.request.headers.get('Idempotency-Key'),
            {'target':str(target) if target is not None else None,'data':data},self.request.user,
            lambda key:(callback(key),status))
        return Response(body,status=response_status)


class VisitViewSet(mixins.ListModelMixin,mixins.RetrieveModelMixin,FinanceViewSet):
    serializer_class=s.VisitOutput
    action_permissions={'create':'manage_visits','partial_update':'manage_visits','cancelar':'manage_visits','finalizar':'manage_visits'}

    def get_queryset(self):
        return selectors.visits(self.request.query_params if self.action=='list' else {})

    def retrieve(self,request,pk=None):
        obj=self.get_object()
        data=s.VisitOutput(obj).data
        data['historial']=list(m.Auditoria.objects.filter(entidad='visitas',entidad_id=str(obj.pk)).order_by('id').values('accion','creada_en','usuario_id'))
        data['venta_id']=m.Ventas.objects.filter(visita_id=obj.pk).values_list('id',flat=True).first()
        return Response(canonical(data))

    def create(self,request):
        data=self.parse(s.VisitCreate)
        return self.mutate('visita.abrir',None,data,lambda key:visits.open_visit(data,request.user),201)

    def partial_update(self,request,pk=None):
        data=self.parse(s.VisitNotes)
        return self.mutate('visita.notas',pk,data,lambda key:visits.update_notes(pk,data,request.user))

    @action(detail=True,methods=['post'])
    def cancelar(self,request,pk=None):
        data=self.parse(s.Reason)
        return self.mutate('visita.cancelar',pk,data,lambda key:visits.resolve_visit(pk,'cancelar',request.user,data['motivo']))

    @action(detail=True,methods=['post'])
    def finalizar(self,request,pk=None):
        if request.data:raise ValidationError('Cuerpo vacio requerido.')
        return self.mutate('visita.finalizar',pk,{},lambda key:visits.resolve_visit(pk,'finalizar',request.user))


class SaleViewSet(mixins.ListModelMixin,FinanceViewSet):
    serializer_class=s.SaleListOutput
    action_permissions={'create':'manage_sales','partial_update':'manage_sales','confirmar':'confirm_sale',
                        'anular':'manage_sales','aplicar_anticipo':'apply_advance','pagar':'register_payment','ajustar':'adjust_sale'}

    @action(detail=True,methods=['post'])
    def ajustar(self,request,pk=None):
        from apps.finanzas.application.cash_ledger import adjust
        data=self.parse(s.AdjustmentInput)
        return self.mutate('venta.ajustar',pk,data,lambda key:adjust(pk,data,request.user,key),201)

    def get_queryset(self):
        return selectors.sales(self.request.query_params if self.action=='list' else {})

    @action(detail=False,methods=['get'])
    def profesionales(self,request):
        rows=m.Profesionales.objects.filter(activa=True).order_by('apellidos','nombres','id')
        page=self.paginate_queryset(rows)
        return self.get_paginated_response(s.ProfessionalOutput(page,many=True).data)

    def retrieve(self,request,pk=None):
        obj=selectors.get_sale(pk)
        data=s.SaleOutput(obj).data
        data['saldo']=selectors.balance_summary(obj)
        data['finanzas_congeladas']=selectors.frozen_financials(obj,list(obj.detallesventa_set.all())) if obj.estado=='CONFIRMADA' else None
        data['aplicaciones_anticipo']=list(AdvanceApplication.objects.filter(venta_id=obj.pk).order_by('id').values('id','anticipo_id','monto','creada_en'))
        return Response(canonical(data))

    def create(self,request):
        data=self.parse(s.SaleCreate)
        return self.mutate('venta.crear',None,data,lambda key:sales.create_sale_draft(data,request.user),201)

    def partial_update(self,request,pk=None):
        data=self.parse(s.SaleUpdate)
        return self.mutate('venta.editar',pk,data,lambda key:sales.update_sale_draft(pk,data,request.user))

    @action(detail=True,methods=['post'])
    def previsualizar(self,request,pk=None):
        data=self.parse(s.Preview)
        return Response(canonical(sales.preview_sale(pk,data)))

    @action(detail=True,methods=['post'])
    def confirmar(self,request,pk=None):
        data=self.parse(s.ConfirmSale)
        return self.mutate('venta.confirmar',pk,data,lambda key:sales.confirm_sale(pk,data,request.user))

    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        data=self.parse(s.Reason)
        return self.mutate('venta.anular',pk,data,lambda key:sales.cancel_sale(pk,data,request.user))

    @action(detail=True,methods=['post'])
    def pagar(self,request,pk=None):
        data=self.parse(s.PaymentInput)
        return self.mutate('pago.registrar',pk,data,lambda key:payments.register_payment(pk,data,request.user),201)

    @action(detail=True,methods=['get'],url_path='anticipos-aplicables')
    def anticipos_aplicables(self,request,pk=None):
        sale=selectors.get_sale(pk)
        result=[]
        for obj in selectors.applicable_advances(sale):
            amounts=selectors.advance_amounts(obj)
            if amounts['disponible'] > 0:
                result.append({**s.AdvanceOutput(obj).data,**amounts})
        return Response(canonical({'venta_id':sale.pk,'anticipos':result}))

    @action(detail=True,methods=['post'],url_path='aplicar-anticipo')
    def aplicar_anticipo(self,request,pk=None):
        data=self.parse(s.AdvanceApply)
        return self.mutate('anticipo.aplicar',pk,data,lambda key:advances.apply_advance(pk,data,request.user,key),201)


class PaymentViewSet(mixins.ListModelMixin,mixins.RetrieveModelMixin,FinanceViewSet):
    serializer_class=s.PaymentOutput
    action_permissions={'anular':'void_payment'}
    def get_queryset(self):
        return selectors.payments(self.request.query_params if self.action=='list' else {})
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        data=self.parse(s.VoidPayment)
        return self.mutate('pago.anular',pk,data,lambda key:payments.void_payment(pk,data,request.user))


class AdvanceViewSet(mixins.ListModelMixin,mixins.RetrieveModelMixin,FinanceViewSet):
    serializer_class=s.AdvanceOutput
    action_permissions={'create':'manage_advances','confirmar':'manage_advances','anular':'manage_advances'}
    def get_queryset(self):
        return selectors.advances(self.request.query_params if self.action=='list' else {})
    def retrieve(self,request,pk=None):
        obj=self.get_object()
        return Response(canonical({**s.AdvanceOutput(obj).data,**selectors.advance_amounts(obj)}))
    def create(self,request):
        data=self.parse(s.AdvanceCreate)
        return self.mutate('anticipo.crear',None,data,lambda key:advances.create_advance(data,request.user),201)
    @action(detail=True,methods=['post'])
    def confirmar(self,request,pk=None):
        data=self.parse(s.AdvanceConfirm)
        return self.mutate('anticipo.confirmar',pk,data,lambda key:advances.confirm_advance(pk,data,request.user))
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        data=self.parse(s.Reason)
        return self.mutate('anticipo.anular',pk,data,lambda key:advances.cancel_advance(pk,data,request.user))


class RefundViewSet(mixins.ListModelMixin,FinanceViewSet):
    action_permissions={'create':'refund_payment'}
    def list(self,request):
        from apps.finanzas.models import Refund
        rows=Refund.objects.order_by('-creada_en','-id').values('id','pago_id','anticipo_id','monto','metodo','referencia','motivo','creada_en','creado_por_id')
        return self.get_paginated_response(canonical(list(self.paginate_queryset(rows))))
    def create(self,request):
        from apps.finanzas.application.cash_ledger import refund
        data=self.parse(s.RefundInput)
        return self.mutate('reembolso.registrar',None,data,lambda key:refund(data,request.user,key),201)


class ReconciliationViewSet(mixins.ListModelMixin,FinanceViewSet):
    action_permissions={'create':'reconcile_cash','list':'reconcile_cash'}
    def list(self,request):
        from apps.finanzas.models import CashReconciliation
        rows=CashReconciliation.objects.order_by('-fecha','metodo','-revision').values('id','fecha','metodo','revision','ingresos','reembolsos','neto','observado','fuentes_hash','evidencia_sha256','referencia','creada_en')
        return self.get_paginated_response(canonical(list(self.paginate_queryset(rows))))
    def create(self,request):
        from apps.finanzas.application.cash_ledger import reconcile
        data=self.parse(s.ReconciliationInput)
        return self.mutate('caja.conciliar',None,data,lambda key:reconcile(data,request.user,key),201)

