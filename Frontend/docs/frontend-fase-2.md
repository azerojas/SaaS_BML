# Fase 2 frontend — Clientas y catálogo

Actualización posterior a la aceptación: el usuario solicitó poblar el demo y añadir imágenes. Se crearon seis tratamientos y cuatro productos de ejemplo y se asociaron diez fotografías referenciales de Pexels. Solo images.pexels.com quedó autorizado; las diez imágenes cargaron y se decodificaron realmente en el navegador. Las menciones siguientes a cero hosts describen el estado original de cierre. Fuentes y reversión: `Backend/docs/catalog-demo-images.md`. No se incorporó subida de archivos.

Auditoría iniciada el 10 y verificada el 11 de noviembre de 2026 (America/Lima). Skill aplicada: `beauty-manager-frontend-fase-2`, desde `C:/Users/Usuario/Downloads/SKILL fase 2.md`. Sus archivos `references/api-contract.md`, `references/test-checklist.md` y `templates/closure-report.md` no se suministraron; no se atribuye lectura a ellos. El contrato procede del código Django y de pruebas ejecutadas.

## Auditoría y diseño

La Fase 1 estaba implementada: Angular standalone, Material/Tailwind, sesión Django/MFA, recuperación por `/me`, guards, XSRF y tres layouts. Baseline ejecutado: npm ci (sin vulnerabilidades conocidas), 19 pruebas unitarias aprobadas y build correcto. Se conservaron versiones: Angular 22.2.5, CLI/Material 22.2.6, TypeScript 6.0.3, RxJS 7.8.2, Tailwind 4.3.5, Node 24.15.0, npm 11.12.1. No se cambió la versión principal de dependencias.

Django ya contenía clientas, catálogo administrativo/público, recetas atómicas, imágenes por URL y stock SQL. Las 34 tablas/7 vistas son el origen histórico; las migraciones anteriores añadieron soporte Django/operativo. Esta fase no añade tablas ni migra Lasheo. No se usaron SQLite, flush ni recreaciones de la base real. Las pruebas cargan únicamente el esquema legado en bases nuevas efímeras y allí ejecutan migraciones existentes.

La implementación separa `domain`, `application`, `infrastructure` y `presentation` en clientas, catálogo y catálogo público. Las páginas no importan HttpClient ni construyen rutas Django. Tipos DTO manuales para el subconjunto usado, cotejados con serializers/OpenAPI y pruebas HTTP; no se genera un cliente de módulos fuera del alcance. Signals controlan estado, RxJS debounce 300 ms/cancelación y descarte de respuestas viejas. Los selectores consultan páginas de 20 registros; no descargan todas las referencias. No se consultan listas privadas innecesarias al abrir un detalle.

## Pantallas y componentes entregados

| Pantalla                   | Ruta                                    | Funciones verificadas                                                                                          |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Clientas                   | `/admin/clientas`                       | Búsqueda nombre/apellidos/teléfono, activa/inactiva/todas, paginación servidor, vacíos y reintento             |
| Alta y edición             | `/admin/clientas/nueva`, `/:id/editar`  | Formulario reactivo, teléfono internacional, email/fecha opcionales, notas privadas, POST/PATCH                |
| Ficha                      | `/admin/clientas/:id`                   | Contacto, cumpleaños, notas, fechas, estado; desactivar/reactivar con confirmación                             |
| Consentimiento             | En ficha                                | Referencia de evidencia y decisión explícita, versión/URL vigentes, fecha solo de Django; separado del alta    |
| Categorías de tratamientos | `/admin/catalogo/categorias-servicio`   | Alta, detalle, edición, orden y estado                                                                         |
| Categorías de artículos    | `/admin/catalogo/categorias-articulo`   | Alta, detalle y edición; no se inventa estado inexistente                                                      |
| Unidades                   | `/admin/catalogo/unidades`              | Código, nombre, alta/edición según permiso; conflictos de referencias validados en servidor                    |
| Tratamientos               | `/admin/catalogo/servicios`             | Lista, búsqueda/filtros, alta/edición/detalle, precio, duración, visibilidad, slug estable y estado            |
| Productos e insumos        | `/admin/catalogo/articulos`             | Categoría/unidad/SKU/tipo, precio, umbral, visibilidad y estado; existencia SQL solo lectura                   |
| Recetas                    | En detalle del tratamiento              | Añadir/retirar materiales, cantidad decimal positiva, validación de duplicados, PUT atómico; no modifica stock |
| Fotografías                | En detalle de tratamiento/artículo      | URL/alt/orden, edición, principal única, retiro confirmado y reasignación en Django, fallback de imagen        |
| Catálogo público           | `/catalogo`                             | Tratamientos/productos, búsqueda, categorías y paginación; sin cuenta                                          |
| Fichas públicas            | `/catalogo/{servicios,productos}/:slug` | Descripción, precio público, duración/disponibilidad; no expone PII, receta ni stock detallado                 |

