"""Restrict only Lasheo to verified TLS loopback and its observed local Docker client; preserve other rules."""
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import time
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'deployment')]
from local_certificates import private_write
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.db import connection
from django.conf import settings
assert settings.APP_ENV=='development' and settings.DATABASES['default']['NAME']=='Lasheo'
private=Path.home()/'.codex/lasheo-private/local-operation'
code="import django;django.setup();from django.db import connection;c=connection.cursor();c.execute('SELECT inet_client_addr()');print(c.fetchone()[0])"
client=subprocess.check_output(['docker','exec','beauty-local-web','python','-c',code],text=True).strip()
address=ipaddress.ip_address(client)
assert address.is_private
with connection.cursor() as cursor:
    cursor.execute("SELECT current_setting('hba_file')")
    path=Path(cursor.fetchone()[0])
before=path.read_bytes()
assert b'# BEGIN LASHEO LOCAL TLS' not in before,'Already restricted; review existing block before changing client address.'
private_write(private/'pg_hba.before.conf',before)
block=f'''# BEGIN LASHEO LOCAL TLS
hostssl Lasheo all 127.0.0.1/32 scram-sha-256
hostssl Lasheo all ::1/128 scram-sha-256
hostssl Lasheo beauty_lasheo_runtime {client}/{32 if address.version==4 else 128} scram-sha-256
host Lasheo all 0.0.0.0/0 reject
host Lasheo all ::/0 reject
# END LASHEO LOCAL TLS
'''.encode()
try:
    path.write_bytes(block+before)
    with connection.cursor() as cursor:
        cursor.execute('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')
        assert cursor.fetchone()[0]==0,'Invalid HBA rules; reverting only this exact change.'
        cursor.execute('SELECT pg_reload_conf()')
    time.sleep(.5)
    connection.close()
    with connection.cursor() as cursor:cursor.execute('SELECT 1')
    subprocess.run(['docker','exec','beauty-local-web','python','-c',code],check=True,stdout=subprocess.DEVNULL)
except Exception:
    # Do not overwrite concurrent administrator edits.
    if path.read_bytes()==block+before:path.write_bytes(before)
    raise
report={'restricted':True,'scope':'Lasheo only','tls_required':True,'allowed_clients':'loopback and observed local Docker runtime address',
    'other_database_rules_unchanged':True,'hba_after_sha256':hashlib.sha256(block+before).hexdigest(),'restart_required':False}
(ROOT/'backups/six-controls-database-access.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
