# Diseño técnico de la primera entrega

Fecha: 7 de octubre de 2026. Selección técnica documentada para revisión, sin instalar dependencias, generar código, crear SQL o iniciar servicios. Se mantiene UTAPED como único proyecto operativo hasta el 4 de noviembre. Las decisiones del usuario prevalecen sobre estas propuestas técnicas.

## Herramientas seleccionadas

| Área | Selección | Motivo de diseño |
| --- | --- | --- |
| Lenguaje | TypeScript en panel y servicio | Contratos compartidos y comprobación estática |
| Panel | React + Vite, CSS propio con estilos compartidos | Aplicación de consulta y gestión; sin necesidad de renderizado de servidor |
| Servicio HTTP | Fastify | Rutas modulares, validación de entradas y esquemas de salida |
| Contratos | JSON Schema con tipos TypeScript asociados | Misma especificación para API y salidas de agentes; esquemas controlados por la aplicación |
| PostgreSQL | node-postgres, paquete pg | Consultas parametrizadas y transacciones explícitas; sin ORM inicial |
| Migraciones | node-pg-migrate | Evolución versionada de tablas, restricciones e índices |
| Sesiones | @fastify/cookie + @fastify/session con almacén PostgreSQL | Sesión revocable del lado servidor; no usar almacén en memoria para entrega |
| Contraseñas | Argon2id mediante biblioteca mantenida por seleccionar | Almacenar hashes con parámetros verificados, nunca contraseñas reversibles |
| Pruebas de lógica e integración | Vitest; PostgreSQL de prueba independiente | Verificar reglas, transacciones, permisos y recuperación |
| Pruebas de recorridos | Playwright | Aprobación, rechazo, ajustes y visualización del resultado |
| Paquetes | npm workspaces y package-lock.json | Un repositorio con panel, servicio y contratos compartidos |
| Entorno local | Docker Compose para PostgreSQL; Node.js para servicio/panel inicialmente | Evitar contenedores innecesarios alrededor de autenticación local y herramientas del equipo |
| Procesos largos | Trabajador lógico del mismo servicio con cola persistente en PostgreSQL | Sin Redis ni broker adicional en la primera versión |
| Integraciones | REST de Trello/GitHub y Git local mediante argumentos controlados | Lecturas acotadas y operaciones externas explícitamente autorizadas |
| Agentes | Coordinación propia secuencial, adaptadores de IA | La política reside en el programa, independientemente del modelo |

No se eligen aún números de versiones por suposición. Al autorizar desarrollo se verificará una versión LTS soportada de Node.js, versiones estables compatibles de las dependencias y PostgreSQL; se fijarán en manifiestos, archivo de bloqueo e imagen de contenedor. No utilizar etiquetas flotantes latest en el entorno reproducible de entrega.

No introducir un ORM, framework multiagente, Redis, Kubernetes ni microservicios sin una necesidad concreta nueva. El servicio modular conserva límites que permitirían separar trabajadores más adelante.

## Organización prevista, todavía no creada

| Ruta futura | Responsabilidad |
| --- | --- |
| apps/web | Pantallas, navegación, componentes y cliente de API |
| apps/server | Arranque HTTP, rutas, servicios de aplicación y tareas |
| apps/server/src/modules | auth, projects, supervision, work-items, code-analysis, proposals, reports, audit |
| apps/server/src/integrations | Trello, GitHub, Git, adaptador ChatGPT y adaptador Ollama |
| apps/server/src/agents | Ejecutor, Revisor y Aprobador, instrucciones y validación de resultados |
| apps/server/src/infrastructure | PostgreSQL, sesiones, cola, almacén de secretos y registro saneado |
| packages/contracts | Contratos públicos, estados y esquemas; sin acceso a secretos ni base de datos |
| migrations | Cambios de base de datos versionados |
| tests/e2e | Recorridos de usuario |
| docs | Decisiones, requisitos y evidencias de entrega |

Dentro de cada módulo: separar rutas, reglas/servicios y consultas cuando tengan responsabilidad distinta. El panel no importa repositorios de datos ni SDKs que contengan credenciales. No crear todas las carpetas vacías ni capas abstractas sin uso.

