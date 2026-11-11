# Lasheo: catálogo, fase 2

Implementación backend sobre la fase 1. No incluye pantallas Angular ni compras, reservas, ventas, consumo o movimientos de inventario. No usa imágenes generadas por IA ni WhatsApp. Las fotos reales de internet se incorporarán más adelante, una vez aprobados sus dominios y derechos de uso.

## Diagnóstico y compatibilidad

| Comprobación | Resultado |
|---|---|
| Fase 1 | 38 pruebas originales aprobadas antes de implementar catálogo |
| Entorno | Python 3.14.2, Django 5.2.19, DRF 3.18.3, psycopg 3.3.8, PostgreSQL 18.3 |
| Autenticación | Sesiones, CSRF y permiso IsAdminUser existentes; sin otro sistema de tokens |
| Base actual | 45 tablas físicas: 34 de negocio y 11 internas de Django/control de login; 7 vistas |
| Categorías, servicios, artículos, recetas e imágenes | Tablas existentes reutilizadas; sin migraciones de esquema en fase 2 |
| Unidades originales | 5 registros; conservados |
| Modelos | 34 tablas unmanaged y 3 vistas adicionales mapeadas, sin duplicar tablas |
| Imágenes | inspectdb confundió índices únicos parciales con OneToOne; corregido a ForeignKey solo en Python |
| Categoría de artículo | No tiene activa; no se ofrece desactivación ficticia |
| Vista pública de servicios | Una categoría inactiva no excluye al servicio del SQL; el API aplica esa exclusión |
| Fotos | No hay proveedor ni dominios aprobados aún; CATALOG_IMAGE_ALLOWED_HOSTS vacío |
| Costeo | Sin política fiable; costo_estimado siempre null |
| Git | La carpeta compartida aún no es un repositorio Git |

Antes de implementar se tomó un backup custom completo y una huella del esquema y de las filas de las 34 tablas de negocio. Están en backups/, excluido de Git. scripts/phase2_snapshot.py verifica que ese esquema y esas filas no cambiaron. Las altas y ediciones de catálogo se probaron exclusivamente en bases temporales.

## Archivos y responsabilidades

| Archivo/directorio | Función |
|---|---|
| apps/catalogo/serializers/inputs.py | Listas blancas y validación de tipos, precisiones y longitudes |
| apps/catalogo/serializers/outputs.py | DTO separados de administración y contenido público |
| apps/catalogo/services.py | Reglas cruzadas, transacciones, auditoría y conflictos |
| apps/catalogo/selectors.py | Filtros, búsqueda, consultas de vistas y orden fijo |
| apps/catalogo/views.py y urls.py | Transporte HTTP, permisos y rutas privadas/públicas |
| apps/catalogo/media.py | HTTPS y dominios exactos aprobados; sin solicitudes de red del servidor |
| apps/catalogo/tests/ | HTTP, PostgreSQL, concurrencia, integridad y consultas |
| negocio/models.py | Defaults reales y corrección del mapeo de imágenes |
| negocio/catalogo_views.py | Mapeo de tres vistas SQL existentes, sin tablas nuevas |
| config/settings.py y config/urls.py | Registro del módulo y variable de dominios |
| docs/openapi.json | Contrato consolidado de fases 1 y 2, versión 1.1.0 |
| scripts/update_catalog_openapi.py | Generador reproducible del contrato de catálogo a partir de DTO |
| scripts/phase2_snapshot.py | Backup inicial y verificación de esquema/filas reales |
| tests/test_integration.py | Comprobaciones de 34 tablas y 3 mapeos de vistas, y rutas OpenAPI |

Las 7 tablas reutilizadas son categorias_servicio, servicios, categorias_articulo, unidades_medida, articulos, recetas_servicio e imagenes_catalogo. Se lee auditoria/escribe auditoría, y se consultan relaciones históricas para bloquear cambios de unidad. Las vistas de lectura son vw_catalogo_servicios, vw_catalogo_articulos y vw_stock_actual. Ninguna fue recreada.

## Autenticación y formato

Todas las rutas bajo /api/admin/catalogo/ exigen un usuario activo is_staff y usan SessionAuthentication. En escrituras se requiere la cookie de sesión y X-CSRFToken. Inicializar la cookie con GET /api/auth/csrf/ y releerla después del login, que la rota. Para Angular en otro puerto, usar withCredentials y la cabecera CSRF explícita, con los orígenes exactos de la fase 1.

