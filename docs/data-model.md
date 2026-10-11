# Modelo conceptual de datos de PostgreSQL

Diseño del 7 de octubre de 2026. Entrega inicial: UTAPED, un tablero y un repositorio, cuatro integrantes y un gestor autorizado. Este documento define entidades, relaciones y restricciones; no contiene SQL, migraciones ni un esquema físico definitivo.

Referencias: [contratos entre agentes](data-contracts.md), [estados del flujo](proposal-workflow.md) y [pantallas](manager-screens.md).

## Criterios de diseño

- PostgreSQL pertenece al agente y no comparte tablas ni credenciales con UTAPED.
- Datos de negocio separados por projectId desde el inicio. Esto prepara adaptación futura, pero no implementa una plataforma para múltiples organizaciones.
- Identificadores internos estables independientes de IDs externos y códigos WBS. Los WBS pueden cambiar o repetirse en fuentes; la importación debe reportar discrepancias, no perder registros.
- Separar identidad del recurso, observaciones históricas, estado actual y línea base. Una consulta nueva no cambia evidencias ya revisadas.
- Propuestas selladas y decisiones son inmutables. El estado de flujo puede avanzar mediante transiciones auditadas.
- Estados, permisos, referencias y campos consultables se conservan de forma relacional. Contenido variable de snapshots, configuración, comprobaciones y diferencias puede almacenarse como documento validado, sin reemplazar relaciones esenciales por texto libre.
- Datos ausentes permanecen ausentes. Los indicadores de avance y atraso se calculan; los resultados usados en un reporte se conservan junto a fórmula y fuentes.

## 1. Identidad, proyecto y configuración

| Entidad conceptual | Datos principales | Relaciones y finalidad |
| --- | --- | --- |
| User | ID, nombre visible, identificador de acceso, estado de cuenta | Identidad humana local autenticada; no equivale a un miembro de Trello |
| Project | ID, nombre, zona horaria, estado, configuración activa | Raíz de datos de UTAPED; una configuración activa |
| ProjectMembership | Proyecto, usuario, rol manager/viewer, vigencia | Un rol vigente por usuario/proyecto; identidad y autoridad comprobadas por el servicio |
| ExternalIdentity | Fuente, ID externo, nombre observado, usuario local opcional, estado de vinculación | Permite mapear responsables; una coincidencia de nombre no confirma identidad |
| ProjectConfigVersion | Proyecto, número, esquema, reglas de estado/avance, política, calendario de reportes, estándares, creador, fecha | Versiones inmutables; referencia desde propuestas, consultas y reportes |
| Connection | Proyecto, tipo trello/github/model, identificador del recurso permitido, estado, referencia al secreto | No contiene tokens ni contraseñas; el secreto permanece protegido fuera de las tablas |

El rol de gestor se asigna a Steven tras vinculación autenticada. Otros integrantes son viewer inicialmente. Los perfiles externos sin usuario local pueden existir para representar responsables sin concederles acceso al agente. No se conceden permisos por ser administrador del tablero.

Cambiar configuración o credenciales es una operación humana explícita de administración, separada de las propuestas automáticas de negocio. Versionar cambios de reglas e invalidar autorizaciones afectadas. El alta inicial de usuarios y la autenticación se concretarán en diseño técnico; no habrá autorregistro con rol de gestor.

## 2. Fuentes, actividades, hitos y línea base

| Entidad | Datos principales | Relaciones |
| --- | --- | --- |
| SourceSnapshot | Proyecto/conexión, recurso, fecha de consulta, estado de acceso, huella, contenido mínimo saneado y versión de configuración | Una captura inmutable de la fuente; puede ser parcial o fallida sin simular datos actuales |
| WorkItem | Proyecto, conexión, ID de tarjeta, tipo activity/milestone/reference, última observación válida | Identidad estable de tarjeta; archivada no significa completada |
| WorkItemObservation | Tarjeta, snapshot, WBS, nombre, fase, estado declarado, etiqueta, dueComplete, prioridad/bloqueo informados, fechas planificadas/reales, calidad de datos | Cada observación conserva valores originales y normalizados; admite campos ausentes |
| WorkItemAssignment | Observación, identidad externa, función principal/participant | Miembros y responsable principal diferenciados; una discrepancia se conserva como alerta |
| ChecklistObservation | Observación, checklist/item externo, texto, estado | Evidencia declarada de progreso; no sustituye fecha real ni aceptación formal |
| DependencyObservation | Snapshot, tarjeta destino, predecesora resuelta o WBS pendiente, relación, desfase, fuente | Guarda vínculos Fin–Inicio e Inicio–Inicio; referencias no resueltas se registran sin fabricar una tarjeta |
| BaselineVersion | Proyecto, número, fuente, fecha, declaración de aprobación, verificación y usuario confirmante si existe | Línea base explícita, separada del estado observado; una declaración del tablero no se convierte en acta verificada |
| BaselineItem | Línea base, tarjeta, WBS, alcance, fechas, tipo y peso si acordado | Valores congelados de referencia; posteriores sincronizaciones no los reemplazan |
| BaselineDependency | Línea base, elementos origen/destino, tipo y desfase | Preserva relaciones utilizadas para evaluar desviaciones históricas |
| EvidenceRef | Proyecto, snapshot o artefacto, localizador, tipo, resumen, estado de verificación, verificador/fecha opcionales | Evidencia vinculable a observaciones, hallazgos y versiones de propuesta |

