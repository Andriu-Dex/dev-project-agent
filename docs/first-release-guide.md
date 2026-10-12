# Guía de instalación y operación

Actualización: 12 de octubre de 2026. Esta guía describe la implementación local de la primera versión. La aceptación académica se registra por separado en la [matriz de cierre](academic-acceptance-matrix.md).

## Instalar y arrancar

Requisitos: Node.js 24.19, npm 11 y Docker Compose. Ejecutar desde la raíz del repositorio:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run user:create
npm run dev
```

El panel se abre en `http://127.0.0.1:5174`; el servicio escucha en `http://127.0.0.1:3100`. Para una ejecución compilada: `npm run build` y `npm start`; abrir entonces el puerto 3100. Mantener el servicio y PostgreSQL encendidos para la programación. Cerrar el navegador no detiene los trabajos; apagar el equipo sí.

`setup` conserva los valores existentes, agrega opciones ausentes con escrituras desactivadas y restringe `.env`: usuario actual, sistema y administradores en Windows; modo 600 en otros sistemas. No imprime claves. Las credenciales Trello/GitHub siguen almacenadas como texto local protegido por permisos; no se afirma cifrado en reposo de esos tokens. ChatGPT usa almacenamiento cifrado en PostgreSQL con la clave local. Respaldar base y clave de cifrado de manera protegida; cambiar o perder la clave puede impedir recuperar el acceso guardado.

PostgreSQL usa el puerto local 15434 y un volumen independiente. No eliminar ese volumen para reparar errores: contiene sesiones, fuentes, propuestas, decisiones y reportes. La modificación de contraseñas en `.env` no cambia automáticamente los roles existentes de la base. Las migraciones se ejecutan con el rol de administración; el servicio utiliza el rol restringido de aplicación.

Configurar las credenciales de lectura en `.env` sin compartir su contenido. Reiniciar el servicio después de modificar variables del entorno. Las credenciales de escritura están separadas y las opciones `TRELLO_WRITES_ENABLED` y `GITHUB_WRITES_ENABLED` permanecen en `false` en el entorno actual. Consultar [ejecución Trello](trello-execution.md) y [publicación GitHub](github-publication.md) antes de preparar una validación real autorizada.

## Navegar el proyecto

| Página | Uso del gestor |
| --- | --- |
| Resumen | Avance declarado, antigüedad de las fuentes, pendientes y accesos al trabajo prioritario. |
| Planificación | Buscar actividades/hitos; contrastar fechas, estado, prioridad, asignados, dependencias y evidencia de Trello. |
| Alertas | Revisar retrasos, próximos vencimientos, bloqueos, diferencias contra línea base y riesgos de dependencias; documentar seguimiento y causas. |
| Propuestas | Preparar un cambio delimitado, revisar los tres dictámenes, solicitar ajustes, aprobar/rechazar y consultar ejecución. |
| Código | Leer catálogo por commit, seleccionar archivos, analizar, preparar corrección y revisar diff, decisiones y publicación. |
| Reportes | Generar/versionar un corte, programar reportes semanales y abrir salida imprimible A4 para guardar como PDF. |
| Operación | Configurar lecturas y revisión diaria, confirmar línea base, actualizar fuentes y consultar trabajos/historial. |
| Configuración | Conectar ChatGPT, evaluar proveedor, seleccionar capacidades verificadas y editar reglas del proyecto. |

La navegación conserva una página por tarea, con menú móvil, temas claro/oscuro y foco de teclado. Las fuentes y valores declarados conservan su procedencia; los estados no acreditan aceptación formal. El perfil de consulta puede leer resultados, pero no configurar, aprobar, ejecutar ni enviar datos a ChatGPT.

## Primer recorrido de supervisión

1. Ingresar como gestor; abrir Operación y actualizar fuentes.
2. Revisar Planificación. Una ausencia de prioridad o bloqueo significa falta de información o mapeo, no prioridad baja ni ausencia de impedimentos.
3. En Configuración, definir etiquetas exactas de prioridad, bloqueo y estado, y los umbrales de vencimiento/frescura. Guardar una versión. Las etiquetas contradictorias quedan señaladas.
4. En Operación, confirmar una línea base después de revisar la lectura. No reemplazarla para esconder desviaciones; cada confirmación conserva historia.
5. Actualizar y abrir el resultado. Planificación muestra el estado observado; supervisión muestra diferencias contra la referencia confirmada.
6. Abrir Alertas. Una lectura reciente permite abrir, actualizar o resolver alertas; las lecturas viejas no las resuelven. Reconocer una alerta conserva evidencia y no autoriza cambios externos.

El avance cuenta actividades activas completadas declaradas sobre actividades activas. Los hitos, archivadas y referencias quedan fuera del denominador. Bloqueo y retraso pueden coexistir sin incrementar el total de actividades.

## Causas, alternativas y propuestas

Una descripción con `CAUSA:` o `CAUSA DE RETRASO:` proporciona una causa declarada. Si falta evidencia, se muestran hipótesis. El gestor puede confirmar una causa con nota; se conserva actor/fecha y el reporte recupera la confirmación disponible al corte. El análisis recorre sucesoras explícitas y explica efectos posibles; no inventa capacidad, duración restante, probabilidades ni ruta crítica.

Las alternativas identifican actividad, beneficio, riesgo y datos necesarios. Conservar el plan conduce a registrar seguimiento; reprogramar, priorizar o redistribuir abre el formulario de la familia correspondiente. El gestor completa las fechas o integrantes concretos antes de iniciar los agentes.

