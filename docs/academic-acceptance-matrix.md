# Matriz de cierre de la primera versión

Fecha de revisión: 11 de octubre de 2026, America/Guayaquil. Entrega académica: 4 de noviembre de 2026. Base técnica examinada: `7880678`, rama `develop` de `dev-project-agent`.

Este documento fija el alcance y la aceptación antes del siguiente desarrollo. No habilita ejecuciones externas, no modifica configuraciones y no declara aprobada la entrega. Complementa [requisitos](requirements.md) y distingue requisitos académicos, aclaraciones de clase y decisiones adicionales del usuario.

## Fuentes y regla de cobertura

| Fuente | Identificación | Uso |
| --- | --- | --- |
| F-01 | PDF del profesor, «Agente inteligente para seguimiento y control de proyectos de desarrollo de software», cinco páginas; archivo recibido: `Agente inteligente para seguimiento.pdf` | Detalle de páginas 1-3 y matriz REQ-01 a REQ-11 de páginas 4-5. Ambos son obligatorios. |
| F-02 | Transcripción facilitada por el usuario, archivo `Texto pegado.txt` | Aclaraciones de funcionamiento y autoridad, identificadas por tiempo aproximado. No corrige silenciosamente el PDF. |
| F-03 | Conversación y decisiones del usuario | Proyecto UTAPED, gestor, aprobación humana, ramas, idiomas, proveedor, periodicidad y límites de demostración. |
| F-04 | Repositorio del agente, documentación de implementación y pruebas existentes | Evidencia técnica previa y diagnóstico de brechas; no sustituye la aceptación académica. |

Huella SHA-256 de F-01: `c1d9af9fcd399c5f9a995d221a78df0c1be1cc184b0e69ff2206fc2c62761a9e`. Huella SHA-256 de F-02: `97c3097d93184b7a6cebd154ef48c9450dd32a9d3a76ae8b076e004c2e4d577f`. Las fuentes originales permanecen en sus ubicaciones locales; no se copian exportaciones privadas, enlaces de invitación ni credenciales al repositorio.

La descomposición contiene **39 puntos**: 37 del detalle de las páginas 1-3, incluida la secuencia general, y dos exigencias adicionales de la matriz de la página 5 (trazabilidad y seguridad). Los otros nueve REQ resumen puntos del detalle y se cruzan al final sin volver a contarlos. Un punto que contiene varios campos o categorías exige comprobarlos todos.

Cada fila tiene un criterio `AC-<número>` con el mismo número que `PDF-<número>`. Todos están **pendientes de aceptación final**. La columna de estado conserva el diagnóstico de la base `7880678` anterior al desarrollo; la actualización técnica del 12 de octubre se registra al final:

- **Base**: existe una función y verificación previa pertinente; falta confirmar el criterio completo en la validación final.
- **Parcial**: existe parte de la función, pero hay una brecha concreta de alcance o integración.
- **Pendiente**: falta la función descrita, aunque existan componentes reutilizables.

Estos estados no son las casillas «Cumple», «No cumple» o «No aplica» del profesor. No se asigna «No aplica» a ningún requisito de esta versión. Tampoco se calcula un porcentaje de cumplimiento a partir del número de pruebas o de pantallas.

## Evidencia técnica disponible

Las referencias E-01 a E-10 indican dónde revisar la base existente. Los resultados anteriores están registrados en [estado de implementación](implementation-status.md); no se volvieron a ejecutar pruebas de aplicación durante esta tarea documental.

| Referencia | Base y archivos verificables | Límite de la evidencia |
| --- | --- | --- |
| E-01 | [Integración Trello](trello-integration.md); [normalización](../apps/server/src/integrations/trello/normalize.ts), [planificación](../apps/server/src/integrations/trello/planning.ts) y [pruebas PostgreSQL](../apps/server/src/integrations/trello/trello.integration.test.ts) | Lectura real puntual registrada; no existe lectura periódica activa. |
| E-02 | [Reglas de seguimiento](tracking-rules.md); [motor](../apps/server/src/modules/tracking/rules.ts), [política](../apps/server/src/modules/tracking/policy.ts) y [pruebas](../apps/server/src/modules/tracking/rules.test.ts) | Fechas y avance reproducibles; prioridad y bloqueo requieren mapeos explícitos. No equivale a análisis causal. |
| E-03 | [Supervisión](supervision.md); [análisis](../apps/server/src/modules/supervision/analyze.ts), [trabajador](../apps/server/src/modules/supervision/worker.ts) y [pruebas PostgreSQL](../apps/server/src/modules/supervision/supervision.integration.test.ts) | Fuentes, dependencias y línea base; trabajos solicitados manualmente. |
| E-04 | [Agentes y decisiones](agent-workflow.md); [contratos](../apps/server/src/modules/proposals/contracts.ts), [servicio](../apps/server/src/modules/proposals/service.ts) y [pruebas PostgreSQL](../apps/server/src/modules/proposals/proposals.integration.test.ts) | Tres etapas y caso real demostrativo; la acción ejecutable actual se limita al vencimiento de una tarjeta. |
| E-05 | [Ejecución Trello](trello-execution.md); [control de ejecución](../apps/server/src/modules/proposals/execution.ts) y [pruebas PostgreSQL](../apps/server/src/modules/proposals/execution.integration.test.ts) | Escritura y reconciliación verificadas con transporte sintético. Escrituras reales desactivadas; demostración anterior invalidada. |
| E-06 | [Revisión de código](code-review.md); [evidencia](../apps/server/src/modules/code-review/evidence.ts), [servicio](../apps/server/src/modules/code-review/service.ts) y [pruebas PostgreSQL](../apps/server/src/modules/code-review/code-review.integration.test.ts) | Lectura por commit, comprobaciones acotadas y agentes. Java no se compila; publicación GitHub solo simulada. |
| E-07 | [Reportes semanales](weekly-reports.md); [servicio](../apps/server/src/modules/reports/service.ts), [programación](../apps/server/src/modules/reports/schedule.ts) y [pruebas PostgreSQL](../apps/server/src/modules/reports/reports.integration.test.ts) | Programación implementada, datos congelados y tres etapas deterministas. Usuario mostró un reporte manual publicado; su captura mostraba programación sin activar. |
| E-08 | [Autenticación](authentication.md); [rutas](../apps/server/src/modules/auth/routes.ts) y [pruebas PostgreSQL](../apps/server/src/modules/auth/auth.integration.test.ts) | Permisos, sesiones y CSRF; no es certificación de seguridad. |
| E-09 | [Acceso renovable](renewable-access.md); [almacén cifrado](../apps/server/src/providers/chatgpt/vault.ts) y [pruebas PostgreSQL](../apps/server/src/providers/chatgpt/renewal.integration.test.ts) | Reinicio, renovación y concurrencia sintéticos. Usuario informó reconexión real; no se ha acreditado aún una renovación real posterior. |
| E-10 | [Recorrido de navegador](../scripts/test-ui.ts), [panel de supervisión](../apps/web/src/components/SupervisionPanel.tsx), [propuestas](../apps/web/src/components/ProposalPanel.tsx), [código](../apps/web/src/components/CodeReviewPanel.tsx) y [reportes](../apps/web/src/components/ReportsPanel.tsx) | Pruebas previas de gestor/lector, temas, móvil y recorridos sintéticos. No reemplazan validación real de contenido. |

