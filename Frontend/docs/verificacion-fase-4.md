# Verificación de Fase 4

Fecha: 11 de noviembre de 2026. Revisión solicitada después de la entrega.

## Resultado

La verificación distingue el código del proyecto de la instancia que actualmente responde en `https://localhost:8443`. **La instancia local aún no expone el endpoint nuevo de recuperación financiera: devuelve 404.** Por tanto, no se considera lista para utilizar el flujo nuevo de cobros, aunque las pruebas aisladas del código sean satisfactorias. Deben actualizarse frontend y backend juntos y comprobar después el endpoint con sesión y permisos.

La comprobación de la instancia fue de solo lectura y verificó TLS mediante su CA local; no se desactivó la validación del certificado ni se enviaron credenciales.

| Comprobación local                                                                                     | Resultado observado                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                                                                                     | 200, JSON.                                                                                                              |
| `GET /registro/`                                                                                       | 200, HTML. Esto confirma disponibilidad de la página, no la versión desplegada del flujo entero.                        |
| `GET /api/finanzas/intentos/550e8400-e29b-41d4-a716-446655440000/?operacion=pago.registrar` sin sesión | 404, HTML. La ruta nueva implementada debe responder 403 sin sesión, y resultado privado con sesión y permisos válidos. |

## Hallazgos corregidos en el código

1. La confirmación de una venta consultaba inventario incluso sin permiso de lectura de artículos. Ahora esa consulta automática respeta `negocio.view_articulos`; el backend conserva su autorización independiente.
2. Al cargar otro detalle podían quedar visibles existencias o errores de stock de la venta anterior. Se limpian antes de obtener el nuevo detalle, evitando presentar stock ajeno como correspondiente a la venta actual.
3. Si la escritura financiera se confirmaba pero fallaba la consulta posterior, el mensaje podía afirmar que el saldo había sido consultado. Ahora distingue operación registrada de estado actual no disponible y permite volver a consultar la venta sin repetir la escritura.
4. Se corrigieron caracteres deteriorados en dos párrafos del informe anterior.

Se añadieron cuatro pruebas unitarias de estos estados. No se modificaron reglas financieras, saldos, movimientos, tablas ni datos de negocio en la base Lasheo.

## Comprobaciones

| Verificación                                                 | Resultado                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Pruebas Django con PostgreSQL temporal                       | **373/373 aprobadas**.                                                                                                          |
| Pruebas unitarias y HTTP Angular después de las correcciones | **93/93 aprobadas**, 21 archivos.                                                                                               |
| Typecheck y lint                                             | Aprobados; 149 archivos de código/plantillas revisados.                                                                         |
| Regresión E2E completa sobre el código recibido              | **57/57 aprobadas**, con Angular, Django y PostgreSQL reales.                                                                   |
| Compilación y E2E de Fase 4 después de las correcciones      | Build aprobado y **12/12 E2E aprobadas**; incluye fallo de GET posterior a un cobro registrado, sin segundo POST ni doble pago. |

El arnés utiliza Angular compilado, Django y PostgreSQL reales en una base temporal aleatoria, con datos sintéticos y eliminación al finalizar. Las pruebas negativas incluyen confirmaciones simultáneas, stock insuficiente, sobrepago, referencias/anticipos duplicados, respuesta de cobro perdida y recuperación sin segundo POST.

## Decisión

- **Código en entorno aislado:** GO técnico tras las pruebas ejecutadas. No quedan errores críticos conocidos de seguridad, saldo o inventario en estos controles; esto no valida por sí solo la instancia que está en ejecución.
- **Instancia actual de localhost:8443:** NO-GO para el flujo nuevo hasta actualizar la aplicación en ejecución y verificar que expone el endpoint de recuperación.
- **Operación comercial con datos reales:** NO-GO hasta revisar aviso de privacidad/versionado, dominio HTTPS accesible desde celular y configuración operativa.
- Los cambios de Fase 4 siguen en el proyecto local; no se publicaron ni se subieron nuevos commits como parte de esta verificación.