## Acceso y permisos

Primera versión: cuentas locales habilitadas explícitamente, gestor y espectadores. El gestor inicial se crea mediante un procedimiento local de administración de una sola vez, con credenciales elegidas por la persona y sin contraseña por defecto en Git. No autorregistro, recuperación por correo ni autenticación social en noviembre. Recuperación mediante procedimiento local documentado que invalida sesiones y registra operación, sin imprimir contraseñas.

El navegador recibe una cookie de sesión opaca, HttpOnly y SameSite=Lax. Secure bajo HTTPS; desarrollo HTTP exclusivamente en loopback con excepción explícita de configuración. Rotar sesión al iniciar sesión o cambiar privilegios, invalidarla al salir y comprobar vencimiento inactivo y absoluto en el servidor. Valores de timeout se definirán al implementar y documentarán en configuración.

Las rutas de modificación requieren sesión, rol manager, autorización por projectId y protección CSRF mediante token ligado a sesión y comprobación de origen. El login también verifica origen y límites de intentos; respuestas de credenciales genéricas. La interfaz y API comparten origen: proxy de Vite durante desarrollo y estáticos del panel con API en el mismo servicio para entrega local. No habilitar CORS abierto con cookies.

La sesión de usuario incluye solo datos mínimos y no sustituye consultas de membresía vigente. Conectar ChatGPT o Trello no concede rol manager. La elección de biblioteca de CSRF y hashing se verificará con versiones compatibles antes de instalar.

## PostgreSQL, migraciones y transacciones

- Pool de conexiones limitado y consultas parametrizadas; no construir SQL concatenando datos del usuario o modelo.
- Cada transacción utiliza un único cliente reservado de pg hasta finalizar. Decisión, autorización, transición y auditoría se guardan conjuntamente.
- Migraciones numeradas/versionadas, ejecutadas como paso explícito previo al arranque. Un proceso migra; los demás no compiten por alterar esquema. No modificar migraciones ya aplicadas.
- Usuario de migración separado del usuario de ejecución, que no necesita permisos para alterar tablas. Entorno de prueba usa otra base y credenciales.
- Restricciones, relaciones por proyecto y claves únicas según modelo conceptual. JSON variable validado antes de persistir; no una tabla universal de documentos para todo.
- Fechas de eventos con semántica UTC; calendario y zona del proyecto preservados. Índices iniciales para proyecto+estado, fechas, IDs externos, propuesta+versión y trabajos pendientes, justificados por las consultas del panel.
- Copia/restauración documentadas antes de demostración; sin purga automática de auditoría mientras no se acuerde retención.

## Cola, programación y operaciones externas

Una solicitud larga crea un trabajo persistido y devuelve su identificador. El trabajador adquiere control mediante transacción, mantiene una concesión temporal y registra intentos. No mantener una transacción PostgreSQL abierta mientras responde una IA o una API externa.

La cola agenda recopilación/análisis, revisiones, publicación de reportes y ejecución de acciones autorizadas. Única ocurrencia por corte; recuperación tras reinicio; límites de tiempo y de reintento por etapa. El corte semanal se calcula en America/Guayaquil, viernes 18:00. Las frecuencias de lectura y análisis de código siguen pendientes de decisión de producto; no activar intervalos arbitrarios.

Guardar intención antes de una modificación externa. Los reintentos de lectura pueden usar espera progresiva acotada y respetar límites de API. Escrituras con resultado desconocido requieren reconciliación, no reintento automático. Consultas a GitHub usan paginación y referencias de revisión; no confundir la primera página con historial completo.

Antes de escribir se revalidan versión activa, membresía, autorización, política y recurso. La concesión del trabajador debe ser vigente; si se pierde, no inicia nuevas escrituras. Como Trello y la base no comparten transacción, preservar la limitación de carrera externa y verificar el resultado.

## GitHub, Trello y candidatos de código

Conectar solo el tablero y repositorio configurados. Durante desarrollo se validarán permisos reales de acceso con el gestor, sin colocar credenciales en URLs ni logs. La API de configuración no aceptará URLs arbitrarias para ejecutar peticiones o comandos; validar host, recurso y operación permitidos.

