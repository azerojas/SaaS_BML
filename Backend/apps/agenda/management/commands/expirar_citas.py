from django.core.management.base import BaseCommand,CommandError
from apps.agenda.application.expiry import expire_pending


class Command(BaseCommand):
    help='Expira reservas pendientes vencidas; idempotente. Programar explicitamente en Fase8.'
    def add_arguments(self,parser):parser.add_argument('--limit',type=int,default=500)
    def handle(self,*args,**options):
        if not 1<=options['limit']<=500:raise CommandError('limit debe estar entre1 y500.')
        result=expire_pending(limit=options['limit'])
        self.stdout.write('Revisadas={revisadas}; expiradas={expiradas}; regularizadas={regularizadas}'.format(**result))