Las entidades de catálogo usan `/nuevo`, `/:id`, `/:id/editar` dentro de cada colección. Navegación y acciones se filtran por permisos efectivos, incluido acceso de usuarios con permiso de artículos/unidades sin permiso de servicios. Inicio y sidebar ya marcan Clientas/Catálogo disponibles. Inventario transaccional, pagos, reservas, QR y estadísticas permanecen fuera del frontend de esta fase.

Componentes compartidos nuevos: EditorFields, Pager; estado PagedState/OperationState/RecordState y ResourceApi. Componentes específicos: ReferencePicker, RecipeEditor, GalleryEditor, StockReadonly y PublicPhoto. Se reutilizan Alert, Button, Loading, ConfirmDialog y los layouts anteriores. Importes/cantidades viajan como strings; `Intl.NumberFormat` solo formatea presentación PEN. No hay cálculos financieros en Angular ni costos deducidos del precio de venta.

## API, seguridad y cambios Django

Matriz completa de métodos, payload, filtros y permisos: [backend-api-inventory.md](backend-api-inventory.md). OpenAPI actualizado a 8.3.0.

Adaptaciones mínimas, sin cambios de esquema:

- GET `/api/auth/config/`: aviso vigente y dominios de imágenes. Exige sesión/staff/MFA y no devuelve secretos.
- PATCH `/api/admin/catalogo/imagenes/{id}/`: URL, texto_alt y orden. Exige change_imagenescatalogo y CSRF; conserva propietario/principal y registra auditoría en la transacción existente.
- Nginx local genera CSP únicamente con los hosts HTTPS explícitamente autorizados en configuración privada; no habilita todos los dominios ni scripts inline. Se conserva CREATE_NO_WINDOW de la corrección de tareas intermitentes.

Todos los POST/PATCH/PUT/DELETE obtienen CSRF y usan sesión del mismo origen. Guards controlan presentación; Django valida definitivamente permisos, teléfonos/SKU/nombres duplicados, visibilidad y recetas. Las URLs públicas filtran activo/visible y tipos permitidos desde vistas/queries Django; los accesos directos privados devuelven 404. No se guarda PII en almacenamiento web, consola o analytics. Las descripciones se interpolan como texto. No hay bypassSecurityTrust ni cargas multipart ficticias.

Los errores 400/422 conservan mensajes de validación por campo; 409 tiene mensajes claros sin exponer detalles internos. Un 403 de permiso no cierra una sesión válida. Formulario de artículo desactiva visibilidad para INSUMO/inactivo; Django repite la validación. El consentimiento no se presume por guardar una ficha ni se asigna desde el navegador.

## Pruebas ejecutadas

| Control                     | Resultado                                                | Evidencia                                                         |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Instalación baseline        | npm ci correcto, 0 vulnerabilidades conocidas            | Salida de ejecución; lockfile sin cambio de versiones             |
| Unitarias/HTTP/componentes  | 33 pruebas, 10 archivos, aprobadas                       | npm test; incluye los 19 casos anteriores                         |
| Regresión Django/PostgreSQL | 362 pruebas OK, 100.194 s                                | `Backend/backups/frontend-phase2-backend-regression.log`          |
| E2E completo                | 31 casos aprobados contra Django y PostgreSQL reales     | `.artifacts/e2e-results.json`, informe Playwright                 |
| Responsive/accesibilidad    | 360/390/768/1280, sin overflow; axe WCAG 2 A/AA y 2.1 AA | E2E de listado, formulario de artículo y catálogo público         |
| Fase 1 preservada           | 16 E2E de auth/layout incluidos, aprobados               | Login/MFA/logout, sesión, XSRF, permisos y teclado                |
| Calidad                     | Build, lint de cada archivo real y TypeScript estrictos  | Scripts npm; formatter comprueba archivos OneDrive explícitamente |

Los fixtures de aceptación son sintéticos y se crean solamente en una base aleatoria `frontend_e2e_*`, eliminada al terminar. Creaciones/ediciones de clientas, categorías, unidades, tratamientos, artículos, consentimiento, recetas y fotos se verifican por respuestas HTTP de Django y consultas API posteriores. No se mockean APIs de autenticación ni de negocio. El ensayo de pérdida de red usa modo offline del navegador, no respuestas falsas. Playwright acepta el certificado de prueba aislado; no demuestra confianza TLS comercial.