Las rutas /api/catalogo/ permiten lectura anónima. GET también admite HEAD/OPTIONS; POST, PUT, PATCH y DELETE no están permitidos allí. Nunca hay registro público de cuentas.

El contrato de errores de fase 1 se conserva: code, detail y errors para validación; no se cambia a otro formato.

- 400: campo inválido, precisión, referencia inexistente, CHECK o combinación no permitida.
- 403: sesión ausente, rol insuficiente o CSRF.
- 404: recurso inexistente/no publicado, ID o slug inválido.
- 405: método no permitido, incluido DELETE físico de entidades históricas.
- 409: nombre/slug/SKU/código duplicado, slug inmutable, unidad en uso o artículo requerido por receta.

Ejemplo:

```json
{"code":"unidad_en_uso","detail":"La unidad tiene cantidades historicas o recetas; requiere migracion controlada."}
```

## Rutas administrativas

Base /api/admin/catalogo/. Los IDs de estos ejemplos son ilustrativos; usar los devueltos por POST. A = administradora con sesión; A+CSRF = administradora en escritura.

| Métodos | Ruta relativa | Auth | Ejemplo/objetivo | Error posible |
|---|---|---|---|---|
| GET / POST | categorias-servicio/ | A / A+CSRF | Buscar / crear nombre y orden | 400, 409 |
| GET / PATCH | categorias-servicio/{id}/ | A / A+CSRF | Detalle / editar nombre, orden, activa | 404, 409 |
| POST | categorias-servicio/{id}/desactivar/ | A+CSRF | Oculta sus servicios del público | 404 |
| POST | categorias-servicio/{id}/reactivar/ | A+CSRF | Restaura categoría; no cambia servicios | 404 |
| GET / POST | categorias-articulo/ | A / A+CSRF | Listar / crear nombre | 400, 409 |
| GET / PATCH | categorias-articulo/{id}/ | A / A+CSRF | Editar nombre; no existe activa | 400, 404 |
| GET / POST | unidades/ | A / A+CSRF | Crear codigo y nombre | 400, 409 |
| GET / PATCH | unidades/{id}/ | A / A+CSRF | Código bloqueado si tiene artículos; nombre editable | 404, 409 |
| GET / POST | servicios/ | A / A+CSRF | Catálogo interno / alta | 400, 409 |
| GET / PATCH | servicios/{id}/ | A / A+CSRF | Descripción, precio, duración y publicación | 400, 404, 409 |
| POST | servicios/{id}/desactivar/ | A+CSRF | Activo false y visible false | 404 |
| POST | servicios/{id}/reactivar/ | A+CSRF | Activo true; no publica automáticamente | 404 |
| GET / POST | articulos/ | A / A+CSRF | Insumos, venta o ambos | 400, 409 |
| GET / PATCH | articulos/{id}/ | A / A+CSRF | Precio, tipo, unidad, SKU y estado | 400, 404, 409 |
| POST | articulos/{id}/desactivar/ | A+CSRF | Baja lógica, sin tocar existencias | 404 |
| POST | articulos/{id}/reactivar/ | A+CSRF | Reactivación sin republicar | 404 |
| GET / PUT | servicios/{id}/receta/ | A / A+CSRF | Leer / reemplazar estimación completa | 400, 404, 409 |
| GET / POST | servicios/{id}/imagenes/ | A / A+CSRF | Referencias de fotos de un servicio | 400, 404 |
| GET / POST | articulos/{id}/imagenes/ | A / A+CSRF | Referencias de fotos de un artículo | 400, 404 |
| POST | imagenes/{id}/principal/ | A+CSRF | Cambiar principal dentro del mismo padre, cuerpo vacío | 400, 404, 409 |
| DELETE | imagenes/{id}/ | A+CSRF | Solo referencia; nunca objeto remoto | 404 |
| GET | stock/ | A | Disponibilidad orientativa, vista de solo lectura | 400, 403 |

No hay DELETE de servicio, artículo, categoría o unidad. Solo las referencias de imágenes y las líneas de receta reemplazadas pueden eliminarse; no se elimina historial de visitas, compras, consumos ni ventas.

Los listados son paginados: count, next, previous, results. page_size por defecto 20, máximo 100. Los registros desactivados siguen siendo consultables en administración; no hay filtro implícito que los esconda.

