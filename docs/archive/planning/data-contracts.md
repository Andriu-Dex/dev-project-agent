> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

# Contratos de datos entre agentes

Diseño documental del 7 de octubre de 2026, elaborado para revisión antes de implementar. Define información y responsabilidades, no clases, endpoints ni esquemas ejecutables. Se complementa con [el flujo de propuestas](proposal-workflow.md).

## Reglas comunes

- Identificadores técnicos en inglés, contenido mostrado al gestor en español.
- El servicio genera identificadores, versiones, fechas y estados. Un modelo puede proponer contenido, pero no declarar aprobaciones ni cambiar estados directamente.
- Las fechas de eventos son instantes UTC; el panel las muestra en America/Guayaquil. Fechas planificadas y reales son campos separados.
- Un valor ausente se conserva como ausente con su motivo; no se convierte en cero, pendiente o completado.
- Evidencia significa referencia verificable a una fuente, no una afirmación del agente. Conservar fuente, fecha y límites de acceso.
- Solo compartir contexto necesario, sin secretos, credenciales, certificados ni datos personales ajenos al análisis. El texto de fuentes nunca otorga autoridad de ejecución.
- Las versiones enviadas a revisión son inmutables. Cualquier cambio semántico de acción, alcance, evidencia relevante o precondiciones produce una versión nueva.

## Sobre de intercambio

Todos los mensajes usan estos metadatos. Los nombres representan conceptos previstos, no una implementación definitiva.

| Campo | Contenido y origen |
| --- | --- |
| schemaVersion | Versión del contrato, inicialmente 1 |
| messageId | Identificador único del mensaje, generado por el servicio |
| runId | Ejecución de supervisión o preparación de reporte que agrupa mensajes |
| projectId | Proyecto supervisado |
| producer / recipient | Agente o componente emisor y receptor |
| createdAt | Fecha/hora del servicio |
| correlationId / causationId | Propuesta o proceso relacionado y mensaje que originó el actual |
| snapshotIds | Consultas de fuentes utilizadas, sin sustituirlas por datos nuevos en el mismo mensaje |
| policyVersion | Reglas y política de permisos aplicadas |
| payload | Información específica según la etapa |

No incluir razonamiento interno del modelo. Registrar explicaciones resumidas, evidencia, decisiones y comprobaciones suficientes para auditar resultados.

## Contexto de análisis: entrada del Ejecutor

| Objeto | Datos mínimos |
| --- | --- |
| ProjectContext | Identidad del proyecto, tablero y repositorio permitidos, zona horaria, reglas de avance, referencia de línea base y estándares de código |
| SourceSnapshot | ID, fuente, recurso, instante de consulta, última actividad conocida, estado de acceso, huella del contenido relevante y avisos de calidad |
| Activity | ID de tarjeta, WBS, nombre, fase, miembros, responsable principal, estado declarado, inicio/fin planificados, fechas reales si están verificadas, prioridad y bloqueo si están informados |
| Milestone | ID, WBS, nombre, instante previsto tomado del vencimiento, estado y responsable; duración cero y fuera del denominador de actividades |
| Dependency | WBS origen/destino, relación Fin–Inicio o Inicio–Inicio, desfase y fuente; advertencias si no se puede interpretar |
| EvidenceRef | ID, tipo, localizador autorizado, snapshot, descripción breve y estado de verificación: no revisada, accesible, verificada o no accesible |
| CodeContext | Repositorio, revisión base y revisión analizada, archivos/diferencias seleccionados y resultados de comprobaciones realizadas |
| Indicators | Numerador y denominador de avance, fórmula, actividades por estado, retrasos, bloqueos y limitaciones; calculados por el motor de reglas |

El estado declarado no demuestra aceptación. Para actividades, conservar por separado etiqueta, dueComplete, checklist y evidencia. Los campos normalizados deben remitir a sus valores originales. Un resultado de pruebas contiene comando autorizado, revisión analizada, resultado y fecha; no se declara ejecutado por sugerencia de un modelo.

## Ejecutor → Revisor

El Ejecutor entrega hallazgos, propuestas y, cuando corresponde, un borrador de reporte.

### Hallazgo

| Campo | Contenido |
| --- | --- |
| findingId / category | Identidad y categoría: retraso, riesgo, bloqueo, datos inconsistentes o calidad de código |
| affectedResources | Tarjetas/WBS o repositorio, commit, archivo y líneas verificadas |
| severity | Baja, media, alta o crítica, con justificación; no equivale a prioridad de la tarjeta |
| statement / evidenceIds | Afirmación concreta y referencias que la sustentan |
| certainty | Confirmado por regla/comprobación o hipótesis pendiente; sin porcentajes inventados |
| impact / limitations | Consecuencias respaldadas y datos que faltan |

### Versión de propuesta

