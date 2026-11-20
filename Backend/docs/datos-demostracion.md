# Datos de demostración de Lasheo

Carga local realizada para explorar la aplicación el **19 de noviembre de 2026**, en horario de Lima. Los registros son ficticios y se identifican mediante `Demo` o `DEMO-SISTEMA-20261119`. El catálogo y las credenciales locales existentes se conservaron.

## Acceso

También hay tres [accesos individuales de especialistas](agendas-por-especialista.md), con agenda propia y una vista del administrador organizada por columnas.

- Aplicación: https://localhost:8443/login
- Usuario: `operador_local`.
- Contraseña: consultar `%USERPROFILE%/.codex/lasheo-private/local-operation/credentials.json` o `ACCESO-DEMO.md` en esa misma carpeta.
- Segundo factor: usar el código de seis cifras del autenticador ya configurado. Para configurarlo en el teléfono, abrir `operator-mfa.png` en esa carpeta y escanearlo con la aplicación de autenticación. No es un QR de recepción.
- El sistema funciona en este equipo, con Docker Desktop y los contenedores `beauty-local-web` y `beauty-local-proxy` en ejecución.

## Qué se cargó

| Módulo | Datos disponibles |
|---|---|
| Clientas | 24 fichas ficticias con apellido Demo, cumpleaños y contacto de ejemplo |
| Profesionales | Ana Demo, Maria Demo y Lucia Demo; comisión del 10 %, 12 % y 15 %; seis especialidades cada una |
| Catálogo | Los seis tratamientos y cuatro productos de demostración existentes |
| Insumos | Cuatro nuevos insumos; recetas de dos insumos por tratamiento |
| Inventario | Compras recibidas y salidas por ventas/consumos; un insumo bajo mínimo y otro agotado |
| Proveedores | Tres proveedores con nombre Demo y correo de ejemplo |
| Compras | Dos recibidas y un borrador pendiente de recepción |
| Ventas | 30 confirmadas: 24 en noviembre y seis en octubre; un borrador adicional |
| Visitas | 30 finalizadas y tres abiertas para practicar |
| Pagos | 25 cobros, con efectivo, Yape, Plin, transferencia y tarjeta; ventas pagadas, parciales y pendientes |
| Anticipos | Cinco anticipos confirmados de S/ 20.00 para citas próximas |
| Gastos | Nueve gastos distribuidos entre servicios del salón, limpieza y publicidad |
| Calendario | 30 citas completadas y 18 próximas, entre el 19 y el 21 de noviembre; horarios de 10:00 y 14:00, programadas y confirmadas |
| Disponibilidad | Agenda general del 19 al 25 de noviembre de 2026, de 09:00 a 19:00 |
| QR de recepción | Un punto activo llamado «Demo - Recepcion del salon» |

## Recorrido recomendado

1. **Dashboard:** https://localhost:8443/admin. Muestra cuatro tarjetas, barras verticales y dona de costos/gastos. Cambiar el selector «Reporte» para ver evolución con puntos, medios de pago, rankings, inventario y gastos. Cada reporte incluye varios gráficos. La exportación Excel conserva el reporte seleccionado.
2. **Calendario:** https://localhost:8443/admin/agenda. Seleccionar **19, 20 o 21 de noviembre de 2026**, vista Día o Semana y aplicar filtros. Hay seis citas por día. Abrir una cita permite revisar su ficha, tratamiento, profesional y anticipo cuando corresponda.
3. **Clientas:** https://localhost:8443/admin/clientas. Buscar `Demo`. Las fichas incluyen historial de visitas y ventas. Los correos usan el dominio de ejemplo `example.test`; no se enviaron mensajes ni se otorgaron consentimientos ficticios.
4. **Profesionales:** https://localhost:8443/admin/agenda/profesionales. Consultar especialidades, comisiones y jornadas.
5. **Ventas:** https://localhost:8443/admin/ventas. Revisar una confirmada y sus cobros; existen saldos pendientes para practicar pagos. El borrador permite practicar revisión y confirmación de consumos.
6. **Atenciones:** https://localhost:8443/admin/visitas. Hay tres abiertas para continuar una atención y 30 finalizadas para consultar historial.
7. **Inventario:** https://localhost:8443/admin/inventario. Revisar «Demo - Microcepillos - stock bajo» y «Demo - Guantes - agotados». Las existencias están respaldadas por movimientos de compras, venta de productos y consumo de insumos.
8. **Compras:** https://localhost:8443/admin/compras. Abrir la compra cuyo documento termina en `-003`; está en borrador y contiene guantes. Su recepción incrementará las existencias y cambiará las cifras de demostración.
9. **Proveedores:** https://localhost:8443/admin/proveedores. Consultar los tres proveedores de ejemplo.
10. **Catálogo:** https://localhost:8443/catalogo. Explorar los tratamientos y productos publicados. La carga no cambió la política de reservas públicas ni habilitó nuevos canales de mensajería.
11. **QR:** https://localhost:8443/admin/puntos-qr. Consultar o descargar el QR del punto de recepción Demo.

## Cifras de referencia de noviembre

Valores comprobados al terminar la carga, antes de practicar nuevas operaciones. Rango: **1 al 30 de noviembre de 2026**; el dashboard del mes en curso muestra las mismas ventas porque las ventas de noviembre están fechadas del 1 al 18.

| Indicador | Valor |
|---|---:|
| Ventas confirmadas | S/ 2,370.00 |
| Número de ventas | 24 |
| Cobros registrados | S/ 1,795.00 |
| Anticipos recibidos | S/ 100.00 |
| Saldo pendiente | S/ 575.00 |
| Costo directo | S/ 169.20 |
| Comisiones | S/ 232.72 |
| Gastos operativos | S/ 400.00 |
| Utilidad operativa estimada | S/ 1,528.08 |
| Ticket promedio | S/ 98.75 |

Los anticipos se muestran separados de los cobros. La caja neta conciliada queda «No disponible» porque no se inventaron cierres ni evidencias de conciliación bancaria.

## Reproducir o consultar la carga

Desde `Backend`, el comando sin opciones realiza un ensayo transaccional que revierte sus inserciones:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/populate_demo_system.py
```

Para aplicar la carga:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/populate_demo_system.py --apply
```

El script comprueba la base local `Lasheo` y registra la carga en auditoría para evitar duplicaciones. No elimina información, no ejecuta migraciones y no cambia contraseñas. Las fechas son fijas para poder reproducir este recorrido.

El manifiesto con los identificadores creados está en `%USERPROFILE%/.codex/lasheo-private/local-operation/demo-system-manifest.json`. La comprobación HTTP está en `demo-api-verification.json`. No se deben eliminar ventas confirmadas directamente: practicar con pagos, recepciones o confirmaciones modifica los valores de referencia.
