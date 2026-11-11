# Lasheo

Aplicación para gestionar un negocio de belleza, con frontend Angular y API Django/DRF sobre PostgreSQL.

## Estructura

- [Frontend](Frontend/README.md): interfaz administrativa y catálogo público, configuración y comandos de desarrollo.
- [Backend](Backend/README.md): API, autenticación, reglas de negocio e instrucciones de instalación.
- [Contrato OpenAPI](Backend/docs/openapi.json): especificación de la API.
- [Integración continua](.github/workflows/backend-ci.yml): verificaciones del backend.

## Instalación

Consulta los README de cada aplicación para los requisitos y la configuración. Instala las dependencias del frontend con `npm ci` desde `Frontend` y las del backend en un entorno virtual con `pip install -r requirements.txt` desde `Backend`.

Los archivos `.env.example` contienen referencias de configuración; reemplaza los valores de ejemplo en tu entorno. Las credenciales, los certificados privados, los respaldos y las dependencias instaladas no se incluyen en el repositorio.

El backend utiliza un esquema PostgreSQL existente con modelos de negocio no administrados por Django. Revisa la documentación antes de ejecutar migraciones: una base vacía requiere preparar también ese esquema.
