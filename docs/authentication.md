# Acceso local y permisos

Implementado el 7 de octubre de 2026. Se conserva la interfaz y los temas claro/oscuro existentes.

## Preparación

Desde la raíz ejecutar `npm run setup`, `npm run db:up` y `npm run db:migrate`. La segunda migración crea usuarios, membresías y sesiones, incorpora el actor de auditoría e inicializa UTAPED si no hay proyectos. Reiniciar el servicio después de incorporar las variables nuevas.

Ejecutar `npm run user:create` en una terminal interactiva. Para Steven, elegir el rol gestor (`manager`); para los demás integrantes, consulta (`viewer`). El comando solicita usuario, nombre y contraseña oculta con confirmación. La contraseña debe tener 15–128 caracteres. No existen cuentas ni contraseñas predeterminadas. No se crearon cuentas reales automáticamente.

`npm run user:reset` cambia una contraseña, incrementa la versión de autenticación y revoca las sesiones existentes. Estos comandos administrativos utilizan el rol de migración y registran auditoría. La creación y el cambio de contraseña se ejecutan en transacciones; los comandos no aceptan contraseñas como argumentos.

## Contrato implementado

Todas las rutas tienen prefijo `/api/v1`.

| Ruta | Comportamiento |
| --- | --- |
| GET /session | Devuelve estado, token CSRF y, si corresponde, usuario y proyecto autorizado. |
| POST /session/login | Usuario/contraseña; requiere Origin permitido y cabecera x-csrf-token. Rota el identificador de sesión. |
| POST /session/logout | Requiere Origin y CSRF; revoca la sesión y elimina la cookie. |
| GET /projects/current | Requiere cuenta y membresía activas. |
| GET /projects/:projectId/members | Solo gestor del proyecto; devuelve nombres y roles, sin hashes. |

Las sesiones usan una cookie HttpOnly/SameSite=Lax y persistencia PostgreSQL. El identificador se guarda con SHA-256; la contraseña, con Argon2id (19 MiB, dos iteraciones, paralelismo uno). Inactividad máxima: 30 minutos; duración absoluta: ocho horas. La base guarda una marca de revocación que evita que una solicitud simultánea reactive una sesión cerrada. Las respuestas de sesión no se almacenan en caché.

El servidor verifica cuenta, versión de autenticación y membresía en cada solicitud protegida. Los permisos de la interfaz son informativos: la decisión se realiza en el servidor. No se guardan contraseñas ni tokens de sesión en localStorage; allí permanece únicamente la preferencia del tema.

El inicio de sesión tiene un límite de diez intentos por minuto por IP, en memoria del proceso. Los errores de usuario inexistente y contraseña incorrecta son iguales. La comprobación pública de disponibilidad continúa sin depender de una sesión.

## Verificación y límites

`npm run test:auth-db` utiliza PostgreSQL real y revierte sus registros al finalizar. Cubre autenticación, rotación, persistencia tras recrear el servidor, permisos entre proyectos, cuenta/membresía desactivada, cierre y revocación, cambio de contraseña, CSRF, origen, límite de intentos y expiración. Las pruebas unitarias comprueban configuración de orígenes y cookies.

El entregable es local. No incluye recuperación por correo, registro público, MFA, administración web de cuentas, selección de múltiples proyectos, limitación distribuida ni limpieza periódica de sesiones revocadas. Los comandos actuales asignan el proyecto inicial. La ejecución de propuestas aprobadas y su máquina de estados siguen pendientes; este módulo solo establece la identidad y los roles.

Referencias técnicas: [sesiones Fastify](https://github.com/fastify/session), [protección CSRF](https://github.com/fastify/csrf-protection) y [almacenamiento de contraseñas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Son decisiones de implementación; no constituyen certificación ISO.
