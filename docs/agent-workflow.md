# Agentes, propuestas y decisiones implementados

Primera etapa del 11 de octubre de 2026. Complementa el diseño objetivo de [contratos](data-contracts.md) y [estados](proposal-workflow.md); no acredita todavía todas las operaciones previstas en esos documentos.

## Alcance disponible

El gestor elige una tarjeta activa de una supervisión guardada, describe el objetivo y solicita una nueva fecha futura. La preparación requiere ChatGPT conectado en su propia sesión y confirmación del envío desde el formulario. La fecha es un objetivo de planificación, no una estimación verificada de finalización. Las tarjetas de referencia y archivadas quedan fuera del alcance.

La única acción admitida es `trello_due_change`: una tarjeta, un vencimiento anterior exacto (incluido null) y uno propuesto. No se aceptan otras tarjetas, campos, ramas, herramientas ni destinos suministrados por un modelo. Cambios de responsables, prioridades, dependencias, código y publicación de reportes quedan para etapas posteriores. No existe escritura en Trello: `authorized` registra la decisión del gestor y no significa `executed`.

## Tres etapas secuenciales

1. **Ejecutor:** propone objetivo, justificación, alternativas, impacto, riesgos, verificación, recuperación, preguntas pendientes, evidencia y acción exacta. El servicio exige formato estricto y evidencia conocida, incluido `card.due`, y sella el contenido con SHA-256 junto con su contexto, objetivo y fecha solicitada.
2. **Revisor:** recibe ese contenido y su huella. Comprueba evidencia, alcance, valores previos, riesgos y verificación. Solo `validated` con todas las comprobaciones en `pass` y sin preguntas bloqueantes continúa. Puede devolver `changes_requested` o `rejected` con motivos.
3. **Aprobador:** recibe el mismo contenido y el dictamen anterior. Comprueba autoridad exclusiva del gestor, alcance de una tarjeta y ausencia de ejecución. El resultado positivo admisible es `human_required`. `policy_allowed` y `authorized` se rechazan para esta operación externa.

El servicio aplica las transiciones. El gestor de la aplicación decide; ser responsable de una actividad o miembro de Trello no concede permiso. El panel muestra las explicaciones, comprobaciones y errores; no conserva ni muestra razonamiento interno del modelo. La validación estructural no demuestra que toda explicación libre sea correcta: el gestor debe revisar también justificación, impacto y riesgos.

## Datos intercambiados y conservados

Cada versión congela IDs de proyecto, supervisión e instantánea, política de seguimiento, línea base, instante observado y datos mínimos de la tarjeta: ID, nombre, estado, inicio, vencimiento y WBS. No se envían descripciones, perfiles de miembros, comentarios, código ni credenciales. El objetivo escrito por el gestor y las respuestas previas también se envían; el formulario lo indica antes de iniciar. Se bloquean formatos comunes de credenciales en el objetivo/nombre, sin presentar esta detección como garantía completa de anonimización.

Cada entrada de etapa incluye `schemaVersion`, `messageId`, `runId` (trabajo de agentes), `createdAt`, `correlationId` (propuesta), `causationId` (mensaje válido anterior), `snapshotIds`, `policyVersion`, productor, destinatario, propuesta/versión y contexto. El contenido específico permanece en campos explícitos; todavía no utiliza todos los objetos del contrato objetivo. El ID de entrada coincide con el mensaje válido guardado. Los dictámenes conservan `contentHash` para identificar el contenido revisado.

PostgreSQL conserva versiones, contenido sellado, solicitudes idempotentes, mensajes y decisiones. Cada trabajo registra modelo y esfuerzo de razonamiento solicitado; cada respuesta válida registra tiempo y uso numérico comunicado por el proveedor. El contenido de propuesta se limita a 12 KB y cada dictamen a 8 KB para mantener acotado el intercambio posterior. No se guardan respuestas inválidas sin filtrar ni mensajes privados del proveedor. El historial y los borradores se consultan únicamente por integrantes autenticados del proyecto. La lista devuelve las últimas treinta propuestas y trabajos; el detalle de una versión anterior sigue siendo accesible.

