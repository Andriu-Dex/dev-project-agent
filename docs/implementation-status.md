# Estado de implementación

Fecha: 7 de octubre de 2026. El usuario autorizó iniciar implementación. El producto y repositorio remoto se llaman dev-project-agent; la carpeta local conserva utaped-agent. Se trabaja en develop. La planificación anterior describe el diseño objetivo y no acredita funcionalidades terminadas.

## Primera base

- npm workspaces: apps/web, apps/server y packages/contracts.
- Panel React/Vite en español, con comprobación real del servicio y PostgreSQL. No contiene porcentajes, actividades ni resultados ficticios.
- Servicio Fastify en loopback, GET /api/v1/health, respuestas estructuradas y errores saneados.
- Contrato compartido HealthResponse y JSON Schema para la respuesta. Los contratos de la primera etapa de propuestas/agentes se incorporaron en la séptima tanda; el diseño completo sigue siendo objetivo.
- PostgreSQL independiente mediante Docker Compose, puerto local 15434, volumen propio e imagen fijada por digest. No utiliza la base ni las credenciales de UTAPED.
- Configuración local generada sin imprimir credenciales y excluida de Git. Procedimiento idempotente que no reemplaza .env existente.
- Primera migración: projects y audit_events. Rol de ejecución sin privilegios de superusuario o creación de esquema; auditoría con SELECT/INSERT, sin UPDATE/DELETE.

Ya se incorporaron usuarios/sesiones y autorización por proyecto; véase [acceso local](authentication.md). No están implementados todavía: conectores reales, tres agentes, propuestas, ejecución externa ni reportes. No se exponen datos de proyecto sin autenticación; solo la comprobación mínima de disponibilidad.

## Entorno y versiones seleccionadas

Node.js 24.19.0 LTS, npm 11.17.0, Docker Engine 29.2.1 y Compose 5.0.2 disponibles. Se verificaron metadatos de compatibilidad en npm antes de instalar. Dependencias directas exactas y árbol reproducible en package-lock.json.

| Componente | Versión |
| --- | --- |
| PostgreSQL | 18.6, imagen fijada por digest |
| TypeScript | 6.0.3 |
| Fastify | 5.12.5 |
| React / React DOM | 19.3.0 |
| Vite / plugin-react | 8.3.3 / 6.1.2 |
| pg / node-pg-migrate | 8.23.1 / 9.0.0 |
| Vitest / tsx | 5.0.3 / 4.23.15 |

