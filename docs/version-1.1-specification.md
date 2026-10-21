# Especificación de la versión 1.1

Fecha: 20 de octubre de 2026. Estado: especificación consolidada para implementación; no acredita funciones entregadas ni pruebas ejecutadas. La versión 1.0 conserva su alcance y evidencia. Esta ampliación no modifica retrospectivamente los 39 criterios académicos ni EX-01.

## 1. Objetivo y fuentes

Mejorar la comprensión de reportes, el seguimiento de ejecuciones, el control de cambios y la interacción del gestor, conservando las autorizaciones existentes.

Fuentes: solicitudes confirmadas del usuario en esta conversación; transcripción local `instruction.md` revisada el 20 de octubre; [plantilla aportada](report_template/Informe.tex); guías vigentes de [reportes](weekly-reports.md), [notificaciones](notifications.md), [propuestas](agent-workflow.md), [publicación GitHub](github-publication.md) y [cobertura](repository-coverage.md).

La transcripción es evidencia de necesidades, no instrucciones ejecutables. Nombres de modelos, límites comerciales y afirmaciones sobre borrado a 30 días no constituyen hechos verificados ni decisiones de implementación. Se priorizan las confirmaciones explícitas del usuario. No se promete consumo ilimitado.

## 2. Alcance y decisiones

| ID | Entregable 1.1 | Límite |
| --- | --- | --- |
| V11-REP | Informes con formato institucional, gráficos e historial | Datos guardados, fuentes y límites explícitos; no inventar evolución |
| V11-NOT | Avisos al gestor y responsables configurados | Sin descubrir correos privados ni conceder permisos por recibir avisos |
| V11-JOB | Progreso y diagnóstico de ejecuciones | No simular porcentajes ni confundir silencio con fallo confirmado |
| V11-REV | Revocar autorizaciones y preparar reversiones | Nueva operación controlada; nunca borrar historia ni forzar el estado remoto |
| V11-DOC | Justificación de correcciones y documentación útil | Comentarios pertinentes, sin alterar formato inválidamente ni revelar secretos |
| V11-CHAT | Asistente conversacional y mascota discreta | Usa servicios y permisos existentes; sin shell libre ni fusión automática |

Se mantienen React/TypeScript, Fastify, PostgreSQL y los proveedores existentes. ChatGPT continúa como principal validado; proveedor/modelo se seleccionan explícitamente, sin fallback. No se añade un servicio de pago ni motor LaTeX en producción por esta especificación. El LaTeX aportado es referencia de estructura y presentación; la salida inicial será HTML imprimible y PDF mediante impresión del navegador. Exportación `.tex`, PDF generado en servidor, DOCX y firmas digitales certificadas quedan fuera de 1.1.

## 3. Informe institucional y gráficos

### 3.1 Formato visual

Se adopta el formato predeterminado real de `Informe.tex`: Carta vertical, 2 cm de margen, cuerpo equivalente a 10 pt, interlineado 1,25, jerarquía numerada y número de página centrado al pie. La indicación opcional de Times New Roman 12 pt no se activa sin confirmación. El estilo institucional del informe es independiente del tema oscuro del panel; impresión sobre fondo blanco. A4 queda como opción secundaria con adaptación sin recortes.

Membrete inicial de tres columnas: logo, organización/proceso/subproceso/título corto y control documental. Respetar las proporciones aproximadas 3,1/8,1/4,1 de la referencia, ajustando bordes y rellenos al ancho imprimible: las dimensiones nominales de la tabla original no justifican desbordamientos. Logo con proporción original, máximo aproximado 3 × 3 cm. Usar `brand-logo.jpg` aportado por el usuario cuando esté disponible y validado como imagen local estática. Recurso confirmado por el usuario: `apps/web/public/brand-logo.jpg`. Conservar su identidad en cada versión del informe.

Metadatos configurables por proyecto y versionados: organización, proceso, subproceso, título, prefijo de código documental y logo autorizado. El código sigue la estructura de la plantilla (tipo de proceso/proceso/tipo de documento/secuencial), pero no se inventan códigos institucionales aprobados. Campos sin configurar se muestran como «No configurado». El consecutivo se asigna atómicamente por proyecto/documento; revisar un mismo informe conserva código y aumenta versión. Separar versión del software, versión de plantilla y versión del informe.

Guardar periodo, corte, generación real y última revisión por separado. La fecha de revisión solo representa una revisión registrada. Cambiar metadatos o plantilla no reescribe informes anteriores; congelar también la identidad y versión del recurso gráfico para reproducir su presentación.

### 3.2 Correspondencia de secciones