## Decisión y corrección

La decisión exige la última versión en `pending_human_approval`, su huella exacta, dictamen válido de Revisor y resultado `human_required` de Aprobador. Aprobar requiere confirmación explícita del gestor; rechazo o solicitud de ajuste requiere motivo. La decisión se anexa una sola vez y conserva actor, instante, versión, huella y motivo. Otra solicitud sobre esa misma versión no puede reemplazarla. Repetir la misma clave UUID devuelve la decisión original.

Un ajuste deja la versión en `changes_requested`. El botón **Usar esta propuesta como base del ajuste** carga sus valores en el formulario; el gestor cambia el objetivo o la fecha y solicita una versión nueva. Esta versión congela una supervisión vigente y repite las tres etapas sin heredar autorización. `invalidated` también permite una versión nueva. `rejected` es definitivo para esa propuesta; una alternativa requiere otra propuesta.

## Vigencia, fallos y recuperación

Antes de preparar, antes/después de inferencia al publicar cada etapa y al decidir, se verifican permisos vigentes. El servicio compara la tarjeta con la última lectura local: nombre, estado, inicio, vencimiento, WBS, miembros asignados, dependencias, archivo, tipo y `dueComplete`. Comprueba también versión de política, referencia de línea base y antigüedad de lectura según el umbral dinámico del proyecto. Descripciones y cambios en otras tarjetas no invalidan por sí solos esta propuesta acotada.

Si cambia un dato relevante, la política o la línea base, o vence la lectura, la decisión no se registra como aprobación. La propuesta pasa a `invalidated`; el gestor actualiza fuentes, analiza y prepara otra versión. **Comprobar vigencia de la propuesta** también permite invalidar una versión detenida o autorizada. No se relee Trello en cada aprobación: la comparación se hace contra la caché local y esto se explica en el detalle. La futura ejecución deberá releer Trello, verificar permisos y precondiciones, serializar escrituras propias y comprobar el efecto remoto; ninguna autorización anterior evita esos controles.

Las inferencias no mantienen abierta una transacción de PostgreSQL. Hay un trabajo de agentes activo por proyecto y las claves de idempotencia evitan repetir inferencias por una solicitud duplicada. Se valida la conexión y los permisos antes y después de cada llamada; cerrar sesión, desconectar, sustituir la conexión o perder permisos impide publicar el resultado como válido.

Falta de cuota, respuesta inválida o desconexión registra un fallo operativo, sin fabricar rechazo ni revisión positiva. La versión conserva la etapa pendiente y los mensajes anteriores. **Continuar etapa pendiente** exige nueva solicitud y confirmación del gestor, ejecuta solamente lo pendiente y puede consumir uso del plan. Ante fuente cambiada, comprobar vigencia y crear una versión nueva. No hay reintentos automáticos de IA. Tras reinicio, trabajos en curso quedan `interrupted`; esta recuperación corresponde a un solo proceso local, no a una plataforma distribuida.

## Verificación y límites de evidencia

Se ejecutaron comprobación TypeScript, compilación y pruebas del contrato de propuestas y transporte del razonamiento. Once escenarios con PostgreSQL real y rollback verifican flujo completo, roles/CSRF/origen, idempotencia, versionado, ajustes y rechazo humano, bloqueo de aprobación automática, límite de cuota, continuación, invalidación por fuente/política, pérdida de conexión/permisos, recuperación sin repetición y privilegios de historial. Uno de esos escenarios realiza preparación y autorización bajo el rol restringido del servicio.

El recorrido de Playwright con proyecto y proveedor sintéticos verifica selección de razonamiento en evaluación y agentes, consentimiento, tres etapas, ajuste a versión 2, aprobación humana, consulta de versión 1, restricciones del lector, ambos temas y ausencia de desbordamiento móvil o errores del navegador. Sus respuestas simuladas verifican el funcionamiento del sistema, no la calidad real de los modelos. La batería real anterior de seis casos tampoco mide estos tres nuevos prompts. Queda pendiente evaluarlos con casos representativos reales, conservando evidencia y decisiones humanas, antes de habilitar ejecución externa.