## 1. Seguimiento del proyecto

Fuente: F-01, página 1, sección 1. Criterios AC-1.01 a AC-1.05.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-1.01 | Consultar la planificación general. REQ-01 | Base: E-01, E-03, E-10. | Consolidar una vista de planificación identificada y contrastarla con Trello y la línea base seleccionada. | AC-1.01: abrir UTAPED, identificar fuente/fecha y contrastar inventario de actividades e hitos. Conservar IDs de snapshots, versión de línea base y captura. |
| PDF-1.02 | Identificar actividades, responsables, inicio, fin, prioridades y estados. REQ-01 | Parcial: E-01, E-02, E-03. | Completar configuración y presentación de prioridades; resolver responsable principal/asignados y datos ausentes con procedencia. | AC-1.02: comparar cada uno de los seis campos en una muestra conocida; comprobar prioridad configurada, contradictoria y ausente. Conservar tabla de contraste y configuración versionada. |
| PDF-1.03 | Determinar pendiente, en ejecución, completada, retrasada y bloqueada. REQ-02 | Parcial: E-02. | Hacer configurable el mapeo de bloqueo y mostrarlo junto con estado y condición temporal, sin doble conteo ni inferencias por colores. | AC-1.03: evaluar casos de los cinco estados/condiciones, bloqueo con retraso y bloqueo no informado. Conservar entradas y resultados; declarar completada no equivale a aceptación formal. |
| PDF-1.04 | Calcular y presentar avance general. REQ-02 | Base: E-02, E-07. | Revalidar fórmula y universo en panel y reporte. No cambiar a ponderación sin datos y decisión explícita. | AC-1.04: usar un conjunto conocido, comprobar numerador/denominador, exclusión de hitos/archivadas/referencias y caso vacío. Conservar cálculo independiente y snapshot. |
| PDF-1.05 | Identificar próximos vencimientos o riesgo de retraso. REQ-02, REQ-04 | Base: E-02. | Integrar evaluación persistente con nuevas lecturas programadas y alertas; conservar umbral dinámico y límites de evidencia. | AC-1.05: verificar antes, exactamente en y después del límite configurado, fechas faltantes y fuente desactualizada. Conservar instante, política y hallazgos. |

## 2. Integración con Trello

Fuente: F-01, página 1, sección 2. Criterios AC-2.01 a AC-2.05.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-2.01 | Acceder al tablero asociado. REQ-03 | Base: E-01. | Verificar acceso al tablero configurado, error de permisos y conservación de última lectura correcta. | AC-2.01: realizar lectura autorizada de UTAPED y rechazar otro tablero o credencial insuficiente. Conservar identidad del destino, intento y resultado saneado. |
| PDF-2.02 | Consultar listas, tarjetas, responsables, límites, etiquetas y estados. REQ-03 | Base: E-01, E-10. | Contrastar los seis grupos de datos y hacer visibles su procedencia y ausencias. | AC-2.02: comparar muestra de Trello con snapshot/panel; incluir tarjeta sin responsable o fecha. Conservar IDs y captura sin datos personales innecesarios. |
| PDF-2.03 | Detectar cambios de planificación. REQ-03 | Parcial: E-01, E-03. | Ampliar contraste normalizado de prioridad/bloqueo y enlazar diferencias periódicas con alertas e historial. | AC-2.03: comparar dos lecturas con cambios de fechas, asignados, prioridad y estado; repetir sin cambios y no duplicar hallazgos equivalentes. Conservar ambas fuentes y diferencias. |
| PDF-2.04 | Proponer cambios de fechas, prioridades, responsables o estados. REQ-05, REQ-09 | Parcial: E-04. | Extender acciones tipadas más allá del vencimiento; admitir reprogramación de inicio/fin coherentes, prioridad, asignación y estado según mapeos acordados. | AC-2.04: preparar ejemplos de cada familia, mostrar valores previos/nuevos, evidencia y alcance exacto; rechazar destino/miembro/etiqueta fuera del proyecto. Conservar versiones y dictámenes. |
| PDF-2.05 | Modificar Trello solo tras autorización del flujo establecido. REQ-08, REQ-09, REQ-11 | Parcial: E-04, E-05, E-08. | Reutilizar control de ejecución para las nuevas acciones; ampliar precondiciones, verificación y reconciliación. | AC-2.05: rechazo, ausencia de revisión, aprobación obsoleta o demostración producen cero escrituras. Una autorización real específica permite solo el cambio exacto y una lectura confirma el efecto. Conservar aprobación, intención y lecturas previa/posterior. |