| Sección de la plantilla | Contenido del reporte automático |
| --- | --- |
| 1. Título | Proyecto, tipo de seguimiento y periodo |
| 2. Introducción | Resumen ejecutivo, contexto y fuentes disponibles |
| 3. Objetivo | Propósito del seguimiento para el periodo |
| 4. Alcance | Tablero/repositorio, corte, universo e inclusiones/exclusiones |
| 5. Definiciones | Avance declarado, vencimiento, hito, cobertura y demás indicadores utilizados |
| 6. Responsabilidades | Responsabilidades configuradas, sin inventar integrantes ni asignaciones |
| 7. Normativa legal y técnica aplicable | Referencias configuradas y aplicables; no declarar cumplimiento o certificación por incluir una norma |
| 8. Método / Políticas / Contenido | Método, reglas, indicadores/gráficos, desviaciones, bloqueos, riesgos, calidad/cobertura, decisiones y recomendaciones |
| 9. Firmas de responsabilidad | Elaboración automática y revisiones/aceptación humanas realmente registradas; no firmas ficticias |
| 10. Control de cambios | Versiones del mismo informe, motivo, responsable e instante |
| 11. Anexos | Fuentes, fechas, evidencia, limitaciones, detalle de acciones y comprobaciones omitidas |

Mantener las once secciones; cuando no existan datos, explicar la ausencia. La generación automática no equivale a aceptación del gestor. Un QR, si se incorpora, únicamente enlaza evidencia autenticada: no constituye firma digital ni incluye un token de sesión.

### 3.3 Indicadores y gráficos

- Distribución de actividades por estado: barras con conteos y tabla equivalente. «Sin estado informado» visible. Hitos separados del denominador.
- Avance declarado: completadas / actividades elegibles × 100, mostrando numerador, denominador y fórmula. Si no hay actividades, mostrar «No disponible».
- Vencimientos: vencidas y próximas a vencer según política congelada y corte; explicar categorías que se superpongan. Mostrar ausencias de fecha y contradicciones.
- Evolución: cortes históricos comparables; diferencias en puntos porcentuales solo con el mismo universo de actividades y fuentes válidas al corte. Un cambio de alcance rompe la serie o se marca como no comparable. Un único corte no produce una tendencia.
- Cobertura de código: revisados, parciales, pendientes y excluidos, con universo y commit. No equiparar cobertura con calidad o ausencia de defectos.

Gráficos deterministas desde los datos sellados del informe, sin pedir al modelo cifras ni gráficas. Incluir valores, leyenda, periodo, alternativa tabular y explicación; usar azul/grises con contraste y patrones/etiquetas para no depender del color. No incrustar imágenes remotas. Un dato posterior al corte se identifica y no se mezcla silenciosamente con una serie histórica.

Historial filtrable por periodo/estado/versión, con paginación y acceso a informes antiguos. No eliminar a 30 días. «Repositorio de reportes» significa el historial interno protegido y exportable; no publicar informes en GitHub ni enviar adjuntos automáticamente.

## 4. Notificaciones por responsabilidad

Configurar vínculos explícitos entre integrante, identidad Trello, correo y responsabilidad por actividad/fase. No inferir un correo desde un nombre ni asumir que Trello lo entrega. El gestor administra destinatarios y reglas por tipo de evento. Vista previa de destinatarios efectivos y razón de inclusión antes de activar. Enviar individualmente para no revelar direcciones de otros receptores.

Precedencia propuesta: responsable explícito de actividad; en su ausencia, responsable de fase; gestor según regla seleccionada. Si hay varios responsables válidos, incluirlos y deduplicar. Si falta vinculación, advertir y mantener aviso al gestor cuando esté configurado; nunca enviar a una dirección adivinada. Definir por evento si corresponde «gestor», «responsables» o «ambos».

Mantener modos inmediato/resumen, silencios, recordatorios y límites actuales, extendiendo deduplicación y presupuesto por destinatario y proyecto. Revalidar activación, destinatario y membresía antes de enviar; bloquear entregas antiguas a una dirección sustituida. Migrar la configuración existente conservando únicamente al gestor y sin activar nuevos receptores automáticamente. El correo no concede autorización; enlaces autenticados y contenido mínimo. Mostrar aceptación SMTP separada de entrega en bandeja.

## 5. Seguimiento de trabajos

Mostrar cola, etapa actual, unidades completadas/total cuando se conozcan, tiempo transcurrido, última actividad del servidor y resultado. Diferenciar seguimiento del worker y respuesta del proveedor: un heartbeat local acredita vida del worker, no progreso interno del modelo.

