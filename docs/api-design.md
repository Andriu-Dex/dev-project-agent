# API implementada del panel y servicio

Prefijo `/api/v1`. El servicio Fastify registra rutas y esquemas de cada módulo; esos archivos son la referencia ejecutable. La [API prevista inicialmente](archive/planning/api-design.md) conserva propuestas históricas que no deben usarse como lista actual de endpoints.

## Convenciones

Lecturas requieren sesión y membresía cuando corresponda; las mutaciones del proyecto exigen gestor, origen permitido y CSRF. Login y operaciones sensibles tienen límites de frecuencia. Las rutas validan esquemas y rechazan propiedades adicionales. Los errores mostrados al usuario están en español y no exponen secretos o trazas internas.

Las mutaciones versionadas utilizan `expectedVersion` o `expectedRevision`; las operaciones idempotentes usan `requestKey`. Reutilizar una clave con otro contenido produce conflicto. Recibir una aprobación no implica ejecutar un cambio ni publicar un reporte externamente.

## Familias de rutas

| Familia | Función y referencia |
| --- | --- |
| `/health` | Salud del servicio y conexión a PostgreSQL. |
| `/session` | Estado de sesión; login/logout bajo esa familia. [Autenticación](authentication.md). |
| `/projects/:projectId` | Recursos limitados por membresía del proyecto. |
| Trello y seguimiento | Consultas/importación/sincronización, configuración e indicadores. [Trello](trello-integration.md), [reglas](tracking-rules.md). |
| Supervisión y línea base | Solicitudes persistidas, resultados e historial. [Supervisión](supervision.md). |
| `/projects/:projectId/proposals` | Preparación, versiones, recuperación, decisiones y vigencia. [Agentes](agent-workflow.md). |
| Ejecución Trello | Solicitud confirmada, detalle y reconciliación. [Ejecución](trello-execution.md). |
| `/projects/:projectId/code-review` | Catálogo, análisis, propuestas de código, decisiones, simulación y publicación real separadas. [Código](code-review.md), [GitHub](github-publication.md). |
| `/projects/:projectId/code-review/coverage` | Inventario, paginación, límites, start/pause/retry y evidencia. [Cobertura](repository-coverage.md#api). |
| `/projects/:projectId/reports` | Cortes, revisiones, programación y salida imprimible. [Reportes](weekly-reports.md). |
| `/projects/:projectId/operations` | Programación de lecturas y revisión de código. [Operación](project-operations.md). |
| `/projects/:projectId/alerts` | Alertas y seguimiento con evidencia vigente. [Operación](project-operations.md). |
| `/projects/:projectId/notifications` | Preferencias, verificación SMTP y prueba confirmada. [Notificaciones](notifications.md). |
| ChatGPT y Ollama | Estado, autorización cuando procede, modelos y evaluaciones. [Proveedores](agent-providers.md), [renovación](renewable-access.md). |

Los nombres de familias descriptivas de la tabla no inventan endpoints: consultar el documento del módulo o sus `routes.ts` para verbos, parámetros y cuerpos exactos. No existe una ruta de ejecución libre de comandos del repositorio ni una ruta de merge automático.

## Contratos y permisos

[packages/contracts/src/index.ts](../packages/contracts/src/index.ts) comparte vistas/tipos; los esquemas de rutas y validadores del servidor aplican los controles en ejecución. No confiar en tipos TypeScript como autorización. El frontend oculta acciones de gestor a lectores, pero la decisión final siempre la toma el servidor.

Las claves, versiones y estados se enlazan con proyecto, actor y contenido sellado. Fuente modificada, aprobación obsoleta, revocación o resultado incierto impiden un reintento ciego. Los límites y la paginación de cada listado son explícitos; el historial completo de la base no implica que todos sus registros estén en una sola respuesta.

## Ampliación 1.1

Se añaden `/projects/:projectId/assistant` (historial privado e interpretación sin ejecución implícita), `/work-progress` bajo proyecto, `/report-template`, filtros/paginación de reportes, vista previa de notificaciones y preparación de reversiones. El retiro de PR utiliza planes en `/code-review/recoveries`, con acciones distintas de aprobación, ejecución, retirada y reconciliación. Las mutaciones conservan sesión, ámbito de proyecto, CSRF y permisos del gestor. Las tarjetas del chat remiten a rutas de dominio; una respuesta del modelo no puede otorgar aprobación ni escoger una URL libre. Consulte la [guía 1.1](version-1.1-guide.md) y las rutas implementadas para sus esquemas exactos.