Relaciones: Project tiene muchas tarjetas y snapshots; WorkItem tiene muchas observaciones; cada observación pertenece a un snapshot. El registro de «estado actual» apunta a la observación completa más reciente válida, mostrando su antigüedad. Una consulta fallida no borra la anterior.

Para hitos, milestoneAt procede del vencimiento y no requiere inicio; duración cero. Para actividades, plannedStartAt y plannedDueAt son independientes de actualStartAt y actualCompletedAt. No inferir fecha real a partir del vencimiento ni del instante en que se importó dueComplete.

Las 25 actividades cuentan en el denominador actual; seis hitos, referencias y archivadas se muestran por separado. El conjunto incluido y la fórmula pertenecen a la configuración y deben acompañar cada cálculo publicado.

## 3. Supervisión y hallazgos

| Entidad | Datos principales | Relaciones |
| --- | --- | --- |
| SupervisionRun | Proyecto, motivo scheduled/manual/recovery, configuración, inicio/fin, estado operativo | Agrupa recopilación, análisis e indicadores; independiente del estado de propuestas |
| AgentRun | Supervisión, rol, proveedor/modelo observado, versión de instrucciones, estado, intentos, fechas, error saneado | Intervención Ejecutor/Revisor/Aprobador; no almacenar razonamiento interno |
| AgentMessage | IDs del sobre, ejecución, emisor/receptor, versión de contrato, payload validado y saneado | Conservar mensajes relevantes para auditoría; enlazar snapshots por relaciones |
| CodeAnalysis | Proyecto, repositorio, revisión base/analizada, selección de archivos, estado, ejecución | Delimita exactamente el código observado |
| CheckResult | Análisis o revisión, comprobación, resultado pass/fail/not_checked, fecha, evidencia y límites | Distingue comprobaciones realizadas de recomendaciones de ejecución |
| Finding | Proyecto, supervisión/análisis, categoría, afirmación, gravedad, certeza, impacto, limitaciones | Un hallazgo enlaza uno o varios recursos y evidencias |
| FindingResolution | Hallazgo, estado open/under_review/resolved/dismissed, motivo, actor/fecha | Conservar historial; una propuesta ejecutada no resuelve automáticamente el hallazgo sin verificarlo |

La búsqueda de hallazgos repetidos usa recurso, categoría y contexto de revisión. No borrar apariciones históricas ni generar alertas idénticas ilimitadas; el detalle de deduplicación se resolverá técnicamente.

## 4. Propuestas, revisión y autoridad

| Entidad | Datos principales | Relaciones |
| --- | --- | --- |
| Proposal | Proyecto, tipo, creador/ejecución, antecedente opcional, versión activa | Identidad estable; una sola versión activa |
| ProposalVersion | Propuesta, número, estado de flujo, contenido/huella, configuración, justificación, riesgos, alternativas, fecha de sellado | Contenido inmutable al salir de draft; estado mutable solo por transición autorizada |
| ProposedAction | Versión, actionId, orden, operación permitida, recurso, antes/después, precondiciones y verificación | Trello: una tarjeta por propuesta; código: un repositorio y varios archivos posibles |
| Review | Versión/huella, ejecución del Revisor, veredicto, comprobaciones, motivos y fecha | Una versión puede tener varios intentos; se identifica la revisión válida usada por política |
| PolicyAssessment | Versión/huella, revisión validada, ejecución del Aprobador, política, veredicto y motivos | Nunca sustituye la decisión humana en cambios externos |
| HumanDecision | Versión/huella, evaluación, usuario y rol autenticados, decisión, motivo, fecha | Registro inmutable; duplicados de petición no crean dos aprobaciones |
| Authorization | Versión, alcance/huella, revisión y evaluación, origen human/policy, decisión humana si aplica, fecha | Registra la habilitación exacta de ejecución; política interna solo para reportes |
| AuthorizationRevocation | Autorización, actor, motivo y fecha | Revocar sin borrar la aprobación histórica |
| WorkflowTransition | Versión, de/a estado, actor humano/componente, causa, fecha | Historial de cambios de estado validado por el servicio |

