-- REVIEW ONLY. Run with the separate database owner after backup/staging approval.
-- Passwords/LOGIN role creation belong to the secret-managed provisioning procedure, never this file.
-- Required roles provisioned externally: beauty_runtime, beauty_backup. Neither owns business objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO beauty_runtime, beauty_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO beauty_runtime;
REVOKE ALL ON django_migrations FROM beauty_runtime;
GRANT SELECT ON django_migrations TO beauty_runtime;
REVOKE INSERT, UPDATE, DELETE ON auth_permission, django_content_type, auth_group, auth_group_permissions, auth_user_groups, auth_user_user_permissions FROM beauty_runtime;
REVOKE INSERT, UPDATE, DELETE ON auth_user FROM beauty_runtime;
GRANT UPDATE(last_login) ON auth_user TO beauty_runtime;
REVOKE DELETE ON auditoria, movimientos_inventario, consumos_servicio, pagos, anticipos_cita, aplicaciones_anticipo, idempotency_records, ventas, visitas, citas, cita_estados_historial, lista_espera FROM beauty_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO beauty_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO beauty_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO beauty_backup;
GRANT INSERT, UPDATE ON operaciones_jobstate TO beauty_backup;
REVOKE CREATE ON SCHEMA public FROM beauty_runtime, beauty_backup;
-- Do NOT grant SUPERUSER, CREATEDB, CREATEROLE, TRUNCATE or table/function ownership.
-- Reapply reviewed grants after every approved additive migration. No automatic default DDL privileges.

REVOKE UPDATE, DELETE ON finanzas_reembolso, finanzas_ajusteventa, finanzas_conciliacion FROM beauty_runtime;
REVOKE UPDATE ON auditoria, movimientos_inventario, consumos_servicio, idempotency_records FROM beauty_runtime;
REVOKE UPDATE ON pagos FROM beauty_runtime;
GRANT UPDATE(estado) ON pagos TO beauty_runtime;
-- Public booking support is installed only by the reviewed agenda migration.
-- Preserve ownership and request results as append-only records.
DO $$ BEGIN
    IF to_regclass('public.catalogo_uploadedphoto') IS NOT NULL THEN
        REVOKE UPDATE ON catalogo_uploadedphoto FROM beauty_runtime;
    END IF;
    IF to_regclass('public.agenda_publicbookingrequest') IS NOT NULL THEN
        REVOKE DELETE ON agenda_publicbookingrequest FROM beauty_runtime;
        REVOKE UPDATE, DELETE ON agenda_publicbookingintent FROM beauty_runtime;
    END IF;
END $$;
