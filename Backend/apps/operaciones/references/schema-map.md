# ADR-008 — Soporte operativo aditivo, activado en Lasheo con autorización

Fecha: 2026-11-10. Alcance actual aprobado por el usuario: operación local; sin servicios externos.

La inspección encontró 34 tablas originales de negocio y 7 vistas; existen 47 tablas físicas al incluir Django, throttling y soporte financiero de fases anteriores. Las 13 referencias históricas a auth_user están restauradas por integracion.0001. Los modelos negocio siguen managed=False. No se recrean tablas, vistas, funciones, triggers ni constraints históricos.

Las tablas existentes no permiten almacenar de forma segura un secreto TOTP cifrado con protección contra repetición/revocación y un heartbeat de tareas. Se propone operaciones.0001_security_and_job_state:

- operaciones_mfadevice: un dispositivo por administrador, secreto Fernet, último paso aceptado, intentos/bloqueo, códigos de recuperación hasheados, epoch de sesión y FK PROTECT a auth_user. No contiene contraseñas.
- operaciones_jobstate: estado, fechas y resumen mínimo de maintenance/backup. No contiene datos de clientas ni importes de negocio.
- Metadatos idempotentes: hasta 48 permisos CRUD para 12 modelos legacy que no tenían permisos efectivos, más permisos de los dos modelos nuevos y operaciones.view_operations. No se concede ningún permiso a usuarios o grupos automáticamente.

Resultado físico esperado: 49 tablas, las mismas 34 tablas originales y 7 vistas. SQL DDL revisable: [phase8-operations.sql](../../../docs/migrations/phase8-operations.sql). El RunPython de permisos no se representa en sqlmigrate; la fuente completa y autoritativa es la migración Python. **No ejecutar únicamente ese SQL ni fake-migrations.**

Antes de activar: respaldo cifrado nuevo y restaurado, check sin errores, suite PostgreSQL, ensayo de migración en base sintética, comparación de columnas/vistas/filas antes-después; validar que la única migración pendiente es operaciones.0001. Usar credencial de propietario separada. No aplicar deployment/roles.sql al servidor local sin revisión/aprobación adicional: la configuración existente puede compartir roles con otros proyectos.

Ensayos aislados realizados: bootstrap sintético completo y rollback/forward de la migración conservando columnas/vistas y clientas. El 10 de noviembre de 2026 el usuario autorizó «Sí, activar y verificar el soporte local». Se aplicó operaciones.0001_security_and_job_state tras crear y restaurar un respaldo nuevo: 49 tablas, 7 vistas, esquema original y filas no metadata conservados. Evidencia: backups/phase8-activation-report.json y phase8-activation-restore.json. No se aplicaron roles ni se activaron MFA obligatorio/jobs. Repetir el activador ahora informa already_activated sin cambios.

Reversión preferida: volver al código previo, desactivar MFA_REQUIRED/MFA_OPTIONAL_ENABLED/jobs en local y conservar ambas tablas para no perder dispositivos/heartbeats. No ejecutar migrate operaciones zero en una base usada: elimina soporte MFA y es destructivo. Solo se ensaya ese rollback dentro del runner aleatorio. Cambios de permisos/grants se revierten con una matriz revisada; no revocar grants a ciegas. El reverse RunPython conserva metadatos para no eliminar asignaciones existentes.

Las claves MFA y de backup son distintas, externas al repositorio y deben custodiarse fuera del equipo para recuperación comercial. Una copia cifrada sin su clave separada no es recuperable.
