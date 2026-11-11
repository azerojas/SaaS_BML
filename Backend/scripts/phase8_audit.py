"""Read-only structural facts; never prints rows, credentials or personal data."""
import json
import os
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.db import connection
from psycopg import sql
from apps.integracion.user_links import USER_LINKS
report={}
with connection.cursor() as cursor:
    cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
    report['physical_tables']=cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM pg_views WHERE schemaname='public'")
    report['views']=cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM pg_constraint WHERE conname LIKE 'fase1_%_fk'")
    report['historical_user_foreign_keys']=cursor.fetchone()[0]
    orphans=0
    for table,column in USER_LINKS:
        cursor.execute(sql.SQL('SELECT count(*) FROM {} t LEFT JOIN auth_user u ON u.id=t.{} WHERE t.{} IS NOT NULL AND u.id IS NULL').format(sql.Identifier(table),sql.Identifier(column),sql.Identifier(column)))
        orphans+=cursor.fetchone()[0]
    report['orphan_user_references']=orphans
    cursor.execute("SELECT conname FROM pg_constraint WHERE contype='x' ORDER BY conname")
    report['exclusion_constraints']=[row[0] for row in cursor.fetchall()]
    cursor.execute("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")
    report['local_database_role']={key:value for key,value in zip(['superuser','createdb','createrole'],cursor.fetchone())}
    cursor.execute("SELECT EXISTS(SELECT 1 FROM django_migrations WHERE app='operaciones' AND name='0001_security_and_job_state')")
    report['phase8_migration_applied']=cursor.fetchone()[0]
(ROOT/'backups/phase8-readonly-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
