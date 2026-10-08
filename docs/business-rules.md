# Reglas de negocio

## Propuesta de operación del 7 de octubre

Consultar [reportes y operación](reports-and-operations.md) para los valores iniciales propuestos: frecuencias, proximidad de 72 horas, datos de bloqueo/prioridad no informados, periodo semanal, formato HTML/PDF y rama destino. Esa propuesta concreta los puntos antes pendientes y prevalece sobre alternativas de diseño anteriores; aún no representa confirmación individual del gestor. Las [normas y criterios](standards-and-quality.md) aportan referencias y comprobaciones propias, sin certificación.

## Actualización tras corregir los seis hitos

La cuarta exportación del 7 de octubre confirma inicio nativo ausente y vencimiento a las 17:00 para los seis hitos. Se adopta esa representación como instante de duración cero; queda resuelta la observación temporal de revisiones anteriores. Los hitos se supervisan por separado y no incrementan el denominador de actividades. La programación nativa corregida proporciona el instante; la descripción permite contrastarlo.

## Decisiones confirmadas por el usuario

| Tema | Decisión |
| --- | --- |
| Reporte | Viernes a las 18:00, zona America/Guayaquil |
| Modificaciones | Requieren aprobación explícita del gestor humano |
| Otros integrantes | Acceso de consulta inicialmente |
| Código | Rama y propuesta para revisión; incorporación a la rama destino por una persona |
| Ramas de UTAPED | agent/<proposal-id>-v<version> con PR a develop; incorporación a develop y main humana |
| Ramas de dev-project-agent | Desarrollo en develop; versión final validada pasa a main |
| Planificación original | Trello, según confirmación del usuario |
| Gestor autorizado | Steven Eduardo Paredes Medina, usuario que confirmó su identidad y autoridad en esta conversación |
| Cuenta del gestor en Trello | andrew uzumaki (`andrewuzumaki`), ID `6a9570f1c1b641a5863de7d9` |

La correspondencia de identidad fue confirmada por el usuario el 7 de octubre de 2026. Es una decisión de planificación; la autenticación y vinculación segura de esa cuenta se implementarán y verificarán posteriormente. La pertenencia al tablero no concede por sí sola autoridad dentro del agente.

Los agentes pueden consultar, analizar y preparar borradores automáticamente. Publicar un reporte validado dentro del panel no implica autorización para cambiar Trello o código ni para enviarlo a destinatarios externos.

## Propuestas pendientes de contraste con la planificación

- Estado operativo: pendiente, en ejecución, completada o bloqueada. El JSON confirma listas por fase y etiquetas COMPLETADA, PENDIENTE y EN CURSO. Propuesta: normalizar EN CURSO a en ejecución y mostrar ausencia de etiqueta como sin estado informado. Aceptación y evidencia se mantienen separadas. No hay etiqueta de bloqueo exportada.
- Retraso: actividad no completada con fecha límite anterior al instante de evaluación. Puede coexistir con un bloqueo; evitar doble conteo en totales y explicar esta superposición.
- Próxima a vencer: actividad no completada con vencimiento dentro de tres días calendario; umbral configurable propuesto.
- Avance inicial propuesto: actividades completadas declaradas divididas entre actividades incluidas, por cien. El inventario identifica 25 actividades y seis hitos: excluir hitos del denominador y mostrarlos por separado. En la tercera exportación, el avance declarado es 56 % (14/25); no acredita aceptación verificada. Si la planificación tiene pesos o esfuerzo, acordar una fórmula ponderada antes de sustituirla.
- Conjunto vacío: mostrar avance no disponible, sin dividir entre cero.
- Actividad sin fecha: mostrar dato faltante; no concluir que está dentro de plazo.
- Fechas sin hora: acordar la interpretación antes de evaluar vencimientos.
- Excluir del avance actual las tarjetas históricas archivadas y las referencias de control. Conservarlas en el historial. Cancelaciones futuras requieren reglas acordadas y registro del cambio de alcance.
- Mantener una línea base aprobada separada del estado actual; una sincronización no reemplaza silenciosamente esa línea base.
- La referencia de control declara aprobada la programación de fases 1–6. Conservar esa declaración y la referencia al XML sin afirmar que el archivo o un acta hayan sido verificados. La cuarta exportación confirma los seis hitos con solo vencimiento a las 17:00, sin inicio, para representarlos como instantes.
- Analizar impactos a partir de dependencias documentadas. Si faltan, indicar que no se puede determinar el impacto completo.
- Atribuir causas a evidencias concretas; etiquetar hipótesis y pedir confirmación cuando corresponda.

## Propuestas y aprobación

El detalle del intercambio está en [contratos de datos](data-contracts.md) y las transiciones en [flujo de propuestas](proposal-workflow.md). Solo el servicio cambia estados tras validar condiciones; los modelos no pueden crear aprobación humana. Las propuestas enviadas son inmutables y cualquier ajuste repite revisión y aprobación en otra versión.

Toda propuesta debe incluir recurso afectado, estado anterior, cambio solicitado, justificación, evidencia, impacto, riesgos y versión. Se conserva la revisión del Revisor y la decisión del Aprobador.

El gestor puede aceptar, rechazar o pedir ajustes. El rechazo impide ejecución. Un ajuste crea una nueva versión que repite revisión y aprobación. La aprobación autoriza únicamente la versión y alcance mostrados.

Antes de escribir, comprobar permisos y que el estado del recurso coincida con el revisado. Si difiere, detener y revaluar. Registrar intento, resultado y verificación. No marcar como ejecutado un cambio fallido o incierto.

En código, distinguir autorización para preparar una rama y cambios de la incorporación final. No escribir directamente en la rama principal ni integrar automáticamente. La persona responsable revisa diferencias y comprobaciones antes de incorporar.

## Reporte semanal

Debe incluir periodo, fecha de consulta de fuentes, avance y fórmula, actividades por estado, retrasos, bloqueos, riesgos, desviaciones frente a línea base, acciones propuestas/aprobadas/rechazadas/ejecutadas y recomendaciones para la próxima semana.

Propuesta de periodo: desde el corte semanal anterior hasta el corte actual del viernes a las 18:00. El primer reporte usa la fecha de activación como inicio. Esta definición está pendiente de confirmación.

Si el equipo está apagado o falla el servicio, registrar el reporte pendiente y generarlo al reiniciar con su periodo original y hora real. Evitar duplicados por periodo. Si falta revisión, mostrar pendiente de validación en lugar de presentarlo como verificado.

## Trazabilidad

Registrar actor humano o agente, fecha/hora, operación, fuente, versión, decisión, motivo y resultado. Guardar instantes de forma consistente y mostrarlos en America/Guayaquil. No registrar secretos ni razonamiento interno del modelo: conservar evidencia, justificación resumida y decisiones verificables.

## Información pendiente

Se documentaron listas, etiquetas y dependencias en [la revalidación de Trello](trello-validation.md). Steven y su cuenta de gestor están confirmados; la cuarta exportación resuelve los hitos. El flujo de ramas ya fue confirmado. Normas, frecuencia, formato de reportes, prioridad/bloqueos y ausencia de caducidad temporal automática están concretados como propuestas en reports-and-operations.md y standards-and-quality.md. Los valores propuestos no se consideran aceptados solo por estar documentados. Otros perfiles siguen pendientes de vinculación segura durante implementación.
