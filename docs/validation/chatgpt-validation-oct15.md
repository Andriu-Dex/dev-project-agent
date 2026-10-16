# Validación de ChatGPT y operación — 15 de octubre de 2026

Esta tanda cubre los puntos 1–4 autorizados. La preparación de entrega (punto 5) sigue diferida. Las evidencias locales están en `work/acceptance/chatgpt-oct15/`, excluidas de Git. Las fechas siguientes usan America/Guayaquil (UTC−5). No se repitieron las cuatro escrituras Trello ni el PR #11 previamente autorizados.

## Proveedor y agentes

- Evaluación real `3b6eefa6-c759-4e86-adfa-d40f4ffbe31e`: gpt-6.1-sol, razonamiento medio, **6/6** comprobaciones automáticas. Esto no reemplaza aceptación humana ni garantiza respuestas futuras.
- Propuesta de demostración `50b8976f-b3de-41a5-88c1-87066de11b4a` v1: Ejecutor, Revisor y Aprobador completados; rechazo registrado desde el panel a las 07:22:01 con motivo. Conserva EN CURSO y nunca puede escribir en Trello.
- Dos entradas adversas aisladas enviadas al Revisor real —hechos contradictorios y recursos inventados— recibieron `changes_requested`. No se introdujeron esos datos en la planificación ni se generaron escrituras.
- Análisis real `5264924e-c794-4ce4-a1f7-b1b02dcf614c`: archivo `frontend/src/shared/api.ts`, commit fuente `ba0d7170b75b9c1e0db803be9c9285b077c9c36e`, tres hallazgos/señales. El primer intento inválido se conserva: `limitations` llegó como cadena. Se explicitó el contrato en el prompt y se mantiene el rechazo estricto, sin coerción ni aceptación silenciosa.
- Corrección de demostración `458f9c25-b3b4-4c6c-8f05-e9dca98ec378`: v1 recibió solicitud humana de ajustes; el Revisor de v2 detectó una regresión potencial de NaN/0n y detuvo el flujo. Se aclaró la coordinación secuencial para evitar exigir dictámenes futuros durante la preparación. La v3 conservó esos casos límite y completó las tres etapas a las 10:17, pendiente de decisión humana y sin publicación. La v3 se lanzó mediante el servicio de aplicación desde CLI; las primeras versiones y decisiones se recorrieron en el panel. No se atribuye a estas propuestas la ejecución de pruebas funcionales de UTAPED.

Evidencia: `adversarial-review.json`, `analysis-diagnostic-before.json`, `analysis-diagnostic.json`, `workflows.json`, `code-v3.json`, capturas y árboles accesibles del panel.

## Renovación y reinicio

Después del inicio de sesión de las 06:59:41, se registraron renovaciones automáticas exitosas a las **07:58:05, 08:56:35 y 10:08:36**, revisiones 37–39, sin nuevo OAuth. No se alteraron caducidad, reloj ni cursores de renovación. El error histórico durante la conexión incompleta se conserva como tal.

Se reinició el proceso API mediante su supervisor de desarrollo (PID 9024 → 31264); `/api/v1/health` volvió a responder 200 con base de datos disponible. Después, la v3 ejecutó inferencia real recuperando las credenciales cifradas. Esto verifica reinicio de API, no arranque automático del equipo ni disponibilidad ilimitada del proveedor. Una revocación, cuota agotada o respuesta incierta puede seguir requiriendo intervención.

Evidencia: `timeline.jsonl`, `final-schedule.json`, `code-v3.json`. El comprobador inicial consultó por error `/health`; esa ruta incorrecta no se considera un fallo del producto.

## Programaciones, fuentes y correo

El primer corte de las 07:30 se completó, pero Brave tenía una ventana abierta: **no acredita navegador cerrado**. Se repitió a las 07:40 con cero procesos y cero ventanas de Brave observados de 07:38:51 a 07:42:16. El servicio y el equipo permanecieron activos.

El reporte `76116202-ba12-412f-86ab-bcc5dc69b100` se publicó a las 07:40:02 en una sola versión y con tres comprobaciones deterministas superadas. Su correo fue aceptado por SMTP a las 07:40:19, un intento. El corte anterior también produjo una sola entrega aceptada. No se confirma recepción en Recibidos de estos dos mensajes; la confirmación del usuario pertenece al correo de prueba anterior.

