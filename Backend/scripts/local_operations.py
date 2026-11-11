"""User-owned scheduler entrypoint. Secrets stay in private files; output contains only operational metadata."""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import time
from urllib.request import urlopen
# Prevent console flashes from scheduled pythonw jobs and every child process.
BACKGROUND_PROCESS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
ROOT=Path(__file__).resolve().parents[1]
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'


def environment(purpose):
    values={**os.environ}
    for line in (PRIVATE/(purpose+'-windows.env')).read_text().splitlines():
        key,separator,value=line.partition('=')
        if separator and key and not key.startswith('#'):values[key]=value
    values['BACKUP_ENCRYPTION_KEY']=(PRIVATE/'backup.key').read_text().strip()
    return values


def execute(command,env):
    result=subprocess.run(command,**BACKGROUND_PROCESS,cwd=ROOT,env=env,capture_output=True,timeout=3600)
    if result.returncode:raise RuntimeError('LocalJobFailed')  # Never forward exception text/connection credentials.
    return result.stdout.decode('utf-8').strip()


def probe():
    findings=[]
    for name in ('maintenance','backup','restore'):
        last=PRIVATE/('last-'+name+'-job.json')
        if last.exists() and json.loads(last.read_text()).get('status')=='FAILED':
            findings.append({'code':'LOCAL_JOB_FAILED','job':name,'severity':'high'})
    ctx=ssl.create_default_context(cafile=str(PRIVATE/'certificates/ca.crt'))
    for attempt in range(2):
        try:
            with urlopen('https://localhost:8443/health/ready',context=ctx,timeout=5) as response:
                assert response.status==200 and json.loads(response.read(1024))['status']=='ready'
            break
        except Exception:
            if attempt==1:findings.append({'code':'SERVICE_UNREADY','severity':'high'})
            else:time.sleep(.25)
    result=subprocess.run([sys.executable,'manage.py','check_alerts'],**BACKGROUND_PROCESS,cwd=ROOT,env=environment('runtime'),capture_output=True,timeout=30)
    try:
        payload=json.loads(result.stdout.decode().splitlines()[0]);findings+=payload['alerts']
    except Exception:findings.append({'code':'JOB_STATE_UNAVAILABLE','severity':'high'})
    usage=shutil.disk_usage(PRIVATE)
    if usage.free/usage.total<.20:findings.append({'code':'DISK_SPACE_LOW','severity':'high'})
    logs=subprocess.run(['docker','logs','--since','5m','beauty-local-web'],**BACKGROUND_PROCESS,capture_output=True,timeout=10)
    if logs.returncode==0:
        records=[]
        for line in (logs.stdout+logs.stderr).decode('utf-8',errors='replace').splitlines()[-10000:]:
            try:records.append(json.loads(line))
            except ValueError:pass
        sys.path.insert(0,str(ROOT))
        from apps.operaciones.domain.http_metrics import evaluate
        findings+=evaluate(records)
    from cryptography import x509
    certificate=x509.load_pem_x509_certificate((PRIVATE/'certificates/server.crt').read_bytes())
    if (certificate.not_valid_after_utc-datetime.now(timezone.utc)).days<30:
        findings.append({'code':'TLS_CERTIFICATE_EXPIRES_SOON','severity':'high'})
    target=PRIVATE/'active-alerts.json'
    old=json.loads(target.read_text()) if target.exists() else {}
    payload={'checked_at':datetime.now(timezone.utc).isoformat(),'alerts':findings,'external_delivery_configured':False}
    target.write_text(json.dumps(payload,indent=2))
    if findings and old.get('alerts')!=findings:
        # Local recipient only. A popup result cannot prove the operator saw it; external escalation remains pending.
        command="Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Warning; $n.Visible=$true; $n.ShowBalloonTip(5000,'Lasheo: alerta local','Revise active-alerts.json en la carpeta privada.',[System.Windows.Forms.ToolTipIcon]::Warning); Start-Sleep -Seconds 5; $n.Dispose()"
        subprocess.run(['powershell','-NoProfile','-WindowStyle','Hidden','-Command',command],**BACKGROUND_PROCESS,capture_output=True,timeout=15)
    return {'alerts':findings,'external_delivery':False}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--job',choices=['maintenance','backup','restore','probe','startup'],required=True)
    args=parser.parse_args()
    assert (PRIVATE/'prepared.json').exists()
    if os.name=='nt':
        import msvcrt
        lock=(PRIVATE/(args.job+'.lock')).open('a+b')
        lock.seek(0)
        try:msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:
            print(json.dumps({'job':args.job,'skipped':'already_running'}));return
    started=time.monotonic()
    try:
        detail={}
        if args.job=='maintenance':execute([sys.executable,'manage.py','run_maintenance'],environment('runtime'))
        elif args.job=='backup':
            output=PRIVATE/'backups';output.mkdir(exist_ok=True)
            detail=json.loads(execute([sys.executable,'scripts/backup_database.py','--output-dir',str(output),'--record-job'],environment('backup')))
        elif args.job=='restore':
            archives=list((PRIVATE/'backups').glob('*.tar.enc'))
            if not archives:raise RuntimeError('NoBackupAvailable')
            archive=max(archives,key=lambda item:item.stat().st_mtime)
            detail=json.loads(execute([sys.executable,'scripts/restore_verify.py','--archive',str(archive),'--report',str(PRIVATE/'last-restore.json'),
                '--role-policy','deployment/roles.sql'],environment('restore')))
        elif args.job=='probe':detail=probe()
        elif args.job=='startup':
            for attempt in range(18):
                if subprocess.run(['docker','info'],**BACKGROUND_PROCESS,capture_output=True,timeout=10).returncode==0:break
                if attempt==0:
                    desktop=Path(os.environ.get('ProgramFiles','C:/Program Files'))/'Docker/Docker/Docker Desktop.exe'
                    if desktop.exists():
                        command="Start-Process -WindowStyle Hidden -FilePath '"+str(desktop).replace("'","''")+"'"
                        subprocess.Popen(['powershell','-NoProfile','-WindowStyle','Hidden','-Command',command],**BACKGROUND_PROCESS,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                time.sleep(5)
            execute([sys.executable,'deployment/start_local_operation.py'],os.environ.copy())
        payload={'job':args.job,'status':'SUCCESS','at':datetime.now(timezone.utc).isoformat(),
            'elapsed_seconds':round(time.monotonic()-started,3),'detail':detail}
    except Exception as error:
        payload={'job':args.job,'status':'FAILED','at':datetime.now(timezone.utc).isoformat(),'error_type':type(error).__name__}
    with (PRIVATE/'operations.jsonl').open('a',encoding='utf-8') as file:file.write(json.dumps(payload)+'\n')
    (PRIVATE/('last-'+args.job+'-job.json')).write_text(json.dumps(payload,indent=2))
    print(json.dumps(payload))
    if payload['status']=='FAILED':raise SystemExit(1)


if __name__=='__main__':main()