## Ajuste tras la primera propuesta real

El 11 de octubre se verificó en PostgreSQL la primera propuesta real, versión 1: trabajo `155da0c0-8b32-4988-8ee5-6e26ca528dbf`, `gpt-6.1-sol`, esfuerzo `low`. Ejecutor: 21 361 ms, 1676 tokens; Revisor: 16 175 ms, 1966 tokens. El resultado fue `changes_requested`; no se invocó el Aprobador ni se registró aprobación. La suma de uso comunicado fue 3642 tokens. Estos datos acreditan inferencia real de dos etapas y devolución persistida, no el flujo completo con tres dictámenes satisfactorios.

La revisión detectó una fecha propuesta anterior al inicio y ausencia de verificación posterior, pero también pidió autorización humana antes de completar la revisión. Se corrigieron las instrucciones en `proposal-agents-v2`: revisión de preparación separada de aprobación y ejecución; la autorización pendiente y la futura relectura remota no bloquean por sí mismas el borrador. Preguntas pendientes contienen solo impedimentos para especificar o revisar la acción. La incertidumbre de duración y causas permanece como riesgo, sin prometer finalización. El plan debe prever aprobación/relectura antes de escribir, lectura de la misma tarjeta y vencimiento después, y reconciliación de discrepancias sin reintento ciego. Se conserva la versión anterior sin alterar mensajes ni dictámenes.

La preparación ahora rechaza fechas anteriores al inicio registrado mediante validación determinista, antes de crear trabajos o inferencias; la interfaz muestra inicio/vencimiento y avisa de esa incoherencia. La nueva versión de instrucciones queda identificada en cada entrada de etapa. Estas mejoras se comprueban con pruebas de fechas, ausencia de consumo ante entrada inválida y recorrido sintético de navegador. Sigue pendiente repetir el recorrido completo con el modelo real y una fecha coherente.

## Validación real de la versión 2

La versión 2 de la misma propuesta completó las tres etapas con `gpt-6.1-sol` el 11 de octubre: trabajo `e6c9ec75-ee1a-4846-8013-d83a46106af2`, de 09:35:47 a 09:36:35, America/Guayaquil. No se solicitó un esfuerzo explícito (`reasoning_effort=null`); no atribuir esta prueba a un nivel seleccionado. El Ejecutor entregó una acción acotada, sin preguntas bloqueantes, con incertidumbre separada de la fecha objetivo y un plan de verificación anterior/posterior. El Revisor devolvió `validated`, cinco comprobaciones `pass` y cero incidencias. El Aprobador devolvió `human_required`, tres comprobaciones `pass` y cero incidencias. El estado persistido es `pending_human_approval`; esta prueba no registra decisión humana ni ejecución externa.

| Etapa | Duración (ms) | Entrada | Salida | Tokens totales |
| --- | --- | --- | --- | --- |
| Ejecutor | 22 902 | 1366 | 750 | 2116 |
| Revisor | 15 102 | 2015 | 492 | 2507 |
| Aprobador | 9834 | 2374 | 323 | 2697 |

Duración total del trabajo: 47 936 ms; suma de inferencias: 47 838 ms. Uso comunicado: 5755 tokens de entrada, 1565 de salida, 7320 totales. Se consultaron los registros reales y los dictámenes normalizados: la separación entre preparación, decisión del gestor y futura ejecución funcionó en este caso; también se revisó el cálculo del desplazamiento y la existencia de verificación posterior y tratamiento de discrepancias. Un caso satisfactorio no demuestra calidad universal, resistencia completa a entradas adversarias ni cuota futura. Sigue pendiente ampliar la evaluación representativa y desarrollar los controles de ejecución externa.