Filtros:

- Todos los listados de entidades: search, page, page_size.
- Servicios/artículos: categoria, activo=true|false|all, visible_catalogo=true|false|all, orden.
- Artículos: tipo=INSUMO|VENTA|AMBOS; search también busca SKU.
- Categorías de servicio: activo filtra la columna física activa.
- Unidades: search busca nombre o código.
- Stock: search en nombre/unidad, tipo, articulo (ID).
- Orden fijo por orden, nombre e ID cuando hay orden; en otros recursos por nombre e ID. Stock usa nombre/articulo_id. Se rechaza ordering arbitrario.

La búsqueda ignora mayúsculas y tildes latinas comunes y normaliza espacios. Se usa el ORM parametrizado, sin concatenar entrada del usuario en SQL.

## Reglas y ejemplos

### Servicios y categorías

Nombre de servicio máximo 150; artículo 160; categorías 100. Nombres vacíos rechazados y espacios normalizados. Categorías y servicios tienen unicidad de nombre, comprobada sin distinguir mayúsculas desde la API y respaldada por UNIQUE exacto de PostgreSQL. Artículos y nombres de unidad no tienen unicidad artificial.

precio_base >= 0, NUMERIC(12,2). Cero es permitido para promociones. Duración positiva si se indica, obligatoria para reservable_online. Estos atributos preparan una futura reserva, pero no reservan nada ahora.

```json
{
  "nombre":"Extensiones clásicas",
  "descripcion":"Aplicación de extensiones naturales",
  "duracion_minutos":90,
  "precio_base":"80.00",
  "visible_catalogo":true,
  "reservable_online":false,
  "requiere_anticipo":false,
  "orden":10
}
```

Puede añadirse categoria_id existente o null. La categoría inactiva nunca permite exposición pública de sus servicios; los servicios sin categoría explícita sí se pueden mostrar.

Las altas API quedan activas y ocultas por defecto: publicar requiere visible_catalogo=true. El default SQL de servicios, que es visible=true, permanece intacto y está reflejado en db_default; la política del servicio API es explícita y más conservadora.

No se permite publicar un registro inactivo. Desactivar también oculta. Reactivar no publica automáticamente. PATCH activo=false sin pedir publicación también oculta.

Slug: se genera una sola vez al crear, ASCII con sufijo único cuando colisiona. Se acepta uno explícito válido en alta. Si ya existe, es inmutable, aunque el nombre cambie o se despublique; no se inventan redirecciones. Los registros heredados sin slug se excluyen del público hasta asignarlo explícitamente o publicar mediante PATCH. No se ejecutó ninguna migración masiva de slugs.

### Artículos y unidades

```json
{
  "nombre":"Adhesivo profesional",
  "unidad_id":3,
  "sku":"INS-ADH-001",
  "tipo":"INSUMO",
  "precio_venta":"0.00",
  "stock_minimo":"5.000",
  "visible_catalogo":false,
  "activo":true
}
```

Los IDs deben existir; unidad es obligatoria. Categoría opcional. INSUMO no es publicable; VENTA es vendible pero no consumible en receta; AMBOS admite ambas funciones. El precio no crea ningún cobro.

SKU/código de unidad: se recortan bordes, pasan a mayúsculas ASCII y admiten letras/números/punto/guion/guion bajo, sin espacios internos. SKU puede ser null para artículos sin código. No se transforman códigos heredados de forma masiva. Se comprueban duplicados sin distinguir mayúsculas y se capturan colisiones físicas como 409.

Cambiar código de unidad está bloqueado cuando la usa cualquier artículo; cambiar su nombre descriptivo sí está permitido. Cambiar la unidad de un artículo está bloqueado si hay recetas, detalles de compra, movimientos, consumos o detalles de venta relacionados. No se hacen conversiones de cantidades ni modificaciones históricas.

Cambiar tipo a VENTA se bloquea si el artículo forma parte de cualquier receta conservada, incluso de un servicio inactivo. Desactivar el artículo conserva su receta actual, que lo muestra como inactivo; no permite incorporarlo a una receta nueva.

### Recetas

```json
{"insumos":[{"articulo_id":10,"cantidad_estimada":"0.200"},{"articulo_id":12,"cantidad_estimada":"2.000"}]}
```

