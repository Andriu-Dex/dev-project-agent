# Reportes y decisiones de operación

Fecha: 7 de octubre de 2026. Propuesta concreta para revisar antes de implementación. El viernes a las 18:00 y la autoridad del gestor ya fueron confirmados; los demás valores se seleccionan ahora como valores iniciales propuestos. No se han activado tareas, conexiones o cambios externos.

## Reporte de seguimiento semanal

Formato principal: vista HTML del panel, generada desde una versión persistida del reporte. Salida compartible: impresión A4 y guardado como PDF desde el navegador sobre esa misma versión. No incorporar inicialmente Word, Excel ni un motor PDF independiente. Antes de entrega se verificará que tablas, saltos de página, títulos y fuentes sean legibles en el PDF.

Publicación interna tras Ejecutor → Revisor → Aprobador conforme a política. Si falla una revisión, permanece como borrador con observaciones; no se presenta como validado. No enviar reportes automáticamente por correo, chat o Trello. El gestor puede descargar el reporte desde el panel.

Cada reporte tiene identificador, versión, proyecto, periodo, corte, fecha real de generación, estado de validación, versión de configuración/política y referencias a snapshots y commits. Una corrección crea otra versión; no altera silenciosamente lo publicado. Exportaciones muestran la misma identidad y versión del panel.

### Plantilla propia, orientada por ISO 21502 e ISO 15289

| Sección | Contenido requerido |
| --- | --- |
| 1. Identificación | Proyecto, reporte/versión, periodo, corte, generación, responsable y validación |
| 2. Resumen ejecutivo | Situación observable, principales cambios, riesgos y decisiones requeridas |
| 3. Plan y avance | Fórmula, numerador/denominador, estados, variación respecto al reporte anterior e hitos por separado |
| 4. Desviaciones | Actividad, responsable, fecha prevista, retraso, bloqueo y comparación con línea base disponible |
| 5. Riesgos | Evidencia o hipótesis, impacto, urgencia, acción propuesta y responsable conocido |
| 6. Calidad de código | Repositorio/commit, alcance analizado, hallazgos revisados, severidad y comprobaciones realizadas/no realizadas |
| 7. Acciones y decisiones | Propuestas nuevas y cambios de estado durante el periodo; versión, actor, fecha y resultado de ejecución |
| 8. Próxima semana | Actividades/hitos próximos, recomendaciones concretas y decisiones pendientes |
| 9. Fuentes y limitaciones | Antigüedad, fallos, datos ausentes, cobertura del análisis y diferencias entre declarado y verificado |
| 10. Anexo de trazabilidad | Referencias a evidencias, requisitos pertinentes, configuración y revisión; sin secretos ni razonamiento interno |

No inventar avance esperado si no puede calcularse desde una línea base verificable. No incluir valor ganado, costes, CPI o SPI sin datos y reglas suficientes. No tratar checklist completada como aceptación de una actividad. Comparaciones de porcentajes se expresan en puntos porcentuales y solo entre universos comparables; si cambia el alcance, explicarlo.

### Periodo y recuperación

Periodo de eventos: desde el viernes anterior a las 18:00 inclusive hasta el corte actual exclusivo, zona America/Guayaquil. El primer periodo comienza en la activación real; etiquetarlo como parcial. Los indicadores de estado identifican el snapshot utilizado y su hora, pues una lectura cercana al corte no acredita el estado exacto a ese instante.

El reporte se agenda los viernes a las 18:00. Si el equipo estaba apagado, conservar el corte y periodo originales, registrar generación tardía y recuperar las ocurrencias pendientes sin duplicarlas. Un snapshot obtenido después del corte no se presenta como histórico al corte: se identifica como observación posterior. Si faltan datos históricos, mostrar la brecha; las lecturas posteriores no reconstruyen por sí solas el pasado. Separar eventos del periodo de estado actual observado posteriormente.

## Frecuencias y disponibilidad iniciales

| Operación | Valor propuesto | Condición |
| --- | --- | --- |
| Lectura de Trello | Cada 30 minutos | Comparar snapshots y ejecutar reglas deterministas; sin llamar a IA por cada lectura |
| Lectura de referencias GitHub | Cada 60 minutos | Registrar nuevos commits en la referencia configurada |
| Análisis de IA/código | Una vez al día a las 17:00 | Solo si hay datos relevantes nuevos; acotar alcance y comprobar cuota |
| Reporte semanal | Viernes 18:00 | Usar evidencias disponibles y mostrar su antigüedad; una falla de IA no permite omitir revisión |
| Ejecución manual | Disponible al gestor | Reutilizar trabajos equivalentes en curso; respetar límites y auditoría |

