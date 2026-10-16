> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

# Pantallas del gestor

Diseño funcional del 7 de octubre de 2026; sin prototipos ejecutables ni desarrollo de interfaz. Corresponde al [modelo de datos](../../data-model.md) y al [flujo de propuestas](proposal-workflow.md).

## Usuarios, navegación y presentación

Gestor: Steven, con permisos para decidir propuestas y administrar configuración. Integrantes: consulta de información del proyecto. Identidad local autenticada, vinculación a proyecto y acceso a proveedores de IA son conceptos separados; «conectar ChatGPT» no concede rol de gestor.

Navegación inicial: Resumen, Actividades y riesgos, Código, Propuestas, Reportes, Historial y Configuración. UTAPED figura como proyecto activo; no se construye selector ni alta de múltiples proyectos en la primera entrega. Interfaz en español, fechas America/Guayaquil, estados explicados sin exponer identificadores internos como texto principal.

Todas las pantallas muestran datos faltantes, última consulta válida y estado de actualización. Estado vacío, carga, error de acceso y datos desactualizados tienen mensajes diferentes. Los errores no revelan secretos o respuestas crudas de proveedores. Navegación por teclado, etiquetas visibles y estados que no dependan solo de color.

## 1. Acceso

| Elemento | Definición |
| --- | --- |
| Objetivo | Autenticar al usuario y resolver su pertenencia y rol |
| Datos | User, ProjectMembership y sesión segura por definir |
| Acciones | Iniciar/cerrar sesión; recuperación según mecanismo técnico acordado |
| Restricción | No autorregistro como gestor ni autoridad por nombre o perfil de Trello |
| Resultado | Entrar a UTAPED con capacidades del rol; si no hay pertenencia, acceso denegado |

El diseño técnico propone cuentas locales con contraseña y sesiones de servidor en PostgreSQL; alta inicial y recuperación mediante administración local, sin autorregistro. Véase [diseño técnico](technical-design.md). No mostrar un inicio de sesión ficticio como funcional ni usar sesiones de ChatGPT como sustituto del control local.

## 2. Resumen del proyecto

| Elemento | Definición |
| --- | --- |
| Información | Avance declarado con fórmula y denominador, actividades por estado, hitos aparte, riesgos, bloqueos, propuestas que esperan decisión y último reporte |
| Datos | ProjectConfigVersion, observaciones actuales, Finding, ProposalVersion, ReportVersion, SourceSnapshot y SupervisionRun |
| Acciones de consulta | Abrir actividad, riesgo, propuesta, reporte o detalle de última supervisión |
| Acción de gestor | Solicitar actualización/análisis manual; no modifica Trello o código |
| Estados especiales | Sin primera consulta, fuente caída, IA no disponible o revisión pendiente; mostrar última información válida y sus límites |

El avance inicial observado es 56 %, pero la pantalla deberá calcularlo de la consulta vigente, no fijarlo en código. Evitar sumar una actividad bloqueada y retrasada dos veces como si fueran dos tareas.

## 3. Actividades y riesgos

Lista con WBS, nombre, fase, responsable, estado, inicio/fin planificados, alerta de plazo, prioridad si existe y situación de evidencia. Filtros por fase, estado, responsable, retraso, riesgo y datos incompletos. Actividades e hitos pueden consultarse en vistas separadas; referencias e históricos no integran el avance operativo.

Detalle de actividad: valores nativos y normalizados, dependencias y su tipo, comparación con línea base, checklist, evidencia y verificación, observaciones históricas, hallazgos y propuestas relacionadas. Si el responsable descrito no está asignado, mostrar discrepancia sin resolverla silenciosamente.

Datos: WorkItem, WorkItemObservation, WorkItemAssignment, DependencyObservation, BaselineItem, EvidenceRef y Finding.

Acción del gestor: solicitar análisis de un problema. Si produce una modificación, se presenta como propuesta para revisión; no hay edición directa de fechas o responsables desde esta pantalla. Todos pueden abrir referencias externas permitidas y ver la información según sus permisos.

## 4. Revisión de código

Lista de análisis con fecha, repositorio, revisiones comparadas, archivos analizados y resultado. Detalle: hallazgos por gravedad/categoría, archivo y líneas en commit concreto, evidencia, comprobaciones pass/fail/no realizadas y recomendaciones.

Datos: CodeAnalysis, CheckResult, Finding, EvidenceRef y CodeChangeArtifact. El gestor puede solicitar un análisis manual de un alcance permitido. Los integrantes consultan. No permitir un comando libre para ejecutar código del repositorio.

Una propuesta de cambio abre su detalle de aprobación. Mostrar candidato y diferencias exactas; antes de ejecución no afirmar que existe rama externa. Después, mostrar rama preparada y estado de integración humana por separado. Si el análisis cubre solo cambios, declararlo sin afirmar que revisó todo el código.

## 5. Bandeja de propuestas

Priorizar las que esperan decisión humana, pero permitir consultar todas mediante filtros de tipo, estado, fecha y gravedad. Mostrar título comprensible, recurso, versión, etapa, motivo y última transición. Las propuestas devueltas o fallidas no desaparecen.

Datos: Proposal, ProposalVersion, Review, PolicyAssessment y WorkflowTransition. Abrir detalle es consulta; no aprobar lotes de tarjetas desde la bandeja ni usar un botón genérico que autorice cambios todavía no revisados.

