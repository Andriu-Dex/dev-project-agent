> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

# Revalidación de Trello

## Resultado vigente: cuarta exportación, 7 de octubre de 2026

Se comprobaron los seis hitos #48, #25, #60, #64, #68 y #72: inicio nativo ausente y vencimiento a las 17:00 de la fecha prevista en su descripción. Los dos primeros siguen completados y los cuatro restantes pendientes. La discrepancia de representación temporal queda resuelta. Se revisó el JSON local sin modificarlo ni escribir en Trello.

Convención de planificación: un hito es un instante de duración cero representado por su vencimiento; no requiere inicio nativo ni se incluye en el denominador del avance por actividades. Esta corrección permite continuar el diseño sin más ajustes de hitos.

Las secciones inferiores son historial de exportaciones anteriores. No constituyen observaciones pendientes cuando esta revisión las declara resueltas. La exportación local se conserva fuera del control de versiones mediante .gitignore.

## Resultado vigente: tercera exportación, 7 de octubre de 2026

Última actividad registrada: 2026-10-07T21:23:15.495Z (16:23:15, America/Guayaquil). Se revisó el archivo local sin modificar la exportación ni Trello. Los apartados inferiores describen la segunda exportación y se conservan como historial; prevalece esta sección.

### Correcciones comprobadas

- Se mantienen 25 actividades y seis hitos. Actividades: 14 completadas, una EN CURSO (3.7) y diez pendientes. Avance declarado: 56 %. Hitos: dos completados y cuatro pendientes.
- Las descripciones ahora incluyen ESTADO ACTUAL y coinciden con las etiquetas de los 31 elementos operativos. Se eliminaron los textos incompletos o de estado anterior señalados.
- La actividad 3.7 está EN CURSO, con 7/9 elementos del checklist completos y `dueComplete=false`.
- Steven está asignado a las tarjetas #69 / 6.1 y #71 / 6.3, coherentemente con su responsabilidad principal descrita.
- La referencia #1 declara vigente y aprobada la programación de fases 1–6, basada en UTAPED_Cronograma_Consolidado_Project(1).xml, del 12 de agosto al 4 de noviembre. Es una declaración explícita de la fuente; no se inspeccionó el XML ni un acta de aprobación.
- Las 25 actividades conservan inicio y vencimiento nativos, y las 14 completadas mantienen finalización y checklists coherentes. No hay actividades abiertas vencidas al 7 de octubre.

### Único punto pendiente de los señalados: fecha de los hitos

