# Revisión de código y correcciones

Actualización del 12 de octubre de 2026: se incorpora el [catálogo versionado de criterios](code-standard-catalog.md), complejidad como sexta categoría y [publicación controlada GitHub](github-publication.md). El propósito real se elige al crear la corrección y permanece inmutable; las correcciones anteriores se conservan como demostración. La descripción de publicación solo simulada de la novena tanda es histórica. El entorno actual sigue sin habilitar escrituras reales. La [programación diaria](project-operations.md) comparte el servicio de revisión y conserva cobertura por contenido y archivos aplazados/excluidos.

Implementación del 11 de octubre de 2026. Esta tanda añade revisión acotada de código, correcciones con tres agentes, decisiones del gestor y **simulación de publicación**. No hay adaptador de escritura en GitHub, endpoint para publicar realmente, cambios en el checkout de UTAPED ni integración automática. La aprobación de esta etapa autoriza una demostración local; no habilita una publicación futura.

## Recorrido del gestor

1. En «Revisión de código y correcciones», pulsar «Leer catálogo de GitHub». El destino procede de la conexión configurada del proyecto, actualmente UTAPED/develop.
2. Seleccionar hasta ocho archivos. Se puede revisar su estado actual o seleccionar archivos que cambiaron desde un SHA anterior. La comparación revisa el contenido actual de esos archivos; no constituye análisis completo de todas las diferencias históricas. Commits iguales se rechazan como comparación sin cambios.
3. Solicitar comprobaciones locales sin conectar ChatGPT. Para añadir análisis con IA, conectar el proveedor, elegir modelo/esfuerzo compatible y marcar el consentimiento para enviar el código de esa solicitud. Las seis pruebas sintéticas del panel del proveedor **no** autorizan el envío de código real.
4. Abrir el análisis y revisar sus archivos, commit, comprobaciones, hallazgos y límites. Ningún patrón ni conclusión del modelo se presenta como vulnerabilidad confirmada. Cero hallazgos no acredita calidad integral.
5. Seleccionar hasta diez hallazgos de no más de tres archivos, escribir un objetivo concreto y autorizar el envío a ChatGPT. Ejecutor prepara el diff; Revisor comprueba evidencia/alcance/verificación; Aprobador exige la decisión humana. No ejecutan comandos ni código.
6. Revisar el diff, riesgos, comprobaciones y dictámenes. Aprobar, rechazar o solicitar ajustes con motivo. Ajustes o invalidación permiten crear otra versión y repetir las tres etapas, sin heredar una aprobación.
7. Una versión aprobada permite registrar la simulación de `agent/<proposal-id>-v<version>` con destino a la rama configurada. Se conserva el plan, los blobs antes/después y la huella exacta. No se crea ningún commit, rama ni PR en GitHub. Una autorización puede retirarse; las evidencias y decisiones anteriores permanecen.

El consentimiento se desmarca al cambiar alcance, selección, objetivo, modelo o esfuerzo y después de aceptar una solicitud. Cada petición de IA requiere autoridad actual y una conexión vigente propia de la sesión. Las personas con acceso de consulta pueden leer el historial; no pueden leer un catálogo remoto nuevo, enviar código, decidir ni simular publicaciones.

## Fuente y límites

La lectura usa únicamente GET en `api.github.com`: commit de la rama, árbol Git completo y blobs seleccionados por SHA. Se verifica tamaño, UTF-8 y hash Git de cada blob; no se interpreta un enlace suministrado por el modelo. Un árbol truncado, una lista de comparación incompleta o un HEAD distinto del mostrado impiden preparar el análisis. La lista de archivos de una comparación se toma de su primera página, aunque los commits tengan paginación; se rechazan comparaciones que alcancen el límite de 300 archivos.

Límites de esta tanda: árbol de 2500 entradas; ocho archivos; 30 000 bytes por archivo y 120 000 bytes de código seleccionado. Se admiten TS/TSX/JS/JSX, variantes CJS/MJS, Java y JSON en rutas regulares de hasta 240 caracteres. No se admiten symlinks, submódulos como archivos editables, binarios, `.github`, `.git`, dependencias, builds ni rutas de credenciales. La detección conservadora de secretos reconocibles puede rechazar archivos legítimos; no garantiza identificar todos los secretos. Revisar los archivos antes de autorizar su envío.

