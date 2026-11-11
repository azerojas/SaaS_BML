# Informe técnico Fase 8 — decisión NO-GO comercial

Fecha: 10 de noviembre de 2026. Operación solicitada: exclusivamente local. Se implementaron los controles y se ensayó el backend en aislamiento; **la fase no se declara cerrada ni el sistema apto para producción**. Persisten vulnerabilidades de imagen. El usuario autorizó y se completó la activación del soporte local (dos tablas y metadatos), conservando los originales. No se contrató ni desplegó Railway/GitHub/dominio/almacenamiento.

## Resultado ejecutado

| Verificación | Resultado real | Evidencia local |
|---|---|---|
| Línea base fases anteriores | 314 pruebas; 2 fallos por reloj fijo de agenda, corregidos | backups/phase8-baseline-tests.log |
| Regresión final Windows, PostgreSQL aleatorio | **347 pruebas OK, 93,302 s** | backups/phase8-full-tests-final.log |
| Regresión Linux/Docker, PostgreSQL TLS aislado | **347 pruebas OK, 71,277 s** | backups/phase8-linux-tests.log |
| Flujo QR→confirmación humana→visita→consumo→venta→pagos parciales→dashboard | OK; repetición sin duplicar consumos/pagos; saldo/costo verificados | apps/operaciones/tests/test_e2e.py y suites completas |
| Concurrencia | OK en dos conexiones independientes: QR, agenda, compras, stock, pagos/anticipos e inventario; job competidor excluido | Suites de fases3–7 y operaciones/tests/test_jobs.py |
| Staging sintético HTTPS/MFA/CSRF | OK, cookies Secure, login 202→TOTP200, clientas/reportes/agenda, logout204 | backups/phase8-docker-smoke.json |
| Mínimo privilegio | Denegados CREATE TABLE, TRUNCATE clientas y UPDATE auth_permission; TLS activo; maintenance sintético OK | deployment/check_local_runtime.py |
| Carga local moderada | 80 sondas, concurrencia8, 0 fallos; 0,480 s total, mediana36,644 ms, p95 130,517 ms | backups/phase8-local-load.json |
| Rendimiento financiero | 1.000 ventas/1.000 líneas: 22 queries, 0,151 s Windows; 0,170 s Linux | Logs de suites; no es garantía de capacidad comercial |
| Backup cifrado de Lasheo y restauración scratch | **47 tablas**, huellas de todas las filas/esquema coinciden; 1,567 s; scratch eliminado | backups/phase8-restore-report.json |
| Imagen backup mínima, TLS y restore sintético | **49 tablas**, todas las huellas coinciden; 1,035 s; scratch eliminado | backups/phase8-backup-container-report.json |
| Integridad Lasheo | Antes:47 tablas/7 vistas; después de activación autorizada:49/7. 13 FK históricas, 0 huérfanas; esquema y filas originales conservados | backups/phase8-activation-report.json y phase8-readonly-audit.json |
| Activación local autorizada | operaciones.0001 aplicada; respaldo nuevo restaurado (47 tablas previas), huellas coinciden; 49 tablas finales | backups/phase8-activation-restore.json |
| Smoke local posterior | Salud, operaciones, clientas, agenda y dashboard200; operaciones anónimo403; todas las filas/esquema iguales antes/después de consultas | backups/phase8-endpoint-verification.json |
| Servidor HTTP loopback actualizado | Servidor anterior --noreload conservaba código viejo; reiniciado y /health/live + /health/ready200 | backups/phase8-local-http-verification.json |
| Django check, pip check, Ruff crítico | OK, sin errores | Ejecución local; workflow reproduce comandos |
| mypy estricto | OK en alerts.py y backup_crypto.py, alcance2 módulos puros | Comando en workflow; no se afirma tipado de todo el backend |
| Bandit código de aplicación | 0 findings; pruebas sintéticas excluidas explícitamente | backups/phase8-bandit.json y deployment/bandit.yaml |
| Credenciales en fuentes | Scanner de firmas/URLs y revisión AST de keywords: sin hallazgos; excluye secretos locales ignorados | scripts/scan_source_secrets.py; no equivale a garantía absoluta |
| pip-audit Python instalado + requisitos backup | Sin vulnerabilidades conocidas | backups/phase8-tools-installed-audit.json y phase8-backup-dependency-audit.json |
| Trivy imagen web | **40 HIGH + 2 CRITICAL**, 17 CVE únicos en esa imagen; sin versión corregida indicada | backups/phase8-trivy-web.json |
| Trivy imagen backup | **104 HIGH + 3 CRITICAL**, 41 CVE únicos en esa imagen; sin versión corregida indicada | backups/phase8-trivy-backup.json |
| CI hospedado/despliegue real | **No ejecutado**: no hay repositorio ni servicios; controles equivalentes locales sí ejecutados | .github/workflows/backend-ci.yml |

