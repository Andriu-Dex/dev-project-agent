> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

# Recorridos funcionales del gestor

Diseño documental, sin ejecutar acciones reales. Vincula [modelo de datos](../../data-model.md), [pantallas](manager-screens.md) y [estados](proposal-workflow.md). Las fechas de ejemplos son ficticias y no cambian la planificación de UTAPED.

## 1. Detectar retraso y aprobar una corrección

1. Una consulta guarda SourceSnapshot y WorkItemObservation. El motor detecta una actividad abierta vencida y registra Finding con evidencia.
2. Resumen muestra alerta; Actividades abre fechas y dependencias, comparadas con BaselineVersion si está disponible.
3. Ejecutor produce ProposalVersion con una fecha nueva precisa, precondiciones y verificación. Revisor valida y Aprobador solicita decisión humana.
4. Steven abre Propuestas y ve antes/después, evidencia, riesgos, revisión y versión. Aprueba esa versión.
5. El servicio guarda HumanDecision, Authorization, transición y auditoría en una transacción local.
6. El control relee el recurso y, si coincide, guarda intención e intenta el cambio. Verifica resultado y cierra executed.
7. Historial muestra la secuencia y el reporte del periodo incorpora decisión y resultado reales.

Resultado requerido: autorización concreta, sin edición directa desde Actividades y sin declarar éxito al aprobar.

## 2. Pedir ajuste o rechazar

Desde el detalle de una versión pendiente, el gestor solicita ajustar la recomendación y aporta motivo. La versión queda changes_requested; el Ejecutor prepara otra y repite revisión/política/aprobación. Si rechaza, queda rejected sin efecto externo. Se conserva todo para el reporte.

Resultado requerido: ninguna decisión se hereda por otra versión; un pedido de ajuste no autoriza un cambio parcial.

## 3. La tarjeta cambia después de aprobar

Una propuesta autorizada espera ejecución. La relectura detecta que cambió el vencimiento usado como precondición. Se registra invalidated, no se escribe y el panel explica qué dato dejó de coincidir. Un análisis posterior produce nueva versión revisable con evidencia nueva.

Resultado requerido: no sobrescribir una modificación externa con una aprobación obsoleta. Un cambio ajeno al alcance no invalida por sí solo sin revisar su relevancia.

## 4. Revisar código y preparar una rama

Código muestra CodeAnalysis y hallazgos vinculados al commit. El gestor consulta una propuesta con diferencias exactas y comprobaciones realizadas. Tras revisión, política y aprobación, se materializa ese candidato en una rama de trabajo del repositorio permitido y se verifican sus diferencias.

El panel informa «rama preparada» y «pendiente de integración humana». Solo al observar la incorporación realizada por una persona se actualiza integrationStatus. Una prueba sugerida pero no ejecutada permanece not_checked.

Resultado requerido: conservar commit base, candidato y evidencia; no integrar automáticamente ni declarar implementado en la rama destino lo que solo existe en una rama de propuesta.

## 5. Publicar reporte semanal

El viernes a las 18:00 una JobOccurrence inicia la generación para el periodo previsto. Se congelan snapshots, métricas, configuración y decisiones al corte. Revisor valida y Aprobador comprueba la política de publicación interna. El servicio publica esa edición una sola vez y la muestra en Reportes.

Si falla una fuente o la IA, indicar el límite; un reporte sin validación queda pendiente. Al reiniciar el equipo se recupera el corte pendiente con hora real de generación y sin duplicarlo. Una corrección genera otra edición, no altera silenciosamente la publicada.

Resultado requerido: distinguir periodo, hora de generación y antigüedad de fuentes; no confundir recuperación con aprobación automática de cambios externos.

## 6. Resultado externo incierto

Una escritura agota el tiempo de espera. Execution pasa a reconciliation_required; Historial y detalle muestran resultado incierto. El servicio consulta el recurso y registra Reconciliation. Si demuestra el efecto exacto, cierra executed; si demuestra ausencia total, registra execution_failed; si hubo aplicación parcial, mantiene evidencia y exige una propuesta nueva cuando corresponda.

Resultado requerido: no repetir ni revertir cambios a ciegas, aunque se reinicie el equipo.

## 7. Integrante de consulta intenta aprobar

El integrante puede consultar actividad, propuesta y reporte. No recibe controles de decisión. Si intenta llamar al servicio para aprobar, el servicio verifica membresía y deniega la operación con auditoría saneada. No existe HumanDecision aprobada ni Authorization por ese intento.

Resultado requerido: los permisos se cumplen en el servicio, sin depender de ocultar botones.

## 8. Cambiar una regla del proyecto

El gestor abre Configuración, consulta valores actuales y confirma un cambio permitido. El servicio guarda una ProjectConfigVersion nueva, registra auditoría e identifica propuestas cuya política o precondiciones resultan afectadas. Esas versiones se invalidan antes de ejecutar.

Los reportes publicados conservan su configuración histórica. La nueva configuración no edita Trello ni modifica el historial. La sustitución de credenciales protege secretos y limita destinos permitidos.

Resultado requerido: reproducibilidad y permisos vigentes sin reescritura de decisiones pasadas.

## Cobertura de requisitos

| Requisitos | Recorrido / pantalla principal |
| --- | --- |
| REQ-01, REQ-02, REQ-03 | 1 y 3; Resumen y Actividades |
| REQ-04, REQ-05 | 1 y 2; Riesgos y Propuestas |
| REQ-06 | 5; Reportes |
| REQ-07 | 4; Código |
| REQ-08, REQ-09 | 1, 2 y 4; revisión, política y decisión |
| REQ-10 | Todos; Historial y registros enlazados |
| REQ-11 | 3, 6, 7 y 8; permisos, precondiciones y conexiones |

Estos recorridos son criterios de diseño y futuros casos de validación, no evidencia de cumplimiento implementado.
