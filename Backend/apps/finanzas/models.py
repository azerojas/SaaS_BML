from django.conf import settings
from django.db import models
from django.utils import timezone


class IdempotencyRecord(models.Model):
    key = models.UUIDField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    operation = models.CharField(max_length=100)
    request_hash = models.CharField(max_length=64)
    response_status = models.PositiveSmallIntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'idempotency_records'
        constraints = [models.UniqueConstraint(fields=['actor', 'operation', 'key'], name='uq_fin_idempotency_actor_operation_key')]
        permissions = [
            ('view_finance', 'Consultar finanzas y visitas'),
            ('manage_visits', 'Gestionar visitas'),
            ('manage_sales', 'Gestionar borradores de ventas'),
            ('confirm_sale', 'Confirmar ventas y consumos'),
            ('register_payment', 'Registrar cobros confirmados'),
            ('void_payment', 'Anular errores de registro de cobro'),
            ('manage_advances', 'Gestionar anticipos de citas'),
            ('apply_advance', 'Aplicar anticipos a ventas'),
            ('override_price', 'Autorizar precio excepcional auditado'),
        ]


class AdvanceApplication(models.Model):
    anticipo_id = models.BigIntegerField(db_index=True)
    venta_id = models.BigIntegerField(db_index=True)
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    clave_operacion = models.UUIDField()
    creada_en = models.DateTimeField(default=timezone.now)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)

    class Meta:
        db_table = 'aplicaciones_anticipo'
        constraints = [
            models.CheckConstraint(condition=models.Q(monto__gt=0), name='ck_aplicacion_anticipo_positiva'),
            models.UniqueConstraint(fields=['anticipo_id', 'venta_id', 'clave_operacion'], name='uq_aplicacion_anticipo_operacion'),
        ]


class Refund(models.Model):
    pago_id=models.BigIntegerField(null=True,db_index=True)
    anticipo_id=models.BigIntegerField(null=True,db_index=True)
    monto=models.DecimalField(max_digits=12,decimal_places=2)
    metodo=models.CharField(max_length=20)
    referencia=models.CharField(max_length=100,blank=True)
    motivo=models.CharField(max_length=250)
    clave_operacion=models.UUIDField(unique=True)
    creada_en=models.DateTimeField(default=timezone.now,db_index=True)
    creado_por=models.ForeignKey(settings.AUTH_USER_MODEL,models.PROTECT)

    class Meta:
        db_table='finanzas_reembolso'
        permissions=[('refund_payment','Registrar reembolsos trazables')]
        constraints=[models.UniqueConstraint(fields=['metodo','referencia'],condition=~models.Q(referencia=''),name='uq_reembolso_referencia'),
            models.CheckConstraint(condition=models.Q(monto__gt=0),name='ck_reembolso_positivo'),
            models.CheckConstraint(condition=(models.Q(pago_id__isnull=False,anticipo_id__isnull=True)|models.Q(pago_id__isnull=True,anticipo_id__isnull=False)),name='ck_reembolso_fuente_unica')]


class SaleAdjustment(models.Model):
    venta_id=models.BigIntegerField(db_index=True)
    monto=models.DecimalField(max_digits=12,decimal_places=2)
    motivo=models.CharField(max_length=250)
    clave_operacion=models.UUIDField(unique=True)
    creada_en=models.DateTimeField(default=timezone.now,db_index=True)
    creado_por=models.ForeignKey(settings.AUTH_USER_MODEL,models.PROTECT)

    class Meta:
        db_table='finanzas_ajusteventa'
        permissions=[('adjust_sale','Registrar ajustes comerciales')]
        constraints=[models.CheckConstraint(condition=models.Q(monto__gt=0),name='ck_ajuste_positivo')]


class CashReconciliation(models.Model):
    fecha=models.DateField(db_index=True)
    metodo=models.CharField(max_length=20)
    revision=models.PositiveIntegerField()
    ingresos=models.DecimalField(max_digits=16,decimal_places=2)
    reembolsos=models.DecimalField(max_digits=16,decimal_places=2)
    neto=models.DecimalField(max_digits=16,decimal_places=2)
    observado=models.DecimalField(max_digits=16,decimal_places=2)
    fuentes_hash=models.CharField(max_length=64)
    evidencia_sha256=models.CharField(max_length=64)
    referencia=models.CharField(max_length=100)
    clave_operacion=models.UUIDField(unique=True)
    creada_en=models.DateTimeField(default=timezone.now)
    creado_por=models.ForeignKey(settings.AUTH_USER_MODEL,models.PROTECT)

    class Meta:
        db_table='finanzas_conciliacion'
        permissions=[('reconcile_cash','Conciliar recaudacion con evidencia')]
        constraints=[models.UniqueConstraint(fields=['fecha','metodo','revision'],name='uq_conciliacion_revision'),
            models.CheckConstraint(condition=models.Q(revision__gt=0),name='ck_conciliacion_revision'),
            models.CheckConstraint(condition=models.Q(neto=models.F('observado')),name='ck_conciliacion_cuadra')]