La entrada serializada de cada etapa tiene un límite local de 512 000 bytes, independiente de los 120 000 bytes de código. Incluye fuente, candidato, diff, fragmentos previos/nuevos y dictámenes; no se trunca para continuar. Una entrada mayor se rechaza antes de enviar, con `INPUT_TOO_LARGE` y una indicación de reducir el alcance. Este límite de la aplicación no garantiza disponibilidad ni capacidad de contexto de todos los modelos. El 13 de octubre, un caso real de cuatro archivos produjo 35 029 bytes al llegar al Revisor y detectó el límite anterior incompatible de 32 000 bytes. La corrección conserva las evidencias y requiere continuar explícitamente la etapa pendiente; no repite el Ejecutor.

El análisis local transforma TS/JS de manera aislada con el compilador TypeScript y comprueba JSON. No ejecuta imports, scripts, código ni dependencias del repositorio. Los patrones de ejecución dinámica, composición de consultas y repetición textual producen hipótesis con líneas concretas. Java se marca `not_checked`: no se compila. No se han ejecutado builds, pruebas de UTAPED, comprobaciones de tipos entre módulos ni análisis de toda la aplicación.

Cada hallazgo generado por IA debe citar exactamente un fragmento de hasta veinte líneas del archivo seleccionado. Ruta, rango y evidencia se validan contra el texto guardado. La validación del fragmento prueba su procedencia, no la conclusión del modelo.

## Correcciones y aprobación

El Ejecutor devuelve ediciones estructuradas, no comandos ni un parche arbitrario. Se admiten como máximo tres ediciones, una por archivo existente seleccionado; cada edición cita el blob original y hasta cuarenta líneas exactas que intersectan un hallazgo seleccionado. Cada hallazgo seleccionado debe quedar cubierto por alguna edición. El reemplazo tiene hasta sesenta líneas y 6000 caracteres. No se crean, borran ni renombran archivos. El servicio construye el contenido resultante, su hash Git y el diff, conservando LF/CRLF uniforme. Un cambio sin efecto, un fragmento incorrecto o un reemplazo que exceda el alcance se rechaza.

Las comprobaciones de sintaxis del candidato se guardan. Un fallo detiene el flujo con `changes_requested`; preguntas bloqueantes o comprobaciones obligatorias incumplidas impiden un dictamen positivo. Los dictámenes no convierten una comprobación no ejecutada del proyecto en prueba superada. Una propuesta puede ser revisable y requerir pruebas adicionales de UTAPED antes de cualquier integración real.

La huella SHA-256 vincula fuente congelada, objetivo, hallazgos seleccionados y candidato completo. Revisor y Aprobador deben devolver esa misma huella. La decisión humana está ligada a proyecto, propuesta, versión y huella; se verifican los dictámenes requeridos. Antes y después de cada inferencia de preparación de correcciones, antes de aprobar y antes de simular se comprueba el destino y HEAD remoto. Cambiar el origen exige otro análisis y versión. Los rechazos y ajustes no necesitan una lectura remota para registrar la negativa.

Las llamadas a GitHub y las transacciones locales no son una transacción distribuida: la rama podría cambiar después de una lectura. Como esta fase no escribe externamente, esa carrera no produce un cambio en UTAPED. La futura publicación real deberá revalidar las precondiciones en su propio límite de escritura y gestionar resultados inciertos; estas aprobaciones demostrativas no podrán reutilizarse.

Los errores de cuota, desconexión o reinicio no repiten solicitudes automáticamente. «Continuar etapa de código pendiente» requiere una solicitud y consentimiento nuevos y reutiliza el contenido sellado de las etapas ya completadas. Un análisis de IA fallido se conserva y requiere un análisis nuevo. Se recuperan trabajos activos como `interrupted` al iniciar el servicio; esta recuperación supone una sola instancia local del servidor, como el resto de esta entrega.

