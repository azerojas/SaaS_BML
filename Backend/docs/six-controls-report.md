# Resultado de los seis controles — 10 de noviembre de 2026

Se implementaron y activaron los controles solicitados para **operación local con datos ficticios**. PostgreSQL Windows se actualizó a18.6 y se rotó la clave administrativa con la autorización expresa recibida. No se publicó nada ni se contrataron servicios. La decisión comercial continúa **NO-GO**: faltan destino de backup/canal de alertas independientes, capacidad de disco y los requisitos legales/de publicación del punto7.

| Control solicitado | Resultado real | Límite pendiente |
|---|---|---|
| 1. Vulnerabilidades Docker | Python3.14.10/Alpine por digest, herramientas retiradas del runtime; web, backup y Nginx1.30.6 con **0 HIGH/CRITICAL** en Trivy, sin ignorelist | Resultado del análisis de esta fecha; repetir en CI ante versiones/CVE nuevas |
| 2. Seguridad operativa | Roles runtime/backup/restore separados; runtime sin DDL/permisos/contraseñas; registros financieros/auditoría append-only; PostgreSQL18.6, TLS verify-full, HBA limitada a Lasheo local; operador staff sin superuser con MFA; clave postgres de prueba sustituida | Actualizar la contraseña guardada en pgAdmin u otras aplicaciones que usaban postgres |
| 3. Conciliación financiera | Reembolsos, ajustes y cierres con evidencia, locks, idempotencia y Decimal; tres tablas aditivas, **52 tablas/7 vistas**, originales conservados | Cierre humano con evidencia, sin integración bancaria automática ni contabilidad tributaria |
| 4. Entorno definitivo | Perfil local seguro real en **https://localhost:8443**, Gunicorn/Nginx no root, filesystem readonly, sin capacidades, red privada; puerto8000 redirige a HTTPS | Solo este equipo; importación CA cancelada en Windows: navegadores requieren confianza manual; clientes móviles externos no habilitados |
| 5. Recuperación | Backup cifrado cada30min y restore diario; restauración de52 tablas con todas las huellas y política de roles comprobadas después de actualizar | RPO1h/RTO2h acordados como objetivos; no se garantiza recuperación ante pérdida del disco/equipo sin copia externa |
| 6. Operación/alertas | Cinco tareas Windows activas y ejecutadas con resultado0; mantenimiento/sonda cada5min, arranque al iniciar sesión; detección real de caída y recuperación y avisos locales | Sin canal externo/acuse humano; sesión y equipo activos; alerta de disco bajo sigue vigente |

## Evidencia de ejecución

