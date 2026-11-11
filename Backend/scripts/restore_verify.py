"""Decrypt and restore ONLY into a new randomly named scratch DB, compare ALL rows/schema, then remove that exact scratch."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
import shutil
import re
import psycopg
from psycopg import sql

# Prevent console flashes from scheduled pythonw jobs and every child process.
BACKGROUND_PROCESS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from apps.operaciones.infrastructure.backup_crypto import parse_key,decrypt
from backup_common import connection_config,pg_tool,pg_args,pg_environment,fingerprint

parser=argparse.ArgumentParser()
parser.add_argument('--archive',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
parser.add_argument('--role-policy',type=Path)
parser.add_argument('--runtime-role',default='beauty_lasheo_runtime')
parser.add_argument('--backup-role',default='beauty_lasheo_backup')
args=parser.parse_args()
key=parse_key(os.environ['BACKUP_ENCRYPTION_KEY'])
db=connection_config()
scratch='restore_verify_'+uuid.uuid4().hex[:16]
assert scratch!=db['dbname'] and scratch.startswith('restore_verify_')
started=time.perf_counter()
args.report.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='.restore-work-',dir=args.report.parent.resolve()) as workspace:
    work=Path(workspace).resolve()
    assert work.parent==args.report.parent.resolve() and work.name.startswith('.restore-work-')
    plain=work/'payload.tar'
    decrypt(args.archive.resolve(),plain,key)
    with tarfile.open(plain,'r') as tar:
        members=tar.getmembers()
        if len(members)!=2 or set(tar.getnames())!={'snapshot.dump','manifest.json'} or any(not member.isfile() for member in members):raise ValueError('Contenido inesperado.')
        # Only two exact regular filenames; never use archive-controlled paths or link extraction.
        for member in members:
            source=tar.extractfile(member)
            if source is None:raise ValueError('Archivo incompleto.')
            with source,(work/member.name).open('xb') as destination:shutil.copyfileobj(source,destination)
    manifest=json.loads((work/'manifest.json').read_text(encoding='utf-8'))
    expected=manifest['fingerprint']
    with psycopg.connect(**{**db,'dbname':'postgres'},autocommit=True) as control:
        control.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(scratch)))
        try:
            target={**db,'dbname':scratch}
            with (work/'snapshot.dump').open('rb') as stream:
                subprocess.run([pg_tool('pg_restore'),*pg_args(target),'--exit-on-error','--no-owner','--no-privileges'],
                    **BACKGROUND_PROCESS,env=pg_environment(db),check=True,stdin=stream,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            structure={}
            with psycopg.connect(**target,options='-c timezone=UTC') as restored:actual=fingerprint(restored,structure)
            if actual!=expected:
                differences=[name for name in expected if expected[name]!=actual.get(name)]
                rows=[name for name in expected['rows'] if expected['rows'][name]!=actual['rows'].get(name)]
                debug={name:{'expected':manifest.get('structure',{}).get(name),'actual':structure.get(name)} for name in differences if name!='rows'}
                args.report.with_name('phase8-schema-diff.json').write_text(json.dumps(debug,indent=2,default=str),encoding='utf-8')
                raise AssertionError('Restauracion difiere en: '+','.join(differences)+'; tablas con filas distintas: '+','.join(rows))
            if args.role_policy:
                assert all(re.fullmatch(r'[a-z][a-z0-9_]{1,62}',name) for name in (args.runtime_role,args.backup_role))
                policy=args.role_policy.read_text().replace('beauty_runtime',args.runtime_role).replace('beauty_backup',args.backup_role)
                with psycopg.connect(**target) as restored:
                    restored.execute(policy,prepare=False)
                    row=restored.execute("SELECT has_schema_privilege(%s,'public','CREATE'),has_table_privilege(%s,'clientas','SELECT'),has_table_privilege(%s,'finanzas_reembolso','UPDATE'),has_table_privilege(%s,'finanzas_conciliacion','DELETE')",[args.runtime_role]*4).fetchone()
                    assert row==(False,True,False,False),'Restored runtime privileges are unsafe.'
        finally:
            assert scratch.startswith('restore_verify_') and scratch!=db['dbname']
            control.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(scratch)))
report={'verified':True,'tables':len(expected['rows']),'all_row_hashes_match':True,'all_schema_fingerprints_match':True,
        'normalization':'Equivalent constant varchar-array/text casts normalized; all other DDL retained.',
        'elapsed_seconds':round(time.perf_counter()-started,3),'scratch_removed':True,'role_policy_verified':bool(args.role_policy),
        'roles_and_provider_grants':'reviewed local role policy reapplied and checked' if args.role_policy else 'reapply reviewed role policy; not claimed restored'}
args.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