Cada propuesta nueva es demostrativa por defecto. Para uso real hay que seleccionar ese propósito al crearla; es inmutable. Se admite una tarjeta y una acción exacta: vencimiento; inicio/vencimiento; prioridad; miembros asignados; estado declarado. Las etiquetas ajenas a la familia se conservan. El cambio de miembros no reescribe la descripción ni el responsable principal declarado en ella: revisar su coherencia antes de aprobar.

La secuencia es Ejecutor → Revisor → Aprobador → decisión humana. El consentimiento para enviar contexto a ChatGPT no autoriza una escritura. Un ajuste produce otra versión, repite las etapas y no hereda la aprobación anterior. Comparar siempre los valores previos/nuevos, evidencia, riesgos y verificaciones. El rechazo impide ejecutar; una demostración nunca puede escribir, incluso si después se habilita el entorno.

Para una propuesta real autorizada, la ejecución requiere otra confirmación. El servicio vuelve a comprobar permisos, fuente, política, versión y huella; registra intención antes de escribir y relee el resultado. Un resultado incierto requiere reconciliación sin repetir la escritura. La antigua demostración del usuario permanece invalidada y conservada como historia.

## Revisar código y PR

Leer el catálogo y seleccionar archivos dentro de un commit fijo. La revisión diaria usa hashes de contenido para evitar revisar otra vez archivos ya cubiertos, con límite diario y lotes de hasta cuatro archivos. Los aplazados/excluidos se enumeran; cobertura parcial no se presenta como revisión de todo el repositorio.

El [catálogo de criterios](code-standard-catalog.md) cubre seis categorías mediante señales acotadas y casos controlados TS/Java. Los hallazgos citan archivo/líneas y distinguen hipótesis de comprobaciones. No se ejecuta código, dependencias, build ni scripts de UTAPED. Java requiere compilación y pruebas adicionales; una revisión aislada no demuestra seguridad ni corrección del producto completo.

Una corrección conserva fragmentos anteriores/nuevos, diff, huella, dictámenes y decisión. Descargar y revisar el diff. Para uso real, la publicación crea únicamente una rama `agent/<proposal-id>-v<version>` y PR borrador hacia `develop`, sujeto a configuración y nueva confirmación. El estado verificado incluye enlace al PR; la incorporación a `develop` y después a `main` sigue siendo humana. Consultar el [procedimiento de publicación y recuperación](github-publication.md).

## Programar y publicar reportes

Operación permite configurar intervalo de fuentes, hora diaria de código en Ecuador, límite de archivos y consentimiento de IA. Las programaciones comienzan desactivadas. El selector de modelo/razonamiento utiliza capacidades verificadas de la conexión. Sin IA, se realizan comprobaciones locales. Un fallo de conexión/cuota o tres fallos transitorios suspende la operación afectada; revisar el historial antes de guardar una configuración para reanudarla.

Tras una pausa, las fuentes se actualizan al estado disponible; no se inventan observaciones históricas. Un análisis de IA pendiente reutiliza la solicitud idempotente y la cobertura ya confirmada. Los trabajos automáticos conservan gestor autorizante y versión de autoridad; su revocación detiene nuevos trabajos.

En Reportes, configurar día/hora de corte o generar manualmente. El viernes 18:00 Ecuador es el valor inicial del proyecto. El reporte congela fuentes, política, línea base, causas disponibles, acciones/decisiones, revisión de código y recomendaciones; los periodos parciales y evidencias ausentes quedan explícitos. Ejecutor, Revisor y Aprobador deterministas comprueban el reporte antes de publicarlo en el panel. Publicar un reporte interno no autoriza modificaciones externas.

Una nueva versión conserva las anteriores del mismo periodo. Abrir la versión imprimible y usar la función del navegador para guardar como PDF. Revisar las nueve secciones principales, el anexo, las referencias y los límites antes de usarla como evidencia académica. Una aprobación, simulación y publicación de PR tienen resultados distintos; ninguna demuestra un merge.

## Resolver incidencias

Al confirmar una causa, el sistema la liga a la evidencia de la tarjeta que se revisó. Si la tarjeta cambia, actualizar el detalle: la explicación anterior permanece en el historial y solo se reutiliza cuando corresponde a la misma evidencia. Las solicitudes de publicación conservan al gestor solicitante; las escrituras y comprobaciones automáticas se identifican como acciones del servicio.

| Síntoma | Revisión |
| --- | --- |
| Error de proxy o conexión rechazada | Comprobar que el servicio y PostgreSQL están encendidos; actualizar el panel después de arrancarlos. |
| ChatGPT vencido/revocado | Actualizar conexión; la renovación temporal usa espera, pero una revocación o renovación incierta requiere reconectar. No se garantiza sesión indefinida ni cuota disponible. |
| Fuente modificada/conflicto | Actualizar fuentes y preparar nueva versión; no aprobar otra vez contenido antiguo. |
| Revisión o cobertura parcial | Abrir límites, archivos omitidos y trabajos pendientes; no concluir que el proyecto completo fue revisado. |
| Publicación o Trello sin resultado confirmado | Consultar el estado guardado y reconciliar por lectura; no repetir la acción desde otra propuesta para eludir el bloqueo. |
| Programación suspendida | Revisar código de error, permisos/conexión y límites; reanudar explícitamente guardando configuración tras corregir la causa. |

## Verificación antes de entregar

Ejecutar `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`, las diez suites PostgreSQL documentadas en README y `npm run test:ui`. Los fixtures usan transporte sintético y rollback. Las capturas/PDF de prueba quedan en `work/ui/`, ignorado por Git.

Después, realizar el guion de los 39 AC de la matriz con datos representativos, confirmar programación sin navegador, observar renovación real y preparar recursos de escritura autorizados con nuevas decisiones específicas. Registrar commit, configuración, resultado esperado/observado, evidencia y responsable por criterio. No marcar la entrega como aprobada solo por pasar pruebas automatizadas.
