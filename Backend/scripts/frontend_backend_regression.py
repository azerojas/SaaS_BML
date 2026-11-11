"""Run existing backend regression in fresh PostgreSQL using the private local restore role."""
import os
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit, urlencode

ROOT = Path(__file__).resolve().parents[1]
private = Path.home() / '.codex/lasheo-private/local-operation'
owner = dict(line.split('=', 1) for line in (private / 'restore-windows.env').read_text().splitlines() if '=' in line)
source = urlsplit(owner['DATABASE_URL'])
transport = {'sslmode': 'verify-full', 'sslrootcert': owner['DB_SSLROOTCERT'], 'connect_timeout': 5}
environment = {**os.environ, 'DJANGO_ENV': 'ci', 'DJANGO_SETTINGS_MODULE': 'config.settings.ci',
               'SECRET_KEY': secrets.token_urlsafe(64),
               'DATABASE_URL': urlunsplit(source._replace(path='/postgres', query=urlencode(transport)))}
# LegacySchemaRunner always creates a random test_lasheo_phase1_* database, and destroys it afterwards.
log = ROOT / 'backups/frontend-phase1-backend-regression.log'
with log.open('wb') as output:
    result = subprocess.run([sys.executable, 'manage.py', 'test', '--noinput', *sys.argv[1:]],
                            cwd=ROOT, env=environment, stdout=output, stderr=subprocess.STDOUT)
print('Isolated PostgreSQL backend regression exit:', result.returncode)
print('Log: backups/frontend-phase1-backend-regression.log')
raise SystemExit(result.returncode)
