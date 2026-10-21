# Comprobaciones de implementación · versión 1.1

Fecha: 20 de octubre de 2026, America/Guayaquil. Fuente base de implementación: `79aae9c`; ajustes de integridad, recuperación y comprobaciones: `8b9234d`. La documentación de cierre identifica estas fuentes sin atribuir ejecución real externa. Este registro no publica una versión, no concede autorizaciones externas y no declara aceptación humana de los 32 criterios.

## Evidencia ejecutada

- `npm run typecheck`: superado en contratos, servidor e interfaz.
- `npm run build`: superado. JavaScript inicial alrededor de 603 kB antes de gzip; permanece la advertencia no bloqueante de Vite por tamaño.
- `npm run test:isolated`: 367 pruebas superadas en 41 archivos, sin omisiones, en base sintética eliminada al terminar.
- `npm test`: 196 superadas y 171 PostgreSQL omitidas en la ejecución regular. Las 367 sí se ejecutaron en la suite aislada; una omisión no es un aprobado.
- `npm run verify:install`: instalación compilada en base nueva, salud/dashboard, denegación anónima, sesión de gestor sintético, cobertura desactivada y ausencia de entregas externas superados.
- `npm run verify:upgrade`: aplica el esquema 1.0, guarda un informe y preferencias de correo sintéticos, aplica las tres migraciones nuevas y comprueba contenido/huella originales, ausencia de activación/destinatarios nuevos y permisos de inmutabilidad. Resultado superado; evidencia local ignorada en `work/v11/upgrade-verification.json`.
- Brave sobre `127.0.0.1:5191` y base `dpa_v11_ui_*`, sin proveedores ni SMTP reales: ingreso de gestor sintético, consulta de reportes desde el chat, navegación, modo claro/oscuro, membrete/logo, once secciones y gráficos. En móvil de 390 píxeles CSS, documento y chat sin desbordamiento horizontal; Escape cierra y restaura el foco. El control de tema dejó de superponerse al perfil y el área de escritura ocupa el ancho disponible.

Se verificó la vista HTML imprimible, pero no se completó una inspección del PDF paginado en Carta/A4 y escala de grises: REP-05 sigue pendiente de esa comprobación concreta. Tampoco se atribuye una auditoría completa con lector de pantalla a la inspección del árbol accesible.

Una ejecución intermedia encontró un timeout en el caso de pausa de cobertura. El ensayo tomaba `new Date()` inmediatamente después de guardar un corte PostgreSQL con precisión superior; podía no reclamar la tanda y quedarse esperando la señal del proveedor. Se ajustó la preparación para usar el helper existente que sitúa el corte en el pasado. No se aumentó el timeout ni se eliminaron aserciones. El caso final pasó. Un fixture SMTP adicional necesitaba la conexión Trello exigida por su FK; se completó esa precondición sin relajar la restricción.

## Trazabilidad de criterios

«Comprobado» se limita a la evidencia indicada, no a validación exhaustiva de todos los proveedores o situaciones reales.

