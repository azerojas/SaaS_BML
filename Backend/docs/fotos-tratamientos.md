# Fotos de tratamientos

El modal de crear o editar un tratamiento permite seleccionar una foto del dispositivo, previsualizarla y guardarla junto con los datos. La foto principal también aparece en el listado y en el catálogo público cuando el tratamiento es visible.

Se aceptan JPG, PNG y WebP estáticos de hasta 5 MiB y 20 megapíxeles. El servidor valida el contenido, aplica la orientación, reduce a 1600 × 1600 como máximo y genera un JPEG sin metadatos. No necesita un proveedor externo ni un volumen de archivos: los bytes se guardan en `catalogo_uploadedphoto`, incluidos en las copias cifradas de PostgreSQL.

La creación y el cambio usan las rutas habituales `POST /api/admin/catalogo/servicios/` y `PATCH /api/admin/catalogo/servicios/{id}/`, con `multipart/form-data`: `datos` contiene el objeto JSON y `foto` un único archivo. Sin archivo, continúa disponible el contrato JSON anterior. Datos, foto y referencia principal se guardan en una misma transacción. Cambiar la principal conserva las anteriores en la galería.

Se requieren los permisos habituales del tratamiento y `negocio.add_imagenescatalogo`; reemplazar una galería existente requiere también `negocio.change_imagenescatalogo`. Se mantienen sesión y CSRF. Las imágenes se sirven por `GET /api/catalogo/fotos/{uuid_hex}.jpg`: el acceso público depende de la visibilidad del tratamiento; el personal con permiso de lectura puede consultar fotos privadas.

Para otros entornos, aplicar `catalogo.0001_uploaded_photo` con el propietario de la base de datos y los permisos revisados en `deployment/roles.sql` antes de arrancar el nuevo servidor. El rol de ejecución necesita SELECT/INSERT/DELETE en la tabla y el rol de backup SELECT. La activación local se hace con `scripts/activate_catalog_photos_local.py --apply`, que exige una copia reciente y una restauración verificada y compara las tablas de negocio antes y después.

El proxy admite hasta 6 MiB exclusivamente en las rutas de escritura de tratamientos; los demás límites no cambian. Las peticiones con foto tienen un tiempo máximo de 60 segundos en el cliente.
