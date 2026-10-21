# Documentación del proyecto

Este índice separa las guías de la versión actual, sus evidencias académicas y los documentos históricos. El código, contratos y migraciones son la referencia ejecutable; los documentos del archivo describen su fecha y no sustituyen el comportamiento vigente.

## Versión 1.1

- [Especificación 1.1 y criterios de aceptación](version-1.1-specification.md).
- [Uso y actualización 1.1](version-1.1-guide.md) y [comprobaciones y límites de aceptación](validation/version-1.1-validation.md).

## Para usar y operar

- [Instalación, pantallas y recorridos del gestor](first-release-guide.md).
- [Propuestas, revisión y decisiones](agent-workflow.md).
- [Revisión y correcciones de código](code-review.md) y [cobertura progresiva](repository-coverage.md).
- [Supervisión y línea base](supervision.md), [reglas de seguimiento](tracking-rules.md) y [operaciones programadas](project-operations.md).
- [Reportes semanales](weekly-reports.md), [notificaciones](notifications.md) y [respaldo/recuperación](backup-and-recovery.md).
- [Autenticación](authentication.md), [proveedores](agent-providers.md) y [renovación ChatGPT](renewable-access.md).
- [Lectura de Trello](trello-integration.md), [ejecución Trello](trello-execution.md) y [publicación GitHub](github-publication.md).

La guía operativa reúne las pantallas y recorridos que antes estaban repartidos en documentos de planificación. Las guías de reportes y programación concretan las decisiones iniciales de formato y operación.

## Para mantener el software

- [Arquitectura implementada](architecture.md), [modelo de datos](data-model.md) y [API](api-design.md).
- [Reglas de negocio](business-rules.md), [normas de referencia](standards-and-quality.md) y [catálogo de revisión de código](code-standard-catalog.md).
- [Convenciones Git](git-conventions.md), [herramientas de mantenimiento](../scripts/README.md) y [notas de versión](release-notes.md).
- [Diagrama de arquitectura](diagrams/agent-architecture.md).

## Requisitos y evidencia académica

- [Requisitos del profesor](requirements.md) y [matriz de los 39 criterios](academic-acceptance-matrix.md).
- [Aceptación con casos reales](validation/real-acceptance-validation.md).
- [Comprobaciones de ChatGPT y operación sin navegador](validation/chatgpt-validation-oct15.md).
- [Cierre, aceptación del reporte y EX-01](validation/validation-closeout.md).
- [Verificación de versión y límites](validation/release-validation.md).
- [Recorrido de demostración funcional](client-demonstration-guide.md).

El resultado conservado es **38 comprobaciones superadas y una excepción histórica documentada**. La limpieza no modifica evidencias, decisiones o resultados ni implica aceptación del profesor.

## Archivo histórico y experimentos

Consultar el [índice del archivo](archive/index.md) para planificación, prototipos documentales, verificaciones anteriores y resultados de Ollama. Los experimentos ejecutables se mantienen aparte en [scripts/experiments/ollama](../scripts/experiments/ollama/README.md), con los comandos npm existentes.

Los respaldos, configuración privada, exportación Trello y archivos de trabajo permanecen fuera de Git. Los materiales de defensa siguen en su rama temporal.