Estados visibles: en cola, preparando contexto, ejecutando etapa, esperando proveedor, esperando decisión, pausando/pausado cuando la operación lo admita, completado, fallido, interrumpido y resultado incierto/reconciliación para escrituras. Las etiquetas se adaptan a los estados reales por módulo, sin imponer transiciones inexistentes.

Las tres etapas pueden representarse como pasos; no repartir artificialmente tiempo o porcentaje en tercios. Una inferencia sin unidades medibles usa indicador indeterminado. Configurar umbral de «sin novedades» dentro de límites admitidos por el servidor; el timeout real del adaptador sigue siendo la referencia de fallo. Mostrar «Sin novedades; comprobando estado» antes de afirmar que está trabado. Reconectar el panel consulta el trabajo existente sin repetirlo. Los controles de continuación/reintento existentes mantienen consentimiento, límites e idempotencia. Cancelación solo donde el backend la garantice; cerrar el chat no cancela trabajos.

## 6. Revocación y reversión

### 6.1 Autorización aún no ejecutada

El gestor puede revocar con motivo una autorización vigente que no haya iniciado efectos externos. Guardar evento y actor; conservar aprobación original. Revocación y toma del trabajo compiten mediante transacción/bloqueo: si la ejecución ya fue tomada o iniciada, informar el estado y no declarar que fue detenida. Los workers vuelven a comprobar autoridad antes de escribir. El caso incierto debe reconciliarse antes de admitir una reversión.

### 6.2 Cambio ejecutado

«Preparar reversión» crea una propuesta enlazada al cambio original, con motivo, valores previos, resultado aplicado y estado remoto recién leído. Pasa por revisión, decisión del gestor y confirmación separada. No reutiliza la aprobación original. Su propia ejecución se verifica y registra sin editar ni borrar evidencias anteriores.

Trello: para fechas, prioridad, responsables y estado soportados, restaurar únicamente los campos afectados si siguen coincidiendo con el resultado original esperado. Cualquier cambio concurrente exige resolver el conflicto en otra propuesta; no sobrescribirlo. Validar que etiquetas, miembros y listas anteriores todavía existan y sean válidos. Una operación parcialmente aplicada o de resultado incierto se reconcilia primero. No prometer deshacer comentarios, notificaciones o efectos secundarios.

GitHub: para un PR sin fusionar, preparar un retiro controlado mediante cierre del PR, con autorización específica; conservar rama y commits en 1.1. No declarar el retiro completo hasta verificarlo. Para cambios fusionados, preparar una nueva rama y PR de reversión sobre el HEAD vigente con diff revisable y alcance ligado a la publicación original. No usar reset, force-push ni fusionar automáticamente. Conflictos, merge ambiguo o cambios fuera de capacidad se marcan como reversión no disponible y se ofrece procedimiento humano. Las migraciones/datos y efectos externos no se revierten por revertir código. El alcance determinista de commits/merges soportados debe quedar explícito y probado antes de habilitarlo.

## 7. Justificación y documentación de código

Cada versión candidata debe incluir problema/evidencia, objetivo, archivos/símbolos afectados, comportamiento anterior/nuevo, decisiones, riesgos, alternativas y comprobaciones realizadas/pendientes. Señalar hipótesis. La ficha y los cambios documentales quedan ligados a la huella exacta revisada; alterarlos exige nueva versión/revisión. Incluir resumen en el PR con enlaces internos sin credenciales ni enlaces privados innecesarios.

Añadir comentarios junto al código cuando expliquen motivos, restricciones, contratos o casos límite; no comentarios mecánicos por línea ni marcadores de autoría. En formatos sin comentarios, como JSON, documentar externamente. Usar la convención existente (por ejemplo JSDoc en APIs relevantes), sin prometer documentación exhaustiva de todo UTAPED. Las modificaciones de interfaces, configuración o arquitectura actualizan sus documentos pertinentes dentro del alcance aprobado. Explicar «No requiere comentario adicional» cuando el código sea claro y la ficha suficiente; la justificación del cambio siempre es obligatoria.

## 8. Asistente conversacional y mascota

Botón inferior derecho; mascota discreta dentro del encabezado al abrir, panel ampliable en escritorio y pantalla completa en móvil. Mover tema al menú de usuario/barra lateral. Conservar estilos actuales azul/gris y ambos temas; no rediseñar pantallas ajenas. Debe poder ocultarse, reducir animación, operarse con teclado y lector de pantalla, restaurar foco al cerrar y evitar tapar acciones. Avisos de trabajo terminado sin robar foco.