Revisión de código mediante copia de lectura o directorio de trabajo aislado, referenciado por commit. Preparar candidatos localmente no modifica el checkout supervisado. No ejecutar scripts, hooks o instalaciones del repositorio por el hecho de analizarlo. Las comprobaciones ejecutables requieren lista permitida y entorno aislado con límites.

El candidato exacto se sella antes de revisión. Tras aprobación puede materializarse en una rama aislada y verificarse. Publicar rama o solicitud en GitHub solo si esas operaciones exactas constan en el alcance aprobado; no se asume permiso de push por aprobar una corrección. Flujo confirmado para UTAPED: agent/<proposal-id>-v<version> con PR hacia develop; incorporación a develop y main humana. Para el propio utaped-agent: desarrollo en develop y versión final validada en main. Véase docs/reports-and-operations.md. Esta planificación no crea ramas ni autoriza commits o publicaciones actuales.

## IA y secretos

ChatGPT sigue como proveedor principal previsto; ruta oficial, elegibilidad, modelos, cuota y renovación se validarán al comenzar desarrollo. No reutilizar cookies del navegador, extraer tokens de otras herramientas ni configurar cobro por API como sustitución silenciosa. Ollama es alternativa local pendiente de calidad y rendimiento. No se promete conmutación automática sin validar ambos proveedores.

Las salidas de cada agente deben validar el contrato antes de pasar al siguiente. Reglas de autoridad y transiciones son deterministas. El análisis de fuentes no permite llamadas arbitrarias a shell, URLs o herramientas con escritura.

Tokens de conexión protegidos por almacén seguro del sistema operativo; interfaz del adaptador devuelve solo referencias y estado. La integración específica de Windows y recuperación deben validarse técnicamente. No registrar cuerpos de login, cookies, cabeceras de autorización o respuestas OAuth. Las credenciales de PostgreSQL y configuración local quedan fuera de Git; ejemplos contienen solo marcadores vacíos.

## Verificación prevista y orden de implementación futura

| Paso | Entregable verificable |
| --- | --- |
| 1. Base del proyecto | Workspaces, panel/servicio mínimos, contratos y entorno PostgreSQL; versiones fijadas |
| 2. Acceso y persistencia | Migraciones, cuentas/sesiones, membresía y auditoría; espectador no puede decidir |
| 3. Lectura real | Trello y GitHub, snapshots e indicadores; importación privada como apoyo de prueba |
| 4. Proveedor y agentes | Solicitud real de IA validada, mensajes estructurados, Revisor y Aprobador separados |
| 5. Propuestas y ejecución | Flujo completo, aprobación exacta, concurrencia, rechazo y reconciliación |
| 6. Código y reportes | Candidatos verificables, reporte semanal y recuperación de cortes |
| 7. Demostración | Recorridos Playwright relevantes, comprobaciones de permisos y matriz de evidencias |

Validar el proveedor antes de invertir en sus adaptadores completos, en paralelo al diseño/implementación autorizados de persistencia. Las pruebas de reglas no necesitan IA remota; usar dobles explícitos en pruebas y mantener una verificación real separada de integración. Ningún mock constituye evidencia de conexión real ante el profesor.

## Referencias oficiales consultadas

- [Fastify: validación y serialización](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/): esquemas de rutas y salidas; no aceptar esquemas entregados por usuarios como código de validación.
- [node-postgres: transacciones](https://node-postgres.com/features/transactions): mismo cliente para toda la transacción.
- [node-pg-migrate](https://salsita.github.io/node-pg-migrate/): migraciones para PostgreSQL.
- [Fastify Session](https://github.com/fastify/session): sesiones de servidor y adaptadores de almacenamiento.
- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): Argon2id y elección de parámetros.
- [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/) y [Playwright](https://playwright.dev/docs/intro): construcción y pruebas.
- [Trello REST](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/) y [GitHub REST](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api): integraciones con permisos, paginación y límites.

Estas fuentes verifican capacidades de herramientas, no que hayan sido instaladas o probadas en este proyecto. Las decisiones de organización, API y alcance son diseño propio documentado.
