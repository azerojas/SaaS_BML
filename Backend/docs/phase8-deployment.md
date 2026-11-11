# ADR-009 — Operación local y preparación de despliegue

Decisión del usuario: no existen proyecto Railway, repositorio GitHub, dominio ni destino privado externo; por ahora todo será local. Ningún archivo de Railway activa servicios. No se instaló scheduler ni se publicaron puertos PostgreSQL. Docker Desktop existente se inició para las pruebas locales.

Topología ensayada: cliente HTTPS loopback → proxy efímero de ensayo que elimina cabeceras Forwarded falsas → Gunicorn no root → red Docker privada → PostgreSQL sintético TLS verify-full con CA propia. La prueba HTTPS se detiene al terminar; no es un proxy comercial. La base real Lasheo está separada y no se copia al laboratorio de staging.

Los contenedores sintéticos quedan identificados beauty.phase8.synthetic=true; recursos del último laboratorio en backups/phase8-lab-resources.json. Secretos efímeros fuera del repositorio, en %USERPROFILE%/.codex/lasheo-private/<laboratorio>/. No reutilizar estas cuentas ni certificados de 7 días en operación real.

## Configuraciones

| Entorno | Settings | Datos/credenciales | Uso |
|---|---|---|---|
| development | config.settings.development o config.settings | .env local existente | Acceso local; MFA/jobs desactivados hasta habilitación explícita |
| ci | config.settings.ci | Variables efímeras, DB test_lasheo_phase1_UUID | Runner crea/borra exclusivamente base aleatoria; prohíbe keepdb/parallel |
| staging | config.settings.staging | DB sintética independiente y claves únicas | DEBUG falso, TLS, MFA obligatorio, cookies Secure |
| production | config.settings.production | Recursos/secretos exclusivos por definir | NO-GO hasta cerrar acta y activar con autorización |

production/ci nunca leen el .env de desarrollo. No usar settings production apuntando a Lasheo para realizar pruebas de carga/migración. La credencial runtime carece de DDL; el migrador es distinto y solo se entrega durante ventana autorizada. El backup tiene rol de lectura y permiso restringido al heartbeat; restore requiere otro rol con CREATEDB en servidor de recuperación aislado. No conceder CREATEDB al proceso web ni al job de backup.

## Manifiesto de variables

| Variables | Alcance/validación |
|---|---|
| DJANGO_ENV, DJANGO_SETTINGS_MODULE | Pares development/ci/staging/production coherentes |
| SECRET_KEY | Aleatoria e independiente, mínimo 50 caracteres y diversidad; fuera de fuentes |
| DATABASE_URL | Cada entorno/base/rol independiente; migrador nunca como runtime |
| DB_SSLMODE, DB_SSLROOTCERT | verify-full y CA montada de solo lectura; no degradar para superar readiness |
| ALLOWED_HOSTS | Hosts exactos; Railway requiere healthcheck.railway.app para su sonda; localhost solo si sonda interna |
| CSRF_TRUSTED_ORIGINS, CORS_ALLOWED_ORIGINS | HTTPS exacto, sin comodines; recomendar Angular y API bajo mismo origen |
| TRUST_PROXY_HTTPS | False hasta verificar proxy; True solo si elimina cabeceras del cliente y backend no es accesible directamente |
| MFA_ENCRYPTION_KEY | Fernet independiente; pérdida impide descifrar dispositivos; mantener copia privada separada |
| HSTS_SECONDS | 3600 inicial; sin preload/subdominios hasta verificar HTTPS real |
| CHECKIN_DEMO_MODE | False obligatorio comercial |
| PUBLIC_CHECKIN_URL, CHECKIN_PRIVACY_NOTICE_URL, CHECKIN_PRIVACY_NOTICE_VERSION | HTTPS y aviso aprobado; valores locales ficticios no son válidos comercialmente |
| PRIVACY_NOTICE_URL, PRIVACY_NOTICE_VERSION | Aviso general coherente con check-in |
| AGENDA_PUBLIC_READ_ENABLED | Solo lectura pública según política existente; no habilita POST anónimo |
| ALLOW_MAINTENANCE_JOBS | False hasta aprobar expiraciones y limpieza; scheduler separado, nunca en arranque web |
| ALERT_WEBHOOK_URL, ALERT_WEBHOOK_TOKEN | Destino HTTPS privado autorizado; no configurado en este proyecto local |
| BACKUP_ENCRYPTION_KEY | Base64 de 32 bytes, distinto de MFA/SECRET_KEY; externo a repo y copias cifradas |
| ALLOW_BACKUP_JOB, BACKUP_OUTPUT_DIR | Habilitación explícita y volumen privado persistente, no disco efímero comercial |
| BACKUP_RECORD_JOB, BACKUP_UPLOAD_ENABLED | False hasta activar soporte y destino; heartbeat puede escribir metadata |
| BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION | Opcionales, sin valores reales; endpoint HTTPS, bucket privado y mínimo privilegio |
| PG_BIN, PGSSLROOTCERT | Herramientas PostgreSQL18 y CA para scripts/libpq |
| PORT, HEALTHCHECK_HOST | Puerto/Host internos válidos; no exponen estado sensible |

