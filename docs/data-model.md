# Modelo de datos implementado

PostgreSQL conserva identidad, fuentes, configuración, propuestas, decisiones, ejecuciones y evidencia. Las [migraciones](../migrations) son la referencia física; el [modelo conceptual inicial](archive/planning/data-model.md) se conserva como antecedente y no como inventario de tablas vigentes.

## Familias de datos

| Familia | Registros principales y propósito |
| --- | --- |
| Identidad y proyecto | `projects`, `users`, `project_memberships`, sesiones y versiones de autoridad. |
| Fuentes | Conexiones Trello/GitHub y snapshots inmutables; distinguen origen, fecha observada y consulta/importación. |
| Seguimiento | Políticas versionadas, línea base y resultados de supervisión; actividades e hitos tienen universos distintos. |
| Propuestas Trello | `proposals`, `proposal_versions`, `agent_jobs`, `agent_messages`, `proposal_decisions`; evidencia y acción exacta por versión. |
| Ejecución Trello | `execution_jobs`, `execution_events`; intención, resultado, verificación y reconciliación. |
| Código | `code_analyses`, `code_sources`, `code_results`, propuestas/versiones/candidatos/trabajos/mensajes/decisiones y simulaciones. |
| Publicación GitHub | `github_publication_jobs`, `github_publication_events`; rama/commit/PR y reconciliación. |
| Proveedores | Evaluaciones y resultados; `chatgpt_credentials` guarda sobres cifrados y estado de renovación. |
| Reportes | Versiones de horario, cursores, `report_jobs`, `report_results`; periodos y contenido sellado. |
| Operación y alertas | Configuraciones, cursores, ejecuciones, `project_alerts`, `alert_events`. |
| Correo | `notification_configurations`, `notification_events`, `notification_deliveries`; preferencias, cola, intentos y resultado. |
| Cobertura | `code_coverage_projects`, `code_coverage_files`, `code_coverage_batches`, `code_coverage_results`, `code_coverage_snapshots`. |
| Auditoría | `audit_events`, con actor, recurso, operación, resultado e instante. |

La tabla resume familias; los nombres y columnas completos se consultan en las migraciones. Los contratos de intercambio vigentes están en [packages/contracts](../packages/contracts/src/index.ts) y los validadores de cada módulo, no en los objetos conceptuales de la planificación.

## Integridad y concurrencia

Las claves compuestas vinculan evidencias y versiones al mismo proyecto. UUID de solicitud y huellas impiden reutilizar una petición con contenido distinto. Las transacciones, bloqueos y leases coordinan trabajos y decisiones. La base local y los servicios externos no forman una transacción distribuida: se conserva intención y se verifica o reconcilia el resultado remoto.

El rol de aplicación tiene permisos de inserción/consulta y actualizaciones limitadas por entidad. No dispone de permiso general para reescribir decisiones y evidencia inmutable. Los campos de ciclo de vida de trabajos y cursores sí son mutables; no se afirma que toda la base sea append-only.

Los instantes se guardan consistentemente y se presentan en America/Guayaquil. Un reporte no sustituye sus fuentes por observaciones posteriores al corte. Los cambios de configuración crean versiones; no alteran retrospectivamente la evidencia guardada.

En cobertura, la generación cambia al invalidar contenido o contexto y cada fragmento confirmado conserva commit/blob/líneas. Los eliminados salen del inventario actual, sin eliminar su historial. Resultados y cortes son inmutables para el rol de aplicación.

## Conservación y recuperación

Los respaldos contienen estado operativo y datos privados. Mantener la clave de cifrado separada lógicamente de los sobres ChatGPT y proteger la copia de recuperación. No limpiar tablas, eliminar migraciones ni reconstruir decisiones para ordenar el repositorio. Ver [respaldo y recuperación](backup-and-recovery.md) y [EX-01 histórica](validation/validation-closeout.md#ex-01-dato-histórico-ausente).

## Datos añadidos en 1.1

`report_template_versions` conserva metadatos versionados; `report_document_keys` asigna consecutivos por periodo/tipo/proyecto; `report_results` añade HTML y huella de presentación sin cambiar datos históricos. `assistant_messages` vincula petición/respuesta a usuario y proyecto con clave de reenvío. `reversal_links` enlaza propuestas Trello con ejecuciones originales. `github_recovery_requests` y sus eventos conservan planes inmutables, motivo, autoridad y ciclo de preparación/aprobación/ejecución/retirada/reconciliación. El rol de aplicación no puede reescribir planes ni evidencias; las transiciones y sus eventos se guardan transaccionalmente.
