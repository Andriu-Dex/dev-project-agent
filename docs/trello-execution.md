# Ejecución controlada en Trello

Implementación del 11 de octubre de 2026. Esta tanda implementa y prueba cambios de vencimiento sobre **una tarjeta**. La configuración del entorno real permanece desactivada; no se realizaron escrituras en UTAPED.

## Demostraciones y autorización

Toda propuesta nueva empieza con propósito `demonstration`. El gestor puede elegir `live` al preparar una propuesta nueva. El propósito es inmutable para el rol de ejecución de PostgreSQL y se conserva en todas las versiones: una demostración no se convierte en una propuesta real.

La propuesta de demostración previamente aprobada por el usuario, `d059e71b-8f5c-4ab5-9f5a-7544df743427`, versión 2, quedó `invalidated` por petición del usuario. Se retiró su habilitación local y se anexó auditoría `proposal.demonstration.withdraw`; la decisión original y los dictámenes permanecen como evidencia. La migración clasifica todas las propuestas anteriores como demostración. No se borró historia ni se envió una petición a Trello para retirar esta autorización.

Una aprobación registra la decisión sobre el contenido identificado. **No crea una ejecución automática.** Para una propuesta `live`, el gestor debe solicitar la ejecución por separado y confirmar expresamente el cambio real. También puede retirar la autorización mientras la versión siga `authorized` o `execution_failed`, sin resultado incierto; una operación ya iniciada requiere consulta de estado, no una promesa de cancelación o reversión.

## Configuración

`TRELLO_WRITES_ENABLED` es `false` por defecto y solo acepta `true` o `false`. `TRELLO_WRITE_TOKEN` es una variable independiente, sin valor predeterminado; no se toma `TRELLO_TOKEN` como credencial de escritura. Se utiliza la misma `TRELLO_API_KEY`. Estos valores permanecen en `.env`, excluido de Git; el servicio requiere reinicio después de cambiarlos. La interfaz muestra la disponibilidad, pero el servicio vuelve a aplicar las restricciones.

No se habilitaron estas opciones durante esta implementación. Una futura validación real requiere una propuesta nueva de propósito real, autorización específica, credencial con permisos adecuados y configuración explícita. No requiere una llamada adicional a ChatGPT durante la ejecución.

## Flujo implementado

1. El servicio exige sesión, CSRF, origen permitido y rol gestor del proyecto. Conserva la intención y una clave idempotente vinculada a usuario, proyecto, versión y contenido. Limita a un intento pendiente por proyecto, incluida cualquier reconciliación pendiente.
2. Recalcula la huella del contenido/contexto y valida nuevamente la acción única, revisión y dictamen. La aprobación debe corresponder a esa huella; su autor debe seguir activo, con rol gestor y la misma `auth_version` que al decidir. También comprueba al gestor solicitante inmediatamente antes de escribir.
3. Verifica las versiones de política y línea base y el tablero/listas congelados. Mantiene bloqueos locales compartidos con sincronización, línea base y configuración durante la operación; no mantiene una transacción SQL abierta durante las peticiones de red.
4. Consulta cuenta, tablero abierto y membresía de Trello; solo admite miembro `normal` o `admin`, sin desactivación o confirmación pendiente. El permiso de la membresía no demuestra por sí solo el alcance del token: Trello puede rechazar el PUT.
5. Lee Trello de nuevo y normaliza la tarjeta. Compara identidad, lista, nombre, estado, fechas, WBS, archivo, clase, miembros, dependencias y `dueComplete` con la huella congelada. La fecha objetivo debe seguir siendo futura y coherente con el inicio. Un cambio en estos valores bloquea la ejecución y exige otra versión.
6. Persiste `write_started_at` y evidencia previa **antes** de enviar exactamente un `PUT /1/cards/{id}` con cuerpo JSON `{due: <fecha aprobada>}`. El modelo no elige URL, método, credenciales ni otros campos. Las credenciales viajan en Authorization; se rechazan redirecciones y respuestas excesivas.
7. Lee Trello después del PUT. Solo declara `executed` si observa la fecha aprobada y los demás valores relevantes siguen correspondiendo a la fuente. Un HTTP exitoso, por sí solo, no demuestra ejecución verificada.

## Fallos y reconciliación

