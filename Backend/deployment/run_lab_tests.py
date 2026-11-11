"""Linux regression on a disposable test DB in the dedicated synthetic TLS cluster."""
import json
import os
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
lab=json.loads((ROOT/'backups/phase8-lab-resources.json').read_text())
assert lab['synthetic'] and lab['success'] and lab['database'].startswith('beauty-phase8-')
info=json.loads(subprocess.check_output(['docker','inspect',lab['database']]))[0]
assert info['Config']['Labels']['beauty.phase8.synthetic']=='true'
private=Path(os.environ.get('USERPROFILE',str(Path.home())))/'.codex/lasheo-private'/lab['network']
public_ca=ROOT/'backups/phase8-public-ca.crt'
public_ca.write_bytes((private/'ca.crt').read_bytes())
public_ca.chmod(0o644)  # CA certificate is public; private keys remain under restricted ACLs.
with (ROOT/'backups/phase8-linux-tests.log').open('wb') as log:
    result=subprocess.run(['docker','run','--rm','--network',lab['network'],'--env-file',str(private/'migrator.env'),
        '-v',str(public_ca)+':/run/ca.crt:ro','beauty-manager-tests:phase8-local','python','manage.py','test','--noinput'],stdout=log,stderr=subprocess.STDOUT)
print('Linux PostgreSQL suite exit:',result.returncode)
raise SystemExit(result.returncode)