- Regresión final posterior a la actualización y al caso de límite de conciliación: **359 pruebas OK,157,204s**, en PostgreSQL18.6 y base aleatoria (backups/six-controls-post-upgrade-regression.log). Ejecuciones anteriores:358 OK en servidor18.6 nativo aislado y358 OK en Linux/Alpine/PostgreSQL18.6. Se distinguen resultados por versión del conjunto de pruebas.
- Reembolsos concurrentes con dos conexiones: una devolución70 sobre cobro100 gana y la otra se rechaza409; suma nunca excede fuente. Reintento de misma clave no duplica devolución ni cierre. Ajuste no cambia snapshots, precios, consumos ni stock. Entradas/anticipos y devoluciones se cuentan una vez; aplicación de anticipo no es ingreso nuevo.
- Cierre manual: neto80 habilitado solo con evidencia, día/medio completo y hash vigente; evento tardío bloquea el cierre hasta nueva revisión70. Fuente excesiva bloquea importe con null/advertencia, nunca cero inventado ni500.
- HTTPS real: login sin CSRF403; contraseña correcta202 sin acceso; TOTP200; clientas/agenda/operaciones/reembolsos/conciliaciones200; logout204 y acceso privado403. Cookies Secure/HttpOnly. Cuatro sentencias SQL prohibidas rechazadas por permisos; conexión DB sin TLS rechazada.
- Trivy: backups/phase8-image-security-summary.json y phase8-trivy-{web,backup,proxy}.json. El proxy Caddy evaluado se descartó al encontrar dependencias vulnerables; el proxy activo es Nginx por digest, sin esos findings.
- Backup posterior a actualización:52 tablas, todas las huellas de filas/esquema coinciden, scratch eliminado y permisos reaplicados/verificados; backups privados local-operation/last-restore.json. Tiempo medido reciente:2,508s de restore DB. Esto no demuestra RTO de desastre completo ni incluye conseguir otro equipo.
- Fallo inicial y corrección: la primera actualización regresó automáticamente al binario18.3 porque Nginx no podía crear fastcgi_temp en filesystem readonly. Se movieron todos los temporales a /tmp y se añadieron nginx -t y readiness HTTPS al arranque; después18.6 y rotación administrativa pasaron. No se declaró aprobado el intento fallido.
- Preservación tras actualización: todas las huellas de esquema coinciden;38 tablas de negocio/soporte conservan sus hashes de filas. Solo auditoría, autenticación y heartbeats se excluyen de comparar filas porque sus cambios legítimos fueron parte del ensayo. Cero índices inválidos y cero desajustes de versión de collation. Evidencia: backups/six-controls-upgrade-preservation.json.
- Bandit sin findings en apps/config/negocio; Ruff crítico y scanner acotado de secretos sin hallazgos; pip-audit sin vulnerabilidades conocidas; mypy estricto en los dos módulos puros ya documentados. No se afirma análisis exhaustivo de todos los tipos/código.

## Archivos, API y finanzas

Inventario: [six-controls-files.json](six-controls-files.json). Propuesta aplicada: [ADR-010](six-controls-schema-plan.md), [SQL revisado](migrations/six-controls-cash-ledger.sql). Plan del servicio compartido y reversión: [actualización nativa](six-controls-engine-upgrade.md). El snapshot de fuentes anterior y los paquetes/binarios previos se conservaron en carpeta privada.

Endpoints añadidos, autenticados y con permisos específicos:

| Ruta | Métodos | Permiso |
|---|---|---|
| /api/reembolsos/ | GET/POST | view_finance / refund_payment |
| /api/ventas/{id}/ajustar/ | POST | adjust_sale |
| /api/conciliaciones/ | GET/POST | reconcile_cash |

POST exige Idempotency-Key UUID y CSRF además de sesión/MFA. Contrato [OpenAPI8.1.0](openapi.json),128 rutas. No hay PATCH/DELETE del ledger. Los modelos nuevos no duplican tablas de negocio. Capa de aplicación cash_ledger.py, repositorios/reportes, DTOs y permisos mantienen el monolito por capas.

Fórmulas: cobertura = pagos confirmados − reembolsos de pagos + aplicaciones de anticipo; saldo = total histórico − ajustes comerciales − cobertura. Ajuste hasta saldo descubierto y total sin propina: devolver primero y luego ajustar. Reembolso de anticipo solo de parte no aplicada y cita terminal, sin cambiar por inferencia su estado financiero. Total/snapshots originales permanecen.

Recaudación conciliada = pagos + anticipos confirmados (también de citas terminales) − reembolsos, por fecha efectiva registrada/día Lima. No incluye aplicaciones, ventas a crédito como efectivo ni devolución de stock. Requiere cierre de cada día/medio, incluso cero, importe observado igual y SHA256 de evidencia. Cambios tardíos invalidan hash y exigen nueva revisión inmutable. Cohortes servicio/profesional no justifican caja de establecimiento; campos no justificables quedan null. Entradas/salidas conciliadas se muestran por separado de los indicadores operativos legacy que excluyen citas terminales.