Las relaciones muchos-a-muchos ProposalVersion–Finding, ProposalVersion–EvidenceRef y ProposalVersion–SourceSnapshot preservan qué evidencia sustentó cada versión. Cada vínculo debe pertenecer al mismo proyecto. contentHash no reemplaza autorización ni autenticación: sirve para comprobar identidad del contenido sellado.

## 5. Ejecución, reportes y auditoría

| Entidad | Datos principales | Relaciones |
| --- | --- | --- |
| Execution | Versión, autorización, clave de idempotencia, estado, fechas | Ejecución lógica única del alcance autorizado; reintentos no crean autorizaciones nuevas |
| ExecutionAttempt | Ejecución, número, control de concurrencia, fechas, error y resultado | Distingue interrupción, fallo confirmado y resultado desconocido |
| ActionResult | Intento, acción, resultado, antes/después, recurso externo y verificación | Conservar efectos parciales y evidencia; no reintentar sin reconciliar |
| Reconciliation | Ejecución/acción, responsable, consulta, resultado y fecha | Acredita cómo se resolvió un resultado incierto |
| CodeChangeArtifact | Versión, referencia protegida al candidato y huella, commit base, rama preparada, revisión resultante, integrationStatus | Candidato aprobado no equivale a integración; un artefacto no puede cambiar sin nueva versión |
| Report | Proyecto, tipo y periodo de corte, edición vigente publicada si existe | Identidad del reporte semanal; único por proyecto/tipo/periodo |
| ReportVersion | Reporte, edición, snapshots, configuración, métricas congeladas, contenido, propuesta de publicación y fecha | Inmutable al enviar a revisión; una corrección crea edición nueva |
| ScheduledJob | Proyecto, tipo, configuración/calendario, próxima ejecución y estado | Supervisión periódica y reporte semanal; intervalos de consulta todavía pendientes |
| JobOccurrence | Trabajo, corte programado, supervisión asociada, intentos, resultado | Único por trabajo/corte; permite recuperar tareas tras apagar el equipo |
| AuditEvent | Proyecto, actor/tipo, acción, recurso, versión, correlación, fecha y resultado saneado | Registro de operaciones y denegaciones; sin secretos ni payloads completos innecesarios |

ReportVersion conserva cantidades, fórmula y decisiones a fecha de corte: una aprobación posterior no reescribe el informe histórico. La publicación usa el mismo flujo y una Authorization de origen policy permitida. Los fallos dejan una edición pendiente, no una edición publicada falsa.

## Relaciones principales

| Origen | Cardinalidad | Destino |
| --- | --- | --- |
| Project | 1 a muchos | Configuraciones, conexiones, tarjetas, supervisiones, propuestas y reportes |
| User | muchos a muchos mediante ProjectMembership | Project |
| WorkItem | 1 a muchos | WorkItemObservation |
| SourceSnapshot | 1 a muchos | Observaciones y evidencias de esa consulta |
| Proposal | 1 a muchos | ProposalVersion |
| ProposalVersion | 1 a muchos | Acciones, revisiones, evaluaciones, decisiones y transiciones |
| Authorization | 1 a 0..1 | Execution lógica |
| Execution | 1 a muchos | Intentos, resultados y reconciliaciones |
| Report | 1 a muchos | ReportVersion |
| ReportVersion | 1 a 1 al enviar a revisión | ProposalVersion de publicación |

## Integridad y concurrencia que deberá aplicar la implementación

1. Claves únicas: conexión+ID externo de tarjeta; proyecto+número de configuración; propuesta+número de versión; reporte+edición; trabajo+corte. La unicidad de WBS se valida como calidad de datos en cada conjunto, sin rechazar toda la captura por un WBS repetido.
2. Ninguna referencia puede cruzar proyectos. Usar relaciones y restricciones que verifiquen projectId, además de permisos desde el servicio.
3. Propuesta activa, huella, revisión, evaluación y autorización deben corresponder a la misma versión. Estados terminales no vuelven a edición.
4. Tomar control de una transición o ejecución mediante transacción y bloqueo/versión de registro. Dos aprobaciones concurrentes no pueden ganar sobre el mismo estado pendiente.
5. Guardar estado, decisión/autorización y evento asociado en una misma transacción local. Para una escritura externa, persistir intención antes de enviar y resultado después; PostgreSQL no vuelve atómica una operación con Trello/GitHub.
6. Clave de idempotencia única por ejecución lógica; control de intento vigente evita doble ejecución. Recuperar intentos interrumpidos mediante reconciliación.
7. Fechas en UTC con semántica de instante; calendario y zona por proyecto. Desfase laborable conserva unidad y calendario, no se convierte sin reglas en horas naturales.
8. Borrado lógico de usuarios/proyectos cuando tienen historial. No borrar en cascada revisiones, decisiones ni ejecuciones por retirar una conexión. Retención y anonimización se definirán antes de uso real.
9. Auditoría solo de anexado para los permisos normales del servicio. Esto no es una garantía criptográfica contra un administrador de base de datos; no prometer inmutabilidad absoluta.
10. Datos sensibles de candidatos, capturas y evidencias solo accesibles por permisos del proyecto; tokens fuera de la base. Copias de seguridad requieren igual protección.

