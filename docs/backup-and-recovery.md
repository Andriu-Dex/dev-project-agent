# Respaldo y recuperación local

Ejecutar `npm run db:backup` con PostgreSQL del agente activo. Usa `pg_dump` del contenedor, crea un dump consistente custom y copia `.env` como `recovery.env`. Quedan en un directorio nuevo bajo `backups/`, ignorado por Git y restringido al usuario actual, SYSTEM y administradores en Windows; otros sistemas usan permisos privados.

El manifiesto guarda fecha y SHA-256. La comprobación crea una base `dpa_restore_<timestamp>`, ejecuta `pg_restore --exit-on-error`, consulta tablas/migraciones con el rol de aplicación, verifica la inmutabilidad del historial y descifra los sobres recuperados con la clave conservada y elimina únicamente esa base temporal. No sobrescribe operación ni arranca workers o correos sobre el respaldo.

El respaldo contiene cuentas, sesiones, fuentes, decisiones, reportes y autorizaciones ChatGPT cifradas. `recovery.env` contiene credenciales y su clave. Es **privado**: no adjuntarlo al ZIP ni subirlo al repositorio. La restricción de acceso no cifra el archivo; para transportarlo utilizar un contenedor cifrado y un canal separado para la clave.

## Restaurar una instalación

1. Detener el agente y respaldar el estado actual antes de reemplazar nada.
2. Verificar SHA-256 y seleccionar código compatible con las migraciones del respaldo.
3. Restaurar primero en una base nueva/vacía con `pg_restore --exit-on-error --no-owner`. No usar `--clean` sobre una base existente sin una decisión explícita de reemplazo.
4. Aprovisionar el rol de aplicación antes de restaurar. El dump conserva las concesiones de permisos y la restauración exige que ese rol exista; Docker lo crea al inicializar una instalación nueva. No ejecutar la aplicación como migrador.
5. Recuperar la configuración privadamente, conservando exactamente `CHATGPT_CREDENTIAL_KEY`. Adaptar conexiones/puertos/orígenes; rotar credenciales conscientemente si cambia la confianza del entorno.
6. Revisar programaciones, destinatario, consentimiento e indicadores de escritura antes del arranque. Un respaldo conserva esos valores. En ensayos retirar credenciales externas y desactivar escrituras para evitar efectos reales.
7. Verificar tablas, migraciones, permisos, salud, ingreso y evidencia. Solo entonces seleccionar esa base como operativa y arrancar una única instancia.

La prueba automática verifica restauración y consulta, no pérdida del equipo ni vigencia remota de tokens. Los permisos, cifrado y renovación tienen comprobaciones adicionales en las suites. No se garantiza que una autorización antigua siga vigente tras restaurar.