| Situación | Resultado y acción permitida |
| --- | --- |
| Fuente o autoridad cambió antes del PUT | `blocked` / propuesta `invalidated`; no se envió el cambio |
| Fallo previo a enviar o rechazo HTTP explícito 400/401/403/404/429 | `failed` / `execution_failed`; puede solicitarse otro intento explícito, con controles completos y nueva clave |
| Respuesta perdida pero lectura posterior confirma efecto exacto | `succeeded` / `executed`; no se repite el PUT |
| Error de red/servidor, lectura posterior fallida o discrepancia | `reconciliation_required`; bloquea nuevas ejecuciones del proyecto |
| Reinicio antes del límite persistido de escritura | `failed`; no se reanuda automáticamente |
| Reinicio después del límite persistido | `reconciliation_required`; no se reenvía automáticamente |

“Consultar para reconciliar” solo lee el tablero congelado y registra evidencia. Si observa el efecto exacto, conserva ese resultado verificado; ello no prueba que el servicio sea el único autor posible del cambio. Si observa el valor anterior u otra discrepancia, mantiene el bloqueo: una sola lectura no prueba que una petición retrasada nunca vaya a aplicarse. No implementa rollback automático ni cierre forzado de discrepancias; se necesita resolver la situación antes de habilitar otro intento. Si se pierde también el acceso a PostgreSQL al publicar un resultado, el reinicio recupera el intento conservado sin repetir la escritura.

Este ciclo de vida corresponde al despliegue local con un único proceso de servicio; iniciar varias instancias concurrentes requiere coordinación de recuperación adicional. Trello y PostgreSQL no comparten transacción. Los bloqueos solo coordinan esta aplicación: otro usuario o integración puede cambiar la tarjeta entre la lectura previa y el PUT. Este adaptador no tiene una comparación atómica remota y no puede garantizar que detecte un cambio sobrescrito dentro de esa ventana. Las consultas posteriores acreditan el efecto observado, con ese límite explícito.

## Persistencia y API

`execution_jobs` conserva versión, aprobación, huella, solicitante y `auth_version`, clave/hash de solicitud y límites temporales. `execution_events` conserva comprobaciones y evidencia mínima (tarjeta/tablero, vencimiento, huella y momento de lectura). El rol ordinario puede anexar eventos y actualizar solamente campos de ciclo de vida del trabajo; no cambiar propósito, aprobaciones, parámetros o evidencia. `audit_events.details` permite conservar el motivo saneado de retirada sin alterar decisiones anteriores.

Prefijo `/api/v1/projects/:projectId`:

| Ruta | Acceso y resultado |
| --- | --- |
| `GET /executions` | Miembro; capacidades e historial del proyecto |
| `GET /executions/:id` | Miembro; intento y comprobaciones |
| `POST /proposals/:proposalId/versions/:version/execute` | Gestor + CSRF; `{contentHash, requestKey, confirmed: true}`, responde 202 al persistir intención |
| `POST /executions/:id/reconcile` | Gestor + CSRF; lectura sin escritura, sin cuerpo JSON |
| `POST /proposals/:proposalId/versions/:version/withdraw` | Gestor + CSRF; `{reason}`, solo antes de iniciar |

Estas rutas concretas sustituyen los nombres conceptuales de solicitudes de ejecución del diseño inicial para este alcance. GitHub continúa en lectura: no se crean ramas ni PRs en esta tanda.

## Verificación y fuentes

Pruebas de transporte con `fetch` simulado, integración con PostgreSQL real y rollback, y recorrido Playwright con proyecto/proveedor/tablero sintéticos. Cubren propósito inmutable, retirada, configuración desactivada, controles de acceso, contenido exacto, deduplicación, cambio de fuente/lista, autoridad revocada, rechazo, respuesta perdida, discrepancia, reconciliación, recuperación y permisos restringidos. El recorrido incluye claro/oscuro, móvil e historial visible al lector. No acreditan validación de una escritura real en UTAPED.

Referencias oficiales: [actualización de tarjeta y cuerpo JSON](https://developer.atlassian.com/cloud/trello/rest/api-group-cards/#api-cards-id-put), [tablero y membresías](https://developer.atlassian.com/cloud/trello/rest/api-group-boards/) y [autorización de Trello](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/).
