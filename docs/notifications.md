# Correo y configuración dinámica

La versión 1.1 amplía destinatarios por responsabilidad, reglas por evento y vista previa. Consultar [uso 1.1](version-1.1-guide.md); las indicaciones siguientes describen la configuración base original.

Implementación del 14 de octubre de 2026, autorizada por el usuario. El correo es un requisito adicional del proyecto (USER-08); no se atribuye como obligación textual nueva al PDF ni cambia sus 39 criterios.

## Puesta en marcha

1. Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS` en `.env`. Con Gmail, usar una contraseña de aplicación cuando la cuenta lo permita; nunca la contraseña principal. Puerto 465 usa TLS directo; 587 exige STARTTLS. `SMTP_SECURE` es opcional y debe ser coherente con el puerto. Las credenciales no se muestran en el panel ni se guardan en las configuraciones de PostgreSQL.
2. Reiniciar el servicio después de cambiar el entorno. En Configuración → Notificaciones, pulsar **Comprobar conexión SMTP**. Esta comprobación no envía mensajes.
3. Guardar el correo del gestor. Puede ser diferente del remitente. Se admite un único destinatario, sin CC ni BCC.
4. Abrir **Enviar un correo de prueba**, confirmar el destinatario guardado y solicitarlo. Actualizar el historial para consultar su resultado.
5. Elegir los eventos y activar el envío automático cuando corresponda. Guardar conserva versión, gestor, autoridad y fecha. Los lectores no pueden consultar la dirección ni administrar los envíos.

`APP_PUBLIC_URL` configura el origen usado en el enlace al panel. Por defecto es `http://127.0.0.1:5174`; un enlace local solo funciona en el equipo del servicio. Este parámetro no publica ni aloja la aplicación. El gestor debe autenticarse al abrir el panel desde un aviso.

## Preferencias y comportamiento

Se ofrecen actividad vencida, bloqueo, próximo vencimiento, desviación, riesgo de dependencia, fallo de fuentes y reporte disponible. Se puede elegir resumen diario a una hora o aviso de novedades, recordatorios de 0 a 720 horas (0 los desactiva), silencio que puede cruzar medianoche y presupuesto de 1 a 100 mensajes diarios. Valores iniciales: automático desactivado, resumen 18:00, recordatorio cada 24 horas, silencio 21:00–08:00 y máximo 20 correos diarios. Horarios en America/Guayaquil.

La activación comienza con novedades posteriores al guardado. **Incluir alertas actuales** incorpora explícitamente las alertas activas de los tipos seleccionados; se muestra el total activo antes de guardar. Las alertas históricas excluidas no aparecen después como recordatorios. Los recordatorios requieren una alerta abierta y previamente incluida; el seguimiento o la resolución detienen esos recordatorios. Antes de enviar se descartan avisos de alertas ya resueltas.

Las observaciones repetidas no generan nuevos eventos de apertura. Un resumen agrupa hasta 500 referencias; los demás eventos quedan pendientes para otro mensaje, con límite diario. El servicio consulta periódicamente PostgreSQL y conserva la cola al cerrar el navegador. El equipo, el servicio, la base y la conexión deben estar disponibles para enviar. No se simula envío con el equipo apagado.

## Entrega, recuperación y autoridad

El flujo durable es pendiente → enviando → aceptado, fallido o incierto. SMTP aceptado no garantiza recepción, lectura ni ubicación en la bandeja. Un error explícito temporal o de conexión previa puede reintentarse hasta tres intentos, separados al menos cinco minutos. Un fallo después de DATA o un resultado ambiguo no se reintenta automáticamente. Una intención de envío interrumpida que supera cinco minutos pasa a incierta; se conserva para revisión, evitando un reenvío ciego.

La petición de prueba tiene clave idempotente y confirmación explícita. Solo se permite una nueva solicitud de prueba por minuto. Se revalida la autoridad almacenada antes de procesar y se cancela lo pendiente si se revoca. Un cambio de configuración cancela las entregas pendientes de la versión anterior; no altera lo ya aceptado ni sus eventos. El correo nunca registra aprobaciones ni ejecuta cambios externos.

El contenido se limita a resúmenes, identificadores y evidencia disponible, sin descripciones completas, código ni archivos adjuntos. Los textos se escapan en HTML y se filtran patrones de secretos y valores conocidos del entorno antes de guardar el evento. El transporte desactiva acceso a archivos/URL y logs SMTP. Este filtrado no es una garantía contra cualquier dato privado introducido en una fuente.

## Pantallas y programación

Configuración agrupa Integraciones, Seguimiento, Automatización, Notificaciones, Apariencia y Equipo. Operación conserva trabajos e historial. Los reportes permiten filtrar estado y fechas; su horario se modifica en Automatización, con día/hora/minuto y próxima ocurrencia guardada. La revisión de código incorpora días de la semana y minutos, sin reemplazar automáticamente los horarios existentes. Las lecturas conservan su intervalo configurable.

La paleta es azul/gris neutro, con modo oscuro carbón y estados semánticos diferenciados. Los formularios conservan sus valores al cambiar de pestaña. Notificaciones, Seguimiento, Automatización y Reportes advierten de cambios sin guardar antes de salir o recargar. La preferencia de apariencia se conserva en el navegador.

## API y comprobación

Todas las rutas `/api/v1/projects/:projectId/notifications` requieren gestor; mutaciones usan sesión, origen, CSRF y límite de solicitudes.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | Base | Configuración, próximos resumen e historial acotado |
| PUT | Base | Nueva versión y consentimiento para alertas existentes |
| POST | `/verify` | Comprobación SMTP sin mensaje |
| POST | `/test` | Solicitud persistente con UUID y `confirmed=true` |

Verificación: pruebas de horarios/silencio, inyección de cabeceras, escape HTML, cifrado y clasificación de errores; permisos de anónimo/lector/otro proyecto; once escenarios PostgreSQL con transporte sintético y rollback para cola, agrupación, idempotencia, incertidumbre, revocación, presupuesto, reintento y exclusión histórica. La programación añade prueba de persistencia y validación de días/minutos.

Validación real del 14/10: autenticación SMTP TLS correcta sin revelar credenciales; un correo de prueba solicitado desde Brave fue aceptado por SMTP y el usuario confirmó su llegada a Recibidos. El destinatario quedó guardado por el gestor y los envíos automáticos permanecen desactivados conforme a esa configuración. La validación de un aviso automático con datos reales queda pendiente de su activación. No se declara terminada la aceptación académica.

Referencias de configuración: [SMTP de Nodemailer](https://nodemailer.com/smtp), [SMTP de Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp), [contraseñas de aplicación](https://support.google.com/accounts/answer/185833?hl=es).