Se selecciona TypeScript 6 compatible con esta base; no es obligatorio adoptar una nueva versión mayor para arrancar. Fuentes: [Node.js](https://nodejs.org/en/about/previous-releases), [Vite](https://vite.dev/guide/) y [PostgreSQL](https://www.postgresql.org/support/versioning/). Las versiones instaladas se contrastan con el archivo de bloqueo.

## Validación documental del proveedor de IA

Existe una ruta oficial Sign in with ChatGPT para aplicaciones compatibles. El acceso a la identidad y el permiso para usar el plan son distintos. El flujo de registro dinámico para clientes elegibles necesita autorización propia del usuario, PKCE, state/nonce, verificación del ID token, permisos concedidos y almacenamiento seguro. No se reutilizan credenciales de Codex ni cookies del navegador.

La disponibilidad para socios de código abierto y clientes privados seleccionados no garantiza elegibilidad de esta aplicación o cuenta. Tener un repositorio en GitHub no demuestra por sí solo la condición de código abierto. No se cambia visibilidad ni licencia automáticamente.

El adaptador previsto utilizaría el catálogo de modelos de la cuenta y Responses API con store=false, stream=true, contexto explícito y comprobación de finalización; existen restricciones de parámetros y herramientas en la vista previa. La política de aprobación seguirá en el servicio.

Fuentes oficiales consultadas: [opciones y elegibilidad](https://developers.openai.com/siwc/quickstart), [registro e inicio de sesión](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [inferencia](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) y [limitaciones](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Estado actualizado el 11 de octubre: autorización de esta cuenta e inferencia sintética real verificadas; véase [evidencia del proveedor](provider-validation.md). El adaptador de producción, renovación protegida, evaluación de calidad y disponibilidad futura de cuota siguen pendientes. Ollama no está instalado y sigue pendiente de evaluación; no se descargaron modelos ni se activó facturación.

## Verificación y siguiente paso

Verificaciones realizadas: instalación con auditoría npm sin vulnerabilidades reportadas; comprobación TypeScript; compilación de los tres workspaces; tres pruebas del servicio; migración aplicada y repetida sin duplicación; comprobación real del rol de ejecución y de permisos de auditoría con rollback. El panel se abrió en el navegador y mostró disponibilidad real, caída de PostgreSQL y recuperación tras reiniciarlo. Las comprobaciones del navegador usaron su árbol de accesibilidad; la captura de pantalla no estuvo disponible.

Durante la primera base no se realizaron consultas de IA, pruebas de cuota, lectura en línea de Trello ni cambios en UTAPED. Por autorización del usuario, la primera base y sus cambios de estilos/temas se guardaron en el commit 9a764ff (`feat(core): initialize application foundation with theme support`). No se hizo push.

Segunda implementación: acceso local del gestor y lectores, sesiones PostgreSQL, permisos por proyecto, auditoría, comandos administrativos y pantalla de acceso compatible con ambos temas. Se verifican 11 escenarios de integración de autenticación con PostgreSQL real y rollback, además de las pruebas de configuración y disponibilidad. No se han creado cuentas reales: el gestor elige su contraseña mediante `npm run user:create`.

La segunda implementación y los ajustes visuales adicionales revisados quedaron en el commit a50cad7 (`feat(auth): add local accounts and project access control`). El usuario creó su cuenta con el comando administrativo.

Tercera implementación: [lectura y sincronización de Trello](trello-integration.md). Adaptador GET, instantáneas inmutables, comparación, permisos, auditoría, conservación ante fallos y panel. Exportación privada importada: 25 actividades, seis hitos y 14 actividades completadas declaradas. Ocho pruebas unitarias nuevas y cuatro escenarios de integración PostgreSQL. El 9 de octubre se verificó una lectura real y su persistencia usando las credenciales que el usuario configuró en .env: mismos recuentos y cero cambios frente a la exportación. La nueva instantánea tiene origen api; no se modificó Trello.

Cuarta implementación integrada el 11 de octubre: [reglas deterministas de seguimiento](tracking-rules.md), endpoint autenticado y panel con avance declarado, vencimientos, calidad de datos y antigüedad de fuentes. Los umbrales se guardan por proyecto en PostgreSQL, con versiones y auditoría; el gestor los edita desde el panel. La migración aplicada inicializa 72 h/60 min como propuesta pendiente de confirmación. Nueve escenarios de integración Trello/seguimiento verifican persistencia, permisos, efecto inmediato, conflictos y rollback. Dependencias, causas e impacto siguen pendientes; no se modificó Trello.

Quinta tanda integrada el 11 de octubre: [supervisión de fuentes, línea base e historial](supervision.md). GitHub conectado en lectura, planificación detallada y dependencias de Trello, confirmación explícita de referencia, desviaciones, trabajos persistentes con recuperación y resultados congelados. Se verificó lectura y persistencia reales de ambas fuentes. La línea base de UTAPED sigue sin confirmar; el gestor la elige desde el panel. Diez escenarios nuevos de PostgreSQL y recorrido de navegador con proyecto sintético verifican flujo completo, roles, historia, recuperación, auditoría, ambos temas y móvil. El recorrido corrigió el cierre de sesión que enviaba Content-Type JSON sin cuerpo.

También se completó [validación oficial de ChatGPT](provider-validation.md), con callback, PKCE, comprobación de identidad/permiso e inferencia sintética real. Tras el inicio de sesión del usuario, `gpt-6.1-sol` completó la solicitud en 2004 ms con JSON válido y 29 tokens totales. Esta evidencia acredita acceso básico, mientras que las pruebas del contrato verifican el comportamiento del adaptador. No se instalaron Ollama ni modelos.

Sexta tanda del 11 de octubre: [conexión y evaluación de ChatGPT desde el panel](provider-validation.md). Conexión ligada al gestor/proyecto/sesión, PKCE, catálogo de cuenta y elección de modelo, acceso temporal solo en memoria, desconexión y batería sintética de seis casos con calificación determinista e historial PostgreSQL. Solicitudes idempotentes, límite de una evaluación activa por proyecto, comprobación de permisos antes/después de inferencia y recuperación de interrupciones sin repetir uso automáticamente. Siete escenarios PostgreSQL y recorrido de navegador con proveedor simulado verifican el flujo; la evaluación real registrada se describe a continuación. No se atribuye a esta simulación calidad del modelo real.

La evaluación real desde el panel se completó el 11 de octubre a las 02:15:10, America/Guayaquil: `gpt-6.1-sol`, seis de seis casos superados, 27 136 ms y 2005 tokens totales. Se revisaron las respuestas guardadas: evidencia e incertidumbre correctas y ausencia de ejecución; debe afinarse la redacción de autoridad para exigir al gestor, distinguiéndolo del responsable de una actividad. Véase [evidencia detallada](provider-validation.md). Esta revisión técnica no sustituye la aceptación humana ni habilita producción.

Séptima tanda del 11 de octubre: [Ejecutor, Revisor, Aprobador, propuestas y decisiones](agent-workflow.md). Primera operación: proponer el vencimiento de una tarjeta con valores previo y nuevo exactos, evidencia, riesgos, alternativas y recuperación. Se conserva cada versión, su huella, dictámenes y decisión del gestor; ajustes repiten todas las etapas. Se incorpora selección de esfuerzo de razonamiento verificado para `gpt-6.1-sol`. La aprobación solo registra autorización; no hay ejecución externa. Las comprobaciones realizadas se detallan en el documento del flujo. Después: evaluación representativa real de los tres agentes, ejecución autorizada, revisión de código y reportes semanales. No se activaron supervisiones periódicas ni escrituras externas.

Validación real posterior: la versión 1 solicitó ajustes tras dos etapas; la versión 2 completó Ejecutor, Revisor (`validated`) y Aprobador (`human_required`) el 11 de octubre a las 09:36:35, America/Guayaquil. Duración total 47 936 ms, uso comunicado 7320 tokens, esfuerzo predeterminado. El gestor la aprobó como demostración y posteriormente pidió que no modificara Trello; su autorización local se retiró y quedó invalidada, conservando la decisión original y su evidencia. No hubo ejecución externa. Véase [evidencia del flujo](agent-workflow.md). Este caso verifica funcionamiento real de las tres etapas, no calidad suficiente para todas las propuestas.


## Octava tanda: ejecución controlada sin escrituras reales

La implementación acumulada anterior quedó en `c06b0f7` (`feat(workflow): add source supervision and reviewed agent proposals`), después de comprobar 111 pruebas (63 unitarias y 48 de PostgreSQL). No se hizo push.

Se implementan [ejecución controlada y reconciliación en Trello](trello-execution.md), propósito inmutable de demostración/uso real, retirada de autorización, decisión separada de solicitud de ejecución, credencial de escritura independiente y configuración desactivada por defecto. Se guardan intención, aprobación/huella exacta, límite persistido antes del PUT, lectura previa/posterior y comprobaciones con permisos restringidos. Se verifica autoridad actual, tablero, configuración y fuente; los resultados inciertos impiden otra escritura y requieren lectura de reconciliación. Reiniciar no repite peticiones externas.

Por petición del usuario, la versión 2 demostrativa ya aprobada quedó `invalidated`, con auditoría de retirada; todos los registros anteriores se clasifican como `demonstration`. Esta tanda no modificó Trello, UTAPED ni sus fechas. Las pruebas utilizan peticiones simuladas y datos PostgreSQL con rollback. GitHub, revisión/corrección de código y reportes semanales quedan como pasos posteriores.

Verificación de esta tanda: 79 pruebas unitarias y 65 escenarios de PostgreSQL ejecutados (144 en total); estos últimos comprenden 17 escenarios nuevos de ejecución y 48 de las tandas anteriores. TypeScript, compilación, comprobación del rol de base y recorrido Playwright pasan. Se inspeccionaron las capturas de la interfaz; ambos temas y móvil pasan sin desbordamiento ni errores del navegador. Se confirmó localmente `purpose=demonstration`, `state=invalidated`, cero trabajos de ejecución para la propuesta anterior y escrituras desactivadas sin token de escritura.


## Novena tanda: revisión de código y publicación simulada

La tanda anterior quedó en `ecf60a7` (`feat(execution): add gated Trello writes and reconciliation`). Se implementa [revisión de código y correcciones](code-review.md): lectura GitHub por commit/blob, alcance explícito, comprobaciones locales, análisis opcional con consentimiento para enviar código, evidencia por líneas, correcciones pequeñas con diff, tres agentes, decisiones del gestor, versiones inmutables y simulación de rama/PR. No hay escritura GitHub ni integración automática. La aprobación de esta etapa es demostrativa y no será reutilizable para una publicación real futura.

El servicio y sus contratos quedaron en `68d55c0` (`feat(code-review): add pinned analysis and reviewed correction workflows`). Se añaden diez tablas con permisos restringidos, auditoría y recuperación sin repetir inferencias automáticamente. Cambiar el HEAD o la conexión bloquea la aprobación y exige nueva fuente/versionado. La propuesta demostrativa anterior de Trello sigue invalidada; no se modifica el tablero ni el checkout de UTAPED. El asset de logo aportado por el usuario se revisa e incorpora por separado.

Verificación: 105 pruebas unitarias, 14 escenarios nuevos PostgreSQL y 65 escenarios anteriores (184 pruebas en total), TypeScript, build y recorrido Playwright con ambas interfaces, temas y móvil. Lectura real de tres archivos de UTAPED/develop en `248eebabac46112c2af9cd7302e1b279c11cb1a3`: blobs verificados, dos transformaciones TS sin errores y Java explícitamente no compilado. Esta lectura no envía código real a ChatGPT. Los tres agentes nuevos se verifican con respuestas sintéticas; la calidad real de sus correcciones aún requiere evaluación representativa del gestor.

La futura publicación GitHub real requiere un límite persistido antes de escribir, credencial independiente, propósito real separado y reconciliación de respuestas inciertas. No se habilita por añadir variables de entorno ni aprobar estas demostraciones.

## Décima tanda: reportes semanales y acceso renovable

Se integran [reportes semanales](weekly-reports.md) con programación configurable, recuperación de cortes pendientes, inicio real/parcial, snapshots anteriores al corte o evidencia posterior explícita, avance reproducible, línea base histórica, revisión de código conservada, eventos de propuestas/decisiones/ejecuciones, comprobaciones deterministas secuenciales y publicación interna. Versiones corregidas conservan periodo y contenido anterior. HTML autenticado permite impresión A4/PDF; no se añaden motores PDF ni envíos externos. El gestor activa la programación desde el panel.

El [acceso renovable](renewable-access.md) se guarda cifrado, renueva cerca del vencimiento sin navegador, recupera conexiones tras reinicio/logout y distingue fallos temporales de revocaciones y rotaciones inciertas. El cierre de sesión web conserva sus límites; desconectar ChatGPT borra y solicita revocación. La instalación genera una clave local sin imprimirla y aplica tres migraciones. La cuenta real debe conectar una vez para establecer el acceso que antes no se conservaba.

Verificación: 112 pruebas unitarias y 102 escenarios PostgreSQL (214 pruebas), TypeScript, build, rol restringido y recorrido Playwright. Los nuevos escenarios comprenden nueve de renovación y catorce de reportes. Se inspeccionó un PDF A4 sintético de tres páginas y capturas de ambos temas/móvil. Se corrigió una carrera del polling que dejaba el detalle en cola tras publicar. Las pruebas de integración usan rollback y los proveedores simulados; no acreditan aún una renovación real de la cuenta ni la calidad de un reporte de entrega.

El favicon y las variantes de marca aportadas por el usuario se revisan y conservan con nombres técnicos en inglés en `fd81ab4`. No se modifica Trello, el checkout UTAPED ni GitHub. La aprobación demostrativa sigue invalidada y las escrituras reales desactivadas. Siguiente trabajo: consolidar la matriz del profesor, evaluar ejemplos representativos reales y completar la supervisión periódica de fuentes/análisis bajo configuración explícita.

## Undécima tanda: integración de la primera versión y nuevo frontend

Actualización del 12 de octubre de 2026, America/Guayaquil. La [matriz académica](academic-acceptance-matrix.md) conserva 39 criterios y las aclaraciones de clase/usuario; su diagnóstico inicial corresponde al commit anterior y su tabla final registra el avance técnico. La aceptación final sigue pendiente.

El workspace se organiza en ocho páginas: Resumen, Planificación, Alertas, Propuestas, Código, Reportes, Operación y Configuración. Incorpora navegación móvil, temas claro/oscuro, búsqueda y filtros de actividades, detalle de dependencias/checklists, formularios separados y capacidades por rol. El gestor configura las etiquetas de estado, prioridad y bloqueo junto con umbrales versionados; la normalización usa esa política conservando la evidencia original. Las comparaciones de línea base incluyen cambios en etiquetas.

La operación persistente programa lecturas y revisión diaria de código por hashes, con lotes y límites. Guarda progreso antes de continuar, reutiliza solicitudes pendientes, acota reintentos y suspende ante revocaciones o fallos terminales. Las alertas correlacionan retrasos, desviaciones y dependencias; conservan notas, alternativas e historial. Una causa confirmada queda ligada a la huella de la tarjeta observada y no se aplica silenciosamente a evidencia distinta.

Las propuestas amplían el cambio de vencimiento a inicio/vencimiento, prioridad, miembros y estado declarado. El servidor construye y sella el alcance exacto desde las fuentes, exige revisión y aprobación específicas y verifica lectura previa/posterior de la tarjeta completa. Las demostraciones son inmutables y no ejecutables. La demostración anterior del usuario permanece invalidada.

La revisión incluye un [catálogo versionado de seis categorías](code-standard-catalog.md) con casos TS/Java. Son comprobaciones acotadas; no ejecutan el proyecto UTAPED ni acreditan su compilación, seguridad integral o conformidad ISO. La [publicación controlada](github-publication.md) crea únicamente la rama aprobada y un PR borrador hacia `develop`, comprueba padre, árbol completo y metadatos, y conserva la integración humana pendiente. Un resultado incierto requiere reconciliación por lectura sin repetir POST. Las solicitudes humanas y los eventos automáticos conservan actores distintos.

Los reportes congelan política, fuentes, riesgos, causas disponibles al corte y acciones verificadas o simuladas. El historial permite revisar actor, referencia y resultado. El [manual de operación](first-release-guide.md) documenta instalación, ocho páginas, permisos, recuperación y guion de entrega.

Verificación acumulada: **132 pruebas unitarias y 117 escenarios PostgreSQL (249)**, diez suites de integración con rollback, comprobación TypeScript y compilación de los tres workspaces. El último recorrido Playwright verifica propuestas/versiones/decisiones, ejecución Trello sintética, correcciones de código y PR sintético, causas, alternativas, historial, reportes, conservación del acceso renovable tras logout, ocho páginas en escritorio/móvil, ambos temas, denegaciones de lectores y ausencia de errores del navegador. Se renderizaron e inspeccionaron las ocho páginas A4 del PDF sintético, con encabezados repetidos, tablas y trazabilidad. Las evidencias de prueba quedan en `work/ui/`, ignorado por Git.

También se verificaron el rol PostgreSQL restringido y auditoría inmutable. La configuración local conserva credenciales existentes y restringe `.env` al usuario actual, SYSTEM y Administradores en Windows; en otros sistemas usa modo 600. La instalación repetida no cambia los valores existentes. La auditoría de dependencias de ejecución reportó cero vulnerabilidades conocidas; no equivale a certificación de seguridad.

Commits locales de esta tanda: `71b7b50` (matriz), `c9206a3` (workspace y mapeos), `2a4483b` (operación y alertas), `e0bcbe7` (acciones revisadas, criterios, publicación y trazabilidad) y `1050ee2` (permisos de configuración local). No se hizo push. Se comprobó que las programaciones reales y ambas configuraciones de escritura continúan desactivadas. No se modificaron Trello, GitHub ni el checkout de UTAPED, ni se enviaron nuevas solicitudes reales de IA durante estas comprobaciones.

Siguiente fase: ejecutar los 39 AC con casos representativos y responsables, observar programación con navegador cerrado y renovación real, y realizar pruebas de escritura únicamente sobre recursos expresamente autorizados con nuevas propuestas. Las pruebas sintéticas no sustituyen esa aceptación. La publicación de PR no demuestra merge; la revisión aislada no sustituye el build y las pruebas de UTAPED.

## Validación real y correcciones del 13 de octubre

El [registro por criterio](real-acceptance-validation.md) distingue resultados reales, comprobaciones aisladas y pendientes. Se activaron los horarios confirmados: fuentes cada 60 minutos, revisión diaria a las 18:00 y reporte los viernes a las 18:00, Ecuador. Se observó un trabajo programado con las pestañas del panel cerradas y dos renovaciones reales de ChatGPT sin nuevo inicio OAuth.

El gestor aprobó y ejecutó cuatro propuestas nuevas de prueba: fechas en 99.2, prioridad en 99.1, asignación nativa en 99.3 y estado en 99.4. Las lecturas independientes y el historial corroboraron los cambios específicos. La demostración histórica permanece invalidada. Se conserva la línea base v1 y se identifican las cuatro tarjetas de prueba dentro del universo temporal de 29 actividades.

La revisión real de cuatro archivos del commit `248eebabac46112c2af9cd7302e1b279c11cb1a3` produjo una hipótesis de CSRF obsoleto. La corrección v1 recibió ajustes del Revisor; la v2 completó las tres etapas. Por autorización expresa del gestor, se registró su decisión y publicación desde el panel: [PR borrador #11](https://github.com/Andriu-Dex/utaped/pull/11), rama `agent/8b075407-abf0-4dbd-904c-127b57d98087-v2`, destino `develop`. Una lectura independiente verificó padre, único archivo modificado, contenido/blob y ausencia de merge. No se modificó el checkout local de UTAPED ni se ejecutaron sus pruebas/build.

La evidencia real detectó dos límites incompatibles con la revisión de código: entrada de 35 029 bytes frente a un máximo local de 32 000 y preparación que necesitó 68,7 segundos frente a un máximo de 60. `7f6eb1e` admite evidencia serializada de hasta 512 000 bytes, espera acotada de 180 segundos, mensajes diferenciados para tamaño/tiempo/cancelación y esquema explícito de dictamen `code-agents-v2`. No trunca evidencia ni relaja revisión/aprobación. `ca61c59` muestra la cantidad de bloqueadas ya congelada en el resumen del reporte.

Se publicó y revisó un reporte manual real con 14/29 = 48,28 %, 13 pendientes, dos en progreso, una vencida, una próxima y una bloqueada, más seis hitos separados. El corte es parcial y anterior a la publicación del PR, por lo que no incorpora esa acción posterior. Se comprobó el recorrido alerta → causa/impacto/alternativas/evidencia → formulario de redistribución sin elegir responsable ni consentir IA automáticamente.

Verificación de estas correcciones: **135 pruebas unitarias, 18 escenarios PostgreSQL de código y 14 de reportes**; tipo/compilación de los tres workspaces, rol PostgreSQL/auditoría, exclusiones Git, ACL local y vistas reales del navegador. Las otras 85 pruebas PostgreSQL conservan su verificación histórica; no se atribuyen a esta sesión. Los casos de transporte adverso de las suites son aislados, no fallos provocados en escrituras reales.

La reanudación de la sesión comprobó recuperación de lecturas pendientes sin observaciones históricas inventadas, una tercera renovación real de ChatGPT, denegación anónima en seis rutas reales, inventario completo contra Trello y diferencias de las cuatro familias aprobadas. El seguimiento de una alerta conserva evidencia; una resolución/reapertura conserva su identidad. Se preparó una propuesta nueva de 99.4 para revisión negativa del gestor, sin aprobación ni ejecución automática.

Se completaron los otros escenarios PostgreSQL con rollback, más un nuevo caso de aislamiento: **118 escenarios PostgreSQL y 135 pruebas unitarias distintos ejecutados el 13/10, 253 en total**. El corpus de 13 pruebas se repitió sin contarlo dos veces. `93052b6` evita que los ticks futuros de la suite de operación reclamen proyectos reales; conserva el fallo previo y la repetición de ocho casos superados. La lógica productiva no cambió; comprobación de tipos superada. Un escaneo acotado de credenciales actuales en archivos/mensajes/logs/evidencias disponibles no encontró coincidencias.

AC-1.01, AC-2.03, AC-3.04, AC-4.02, AC-7.02 y AC-7.04 superaron los procedimientos indicados. Los otros 33 conservan pendientes; no se declara la entrega académica aceptada. Siguiente comprobación: rechazo/ajustes humanos, lector real, recorridos adversos pendientes, cortes diarios con dos commits reales y reporte automático del viernes o una prueba temporal explícitamente acordada. No se hizo push del repositorio del agente.
