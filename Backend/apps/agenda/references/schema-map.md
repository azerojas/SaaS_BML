# ADR-007: agenda privada sobre tablas existentes

2026-11-06. La base real auditada conserva 34 tablas originales y7 vistas, 47 tablas físicas contando Django y soporte financiero. Configuración PEN/Lima; 13 FK de usuarios restauradas. Evidencia privada `backups/phase7-installed-schema.json` con columnas, constraints, índices, funciones/triggers reales y configuración. Backup `*_before_phase7.dump` restaurado en otra base temporal:47 tablas/7 vistas. Ninguna prueba escribe negocio en Lasheo.

Reuso: profesionales, profesional_servicios PK compuesta, horarios_profesional, bloqueos_agenda, configuracion_reservas id1, citas, cita_servicios, cita_estados_historial, lista_espera; referencias a clientas/llegadas/visitas/ventas/anticipos de módulos previos. managed=False preservado. Defaults ORM de las tablas de agenda reflejan DEFAULT ya instalado, incluidas generación UUID/código en PostgreSQL: no ALTER de sus columnas.

EXCLUDE `ex_citas_profesional_no_solape`, `ex_citas_clienta_no_solape` para estados PENDIENTE_PAGO/PROGRAMADA/CONFIRMADA, con tstzrange semiabierto. EXCLUDE `ex_horarios_no_solape` semanal. Bloqueos no tienen una constraint cruzada con citas: aplicación comparte lock global de agenda. No se altera ninguna restricción.

`fn_slots_disponibles` se contrastó con motor nuevo en caso sin pendientes vencidas. La función ignora pendientes con plazo pasado; EXCLUDE no. Decisión: no usarla como autoridad para liberar pendientes; GET conserva ocupación hasta transición real. Motor sobre los mismos horarios, citas y bloqueos añade elegibilidad por servicio/profesional. `fn_historial_estado_cita` inserta un evento inicial y cada transición; aplicación completa ese mismo registro con actor/origen/detalle, sin duplicarlo. Reprogramación conserva intervalos y snapshots previos/nuevos en auditoría porque el trigger solo registra estados. vw_agenda_diaria se verifica contra estado/fecha; no se modifica ni expone a público con su PII.

## Decisiones de alcance

Agenda privada operativa por personal autorizado. Público solo catálogo/profesionales visibles/slots; no identidad basada en teléfono ni gestión con código corto. UUID de gestión existente no se expone ni se usa en endpoint público incompleto. No OTP/pasarela/WhatsApp o scheduler nuevos. Asignación de profesional explícita; nada de elección automática oculta.

Lista de espera convertida conserva cita_id en evento CONVERTIR_ESPERA dentro de la misma transacción. Reintentos por claves persistentes y estado CONVERTIDA impiden otra conversión. Este vínculo exige preservar auditoría; no se añade una columna sin necesidad. Retiros de horario/bloqueo exigen intención explícita y guardan snapshot auditado, sin borrar citas o profesionales; no se ejecutaron en datos reales durante implementación.

## Migración aditiva aprobada y aplicada: metadata de permisos

`agenda.0001_agenda_permissions` declara proxy AgendaAccess sobre IdempotencyRecord, sin tabla nueva. SQL no-op; post_migrate registra content type y10 permisos propios, además del registro django_migrations. Se aplicó el 2026-11-10 tras la respuesta explícita «Sí, activar permisos y verificar la agenda». No cambió tablas/funciones/índices/triggers/vistas/filas de negocio: se verificaron huellas antes y después y se conserva informe privado `backups/phase7-activation-report.json`. Las consultas privadas respondieron HTTP 200, sin ejecutar reservas/expiraciones reales. Script `phase7_activation.py` exporta SQL por defecto; modo apply exige base exacta y huellas de esquema/filas iguales antes/después. Reversión del proxy ensayada en PostgreSQL aislado sin afectar padre ni negocio. Para retirar acceso, revocar permisos; no retirar soporte financiero padre con historial.

No se propone otro índice sin evidencia de lentitud. Disponibilidad ejecuta7 consultas tanto sin citas como con30 ocupaciones, sin N+1. Bloqueo global conservador prioriza integridad; medir antes de reemplazar por locks particionados, manteniendo carreras global/profesional/clienta/pago.

## Pendientes legítimos

Fase8: programar/monitorear expirar_citas, proxy/TLS/contadores, credenciales/privacidad reales. Escritura pública solo después de identidad verificable y política aprobada. Reembolsos y ledger conciliable son ampliaciones financieras de fases anteriores; cancelar/expirar mantiene dinero original e incidencia. Si se requiere historial dedicado de reprogramación o conversión sin depender de auditoría, proponer nuevas tablas aditivas con backfill verificado antes de aplicar; hoy no se simula ese requisito.
