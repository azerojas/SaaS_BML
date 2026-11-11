from django.conf import settings
from django.db import connection,transaction,DatabaseError
from django.db.migrations.executor import MigrationExecutor


def readiness():
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout = '1000ms'")
                cursor.execute('SELECT 1')
                if cursor.fetchone()!=(1,):return False
                cursor.execute("SELECT count(*) FROM pg_constraint WHERE conname IN ('ex_citas_profesional_no_solape','ex_citas_clienta_no_solape','ex_horarios_no_solape')")
                if cursor.fetchone()[0]!=3:return False
                if settings.APP_ENV in ('production','staging'):
                    cursor.execute("SELECT rolsuper,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'public','CREATE') FROM pg_roles WHERE rolname=current_user")
                    if any(cursor.fetchone()):return False
            executor=MigrationExecutor(connection)
            if executor.migration_plan(executor.loader.graph.leaf_nodes()):return False
        return True
    except DatabaseError:return False
