# Guía de instalación, uso y operación · 1.0.0

Actualizada el 15 de octubre de 2026. La aplicación es local e independiente de UTAPED. El registro académico conserva 38 comprobaciones superadas y una excepción histórica documentada, sin atribuir dispensa al profesor.

Esta guía conserva el recorrido base 1.0. Para las ampliaciones y migraciones actuales consultar [uso de la versión 1.1](version-1.1-guide.md).

## Instalar y actualizar

Requiere Node 24.19+ dentro de 24.x, npm 11 y Docker con Compose. Desde la raíz ejecutar:

```sh
npm ci
npm run setup
npm run db:up
npm run db:migrate
npm run user:create
npm run build
npm start
```

Abrir http://127.0.0.1:3100/. Configurar `APP_PUBLIC_URL` con ese origen para los correos y conservarlo en `APP_ORIGINS`. El modo de desarrollo usa `npm run dev` en lugar de `npm start`, con interfaz en 5174 y API en 3100. Docker Compose levanta únicamente PostgreSQL del agente en 15434, con volumen propio.

No iniciar dos servicios sobre la misma base. Si un puerto está ocupado, identificar la instancia del proyecto; no matar procesos ajenos. La salud está en `/api/v1/health`. Ctrl+C detiene el servicio; `npm run db:stop` conserva el volumen.

Antes de actualizar, hacer `npm run db:backup` y detener el servicio. Conservar `.env`, el volumen y `CHATGPT_CREDENTIAL_KEY`. Actualizar el código, instalar dependencias, ejecutar setup/migraciones/build y arrancar una sola instancia. Las configuraciones existentes se conservan; no asumir que sus escrituras están desactivadas. Editar una contraseña PostgreSQL en `.env` no rota el rol existente. No borrar datos para resolver credenciales.

Crear usuarios con `npm run user:create`; elegir conscientemente gestor o lector. No hay contraseña predeterminada ni registro público. `npm run user:reset` cambia una contraseña y revoca sesiones.

## Pantallas

| Pantalla | Uso |
| --- | --- |
| Resumen | Avance declarado, atención prioritaria y fuentes. |
| Planificación | Actividades/hitos, fechas, responsables, listas, checklists, dependencias y línea base. |
| Alertas | Retrasos, bloqueos, riesgos, desviaciones, evidencia y seguimiento. |
| Propuestas | Objetivos, versiones, dictámenes y decisiones sobre Trello. |
| Código | Cambios/correcciones acotadas y cobertura progresiva en vistas separadas. |
| Reportes | Cortes guardados, fuentes, limitaciones y versión imprimible A4. |
| Operación | Lecturas, análisis, ejecuciones programadas y fallos. |
| Configuración | Integraciones, políticas, automatización, notificaciones, apariencia y equipo. |

El lector consulta recursos autorizados, sin configurar, aprobar ni ejecutar. La sesión del panel y la conexión de ChatGPT son independientes: salir del panel no elimina por sí solo una autorización renovable válida.

## Conexiones

Trello y GitHub usan credenciales de lectura en el entorno. Las credenciales de escritura son separadas y requieren sus indicadores explícitos, además de aprobación y confirmación por recurso y versión. No incluir tokens ni invitaciones privadas en propuestas o reportes.

En Configuración → Integraciones, conectar ChatGPT, seleccionar modelo y evaluar los casos sintéticos. La renovación es automática cuando procede; cuota, revocación o cambio de autoridad pueden exigir intervención. No se garantiza disponibilidad perpetua.

Ollama es opcional: `OLLAMA_BASE_URL` identifica la instancia que atiende al servidor del agente, no necesariamente al navegador. Se descubren modelos compatibles instalados sin una lista fija de nombres. Conectado, evaluado y adecuado son conceptos distintos. Revisar suite, fecha y resultado. La calidad/velocidad dependen del modelo y equipo; el agente no descarga modelos ni cambia automáticamente de proveedor.

## Cobertura progresiva

