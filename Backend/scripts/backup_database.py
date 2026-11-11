"""Consistent pg_dump + structural/data fingerprints, authenticated encryption, optional private S3 upload."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime,timezone
import psycopg

# Prevent console flashes from scheduled pythonw jobs and every child process.
BACKGROUND_PROCESS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from apps.operaciones.infrastructure.backup_crypto import parse_key,encrypt
from backup_common import connection_config,pg_tool,pg_args,pg_environment,fingerprint

parser=argparse.ArgumentParser()
parser.add_argument('--output-dir',type=Path,required=True)
parser.add_argument('--upload',action='store_true')
parser.add_argument('--record-job',action='store_true')
args=parser.parse_args()
key=parse_key(os.environ['BACKUP_ENCRYPTION_KEY'])
db=connection_config()
output=args.output_dir.resolve()
output.mkdir(parents=True,exist_ok=True)
name='beauty_manager_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
encrypted=output/(name+'.tar.enc')
with tempfile.TemporaryDirectory(prefix='.backup-work-',dir=output) as workspace:
    work=Path(workspace).resolve()
    assert work.parent==output and work.name.startswith('.backup-work-')
    archive=work/'snapshot.dump'
    manifest=work/'manifest.json'
    with psycopg.connect(**db,options='-c timezone=UTC') as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        snapshot=conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
        structure={}
        data=fingerprint(conn,structure)
        with archive.open('wb') as stream:
            subprocess.run([pg_tool('pg_dump'),*pg_args(db),'--no-owner','--no-privileges','--format=custom','--snapshot='+snapshot],
                **BACKGROUND_PROCESS,env=pg_environment(db),check=True,stdout=stream,stderr=subprocess.PIPE)
    manifest.write_text(json.dumps({'format':1,'created_at':datetime.now(timezone.utc).isoformat(),'fingerprint':data,'structure':structure},indent=2,default=str),encoding='utf-8')
    plain=work/'payload.tar'
    with tarfile.open(plain,'w') as tar:
        tar.add(archive,arcname='snapshot.dump')
        tar.add(manifest,arcname='manifest.json')
    encrypt(plain,encrypted,key)
    assert work.is_relative_to(output)
with encrypted.open('rb') as file:checksum=hashlib.file_digest(file,'sha256').hexdigest()
(encrypted.with_suffix('.sha256')).write_text(checksum+'\n',encoding='ascii')
if args.upload:
    import boto3
    from urllib.parse import urlsplit
    endpoint=os.environ.get('BACKUP_S3_ENDPOINT')
    if endpoint and urlsplit(endpoint).scheme!='https':raise ValueError('S3 requiere HTTPS.')
    bucket=os.environ['BACKUP_S3_BUCKET']
    client=boto3.client('s3',endpoint_url=endpoint)
    client.upload_file(str(encrypted),bucket,encrypted.name,ExtraArgs={'ServerSideEncryption':'AES256'})
    remote=client.head_object(Bucket=bucket,Key=encrypted.name)
    assert remote['ContentLength']==encrypted.stat().st_size
if args.record_job:
    with psycopg.connect(**db) as conn:
        conn.execute("INSERT INTO operaciones_jobstate(key,status,started_at,finished_at,last_success_at,summary) VALUES ('backup','SUCCESS',now(),now(),now(),%s::jsonb) ON CONFLICT(key) DO UPDATE SET status='SUCCESS',finished_at=now(),last_success_at=now(),summary=EXCLUDED.summary",
            [json.dumps({'encrypted':True,'uploaded':args.upload,'sha256':checksum})])
print(json.dumps({'encrypted_file':encrypted.name,'bytes':encrypted.stat().st_size,'sha256':checksum,'uploaded':args.upload}))
