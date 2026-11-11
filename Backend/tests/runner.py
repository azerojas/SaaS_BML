"""Load the exact, schema-only legacy snapshot BEFORE migrations in a fresh test DB."""
import uuid
from pathlib import Path
from unittest.mock import patch
import psycopg
from django.conf import settings
from django.db import connection
from django.test.runner import DiscoverRunner


class LegacySchemaRunner(DiscoverRunner):
    def setup_databases(self, **kwargs):
        if getattr(settings,'APP_ENV','development') not in ('development','ci'):
            raise RuntimeError('Tests permitidos solo en development/ci con PostgreSQL aislado.')
        if self.parallel > 1 or self.keepdb:
            raise RuntimeError('Legacy suite uses a fresh isolated database; omit --parallel/--keepdb.')
        creation = connection.creation
        original = creation._create_test_db
        production_name = connection.settings_dict['NAME']
        name = 'test_lasheo_phase1_' + uuid.uuid4().hex[:12]
        connection.settings_dict['TEST']['NAME'] = name
        settings.DATABASES['default']['TEST']['NAME'] = name

        def create_and_load(*args, **kw):
            result = original(*args, **kw)
            if name == production_name or not name.startswith('test_lasheo_phase1_'):
                raise RuntimeError('Unsafe test target.')
            db = connection.settings_dict
            transport = {key:value for key,value in db.get('OPTIONS',{}).items() if key in ('sslmode','sslrootcert','sslcert','sslkey','connect_timeout')}
            with psycopg.connect(dbname=name, user=db['USER'], password=db['PASSWORD'],
                                 host=db['HOST'], port=db['PORT'],**transport) as isolated:
                isolated.execute((Path(settings.BASE_DIR) / 'tests/legacy_schema.sql').read_text(encoding='utf-8'), prepare=False)
            return result

        with patch.object(creation, '_create_test_db', create_and_load):
            return super().setup_databases(**kwargs)

