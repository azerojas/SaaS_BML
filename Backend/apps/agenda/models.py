"""Permission metadata only. All appointment business tables already exist."""
from apps.finanzas.models import IdempotencyRecord


class AgendaAccess(IdempotencyRecord):
    class Meta:
        proxy=True
        default_permissions=()
        permissions=[
            ('view_agenda','Consultar agenda y datos privados de citas'),
            ('manage_professionals','Gestionar profesionales y especialidades'),
            ('assign_users','Vincular profesionales a usuarios administrativos'),
            ('manage_schedules','Gestionar horarios de trabajo'),
            ('manage_blocks','Gestionar bloqueos de agenda'),
            ('manage_appointments','Gestionar reservas y transiciones de citas'),
            ('manage_waitlist','Gestionar lista de espera'),
            ('link_arrivals','Vincular llegadas confirmadas a citas y visitas'),
            ('configure_agenda','Gestionar politicas de reservas'),
            ('override_policy','Autorizar plazos excepcionales e intervalos historicos'),
        ]
