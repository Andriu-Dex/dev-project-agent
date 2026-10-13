# Validación real de UTAPED

Sesión del 13 de octubre de 2026, America/Guayaquil. Base inicial del agente: `74dd405`, rama `develop`. Este registro complementa la [matriz de 39 criterios](academic-acceptance-matrix.md) y el [manual de operación](first-release-guide.md). Las fuentes académicas y los procedimientos completos de cada AC permanecen en la matriz.

La validación está en curso. Un caso positivo no cierra los demás subcasos del criterio. Se superaron técnicamente los procedimientos AC-1.01, AC-2.03, AC-3.04, AC-4.02, AC-7.02 y AC-7.04 descritos abajo; los otros 33 criterios conservan pendientes. La aceptación académica final no está cerrada. Las pruebas automatizadas y los casos reales se registran por separado.

## Entorno, autoridad y destinos

El gestor inició sesión con su cuenta real. El usuario preparó credenciales separadas de escritura y autorizó pruebas sobre tarjetas identificadas dentro de UTAPED. Las decisiones y las solicitudes de ejecución de los cuatro primeros casos quedaron registradas por el gestor desde el panel. La autorización posterior de ayudar con 99.3/99.4 no se utilizó para repetirlas: ambas ya estaban ejecutadas.

Destinos: tablero UTAPED `6a95a200128aa8ce9dd216c0`, repositorio `Andriu-Dex/utaped`, rama `develop`. La publicación de código sigue requiriendo decisión específica sobre su versión y confirmación separada; crea una rama `agent/<proposal-id>-v<version>` y un PR borrador, con integración humana. El checkout local supervisado permanece sin modificaciones de esta sesión.

Las cuatro tarjetas `[PRUEBA AGENTE]` están en la lista existente de fase 4 y no representan trabajo real del cronograma. Incrementan temporalmente el universo a 29 actividades: 25 originales y cuatro de validación, más seis hitos excluidos del avance. El cálculo independiente es 14/29 = 48,275862… %, presentado como 48,28 %. Se conserva la línea base v1; no se reemplaza para ocultar las tarjetas añadidas.

## Casos y evidencias

Las evidencias locales están en `work/acceptance/`, ignorado por Git. PostgreSQL conserva los registros del producto; los archivos locales complementan su consulta con lecturas independientes. No se versionan exportaciones completas, credenciales ni contenido privado del tablero.

