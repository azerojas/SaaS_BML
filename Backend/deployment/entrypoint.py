import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
if len(sys.argv)>1:
    os.execvp(sys.argv[1],sys.argv[1:])
if os.environ.get('DJANGO_SETTINGS_MODULE') not in ('config.settings.production','config.settings.staging'):
    raise SystemExit('Runtime web requiere settings staging/production explicitos.')
port=int(os.environ.get('PORT','8000'))
if not 1<=port<=65535:raise SystemExit('PORT invalido.')
from django.core.management import execute_from_command_line
execute_from_command_line(['manage.py','check','--deploy','--fail-level','ERROR'])
# Never auto-migrate. Runtime identity has no DDL credentials.
os.execvp('gunicorn',['gunicorn','config.wsgi:application','--config','deployment/gunicorn.conf.py'])