PUT reemplaza todas las líneas en una transacción. Hasta 200 ingredientes, sin repetidos, existentes, activos y tipo INSUMO/AMBOS. Cantidad positiva NUMERIC(14,3), expresada en la unidad del artículo. Lista vacía permite vaciar únicamente la receta estimada; nunca borra consumos previos.

Respuesta: servicio_id, insumos (articulo_id, nombre, unidad, activo, cantidad_estimada), costo_estimado=null, moneda=PEN. No se deduce costo de un precio de venta ni de una compra arbitraria.

Se bloquea el padre mediante select_for_update y se serializan todas las escrituras de catálogo con un bloqueo advisory transaccional común. Así no puede cruzarse un cambio de tipo/unidad con una validación de receta. Dos reemplazos simultáneos se aplican completos; queda el último que obtiene el bloqueo. No hay aún control optimista con versión/ETag para avisar de un formulario desactualizado.

### Imágenes

No se crean imágenes por IA. La API guarda referencias a fotografías existentes y no hace descargas, scraping, subidas o borrado de archivos remotos. Los archivos no se guardan en Railway ni en el filesystem local.

La variable CATALOG_IMAGE_ALLOWED_HOSTS está vacía por decisión de esta fase. Cuando se elijan fuentes apropiadas, configurar los dominios públicos exactos, sin esquema, rutas, comodines ni puertos:

```dotenv
# Ejemplo ficticio; no es un proveedor ya contratado:
CATALOG_IMAGE_ALLOWED_HOSTS=imagenes.ejemplo.com
```

Permitir un dominio no acredita permiso de uso ni estabilidad de un enlace. Al incorporar las fotos, verificar disponibilidad, licencias y política del proveedor; para producción preferir almacenamiento propio de objetos.

URL: HTTPS, máximo 500, host exacto aprobado; sin usuario/contraseña, fragmento, IP literal, dominio local o puerto distinto de 443. El servidor no visita la URL ni confía en sus redirecciones. No se hace validación DNS/MIME porque no existe procesamiento de archivos en esta API. Las URLs heredadas no aprobadas se sustituyen por null en el catálogo público, sin modificarlas en la base.

POST anidado conoce su padre: no acepta servicio_id/articulo_id en el payload. Esto evita destinos dobles o reasignaciones accidentales. Ejemplo para un dominio ya aprobado:

```json
{"url":"https://imagenes.ejemplo.com/foto.jpg","texto_alt":"Extensiones clásicas","orden":0,"es_principal":true}
```

Primera imagen: principal automáticamente si no se indica es_principal. Una indicación explícita false permite dejarla sin principal. Marcar otra principal desmarca la anterior en una transacción y bloquea el padre; se respetan los índices únicos parciales. Puede haber muchas imágenes por padre, pero como máximo una principal.

Eliminar la principal elige la siguiente por orden/id. Si no queda ninguna, imagen_principal=null y el frontend debe usar un placeholder. El DELETE solo retira la referencia, no modifica un archivo externo que el negocio puede no controlar.

### Stock, dinero e historia

Se consulta vw_stock_actual: sin movimientos, existencia=0; disponible es existencia>0 en la vista pública. Un producto sin existencias sigue visible con disponible=false. Esto no garantiza stock para una reserva o venta futura.

No hay endpoints de movimiento, compras, lotes ni descuento de inventario. receta/precio/activación/imágenes no generan movimientos ni consumos. Los cambios de precio no reescriben snapshots de ventas anteriores.

Dinero JSON como cadena decimal de dos posiciones, cantidades de tres posiciones; moneda PEN. El backend usa Decimal; Angular debe evitar recalcular importes monetarios con float para decisiones de cobro.

## Catálogo público

| Método | Ruta | Auth | Ejemplo/resultado | Error posible |
|---|---|---|---|---|
| GET | /api/catalogo/servicios/ | Público | Lista de servicios publicados | 400 |
| GET | /api/catalogo/servicios/{slug}/ | Público | Nombre, descripción, duración, precio, categoría, foto y atributos futuros | 404 |
| GET | /api/catalogo/productos/ | Público | Activos, visibles, VENTA/AMBOS | 400 |
| GET | /api/catalogo/productos/{slug}/ | Público | Precio, foto, disponible y contenido público | 404 |
| GET | /api/catalogo/categorias/ | Público | Categorías activas con contenido publicado | 400 |