| Ref. | Caso y resultado observado | Evidencia local / referencia del producto |
| --- | --- | --- |
| RV-01 | Lecturas reales desde el producto, política v2 confirmada: 72 h para próximos vencimientos y 60 min para frescura. Mapeos explícitos de estado, prioridad y bloqueo. | `real-evidence.json`; snapshots y análisis indicados en ese archivo. |
| RV-02 | Programación v2: fuentes cada 60 min y revisión diaria a las 18:00, sin envío automático de código a IA. Se cerraron las dos pestañas del panel antes del trabajo programado; las demás pestañas del navegador permanecieron abiertas. | `closed-panel-scheduled-run.json`; cierre 12:06:11, inicio del trabajo 12:06:19. Trabajo `3dc8aa67-bb1d-470a-8eab-7679e92ea27e`, análisis `4a03f441-db27-4b2e-8096-dd055835f087`. |
| RV-03 | Renovación real de ChatGPT a las 11:47:59, revisión de credencial 18, después del reinicio y sin otro inicio OAuth. Otra renovación a las 12:46:02 conservó revisión 19; las inferencias posteriores funcionaron. | `real-evidence.json`; primera auditoría `45d6d0c5-7d3a-41aa-a861-0e529ee90ce0`. No acredita disponibilidad indefinida ni elimina límites de uso. |
| RV-04 | 99.2: inicio ausente → 13/10 a las 08:00; vencimiento 15/10 a las 17:00 → 16/10 a las 17:00. Aprobación, petición separada, lectura previa, escritura y verificación posterior exitosas. Lectura independiente confirmó las dos fechas. | `verified-dates.json`, `verified-dates.png`; propuesta `c6fd67aa-2491-426c-b9df-4da7db38af5d` v1; aprobación `311f7d55-cb9c-442f-810e-0842fb652cd7`; ejecución `4452f443-d0d6-4cb9-b860-29a74f472dfe`. |
| RV-05 | 99.1: `PRIORIDAD BAJA` → `PRIORIDAD ALTA`, conservando `PENDIENTE` y `BLOQUEADA`. Escritura verificada y confirmada por lectura independiente. | `verified-fixture-executions.json`; propuesta `a51b4415-83fc-4cb3-a806-9c2604c10499` v1. |
| RV-06 | 99.3: sin miembros nativos → únicamente la cuenta del gestor, `andrew uzumaki`. Escritura verificada y lectura independiente del conjunto exacto. El responsable de la descripción no se confunde con asignación nativa ni disponibilidad. | `verified-fixture-executions.json`; propuesta `9c743b36-f044-4679-9171-8b5a34825765` v1. |
| RV-07 | 99.4: `PENDIENTE` → `EN CURSO`, conservando `dueComplete=false`, sin inventar fechas ni asignación. Escritura y lectura independiente verificadas. El estado declarado de prueba no acredita inicio real o finalización. | `verified-fixture-executions.json`; propuesta `66c616f9-2e79-4a6c-a58d-5e59dd4b386d` v1. |
| RV-08 | Análisis real de cuatro archivos TS/TSX y Java, commit y blobs fijos. Un hallazgo funcional de CSRF y dos señales de complejidad; ninguno se presenta como defecto confirmado. El Revisor de la corrección v1 solicitó ajustes por cobertura incompleta, sin avanzar al Aprobador. La v2 completó las tres etapas y recibió autorización específica del gestor. | `workflow-evidence.json`; análisis `98c62182-50df-4e56-abc6-3790ae1de82a`; corrección `8b075407-abf0-4dbd-904c-127b57d98087`. Commit fuente `248eebabac46112c2af9cd7302e1b279c11cb1a3`. Publicación: RV-11. |
| RV-09 | Programación semanal v1 activa: viernes 18:00 Ecuador; próximo corte 16/10/2026. Reporte manual publicado, periodo parcial 11/10 a las 20:03:46 → 13/10 a las 12:44:31. Recuentos: 13 pendientes, dos en progreso, 14 completadas declaradas, una vencida, una próxima y una bloqueada; seis hitos excluidos del avance. Incluye las cuatro escrituras, causa declarada y análisis de código disponible al corte. | `report-evidence.json`, `report-summary.png`, `weekly-schedule-real.png`; reporte `c3adf9a9-98b4-40f7-bb08-8e971210db60`. Un reporte manual no acredita el corte automático; la aprobación/publicación de código posterior no pertenece a este corte. |
| RV-10 | Migraciones comprobadas sin cambios pendientes y rol PostgreSQL/auditoría restringidos. Configuración y evidencias excluidas de Git. Las comprobaciones anteriores de 249 pruebas son históricas; no se atribuyen a esta sesión. | `npm run db:migrate`, `npm run test:db`; exclusiones verificadas con `git check-ignore`. |
| RV-11 | El gestor autorizó específicamente el diff v2 y su PR. Se registró la decisión y se confirmó la publicación desde su panel por solicitud expresa. Lectura independiente de GitHub: PR abierto/borrador hacia develop, padre original y únicamente api.ts modificado; blob y contenido coinciden con el candidato aprobado. Sin merge. | `verified-github-publication.json`, `github-publication.png`; [PR #11](https://github.com/Andriu-Dex/utaped/pull/11); publicación `5788535e-564f-4ea3-b323-2611cf4d12e1`, commit `24a9c9c7af475c293b880ecb61d8b1eb67d7f17b`. |
| RV-12 | Desde la alerta de bloqueo de 99.1 se consultaron causa declarada, sucesora 99.3, impacto limitado, cuatro alternativas con ventajas/riesgos y snapshot. Redistribución abrió Propuestas con tarjeta correcta, familia members, objetivo generado y miembros elegibles; no seleccionó responsable ni consintió IA automáticamente. | `risk-recommendations.png`; snapshot `172f26af-175b-4596-817a-670fb29b8640`, política v2. Recorrido leído desde la sesión real del gestor, sin nueva propuesta ni escritura. |
| RV-13 | Seis solicitudes al servidor real con sesión anónima y CSRF válido recibieron 401: proyecto, propuestas, reporte, decisión Trello, ejecución Trello y publicación GitHub. Los recuentos de decisiones y trabajos externos no cambiaron. Las solicitudes de ejecución/publicación usaron confirmación false sobre versiones ya ejecutadas. | `anonymous-access.json`; no se guardaron cookies ni tokens de sesión. Esto no acredita todavía el recorrido real de un lector. |
| RV-14 | Reinicio del servicio: la lectura pendiente desde las 14:06 se recuperó a las 17:35:50 mediante un único trabajo actual, completado, sin inventar observaciones históricas. Se retuvieron los 13 IDs de alertas previos; tres avisos distintos entraron al umbral de 72 h. ChatGPT renovó a las 17:36:16, revisión 20, sin nuevo OAuth. | `resumed-observation.json`; operación `f96239ce-f3f1-4717-a9bc-ec9a1f654fc4`, trabajo `f934b499-7ef5-4b46-9cb8-aed366e2ba44`. No se atribuye al reinicio una segunda prueba con navegador cerrado. |
| RV-15 | Desde Brave autenticado se contrastaron las 35 filas de Planificación contra una lectura directa de Trello y el snapshot: 29 actividades y seis hitos, con identidad/nombre únicos y tipo visible. Fechas nativas, miembros y etiquetas coinciden. Se conserva línea base v1. | `planning-verification.json`, `planning-ui-rows.json`, `planning-real.png`; snapshot `2116b4aa-1d5e-4fdc-b8ed-e798905715b1`, línea base snapshot `5c155ff2-82cf-40d5-9add-d3528c3e23db`. |
| RV-16 | Comparaciones históricas conservan inicio/vencimiento de 99.2, prioridad de 99.1, asignados de 99.3 y etiquetas de estado de 99.4. Los valores coinciden con las acciones aprobadas y los cambios registrados. Dos lecturas posteriores iguales producen cero diferencias y no duplican alertas equivalentes. | `source-change-verification.json`; pares `52f4a7eb…` → `ee6ce7b2…` y `ee6ce7b2…` → `172f26af…`; IDs completos en la evidencia. |
| RV-17 | Se registró una nota de seguimiento de 99.1 desde la sesión del gestor durante la validación asistida. Conserva apertura y observaciones previas; no confirma causa ni autoriza escrituras. La alerta de próximo vencimiento de 99.2 conserva apertura, resolución tras reprogramación y reapertura al entrar nuevamente al umbral, con el mismo ID. Los cuatro tipos requeridos están disponibles en el panel. | `alert-history-verification.json`, `alert-follow-up.png`; bloqueo `6760c893-c049-405f-a8bf-e0436b8f6e19`, próximo vencimiento `a053b9c0-e80c-4967-a7d0-4b7e425278bf`. |
| RV-18 | Se ejecutaron 86 escenarios PostgreSQL adicionales de acceso, Trello, supervisión, propuestas, ejecución, proveedor, renovación y operación. Todos superados tras corregir el aislamiento de una prueba. Son fixtures con rollback y transportes sintéticos: cubren permisos/revocación, fuente obsoleta, denegación, resultado incierto y límites, sin provocar esos fallos en Trello real. El corpus controlado de seis categorías TS/Java volvió a superar 13 pruebas. | `*-db-resumed.log`, `operations-db-isolated.log`, `category-corpus.log`; commit `93052b6`. Total de escenarios PostgreSQL distintos ejecutados el 13/10: 118, incluidos los 32 anteriores. |
| RV-19 | Nueva propuesta real preparada para 99.4: EN CURSO → PENDIENTE, dueComplete=false. Los tres agentes completaron revisión; se solicitó al gestor comprobar una decisión negativa. No se aprobó ni ejecutó desde la automatización. | `workflow-evidence.json`, `negative-proposal-review.png`; propuesta `29c29605-af4a-447d-9ee6-506e38caad02` v1. La decisión humana sigue pendiente en este corte. |
| RV-20 | Comparación exacta de las credenciales actuales contra 238 archivos versionados y artefactos/logs locales disponibles, más mensajes de commits: sin coincidencias. Configuración, exportación privada y evidencias siguen ignoradas. | `exposure-scan.json`; no acredita ausencia de secretos antiguos/desconocidos, salidas inaccesibles ni filtraciones futuras. |

Los eventos de ejecución verifican también la conservación del resto de la tarjeta mediante su huella. La lectura independiente contrasta identidad, tablero y los valores aprobados; no sustituye la inspección integral del contenido y calidad del proyecto.

Los datos preparados para los casos incluyen una causa declarada en 99.1 y una dependencia explícita 99.3 → 99.1. Las alertas muestran la predecesora pendiente y vencida y advierten de fechas ausentes. Confirmar la causa o proponer redistribución no se infiere de la mera existencia de esa relación.

## Estado de los 39 criterios

“En validación” identifica evidencia parcial obtenida; “Pendiente” identifica subcasos todavía sin ejecución suficiente. “Superado” identifica el procedimiento comprobado con el caso indicado, sin declarar finalizada la entrega. Las referencias remiten a los casos anteriores, no a un porcentaje de cumplimiento. Responsable de comprobación técnica: asistente de desarrollo; decisiones de modificación: gestor, según las autorizaciones referenciadas.

| AC | Estado | Evidencia y trabajo restante |
| --- | --- | --- |
| AC-1.01 | Superado | RV-15: 35 filas contrastadas con Trello/snapshot, 29 actividades/seis hitos, fuente y fecha visibles; IDs y línea base v1 conservados. |
| AC-1.02 | En validación | RV-01, RV-04 a RV-07: campos nativos y ausentes; falta prioridad contradictoria y contraste de la muestra completa. |
| AC-1.03 | En validación | RV-01/02/07: pendiente, en curso, completada, vencida y bloqueo; completar casos de bloqueo no informado y ambigüedad. |
| AC-1.04 | En validación | RV-01: cálculo 14/29 y exclusión de hitos; faltan archivadas, referencias y universo vacío. |
| AC-1.05 | En validación | RV-02: próximos vencimientos y datos ausentes; faltan límites exactos y fuente desactualizada. |
| AC-2.01 | En validación | RV-01: destino real correcto; faltan denegación controlada y conservación de última lectura. |
| AC-2.02 | En validación | RV-01, RV-04 a RV-07: lectura y contraste nativo; terminar muestra de los seis grupos de datos. |
| AC-2.03 | Superado | RV-16: cambios aprobados de fechas, miembros, prioridad y estado registrados entre lecturas; repetición igual con cero diferencias y cero alertas equivalentes duplicadas. |
| AC-2.04 | En validación | RV-04 a RV-07: cuatro familias propuestas y revisadas; faltan destinos, miembros y etiquetas fuera de alcance. |
| AC-2.05 | En validación | RV-04 a RV-07: cuatro escrituras específicas verificadas; faltan todos los casos negativos y aprobación obsoleta. |
| AC-3.01 | En validación | RV-02/14: detección con pestañas del panel cerradas y recuperación/deduplicación comprobadas; falta observar con todo el navegador cerrado. |
| AC-3.02 | En validación | RV-01/02: relación y causa declaradas; falta el recorrido de confirmación/análisis causal con y sin evidencia. |
| AC-3.03 | En validación | RV-12: alternativas generadas desde el hallazgo; completar elegibilidad y aplicabilidad de cada familia y contraste de viabilidad. |
| AC-3.04 | Superado | RV-12: alerta → causa/impacto, alternativas, snapshot y formulario con recursos disponibles, sin reconstrucción externa. |
| AC-3.05 | En validación | RV-04 a RV-07: aceptación real; faltan rechazo humano persistente y denegación a lector. |
| AC-3.06 | En validación | RV-04 a RV-07: decisiones y resultados reconstruibles; falta reconciliación de resultado incierto en fixture aislado. |
| AC-4.01 | En validación | RV-09: programación activa; observar corte automático y recuperación sin duplicar periodo. |
| AC-4.02 | Superado | RV-09: 13 + 2 + 14 = 29; 14/29 = 48,28 %. Bloqueo/retraso de la misma tarjeta no alteran el total; fechas y asignación nativa ausentes se indican. |
| AC-4.03 | En validación | RV-09: riesgos y cuatro incorporaciones vinculadas a línea base v1; falta el caso sin línea base y revisar desplazamientos de actividades existentes. |
| AC-4.04 | En validación | RV-09: propuestas, aprobaciones y ejecuciones diferenciadas; falta rechazo humano, ejecución fallida y publicación de código en un corte posterior. |
| AC-4.05 | En validación | RV-09: recomendaciones por actividad, fuente y dictamen; completar responsable/fecha de la acción sugerida y revisión del contenido. |
| AC-5.01 | En validación | RV-08: cuatro archivos de commit fijo con blobs; faltan destino ajeno y lectura incompleta. |
| AC-5.02 | En validación | RV-02: horario diario activado; observar dos commits reales y un corte sin cambios. |
| AC-5.03 | En validación | RV-08: señal funcional y complejidad; completar corpus y contraejemplos de las seis categorías/lenguajes. |
| AC-5.04 | En validación | RV-08: catálogo `utaped-review-v1` ligado al análisis; falta contraste conforme/incumplidor por regla. |
| AC-5.05 | En validación | RV-08: recomendación acotada, riesgos y verificación; faltan las otras dimensiones y revisar versión corregida. |
| AC-5.06 | En validación | RV-08/11: revisión v1 detuvo avance; v2 aprobada produjo rama/PR exactos. Faltan rechazo, fuente cambiada y demás controles negativos. |
| AC-6.01 | En validación | RV-01/02/04/08: entradas y salidas de roles; completar reporte y recorrido desde desviaciones. |
| AC-6.02 | En validación | RV-08: Revisor pidió ajuste concreto; faltan alternativa inviable/evidencia inconsistente y versión corregida. |
| AC-6.03 | En validación | RV-04 a RV-07: dictamen exige gestor; falta comprobar reporte rechazado y ausencia de revisión. |
| AC-6.04 | En validación | RV-04 a RV-08: secuencia, decisiones y detención por revisión; faltan rechazo humano y aprobación obsoleta. |
| AC-7.01 | En validación | RV-01: estado, corte y fuentes visibles; falta contraste de un fallo controlado. |
| AC-7.02 | Superado | RV-14/17: retraso, bloqueo, riesgo y desviación visibles; sin duplicados equivalentes, seguimiento conserva evidencia y resolución/reapertura conservan el mismo ID e historial. |
| AC-7.03 | En validación | RV-08/12: motivos, riesgos, fuente y alternativas de planificación; completar contraste de alternativas de recomendaciones de código. |
| AC-7.04 | Superado | RV-04 a RV-07 y RV-11: cuatro familias Trello y diff GitHub con destino exacto, revisión, decisión y confirmación de escritura separadas del consentimiento IA. |
| AC-7.05 | En validación | RV-04 a RV-08: aceptación y ajustes del Revisor; faltan rechazo/ajustes humanos y no heredar decisiones. |
| AC-7.06 | En validación | RV-04 a RV-07: actor, tiempo, motivo y huella registrados; completar prueba de permisos sobre esos registros. |
| AC-8.01 | En validación | RV-04 a RV-08: casos aprobados y fallos conservados; completar consulta desde panel de caso rechazado/fallido. |
| AC-8.02 | En validación | RV-10/13/18/20: anónimo real denegado, permisos/revocación en fixtures y escaneo acotado de credenciales sin coincidencias; completar lector real y salidas todavía no inspeccionadas. |

## Defectos y repetición

El caso RV-08 detectó que el alcance aceptado de cuatro archivos producía una entrada del Revisor de 35 029 bytes, rechazada por el límite local de 32 000. Ese rechazo se presentaba como `PROVIDER_UNAVAILABLE`. Se ajustó el límite serializado a 512 000 bytes y se conserva `INPUT_TOO_LARGE` para rechazos de tamaño, sin truncar evidencia. La revisión pudo ejecutarse después y solicitó ajustes sobre el contenido.

También se conservó un intento con formato de dictamen inválido. Las instrucciones `code-agents-v2` explicitan el esquema sin relajar las comprobaciones. La preparación de la versión 2 alcanzó el antiguo máximo de 60 segundos; se amplió a 180 segundos y se distinguen `INFERENCE_TIMEOUT` y cancelación de autorización. El Ejecutor v2 completó después en 68,7 segundos, seguido del Revisor en 24,0 segundos y Aprobador en 21,6 segundos; el candidato y su publicación autorizada quedaron verificados (RV-11).

En el reporte, la cantidad de bloqueadas estaba congelada correctamente pero no aparecía en la tabla resumen. Se añadió la columna “Bloqueadas declaradas” y se comprobó visualmente el valor uno, sin cambiar el universo ni los datos históricos.

Las pruebas nuevas usan proveedores sintéticos y verifican transmisión íntegra de evidencia mayor a 32 KB, rechazo de UTF-8 que supera el límite antes de enviar y distinción de tiempo agotado/cancelación sin reintento automático. No reproducen el fallo funcional CSRF de UTAPED. El build, lint y pruebas de UTAPED siguen pendientes; Java no se compiló.

La suite de operación falló inicialmente al simular horas futuras: su consulta de reclamación podía seleccionar un cursor de otro proyecto, incluido UTAPED. La transacción de prueba se revirtió. Se restringió esa consulta al proyecto del fixture y se añadió un caso que comprueba que otro cursor vencido permanece intacto, sin trabajos ni eventos. Las ocho pruebas de operación y la comprobación de tipos superaron la repetición. La lógica de producción y sus horarios no cambiaron.

Verificación del agente el 13/10: 135 pruebas unitarias y 118 escenarios PostgreSQL distintos superados, 253 en total. Los 13 casos del corpus se repitieron y no se suman de nuevo. Comprobación de tipos, build de los tres workspaces en el corte anterior y vista real de los cambios; tras el cambio exclusivo de aislamiento de prueba se volvió a comprobar tipos. `.env` conserva ACL sin herencia para el usuario actual, SYSTEM y Administradores; no se expusieron valores de credenciales ni se subieron evidencias privadas.

## Próximos cortes

Observar la revisión diaria real a las 18:00 y el corte semanal del viernes 16 de octubre a las 18:00, manteniendo servicio/equipo activos. No alterar el reloj ni los cursores para simularlos. Un corte temporal de reporte de prueba, si se acuerda, debe guardarse como configuración explícita y restaurar después la programación confirmada.

Completar los casos de rechazo y ajustes humanos, fuente obsoleta, permisos y recuperación con fallos aislados; revisar y aprobar específicamente una corrección antes de su PR real. No introducir defectos ni commits ficticios en UTAPED para provocar resultados. Al cerrar, trasladar a REQ/CLASS/USER únicamente los AC completamente comprobados y conservar cualquier pendiente.
