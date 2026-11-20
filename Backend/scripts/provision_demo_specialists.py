"""Provision individual agenda and personal cupo access for local demo specialists.

Credentials and authenticator QR codes are written only to the private local
operation directory. Existing accounts, passwords and MFA devices are preserved.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = Path.home() / '.codex/lasheo-private/local-operation'
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from cryptography.fernet import Fernet
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.db import connection, transaction
from apps.agenda.application.administration import professional
from negocio import models as m
import segno


def provision(apply=False):
    if connection.settings_dict['NAME'].casefold() != 'lasheo' or connection.settings_dict['HOST'] not in ('127.0.0.1', 'localhost'):
        raise RuntimeError('Only the local Lasheo database is supported.')
    manifest = json.loads((PRIVATE / 'demo-system-manifest.json').read_text(encoding='utf-8'))
    rows = list(m.Profesionales.objects.filter(pk__in=manifest['professionals']).order_by('id'))
    if len(rows) != 3:
        raise RuntimeError('The three demo specialists are required.')
    output = PRIVATE / 'specialist-accounts.json'
    if output.exists():
        accounts = json.loads(output.read_text(encoding='utf-8'))
        for entry in accounts:
            user = get_user_model().objects.get(username=entry['username'], is_active=True, is_staff=True, is_superuser=False)
            permissions=user.get_all_permissions()
            if not m.Profesionales.objects.filter(pk=entry['professional_id'], usuario=user).exists() or 'agenda.view_own_agenda' not in permissions or permissions - {'agenda.view_own_agenda','agenda.manage_own_schedule'}:
                raise RuntimeError('An existing account changed; review it without resetting credentials.')
        if apply:
            group=Group.objects.get(name='Lasheo Demo - Agenda propia')
            if set(group.user_set.values_list('username',flat=True))-set(entry['username'] for entry in accounts):
                raise RuntimeError('The demo group has additional members; review it first.')
            group.permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='manage_own_schedule'))
            guide=PRIVATE/'ACCESOS-ESPECIALISTAS.md'
            guide.write_text(guide.read_text(encoding='utf-8').replace('Cada cuenta puede consultar solo su agenda y no puede modificar citas ni consultar finanzas.','Cada cuenta puede consultar su agenda y publicar sus propios cupos. No puede modificar citas ni consultar finanzas.'),encoding='utf-8')
        return {'already_provisioned': True, 'usernames': [entry['username'] for entry in accounts]}
    plan = [{'professional_id': row.pk, 'username': name, 'name': f'{row.nombres} {row.apellidos}'} for row, name in zip(rows, ['ana_demo', 'maria_demo', 'lucia_demo'])]
    if not apply:
        return {'apply': False, 'plan': plan}
    runtime = dict(line.split('=', 1) for line in (PRIVATE / 'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    key = runtime['MFA_ENCRYPTION_KEY']
    Fernet(key.encode())
    for entry in plan:
        if get_user_model().objects.filter(username=entry['username']).exists() or m.Profesionales.objects.get(pk=entry['professional_id']).usuario_id is not None:
            raise RuntimeError('An account or assignment already exists; nothing will be replaced.')
        if (PRIVATE / (entry['username'] + '.otpauth')).exists():
            raise RuntimeError('An authenticator file already exists; review it first.')
    permission = Permission.objects.get(content_type__app_label='agenda', codename='view_own_agenda')
    own_schedule = Permission.objects.get(content_type__app_label='agenda', codename='manage_own_schedule')
    actor = get_user_model().objects.get(username='operador_local', is_staff=True, is_active=True)
    previous_key = settings.MFA_ENCRYPTION_KEY
    try:
        settings.MFA_ENCRYPTION_KEY = key
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(718302457)')
            group, created = Group.objects.get_or_create(name='Lasheo Demo - Agenda propia')
            if not created and set(group.permissions.values_list('pk', flat=True)) - {permission.pk,own_schedule.pk}:
                raise RuntimeError('The existing group contains broader permissions.')
            group.permissions.set([permission,own_schedule])
            for entry in plan:
                password = secrets.token_urlsafe(24)
                user = get_user_model().objects.create_user(entry['username'], password=password, is_staff=True, first_name=entry['name'])
                user.groups.add(group)
                professional({'usuario_id': user.pk}, actor, entry['professional_id'])
                uri = PRIVATE / (user.username + '.otpauth')
                call_command('mfa_provision', username=user.username, output=str(uri), database_name=connection.settings_dict['NAME'], verbosity=0)
                qr = PRIVATE / (user.username + '-mfa.png')
                segno.make(uri.read_text().strip(), error='m').save(str(qr), scale=6)
                entry.update(password=password, mfa_uri_file=uri.name, mfa_qr_file=qr.name)
    finally:
        settings.MFA_ENCRYPTION_KEY = previous_key
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        json.dump(plan, stream, ensure_ascii=False, indent=2)
    guide = '# Accesos individuales de las especialistas de demostracion\n\n'
    guide += 'Entrar en https://localhost:8443/login. Cada cuenta puede consultar su agenda y publicar sus propios cupos. No puede modificar citas ni consultar finanzas.\n\n'
    for entry in plan:
        guide += f"## {entry['name']}\n\nUsuario: `{entry['username']}`\n\nContrasena: `{entry['password']}`\n\n[QR de su autenticador]({entry['mfa_qr_file']})\n\n"
    guide += 'En el primer acceso, introducir el codigo del autenticador y guardar los codigos de recuperacion antes de continuar.\n\nEl administrador sigue entrando con operador_local y conserva la vista de todas las especialistas. Las citas de ejemplo estan entre el 19 y el 21 de noviembre de 2026.\n'
    (PRIVATE / 'ACCESOS-ESPECIALISTAS.md').write_text(guide, encoding='utf-8')
    return {'provisioned': True, 'usernames': [entry['username'] for entry in plan]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    print(json.dumps(provision(parser.parse_args().apply), ensure_ascii=False))
