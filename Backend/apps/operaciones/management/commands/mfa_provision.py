import base64
import os
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlencode,quote
from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand,CommandError
from django.db import transaction
from apps.operaciones.models import MFADevice


class Command(BaseCommand):
    help='Provisionar MFA fuera de banda; escribe URI secreta en archivo NUEVO privado, nunca en logs.'
    def add_arguments(self,parser):
        parser.add_argument('--username',required=True)
        parser.add_argument('--output',required=True)
        parser.add_argument('--database-name',required=True)
        parser.add_argument('--replace',action='store_true')
    def handle(self,*args,**options):
        if options['database_name']!=settings.DATABASES['default']['NAME']:raise CommandError('Base exacta requerida.')
        if not settings.MFA_ENCRYPTION_KEY:raise CommandError('Falta clave cifrada de MFA.')
        target=Path(options['output']).resolve()
        if target.exists():raise CommandError('El archivo de salida debe ser nuevo y privado.')
        user=get_user_model().objects.filter(username=options['username'],is_staff=True,is_active=True).first()
        if not user:raise CommandError('Cuenta administrativa no disponible.')
        secret=secrets.token_hex(20)
        token=Fernet(settings.MFA_ENCRYPTION_KEY.encode()).encrypt(secret.encode()).decode()
        with transaction.atomic():
            existing=MFADevice.objects.select_for_update().filter(user=user).first()
            if existing and not options['replace']:raise CommandError('Dispositivo existente; reemplazo requiere --replace y revoca sesiones.')
            MFADevice.objects.update_or_create(user=user,defaults={'secret_encrypted':token,'confirmed':False,'last_step':-1,
                'attempts':0,'locked_until':None,'recovery_hashes':[],'session_epoch':uuid.uuid4()})
            uri='otpauth://totp/'+quote('Beauty Manager:'+user.username)+'?'+urlencode({'secret':base64.b32encode(bytes.fromhex(secret)).decode(),'issuer':'Beauty Manager','digits':6,'period':30})
            descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(descriptor,'w',encoding='utf-8') as file:file.write(uri+'\n')
        self.stdout.write('Dispositivo aprovisionado. Entrega fuera de banda el archivo privado y retiralo despues de configurar el autenticador.')
