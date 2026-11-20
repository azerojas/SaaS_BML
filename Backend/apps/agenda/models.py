"""Agenda permissions and additive public request support."""
import uuid
from django.db import models
from apps.finanzas.models import IdempotencyRecord


class AgendaAccess(IdempotencyRecord):
    class Meta:
        proxy = True
        default_permissions = ()
        permissions = [
            ('view_agenda', 'Consultar agenda y datos privados de citas'),
            ('view_own_agenda', 'Consultar unicamente la agenda del profesional vinculado'),
            ('manage_own_schedule', 'Publicar y modificar los cupos de la propia especialista'),
            ('manage_professionals', 'Gestionar profesionales y especialidades'),
            ('assign_users', 'Vincular profesionales a usuarios administrativos'),
            ('manage_schedules', 'Gestionar horarios de trabajo'),
            ('manage_blocks', 'Gestionar bloqueos de agenda'),
            ('manage_appointments', 'Gestionar reservas y transiciones de citas'),
            ('manage_waitlist', 'Gestionar lista de espera'),
            ('link_arrivals', 'Vincular llegadas confirmadas a citas y visitas'),
            ('configure_agenda', 'Gestionar politicas de reservas'),
            ('override_policy', 'Autorizar plazos excepcionales e intervalos historicos'),
        ]


class PublicBookingRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    management_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    management_code_hash = models.CharField(max_length=64, blank=True, default='')
    nombres = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120)
    telefono = models.CharField(max_length=25)
    profesional_id = models.BigIntegerField()
    servicios = models.JSONField()
    inicio_en = models.DateTimeField()
    fin_en = models.DateTimeField()
    precio_total = models.DecimalField(max_digits=12, decimal_places=2)
    duracion_minutos = models.PositiveIntegerField()
    estado = models.CharField(max_length=14, default='PENDIENTE')
    appointment_id = models.BigIntegerField(null=True, unique=True)
    version_aviso = models.CharField(max_length=100)
    motivo_publico = models.CharField(max_length=250, default='')
    creada_en = models.DateTimeField(auto_now_add=True)
    expira_en = models.DateTimeField(db_index=True)

    class Meta:
        default_permissions = ()
        indexes = [
            models.Index(fields=['telefono', 'management_code_hash'], name='agenda_public_phone_code_idx'),
        ]


class PublicBookingIntent(models.Model):
    owner_hash = models.CharField(max_length=64)
    key = models.UUIDField()
    fingerprint = models.CharField(max_length=64)
    result = models.JSONField()

    class Meta:
        default_permissions = ()
        constraints = [models.UniqueConstraint(fields=['owner_hash', 'key'], name='public_booking_intent_owner_key')]


class DailySchedule(models.Model):
    profesional_id = models.BigIntegerField(null=True, blank=True)
    fecha = models.DateField()
    franjas = models.JSONField(default=list)
    actualizado_por_id = models.BigIntegerField(null=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        default_permissions = ()
        constraints = [models.UniqueConstraint(fields=['profesional_id', 'fecha'], name='agenda_professional_day_unique'),
            models.UniqueConstraint(fields=['fecha'], condition=models.Q(profesional_id__isnull=True), name='agenda_general_day_unique')]


class CalendarArchive(models.Model):
    """Keep financial/visit references while removing a booking from the working agenda."""
    appointment_id = models.BigIntegerField(primary_key=True)
    archived_at = models.DateTimeField(auto_now_add=True)
    actor_id = models.BigIntegerField()

    class Meta:
        default_permissions = ()
