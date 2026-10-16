# Reportes semanales implementados

Actualización del 12 de octubre de 2026: el corte usa mapeos de seguimiento históricos y estados declarados coherentes; incorpora causas documentadas/confirmadas, impacto contextual, alternativas y recomendaciones concretas. Conserva eventos de publicación GitHub diferenciados de simulación e integración humana. El formato tiene nueve secciones principales y un anexo de trazabilidad/revisión. Véanse [guía operativa](first-release-guide.md) y [estado de implementación](archive/validation/implementation-status.md) para evidencia y límites.

Fecha: 11 de octubre de 2026. Primera entrega de REQ-06, integrada con seguimiento, revisión de código y auditoría. La plantilla propia sigue las referencias orientativas de [normas y calidad](standards-and-quality.md); no atribuye cláusulas ISO ni declara certificación.

## Programación y recuperación

El gestor activa la programación en **Reportes semanales → Configurar programación semanal**. Valores iniciales: viernes 18:00, America/Guayaquil. Día, hora y minuto son configurables y cada cambio conserva su versión y actor. La programación comienza en la activación real; no crea semanas anteriores a ella. Los lectores solo consultan. La zona de esta entrega está limitada expresamente a Ecuador; no depende de la zona del dispositivo.

El trabajador del servicio comprueba los cortes cada diez segundos, sin navegador abierto. Si el equipo estuvo apagado, encola las ocurrencias pendientes conservando inicio y corte originales; recupera hasta veinte por proyecto en cada pasada y procesa hasta diez reportes por pasada. Las restricciones únicas y transacciones evitan duplicar cada corte/versión. Cambiar una programación conserva los cortes vencidos antes del cambio. Desactivarla detiene nuevas ocurrencias; los reportes ya solicitados permanecen en la cola.

El servicio y PostgreSQL deben estar activos. No se instala una tarea de Windows ni se promete funcionamiento con el equipo apagado. Si cambia la autoridad de quien activó la programación, esta se suspende con un aviso y una única auditoría; un gestor vigente debe guardar otra configuración. Los trabajos pendientes vuelven a comprobar autoridad antes de generar.

## Contenido, fuentes y validación

Cada resultado guarda proyecto, versión, periodo, corte, generación real, huella SHA-256, configuración y fuentes. El periodo filtra eventos desde el inicio inclusive hasta el corte exclusivo. El primer periodo y los manuales pueden ser parciales. La generación tardía conserva su corte original.

Se prefieren snapshots observados e incorporados antes del corte. Si no existen, una observación posterior se presenta expresamente como posterior, con indicadores evaluados al generar; no reconstruye el estado histórico. Una configuración posterior tampoco se hace pasar por histórica. La línea base debe estar confirmada antes del corte. La revisión de código debe haber terminado antes del corte; se conservan commit, archivos, hallazgos, confianza, comprobaciones no realizadas y limitaciones.

La plantilla incluye las diez secciones acordadas: identificación, resumen, avance, desviaciones, riesgos/dependencias, calidad, acciones/decisiones, próxima semana, fuentes/limitaciones y trazabilidad. Los hitos quedan fuera del denominador del avance. La comparación entre reportes usa puntos porcentuales solo si coincide el conjunto de IDs de actividades y ambos tienen fuentes anteriores al corte. No calcula costes, ruta crítica ni causas sin evidencia. Los eventos incluyen propuestas, decisiones, etapas y ejecuciones; una aprobación no se presenta como escritura verificada. La publicación de código sigue siendo simulada.

Preparación (Ejecutor), comprobaciones de evidencia/cálculo/periodo (Revisor) y control de publicación interna (Aprobador) son **etapas deterministas**, guardadas con motor y dictamen. No son inferencias ni una nueva revisión de IA. La falta de evidencia de Trello deja un borrador con observaciones; el resto de brechas se hace explícito. Esta decisión evita consumo automático del plan para recomponer información ya estructurada. Los tres agentes con modelos siguen interviniendo en las propuestas y correcciones existentes.

La publicación interna no autoriza cambios, no envía mensajes y no modifica Trello/GitHub. La primera versión muestra hasta mil eventos por periodo, advierte si hay más y conserva la auditoría completa en PostgreSQL. El panel lista los sesenta reportes más recientes.

## Versiones y salida imprimible

**Generar reporte ahora** crea una solicitud persistente e idempotente. **Preparar nueva versión del mismo periodo** conserva inicio/corte y genera otra versión, sin editar el resultado anterior. Los trabajos fallidos permanecen con código seguro de error. El rol de ejecución no puede actualizar ni eliminar contenido publicado ni la historia de programación.

**Abrir versión imprimible / guardar como PDF** muestra HTML generado desde el resultado guardado. Usar Ctrl+P y papel A4. No hay motor PDF adicional ni salida Word/Excel. El HTML escapa valores de fuentes, restringe contenido activo mediante CSP y se sirve autenticado, sin caché. Se excluyen descripciones completas, contenido de archivos, detalles arbitrarios de auditoría y credenciales; se protegen patrones comunes de secretos en textos incluidos. No se considera este filtrado una garantía de detectar cualquier dato sensible introducido en una fuente.

## API y verificación

Base `/api/v1/projects/:projectId/reports`:

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | Base | Miembro; configuración e historial |
| GET | `/:id` | Miembro; versión y resultado guardado |
| GET | `/:id/print` | Miembro; misma identidad, versión y contenido imprimible |
| POST | Base, `{requestKey, revisionOf?}` | Gestor, origen permitido y CSRF; 202 |
| PUT | `/schedule`, `{expectedVersion, enabled, weekday, hour, minute}` | Gestor, origen y CSRF; control de versión |

`npm run test:reports-db` verifica recuperación, idempotencia, periodos, fuentes históricas/posteriores, borradores, permisos, suspensión y versiones inmutables con rollback. `npm run test:ui` verifica programación, generación, versión 2, impresión/PDF A4, temas, móvil y restricciones de lectores con datos sintéticos. Las evidencias locales de prueba permanecen en `work/ui/`, excluidas de Git.

Las lecturas periódicas de Trello/GitHub y el análisis diario de IA aún no están activados. El reporte utiliza evidencias disponibles y muestra su antigüedad; conviene actualizar las fuentes antes de generar uno manual. La evaluación representativa real y la matriz final del profesor siguen pendientes.
