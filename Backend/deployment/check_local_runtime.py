"""Real denied statements, maintenance and modest health load ONLY in the labeled synthetic lab."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import statistics
import subprocess
import time
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
lab=json.loads((ROOT/'backups/phase8-lab-resources.json').read_text())
assert lab['synthetic'] and lab['success'] and lab['web'].startswith('beauty-phase8-')
inspection=json.loads(subprocess.check_output(['docker','inspect',lab['web']]))[0]
assert inspection['Config']['Labels']['beauty.phase8.synthetic']=='true'
code="""
import django
django.setup()
from django.conf import settings
from django.db import connection,transaction,DatabaseError
from django.core.management import call_command
assert settings.DATABASES['default']['NAME'].startswith('bm_staging_synthetic_')
denied=0
for statement in ['CREATE TABLE phase8_forbidden_probe(id integer)', 'UPDATE auth_permission SET name=name WHERE false', 'TRUNCATE clientas']:
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:cursor.execute(statement)
            transaction.set_rollback(True)
    except DatabaseError:denied+=1
assert denied==3, 'Runtime privilege policy failed'
with connection.cursor() as cursor:
    cursor.execute('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')
    assert cursor.fetchone()==(True,)
call_command('run_maintenance')
print('Three forbidden statements denied; TLS active; synthetic maintenance completed.')
"""
subprocess.run(['docker','exec',lab['web'],'python','-c',code],check=True)
port=inspection['NetworkSettings']['Ports']['8000/tcp'][0]['HostPort']
url=f'http://127.0.0.1:{port}/health/ready'
def request(_):
    start=time.perf_counter()
    with urlopen(url,timeout=10) as response:
        assert response.status==200
    return (time.perf_counter()-start)*1000
start=time.perf_counter()
with ThreadPoolExecutor(max_workers=8) as pool:durations=list(pool.map(request,range(80)))
report={'synthetic_only':True,'requests':80,'concurrency':8,'failures':0,'duration_seconds':round(time.perf_counter()-start,3),
    'median_ms':round(statistics.median(durations),3),'p95_ms':round(sorted(durations)[75],3),
    'runtime_denied_statements':3,'maintenance_executed':True,'commercial_capacity_claim':False}
(ROOT/'backups/phase8-local-load.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
