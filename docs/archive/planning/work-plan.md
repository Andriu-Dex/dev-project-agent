> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

> Estado histórico de planificación. El desarrollo fue autorizado el 7 de octubre; el avance comprobado y los siguientes pasos vigentes están en [estado de implementación](../validation/implementation-status.md) y [revisión de código](../../code-review.md). Las declaraciones de «sin implementación» de este documento describen la planificación inicial.

# Plan de trabajo

## Actualización de preparación

Actualización posterior: el usuario autorizó implementación el 7 de octubre. El repositorio remoto dev-project-agent ya contiene el commit documental inicial en main y develop. La primera base técnica y sus límites se describen en [estado de implementación](../validation/implementation-status.md). Los textos siguientes que hablan de planificación sin desarrollo corresponden a la fase anterior.

Los seis hitos quedaron corregidos y revalidados en la cuarta exportación del 7 de octubre; no requieren ajustes adicionales. Repositorio inicializado por el usuario y preparado con exclusiones Git, convenciones de texto e instrucciones del proyecto, sin commits ni desarrollo. Siguiente trabajo: concretar contratos de datos, estados de propuestas y decisiones de operación. El flujo de ramas está confirmado en docs/archive/planning/reports-and-operations.md.

## Condiciones

Fecha de planificación: 7 de octubre de 2026. Entrega: 4 de noviembre de 2026. Cuatro integrantes; nombres, disponibilidad y asignaciones definitivas pendientes. Sin presupuesto adicional para APIs o alojamiento.

Esta fase autoriza documentación y análisis. Las etapas de implementación siguientes son planificación futura: no constituyen inicio de desarrollo.

## Cronograma propuesto

| Fechas | Trabajo | Criterio de cierre |
| --- | --- | --- |
| 7–11 oct. | Completar fuentes, reglas, arquitectura, aceptación y distribución | Mapear la planificación original en Trello y resolver decisiones que bloquean implementación |
| 12–18 oct. | Validar proveedor de IA; construir lectura de fuentes, reglas y persistencia | Consulta real, avance verificable, detección de cambios/retrasos y datos faltantes |
| 19–25 oct. | Incorporar tres agentes, decisiones y ejecución controlada | Rechazo impide escritura; aprobación permite exactamente el cambio revisado; auditoría completa |
| 26 oct.–1 nov. | Completar revisión de código, reportes, seguridad e integración | Evidencias de los once requisitos y reporte semanal real registrado |
| 2–3 nov. | Correcciones, documentación y ensayo | Guion reproducible, evidencias ordenadas y limitaciones declaradas |
| 4 nov. | Entrega y demostración | Presentar sistema y matriz con evidencias |

## Distribución propuesta

| Responsable provisional | Área principal | Coordinación |
| --- | --- | --- |
| Integrante 1 | Trello, planificación, avance y retrasos | Acuerda campos con integrante 3; aporta datos al panel |
| Integrante 2 | Git/GitHub, hallazgos y propuestas de código | Define evidencia y comprobaciones con integrante 3 |
| Integrante 3 | Agentes, proveedor de IA, autorización y ejecución | Define contratos compartidos y política de seguridad |
| Integrante 4 | Panel, reportes e historial | Integra resultados y prepara guion con todo el equipo |

Cada integrante prueba y documenta su área. La integración y revisión son responsabilidad conjunta. La asignación no representa nombres confirmados ni delegación automática a otros agentes.

## Orden y dependencias

1. Leer la planificación original, confirmada en Trello, y mapear listas, campos y dependencias.
2. Definir contratos de datos y estados de propuestas.
3. Al comenzar desarrollo, validar una solicitud real con ChatGPT, registrar elegibilidad, calidad, duración y consumo observado. No comprar créditos automáticamente.
4. Si ChatGPT no es viable, evaluar Ollama con los mismos casos representativos. Si ninguna opción logra calidad suficiente, revisar alcance técnico antes de continuar dependencias de IA.
5. Completar lectura, reglas y auditoría antes de habilitar escritura.
6. Verificar revisión y aprobación antes de cualquier ejecución externa.
7. Integrar reportes y revisión de código; cerrar evidencias de la matriz.

## Validación prevista

- Reglas: fechas límite, completadas vencidas, bloqueos con retraso, datos faltantes y proyecto sin actividades.
- Integraciones: cambios entre consultas, errores, datos desactualizados y permisos insuficientes.
- Aprobación: rechazo, ajuste de propuesta, aprobación obsoleta, doble intento y usuario sin autoridad.
- Agentes: recomendaciones sin evidencia devueltas por el Revisor; distinción de hipótesis; aislamiento de instrucciones incluidas en fuentes.
- Código: hallazgos vinculados a commit y líneas, rama autorizada y ausencia de integración automática. Aprovechar las comprobaciones existentes de UTAPED en un entorno acordado.
- Reportes: contenido exigido, corte semanal, recuperación tras interrupción y ausencia de duplicados.
- Seguridad: protección de credenciales, ausencia de secretos en salidas y control de escritura desde el servicio.

No se han ejecutado pruebas de aplicación: todavía no existe implementación.

## Riesgos y respuesta

| Riesgo | Respuesta planificada |
| --- | --- |
| Cuota o acceso ChatGPT insuficiente | Validación temprana, consultas acotadas y evaluación local |
| Modelo local lento o impreciso | Medir con casos reales; reducir contexto; mantener reglas deterministas |
| Trello incompleto | Mostrar calidad de datos y acordar actualización con el gestor |
| Equipo apagado | Recuperar tareas al reiniciar y mostrar última ejecución correcta |
| Cambio externo tras aprobar | Invalidar ejecución pendiente y volver a revisar |
| Integración tardía | Acordar contratos durante planificación e integrar semanalmente |

## Próximo paso de planificación

Actualización del 12 de octubre de 2026: la implementación autorizada incorpora los seis paquetes de la [matriz académica](../../academic-acceptance-matrix.md), frontend por tareas y [manual operativo](../../first-release-guide.md). El siguiente paso es la validación representativa de los 39 AC, revisión humana de calidad/alternativas y pruebas de escritura en recursos específicamente autorizados. Los resultados automatizados se conservan en [estado de implementación](../validation/implementation-status.md); no equivalen a aceptación académica. El párrafo siguiente es el registro histórico de planificación.

La cuarta exportación de Trello resuelve los hitos y las observaciones de estados y asignaciones. Están documentados contratos, estados, modelo conceptual, pantallas, recorridos, diseño técnico y API prevista. Se seleccionan Fastify, pg, node-pg-migrate, sesiones de servidor y Vitest/Playwright, con versiones por verificar antes de instalar. Se añadieron normas de referencia con criterios verificables y propuestas concretas de formato de reportes y operación. Siguiente paso: revisar los valores aún propuestos en docs/archive/planning/reports-and-operations.md. El destino Git y el flujo de ramas ya están confirmados. La distribución entre integrantes es opcional y puede centrarse en pruebas, evidencias y presentación; no bloquea el inicio técnico. Desarrollo sigue pendiente de autorización explícita; no se han creado SQL ni migraciones.
