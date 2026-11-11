# Operación y recuperación local

Todos los comandos se ejecutan desde Backend con el Python de .venv. Ningún comando de este documento autoriza por sí mismo cambios en Lasheo o despliegues. Antes de migrar, expirar reservas, borrar sesiones/counters, provisionar MFA o cambiar roles reales se requiere aprobación específica del responsable. Los ensayos usan exclusivamente bases aleatorias/sintéticas.

## Revisión sin cambios

`python manage.py check`, `python manage.py showmigrations`, `python scripts/phase8_audit.py` y `python scripts/phase8_activation.py --expected-database Lasheo` son diagnósticos. El último es dry-run y aborta si el plan incluye algo distinto de operaciones.0001. `python scripts/phase8_snapshot.py` comprueba contra la foto inicial sin tocar filas; después de actividad legítima o una migración aprobada esa foto ya no debe usarse como comparación universal.

La migración de Fase8 está propuesta en apps/operaciones/references/schema-map.md. El activador --apply exige autorización explícita, flag PHASE8_ACTIVATION_APPROVED=True, nombre exacto y un backup cifrado nuevo restaurado en scratch. Comprueba originales/filas, crea únicamente soporte y metadata. No ejecuta política de roles ni activa MFA/jobs. Si falla comparación, detener uso y revisar diferencias; nunca restaurar encima ni invertir automáticamente.

## Respaldos

Clave externa actual: %USERPROFILE%/.codex/lasheo-private/phase8-backup.key. Carpeta protegida mediante ACL de usuario y SYSTEM; no imprimir ni incluir en fuente o dump. No compartir el archivo junto al respaldo. Para ensayos se carga su contenido a BACKUP_ENCRYPTION_KEY solo en el proceso hijo, sin argumento de línea de comandos ni transcripción. En Linux usar archivo 0600/secret mount y usuario dedicado. Nunca copiar secretos a OneDrive o artefactos de CI.

`python scripts/backup_database.py --output-dir <carpeta-privada>`: transacción READ ONLY REPEATABLE READ, snapshot exportado común a huellas y pg_dump, formato custom, manifest, cifrado AES-256-GCM streaming y SHA256. El script temporal conserva plaintext durante el proceso bajo directorio privado y lo elimina al salir; asegurar permisos y cifrado de disco. Fallos de proceso/apagón pueden dejar temporales: no sincronizar esa carpeta; revisar/retirar exclusivamente temporales identificados tras cerrar procesos.

Las copias de evidencia de esta fase están en Backend/backups (ignorado por Git, pero dentro de una ruta OneDrive). Eso **no** es un destino privado comercial verificado. Para operación local continua elegir carpeta cifrada fuera de OneDrive y otro dispositivo/custodio; no se configuró ni transmitió copia externa. Existen dumps históricos sin cifrar de fases anteriores dentro de backups: inventariar/mover/cifrar con aprobación, no confundir .gitignore con privacidad ni borrarlos sin permiso.

`--upload` solo con proveedor/bucket privado HTTPS aprobados, credenciales restringidas y requisitos de requirements-backup.txt instalados. Envía el archivo ya cifrado y comprueba tamaño remoto; no sustituye recuperar y restaurar una copia descargada. No se ejecutó upload/S3. `--record-job` escribe metadata en operaciones_jobstate y solo se permite tras activar soporte. Un backup sin heartbeat puede existir, pero generará alerta de backup obsoleto; no inventar éxito para silenciarla.

Propuesta sin aprobar: diario 02:00 Lima, 7 diarios + 4 semanales en destino cifrado separado, ensayo mensual. No hay borrado automático implementado: aprobar retención y encargado antes de aplicar limpieza. Copia en mismo equipo no protege pérdida/robo/incendio. No hay archivado WAL/PITR configurado.

## Restaurar y verificar

`python scripts/restore_verify.py --archive <archivo.tar.enc> --report <informe.json>` requiere la clave externa y credencial de restauración con CREATEDB en servidor aislado. Descifra verificando GCM, rechaza miembros tar inesperados, crea restore_verify_UUID, restaura sin owner/grants y compara columnas, constraints, índices, 7 vistas, funciones, triggers y hashes de **todas** las tablas/filas. Borra únicamente su scratch en finally. Nunca recibe un nombre de destino existente ni sobreescribe Lasheo.

La normalización SQL solo equipara casts equivalentes de arrays literales varchar[]/text[] que pg_restore reescribe; pruebas demuestran que no oculta cambios reales. Roles/owners/grants del cluster no vienen en --no-owner --no-privileges: reprovisionar bajo deployment/roles.sql revisado y probar privilegios antes del retorno. Custodiar también configuración, CA, claves MFA/backup y versiones de imagen en un destino separado.

El ensayo real conservó 47 tablas y todo su contenido/esquema; ver backups/phase8-restore-report.json. El tiempo medido de restore pequeño no es RTO comercial: no incluye conseguir equipo, claves, despliegue, revisión ni reabrir servicio. RPO y RTO están **sin acordar**. Propuesta para discutir: RPO24h/RTO4h; no compromiso vigente. No hay capacidad de volver a un segundo intermedio sin WAL.