## 3. Detección y gestión de retrasos

Fuente: F-01, página 1, sección 3. Criterios AC-3.01 a AC-3.06.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-3.01 | Detectar automáticamente retrasos o riesgo de incumplimiento. REQ-04 | Parcial: E-02, E-03. | Programar lectura/evaluación sin depender del navegador; registrar cortes, fallos y frescura. | AC-3.01: con navegador cerrado, una lectura programada detecta un caso vencido y otro en riesgo; reinicio no duplica el hallazgo. Conservar trabajo, fuente, política y resultado. |
| PDF-3.02 | Analizar posibles causas e impacto en otras actividades y proyecto. REQ-04 | Pendiente: E-03 aporta relaciones; E-04 aporta contexto limitado. | Incorporar análisis con evidencias, hipótesis y confirmación del gestor; recorrer dependencias válidas y explicar consecuencias posibles. No inventar duración restante ni causalidad. | AC-3.02: caso con causa documentada y cadena de dependencias identifica afectados e impacto explicado; caso sin evidencia deja hipótesis/impacto no cuantificable. Conservar fuentes, relación, justificación y revisión. Solo mostrar «desconocido» en todos los casos no cierra este punto. |
| PDF-3.03 | Generar alternativas de reprogramación, prioridad, redistribución o fechas. REQ-05 | Parcial: E-04. | Generar alternativas desde hallazgos y datos del proyecto; ampliar opciones y comprobar elegibilidad de responsables y viabilidad temporal. | AC-3.03: presentar alternativas aplicables de cada familia, incluida conservación del plan cuando proceda, con ventajas, riesgos e impacto. No exigir que el gestor redacte primero toda la solución. Conservar propuestas y evidencia. |
| PDF-3.04 | Presentar recomendaciones al gestor. REQ-05, REQ-09 | Base: E-04, E-10. | Enlazar hallazgo, causa/impacto, alternativas y propuesta en el recorrido del gestor. | AC-3.04: desde una alerta abrir una recomendación y localizar su motivo, recursos y evidencia sin reconstruirla fuera del sistema. Conservar captura y referencias. |
| PDF-3.05 | Permitir aceptar o rechazar acciones. REQ-05, REQ-09 | Base: E-04, E-08. | Extender decisiones existentes a todas las nuevas acciones y mantener controles por versión. | AC-3.05: gestor acepta y rechaza versiones distintas; lector no decide; rechazo es persistente e impide ejecución. Conservar motivo, actor, fecha y versión. |
| PDF-3.06 | Ejecutar cambios aprobados y registrar decisiones. REQ-09, REQ-10 | Parcial: E-05. | Completar adaptadores para el alcance nuevo y validación real controlada. Mantener aprobación separada de ejecución y resultado incierto. | AC-3.06: en recurso de prueba autorizado ejecutar, releer y reconstruir la decisión; simular respuesta perdida y evitar repetición ciega. Conservar resultado verificado o reconciliación pendiente, sin declarar un fallo como éxito. |

## 4. Generación de reportes

Fuente: F-01, página 2, continuación de sección 4. Criterios AC-4.01 a AC-4.05.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-4.01 | Generar automáticamente reporte semanal. REQ-06 | Base: E-07; generación manual real informada por el usuario. | Integrar fuentes periódicas y recorrido de revisión; validar programación activada. El horario viernes 18:00 es decisión del proyecto, no texto obligatorio del PDF. | AC-4.01: programar un corte de prueba sin navegador y obtener una versión; verificar además viernes 18:00 Ecuador y recuperación de corte perdido sin duplicar periodo. Conservar configuración, trabajo y tiempos. Un reporte manual no acredita por sí solo automatización. |
| PDF-4.02 | Incluir avance, completadas, en ejecución, pendientes, retrasadas y bloqueadas. REQ-06, REQ-02 | Parcial: E-07, E-02. | Completar clasificación visible de bloqueo y reconciliar todos los recuentos con su universo. | AC-4.02: reporte de conjunto conocido incluye cada categoría, fórmula y ausencia de información explícita; bloqueo/retraso coexistentes no inflan el total. Conservar resultado congelado y cálculo independiente. |
| PDF-4.03 | Identificar riesgos y desviaciones del plan. REQ-06, REQ-04 | Parcial: E-03, E-07. | Integrar causas/impacto y comparación completa de nuevas acciones con línea base confirmada. | AC-4.03: un cambio conocido aparece como desviación vinculada a versión; sin línea base no se inventa comparación. Un riesgo justificado incluye alcance y evidencia. Conservar línea base, corte y hallazgos. |
| PDF-4.04 | Incorporar acciones propuestas, aprobadas, rechazadas y ejecutadas. REQ-06, REQ-10 | Base: E-07 conserva acciones/eventos tipados. | Incorporar nuevas familias y publicación GitHub real; contrastar que periodo, propósito y resultado se presenten correctamente. | AC-4.04: periodo de prueba contiene las cuatro categorías y una ejecución fallida; aprobado no se cuenta como ejecutado y simulación no se presenta como cambio real. Conservar IDs, versiones y resultado imprimible. |
| PDF-4.05 | Recomendar trabajo para la siguiente semana. REQ-06, REQ-05 | Parcial: E-07 genera recomendaciones básicas. | Incorporar alternativas revisadas y acciones concretas a partir de riesgos, dependencias y próximos vencimientos. | AC-4.05: recomendaciones identifican actividad, motivo, acción sugerida y responsable/fecha si se conocen; no prometen finalización sin evidencia. Conservar fuentes y dictamen del reporte. |

## 5. Revisión inteligente del código

