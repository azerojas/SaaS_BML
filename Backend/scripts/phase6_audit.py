"""Read-only installed-schema audit; private structural evidence, no PII."""
import json
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

queries={
    'objects':"SELECT relname,relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') ORDER BY 1",
    'views':"SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname",
    'indexes':"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2",
    'constraints':"SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
    'columns':"SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,ordinal_position",
    'configuration':"SELECT moneda,zona_horaria FROM negocio",
}
evidence={}
with connection.cursor() as cursor:
    for key,query in queries.items():
        cursor.execute(query)
        evidence[key]=cursor.fetchall()
    cursor.execute('SELECT version()')
    evidence['postgres']=cursor.fetchone()[0]
evidence['migrations']=list(MigrationRecorder(connection).migration_qs.order_by('app','name').values_list('app','name'))
(ROOT/'backups/phase6-installed-schema.json').write_text(json.dumps(evidence,indent=2,default=str,ensure_ascii=False),encoding='utf-8')
print('Read-only installed audit saved: tables='+str(sum(row[1]=='r' for row in evidence['objects']))+', views='+str(len(evidence['views'])))
print('Views:',', '.join(row[0] for row in evidence['views']))
print('Existing user FK links:',sum(row[1].startswith('fase1_') for row in evidence['constraints']))
print('Business currency/timezone:',evidence['configuration'])
