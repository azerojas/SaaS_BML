"""Deterministic allowlisted tar context also works from OneDrive without reparse-point BuildKit errors."""
import argparse
import hashlib
from io import BytesIO
from pathlib import Path
import subprocess
import tarfile
import uuid

ROOT=Path(__file__).resolve().parents[1]


def allowed(path):
    relative=path.relative_to(ROOT)
    if any(part in ('backups','.venv','__pycache__','.git','staticfiles','.ruff_cache','.mypy_cache') for part in relative.parts):return False
    if path.suffix in ('.pyc','.key','.enc','.otpauth'):return False
    if path.name.startswith('.env') and not path.name.endswith('.example'):return False
    if path.name=='local.env':return False
    return relative.parts[0] in ('apps','negocio','config','deployment','scripts','tests') or relative.as_posix() in ('manage.py','requirements.txt','requirements-dev.txt','requirements-tools.txt','requirements-backup.txt','docs/openapi.json','.dockerignore')


def build(tag,dockerfile='deployment/Dockerfile'):
    output=ROOT/('backups/phase8-build-context-'+uuid.uuid4().hex+'.tar')
    digest=hashlib.sha256()
    with tarfile.open(output,'w') as archive:
        for path in sorted(ROOT.rglob('*')):
            if not path.is_file() or not allowed(path):continue
            name=path.relative_to(ROOT).as_posix()
            content=path.read_bytes()
            digest.update(name.encode()+b'\0'+content)
            info=tarfile.TarInfo(name)
            info.size=len(content)
            info.mode=0o644
            archive.addfile(info,BytesIO(content))
    label=tag.replace(':','-').replace('/','-')
    with output.open('rb') as context,(ROOT/f'backups/phase8-build-{label}.log').open('wb') as log:
        result=subprocess.run(['docker','build','-f',dockerfile,'-t',tag,'-'],stdin=context,stdout=log,stderr=subprocess.STDOUT)
    assert output.parent==ROOT/'backups' and output.name.startswith('phase8-build-context-')
    output.unlink()
    print('Source context SHA256:',digest.hexdigest())
    if result.returncode:raise SystemExit(result.returncode)
    print('Docker image built:',tag)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--tag',default='beauty-manager:phase8-local')
    parser.add_argument('--dockerfile',default='deployment/Dockerfile')
    args=parser.parse_args()
    build(args.tag,args.dockerfile)