Fuente: F-01, página 2, sección 5. Criterios AC-5.01 a AC-5.06.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-5.01 | Acceder al repositorio del proyecto. REQ-07 | Base: E-03, E-06. | Revalidar repositorio/rama configurados, commit y límites de lectura; diferenciar referencias Git de contenido revisado. | AC-5.01: leer contenido seleccionado de UTAPED en commit fijo y verificar blobs/rutas; rechazar repositorio ajeno y lectura incompleta. Conservar SHA, alcance y fuente. |
| PDF-5.02 | Analizar periódicamente cambios de código. REQ-07 | Pendiente: E-06 permite análisis manual. | Programar detección y revisión de cambios relevantes; procesar el alcance elegible por lotes con cobertura registrada y consentimiento configurado para IA. | AC-5.02: dos commits conocidos originan análisis programado de sus cambios; commit sin cambios relevantes no consume IA de nuevo. Archivos omitidos quedan enumerados con motivo. Conservar comparación, configuración y análisis. |
| PDF-5.03 | Detectar errores, duplicación, mantenibilidad, complejidad, vulnerabilidades y optimización. REQ-07 | Parcial: E-06; comprobaciones locales y modelo acotados. | Completar cobertura explícita de las seis categorías para frontend TS/React y backend Java/Spring. Incorporar verificaciones por lenguaje, sin equiparar patrón o modelo con defecto confirmado. | AC-5.03: corpus controlado con un caso y un contraejemplo de cada categoría; hallazgos citan commit/archivo/líneas y confianza, o dejan constancia de detección fallida para corregirla. Conservar corpus, resultados y revisión humana. Cero hallazgos no acredita cobertura. |
| PDF-5.04 | Evaluar buenas prácticas y estándares definidos para el proyecto. REQ-07 | Pendiente: no hay catálogo versionado de estándares en el agente. | Fijar criterios específicos de UTAPED, procedencia, lenguaje y regla comprobable. El checkout local tiene `.editorconfig`, `frontend/package.json` con `lint`/`typecheck`, y `backend/pom.xml` con Java 21; esta lectura no certifica el estado remoto ni ejecuta esos comandos. | AC-5.04: congelar reglas por commit/configuración; un ejemplo conforme y otro incumplidor producen resultados ligados a cada regla. Separar no comprobado de superado. Conservar versión del catálogo, fuente y resultados. |
| PDF-5.05 | Recomendar mejoras de calidad, eficiencia, legibilidad, seguridad y mantenibilidad. REQ-07, REQ-05 | Parcial: E-06 genera recomendaciones y candidatos acotados. | Vincular recomendaciones con hallazgos de todas las dimensiones; incluir riesgos y comprobación apropiada, sin prometer rendimiento no medido. | AC-5.05: para cada dimensión, una recomendación indica fragmento afectado, explicación, cambio y forma de comprobarlo; revisor devuelve una recomendación sin evidencia. Conservar dictámenes y candidato cuando corresponda. |
| PDF-5.06 | Evitar modificar código sin revisión y aprobación. REQ-07, REQ-08, REQ-11 | Base: E-06, E-08; hoy no existe escritura GitHub real. | Mantener la restricción al añadir publicación real acordada; revalidar fuente/huella/autoridad y separar publicación de merge. | AC-5.06: rechazo, revisión fallida, contenido cambiado o aprobación demostrativa producen cero escrituras; aprobación real específica habilita únicamente rama/PR revisados. Conservar controles y resultado. El merge a develop/main sigue siendo humano. |

## 6. Arquitectura de tres roles

Fuente: F-01, página 2, sección 6. Criterios AC-6.01 a AC-6.04. El nombre «Aprobador» no transfiere al modelo la autoridad del gestor.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-6.01 | Ejecutor obtiene información, analiza actividades/código, detecta desviaciones, genera reportes y propone cambios. REQ-08 | Parcial: E-03, E-04, E-06, E-07. | Integrar supervisión programada, recomendaciones y reportes en recorridos con entradas/salidas identificadas del rol. | AC-6.01: desde fuentes congeladas, el rol deja resultados de actividades, código, desviaciones, reporte y propuestas con su procedencia. Conservar IDs de trabajo, motor utilizado y salidas. |
| PDF-6.02 | Revisor verifica acciones/propuestas, consistencia, errores y adecuación técnica. REQ-08 | Parcial: E-04, E-06, E-07. | Ampliar revisión a causas/impacto, nuevas acciones y recomendaciones del reporte; diferenciar verificación factual de evaluación técnica. | AC-6.02: introducir evidencia inconsistente, alternativa inviable y recomendación de código incorrecta; revisor impide avanzar o pide ajuste con motivo. Conservar comprobaciones, dictamen y nueva versión corregida. |
| PDF-6.03 | Aprobador recibe lo revisado y determina ejecución conforme a autorización. REQ-08, REQ-09 | Parcial: E-04, E-05, E-06, E-07. | Unificar control de elegibilidad y salida final para todas las acciones; reporte validado debe quedar ligado al dictamen que habilita su publicación interna. | AC-6.03: sin revisión válida no hay autorización de etapa; con revisión se solicita decisión humana para cambios externos. Un reporte rechazado no se publica como validado. Conservar dictamen, política y decisión vinculada. |
| PDF-6.04 | Secuencia Ejecutor -> Revisor -> Aprobador -> ejecución autorizada. REQ-08 | Parcial: E-04, E-05, E-06, E-07. | Completar secuencia para alcance nuevo y publicaciones reales sin saltos ni reutilización de decisiones entre versiones. | AC-6.04: reconstruir tiempos/entradas/salidas en orden; detener flujo por rechazo del revisor o gestor; aprobación obsoleta exige repetir revisión. Conservar historial completo y ausencia de ejecución en casos negativos. |