Ajustes reducen importe exigible y utilidad estimada de la cohorte; no cambian costo de lo ya consumido. Una devolución física exige inspección/movimiento separado, no se presume del reembolso. No se implementaron WhatsApp, microservicios, pasarela bancaria ni notas tributarias.

## Acceso y tareas locales

URL: https://localhost:8443. La antigua dirección HTTP de puerto8000 es solo redirección. Credenciales del operador: %USERPROFILE%/.codex/lasheo-private/local-operation/credentials.json. QR MFA: operator-mfa.png; códigos de recuperación: operator-recovery-codes.json. No copiar a repositorio/chat/logs. Contraseña administrativa postgres: admin-migrator-password.txt en esa misma carpeta; actualizar pgAdmin y proyectos que la usaban. El operador y los roles de aplicación no usan postgres.

El .env de desarrollo se movió fuera del código/OneDrive a %USERPROFILE%/.codex/lasheo-private/development.env; settings development lo localiza automáticamente. Production/staging/CI no cargan ese archivo. Los secretos de cada rol están separados; backup/restore no reciben MFA_ENCRYPTION_KEY ni SECRET_KEY de la aplicación. El original de nueve dumps históricos se trasladó a legacy-plaintext-backups fuera de OneDrive, con ACL privada y SHA256 iguales; no se borraron copias. Pueden existir versiones antiguas retenidas por OneDrive: revisarlas con el propietario antes de introducir datos reales.

| Tarea | Frecuencia/condición |
|---|---|
| LasheoLocalMaintenance | Cada5min: expiraciones y limpieza acotada autorizadas |
| LasheoLocalBackup | Cada30min: copia cifrada privada + heartbeat |
| LasheoLocalProbe | Cada5min: HTTPS, jobs, disco, vencimiento TLS y métricas HTTP |
| LasheoLocalRestore | Diario03:00 America/Lima: scratch, huellas, roles, eliminación del scratch exacto |
| LasheoLocalStartup | Inicio de sesión: Docker Desktop si falta y arranque validado del endpoint |

Los procesos de tareas usan pythonw, identidad interactiva del usuario, sin contraseña en Task Scheduler. Estado/salidas saneadas: local-operation/operations.jsonl y last-*-job.json. Alertas: active-alerts.json y aviso de escritorio solicitado; no se afirma acuse de lectura humano. Una tarea con resultado0 indica ejecución, no ausencia de alertas.

Disco libre bajo sigue notificándose; no se borraron archivos ajenos ni se aplicó retención destructiva. El responsable debe liberar espacio o añadir almacenamiento. **La importación de CA fue cancelada en Windows**: no se instaló confianza en CurrentUser/Root ni se modificó LocalMachine. Las pruebas verifican HTTPS usando explícitamente certificates/ca.crt; el navegador puede mostrar advertencia hasta que su propietario decida importar esa CA local. No se reintentó ni se forzó la importación tras la cancelación. Certificado de90 días, aviso con30d de anticipación; renovar con responsable antes de expirar. No usar esta CA/aviso ficticio para un dominio comercial.

## Reversión y decisión

Desactivar tareas LasheoLocal* antes de mantenimiento; detener únicamente contenedores con beauty.local.operation=true. Conservar backups, claves, ledger y auditoría. No retroceder al código que ignora devoluciones/ajustes para seguir cobrando. Servicio anterior/binarios y copia fría de todas las bases conservados; no restaurar encima de datos activos automáticamente. Para retirar confianza local, quitar exclusivamente el thumbprint documentado de CurrentUser/Root; no borrar certificados ajenos.

**GO para seguir operando y desarrollando localmente con datos ficticios**, sujeto a sesión/equipo activos y atención de la alerta de disco. **NO-GO comercial** hasta contar con respaldo y aviso fuera del equipo, resolver capacidad de almacenamiento, acordar responsable de incidentes y completar aviso legal, despliegue/CI/publicación y aceptación de usuarios del punto7. No se contrataron recursos ni se simularon esos requisitos externos.
