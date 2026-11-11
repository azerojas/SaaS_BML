"""Exercise the minimal backup image against synthetic TLS PostgreSQL only."""
import json
import os
from pathlib import Path
import subprocess
import uuid
ROOT=Path(__file__).resolve().parents[1]
lab=json.loads((ROOT/'backups/phase8-lab-resources.json').read_text())
assert lab['synthetic'] and lab['success']
info=json.loads(subprocess.check_output(['docker','inspect',lab['database']]))[0]
assert info['Config']['Labels']['beauty.phase8.synthetic']=='true'
private=Path(os.environ.get('USERPROFILE',str(Path.home())))/'.codex/lasheo-private'
folder=private/lab['network']
env=folder/'backup-key.env'
if not env.exists():
    with os.fdopen(os.open(env,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as file:
        file.write('BACKUP_ENCRYPTION_KEY='+(private/'phase8-backup.key').read_text().strip()+'\n')
ca=ROOT/'backups/phase8-public-ca.crt'
ca.write_bytes((folder/'ca.crt').read_bytes())
ca.chmod(0o644)
volume='beauty-phase8-backup-drill-'+uuid.uuid4().hex[:8]
subprocess.run(['docker','volume','create','--label','beauty.phase8.synthetic=true',volume],check=True,stdout=subprocess.DEVNULL)
image='beauty-manager-backup:phase8-local'
subprocess.run(['docker','run','--rm','--user','0:0','-v',volume+':/backups','--entrypoint','sh',image,'-c','chown 10001:10001 /backups'],check=True)
def run(account,script,*args):
    return subprocess.check_output(['docker','run','--rm','--network',lab['network'],'--env-file',str(folder/account),
        '--env-file',str(env),'-v',str(ca)+':/run/ca.crt:ro','-v',volume+':/backups','--entrypoint','python',image,script,*args])
result=json.loads(run('runtime.env','scripts/backup_database.py','--output-dir','/backups'))
run('migrator.env','scripts/restore_verify.py','--archive','/backups/'+result['encrypted_file'],'--report','/backups/verified.json')
report=json.loads(subprocess.check_output(['docker','run','--rm','-v',volume+':/backups:ro','--entrypoint','cat',image,'/backups/verified.json']))
report['synthetic_only']=True
report['backup_image']=image
report['local_volume']=volume
(ROOT/'backups/phase8-backup-container-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