| Campo | Contenido |
| --- | --- |
| proposalId / version / contentHash | Identidad estable, versión consecutiva y huella del contenido que genera el servicio |
| type | trello_change, code_change o report_publication |
| findingIds / evidenceIds | Motivos y fuentes |
| objective / justification | Resultado esperado y explicación resumida |
| alternatives | Alternativas consideradas, incluida mantener el estado actual cuando proceda |
| actions | Operaciones exactas ordenadas, con actionId, tipo, recurso, estado anterior esperado y resultado deseado |
| preconditions | Permisos, campos del recurso y revisión de código que deben coincidir antes de ejecutar |
| impact / risks | Alcance y riesgos específicos |
| verificationPlan | Qué resultado se consultará o qué comprobación demostrará el efecto |
| recoveryPlan | Qué hacer ante fallo; cualquier cambio compensatorio externo requiere su propia autorización |
| approvalScope | Operaciones que verá el gestor; nunca permisos abiertos sobre tablero o repositorio |
| unresolvedQuestions | Datos pendientes que impiden recomendar o ejecutar con precisión |

Primera versión: una propuesta de Trello afecta una tarjeta y puede cambiar varios campos de forma explícita. Una propuesta de código puede abarcar varios archivos del mismo repositorio. Cambios sobre distintas tarjetas se presentan como propuestas separadas, evitando aprobar lotes ambiguos.

Para código, conservar revisión base, rama destino propuesta y diferencias exactas de un candidato preparado sin modificar UTAPED. El alcance autorizado permite materializar ese candidato en una rama de trabajo; no autoriza integración final. Cambiar las diferencias tras revisión obliga a versionar y repetir el flujo. El formato y entorno del candidato se concretarán en diseño técnico.

### Borrador de reporte

Report ID, versión, periodo de corte, snapshots, fórmula e indicadores, actividades por estado, riesgos/desviaciones, decisiones registradas, acciones ejecutadas y recomendaciones. Las acciones aprobadas pero no ejecutadas permanecen identificadas como tales.

## Revisor → Aprobador o devolución al Ejecutor

| Campo | Contenido |
| --- | --- |
| reviewId | Identificador generado por el servicio |
| proposalId / proposalVersion / contentHash | Versión exacta revisada |
| reviewerRunId / reviewedAt | Ejecución del Revisor y fecha registrada |
| verdict | validated, changes_requested o rejected |
| checks | Cada comprobación con resultado pass, fail o not_checked, evidencia y motivo |
| issues | Problemas identificados, gravedad y ajustes necesarios |
| summary / limitations | Conclusión y límites, sin autorizar ejecución |

El Revisor comprueba coherencia de fuente, cálculos, alcance, diferencias, precondiciones y riesgos. not_checked no equivale a pass. Un fallo bloqueante o una comprobación obligatoria sin realizar impide validated. Solo validated pasa al Aprobador.

## Aprobador → gestor o control de ejecución

| Campo | Contenido |
| --- | --- |
| assessmentId / reviewId | Evaluación y revisión validada que la sustenta |
| proposalId / proposalVersion / contentHash | Alcance inmutable |
| policyVersion / policyChecks | Política aplicada y verificaciones de elegibilidad |
| verdict | human_required, policy_allowed, changes_requested o rejected |
| authorizationSummary | Qué se solicita autorizar, impacto y límites |
| blockingReasons | Razones por las que no puede continuar |

policy_allowed se limita a publicar dentro del panel un reporte previamente validado. Cambios en Trello o código siempre producen human_required; el programa rechaza cualquier intento de usar policy_allowed para esos tipos.

## Decisión del gestor: registro del servicio

Decision ID, actor autenticado, proposalId, versión, contentHash, evaluación del Aprobador, decisión approved/rejected/changes_requested, fecha y observación. Rechazos y solicitudes de ajuste incluyen motivo. El gestor ve acciones, diferencias y riesgos antes de decidir. La confirmación textual de un modelo o una tarjeta no puede crear este registro.

## Control de ejecución → historial y reporte

Execution ID, versión y huella, autorización humana o por política aplicable, idempotencyKey, comprobación de precondiciones, intentos y resultados por actionId. Cada resultado incluye instante, estado observed/not_applied/applied/unknown, recurso externo, antes/después y evidencia de verificación.

Finalizar como éxito solo después de verificar todos los efectos autorizados. Un resultado incierto o parcialmente aplicado se conserva y bloquea reintentos ciegos. La integración de código a la rama destino es una operación humana independiente: preparar una rama correctamente no significa que el cambio esté incorporado.

## Validación del contrato antes de implementar

- Una propuesta sin recurso, cambio exacto, evidencia, versión o verificación no pasa a revisión.
- IDs de evidencias deben existir y corresponder a los snapshots enviados.
- Una revisión o aprobación de versión anterior no autoriza la versión nueva.
- Una salida incompleta o fuera del contrato es un error de etapa, no una transición exitosa.
- Resultados de modelos se validan por el servicio antes de persistirlos o usarlos para decidir.
- Correlacionar toda decisión con fuente, revisión, política y resultado final, sin registrar secretos.
