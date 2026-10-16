# Cierre de comprobaciones y paquete local — 15 de octubre de 2026

La entrega académica final continúa pendiente por decisión del gestor. Esta tanda no crea releases, tags, ramas ni PR y no modifica Trello/GitHub. El checkout supervisado de UTAPED conserva sus cambios previos. El paquete es una instantánea local candidata, no una declaración de aceptación integral.

## Resultado de las cinco comprobaciones

| Comprobación | Resultado y evidencia |
| --- | --- |
| Listas y checklists | Contraste independiente mediante GET de los seis grupos: tablero, listas, miembros, tarjetas, etiquetas y checklists. Coinciden siete listas, cinco miembros, 76 tarjetas totales, 67 checklists y 602 elementos. Las 76 incluyen referencias/archivadas; el universo operativo continúa en 29 actividades y seis hitos. Snapshot `a22706a3-32c2-46e8-aba6-3eb9c5af588a`. |
| Contenido del reporte | Revisión técnica de las diez secciones del reporte `76116202-ba12-412f-86ab-bcc5dc69b100` v1, corte 15/10 07:40, periodo parcial 07:30–07:40. El gestor respondió **«Acepto el contenido del reporte con sus limitaciones»** en esta conversación. Es aceptación interna de ese contenido, no autorización de cambios externos ni aprobación de otros reportes. |
| Correcciones de UTAPED | Dos archivos candidatos exactos, cada uno sobre su commit original, se probaron en copias aisladas. **28 comprobaciones funcionales del módulo cliente superadas**, además de tipos, lint y build completos del frontend en ambas copias. Detalles y límites abajo. |
| Aprobación histórica sin motivo | Excepción EX-01 identificada y documentada abajo. Registro original intacto; control corregido para decisiones nuevas. No se presenta el dato ausente como recuperado ni se inventa una justificación. |
| Consulta de fallo antiguo | En Brave, sesión del gestor: Operación → Historial de Eventos → Fallidas → Ver acción. Se consultó `github.sync`, fallo `SOURCE_UNAVAILABLE` del 15/10 a las 09:05:03, evento `11050de2-aea1-446a-b794-fc036ae63125`; también aparece el fallo Trello correlacionado. No se repitió la operación para fabricar un fallo nuevo. |

Evidencias privadas locales: `work/acceptance/closure-oct15/trello-comparison.json`, `functional-results.json`, `historical-records.json`, capturas y árboles accesibles `closure-*.png/txt`. No se incluyen exportaciones privadas, credenciales ni datos persistidos del gestor dentro del paquete.

## Revisión del reporte aceptado

Se comprobó 13/29 × 100 = 44,83 %; 13 pendientes + tres en progreso + 13 completadas declaradas = 29; seis hitos separados; una actividad vencida y cuatro próximas. El hito próximo se informa aparte. La actividad 3.6 no se cuenta como vencida debido a contradicción entre etiqueta EN CURSO y `dueComplete=true`, explícita en calidad de datos. Los responsables descritos no acreditan asignación nativa ni disponibilidad.

Trello (07:35:17) y GitHub (07:35:18) son anteriores al corte. Se conserva línea base v1 y se diferencian incorporaciones de cambios de estado. Causa de 99.1 declarada, hipótesis de 3.7 e impacto no cuantificado están separados. Solo se incluyen las dos acciones del periodo: ajustes de código v1 y preparación v2; no se atribuyen al periodo la v3 ni el PR #11 anteriores/posteriores. La sección de calidad limita su alcance a un archivo Java y declara que no se compiló Java. Las recomendaciones citan responsable y vencimiento observados sin asignar nuevos compromisos.

El reporte mantiene su contenido/huella original `7f82adc0bb6004d9645476c37e04a93e79cb37a902458b437a87cb49937123f8`; la aceptación se registra en esta documentación, sin reescribir el reporte publicado. Sus tres etapas son deterministas, no una revisión humana ni inferencia de IA.

## Pruebas funcionales de los candidatos