Listados de servicios/productos: search, categoria (ID), orden, page, page_size. Categorías: search, page, page_size. Cada categoría devuelve tipo=servicio|producto para distinguir IDs de tablas diferentes. Las categorías vacías no se publican.

No se exponen SKU, tipo interno, unidad, stock mínimo, existencia numérica, proveedor, compra, margen, costos, receta, auditoría ni datos de clientas. Los DTO públicos usan lista blanca.

Toda respuesta API conserva Cache-Control: no-store, private, incluso la pública, para que una desactivación se refleje de inmediato sin coordinar invalidaciones. Evaluar caché pública corta y control optimista cuando se definan volumen/tráfico. No hay caché privada compartida.

La API pública lee las vistas existentes; agrega filtros de categoría activa y slug válido desde las tablas base. No cambia las definiciones SQL.

## Angular futuro

1. Mantener flujo de sesión/CSRF de fase 1 para administración.
2. Consultar público sin credenciales cuando no se necesiten.
3. Leer results y enlaces next/previous; conservar IDs devueltos al crear.
4. Enviar precio/cantidad como cadenas decimales.
5. Distinguir categoría de servicio/artículo por tipo.
6. Mostrar un placeholder si la foto es null y disponibilidad orientativa cuando es false.
7. Guardar una receta mediante PUT completo; el último guardado concurrente prevalece.
8. Ante 409 unidad_en_uso o articulo_en_receta, explicar el conflicto; no convertir ni borrar historia.
9. El contenido de descripción/alt es texto, no HTML confiable; renderizarlo escapado.

## Pruebas y operación

Desde Backend en PowerShell:

```powershell
.\.venv\Scripts\python.exe manage.py check --database default
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas apps.catalogo tests --noinput
.\.venv\Scripts\python.exe scripts/phase2_snapshot.py
.\.venv\Scripts\python.exe scripts/update_catalog_openapi.py
.\.venv\Scripts\python.exe manage.py runserver
```

El runner existente crea una base PostgreSQL aleatoria, carga tests/legacy_schema.sql sin datos y aplica las migraciones de fase 1. Los datos ficticios, movimientos y snapshots de ventas de prueba se insertan solamente allí. Las pruebas concurrentes usan conexiones independientes a esa misma base aislada y limpian sus fixtures con otra transacción. No usar --parallel ni --keepdb. No cambiar managed=False para que pasen pruebas.

La fase 2 no requiere migrate ni makemigrations. No volver a ejecutar la captura inicial de fase 1. El snapshot de pruebas ya contiene todo el DDL necesario y no fue alterado.

No hay dependencias nuevas. La cuenta de prueba existente funciona sin cambiar sus credenciales. No se sembraron servicios/productos/fotos de ejemplo en Lasheo.

## Riesgos residuales y fase 3

- Fotos pendientes: elegir fuentes y configurar dominios aprobados; la API de referencias queda probada pero bloqueada para dominios no aprobados.
- No hay política de costeo, conversión de unidades ni reserva de existencias; definirlas antes de compras/inventario transaccional.
- Reglas como activo/visible, tipo de ingrediente, código canónico y unidad histórica están en el backend; escritores SQL externos podrían omitirlas. Proponer migraciones físicas revisadas solo si se necesita esa protección adicional.
- Un bloqueo común simplifica consistencia para este catálogo pequeño. Evaluar bloqueos más finos y versión optimista si hay mucha concurrencia.
- El test de consultas cubre 23 servicios y 23 productos: presupuesto de 3 consultas por listado; no es una prueba de carga.
- La cuenta PostgreSQL local tiene privilegios amplios, las cookies locales permiten HTTP y aún no hay despliegue. Configurar rol mínimo, HTTPS/proxy, imágenes y respaldo externo antes de producción. CORS/CSRF exactos y SECRET_KEY/DB por entorno.
- El aviso de privacidad de fase 1 sigue pendiente de definición. Ningún endpoint público nuevo lo concede.
- Próxima fase: compras, movimientos y consumos con política de valorización, conversiones y pruebas de concurrencia específicas. No asumir que el stock está cargado.

Referencias de implementación: [bloqueos ORM](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update), [validación DRF](https://www.django-rest-framework.org/api-guide/serializers/#validation), [índices parciales PostgreSQL](https://www.postgresql.org/docs/18/indexes-partial.html).

