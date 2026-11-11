"""Stage PostgreSQL18.6 in a new private synthetic cluster; never stops or edits the installed service."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import uuid
ROOT=Path(__file__).resolve().parents[1]
PRIVATE=Path.home()/'.codex/lasheo-private/engine-update'
BIN=PRIVATE/'18.6/bin'
assert json.loads((PRIVATE/'package.json').read_text())['version'].endswith('18.6')
run=PRIVATE/('synthetic-'+uuid.uuid4().hex[:8]);run.mkdir()
password=secrets.token_urlsafe(36)
secret=run/'password.txt'
with os.fdopen(os.open(secret,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as file:file.write(password)
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
with (run/'bootstrap.log').open('wb') as log:
    subprocess.run([str(BIN/'initdb.exe'),'-D',str(run/'data'),'-U','synthetic_migrator','--pwfile',str(secret),
        '--auth=scram-sha-256','--encoding=UTF8','--locale=C'],check=True,stdout=log,stderr=subprocess.STDOUT,creationflags=flags)
    subprocess.run([str(BIN/'pg_ctl.exe'),'-D',str(run/'data'),'-l',str(run/'server.log'),'-o',f'-p {port} -h 127.0.0.1','-w','start'],check=True,stdout=log,stderr=subprocess.STDOUT,creationflags=flags)
try:
    env={**os.environ,'DJANGO_ENV':'ci','DJANGO_SETTINGS_MODULE':'config.settings.ci','SECRET_KEY':secrets.token_urlsafe(64),
        'DATABASE_URL':f'postgresql://synthetic_migrator:{password}@127.0.0.1:{port}/postgres'}
    with (ROOT/'backups/six-controls-native-18.6-tests.log').open('wb') as log:
        result=subprocess.run([sys.executable,'manage.py','test','--noinput'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=flags)
finally:
    subprocess.run([str(BIN/'pg_ctl.exe'),'-D',str(run/'data'),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL,creationflags=flags)
report={'isolated_native_postgres':'18.6','suite_exit_code':result.returncode,'synthetic_only':True,'installed_service_stopped':False,'synthetic_server_stopped':True}
(ROOT/'backups/six-controls-native-engine-stage.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
raise SystemExit(result.returncode)