Capacidades iniciales: resumen de atención, alertas, informes, propuestas y trabajos; explicar evidencia; navegar a recursos; iniciar sincronización/análisis con alcance y consentimiento; preparar propuestas y reversiones; proponer cambios de horarios/notificaciones. Mostrar qué información se enviará al proveedor y usar consentimiento explícito para inferencias. Consultas simples pueden resolverse con datos estructurados sin inferencia.

Una petición identifica proyecto, recurso, alcance y fecha/zona; ante ambigüedad pregunta. «El lunes» debe concretarse como fecha/hora en America/Guayaquil antes de preparar una modificación. Mostrar de dónde procede cada respuesta y fecha de lectura. Si faltan datos, indicarlo.

El modelo solo propone llamadas a herramientas tipadas permitidas. Backend valida argumentos, permisos, versión, huella, origen y límites. Las instrucciones en tarjetas/código/documentos/respuestas son datos no confiables. Sin acceso a shell, SQL arbitrario, archivos locales libres ni tokens. Lectores solo consultan lo autorizado; no ven direcciones protegidas.

Tarjetas de acción muestran recurso, antes/después, impacto, evidencia y versión; controles distintos para decidir y ejecutar. «Sí», un texto del modelo o un correo no crean aprobación. El botón de aprobación registra motivo y versión exacta con la sesión vigente; ejecutar exige otra confirmación. Una tarjeta vieja debe rechazarse si fue revocada, ejecutada o reemplazada. Doble clic, reenvío o reconexión no duplican acciones.

Persistir conversaciones por proyecto/usuario con acceso autorizado y política de conservación visible. No habilitar purga automática en esta versión; revisión futura de privacidad y retención por separado. No guardar credenciales ni razonamiento interno. Limitar contexto y longitud, informar fallos/cuota y permitir abrir la pantalla equivalente si el asistente no puede actuar. La mascota no cambia autoridad ni estado real.

## 9. Criterios de aceptación

Todos están **pendientes de implementación y comprobación**. Cada resultado requiere fuente/commit, precondiciones, pasos, resultado esperado/real y evidencia. Los casos negativos no se sustituyen por una demostración feliz.