Las inferencias tienen un máximo local de 180 segundos. Una espera agotada conserva `INFERENCE_TIMEOUT`, separado de una cancelación de autorización o un error de formato. Las instrucciones `code-agents-v2` explicitan propiedades, tipos de listas y límites de texto del dictamen; la validación estricta permanece activa. En la prueba real, el Revisor solicitó ajustes en la versión 1 por cobertura incompleta de invalidación CSRF y no dejó pasar el candidato al Aprobador.

## Persistencia y API

La migración `1791795600000_code-review.cjs` añade `code_analyses`, `code_sources`, `code_results`, `code_proposals`, `code_versions`, `code_candidates`, `code_jobs`, `code_messages`, `code_decisions` y `code_publications`. Las claves compuestas vinculan todas las evidencias al mismo proyecto. El rol de ejecución puede insertar y consultar; solo puede actualizar campos del ciclo de vida. Fuentes, resultados, candidatos, mensajes, decisiones y simulaciones no se pueden editar ni borrar con ese rol. El propósito demostrativo es inmutable y el estado de la propuesta sigue `authorized` después de simular: no se marca como código ejecutado o integrado.

Todas las rutas parten de `/api/v1/projects/:projectId/code-review`; las mutaciones requieren sesión del gestor, origen permitido y CSRF. Las claves UUID `requestKey` deduplican una petición aceptada; reutilizarlas con otro contenido produce conflicto. No enviar claves nuevas para reintentar una respuesta perdida sin consultar primero el historial. Se rechazan propiedades no definidas por los esquemas, en lugar de quitarlas silenciosamente.

| Método | Ruta relativa | Resultado |
| --- | --- | --- |
| GET | `/` | Últimos treinta análisis, propuestas, trabajos y simulaciones |
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

- `npm test`: 105 pruebas unitarias superadas; los escenarios de PostgreSQL se ejecutan aparte.
- `npm run test:code-db`: 14 escenarios de esta tanda con rollback, proveedor y GitHub sintéticos: permisos, CSRF, consentimiento, evidencia, tres etapas, hashes, decisiones, versiones, interrupción, cuotas, cambios de HEAD, desconexión, retirada y rol restringido.
- Las seis suites PostgreSQL anteriores suman 65 escenarios superados; no se borraron datos reales ni se modificó Trello para probarlas.
- TypeScript y build pasan. Playwright recorre análisis local, consentimiento/esfuerzo, tres agentes, ajuste, nueva versión, aprobación, simulación, retirada, historial y acceso de consulta; prueba ambos temas y móvil sin desbordamiento ni errores del navegador. Capturas en `work/ui/`, fuera de Git.
- Lectura real de UTAPED/develop, commit `248eebabac46112c2af9cd7302e1b279c11cb1a3`: `frontend/src/App.tsx`, `frontend/src/shared/api.ts` y `backend/src/main/java/ec/edu/uta/utaped/UtapedApplication.java`. Hashes Git verificados; las dos transformaciones TS pasan; compilación Java no realizada; cero hallazgos de patrones dentro de esos tres archivos. No se envió este código a ChatGPT.
- `npm run code:inspect` lista archivos permitidos de la primera conexión configurada; con rutas como argumentos lee y comprueba esos archivos sin guardar análisis, invocar IA ni modificar el repositorio.

Esta evidencia comprueba funcionamiento y controles de la aplicación. Falta evaluar la calidad real del proveedor con código y correcciones representativos, bajo consentimiento del gestor; los dobles de prueba no prueban esa calidad. La futura publicación real y los reportes semanales siguen pendientes.

Los criterios de trazabilidad, control de cambios y verificación se relacionan con [las normas de referencia acordadas](standards-and-quality.md); no se declara certificación ni cumplimiento integral de una norma ISO.

## Referencias oficiales consultadas

- [GitHub: blobs](https://docs.github.com/en/rest/git/blobs#get-a-blob), [árboles](https://docs.github.com/en/rest/git/trees#get-a-tree) y [comparación de commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits).
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) y [jsdiff](https://github.com/kpdecker/jsdiff).
- [OpenAI: modelos e inferencia con Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) y [separación de instrucciones y datos](https://developers.openai.com/api/docs/guides/prompt-engineering).
- [Fastify: validación y serialización](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), incluida la configuración explícita para rechazar propiedades adicionales.
