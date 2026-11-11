"""One-time backup and read-only legacy schema capture, before Django migrations."""
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

if (ROOT / 'tests/legacy_schema.sql').exists() or 'auth_user' in connection.introspection.table_names():
    raise RuntimeError('Initial capture already completed; do not regenerate models from a migrated database.')

db = settings.DATABASES['default']
pg_bin = Path(os.environ.get('PG_BIN', r'C:\Program Files\PostgreSQL\18\bin'))
process_env = {**os.environ, 'PGPASSWORD': db['PASSWORD']}
args = [str(pg_bin / 'pg_dump.exe'), '-h', db['HOST'], '-p', str(db['PORT']),
        '-U', db['USER'], '-d', db['NAME'], '--no-owner', '--no-privileges']
backup = ROOT / 'backups' / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '_before_phase1.dump')
backup.parent.mkdir(exist_ok=True)
with backup.open('wb') as output:
    subprocess.run(args + ['-Fc'], env=process_env, stdout=output, check=True)
with backup.open('rb') as source:
    subprocess.run([str(pg_bin / 'pg_restore.exe'), '--list'], stdin=source,
                   stdout=subprocess.DEVNULL, check=True)
schema = subprocess.run(args + ['--schema-only'], env=process_env, check=True,
                        capture_output=True, text=True, encoding='utf-8').stdout
# psql-only meta commands are unnecessary when loading with psycopg.
schema = '\n'.join(line for line in schema.splitlines() if not line.startswith('\\'))
schema_path = ROOT / 'tests' / 'legacy_schema.sql'
schema_path.parent.mkdir(exist_ok=True)
if schema_path.exists():
    raise RuntimeError('Schema snapshot already exists; review before replacing it.')
schema_path.write_text(schema, encoding='utf-8')
models = subprocess.run([sys.executable, 'manage.py', 'inspectdb'], cwd=ROOT,
                        capture_output=True, text=True, encoding='utf-8', check=True).stdout
(ROOT / 'negocio' / 'models.py').write_text(models, encoding='utf-8')
print('Backup verified:', backup.name)
print('Legacy schema and 34 unmanaged models captured.')