## Información derivada y diseño físico pendiente

Conexión/evaluación de proveedor implementadas el 11 de octubre: `chatgpt_registrations` guarda host, cliente e identidad por proyecto/usuario, sin tokens; `provider_evaluations` guarda estado, modelo, versión de batería y clave de idempotencia; `provider_evaluation_results` conserva el resultado validado y sus métricas. Una restricción parcial limita a una evaluación activa por proyecto y la relación compuesta impide cruzar resultados entre proyectos. El rol de ejecución solo puede anexar/consultar resultados. Los tokens se mantienen en memoria y no pertenecen al esquema. Véase [proveedor](provider-validation.md).

Actualización del 11 de octubre: las migraciones ya implementadas concretan proyectos, auditoría, cuentas/sesiones/membresías, instantáneas e intentos Trello/GitHub, políticas de seguimiento versionadas, `baseline_versions`, `supervision_jobs`, `supervision_job_events` y `supervision_runs`. Planificación/checklists/dependencias se conservan en el JSON normalizado de cada lectura; una línea base referencia una instantánea inmutable y un resultado guarda sus fuentes, reglas y referencia exactas. Véase [supervisión](supervision.md). Las entidades de agentes y propuestas del primer alcance se incorporaron posteriormente, como se describe a continuación. Ejecuciones externas y reportes siguen pendientes; esta actualización no acredita todo el modelo objetivo.

No crear tablas independientes solo para cada porcentaje o cada texto del panel. Calcular resumen y filtros a partir de observaciones válidas; congelar indicadores en reportes y ejecuciones para reproducibilidad. Estados de flujo y revisiones normalizados; estructuras variables validadas con versión de contrato.

Después de revisar el modelo se elegirá acceso a datos y migraciones, se decidirán índices según consultas reales y se detallarán tablas de vínculo y sesiones. No fijar particiones, microservicios, aislamiento entre organizaciones ni infraestructura de producción en esta entrega.

## Primera persistencia del flujo de agentes

Migración `1791781200000_agent-proposals`: `proposals` identifica la propuesta y su última versión; `proposal_versions` conserva fuente, contexto mínimo, objetivo, fecha solicitada y estado; `proposal_contents` sella contenido validado y huella por versión. `agent_jobs` registra solicitud idempotente, modelo, esfuerzo y estado operativo, con una sola tarea activa por proyecto. `agent_messages` anexa entradas, salidas válidas, errores saneados y métricas por etapa. `proposal_decisions` anexa una decisión del gestor ligada a versión y huella. Referencias compuestas impiden cruzar versiones, supervisiones y mensajes entre proyectos.

El rol de ejecución puede actualizar únicamente `latest_version`, estado de versión y campos de finalización del trabajo; no contexto, contenido, mensajes ni decisiones. Esto protege el historial frente al servicio ordinario; un administrador de PostgreSQL conserva privilegios de administración. La misma migración agrega `provider_evaluations.reasoning_effort`: los registros anteriores quedan en null, que significa predeterminado.


## Persistencia implementada de ejecuciones

La octava tanda agrega `proposals.purpose` inmutable para el servicio (demostración por defecto), `proposal_decisions.actor_auth_version`, `execution_jobs`, `execution_events` y `audit_events.details`. Los intentos referencian la versión y aprobación mediante relaciones compuestas por proyecto; la restricción parcial impide otra ejecución durante una reconciliación pendiente. Solo se actualizan campos de ciclo de vida; aprobación, contenido, intención y evidencia se conservan. Los nuevos estados de propuesta son `executing`, `executed`, `execution_failed` y `reconciliation_required`. Véase [semántica y límites](trello-execution.md).


## Modelo implementado de revisión de código

La migración `1791795600000_code-review.cjs` concreta el módulo separado de revisión/corrección de código. `code_analyses` mantiene solicitudes y estados; `code_sources` congela commit, árbol y archivos; `code_results` conserva hallazgos/comprobaciones; `code_proposals` identifica correcciones demostrativas; `code_versions` conserva objetivos, selección y estados; `code_candidates` guarda diff/contenido/huella; `code_jobs` y `code_messages` registran las tres etapas; `code_decisions` registra gestor, versión de autoridad, decisión y motivo; `code_publications` almacena exclusivamente simulaciones. Claves compuestas y permisos por columna protegen proyecto y evidencia. Este módulo no cambia las propuestas de Trello ni añade tablas para integración automática. Véase [modelo, controles y API](code-review.md#persistencia-y-api).
