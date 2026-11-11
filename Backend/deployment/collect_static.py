"""Build-only credentials are generated in memory; no DB access or embedded deployment secrets."""
import os
import secrets
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ.update({'DJANGO_ENV':'ci','DJANGO_SETTINGS_MODULE':'config.settings.ci','SECRET_KEY':secrets.token_urlsafe(64),
                  'DB_NAME':'build_only','DB_USER':'build_only','DB_PASSWORD':secrets.token_urlsafe(32)})
import django
django.setup()
from django.conf import settings
settings.STORAGES['staticfiles']={'BACKEND':'whitenoise.storage.CompressedManifestStaticFilesStorage'}
from django.core.management import call_command
call_command('collectstatic',interactive=False,verbosity=0)
