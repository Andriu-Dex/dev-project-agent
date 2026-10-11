# API prevista del panel y servicio

Diseño objetivo del 7 de octubre de 2026. Las rutas ya implementadas se documentan en [autenticación](authentication.md), [Trello](trello-integration.md), [reglas de seguimiento y configuración versionada](tracking-rules.md), [supervisión, línea base e historial](supervision.md) y [conexión/evaluación de ChatGPT](provider-validation.md). El resto sigue siendo diseño previsto. Complementa [diseño técnico](technical-design.md), [contratos](data-contracts.md) y [pantallas](manager-screens.md).

## Convenciones

Base /api/v1. JSON, campos técnicos en inglés y mensajes de usuario en español. IDs internos opacos; instantes ISO 8601 UTC y zona del proyecto por separado. Listados paginados con cursor y límite acotado, filtros permitidos explícitamente. No exponer respuestas crudas de proveedores.

Autenticación mediante sesión en cookie, CSRF en operaciones de modificación y permiso por proyecto. GET no modifica datos externos. La creación de un trabajo requiere POST y permiso manager; no ejecutar análisis costoso al abrir una pantalla.

Los resultados de consulta incluyen fecha de captura, estado de actualización y limitaciones donde corresponda. Error con code, message y requestId; details solo para errores de campos seguros. Registro del servidor puede ampliar contexto saneado, sin devolver stack al navegador.

## Sesión y proyecto

| Método y ruta | Permiso | Resultado |
| --- | --- | --- |
| GET /session | Público, información mínima | Usuario y capacidades si autenticado; en otro caso authenticated=false; token CSRF según sesión |
| POST /session/login | Público con origen y límite de intentos | Crea/rota sesión; no devuelve token de acceso en JSON |
| POST /session/logout | Autenticado + CSRF | Invalida sesión y cookie |
| GET /projects/current | Autenticado con membresía | Proyecto UTAPED y capacidades; no alta de proyectos |
| GET /projects/:projectId/summary | Miembro | Indicadores, alertas, pendientes y estado de fuentes |

El acceso inicial y recuperación son procedimientos de administración local, no endpoints públicos de registro o reset. Una sesión anónima mínima para CSRF no otorga membresía ni acceso a datos.

## Actividades, hallazgos y análisis

| Método y ruta | Permiso | Resultado |
| --- | --- | --- |
| GET /projects/:projectId/work-items | Miembro | Actividades/hitos filtrados, con estado, fecha y responsable |
| GET /projects/:projectId/work-items/:itemId | Miembro | Observación actual, línea base, dependencias y evidencia |
| GET /projects/:projectId/findings | Miembro | Hallazgos por tipo, gravedad y situación |
| GET /projects/:projectId/findings/:findingId | Miembro | Evidencias, límites y propuestas relacionadas |
| POST /projects/:projectId/supervision-runs | Gestor + CSRF | 202, trabajo de actualización/análisis con alcance permitido |
| GET /projects/:projectId/runs/:runId | Miembro | Progreso, errores saneados y resultados |
| POST /projects/:projectId/code-analyses | Gestor + CSRF | 202, análisis de referencias/archivos permitidos |
| GET /projects/:projectId/code-analyses | Miembro | Historial paginado de análisis |
| GET /projects/:projectId/code-analyses/:analysisId | Miembro | Commits comparados, hallazgos y comprobaciones realizadas |

No aceptar comandos libres, rutas de sistema arbitrarias o URLs de repositorio elegidas por el modelo. Un requestId de trabajo no demuestra ejecución exitosa.

## Propuestas y decisiones