| Criterios | Implementación y comprobación | Límite o cierre adicional |
| --- | --- | --- |
| REP-01, REP-02 | Once secciones y recurso `brand-logo.jpg` inspeccionados en navegador; branding y HTML/huellas congelados en pruebas PostgreSQL; la impresión rechaza HTML con huella discrepante | Revisión final del cliente sobre sus metadatos institucionales |
| REP-03 | Fórmula 13/29 → 44,83 % contrastada en render; cálculos y universo en seguimiento/reportes | No acredita aceptación de actividades |
| REP-04 | Comparación solo con universo compatible; caso de cambio de alcance en suite y ausencia de tendencia con un solo corte en navegador | Revisión visual de una serie real futura |
| REP-05 | CSS Carta, márgenes y salida imprimible implementados | Pendiente inspección PDF Carta/A4, tablas extensas, paginación y grises |
| REP-06 | Historial de código/versión, motivo y HTML/imagen guardados; actualización de organización no cambia el original | La firma humana no se inventa |
| REP-07 | Fixture de 65 cortes: primera página de 60, segunda de 5 y filtro de fecha; actualización preserva datos | Sin borrado a 30 días |
| REP-08 | Escapado y CSP en suite; ausencia de firma/aceptación ficticia | No firma certificada |
| NOT-01, NOT-02 | Enrutamiento de integrantes/fase, deduplicación, alternativa explícita y exclusión de miembro ausente en unitarias; vista previa | Última lectura guardada, no lectura remota por destinatario |
| NOT-03 | Configuración versionada cancela pendientes; pruebas de autoridad existentes y migración conservan gestor | No alta automática de contactos |
| NOT-04 | Transporte sintético comprueba dos mensajes individuales gestor/responsable, sin CC ni duplicado; reglas por evento y pruebas de silencio/límites | Nuevos destinatarios reales pendientes de configuración/consentimiento |
| JOB-01, JOB-02 | Estados/etapas persistidos, consulta sin trabajo ficticio, recuperación y reanudación en suites; interfaz indeterminada | No existe porcentaje interno del proveedor |
| JOB-03, JOB-04 | Universo elegible de archivos separado del presupuesto de fragmentos; umbral de aviso 1–5 minutos | Una tanda sin denominador conocido muestra conteo/espera; el presupuesto no es porcentaje de trabajo completo |
| REV-01, REV-02 | Carreras de retirada durante preflight de Trello/GitHub: cero escrituras; frontera persistida y estado protegido | Después de la frontera, reconciliar; no se promete cancelación en vuelo |
| REV-03, REV-04 | Inversión exacta y nuevo flujo; prueba completa de miembros y comparación previa de valores; clientes validan recursos | Reversiones reales de fechas/etiquetas/asignación quedan para casos aprobados explícitamente |
| REV-05, REV-06 | Fixtures GitHub: cierre aprobado/confirmado, rama preservada, segundo intento bloqueado; inverso de PR fusionado revisado por etapas y sin decisión humana fabricada | Solo archivos con blobs publicados intactos y rangos admitidos; no revertir commits arbitrarios |
| DOC-01, DOC-02, DOC-03 | Ficha forma parte del candidato y su hash, revisión y PR; límites de bytes, controles de sintaxis y recuperación | Comentarios útiles dependen de revisión semántica del candidato; no documentación exhaustiva de UTAPED |
| CHAT-01 | Respuestas estructuradas con fecha/fuentes y aclaración de fechas ambiguas; planes tipados | Calidad de interpretación del nuevo prompt pendiente con modelo real |
| CHAT-02 | API: sesión/CSRF, ámbito de proyecto, separación de conversaciones y lector; herramientas fuera de lista rechazadas | No se realizaron llamadas reales a proveedores |
| CHAT-03 | Solicitud de informe desde texto solo devuelve tarjeta, sin trabajo creado; claves persistidas y puertas existentes para decisiones/ejecución | Nueva aceptación real del chat no sustituida por fixtures |
| CHAT-04 | Historial privado paginado y recuperación de respuesta por clave; fallo sin fallback y navegación equivalente | No comprobación real nueva de cuota/revocación del proveedor |
| CHAT-05 | Escritorio, claro/oscuro y móvil 390 px inspeccionados; retorno de foco y labels accesibles; mascota ocultable y CSS de movimiento reducido | Pendiente auditoría completa con lector de pantalla |
| INT-01 | Regresión aislada y actualización desde esquema anterior, con permisos de inmutabilidad | No se reescribió evidencia académica 1.0 |
| INT-02 | Flujo sintético Trello preparar → revisar → aprobar → ejecutar → preparar reversión → nueva decisión → ejecutar, con enlace e historia | Cierre real requiere recursos y diffs aprobados |

## Fronteras de esta tanda

No se enviaron correos reales, no se cerraron PRs reales ni se revirtieron tarjetas o código reales. Se usaron transportes y datos sintéticos para las acciones nuevas. La calidad histórica de ChatGPT y Ollama no se reevalúa con estos fixtures. No se modifica la aceptación académica 1.0 ni EX-01.

La funcionalidad está implementada para revisión local; la aceptación real de 1.1 debe completar las comprobaciones pendientes con decisiones explícitas sobre los recursos afectados. No se hizo merge, push, etiqueta ni distribución de un ZIP en esta tanda.
