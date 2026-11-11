"""Restore the pre-phase-1 backup into an isolated scratch database and verify it."""
import os
import subprocess
import sys
import uuid
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
import psycopg
from psycopg import sql

db = settings.DATABASES['default']
parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['1', '2', '3', '4', '5', '6', '7'], default='1')
phase = parser.parse_args().phase
expected_tables = 34 if phase == '1' else 47 if phase in ('6','7') else 45
backup = sorted((ROOT / 'backups').glob('*_before_phase' + phase + '.dump'))[-1]
scratch = 'test_lasheo_backup_' + uuid.uuid4().hex[:12]
params = dict(user=db['USER'], password=db['PASSWORD'], host=db['HOST'], port=db['PORT'])
with psycopg.connect(dbname='postgres', autocommit=True, **params) as control:
    control.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(scratch)))
    try:
        pg_bin = Path(os.environ.get('PG_BIN', r'C:\Program Files\PostgreSQL\18\bin'))
        with backup.open('rb') as source:
            subprocess.run([str(pg_bin / 'pg_restore.exe'), '--exit-on-error', '--no-owner', '--no-privileges',
                '-h', db['HOST'], '-p', str(db['PORT']), '-U', db['USER'], '-d', scratch],
                stdin=source, env={**os.environ, 'PGPASSWORD': db['PASSWORD']}, check=True)
        with psycopg.connect(dbname=scratch, **params) as restored:
            counts = restored.execute("SELECT relkind,count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') GROUP BY relkind").fetchall()
            assert dict(counts) == {'r': expected_tables, 'v': 7}, counts
        print(f'Full phase-{phase} backup restored in isolated database: {expected_tables} tables, 7 views.')
    finally:
        # Only the exact random scratch database created above may be removed.
        assert scratch.startswith('test_lasheo_backup_') and scratch != db['NAME']
        control.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(scratch)))