En esa ventana se completó la revisión diaria y la lectura de Trello/GitHub (07:42:05/07). La revisión de las 07:29 cubrió 62 archivos seguros y aplazó 75; la continuación de las 07:40 revisó otros 69 y dejó cero aplazados. Las exclusiones por contenido sensible se registran aparte, sin marcar esos archivos como revisados ni enviar su contenido a IA. El corte real de las 07:45, con el mismo HEAD, creó cero análisis nuevos y no consumió IA. El historial conserva también la revisión anterior del commit `248eebab…`; no se crearon commits ficticios en UTAPED.

Se restauraron las preferencias originales, conservando el historial:

| Configuración | Estado final |
| --- | --- |
| Lectura de fuentes | Cada 60 minutos, operación v7 |
| Revisión de código | Todos los días a las 18:00, máximo 64 intentos, IA automática desactivada |
| Reporte semanal | Viernes a las 18:00, programación v12 |
| Correo automático | Desactivado, preferencias originales restauradas, v3 |

La restauración de operación v7 se realizó a las 10:12; la lectura temporal cada cinco minutos siguió activa hasta entonces. No se presenta como restaurada antes. Los fallos de SMTP, respuesta incierta, reintento acotado, deduplicación y recuperación se comprobaron con fixtures y transportes aislados; no se provocaron fallos en envíos reales.

Evidencia: `automation-end-closed.json`, `automation-no-change.json`, `browser-closed-confirmation.json`, `timeline.jsonl`, `final-schedule.json`, captura del historial de correo.

## Correcciones y acceso

Las nuevas decisiones de aprobación también requieren motivo no vacío en servidor y formulario. Se conserva la aprobación histórica sin motivo y su limitación; no se modifica ni inventa una justificación retrospectiva. Los reportes vinculan recomendaciones con responsable y fecha observados, sin asignar nuevos compromisos. Se corrigieron textos SMTP mal codificados y recomendaciones técnicas demasiado genéricas.

Se conservó el rediseño local azul/gris del usuario y se corrigieron regresiones semánticas: 35 actividades e hitos = 29 actividades + seis hitos; avance declarado, responsable descrito separado de miembros nativos y ausencia de afirmaciones de supervisión en tiempo real sin evidencia. Se inspeccionó Planificación en Brave.

Un lector temporal inició sesión normalmente en Brave: consultó propuestas y su rechazo, historial de código y reportes, sin formularios de aprobación, ejecución, publicación o generación. La cuenta y pertenencia quedaron desactivadas y se eliminó el archivo temporal de inicio de sesión. Las denegaciones HTTP anónimas/lector y revocación se conservan en la evidencia anterior y suites PostgreSQL. El panel se dejó en inicio de sesión para restaurar la sesión habitual del gestor; esto no desconecta ChatGPT.

## Verificación y límites

`npm test`: **186 pruebas superadas**, 142 omitidas por falta de la configuración de integración en ese comando; no se cuentan las omitidas como ejecutadas. En ejecuciones separadas se superaron **137 escenarios PostgreSQL distintos**: auth 11, Trello 9, supervisión 10, propuestas 12, ejecución 21, proveedor 7, renovación 9, código 19, reportes 16, operación 12 y notificaciones 11. Total de pruebas automatizadas distintas ejecutadas: **323**. Los casos reales del modelo y las observaciones de horarios se informan por separado.

Comprobación de tipos y build superados después de incorporar los cambios visuales. Escaneo de valores actuales de credenciales limitado a archivos versionados, mensajes de commits, logs y evidencias locales disponibles; no demuestra ausencia de secretos antiguos o desconocidos. `.env`, exportación privada y `work/` permanecen excluidos. ACL de `.env` limitada al usuario, administradores y sistema.

No se ejecutaron pruebas nuevas de Groq/Gemini/Ollama, compilación Java ni pruebas funcionales del proyecto supervisado. La matriz distingue procedimientos comprobados y pendientes; esta tanda no constituye aceptación académica final ni autorización para publicar otra corrección.
