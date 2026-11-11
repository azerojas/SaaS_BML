"""Reviewed legacy INTEGER columns; preserve history with ON DELETE SET NULL."""
from psycopg import sql
USER_LINKS = [
    ('anticipos_cita', 'registrado_por_id'), ('auditoria', 'usuario_id'),
    ('bloqueos_agenda', 'creado_por_id'), ('cita_estados_historial', 'cambiado_por_id'),
    ('citas', 'creada_por_id'), ('compras', 'creado_por_id'),
    ('gastos_operativos', 'registrado_por_id'), ('llegadas', 'confirmada_por_id'),
    ('movimientos_inventario', 'registrado_por_id'), ('pagos', 'registrado_por_id'),
    ('profesionales', 'usuario_id'), ('ventas', 'creada_por_id'), ('visitas', 'creada_por_id'),
]


def restore_links(apps, schema_editor):
    connection = schema_editor.connection
    q = connection.ops.quote_name
    with connection.cursor() as cursor:
        cursor.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_user' AND column_name='id'")
        if cursor.fetchone() != ('integer',):
            raise RuntimeError('Expected standard Django auth_user.id INTEGER.')
        for table, column in USER_LINKS:
            cursor.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=%s AND column_name=%s", [table, column])
            if cursor.fetchone() != ('integer',):
                raise RuntimeError('Unexpected legacy user column type: ' + table + '.' + column)
            cursor.execute(sql.SQL('SELECT count(*) FROM {} t LEFT JOIN auth_user u ON u.id=t.{} WHERE t.{} IS NOT NULL AND u.id IS NULL').format(sql.Identifier(table),sql.Identifier(column),sql.Identifier(column)))
            if cursor.fetchone()[0]:
                raise RuntimeError('Orphan user references: ' + table)
        for table, column in USER_LINKS:
            name = 'fase1_' + table + '_' + column + '_fk'
            cursor.execute(f'ALTER TABLE {q(table)} ADD CONSTRAINT {q(name)} FOREIGN KEY ({q(column)}) REFERENCES auth_user(id) ON DELETE SET NULL')


def remove_links(apps, schema_editor):
    q = schema_editor.connection.ops.quote_name
    for table, column in USER_LINKS:
        schema_editor.execute(f'ALTER TABLE {q(table)} DROP CONSTRAINT {q("fase1_" + table + "_" + column + "_fk")}')

