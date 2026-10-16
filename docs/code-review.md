# Revisión de código y correcciones

La versión actual incluye análisis acotado, seis categorías del [catálogo de criterios](code-standard-catalog.md), correcciones de tres roles, simulación demostrativa y [publicación real controlada en GitHub](github-publication.md). Esta última exige configuración, credenciales separadas, propósito real y autorización/confirmación específicas; no realiza merge. No se presupone el valor de los indicadores locales de escritura.

La pestaña de cobertura del repositorio ofrece una [cola progresiva independiente](repository-coverage.md). Sus fragmentos no se convierten directamente en cambios publicables; para corregir se vuelve al análisis acotado y sus revisiones.

## Recorrido del gestor

1. Abrir Código y preparar un nuevo análisis desde el catálogo configurado.
2. Seleccionar hasta ocho archivos permitidos o una comparación con commit base explícito.
3. Elegir reglas locales o IA con proveedor/modelo y consentimiento de envío. Las evaluaciones sintéticas no autorizan enviar código real.
4. Revisar hallazgos, evidencia, commit, comprobaciones y límites. Cero hallazgos no acredita calidad integral.
5. Seleccionar hallazgos de hasta tres archivos, describir objetivo y propósito, y preparar el candidato mediante los tres roles.
6. Decidir sobre la versión/huella exactas con motivo. Ajustes crean otra versión y repiten revisión.
7. En demostración, registrar solo simulación. En uso real autorizado, solicitar la publicación confirmada y consultar su verificación; la integración es humana.

Lectores consultan evidencia, pero no solicitan catálogo remoto, envían código, deciden o publican. Los botones y la disposición corresponden a la interfaz actual; consultar la [guía operativa](first-release-guide.md).

## Fuente y límites

La lectura usa únicamente GET en `api.github.com`: commit de la rama, árbol Git completo y blobs seleccionados por SHA. Se verifica tamaño, UTF-8 y hash Git de cada blob; no se interpreta un enlace suministrado por el modelo. Un árbol truncado, una lista de comparación incompleta o un HEAD distinto del mostrado impiden preparar el análisis. La lista de archivos de una comparación se toma de su primera página, aunque los commits tengan paginación; se rechazan comparaciones que alcancen el límite de 300 archivos.

Límites del análisis acotado: árbol de 2500 entradas; ocho archivos; 30 000 bytes por archivo y 120 000 bytes de código seleccionado. Se admiten TS/TSX/JS/JSX, variantes CJS/MJS, Java y JSON en rutas regulares de hasta 240 caracteres. No se admiten symlinks, submódulos como archivos editables, binarios, `.github`, `.git`, dependencias, builds ni rutas de credenciales. La detección conservadora de secretos reconocibles puede rechazar archivos legítimos; no garantiza identificar todos los secretos. Revisar los archivos antes de autorizar su envío.

La entrada serializada de cada etapa tiene un límite local de 512 000 bytes, independiente de los 120 000 bytes de código. Incluye fuente, candidato, diff, fragmentos previos/nuevos y dictámenes; no se trunca para continuar. Una entrada mayor se rechaza antes de enviar, con `INPUT_TOO_LARGE` y una indicación de reducir el alcance. Este límite de la aplicación no garantiza disponibilidad ni capacidad de contexto de todos los modelos. El 13 de octubre, un caso real de cuatro archivos produjo 35 029 bytes al llegar al Revisor y detectó el límite anterior incompatible de 32 000 bytes. La corrección conserva las evidencias y requiere continuar explícitamente la etapa pendiente; no repite el Ejecutor.

El análisis local transforma TS/JS de manera aislada con el compilador TypeScript y comprueba JSON. No ejecuta imports, scripts, código ni dependencias del repositorio. Los patrones de ejecución dinámica, composición de consultas y repetición textual producen hipótesis con líneas concretas. Java se marca `not_checked`: no se compila. El analizador no ejecuta builds, pruebas de UTAPED ni comprobaciones de tipos entre módulos. Las comprobaciones funcionales documentadas de candidatos concretos tienen un alcance separado y no validan toda la aplicación.

Cada hallazgo generado por IA debe citar exactamente un fragmento de hasta veinte líneas del archivo seleccionado. Ruta, rango y evidencia se validan contra el texto guardado. La validación del fragmento prueba su procedencia, no la conclusión del modelo.

## Correcciones y aprobación

El Ejecutor devuelve ediciones estructuradas, no comandos ni un parche arbitrario. Se admiten como máximo tres ediciones, una por archivo existente seleccionado; cada edición cita el blob original y hasta cuarenta líneas exactas que intersectan un hallazgo seleccionado. Cada hallazgo seleccionado debe quedar cubierto por alguna edición. El reemplazo tiene hasta sesenta líneas y 6000 caracteres. No se crean, borran ni renombran archivos. El servicio construye el contenido resultante, su hash Git y el diff, conservando LF/CRLF uniforme. Un cambio sin efecto, un fragmento incorrecto o un reemplazo que exceda el alcance se rechaza.

Las comprobaciones de sintaxis del candidato se guardan. Un fallo detiene el flujo con `changes_requested`; preguntas bloqueantes o comprobaciones obligatorias incumplidas impiden un dictamen positivo. Los dictámenes no convierten una comprobación no ejecutada del proyecto en prueba superada. Una propuesta puede ser revisable y requerir pruebas adicionales de UTAPED antes de cualquier integración real.

