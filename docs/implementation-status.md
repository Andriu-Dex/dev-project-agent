# Estado de implementación

Fecha: 7 de octubre de 2026. El usuario autorizó iniciar implementación. El producto y repositorio remoto se llaman dev-project-agent; la carpeta local conserva utaped-agent. Se trabaja en develop. La planificación anterior describe el diseño objetivo y no acredita funcionalidades terminadas.

## Primera base

- npm workspaces: apps/web, apps/server y packages/contracts.
- Panel React/Vite en español, con comprobación real del servicio y PostgreSQL. No contiene porcentajes, actividades ni resultados ficticios.
- Servicio Fastify en loopback, GET /api/v1/health, respuestas estructuradas y errores saneados.
- Contrato compartido HealthResponse y JSON Schema para la respuesta. Los contratos completos de propuestas/agentes aún están pendientes.
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

Estado: ruta documental validada; integración, consentimiento de esta cuenta, cuota y solicitud real aún pendientes. Ollama no está instalado y sigue pendiente de evaluación; no se descargaron modelos ni se activó facturación. La base de persistencia y acceso puede avanzar independientemente.

## Verificación y siguiente paso

Verificaciones realizadas: instalación con auditoría npm sin vulnerabilidades reportadas; comprobación TypeScript; compilación de los tres workspaces; tres pruebas del servicio; migración aplicada y repetida sin duplicación; comprobación real del rol de ejecución y de permisos de auditoría con rollback. El panel se abrió en el navegador y mostró disponibilidad real, caída de PostgreSQL y recuperación tras reiniciarlo. Las comprobaciones del navegador usaron su árbol de accesibilidad; la captura de pantalla no estuvo disponible.

No se realizaron consultas de IA, pruebas de cuota, lectura en línea de Trello ni cambios en UTAPED. Por autorización del usuario, la primera base y sus cambios de estilos/temas se guardaron en el commit 9a764ff (`feat(core): initialize application foundation with theme support`). No se hizo push.

Segunda implementación: acceso local del gestor y lectores, sesiones PostgreSQL, permisos por proyecto, auditoría, comandos administrativos y pantalla de acceso compatible con ambos temas. Se verifican 11 escenarios de integración de autenticación con PostgreSQL real y rollback, además de las pruebas de configuración y disponibilidad. No se han creado cuentas reales: el gestor elige su contraseña mediante `npm run user:create`.

A continuación: conectar lectura de Trello y registrar la procedencia y fecha de sincronización de los datos. Preparar por separado la conexión oficial de IA y solicitar al usuario el inicio de sesión cuando exista un flujo concreto y revisable.
