"""Synthetic-only backup/restore acceptance, reused by browser harness; never targets primary DB."""
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]


def verify_backup(transport, report):
    source=urlsplit(os.environ['DATABASE_URL'])
    if not source.path.lstrip('/').startswith('frontend_e2e_') or os.environ.get('DJANGO_ENV')!='ci':
        raise RuntimeError('Backup acceptance requires disposable frontend_e2e_* DB.')
    environment={**os.environ,'BACKUP_ENCRYPTION_KEY':base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
                 'DB_SSLMODE':transport['sslmode']}
    if transport.get('sslrootcert'):
        environment['PGSSLROOTCERT']=transport['sslrootcert']
    with tempfile.TemporaryDirectory(prefix='phase7-backup-') as directory:
        archive=Path(directory)
        subprocess.run([sys.executable,str(ROOT/'scripts/backup_database.py'),'--output-dir',str(archive)],env=environment,check=True,stdout=subprocess.DEVNULL)
        encrypted=list(archive.glob('*.tar.enc'))
        if len(encrypted)!=1:
            raise RuntimeError('Expected a single encrypted snapshot.')
        subprocess.run([sys.executable,str(ROOT/'scripts/restore_verify.py'),'--archive',str(encrypted[0]),'--report',str(report)],env=environment,check=True,stdout=subprocess.DEVNULL)
    result=json.loads(report.read_text())
    if not result.get('verified') or not result.get('scratch_removed'):
        raise RuntimeError('Restore acceptance failed.')
    print('Synthetic encrypted backup restored; row/schema fingerprints match; scratch removed.',flush=True)
