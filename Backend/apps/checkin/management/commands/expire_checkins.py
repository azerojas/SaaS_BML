from django.core.management.base import BaseCommand, CommandError
from apps.checkin.application.commands import expire_pending


class Command(BaseCommand):
    help = 'Cancela llegadas pendientes vencidas, sin borrar filas ni inventar un estado EXPIRADA.'
    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=200)
    def handle(self, *args, **options):
        if not 1 <= options['limit'] <= 1000:
            raise CommandError('--limit debe estar entre 1 y 1000.')
        count = expire_pending(options['limit'])
        self.stdout.write(f'Llegadas canceladas por vencimiento: {count}')

