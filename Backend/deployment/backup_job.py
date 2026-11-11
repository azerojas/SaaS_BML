"""Explicit local/container backup job; no automatic restore or provider provisioning."""
import os
import sys
if os.environ.get('ALLOW_BACKUP_JOB')!='True':raise SystemExit('Backup job disabled; approve destination and credentials first.')
args=[sys.executable,'scripts/backup_database.py','--output-dir',os.environ.get('BACKUP_OUTPUT_DIR','/backups')]
if os.environ.get('BACKUP_UPLOAD_ENABLED')=='True':args.append('--upload')
if os.environ.get('BACKUP_RECORD_JOB')=='True':args.append('--record-job')
os.execv(sys.executable,args)