No se añade como requisito del profesor una llamada a un modelo en cada etapa. Las etapas deterministas actuales de reporte deben identificarse como tales y demostrar revisión y autorización efectivas. Si se incorporan inferencias a ese recorrido, se configurarán consentimiento y cuota, sin habilitar publicación por el mero éxito de una llamada.

## 7. Interacción con el gestor

Fuente: F-01, páginas 2-3, sección 7. Criterios AC-7.01 a AC-7.06.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-7.01 | Presentar estado actual claro. REQ-09 | Base: E-02, E-03, E-10. | Consolidar estado, última lectura, alcance y pendientes, sin confundir histórico con actual. | AC-7.01: gestor identifica avance, situación y antigüedad de ambas fuentes; un fallo no se muestra como actualización correcta. Conservar capturas y referencias. |
| PDF-7.02 | Notificar retrasos, bloqueos, riesgos y desviaciones importantes. REQ-09, REQ-04 | Parcial: E-02, E-03, E-10 muestran observaciones. | Crear seguimiento persistente de alertas y notificaciones dentro del panel, con origen, importancia, estado y deduplicación. | AC-7.02: los cuatro tipos llegan al gestor tras un trabajo; repetición no multiplica alertas, reconocimiento no borra evidencia y resolución conserva historial. Conservar eventos y captura. No se exige email/WhatsApp/Slack. |
| PDF-7.03 | Mostrar recomendaciones y justificación. REQ-09 | Base: E-04, E-06, E-10. | Integrar nuevas familias, causas/impacto y navegación a evidencia. | AC-7.03: abrir recomendación de planificación y de código y localizar justificación, alternativas, riesgos y fuente. Conservar versiones y capturas. |
| PDF-7.04 | Solicitar autorización cuando se requiere intervención humana. REQ-09, REQ-11 | Base: E-04, E-05, E-06, E-08. | Aplicar solicitud explícita a cada acción nueva y distinguir revisión técnica, consentimiento de IA y autorización de escritura. | AC-7.04: mostrar destino y cambio exacto antes de decidir/ejecutar; consentimiento para enviar datos no autoriza una modificación. Conservar solicitud, decisión y controles. |
| PDF-7.05 | Permitir aceptar, rechazar o solicitar modificaciones. REQ-09 | Base: E-04, E-06, E-10. | Extender recorridos a nuevas recomendaciones y mantener nueva versión tras ajustes. | AC-7.05: probar las tres decisiones con motivo; ajuste repite agentes, conserva versión anterior y no hereda aprobación. Conservar ambas versiones y dictámenes. |
| PDF-7.06 | Registrar decisiones del gestor. REQ-09, REQ-10 | Base: E-04, E-06, E-08. | Completar consulta unificada y asegurar asociación a contenido/versiones exactos. | AC-7.06: recuperar actor, fecha Ecuador, decisión, motivo y huella; el rol ordinario no puede editar ni borrar el registro. Conservar historial y prueba de permisos. |

## 8. Exigencias adicionales de la matriz académica

Fuente: F-01, página 5. Criterios AC-8.01 y AC-8.02.

| Punto | Exigencia y REQ relacionado | Estado / base | Brecha o trabajo de cierre | Prueba de aceptación y evidencia que debe conservarse |
| --- | --- | --- | --- | --- |
| PDF-8.01 | Historial completo de acciones, decisiones, fecha/hora y actor/agente por operación. REQ-10 | Parcial: E-03 a E-10; historiales por módulo. | Completar vista correlacionada desde fuente/hallazgo hasta resultado, incluyendo tareas automáticas, rechazos, fallos y nuevas publicaciones. | AC-8.01: reconstruir un caso aprobado, otro rechazado y otro fallido sin consultas administrativas manuales; cada operación conserva actor o rol, fecha, versión y resultado. Conservar referencias y auditoría sin razonamiento interno ni secretos. |
| PDF-8.02 | Permisos de acceso y cifrado/protección de credenciales Trello/repositorio. REQ-11 | Parcial: E-08, E-09; tokens Trello/GitHub locales en `.env` ignorado. | Verificar permisos del archivo/entorno, mínimo privilegio, separación lectura/escritura, destinos permitidos y ausencia de filtraciones; proteger credenciales nuevas de publicación. El cifrado ChatGPT no demuestra por sí solo protección de Trello/GitHub. | AC-8.02: anónimo y lector no autorizan/escriben; revocación detiene operación; secretos no aparecen en Git, panel, reportes, logs ni contextos de IA. Conservar resultados saneados, restricciones de destinos y verificación de almacenamiento/NTFS, sin revelar valores. |

## Cruce con los once requisitos evaluados

Todos los criterios de cada fila son obligatorios para cerrar el REQ. La relación es de muchos a muchos; no se suman filas para calcular un porcentaje. Evaluación final inicial de todos: **pendiente**.

| REQ | Puntos que lo desarrollan |
| --- | --- |
| REQ-01 | PDF-1.01, PDF-1.02 |
| REQ-02 | PDF-1.03, PDF-1.04, PDF-1.05, PDF-4.02 |
| REQ-03 | PDF-2.01, PDF-2.02, PDF-2.03 |
| REQ-04 | PDF-1.05, PDF-3.01, PDF-3.02, PDF-4.03, PDF-7.02 |
| REQ-05 | PDF-2.04, PDF-3.03, PDF-3.04, PDF-3.05, PDF-4.05, PDF-5.05 |
| REQ-06 | PDF-4.01, PDF-4.02, PDF-4.03, PDF-4.04, PDF-4.05 |
| REQ-07 | PDF-5.01, PDF-5.02, PDF-5.03, PDF-5.04, PDF-5.05, PDF-5.06 |
| REQ-08 | PDF-2.05, PDF-5.06, PDF-6.01, PDF-6.02, PDF-6.03, PDF-6.04 |
| REQ-09 | PDF-2.04, PDF-2.05, PDF-3.04, PDF-3.05, PDF-3.06, PDF-6.03, PDF-7.01, PDF-7.02, PDF-7.03, PDF-7.04, PDF-7.05, PDF-7.06 |
| REQ-10 | PDF-3.06, PDF-4.04, PDF-7.06, PDF-8.01 |
| REQ-11 | PDF-2.05, PDF-5.06, PDF-7.04, PDF-8.02 |