- Serialización: propuesta de demostración `458f9c25-b3b4-4c6c-8f05-e9dca98ec378` v3, fuente `ba0d7170b75b9c1e0db803be9c9285b077c9c36e`. False, cero, null y cadena vacía se envían como JSON; undefined, NaN y 0n mantienen su omisión. FormData/URLSearchParams vacíos y no vacíos, JSON ordinario, respuesta vacía, errores y credenciales conservan el comportamiento previsto. El original reproduce la omisión de los cuatro valores: es un control diferencial, no prueba de un defecto de negocio en producción.
- CSRF: propuesta `8b075407-abf0-4dbd-904c-127b57d98087` v2, commit candidato `24a9c9c7af475c293b880ecb61d8b1eb67d7f17b`, base `248eebabac46112c2af9cd7302e1b279c11cb1a3`. Se comprueban token nuevo al ingresar, limpieza de caché ante 401 en API/descarga/firma, conservación ante 403, exclusiones de notificación de login/me, limpieza de buffers de firma y ausencia de POST duplicados. El original reproduce reutilización del token de login.

Los módulos exactos se ejecutaron en VM aislada con respuestas HTTP controladas y tokens sintéticos. No son pruebas de extremo a extremo con backend real, sesiones reales ni firma criptográfica válida. No se ejecutaron los tests Playwright de UTAPED contra sus servicios ni se compiló Java. Los resultados no autorizan integrar ni publicar candidatos. El propósito de demostración de v3 permanece no ejecutable.

Ambas copias superaron `npm run typecheck`, build completo y lint explícito `oxlint --no-ignore src vite.config.ts`. El lint normal inicialmente no encontró archivos porque las copias estaban dentro del directorio ignorado `work/`; no fue un defecto del candidato. Las copias se trasladaron fuera del repositorio del agente, a `C:/Users/andri/Documents/Codex/2026-10-07/not/acceptance/utaped-closure-oct15/`.

El primer `npm test` del agente descubrió indebidamente los tests Playwright de esas copias dentro de `work/`: 186 unitarias pasaron pero once archivos ajenos fallaron al cargarse. No se ejecutaron acciones de navegador de esos tests. Tras mover las copias, la suite normal volvió a **186 superadas, 142 omitidas**, sin añadir exclusiones para ocultar fallos. Se conservan ambos logs.

## EX-01: dato histórico ausente

Decisión `1fc34267-0d4b-4edf-ba04-99b379dfff00`, propuesta `66c616f9-2e79-4a6c-a58d-5e59dd4b386d` v1, tarjeta de prueba 99.4, aprobación 13/10/2026 a las 12:39:38, actor gestor identificado, estado ejecutado y huella `b5026e30b26cbbd6dfdb8ad13c7fe2fb2aa8984eaf991326c24eb14605f3eec1`: motivo vacío permitido por el formulario anterior.

Se retienen decisión, actor, fecha, huella y evidencia de ejecución; no se borra ni modifica retrospectivamente la decisión, no se reconstruye una motivación y no se solicita otra ejecución. `176631c` exige motivo no vacío para nuevas decisiones, incluida aprobación, con verificación PostgreSQL. La repetición idempotente de una solicitud histórica se conserva; no equivale a crear una aprobación nueva sin motivo. El rol de aplicación no puede actualizar ni eliminar decisiones (RV-29).

La comprobación queda cerrada **con excepción histórica documentada**, sin declarar que todos los registros antiguos satisfacen el requisito de motivo. No se atribuye al gestor una dispensa académica o modificación de ese requisito.

## Paquete local y límites de entrega

El paquete contiene fuente seleccionada desde archivos versionados del árbol de trabajo y compilados del agente, más manifiesto de hashes, estado Git y guía de uso local. Incluye los cambios visuales locales preparados por el usuario; se identifica como árbol con cambios, sin fingir que pertenece íntegramente al último commit. No altera su staging ni los publica.

Se excluyen `.env`, tokens, base de datos, sesiones/OAuth, exportaciones Trello, dependencias instaladas, evidencias privadas, copias de UTAPED y `.git`. Requiere Node 24/npm 11, PostgreSQL/Docker y configuración local propia; no es un instalador con credenciales ni incluye el estado operativo actual. No iniciar otra copia contra la base operativa durante pruebas.

Observaciones de la interfaz nueva: Operación vuelve a usar el texto «Sincronización en tiempo real», aunque la lectura está programada cada 60 minutos; se documenta como texto impreciso, sin cambiar el código en esta tanda. El historial de eventos muestra los últimos 200 y Código consulta los últimos 30 análisis: sus filtros/páginas no representan acceso ilimitado a todo el historial. El caso fallido requerido se pudo consultar dentro de ese alcance; la retención en base no está limitada a esos listados.

Los cambios de esta tanda son documentación, pruebas aisladas y preparación del artefacto local. La entrega final, despliegue, publicación, tag y merge continúan pendientes.