| Método y ruta | Permiso | Resultado |
| --- | --- | --- |
| GET /projects/:projectId/proposals | Miembro | Bandeja con filtros de tipo/estado |
| GET /projects/:projectId/proposals/:proposalId | Miembro | Versión activa y referencias a historial |
| GET /projects/:projectId/proposals/:proposalId/versions/:version | Miembro | Contenido sellado, revisión, política, decisiones y resultado |
| POST /projects/:projectId/proposals/:proposalId/versions/:version/decisions | Gestor + CSRF | Decisión approved/rejected/changes_requested sobre huella y estado concretos |
| POST /projects/:projectId/authorizations/:authorizationId/revocations | Gestor + CSRF | Revocación solo antes de iniciar ejecución; conflicto si ya empezó |
| POST /projects/:projectId/executions/:executionId/retry-requests | Gestor + CSRF | 202 si el servicio valida ausencia de efectos y autorización vigente |
| POST /projects/:projectId/executions/:executionId/reconciliation-requests | Gestor + CSRF | 202, comprobación del resultado sin repetir escritura |
| GET /projects/:projectId/executions/:executionId | Miembro | Intentos, acciones y verificaciones; integración humana aparte |

La decisión incluye expectedContentHash, expectedState, decision y motivo obligatorio para rechazar/pedir ajustes. El actor y la autoridad se derivan de sesión y membresía; nunca se confía en actorId o role enviados por cliente.

Cabecera Idempotency-Key en decisiones y solicitudes de trabajos: misma clave, usuario, proyecto, operación y cuerpo devuelve el resultado previamente registrado; reutilizar clave con otro cuerpo produce conflicto. No confundir esta deduplicación HTTP con la idempotencia de ejecución externa, que tiene registro propio.

Decisión confirmada para la implementación: la aprobación registra decisión y autorización en la misma transacción local, sin crear un trabajo de ejecución. El gestor solicita la ejecución por separado con confirmación explícita; esa solicitud persiste la intención antes de cualquier escritura externa. Si se rechaza o pide ajustar, no se agenda modificación externa. Un intento concurrente o versión obsoleta devuelve 409 y exige refrescar el detalle, sin reaplicar la decisión a otra versión.

No hay endpoint genérico para cambiar state, ejecutar herramientas arbitrarias, escribir directo a Trello, modificar diferencias selladas o integrar ramas.

## Reportes, auditoría y configuración

| Método y ruta | Permiso | Resultado |
| --- | --- | --- |
| GET /projects/:projectId/reports | Miembro | Periodos, ediciones y estado de publicación |
| GET /projects/:projectId/reports/:reportId/versions/:version | Miembro | Reporte congelado y estado de revisión |
| POST /projects/:projectId/report-recovery-requests | Gestor + CSRF | 202, recuperación de un corte ya previsto y faltante; no publicar sin revisión |
| GET /projects/:projectId/audit-events | Miembro | Historial funcional saneado y paginado |
| GET /projects/:projectId/config | Miembro | Configuración vigente sin secretos; campos administrativos filtrados |
| POST /projects/:projectId/config-versions | Gestor + CSRF | Nueva configuración con versión esperada; invalidaciones y trabajos relacionados |
| GET /projects/:projectId/connections | Miembro, detalle limitado por rol | Recursos y estado; sin credenciales |
| POST /projects/:projectId/connections/:connectionId/checks | Gestor + CSRF | 202, comprobación de conexión permitida |

Las rutas de conectar/renovar credenciales se definirán tras validar el flujo oficial de cada proveedor y el almacén seguro. No crear una ruta genérica que capture tokens de navegador ni pretender que la configuración saneada contiene credenciales utilizables.

## Respuestas y permisos

| Código | Uso previsto |
| --- | --- |
| 200 / 201 | Consulta/decisión registrada o recurso creado |
| 202 | Trabajo persistido, pendiente o en ejecución; no significa efecto externo completado |
| 400 | Estructura, enum o campo inválido |
| 401 | Sesión ausente o vencida |
| 403 | Miembro sin capacidad, CSRF u origen inválido |
| 404 | Recurso inexistente o fuera del proyecto accesible, sin filtrar existencia ajena |
| 409 | Versión/estado desactualizado, clave repetida con otro contenido o concurrencia |
| 429 | Límite de solicitudes propias alcanzado |
| 503 | Servicio requerido no disponible para una operación síncrona |