## Aclaraciones de clase

Los identificadores CLASS no añaden funcionalidades que el profesor no pidió. La transcripción contiene errores de reconocimiento («credo», «TRED», «realizador», «traza de vida»); la interpretación se contrasta con Trello, Revisor y trazabilidad del PDF, conservando la fuente original intacta.

| ID / tiempo de F-02 | Aclaración | Aplicación y evidencia de cierre |
| --- | --- | --- |
| CLASS-01 / 00:31-01:30 | Planificación previa y gestor que mantiene estados/evidencias en Trello. | AC-1.01 a AC-1.04: vincular planificación y referencias de evidencias de tareas; distinguir declarado, comprobado y ausente. No marcar finalización por afirmación de un modelo. |
| CLASS-02 / 01:38-02:16 | Detectar automáticamente retrasos y ayudar con acciones correctivas. | AC-3.01 a AC-3.04: demostrar detección y recomendación originadas por un trabajo programado. |
| CLASS-03 / 02:20-02:51 | Reporte semanal; día definido por el equipo. | AC-4.01 a AC-4.05: viernes 18:00 Ecuador es elección del usuario; permitir configuración sin perder periodos. |
| CLASS-04 / 02:51-03:01 y 03:57-04:11 | Asistente recomienda; cambios sujetos a aceptación/rechazo humano. | AC-2.05, AC-3.06 y AC-5.06: ninguna autorización emitida por el modelo sustituye la del gestor. El PDF admite ejecución una vez autorizada. |
| CLASS-05 / 03:05-03:29 | Revisar el código que se carga en el repositorio. | AC-5.01 a AC-5.05: cobertura de cambios y lenguajes pertinentes; procesamiento por lotes sin afirmar análisis de archivos omitidos. |
| CLASS-06 / 03:34-03:57 y 05:02-05:34 | Tres roles; el Aprobador produce la salida/informe final con información revisada. | AC-6.01 a AC-6.04: salida final ligada a revisión y dictamen; publicación del informe en el panel se diferencia de autorización externa. |
| CLASS-07 / 04:14-04:40 | Historia, actores, credenciales y conexiones seguras. | AC-8.01 y AC-8.02: trazabilidad completa y transporte HTTPS hacia proveedores. HTTP loopback local no equivale a despliegue remoto seguro. |
| CLASS-08 / 05:40-06:41 | Evaluación técnica por matriz y funcionamiento; modelo a elección. | Ejecutar todos los AC y conservar evidencia de aplicación. No se exige OpenClaw, proveedor concreto ni certificación ISO. |

La expresión «aprender» de 04:43-04:51 describe uso y acompañamiento del proyecto; no se convierte en obligación de entrenar un modelo o crear aprendizaje automático persistente. La evidencia y el historial aportan contexto verificable.

## Decisiones adicionales aceptadas por el usuario

Estas condiciones se incluyen en la entrega por decisión del proyecto; no se atribuyen como texto del PDF.

| ID | Condición | Cierre previsto |
| --- | --- | --- |
| USER-01 | Primera entrega supervisa UTAPED, un tablero y repositorio; cuatro integrantes y gestor autorizado. | Destinos configurados, gestor con permisos y demás integrantes de consulta. No ampliar a SaaS/múltiples organizaciones para cerrar esta versión. |
| USER-02 | Correcciones reales en `agent/<proposal-id>-v<version>`, PR hacia `develop`, incorporación humana. | Completar adaptador GitHub, propósito real separado, aprobación específica, escritura registrada, verificación y reconciliación. Probar rama/PR autorizados sin merge; no reutilizar aprobaciones simuladas. |
| USER-03 | Parámetros dinámicos y panel operativo. | Configuración versionada de intervalos/horarios/umbrales, alcance de análisis, próximos trabajos, pausa, errores y reintentos controlados; sin editar código para ajustar valores. |
| USER-04 | ChatGPT sin presupuesto adicional y renovación automática. | Mantener almacenamiento cifrado, recuperación y consentimiento de datos; observar una renovación real y comprobar reinicio sin OAuth nuevo. Cuota o revocación se muestran como límites, sin comprar créditos ni repetir inferencias a ciegas. |
| USER-05 | Español en interfaz/reportes y documentación personal; inglés técnico. | Revisar mensajes, archivos, identificadores, commits y PRs. Documentación de `docs/` puede permanecer en español. |
| USER-06 | Evidencias, manual y cierre de entrega. | Manual de instalación/operación, guion reproducible, matriz evaluada y ejemplos saneados. Normas de referencia orientan criterios, sin declarar certificación. |
| USER-07 | La aprobación demostrativa anterior no puede modificar Trello. | Mantener propósito demostrativo e invalidación; incluir caso negativo y comprobar cero ejecuciones. Las pruebas reales futuras usan recursos y nuevas autorizaciones específicas. |
| USER-08 | Correos al gestor, añadidos por el usuario el 14/10. | Destinatario y eventos configurables, resumen/avisos/recordatorios/silencio, cola durable, deduplicación, permisos, historial y prueba real. Véase [correo y configuración](notifications.md); confirmar además un aviso automático real tras activación. |
| USER-09 | Usabilidad y paleta azul/gris neutro, elegida el 14/10. | Configuración por secciones, horarios comprensibles, cambios sin guardar, historial filtrable y temas claro/oscuro; revisión visual y móvil. |