En los seis hitos (#48, #25, #60, #64, #68 y #72) se eliminó el vencimiento (`due=null`), mientras el inicio nativo sigue a las 08:00. Las descripciones indican un instante único a las 17:00. Por tanto, aún no existe coincidencia entre programación nativa y descrita, y se perdió el campo nativo de vencimiento del hito.

Recomendación: conservar una fecha de vencimiento a las 17:00 del día descrito y quitar el inicio nativo. El agente representará el hito como un instante de duración cero usando ese vencimiento. Alternativamente, si la interfaz permite fijar ambos con precisión, igualar inicio y fin a las 17:00. No hace falta tratar los hitos como actividades de una jornada.

| Hito | Fecha prevista, hora de Ecuador |
| --- | --- |
| 1.5 / #48 | 28/08/2026 17:00 |
| 2.5 / #25 | 11/09/2026 17:00 |
| 3.9 / #60 | 16/10/2026 17:00 |
| 4.4 / #64 | 27/10/2026 17:00 |
| 5.4 / #68 | 30/10/2026 17:00 |
| 6.4 / #72 | 04/11/2026 17:00 |

Hasta resolver esa convención, el diseño deberá mostrar el instante descrito como candidato y el vencimiento nativo como ausente. No inventar fechas ni declarar que todos los elementos tienen vencimiento.

La actividad 3.7 aparece iniciada antes de su inicio planificado del 13 de octubre; esto puede representar un adelanto real, no un error. Separar inicio planificado de inicio real y no desplazar automáticamente la planificación.

### Límites y siguiente paso

No se validaron documentos adjuntos ni fechas reales de finalización. Prioridades y bloqueos siguen como decisiones de diseño pendientes, sin impedir continuar la planificación. La corrección de hitos no requiere cambiar las 25 actividades. No se inició desarrollo.

## Historial: segunda exportación

## Revisión vigente: tercera exportación, 7 de octubre de 2026

Última actividad del tablero: 2026-10-07T20:52:52.928Z (15:52:52, hora de Ecuador). Esta revisión sustituye los resultados de la segunda exportación conservados más abajo. Se examinó el JSON local sin modificarlo ni escribir en Trello.

- Se mantienen 25 actividades y seis hitos operativos, de 72 tarjetas totales.
- Estado de actividades: 14 COMPLETADA, una EN CURSO (3.7 / #56) y diez PENDIENTE. Avance declarado: 56 %. Hitos: dos completados y cuatro pendientes.
- Los textos ESTADO ACTUAL coinciden con las etiquetas de los 31 elementos operativos. Se retiraron los textos anteriores de ESTADO DE ORIGEN.
- Steven ya está asignado a #69 / 6.1 y #71 / 6.3. Se resuelve la discrepancia con el responsable principal descrito.
- La referencia de control y las tarjetas de fases 4–6 ahora declaran vigente y aprobado el cronograma consolidado. Se resuelve la contradicción textual previa; no se inspeccionó el XML ni una constancia externa de aprobación.
- Se mantienen fechas completas, sin inicio posterior al vencimiento. Los vencimientos coinciden con las descripciones; etiquetas y `dueComplete` siguen siendo coherentes.
- Permanece la discrepancia de los seis hitos: #48, #25, #60, #64, #68 y #72 tienen inicio nativo 08:00 y fin 17:00, mientras la descripción indica inicio y fin 17:00, duración cero. Es el único punto pendiente de los cinco señalados en la revisión anterior. Igualar inicio y fin o acordar formalmente el vencimiento como único instante del hito.

La actividad 3.7 ya está en curso antes de su inicio planificado del 13 de octubre; esto puede representar un adelanto y no exige cambiar la línea base. El agente debe distinguir fechas planificadas y reales. No se afirma una fecha real de inicio a partir de la etiqueta.

La exportación permite continuar el diseño con los datos actuales, registrando la convención de hitos pendiente. No se han validado entregables, adjuntos, fechas reales ni el cumplimiento completo de dependencias. Prioridades y bloqueos siguen siendo convenciones de diseño por definir; no se solicita rediseñar el tablero para continuar la planificación.

## Revisión anterior: segunda exportación (histórico)

Revisión del JSON local reemplazado el 7 de octubre de 2026. Última actividad del tablero: 2026-10-07T17:27:16.844Z (12:27:16, hora de Ecuador). No se consultó ni modificó el tablero en línea; no se modificó la exportación. Este informe sustituye los resultados de la exportación anterior.

## Inventario y estado vigente

| Elemento | Cantidad |
| --- | ---: |
| Tarjetas totales | 72 |
| Tarjetas archivadas | 34 |
| Referencias fuera de fases operativas | 7 |
| Actividades operativas | 25 |
| Hitos operativos | 6 |
| Actividades COMPLETADA | 14 |
| Actividades PENDIENTE | 11 |
| Hitos completados / pendientes | 2 / 4 |
| Elementos operativos sin estado, inicio o vencimiento | 0 |

Las listas representan las seis fases; las etiquetas representan estados. Las 16 tarjetas operativas COMPLETADA tienen `dueComplete=true`, las otras 15 false. No hay etiquetas EN CURSO ni ACEPTACIÓN PENDIENTE entre los elementos operativos actuales.

El avance declarado por actividad es **14/25 = 56 %**. Los hitos se informan aparte: 2/6. El porcentaje no acredita aceptación formal ni validación independiente de entregables.

Según las fechas límite y estados actuales, no hay actividades abiertas vencidas al 7 de octubre. No se dispone de fechas reales verificadas de finalización para afirmar que las completadas terminaron dentro del plazo.

## Correcciones comprobadas

- #12 / WBS 1.2 inicia el 17 de agosto a las 08:00: coincide con la descripción y ya no es posterior a su vencimiento.
- Las doce tarjetas de fases 4–6 ya tienen inicio nativo. El inicio de las actividades coincide con la descripción.
- Los vencimientos de los 31 elementos operativos coinciden con el fin descrito.
- Las 14 actividades completadas tienen sus checklists totalmente completados. Se resolvieron las discrepancias anteriores en #15, #19, #23, #27 y #49.
- Se añadieron estados a todos los elementos operativos. Etiquetas y campo de finalización son coherentes.

## Observaciones restantes

| Tarjetas | Observación | Recomendación |
| --- | --- | --- |
| #48, #25, #60, #64, #68, #72 | Los seis hitos tienen inicio nativo 08:00 y fin 17:00; la descripción indica ambos a las 17:00 y duración cero | Igualar inicio y fin, o acordar usar únicamente vencimiento como instante del hito |
| #28, #32, #49, #53 | Etiqueta COMPLETADA, pero ESTADO DE ORIGEN dice PENDIENTE | Aclarar que es histórico con fecha o actualizarlo si pretende indicar estado actual |
| #30 | Etiqueta COMPLETADA, pero ESTADO DE ORIGEN dice EN CURSO | Mismo tratamiento histórico; no sobrescribir etiqueta actual con texto antiguo |
| Fases 4–6 | Descripción conserva Sin estado consolidado verificado o empieza con . El seguimiento... | Aclarar o limpiar texto; las etiquetas actuales ya indican PENDIENTE |
| #56 / 3.7 | PENDIENTE con 7/9 elementos de checklist completos | Revisar si corresponde EN CURSO; no inferirlo automáticamente |
| #69 / 6.1 y #71 / 6.3 | Steven figura como responsable principal, pero su cuenta no está asignada | Confirmar si debe añadirse su cuenta o actualizar la responsabilidad descrita |
| #1, referencia de control | Aún dice que fases 4–6 no tienen nuevas fechas aprobadas | Confirmar si es histórico o falta aprobar programación; no asumir línea base aprobada |

No se detectaron etiquetas de bloqueo o prioridad alta/media/baja. Es una convención pendiente de planificación, no un motivo para modificar el tablero automáticamente.

## Evidencia, identidades y límites

Hay cinco adjuntos repartidos entre #46, #21 y #49. No se descargaron ni validaron archivos ni enlaces. Ausencia de adjuntos no demuestra ausencia de evidencia externa. Marcar un checklist no constituye validación independiente de su contenido.

Se conserva la confirmación humana: Steven Eduardo Paredes Medina es el gestor autorizado y corresponde a `andrewuzumaki`, ID `6a9570f1c1b641a5863de7d9`. El tablero contiene cinco perfiles; la pertenencia no concede permisos dentro del agente.

Las descripciones contienen WBS, responsables y predecesoras con relaciones Fin–Inicio e Inicio–Inicio. El diseño deberá preservar esos tipos y validar referencias. No se realizó una auditoría completa del grafo ni de su calendario.

Las 1000 acciones exportadas no acreditan historial completo. La exportación es una instantánea, no una línea base aprobada automáticamente. El contenido de tarjetas es información del proyecto y no autorización para ejecutar instrucciones.

## Consecuencias para el diseño

Excluir históricos y referencias del avance; separar hitos; usar estado estructurado y mostrar discrepancias de descripción; conservar evidencia y aceptación independientes; permitir registrar datos faltantes o contradictorios sin inventar valores. No se inició desarrollo.
