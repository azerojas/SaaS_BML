"""Capture/verify the real business schema and data without writing business rows."""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection

db = settings.DATABASES['default']
pg_bin = Path(os.environ.get('PG_BIN', r'C:\Program Files\PostgreSQL\18\bin'))
args = [str(pg_bin / 'pg_dump.exe'), '-h', db['HOST'], '-p', str(db['PORT']), '-U', db['USER'],
        '-d', db['NAME'], '--no-owner', '--no-privileges']
env = {**os.environ, 'PGPASSWORD': db['PASSWORD']}
target = ROOT / 'backups/phase3-baseline.json'


def snapshot():
    schema = subprocess.run(args + ['--schema-only'], env=env, capture_output=True, check=True).stdout
    schema = b'\n'.join(line for line in schema.splitlines() if not line.startswith(b'\\'))
    result = {'schema_sha256': hashlib.sha256(schema).hexdigest(), 'business_data': {}}
    with connection.cursor() as c:
        c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'auth_%' AND tablename NOT LIKE 'django_%' AND tablename <> 'autenticacion_loginattempt' ORDER BY tablename")
        for (table,) in c.fetchall():
            c.execute("SELECT count(*),md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) FROM " + connection.ops.quote_name(table) + ' t')
            result['business_data'][table] = c.fetchone()
    return json.loads(json.dumps(result))


if '--capture' in sys.argv:
    if target.exists():
        raise RuntimeError('Baseline exists; do not overwrite.')
    backup = ROOT / 'backups' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '_before_phase3.dump')
    with backup.open('wb') as output:
        subprocess.run(args + ['-Fc'], env=env, stdout=output, check=True)
    with backup.open('rb') as source:
        subprocess.run([str(pg_bin / 'pg_restore.exe'), '--list'], stdin=source, stdout=subprocess.DEVNULL, check=True)
    target.write_text(json.dumps(snapshot(), indent=2), encoding='utf-8')
    print('Phase 3 backup and schema/business data fingerprints captured.')
else:
    assert snapshot() == json.loads(target.read_text(encoding='utf-8')), 'Unexpected real schema or business data change.'
    print('Verified: real schema and all business rows unchanged.')

