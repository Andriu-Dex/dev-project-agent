# Requisitos y criterios de aceptación

La descomposición vigente punto por punto, las brechas y las pruebas de cierre de la primera versión están en la [matriz de aceptación académica](academic-acceptance-matrix.md), revisada el 11 de octubre de 2026. Sus 39 criterios desarrollan el detalle completo del PDF y se cruzan con los once REQ siguientes. La aceptación final permanece pendiente.

## Fuentes y alcance

Fuente normativa académica: «Agente inteligente para seguimiento y control de proyectos de desarrollo de software», PDF del profesor de cinco páginas, matriz REQ-01 a REQ-11. Fuente complementaria: transcripción de clase facilitada por el usuario. Las decisiones del usuario concretan la solución; no sustituyen la matriz de evaluación del profesor.

El PDF admite cambios autorizados y la clase recalca que el asistente no modifica por iniciativa propia. Interpretación de diseño: análisis automático, propuestas revisadas y modificaciones solo tras autorización humana explícita. El Ejecutor prepara reportes, el Revisor valida y el Aprobador habilita su publicación conforme a las reglas definidas.

Alcance inicial: un proyecto UTAPED, un tablero de Trello y un repositorio. Cada criterio siguiente es una comprobación prevista, no evidencia de una función implementada.

| ID | Requisito | Criterio de aceptación y evidencia prevista |
| --- | --- | --- |
| REQ-01 | Consultar planificación, actividades, responsables, fechas de inicio/fin, prioridades y estados | Mostrar esos campos y su fuente; marcar datos ausentes. Comparar una muestra con la planificación y Trello. |
| REQ-02 | Determinar estados y avance | Mostrar pendientes, en ejecución, completadas, retrasadas y bloqueadas. Verificar el porcentaje con un conjunto de tareas conocido y explicar el cálculo. |
| REQ-03 | Consultar Trello y detectar cambios | Consultar listas, tarjetas, miembros, fechas y etiquetas. Comparar dos consultas y mostrar cambios de fecha, responsable, prioridad y estado. |
| REQ-04 | Detectar retrasos y riesgos, analizar causas e impacto | Detectar una tarea vencida y otra próxima a vencer. Distinguir evidencia de hipótesis y calcular impacto solo con dependencias conocidas. |
| REQ-05 | Proponer acciones correctivas | Presentar alternativas de fecha, prioridad o responsable, con justificación, impacto y evidencia. Demostrar aceptación, rechazo y solicitud de ajuste. |
| REQ-06 | Reporte semanal automático | Generar el viernes a las 18:00 un reporte con avance, actividades por estado, riesgos, desviaciones, recomendaciones y acciones propuestas, aprobadas, rechazadas y ejecutadas. Registrar periodo y hora de generación. |
| REQ-07 | Revisar código | Analizar cambios periódicamente, vinculando hallazgos a commit, archivo y líneas: errores potenciales, duplicación, vulnerabilidades, mantenibilidad y buenas prácticas. Distinguir hallazgos confirmados de sospechas. |
| REQ-08 | Tres agentes secuenciales | Registrar entradas, salidas y decisión de Ejecutor, Revisor y Aprobador. Una propuesta rechazada por el Revisor no puede pasar a ejecución. |
| REQ-09 | Interacción con el gestor | Mostrar alertas y recomendaciones justificadas. Permitir al gestor aceptar, rechazar o pedir ajustes; impedir modificaciones sin aprobación válida. |
| REQ-10 | Trazabilidad | Reconstruir una propuesta desde su origen hasta su resultado, con actor, fecha/hora, versión, decisiones y ejecución. Registrar también fallos y rechazos. |
| REQ-11 | Seguridad | Verificar permisos de consulta y aprobación, protección de credenciales y ausencia de secretos en panel, informes y registros. Acceso limitado al tablero y repositorio previstos. |

## Cobertura adicional del detalle del PDF

- Mantener una línea base para identificar desviaciones de planificación.
- Registrar evidencias de tareas y las limitaciones de su análisis; no declarar completada una actividad solo por una afirmación del modelo.
- Considerar complejidad, legibilidad, eficiencia y estándares del proyecto en la revisión técnica.
- Tras ejecutar una modificación autorizada en Trello, consultar el resultado y registrar la comprobación.
- Una recomendación de código debe incluir alcance, riesgos y comprobaciones propuestas antes de preparar la rama.

## Guion de evaluación

1. Consultar el proyecto y contrastar actividades y avance.
2. Detectar un retraso y presentar alternativas.
3. Mostrar una propuesta devuelta por el Revisor para ajustes.
4. Mostrar una propuesta rechazada por el gestor y comprobar que no cambia Trello.
5. Aprobar otra propuesta, ejecutar y verificar el cambio en Trello.
6. Revisar un cambio de código y presentar evidencia y una propuesta en rama, sin integración automática.
7. Generar un reporte y reconstruir el historial de decisiones.
8. Comprobar que un integrante de consulta no puede autorizar modificaciones.

Las demostraciones de escritura usarán tareas de prueba acordadas, evitando alterar la planificación real solo para producir evidencias.
