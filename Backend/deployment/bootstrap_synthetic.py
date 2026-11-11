"""Explicit bootstrap for an EMPTY dedicated CI/local-staging database, never a real database."""
import os
import sys
from pathlib import Path
from decimal import Decimal
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
if os.environ.get('ALLOW_SYNTHETIC_BOOTSTRAP')!='True' or os.environ.get('DJANGO_ENV')!='ci':
    raise SystemExit('Bootstrap solo para CI sintetico explicitamente autorizado.')
import django
django.setup()
from django.conf import settings
from django.db import connection
from django.core.management import call_command
if not settings.DATABASES['default']['NAME'].startswith('bm_staging_synthetic_'):raise SystemExit('Base sintetica con prefijo obligatorio.')
with connection.cursor() as cursor:
    cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
    if cursor.fetchone()[0]!=0:raise SystemExit('No se recrea una base con tablas existentes.')
    cursor.execute((settings.BASE_DIR/'tests/legacy_schema.sql').read_text(encoding='utf-8'))
    cursor.execute('SET search_path TO public')
call_command('migrate',interactive=False,verbosity=0)
from django.contrib.auth import get_user_model
from django.utils import timezone
from cryptography.fernet import Fernet
from apps.operaciones.models import MFADevice
from negocio import models as m
user=get_user_model().objects.create_superuser('staging_operator',password=os.environ['SYNTHETIC_ADMIN_PASSWORD'])
MFADevice.objects.create(user=user,secret_encrypted=Fernet(os.environ['MFA_ENCRYPTION_KEY'].encode()).encrypt(os.environ['SYNTHETIC_TOTP_SECRET'].encode()).decode(),confirmed=True)
m.Negocio.objects.create(id=1,nombre='Staging sintetico',moneda='PEN',zona_horaria='America/Lima',creado_en=timezone.now())
m.ConfiguracionReservas.objects.create(id=1,reservas_online_activas=False,intervalo_slots_minutos=15,anticipacion_minima_minutos=0,
    anticipacion_maxima_dias=60,horas_limite_cancelacion=24,anticipo_porcentaje=Decimal('20'),minutos_expiracion_pago=30,max_citas_activas_por_clienta=3,actualizado_en=timezone.now())
print('Empty synthetic database bootstrapped; schema and MFA fixture prepared. No production data imported.')