Errores de proveedores durante trabajo asíncrono quedan en el estado del trabajo; no se transforma un trabajo creado en una respuesta HTTP retroactiva. Si no se puede persistir el trabajo, no devolver 202.

## Actualización del panel y validación futura

Consultar estado de trabajos mediante polling acotado mientras la pantalla lo necesite; detener al completar o abandonar. No incorporar WebSockets en esta versión. Solicitudes concurrentes no deben sustituir contenido nuevo por una respuesta vieja.

Antes de implementar: crear esquemas de entrada/salida, validar estados y permisos, probar idempotencia y casos 401/403/404/409, y verificar que ningún JSON de respuesta exponga secretos. El catálogo puede ajustarse al detallar cada módulo, conservando las condiciones y la trazabilidad aquí definidas.

## Endpoints implementados de propuestas

Todos requieren sesión y pertenencia al proyecto; las mutaciones requieren gestor vigente, origen permitido y CSRF. Las rutas se encuentran bajo `/api/v1/projects/:projectId`. No se acepta un prompt libre ni una URL de inferencia elegida por el cliente.

| Método | Ruta relativa | Resultado |
| --- | --- | --- |
| GET | `/proposals` | Últimas 30 propuestas y trabajos |
| GET | `/proposals/:proposalId/versions/:version` | Fuente congelada, contenido, mensajes y decisiones |
| POST | `/proposals` | Inicia tres etapas; devuelve trabajo (202) |
| POST | `/proposals/:proposalId/versions/:version/resume` | Continúa etapas pendientes por solicitud explícita (202) |
| POST | `/proposals/:proposalId/versions/:version/recheck` | Comprueba vigencia local; invalida si cambiaron datos relevantes |
| POST | `/proposals/:proposalId/versions/:version/decisions` | Registra decisión sobre huella y versión exactas |

Preparación: `sourceRunId`, `cardId`, `requestedDue` ISO, `goal` (1000 caracteres), `model`, `requestKey` UUID y `reasoningEffort` opcional. Para una corrección: `proposalId` y `expectedVersion` obligatorios juntos; solo última versión en `changes_requested` o `invalidated`. Continuación: `model`, `requestKey`, `reasoningEffort` opcional. Decisión: `contentHash`, `decision` (`approved`, `rejected`, `changes_requested`), `reason` y `requestKey`. Motivo obligatorio para rechazo/ajuste. La misma clave devuelve el resultado original; si cambia el contenido, 409. Nunca reutilizar una clave para otra operación.

`SOURCE_CHANGED` exige nueva lectura/supervisión; `CONFLICT` exige actualizar el estado. Una decisión contra fuente desactualizada devuelve `invalidated=true` sin guardar aprobación. Fallos de IA ocurridos tras aceptar el trabajo se consultan en su historial, con códigos saneados y sin reintento automático. No existe endpoint para ejecutar Trello ni para generar, integrar o publicar código.


## API implementada de ejecución

La octava tanda concreta las rutas y cuerpos de solicitudes, retirada y reconciliación en [ejecución controlada](trello-execution.md#persistencia-y-api). Usa `requestKey` en el cuerpo para deduplicación; los nombres conceptuales de la tabla inicial y su cabecera `Idempotency-Key` siguen siendo diseño histórico, no endpoints implementados. Aprobar una demostración nunca habilita escritura, incluso si luego se cambia la configuración del entorno.


## API implementada de revisión de código

La novena tanda añade rutas bajo `/api/v1/projects/:projectId/code-review` para catálogo, análisis, correcciones versionadas, recuperación explícita, decisión humana, retirada y simulación. Los cuerpos, permisos y estados concretos se describen en [revisión de código](code-review.md#persistencia-y-api). No existe ruta de publicación real ni integración GitHub; aprobar solo habilita registrar una simulación local. Las declaraciones anteriores de funciones pendientes corresponden al estado histórico de cada tanda.