Los intervalos son configurables, dependen de permisos/cuota reales y no son un acuerdo de disponibilidad 24/7. Con equipo/servicio apagados no hay supervisión. Al reiniciar se hace una lectura actual, sin reproducir todas las consultas periódicas perdidas; los reportes semanales sí conservan sus ocurrencias.

Marcar fuente desactualizada tras dos intervalos sin lectura correcta: 60 minutos Trello, 120 minutos GitHub. Mostrar fecha de última lectura correcta por fuente; una consulta fallida no renueva frescura. No confundir frescura de referencias Git con fecha del último análisis de código. Antes de cualquier escritura se revalidan sus precondiciones, aunque la fuente aparezca reciente.

Si no existe análisis de IA nuevo, mostrarlo como pendiente o reutilizado con fecha y alcance explícitos; no cambiarle la fecha para simular una revisión reciente.

## Reglas de seguimiento

- Retrasada: actividad no completada cuyo vencimiento es anterior a la evaluación. Sin fecha: dato faltante, no «en plazo».
- Próxima a vencer: actividad no completada con vencimiento entre ahora y las próximas 72 horas, inclusive. Es un umbral propio configurable, no una regla ISO.
- Bloqueo: señal explícita mapeada y versionada por proyecto, independiente del estado de avance. Como Trello aún no aporta una señal acordada, indicar «bloqueo no informado», sin deducir ausencia de bloqueo.
- Prioridad: alta, media, baja o no informada, desde un campo/etiqueta configurado. No inferirla de colores, posición o fase. Prioridad de actividad, severidad de hallazgo y urgencia de atención son conceptos distintos.
- Atención inmediata: retraso o bloqueo explícito con vencimiento en 72 horas; atención próxima: otros vencimientos en 72 horas o bloqueos. Datos insuficientes generan advertencia de calidad de información. Estas reglas organizan atención, no calculan probabilidad de riesgo.
- Dependencias: propagar posibles impactos solo con relaciones conocidas y distinguir estimaciones de hechos. No afirmar ruta crítica sin un modelo de planificación suficiente.
- Avisos: novedades accionables en el panel y agrupación de eventos repetidos; sin canales externos inicialmente.

No se crean etiquetas o campos en Trello durante planificación. La configuración inicial podrá operar con prioridad y bloqueo no informados hasta que el gestor defina su representación.

## Código y autorizaciones

Decisión confirmada por el gestor el 7 de octubre de 2026: distinguir los dos repositorios y sus flujos.

| Repositorio | Flujo acordado |
| --- | --- |
| dev-project-agent, producto que desarrollaremos | Desarrollo en develop; versión final validada pasa a main |
| utaped, proyecto supervisado | Cada corrección aprobada se prepara en agent/<proposal-id>-v<version>, con PR hacia develop; incorporación a develop y posterior paso a main exclusivamente humanos |

La referencia inicial supervisada de UTAPED será develop. Registrar siempre referencia y commit base exactos. Detectar cambios en develop no autoriza a modificar ni actualizar automáticamente una propuesta existente.

Convención confirmada: agent/<proposal-id>-v<version>. La existencia de una rama con ese nombre exige comprobar su pertenencia/commit; nunca sobrescribirla por coincidencia de nombre. La aprobación identifica diff, base y operaciones permitidas, incluyendo publicación de rama y apertura de PR hacia develop cuando corresponda. La política permite ese flujo, pero cada ejecución exige aprobación concreta. Si cambia la base y afecta al candidato revisado, invalidar la versión y repetir revisión/aprobación; no resolver conflictos o regenerar el diff silenciosamente después de aprobar.

No añadir caducidad temporal automática a aprobaciones en la primera entrega. Mantener revocación explícita y revalidación obligatoria de versión, autoridad y recurso antes de ejecutar. Cambios relevantes invalidan la autorización; la antigüedad por sí sola no sustituye estas comprobaciones.

## Cierre de esta fase y primera implementación futura

Antes de autorizar desarrollo: revisar los valores de operación aún propuestos. Las ramas y el flujo de incorporación ya están confirmados. La distribución entre integrantes es una sugerencia organizativa, no una condición técnica para continuar; puede enfocarse en revisión, pruebas, evidencias y presentación. Validación del proveedor de IA y versiones de dependencias forman parte del inicio técnico posterior; no se consideran resueltas documentalmente.

Primera parte implementable: estructura mínima, PostgreSQL, contratos, acceso/auditoría y lectura de Trello con indicadores reproducibles; validar temprano el proveedor de IA. Después, agentes y aprobación; finalmente ejecución controlada, revisión de código, reporte y evidencias. La matriz de aceptación del profesor conserva prioridad frente a añadir más estándares.
