import json
from django.core.management.base import BaseCommand,CommandError
from django.utils import timezone
from apps.operaciones.models import JobState
from apps.operaciones.domain.alerts import stale_jobs
from apps.operaciones.infrastructure.alerts import deliver


class Command(BaseCommand):
    help='Evalua jobs obsoletos/fallidos; --deliver solo para webhook configurado y autorizado.'
    def add_arguments(self,parser):parser.add_argument('--deliver',action='store_true')
    def handle(self,*args,**options):
        rows={row['key']:row for row in JobState.objects.values('key','status','last_success_at')}
        findings=stale_jobs(rows,timezone.now())
        if options['deliver'] and findings:
            try:deliver(findings)
            except Exception as exc:raise CommandError('Entrega de alerta fallo: '+type(exc).__name__) from None
        self.stdout.write(json.dumps({'alerts':findings,'delivered':bool(options['deliver'] and findings)}))
        if findings and not options['deliver']:raise CommandError('Existen alertas operativas pendientes.')