1. Código → Cobertura del repositorio → Preparar inventario. Lee GitHub y guarda commit y clasificación; no publica código.
2. Revisar elegibles y exclusiones. El contenido potencialmente sensible no se guarda como resultado ni se envía a IA.
3. En pausa, configurar fragmentos, bytes, contexto, tiempo objetivo, intervalo e intentos. La IA requiere modelo y consentimiento explícito de envío programado.
4. Iniciar / continuar activa tandas en el servidor. Pausar impide empezar otro fragmento; el actual puede finalizar y conservarse.
5. Filtrar por módulo, ruta y estado. El historial muestra hallazgos, líneas originales, método, comprobaciones, límites y commit.
6. Cambios de contenido o dependencias identificadas invalidan resultados vigentes; el historial anterior permanece. Los sensibles no se reintentan automáticamente. Los fallos agotados admiten reintento expreso.

El porcentaje cuenta solo elegibles revisados; los parciales y excluidos se muestran aparte. Un archivo puede terminar todos sus fragmentos y seguir parcial por faltar validación conjunta. Ampliar contexto o cambiar método solicita revisión nueva; si el contexto sigue fuera del presupuesto necesita revisión manual. No ocultar límites para alcanzar 100 %.

Desde el historial se puede preparar un análisis acotado para una corrección. Se selecciona el archivo si es admisible; no se convierten fragmentos directamente en parches. Los archivos fuera del alcance de corrección conservan su evidencia para revisión manual.

## Propuestas y decisiones

Elegir recurso, objetivo, valores, propósito, modelo y consentimiento. Ejecutor, Revisor y Aprobador actúan secuencialmente; pueden pedir ajustes. El gestor revisa versión/huella, alcance, riesgos y comprobaciones, y registra un motivo.

Aprobar no ejecuta. El uso real requiere confirmación separada y comparación de la fuente vigente. Ante resultado incierto, consultar reconciliación sin reenviar ciegamente. Las demostraciones no escriben. En código se publica rama y PR borrador a `develop`; la incorporación a `develop` y `main` es humana.

## Horarios, notificaciones y reportes

Configuración → Automatización permite cambiar intervalos, días, hora y minuto de revisiones y reportes. La cobertura tiene su intervalo propio en Código. Activar revisión de cambios y cobertura con IA puede repetir consumo: dar a cada recorrido un propósito definido.

Los horarios de calendario usan America/Guayaquil. El intervalo de cobertura comienza al terminar la tanda; el tiempo objetivo se comprueba entre fragmentos y una llamada puede superarlo. Equipo, PostgreSQL y servicio deben permanecer encendidos; no hay tarea de inicio de Windows instalada.

En Configuración → Notificaciones guardar destinatario, comprobar SMTP y pedir prueba. Seleccionar eventos, resumen, recordatorios, máximo y silencio; activar el consentimiento automático cuando se desee. SMTP permanece en `.env`. Aceptado por SMTP no acredita llegada a Recibidos. Los avisos no aprueban cambios.

Los reportes conservan evidencia anterior al corte. La cobertura usa un corte inmutable guardado antes de ese reporte y no lo sustituye con resultados futuros. Generación/publicación interna son deterministas y no consumen una inferencia nueva ni autorizan escrituras. Los avisos se tramitan por la cola SMTP separada. Para PDF: versión imprimible, Ctrl+P, Guardar como PDF, A4.

Los listados antiguos de Código muestran los últimos 30 análisis; sus filtros no representan el historial completo. La cobertura pagina archivos desde el servidor y muestra últimas 30 tandas/hasta 100 fragmentos recientes por archivo. La evidencia completa permanece en la base.

## Verificar y recuperar

Ejecutar `npm run typecheck`, `npm run test:isolated`, `npm run build` y `npm run verify:install`. Las pruebas aisladas evitan interrumpir trabajos reales y usan adaptadores externos sintéticos; no repiten las escrituras históricas autorizadas.

`npm run db:backup` crea un dump y configuración privada con acceso restringido, y prueba restaurarlos en otra base. Seguir [respaldo y recuperación](backup-and-recovery.md) antes de restaurar la operación. El paquete distribuible excluye credenciales y respaldos.

La cobertura no compila Java, ejecuta scripts, recorre todas las pantallas ni valida funcionalmente todo UTAPED. Los hallazgos requieren contraste y los cambios conservan control humano.
