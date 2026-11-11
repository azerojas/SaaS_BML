"""Read-only validation after approved shared native engine maintenance."""
import json
import os
from pathlib import Path
import ssl
import sys
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
with connection.cursor() as cursor:
    cursor.execute('SHOW server_version');version=cursor.fetchone()[0]
    assert version=='18.6',version
    cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'");assert cursor.fetchone()[0]==52
    cursor.execute("SELECT count(*) FROM pg_views WHERE schemaname='public'");assert cursor.fetchone()[0]==7
    cursor.execute("SELECT count(*) FROM pg_constraint WHERE contype='x'");assert cursor.fetchone()[0]==3
    cursor.execute("SELECT count(*) FROM pg_roles WHERE rolname IN ('beauty_lasheo_runtime','beauty_lasheo_backup') AND (rolsuper OR rolcreatedb OR rolcreaterole)");assert cursor.fetchone()[0]==0
executor=MigrationExecutor(connection)
assert not executor.migration_plan(executor.loader.graph.leaf_nodes())
ctx=ssl.create_default_context(cafile=str(Path.home()/'.codex/lasheo-private/local-operation/certificates/ca.crt'))
with urlopen('https://localhost:8443/health/ready',context=ctx,timeout=20) as response:assert response.status==200
report={'verified':True,'installed_server_version':version,'tables':52,'views':7,'exclusions':3,'runtime_roles_restricted':True,'https_ready':True}
(ROOT/'backups/six-controls-engine-activation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
