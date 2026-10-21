# Arquitectura implementada

La versión local 1.1.0 es un monolito modular: React/TypeScript en el navegador, un servicio Node.js/TypeScript con Fastify y PostgreSQL. Los workers viven en el mismo proceso; no son microservicios. Docker Compose inicia únicamente PostgreSQL del agente, separado de UTAPED.

## Componentes

| Componente | Implementación y responsabilidad |
| --- | --- |
| Interfaz | `apps/web`: ocho secciones, claro/oscuro, formularios, evidencia y controles según permisos. |
| Servicio | `apps/server/src/index.ts` compone autenticación, módulos, proveedores y workers; `app.ts` configura HTTP y manejo saneado de errores. |
| Contratos | `packages/contracts/src`: tipos compartidos y vistas; las rutas aplican esquemas de validación en ejecución. |
| Integraciones | Adaptadores Trello/GitHub con lectura identificada y credenciales separadas para escritura. |
| Supervisión | Snapshots, configuración versionada, línea base, indicadores deterministas, alertas e historial. |
| Propuestas | Ejecutor, Revisor y Aprobador secuenciales; versiones selladas, decisiones humanas y ejecución separada. |
| Código | Análisis acotado, correcciones, publicación controlada y cobertura progresiva por fragmentos. |
| Programación | Workers de fuentes, revisión, reportes, notificaciones, cobertura y renovación; coordinación persistida en PostgreSQL. |
| Proveedores | ChatGPT como principal validado y Ollama opcional, elegidos explícitamente por trabajo; sin fallback automático. |
| Persistencia | Migraciones, claves compuestas por proyecto, restricciones, auditoría y permisos específicos para el rol de aplicación. |

## Flujo y autoridad

Lectura de fuentes → reglas/análisis → Ejecutor → Revisor → Aprobador → decisión del gestor → confirmación separada → comprobación remota → escritura → lectura de verificación.

Los roles pueden usar el mismo modelo y se ejecutan secuencialmente. Los modelos no crean aprobación humana ni disponen de comandos libres. Un cambio relevante de fuente o candidato exige nueva revisión. La incertidumbre de una escritura se reconcilia mediante consulta; no se reenvía ciegamente. Las demostraciones conservan su propósito y nunca escriben.

La publicación GitHub puede crear una rama `agent/<proposal-id>-v<version>` y PR borrador a `develop`, tras autorización específica. La incorporación a `develop` y `main` es humana. Los reportes tienen tres etapas deterministas de preparación/revisión/publicación interna; SMTP es una operación aparte, consentida y registrada.

## Seguridad y datos

La sesión local y la autorización del proveedor son independientes. Contraseñas Argon2id, sesiones PostgreSQL, autorización por membresía y rol, origen permitido y CSRF protegen las operaciones del gestor. Las credenciales renovables ChatGPT se cifran en PostgreSQL con una clave separada. Los tokens Trello/GitHub y SMTP permanecen en `.env` con permisos restringidos; no se afirma que ese archivo esté cifrado.

Tarjetas, comentarios, código y respuestas del modelo son datos no confiables. Se excluye contenido potencialmente sensible antes de enviarlo o guardar evidencia. El servicio no ejecuta scripts de UTAPED ni necesita su base académica.

## Operación y límites

El navegador puede cerrarse, pero equipo, PostgreSQL y servicio deben seguir activos. Se opera una sola instancia por base. Las programaciones guardadas, la recuperación y las autorizaciones tienen reglas propias por tipo de trabajo. No hay tarea de inicio del sistema ni alojamiento público instalado.

La cobertura progresiva conserva inventario por commit, límites, estados, exclusiones, contexto local y resultados históricos; los reportes usan cortes anteriores a su fecha. No acredita compilación Java, recorrido de pantallas ni validación completa de UTAPED. El alcance validado es un proyecto; no se ofrece aislamiento SaaS entre organizaciones.

## Referencias

[Modelo de datos](data-model.md), [API](api-design.md), [guía operativa](first-release-guide.md), [cobertura](repository-coverage.md), [proveedores](agent-providers.md), [respaldo](backup-and-recovery.md). El [diseño inicial](archive/planning/architecture.md) y las [herramientas previstas](archive/planning/technical-design.md) se conservan como antecedentes.

## Ampliación 1.1

El chat es otra interfaz de los mismos servicios: interpreta intenciones en un vocabulario permitido, devuelve tarjetas con claves persistidas y no ejecuta desde texto libre. Sesión, membresía, CSRF, versión/huella, motivos y confirmación permanecen en los módulos de dominio. Las conversaciones se aíslan por usuario/proyecto. El seguimiento usa estados y evidencias persistidas; no inventa porcentaje de inferencia.

Los informes nuevos conservan HTML/huella e imagen junto al contenido. Correo resuelve destinatarios por evento/actividad/fase y crea entregas individuales. La revocación compite con la frontera persistida de escritura. Las reversiones enlazan la operación original y repiten revisión/autorización. El inverso de código fusionado se reconstruye determinísticamente dentro de límites, antes de las inferencias de Revisor y Aprobador. Véase [guía y límites](version-1.1-guide.md).