## 6. Detalle de propuesta y decisión

Orden de lectura previsto:

1. Problema, recurso y versión vigente, con última consulta relevante.
2. Cambio exacto antes/después; para código, diferencias y revisión base.
3. Evidencia, alternativas, impacto y riesgos.
4. Resultado del Revisor y evaluación del Aprobador, con comprobaciones y límites.
5. Acciones disponibles para el estado y rol.
6. Ejecución/verificación e historial de versiones y decisiones.

| Estado visible | Acciones del gestor | Comportamiento |
| --- | --- | --- |
| Preparando / en revisión | Consultar | No aceptar antes de validación y política |
| Esperando tu decisión | Aprobar, rechazar, solicitar ajustes | Mostrar alcance completo antes de enviar decisión; rechazo y ajustes requieren motivo |
| Autorizada / en ejecución | Consultar; revocar antes de iniciar si sigue autorizada | Revocar queda registrado; no presentar revocación como cancelación garantizada de una operación ya iniciada |
| Ejecutada | Ver resultado y verificación | No ejecutar de nuevo la misma autorización |
| Requiere ajustes / rechazada / invalidada | Consultar motivo y versiones | No reactivar aprobación vieja; ajustes generan versión nueva |
| Fallo sin efectos | Ver error; solicitar reintento sujeto a nueva comprobación | Servicio decide elegibilidad, no el botón |
| Resultado incierto o parcial | Solicitar comprobación del resultado | No ofrecer reintento ciego ni reversión automática |

Los integrantes de consulta no tienen botones de decisión, y el servicio también rechaza llamadas no autorizadas. Una pantalla abierta antes de una nueva versión muestra aviso al decidir: no aplica la decisión a la versión nueva automáticamente. Deshabilitar doble envío en interfaz y garantizar unicidad desde el servicio.

Aprobar es la confirmación del cambio que ya se está viendo, sin pedir la misma aprobación en varios diálogos. La confirmación muestra el registro de decisión y luego el progreso real de ejecución. La programación exacta de ejecución tras aprobar se concretará técnicamente; ningún estado implica éxito antes de verificar.

## 7. Reportes

Lista por periodo con edición, estado de revisión/publicación y fecha real de generación. Los reportes publicados se distinguen de borradores y pendientes. Detalle: fórmula de avance, actividades por estado, riesgos, desviaciones, acciones propuestas/aprobadas/rechazadas/ejecutadas, recomendaciones y fuentes a fecha de corte.

Datos: Report, ReportVersion, propuesta de publicación, snapshots y métricas congeladas. Se muestran correcciones como ediciones relacionadas, sin reescribir informes históricos.

El gestor puede solicitar recuperar un reporte pendiente. Publicación interna automática solo tras revisión y política válidas. No añadir envíos de correo, mensajería o publicación externa. Formato de descarga pendiente: no ofrecer botones PDF/Excel hasta decidir su alcance.

## 8. Historial y estado de ejecuciones

Línea temporal filtrable por actividad/propuesta, actor, fecha y resultado. Permite reconstruir fuente → hallazgo → propuesta/versión → revisión → política → decisión → intento → verificación.

Datos: AuditEvent, WorkflowTransition, AgentRun, HumanDecision, AuthorizationRevocation, ExecutionAttempt, ActionResult y Reconciliation. Cada evento muestra motivo y evidencia saneada cuando corresponda. No exponer razonamiento interno, tokens o logs completos por defecto.

Mostrar última supervisión correcta, fallo de conexión o cuota y tareas recuperadas después de reinicio. Una falla operativa se distingue de propuesta rechazada. Usuarios de consulta ven auditoría funcional; diagnóstico sensible de conexiones se limita al gestor.

## 9. Configuración del proyecto

Secciones: tablero/repositorio autorizados; mapeo de fases/estados; fórmula y umbrales; gestor y miembros; proveedor de IA; calendario de consultas y reporte; línea base y estándares de código.

Datos: ProjectConfigVersion, Connection, ExternalIdentity, ProjectMembership, BaselineVersion y ScheduledJob. El gestor puede cambiar únicamente opciones implementadas y validadas, con registro del antes/después; otros integrantes ven configuración no sensible. No ofrecer editor de JSON libre ni mostrar tokens almacenados.

Las conexiones muestran estado conectado/no conectado/error y fecha de comprobación. Conectar, sustituir o revocar credenciales son acciones explícitas del gestor; no se envían al modelo. Cambios de configuración generan una versión y avisan si invalidan propuestas pendientes. Modificar estas opciones no cambia automáticamente fechas ni etiquetas de Trello.

Alta de proyectos, organizaciones, facturación, marketplace de agentes y administración de infraestructura quedan fuera del panel de noviembre.

## Criterios de revisión de estas pantallas

- Cada valor mostrado identifica fuente y antigüedad cuando afectan su interpretación.
- El gestor puede comprender qué aprobará sin leer mensajes internos de agentes.
- El estado humano «aprobada» se diferencia de «ejecutada y verificada».
- Sin datos, error, desactualización y falta de permiso se presentan como situaciones distintas.
- Ninguna pantalla permite eludir revisión, cambiar propuestas selladas o integrar código automáticamente.
- Los recorridos de [validación funcional](manager-workflows.md) se pueden representar con los datos previstos.
