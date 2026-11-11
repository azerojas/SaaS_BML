# Límites de confianza y privacidad

- QR fijo revocable identifica un punto, no una persona ni ubicación. Puede compartirse; no autentica administración.
- Público: solo formulario mínimo y solicitudes no enumerativas. Sin lookup por teléfono, polling, PII, notas o historial.
- Check-in anónimo sin autenticadores de sesión: las cookies de personal no otorgan privilegios al POST público. Solo JSON; CORS existente restrictivo. Sin mensajes externos.
- Personal: IsAdminUser, sesión y CSRF para toda escritura; conocer token QR no evita permisos.
- Alta provisional inactiva; no se concede consentimiento por casilla anónima. El personal verifica identidad y declaración vigente antes de activarla. No se sobreescriben datos de clientas existentes.
- Los marcadores ALTA_QR_PROVISIONAL/DECLARAR_CONSENT_QR/VALIDAR_ALTA_QR están en auditoria y deben conservarse mientras dependan de ellos las propuestas. Eliminar esos marcadores arbitrariamente invalida el flujo de revisión.
- Rate limit compartido mediante la tabla de contadores PostgreSQL existente; cada operación de incremento usa atomic y SELECT FOR UPDATE en orden estable. Se usan HMAC-SHA256 con namespace distinto de login, no IP/teléfono/User-Agent en texto.
- Límites por IP y huella aproximada por minuto, por IP al día y por teléfono normalizado cada 15 minutos. Valores por defecto: POST 15/min, GET 60/min, 200/IP/día, 6/teléfono/15min.
- El límite de IP se consume antes del parser/lookup; el de teléfono después de normalizar y antes de consultar fichas. X-Forwarded-For no se confía automáticamente. Proxies/NAT pueden compartir límite: configurar el gateway confiable al desplegar.
- Fingerprint aproximado no prueba dispositivo/identidad y puede cambiar; el límite por IP sigue protegiendo al cambiar User-Agent.
- Parser limitado a 8 KiB y JSON UTF-8; se rechazan anidaciones que excedan el parser sin reproducir el cuerpo en errores.
- No se registran cuerpos públicos ni datos de contacto en logs/auditoría. El teléfono se conserva solo en la ficha, donde es dato funcional. Los motivos privados deben evitar datos innecesarios.
- Bloqueo advisory de escrituras de clientas compartido con fase 1, seguido de bloqueos de filas, coordina formatos heredados y evita duplicados. UNIQUE parcial de pendiente y UNIQUE de visita son defensas físicas finales.
- La búsqueda de equivalentes telefónicos heredados recorre fichas sin normalizarlas masivamente. Antes de alto volumen, evaluar una columna/index canónico mediante migración aprobada; no se afirma resistencia temporal criptográfica a enumeración.
- Citas y visitas se enlazan mediante operación administrativa explícita; verificar siempre igualdad de clienta.
- Expiración conserva historial y usa CANCELADA más auditoría. No hay nuevo estado SQL ni eliminación de pendientes.
- Se conserva no-store en público/privado. QR SVG/PNG privado no contiene contactos y añade Content-Security-Policy.
- CHECKIN_DEMO_MODE=True exige DEBUG=True para servir público. check --deploy detecta aviso ficticio/URLs HTTP/falta de versión. Las pruebas usan configuración HTTPS de ejemplo para comprobar forma; no validan un aviso legal ni un despliegue real.

Para publicar se requieren aviso real revisado, URLs HTTPS reales, rol SQL mínimo, proxy/rate limit de borde y supervisión de contadores/retención. No se configuraron ni se activaron esas decisiones de producción en esta fase.

