from django.core.management.base import BaseCommand,CommandError
from apps.operaciones.application.jobs import maintenance


class Command(BaseCommand):
    help='Job explicito e idempotente; usar en cron aprobado, nunca en el arranque web.'
    def add_arguments(self,parser):
        parser.add_argument('--limit',type=int,default=500)
        parser.add_argument('--max-batches',type=int,default=20)
    def handle(self,*args,**options):
        try:result=maintenance(options['limit'],options['max_batches'])
        except Exception as exc:raise CommandError('Mantenimiento fallo: '+type(exc).__name__) from None
        self.stdout.write(str(result))
