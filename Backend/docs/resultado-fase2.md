# Resultado de verificación de fase 2

Fecha: 6 de noviembre de 2026, America/Lima.

| Verificación ejecutada | Resultado real |
|---|---|
| Suite completa: autenticacion, clientas, catalogo, tests | 79 pruebas aprobadas, 9.459 s de ejecución de tests |
| Regresión fase 1 | 38 pruebas originales conservadas y aprobadas |
| Nuevas pruebas catálogo | 41 aprobadas, incluidas 5 de transacciones concurrentes reales |
| check --database default | Sin errores |
| migrate --check | Sin migraciones pendientes |
| pip check | Sin dependencias incompatibles |
| compileall | Sin errores de sintaxis |
| check --deploy --fail-level WARNING con DJANGO_DEBUG=False | Sin advertencias |
| OpenAPI | 36 rutas consolidadas; resolución de rutas y referencias verificadas por la suite |
| Rendimiento de listados | Hasta 3 consultas por listado probado con 23 servicios y 23 productos; sin prueba de carga |
| HTTP real | Catálogo público, rechazo anónimo privado, login existente, seis listados administrativos, stock y logout correctos |
| Esquema y filas reales | phase2_snapshot.py confirma misma huella completa de esquema y mismas filas en las 34 tablas de negocio |

El servidor de desarrollo se reinició para cargar el código actualizado en http://127.0.0.1:8000/. La cuenta administrativa de prueba de fase 1 conserva sus credenciales; no se incluyen secretos en esta documentación.

No se ejecutaron escrituras de catálogo en Lasheo. Los servicios, artículos, fotos, recetas, movimientos y ventas ficticios de las pruebas existieron únicamente en bases PostgreSQL temporales. Las cinco unidades de medida originales permanecen intactas. No se ejecutaron migraciones físicas en esta fase.

No hay pruebas automatizadas pendientes del alcance implementado. Quedan para etapas posteriores las fotos reales y dominios aprobados, la verificación de proveedor/archivos, Angular, costeo, compras/inventario transaccional, pruebas de carga y despliegue. Sin proveedor de fotos, se comprobó que la API rechaza URLs no aprobadas y el público devuelve null para imágenes heredadas inseguras. El aviso real de privacidad de fase 1 sigue pendiente.

Detalle de endpoints, reglas, archivos modificados, variables de entorno y riesgos: [catalogo-api.md](catalogo-api.md). Contrato: [openapi.json](openapi.json).