Frecuencias de lectura Trello 30 minutos, GitHub 60 minutos y análisis diario 17:00 son valores iniciales propuestos en [reportes y operación](reports-and-operations.md), no plazos del profesor ni activaciones ya realizadas. La siguiente implementación los hará configurables y no enviará código/datos a IA automáticamente sin configuración explícita del gestor. Con el equipo apagado no hay servicio: al reiniciar se recupera lectura actual y reportes pendientes, sin simular observaciones históricas.

## Paquetes de cierre y dependencias

Una tanda grande puede implementar estos paquetes en secuencia y conservar commits revisables. El usuario autorizó iniciar el desarrollo y la mejora integral del frontend el 11 de octubre de 2026, después de cerrar esta matriz. Las escrituras externas siguen requiriendo una autorización específica.

| Paquete | Trabajo | Criterios principales / dependencia |
| --- | --- | --- |
| CLOSE-01 | Mapeos configurables de prioridad, bloqueo, estados y responsables; vista de planificación y procedencia de evidencias. | AC-1.01 a AC-1.05, AC-2.02, AC-2.03. Base de nuevas acciones y reportes completos. |
| CLOSE-02 | Programación persistente de fuentes y análisis; alcance, consentimiento, cuota, recuperación, deduplicación y panel de trabajos. | AC-3.01, AC-4.01, AC-5.02; USER-03/04. Las lecturas periódicas no dependen de una sesión web activa. |
| CLOSE-03 | Causas/impacto, alternativas desde hallazgos y nuevas acciones Trello; tres roles, decisiones y ejecución verificada. | AC-2.04/05, AC-3.02 a AC-3.06, AC-6.01 a AC-6.04. Depende de CLOSE-01/02; ejecución real requiere autorización específica. |
| CLOSE-04 | Catálogo de estándares de UTAPED, cobertura por lenguaje/categoría y publicación GitHub real revisada. | AC-5.01 a AC-5.06; USER-02. Comparte permisos y trazabilidad; no incluye merge automático ni ejecución irrestricta de scripts. |
| CLOSE-05 | Alertas persistentes, historial correlacionado y consolidación/revisión de reportes. | AC-4.02 a AC-4.05, AC-7.01 a AC-7.06, AC-8.01. Integra CLOSE-01 a CLOSE-04. |
| CLOSE-06 | Seguridad transversal, verificación esencial durante desarrollo, manual y validación integral final. | AC-8.02 y todos los AC/CLASS/USER. Los controles de autorización y secretos se aplican desde cada paquete, no al final. |

No se requiere cambiar PostgreSQL, Fastify, React ni la coordinación propia para cubrir la matriz. Nuevas herramientas de análisis se escogerán según lenguaje y estándar verificable, antes de instalar dependencias. No se incluye entrenamiento, multiempresa, alojamiento 24/7, email externo ni certificación ISO como condición académica; el correo sí se incorpora por decisión posterior del usuario en USER-08.

## Registro de aceptación y condición de terminado

Para cada AC se conservará, durante validación: ID, fecha/hora, responsable de la comprobación, versión/commit del agente, entorno, datos y configuración usados, resultado esperado/observado, evidencias localizables, defectos y conclusión. Para casos con IA se añadirán modelo/esfuerzo, alcance y dictámenes. La evidencia exportable será saneada; fuentes privadas se referencian por IDs, sin publicar exportaciones completas.

La aceptación final registra **Pendiente**, **Superado** o **Fallido** por AC. Un fallo incluye defecto y repetición de la prueba tras corregirlo; su historia no se borra. Después se trasladará a cada REQ la casilla académica correspondiente: solo «Cumple» cuando todos sus AC y aclaraciones relacionadas estén superados. Un criterio que no pudo ejecutarse permanece pendiente, no superado.

El guion integral debe cubrir planificación/avance; cambios entre fuentes; prioridad/bloqueo; causa e impacto con y sin evidencia; alternativas; revisión que solicita ajustes; rechazo humano; ejecución autorizada y verificación; error/resultado incierto; análisis de frontend/backend; publicación de rama/PR aprobados sin merge; corte semanal con recuperación; lector sin autoridad; secretos y trazabilidad. Las pruebas automatizadas esenciales se mantienen durante desarrollo; la evaluación representativa real y la aceptación de entrega se realizan al cerrar la integración.

Las pruebas reales de escritura requieren acordar recurso de prueba, cambio exacto y autorización vigente. Crear esta matriz no concede esa autorización ni activa las escrituras. Los casos sintéticos prueban mecanismos, pero no sustituyen la evidencia de conectividad y operación real exigida en los recorridos integrados.

**Condición de terminado:** los 39 AC, las ocho aclaraciones CLASS y las nueve condiciones USER tienen evidencia de cierre; los once REQ quedan evaluados sin brechas pendientes; errores bloqueantes resueltos; manual y demostración reproducibles. No se promete ausencia absoluta de defectos ni cobertura de todo código futuro.

La revisión inicial del 11 de octubre solo leyó fuentes y preparó esta matriz. El desarrollo posterior autorizado se registra a continuación, manteniendo la aceptación final pendiente.

## Avance de implementación del 12 de octubre de 2026

Se implementan los seis paquetes de cierre mediante navegación nueva, reglas configurables, programación durable, alertas/alternativas, acciones Trello ampliadas, catálogo de código y publicación GitHub controlada, consolidación de reportes e historial y [manual](first-release-guide.md). Esta tabla enlaza el software verificable con todos los AC; no reemplaza la evaluación final ni convierte los resultados sintéticos en aceptación real.