Incidente: detener escrituras, conservar evidencias, avisar al responsable, localizar última copia autenticada y claves, restaurar en servidor nuevo aislado, verificar hashes/roles/negocio, acordar pérdida de datos, aprobar cambio de conexión, smoke y monitorizar. Nunca eliminar la base afectada. Volver a configuración anterior si smoke falla, manteniendo ambas copias para análisis.

## MFA, sesiones y secretos

Tras aprobación/migración, generar MFA_ENCRYPTION_KEY distinta en cada entorno y custodiarla. Provisionar por canal local autorizado: `python manage.py mfa_provision --username <cuenta> --database-name <base-exacta> --output <archivo-privado-nuevo.otpauth>`. No poner URI/códigos en chat, repositorio, captura o logs. El administrador escanea fuera de banda; primera verificación confirma dispositivo y entrega seis códigos una vez. Retirar URI tras entrega segura. --replace revoca dispositivos/sesiones anteriores y requiere responsable identificado.

Si se pierde autenticador: código de recuperación de un solo uso, luego reposición autorizada. Si se pierde clave Fernet: recuperar clave custodiada o reprovisionar todos los dispositivos con acceso privilegiado y verificación fuera de banda; no omitir MFA públicamente. Rotación SECRET_KEY invalida sesiones y HMAC; coordinar ventana. Rotar contraseñas Django/DB de prueba antes de exponer servicio. No cambiar credenciales del cluster compartido sin revisar otros proyectos.

## Jobs, alertas y monitoreo

`python manage.py run_maintenance` está deshabilitado hasta ALLOW_MAINTENANCE_JOBS=True. Ejecutar cada 5min desde scheduler externo aprobado. Serializa con advisory lock de sesión, expira/regulariza reservas, expira QR, elimina hasta500 contadores con más de7 días y sesiones vencidas; registra heartbeat. No elimina auditoría, pagos, anticipos ni idempotency_records. Hasta20 lotes de500 para agenda; backlog mayor requiere ejecutar de nuevo. No se activó tarea Windows ni Railway en este equipo.

`python manage.py check_alerts` evalúa maintenance sin éxito>15min, backup>25h y estados FAILED; devuelve error cuando hay hallazgos. `--deliver` solo al webhook privado HTTPS autorizado. `python manage.py probe_service --url <https://host/health/ready>` es sonda externa sin escribir DB; error/timeout/503 produce salida no exitosa y alerta opcional. No sigue redirecciones ni transmite credencial de alerta a otro destino. El test local sí entregó alertas a un receptor HTTP loopback; no hubo envío a terceros. No existe canal externo/scheduler activo, por lo que no prometer vigilancia continua.

Logs JSON stdout: request_id, route pattern (sin token ni ID real), método, estado y latencia; jobs/error_type mínimo. Nunca cuerpos, teléfono, cookie, contraseña, URI MFA ni traza. Alertas de tasa5xx/latencia y disco/CPU/conexiones deben agregarse desde logs/métricas del host antes de comercializar; aún no hay colector ni escalamiento remoto. Umbrales propuestos: 5xx>1%/5min, readiness2 fallos consecutivos, p95>1s/5min, disco>80%, conexiones>80%; calibrar con volumen real. La sonda actual falla al primer error: política de dos intentos corresponde al scheduler/monitor externo pendiente.

Retención propuesta: logs operativos14d privados sin PII; auditoría/consentimientos/finanzas no se purgan sin política legal aprobada. Borrado de clienta no debe borrar historia financiera por conveniencia. Responsable, aviso real y política de datos personales pendientes de revisión comercial/legal.

## Verificación y reversión de cambios

Suite: `python manage.py test --noinput`; usa PostgreSQL aleatorio y rechaza staging/prod/keepdb/parallel. Herramientas: requirements-tools.txt. Checks estáticos y auditorías en workflow; scan_images.py conserva findings de imagen sin ignorar unfixed. Ejecutar Linux mediante Dockerfile.tests y run_lab_tests.py; dependencias de lector QR solo en imagen de pruebas.

Para volver al código anterior: conservar copia de fuentes/imagen previa, volver settings development si operación exclusivamente local, desactivar flags/schedulers, preservar soporte nuevo. No aplicar reversión destructiva de migraciones a una base con dispositivos o jobs. Los cambios de tests/docs/build/CI se revierten a versión de fuente anterior y no cambian negocio. El parche OS se revierte solo al digest previo en aislamiento, considerando vulnerabilidades conocidas. Los archivos phase8-files.json e informe detallan alcance.

Limpieza del laboratorio: identificar nombres exactos en phase8-lab-resources.json, comprobar etiqueta beauty.phase8.synthetic=true con docker inspect, parar y retirar únicamente esos contenedores; después sus volúmenes/red si no se conservarán para evidencia. No ejecutar docker system prune ni borrar contenedores del usuario. Retener backups y claves según política aprobada.