Ejemplos sin secretos: deployment/.env.staging.example y .env.production.example. No sirven sin reemplazo: la configuración falla cerrada. Nunca copiar la contraseña PostgreSQL al administrador Django. Datos de prueba y claves locales deben rotarse antes de cualquier exposición.

## Docker y comprobación local

Desde Backend: `python deployment/build_local.py`. El contexto allowlist evita que OneDrive envíe reparse points y excluye .env, respaldos, claves y cachés. Dockerfile usa Python3.14.10 por digest, dependencias exactas, actualización de paquetes OS y UID10001; las reconstrucciones pueden cambiar parches de Debian y deben conservar digest/SBOM del resultado aprobado. No se ejecuta migrate al iniciar.

`python deployment/lab_validate.py` crea solo laboratorio nuevo con prefijo sintético y aborta ante tablas existentes en bootstrap. `python deployment/check_local_runtime.py` comprueba denegación real CREATE/TRUNCATE/permisos, TLS, maintenance y 80 sondas concurrentes. `python deployment/run_lab_tests.py` ejecuta regresión Linux en otra DB aleatoria del cluster sintético. Los logs no imprimen contraseñas. El contenedor no depende del disco efímero para fotos: las cargas de fotos aún no existen.

Docker backup: `python deployment/build_local.py --tag beauty-manager-backup:phase8-local --dockerfile deployment/Dockerfile.backup`. Incluye herramientas PG18 y requisitos de backup, no Django ni credenciales. Montar salida privada con UID10001; habilitar job y claves explícitamente. No incluir la clave en imagen ni pasarla como argumento de comando.

## Railway/CI futuros

Config-as-code preparado: railway.toml para web, railway-maintenance.toml (cada 5 min UTC) y railway-backup.toml (07:00 UTC). No desplegados. La sonda Railway es de arranque/despliegue, no monitoreo continuo: hay que programar probe_service fuera del web. Ver [cron vigente](https://docs.railway.com/cron-jobs), [healthchecks](https://docs.railway.com/deployments/healthchecks), [PostgreSQL](https://docs.railway.com/databases/postgresql) y [red privada](https://docs.railway.com/networking/private-networking). Validar CA/host verificado con proveedor antes de configurar verify-full; una URL privada no prueba verificación de certificado. No prometer failover automático ni PITR sin contrato/prueba.

Workflow root .github/workflows/backend-ci.yml: acciones fijadas a SHAs consultados, PostgreSQL18 sintético, Python3.14.10, secretos CI efímeros, checks, scanner acotado de secretos, Ruff, mypy estricto en dos módulos puros, Bandit, pip-audit, regresión, imagen y Trivy HIGH/CRITICAL. No omite CVE sin parche. Un finding bloquea CI. No hay job de despliegue ni token Railway. CI hospedado no se ejecutó porque no existe repositorio remoto; sus comandos se ejecutan localmente y se documenta alcance, sin confundirlo con un run GitHub.

Antes de un despliegue: crear repo privado y rama protegida, revisión obligatoria, entorno GitHub con aprobador, retención de artefactos 14 días, imagen por digest, variables protegidas por entorno, staging verde, respaldo restaurado, plan de migración autorizado y smoke. Preparar release manual con imagen anterior para rollback. No configurar publicación automática mientras existan bloqueantes.

Reversión: web al digest anterior, flags/jobs desactivados, tablas operativas conservadas, sin borrar negocio. Un rollback de código no revierte pagos/consumos/expiraciones legítimos: compensación auditada con responsable. No restaurar un dump sobre una base activa como rollback rutinario.