La huella SHA-256 vincula fuente congelada, objetivo, hallazgos seleccionados y candidato completo. Revisor y Aprobador deben devolver esa misma huella. La decisión humana está ligada a proyecto, propuesta, versión y huella; se verifican los dictámenes requeridos. Antes y después de cada inferencia de preparación de correcciones, antes de aprobar y antes de simular o publicar se comprueba el destino y HEAD remoto. Cambiar el origen exige otro análisis y versión. Los rechazos y ajustes no necesitan una lectura remota para registrar la negativa.

Las llamadas a GitHub y las transacciones locales no son una transacción distribuida: la rama podría cambiar después de una lectura. La publicación real revalida las precondiciones en su propio límite de escritura y gestiona resultados inciertos. Las aprobaciones demostrativas no pueden reutilizarse para una publicación real.

Los errores de cuota, desconexión o reinicio no repiten solicitudes automáticamente. «Continuar etapa de código pendiente» requiere una solicitud y consentimiento nuevos y reutiliza el contenido sellado de las etapas ya completadas. Un análisis de IA fallido se conserva y requiere un análisis nuevo. Se recuperan trabajos activos como `interrupted` al iniciar el servicio; esta recuperación supone una sola instancia local del servidor, como el resto de esta entrega.

El adaptador ChatGPT aplica un máximo local de 180 segundos; los límites de otros proveedores se documentan por separado. Una espera agotada conserva `INFERENCE_TIMEOUT`, separado de una cancelación de autorización o un error de formato. Las instrucciones `code-agents-v2` explicitan propiedades, tipos de listas y límites de texto del dictamen; la validación estricta permanece activa. En la prueba real, el Revisor solicitó ajustes en la versión 1 por cobertura incompleta de invalidación CSRF y no dejó pasar el candidato al Aprobador.

## Persistencia y API

La migración `1791795600000_code-review.cjs` añade `code_analyses`, `code_sources`, `code_results`, `code_proposals`, `code_versions`, `code_candidates`, `code_jobs`, `code_messages`, `code_decisions` y `code_publications`. Las claves compuestas vinculan todas las evidencias al mismo proyecto. El rol de ejecución puede insertar y consultar; solo puede actualizar campos del ciclo de vida. Fuentes, resultados, candidatos, mensajes, decisiones y simulaciones no se pueden editar ni borrar con ese rol. El propósito demostrativo es inmutable y el estado de la propuesta sigue `authorized` después de simular: no se marca como código ejecutado o integrado.

Todas las rutas parten de `/api/v1/projects/:projectId/code-review`; las mutaciones requieren sesión del gestor, origen permitido y CSRF. Las claves UUID `requestKey` deduplican una petición aceptada; reutilizarlas con otro contenido produce conflicto. No enviar claves nuevas para reintentar una respuesta perdida sin consultar primero el historial. Se rechazan propiedades no definidas por los esquemas, en lugar de quitarlas silenciosamente.

| Método | Ruta relativa | Resultado |
| --- | --- | --- |
| GET | `/` | Últimos treinta análisis, propuestas, trabajos y publicaciones |
| GET | `/catalog` | Catálogo remoto acotado, solo gestor |
| POST | `/analyses` | Fuente congelada y análisis local o de IA; 202 |
| GET | `/analyses/:analysisId` | Fuente, resultado y límites guardados |
| POST | `/proposals` | Nueva corrección o versión con tres agentes; 202 |
| GET | `/proposals/:proposalId/versions/:version` | Candidato, dictámenes y decisiones |
| POST | `/proposals/:proposalId/versions/:version/resume` | Continúa únicamente etapas pendientes; 202 |
| POST | `/proposals/:proposalId/versions/:version/recheck` | Comprueba vigencia del origen |
| POST | `/proposals/:proposalId/versions/:version/decisions` | Aprobar/rechazar/ajustar con motivo y huella |
| POST | `/proposals/:proposalId/versions/:version/withdraw` | Retira una corrección con motivo |
| POST | `/proposals/:proposalId/versions/:version/simulate-publication` | Registra el plan; cero escrituras externas |

Análisis: `paths`, `expectedHead`, `mode`, `baseSha` cuando se compara, `withAi`, `requestKey`; con IA, `consent=true`, `model` y `reasoningEffort` opcional. Corrección: `analysisId`, `findingIds`, `goal`, `model`, `consent=true`, `requestKey`; nueva versión con `proposalId`/`expectedVersion` juntos. Decisión: `contentHash`, `decision`, `reason`, `requestKey`. Simulación: `contentHash`, `requestKey`. La UI genera claves y conserva la clave de una solicitud cuyo resultado no pudo confirmar.

## Comprobaciones y evidencia

Las comprobaciones actuales están en [aceptación real](validation/real-acceptance-validation.md), [cierre de validación](validation/validation-closeout.md) y [verificación de versión](validation/release-validation.md). Los conteos y el alcance de la primera tanda permanecen en el [registro histórico](archive/validation/code-review.md); no describen las capacidades actuales de publicación.

Usar `npm run test:isolated` para las integraciones en una base desechable. `npm run code:inspect` es una lectura explícita acotada sin guardar análisis ni invocar IA. No se ejecutan builds o pruebas completas de UTAPED por analizar sus archivos. Las pruebas específicas de candidatos conservan los límites documentados; Java sigue sin compilarse en el analizador.

El contrato de publicación real está en su [guía específica](github-publication.md); las restricciones de fuentes, candidatos, evidencia y decisiones anteriores siguen vigentes. No se declara certificación ISO.
