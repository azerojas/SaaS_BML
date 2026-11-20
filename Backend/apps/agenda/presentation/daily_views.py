from datetime import timedelta
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from apps.agenda.application import daily_schedule
from apps.agenda.application.access import scope_rows
from apps.agenda.application.access import own_professional
from rest_framework.exceptions import PermissionDenied
from apps.agenda.models import DailySchedule
from apps.finanzas.infrastructure.idempotency import canonical
from .views import BaseView
from . import serializers as s


class DailyScheduleView(BaseView):
    own_agenda_read=True
    own_schedule_write=True
    action_permissions={'create':'manage_schedules','restablecer':'manage_schedules'}

    def list(self,request):
        daily_schedule.ensure_ready()
        params=request.query_params
        if not {'desde','hasta'}<=set(params) or set(params)-{'desde','hasta','profesional_id','excluir_profesional_id','ambito','page','page_size'}:
            raise ValidationError('Usa desde/hasta exclusiva y, opcionalmente, profesional_id.')
        lower=s.ISODate().run_validation(params['desde'])
        upper=s.ISODate().run_validation(params['hasta'])
        if not lower<upper<=lower+timedelta(days=93):
            raise ValidationError('Consulta entre 1 y 93 días.')
        rows=DailySchedule.objects.filter(fecha__gte=lower,fecha__lt=upper).order_by('fecha','profesional_id')
        if 'excluir_profesional_id' in params:
            from apps.agenda.application.selectors import integer
            rows=rows.exclude(profesional_id=integer(params,'excluir_profesional_id'))
        if 'ambito' in params:
            if params['ambito'] != 'general' or 'profesional_id' in params:
                raise ValidationError('Usa ambito=general sin profesional_id.')
            daily_schedule.ensure_shared_ready()
            rows=rows.filter(profesional_id__isnull=True)
        if 'profesional_id' in params:
            identifier=s.DailyIdentifier(data={'fecha':lower.isoformat(),'profesional_id':params['profesional_id']})
            identifier.is_valid(raise_exception=True)
            rows=rows.filter(profesional_id=identifier.validated_data['profesional_id'])
        page=self.paginate_queryset(scope_rows(rows,'daily',request.user))
        return self.get_paginated_response(daily_schedule.outputs(page))

    def create(self,request):
        data=self.parse(s.DailyScheduleInput,context={'single_slots':not request.user.has_perm('agenda.view_agenda')})
        if not request.user.has_perm('agenda.view_agenda'):
            identifier = own_professional(request.user)
            if data.get('profesional_id') not in (None, identifier):
                raise PermissionDenied('Solo puedes publicar tus propios cupos.')
            data['profesional_id'] = identifier
            for row in data['franjas']:
                row['cupo_unico'] = True
        return self.mutate('jornada.guardar',None,data,lambda key:canonical(daily_schedule.save(data,request.user)))

    @action(detail=False,methods=['post'])
    def restablecer(self,request):
        data=self.parse(s.DailyIdentifier)
        return self.mutate('jornada.restablecer',None,data,lambda key:daily_schedule.save(data,request.user,restore=True))