Los números Trivy son ocurrencias por paquete; un CVE puede afectar varios paquetes. No sumar como CVE únicos entre imágenes. Se actualizaron Debian/Python y retiraron pip/build tooling y gosu que no necesita runtime; los hallazgos restantes **no se aceptaron ni ignoraron**. El gate CI sale con error con HIGH/CRITICAL, aun sin parche. Hay que sustituir/actualizar bases y repetir análisis antes de comercializar. Dependencias Python limpias no implican imagen limpia.

Las ejecuciones fallidas también se registran: fixtures de agenda fijos; primera regresión Linux sin lector QR y con proxy heredado; permisos del certificado público tras endurecer ACL; restore de imagen Python3.11 sin soporte extractall(filter). Se corrigieron y repitieron. Restore usa ahora copia explícita de dos miembros regulares exactos y rechaza duplicados/enlaces/rutas arbitrarias. El intento opcional de resolver requirements-tools completo quedó atascado y se detuvo; en su lugar pip-audit auditó **todo el entorno instalado** satisfactoriamente. No se oculta como ejecución completada del resolver original.

## Archivos y contratos

Inventario de fuentes Fase8: [phase8-files.json](phase8-files.json). No hay repositorio Git previo: se entrega inventario y justificación, no se afirma un diff contra commit inexistente. config/settings.py se convirtió en paquete config/settings/; versiones de fuentes previas y un rollback comercial por commit siguen pendientes.

- Nuevos: apps/operaciones/ por capas (MFA, permisos, salud, jobs, alertas, logs, cifrado, migración y pruebas); settings por entorno; deployment/ (imágenes web/tests/backup, entrada, laboratorio TLS, roles y Railway); scripts de respaldo/restore/auditoría/activación/contrato/scanner; CI root y esta documentación.
- Modificados: autenticación, permisos de clientas/catálogo/inventario/QR, parser/errores/URLs globales, requirements, fixtures y comprobaciones de esquema legacy, OpenAPI e ignore de secretos/artefactos.
- Endpoints nuevos: GET /health/live, GET /health/ready, POST /api/auth/mfa/verify/, GET /api/v1/operations/status/. Login incorpora respuesta202 de segundo factor. [Contrato Angular](phase8-api.md), [OpenAPI](openapi.json), 125 rutas.

Justificación y reversión: [auditoría](phase8-security-review.md), [ADR de soporte SQL](../apps/operaciones/references/schema-map.md), [despliegue y variables](phase8-deployment.md), [runbooks](phase8-runbooks.md). No se duplicaron modelos de negocio, ni se cambiaron funciones/vistas, ni se añadieron índices especulativos. Se conserva monolito modular; no hay WhatsApp ni microservicios.

## Acta GO/NO-GO

| Control | Estado | Acción pendiente |
|---|---|---|
| Datos originales íntegros y restaurables | Verificado localmente | Custodiar claves/copia en otro destino y ensayar recuperación completa |
| Seguridad funcional/regresión/concurrencia | Pruebas OK | Revisar asignación real de permisos y enrolar administradores antes de exigir MFA |
| Vulnerabilidades de contenedores | **Bloqueante** | Remediar HIGH/CRITICAL y repetir gate; no aceptación implícita |
| Soporte Fase8 en Lasheo | Activado con autorización | Migración aditiva2 tablas + metadata verificada; roles/jobs/MFA obligatorio permanecen desactivados |
| Rol DB local propietario | Solo desarrollo | Separar runtime/migrador/backup, aplicar grants revisados con autorización; no reutilizar postgres comercialmente |
| Conciliación y reembolsos | **Bloqueante para caja neta comercial** | Implementar libro de compensaciones/reembolsos y conciliación; no presentar null como cero |
| Dominio/HTTPS/proxy/DB privada comercial | Sin recursos definidos | Usuario eligió local; no contratar ni desplegar ahora |
| Backups privados separados, RPO/RTO/retención/encargado | Sin acordar | Copia en mismo equipo/OneDrive no cubre desastre; propuestas no son compromisos |
| Alertas continuas y escalamiento | Función/receptor local probados | Elegir canal privado, scheduler y responsable; pruebas de caída y recepción externa |
| CI remoto, protección de rama y rollback por versión | Configuración preparada | Crear repositorio privado y entornos aprobados, ejecutar pipeline real, conservar imagen previa |
| Aviso legal/datos y secretos comerciales | Ficticios/locales | Aprobar aviso, política y encargados; rotar credenciales de prueba |
| Imágenes persistentes/Angular | Fuera de esta activación | Elegir proveedor y validar integración UI/CSRF/MFA, sin abrir cargas arbitrarias |

**Decisión técnica: NO-GO para producción.** Se puede seguir desarrollando localmente con datos ficticios. El laboratorio aislado demuestra funcionamiento de los controles, no una habilitación comercial de Lasheo. No se requiere ni se solicita publicar nada en este momento. Responsable del go-live y objetivos operativos aún por designar/acordar.