E2E prueba también duplicado de teléfono/SKU, inhabilitación de publicación de INSUMO, reactivación sin republicación automática, recipe PUT con cantidad exacta/duplicados y stock inalterado, edición/reasignación de principal, ausencia de proveedor, ausencia de PII pública, bloqueo a staff sin permisos y ficha de producto pública. Unit tests cubren formatos decimales y teléfono, token de CSRF en Fase 1, contratos HTTP, debounce/cancelación, estado previo ante error, doble envío y respuestas de detalle viejas.

Las capturas en `.artifacts/catalogo-publico-{390,1280}.png` contienen exclusivamente datos E2E; no se publican como catálogo real. Lint/format dejaron de depender de globs que omitían reparse points de OneDrive: se leen archivos explícitos bajo raíces verificadas; no se cambia la configuración de sincronización.

Problemas hallados y corregidos durante aceptación: aviso HTTPS local rechazado por puerto (ahora permite exactamente mismo origen); ID duplicado del host del selector (retirado del host, se conserva en el control); formulario de recetas sin FormGroupDirective (corregido y guardado PUT comprobado); búsqueda de fixture que coincidía con múltiples teléfonos (la prueba ahora usa un número único, sin cambiar la búsqueda de servidor). Los intentos fallidos no se declararon aprobados.

## Pendientes y límites explícitos

- **Proveedor de imágenes no configurado:** la galería está implementada, pero la instalación local mantiene bloqueada el alta de URLs hasta definir hosts autorizados en Django. No se contrataron proveedores ni se autorizó toda internet. No existe endpoint de subir archivos; no se presenta como implementado.
- **Privacidad comercial:** se usa únicamente la configuración que devuelve Django. Si falta URL/versión, se bloquea el registro de consentimiento. Un aviso local de prueba no demuestra cumplimiento comercial.
- Historial de atenciones y métricas de clientas pertenecen a fases posteriores; se informa de su ausencia sin inventar cifras. Costo de receta es null en esta API y se muestra no disponible; no se infiere un costo.
- Categorías de artículos/unidades carecen de estado/DELETE en el esquema/contrato; la UI respeta esa limitación. No se borran entidades históricas. Retirar una fotografía elimina solo su referencia según la API existente.
- Chromium fue el navegador ejecutado. No se afirma compatibilidad probada en Safari/Firefox, evaluación completa con lector de pantalla ni despliegue comercial.

## Archivos y reversión

Inventario detallado: [phase2-files.json](phase2-files.json). Frontend nuevo en features clientas/catalogo/catalogo-publico y shared; se adaptaron rutas, retorno seguro, navegación, layouts, interceptores, estilos y scripts de calidad. Django: views/urls/tests de autenticación; serializers/views/services/tests de imágenes; config/fixtures E2E; OpenAPI y CSP/arranque local. No se modificaron modelos ni migraciones.

Reversión: retirar rutas/features de fase 2 del frontend, restaurar el build anterior y reconstruir la imagen local anterior si se necesita retirar los dos endpoints aditivos. Mantener registros e imágenes creados por usuarios; no restaurar encima de Lasheo ni ejecutar DELETE/flush como reversión de UI. CSP vuelve a configuración anterior sin hosts externos; los archivos privados de credenciales permanecen fuera del código.

Verificación final: 31 E2E aprobados en 1.8 minutos después del último build; 33 unitarias/HTTP aprobadas. Build, lint explícito de 75 archivos y format/check de 106 archivos correctos; npm audit sin vulnerabilidades conocidas. El Nginx local pasó su validación, readiness y las rutas públicas/SPA respondieron 200 con TLS verificado usando la CA local. `/api/auth/config/` anónimo devuelve 403. El navegador ejecutó el catálogo compilado real y confirmó que `/admin/clientas` anónimo redirige al login.

Se verificaron en lectura los permisos existentes del operador local para clientas, servicios, artículos, categorías, unidades e imágenes; no se cambiaron roles. El aviso configurado usa `https://localhost:8443/privacy/`, válido para la interfaz, y hay cero hosts de imágenes configurados. Se mantuvo esa restricción.

**Decisión: GO para Fase 2 funcional local, con todas las pruebas críticas ejecutadas y aprobadas.** El alta de fotografías queda condicionada a configurar dominios aprobados y no hay subida de archivos. Los requisitos externos documentados en Fase 8 backend siguen separando esta aceptación de un GO comercial.
