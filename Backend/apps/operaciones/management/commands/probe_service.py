import json
from urllib.request import Request,build_opener
from urllib.parse import urlsplit
from django.conf import settings
from django.core.management.base import BaseCommand,CommandError
from apps.operaciones.infrastructure.alerts import NoRedirect,deliver


class Command(BaseCommand):
    help='Una sonda externa de readiness; no escribe DB. Programar fuera del proceso web.'
    def add_arguments(self,parser):
        parser.add_argument('--url',required=True)
        parser.add_argument('--deliver',action='store_true')
    def handle(self,*args,**options):
        parsed=urlsplit(options['url'])
        local=settings.APP_ENV in ('ci','development') and parsed.hostname in ('localhost','127.0.0.1')
        if parsed.scheme!='https' and not local or parsed.username or parsed.password or parsed.path!='/health/ready' or parsed.query:
            raise CommandError('URL HTTPS de readiness requerida; localhost HTTP solo en desarrollo/CI.')
        try:
            with build_opener(NoRedirect()).open(Request(options['url']),timeout=5) as response:
                healthy=response.status==200 and json.loads(response.read(1024)).get('status')=='ready'
        except Exception:healthy=False
        findings=[] if healthy else [{'code':'SERVICE_UNREADY','job':'readiness','severity':'high'}]
        if options['deliver'] and findings:
            try:deliver(findings)
            except Exception as exc:raise CommandError('Entrega de alerta fallo: '+type(exc).__name__) from None
        self.stdout.write(json.dumps({'ready':healthy,'alerts':findings}))
        if not healthy:raise CommandError('Servicio no disponible.')