| Criterios | Función y evidencia técnica actual | Comprobación final aún necesaria |
| --- | --- | --- |
| AC-1.01 a AC-1.05 | [Planificación](../apps/web/src/components/PlanningPage.tsx), [resumen](../apps/web/src/components/OverviewPage.tsx), política versionada de estados/prioridad/bloqueo y motor de avance/fechas. | Contrastar campos y universo con UTAPED y casos representativos. |
| AC-2.01 a AC-2.03 | Lectura normalizada, diferencias entre snapshots, comparación de línea base con etiquetas y política común, [alertas](../apps/server/src/modules/operations/alerts.ts). | Confirmar lectura/permisos reales y cambios conocidos sin duplicados. |
| AC-2.04, AC-2.05 | [Acciones tipadas](../apps/server/src/modules/proposals/actions.ts), tres dictámenes, valores previos/nuevos y [ejecución ampliada](trello-execution.md); 21 escenarios PostgreSQL. | Recursos de prueba y cambios reales específicos autorizados de cada familia. |
| AC-3.01 | [Operación programada](project-operations.md), cola persistida, cortes/frescura, límites, reintentos y suspensión. | Observar trabajo real sin navegador y recuperación después de pausa. |
| AC-3.02 a AC-3.04 | [Análisis contextual](../apps/server/src/modules/operations/risks.ts), causa declarada/hipótesis/confirmación humana, sucesoras y alternativas elegibles con navegación al formulario correcto. | Validar explicaciones y alternativas con datos representativos y revisión humana. |
| AC-3.05, AC-3.06 | Versiones/decisiones inmutables, permisos y adaptadores con verificación y reconciliación. La demostración anterior sigue invalidada. | Reconstruir casos reales aprobados/rechazados y resultado de escritura autorizada. |
| AC-4.01 a AC-4.05 | Programación semanal, fuentes/política congeladas, clasificaciones, línea base, causas/impacto, acciones GitHub/Trello y recomendaciones en [reportes](weekly-reports.md). | Observar corte automático y revisar contenido imprimible de un periodo representativo. |
| AC-5.01, AC-5.02 | Lectura por commit/blob, cobertura por contenido entre commits y revisión diaria por lotes con presupuesto conservado y archivos pendientes/excluidos. Siete escenarios de operación. | Observar cambios reales en dos commits y confirmar exclusiones/cobertura. |
| AC-5.03 a AC-5.05 | [Catálogo `utaped-review-v1`](code-standard-catalog.md), seis categorías con positivos/contraejemplos TS/Java, fuente citada, recomendaciones y revisión de candidatos. | Revisión humana representativa y comprobaciones del proyecto. Java no se compila por el agente; los patrones son señales acotadas. |
| AC-5.06 | [Publicación controlada](github-publication.md), propósito real inmutable, aprobación/huella vigentes, intención durable, rama/PR exactos y reconciliación sin repetir POST. | Crear rama/PR de prueba autorizados; comprobar que la integración permanece humana. |
| AC-6.01 a AC-6.04 | Secuencias explícitas de propuestas/código; preparación, revisión y dictamen deterministas del reporte, con procedencia y decisiones separadas. | Evaluar rechazos/ajustes representativos y reconstruir cada secuencia sin saltos. |
| AC-7.01 a AC-7.06 | Ocho páginas, temas/móvil, alertas persistentes de retraso/bloqueo/desviación/dependencias, dictámenes, decisiones y confirmaciones separadas. | Recorrido del gestor/lector con evidencia real y evaluación de usabilidad. |
| AC-8.01, AC-8.02 | Historial común y por módulo, auditoría/evidencia inmutables, CSRF/permisos/revocación, credenciales de escritura separadas, protección NTFS automática de `.env` y acceso ChatGPT cifrado. | Revalidar instalación final, secretos, mínimos permisos y renovación real; no se afirma cifrado en reposo de los tokens locales Trello/GitHub. |

La verificación automatizada y visual se registra en [estado de implementación](implementation-status.md). Las fuentes originales y los 39 criterios se conservan; todos los AC/CLASS/USER permanecen pendientes de aceptación final hasta completar el guion con responsables y evidencias. No se realizaron escrituras externas ni se activaron programaciones reales en esta tanda.

## Validación real iniciada el 13 de octubre

El [registro de validación real](real-acceptance-validation.md) contiene el estado posterior de cada AC, sus casos y pendientes. Se comprobaron cuatro escrituras Trello aprobadas por el gestor, una rama y PR borrador específicamente autorizados, renovación real de ChatGPT, fuentes programadas con pestañas del panel cerradas, recuperación tras reinicio, inventario y diferencias contra Trello, historial de alertas y un reporte manual con las acciones del periodo. Al 14 de octubre se superaron técnicamente 11 procedimientos: AC-1.01, AC-2.01, AC-2.03, AC-3.02, AC-3.04, AC-3.05, AC-4.02, AC-7.01, AC-7.02, AC-7.04 y AC-7.05; los otros 28 conservan subcasos pendientes. Se añadieron cortes automáticos reales, recuperación de un corte perdido, rechazo/ajustes asistidos por delegación del usuario y prueba HTTP real del lector. Este registro prevalece sobre las observaciones históricas de “sin programaciones/escrituras reales”, sin cambiar los requisitos ni declarar aceptada toda la entrega.

Los horarios confirmados por el usuario y activados son lecturas cada 60 minutos, revisión diaria a las 18:00 y reporte los viernes a las 18:00, America/Guayaquil. El corte semanal del 16 de octubre y el análisis programado de dos commits reales todavía requieren evidencia.

## Actualización del 14 de octubre: correo y usabilidad

Se implementa [notificación SMTP](notifications.md), configuración por pestañas, días/minutos de revisión de código, filtros de reportes y paleta azul/gris. La prueba de correo tuvo aceptación SMTP y recepción confirmada por el usuario. Esto añade USER-08/09 y amplía USER-03; no convierte los 28 AC con subcasos pendientes en superados.

## Validación técnica del 15 de octubre

La [tabla actual de los 39 criterios](real-acceptance-validation.md) registra 34 procedimientos superados y 5 en validación. [El informe de esta tanda](chatgpt-validation-oct15.md) distingue ejecución real, fixtures y revisión humana pendiente. Prevalece sobre los recuentos históricos anteriores, sin cambiar la fuente académica ni declarar aceptación final.
