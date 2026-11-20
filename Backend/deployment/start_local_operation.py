"""Persistent loopback HTTPS endpoint, with project-owned containers and no database cloning."""
import json
import os
import re
import ipaddress
from pathlib import Path
import subprocess
import ssl
import time
from urllib.request import urlopen
# Prevent console flashes from scheduled pythonw jobs and every child process.
BACKGROUND_PROCESS = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def require_docker_engine():
    """Fail before inspecting resources when the Docker engine is unavailable."""
    try:
        result = subprocess.run(
            ['docker', 'info'], **BACKGROUND_PROCESS,
            capture_output=True, timeout=30,
        )
    except FileNotFoundError:
        raise RuntimeError(
            'Docker no esta instalado o no esta disponible en PATH. '
            'Instala Docker Desktop y vuelve a ejecutar este comando.'
        ) from None
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            'Docker no responde. Abre Docker Desktop, espera a que el motor '
            'este listo y vuelve a ejecutar este comando.'
        ) from None
    if result.returncode:
        raise RuntimeError(
            'No se pudo conectar al motor de Docker. Abre Docker Desktop '
            'con contenedores Linux y espera a que docker info funcione '
            'antes de volver a ejecutar este comando.'
        )


require_docker_engine()
ROOT=Path(__file__).resolve().parents[1]
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'
assert json.loads((PRIVATE/'prepared.json').read_text())['prepared']
NETWORK='beauty-local-operation'
TLS='beauty-local-operation-tls'
PROXY='nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311'
IMAGE='beauty-manager:phase8-local'
FRONTEND=ROOT.parent/'Frontend/dist/beauty-manager/browser'
HAS_FRONTEND=(FRONTEND/'index.html').is_file()
NGINX=ROOT/'deployment'/('nginx.frontend.local.conf' if HAS_FRONTEND else 'nginx.local.conf')
if HAS_FRONTEND:
    # Render only public allowlisted HTTPS hosts into CSP, never private runtime values.
    runtime=dict(line.split('=',1) for line in (PRIVATE/'runtime.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    image_hosts=[host.strip().lower() for host in runtime.get('CATALOG_IMAGE_ALLOWED_HOSTS','').split(',') if host.strip()]
    for host in image_hosts:
        if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',host) or host.endswith(('.local','.internal','.localhost')):
            raise ValueError('Invalid image hostname for local CSP.')
        try:ipaddress.ip_address(host)
        except ValueError:pass
        else:raise ValueError('IP image hosts are not allowed.')
    generated=PRIVATE/'nginx.frontend.local.conf'
    generated.write_text(NGINX.read_text().replace('__CATALOG_IMAGE_SOURCES__',' '.join('https://'+host for host in sorted(set(image_hosts)))),encoding='utf-8')
    NGINX=generated
STATIC_MOUNTS=['-v',str(FRONTEND)+':/srv/frontend:ro'] if HAS_FRONTEND else []
log=(PRIVATE/'docker-operation.log').open('ab')
def run(*args,input=None,capture=False):
    result=subprocess.run(['docker',*args],input=input,**BACKGROUND_PROCESS,stdout=subprocess.PIPE if capture else log,stderr=log)
    if result.returncode:raise RuntimeError('Local container operation failed: '+args[0]+'; review private docker-operation.log')
    return result.stdout.decode() if capture else None
for kind,name in [('network',NETWORK),('volume',TLS)]:
    found=subprocess.run(['docker',kind,'inspect',name],**BACKGROUND_PROCESS,capture_output=True)
    if found.returncode:
        run(kind,'create','--label','beauty.local.operation=true',name)
    else:
        data=json.loads(found.stdout)[0]
        assert data.get('Labels',{}).get('beauty.local.operation')=='true','Existing resource is not owned by this setup.'
for name in ['beauty-local-proxy','beauty-local-web']:
    found=subprocess.run(['docker','inspect',name],**BACKGROUND_PROCESS,capture_output=True)
    if found.returncode==0:
        info=json.loads(found.stdout)[0]
        assert info['Config']['Labels'].get('beauty.local.operation')=='true'
        run('rm','-f',name)
# stdin copies only the three exact certificate files; root initialization stays inside this named volume.
for filename in ['server.crt','server.key','ca.crt']:
    command='umask 077; cat > /tls/'+filename+'; chown 10001:10001 /tls/'+filename+'; chmod '+('600' if filename.endswith('.key') else '644')+' /tls/'+filename
    run('run','--rm','-i','--user','0:0','-v',TLS+':/tls','--entrypoint','sh',IMAGE,'-c',command,input=(PRIVATE/'certificates'/filename).read_bytes())
run('run','-d','--name','beauty-local-web','--label','beauty.local.operation=true','--network',NETWORK,
    '--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--env-file',str(PRIVATE/'runtime.env'),'-v',TLS+':/run:ro','--restart','unless-stopped',IMAGE)
run('run','--rm','--user','10001:10001','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--network',NETWORK,
    '-v',TLS+':/tls:ro','-v',str(NGINX)+':/etc/nginx/local.conf:ro',*STATIC_MOUNTS,'--entrypoint','nginx',PROXY,
    '-t','-c','/etc/nginx/local.conf')
run('run','-d','--name','beauty-local-proxy','--label','beauty.local.operation=true','--network',NETWORK,
    '--user','10001:10001','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '-p','127.0.0.1:8443:8443','-p','127.0.0.1:8000:8000','-v',TLS+':/tls:ro',
    '-v',str(NGINX)+':/etc/nginx/local.conf:ro',*STATIC_MOUNTS,'--restart','unless-stopped','--entrypoint','nginx',PROXY,
    '-c','/etc/nginx/local.conf','-g','daemon off;')
ctx=ssl.create_default_context(cafile=str(PRIVATE/'certificates/ca.crt'))
for attempt in range(30):
    try:
        with urlopen('https://localhost:8443/health/ready',context=ctx,timeout=3) as response:assert response.status==200
        break
    except Exception:
        if attempt==29:raise RuntimeError('Local HTTPS readiness failed; container start is not proof of availability.') from None
        time.sleep(.5)
print(json.dumps({'started':True,'url':'https://localhost:8443','frontend':HAS_FRONTEND,'loopback_only':True,'mfa_required':True,'ca_trust_installed':False}))