| ID | Caso y resultado exigido |
| --- | --- |
| REP-01 | Informe Carta con once secciones, membrete y metadatos guardados; sin placeholders inventados ni recortes; campos ausentes identificados. |
| REP-02 | Logo autorizado mantiene proporción, máximo previsto y versión histórica; ausencia de recurso no rompe exportación ni usa un icono distinto sin aprobación. |
| REP-03 | Fixture 13/29 produce 44,83 %, hitos excluidos; conjunto vacío no divide entre cero; tabla y gráfico coinciden. |
| REP-04 | Un corte no inventa tendencia; cortes con universos distintos se marcan no comparables; fecha ausente/contradictoria queda visible. |
| REP-05 | PDF por impresión revisado en Carta y A4, color y escala de grises: ejes, leyendas, tablas largas, saltos y pie legibles; sin cortes ni páginas inútiles. |
| REP-06 | Cambio de plantilla/logo/configuración no altera un informe antiguo; versión nueva conserva periodo/código y deja control de cambios. |
| REP-07 | Informe antiguo accesible por paginación/filtros; sin eliminación a 30 días; fuentes posteriores al corte se identifican. |
| REP-08 | No aparecen firmas ni aceptación humana sin evento real; HTML/textos de fuentes se escapan y no ejecutan contenido activo. |
| NOT-01 | Actividad con responsable vinculado y regla «ambos» genera destinatarios correctos, deduplicados y vista previa de razón. |
| NOT-02 | Sin correo/miembro válido no se adivina dirección; se advierte y aplica fallback al gestor solo si está configurado. |
| NOT-03 | Migración mantiene destinatario/activación actuales; quitar o sustituir receptor bloquea envíos pendientes antiguos. |
| NOT-04 | Silencio, resumen, recordatorios y presupuesto funcionan por destinatario/proyecto; correos individuales no revelan otras direcciones. |
| JOB-01 | Tres agentes muestran etapa real y tiempos; inferencia pendiente usa indicador indeterminado, nunca porcentaje temporal ficticio. |
| JOB-02 | Pérdida de conexión, timeout y reinicio se distinguen; al volver se consulta el mismo trabajo y no se duplica. |
| JOB-03 | Cobertura con 12/30 unidades indica 40 % para ese lote y declara unidad; heartbeat local no se presenta como respuesta del modelo. |
| JOB-04 | Umbral sin novedades validado produce aviso; posterior avance lo retira; fallo requiere evidencia y permite solo recuperación admitida. |
| REV-01 | Revocar autorización sin ejecución impide toma/escritura posterior y conserva decisión y motivo originales. |
| REV-02 | Carrera revocar/ejecutar tiene un único desenlace consistente; no afirma revocación tras inicio ni reintenta escritura incierta. |
| REV-03 | Reversión Trello de cada campo soportado restaura valor anterior, tras nueva revisión/aprobación/confirmación y lectura de verificación. |
| REV-04 | Cambio remoto concurrente, miembro/lista/etiqueta eliminados o resultado incierto bloquean reversión automática con diagnóstico. |
| REV-05 | Retiro autorizado de PR no fusionado cierra y verifica PR sin borrar rama; cambio fusionado soportado produce nuevo PR, nunca merge/reset/force-push. |
| REV-06 | Conflicto/merge no soportado informa límite; solicitud repetida no duplica reversión; original y reversión siguen enlazados. |
| DOC-01 | Candidato sin ficha completa no llega a aprobación; modificar ficha/diff invalida la autorización anterior. |
| DOC-02 | Ejemplos TS/Java y JSON mantienen sintaxis válida, comentarios útiles y documentación externa donde corresponda; no incluyen secretos ni autoría añadida. |
| DOC-03 | PR expone qué/por qué, riesgos y pruebas reales/pendientes; no afirma que una comprobación no ejecutada pasó. |
| CHAT-01 | Consulta identifica proyecto, evidencia y actualidad; recurso/fecha ambiguos se aclaran antes de actuar. |
| CHAT-02 | Intento de un lector, herramienta no permitida o instrucción maliciosa en fuente no produce acción ni revela datos protegidos. |
| CHAT-03 | Aprobar y ejecutar son controles separados con motivo; texto «sí» no autoriza; tarjeta vieja y doble clic se manejan sin duplicados. |
| CHAT-04 | Cerrar/reabrir chat conserva trabajo e historial autorizado; fallo/cuota no cambia proveedor automáticamente ni bloquea el panel. |
| CHAT-05 | Escritorio/móvil, teclado, foco, lector de pantalla y movimiento reducido comprobados; mascota oculta y tema accesible sin solapamientos. |
| INT-01 | Regresión 1.0 en base aislada y migración desde esquema/configuración existentes conservan decisiones, reportes y EX-01 sin reescribirlos. |
| INT-02 | End-to-end con fixtures de consulta → propuesta → revisión → decisión → ejecución → reversión conserva actor, versión, motivo y evidencia. |

## 10. Implementación y validación previstas

1. Base de control: eventos de progreso y vistas persistidas, revocación transaccional, modelos/contratos de reversión y auditoría. Reutilizar workers; evitar estados paralelos que contradigan el dominio.
2. Entrega operativa: reversión Trello, retiro/PR de reversión GitHub en casos soportados; configuración de responsables y entrega por destinatario. Pruebas de concurrencia y resultados inciertos antes de escrituras reales.
3. Informes/documentación: datos de gráfico desde cortes, metadatos y plantilla versionados, ficha de corrección y revisión visual de impresión. Conservar representación de reportes 1.0.
4. Chat/mascota: registro acotado de herramientas, tarjetas basadas en servicios existentes, persistencia y accesibilidad; conectar progresivamente las capacidades comprobadas.
5. Cierre: regresión aislada, migración/recuperación, revisión visual y evidencia por criterio. Las pruebas reales de correos/escrituras requieren destinatarios/recursos concretos y autorizaciones correspondientes; esta especificación no las ejecuta ni aprueba diffs futuros.

No cambiar los documentos de aceptación 1.0 a «1.1 superada». Antes de publicar 1.1 registrar criterios con evidencia, limitaciones, notas de migración y respaldo. No fusionar automáticamente ni publicar un paquete desde cambios sin revisar.

## 11. Pendientes y controles de alcance

- Logo localizado: `apps/web/public/brand-logo.jpg`. Organización, proceso y prefijo documental se configuran por proyecto; no se inventa aprobación institucional.
- Inventariar commits/merges que el adaptador de reversión puede reconstruir de forma segura; casos restantes deben declararse no soportados.
- Revisar la retención de conversaciones y datos personales antes de una política de eliminación futura; la referencia oral a 30 días no la autoriza.
- La sección legal/técnica se alimenta de referencias aprobadas; no se añade asesoría legal ni certificación por defecto.
- Mantener el estilo moderno existente y no ampliar a SaaS, ejecución libre de repositorios, firma certificada, nuevos proveedores ni operaciones fuera del proyecto configurado.
