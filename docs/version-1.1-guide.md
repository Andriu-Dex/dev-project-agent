# Uso y actualización · versión 1.1

Actualizada el 20 de octubre de 2026. Complementa la [guía 1.0](first-release-guide.md); no modifica sus evidencias académicas ni EX-01. Consulte la [especificación](version-1.1-specification.md) y el [registro de comprobaciones](validation/version-1.1-validation.md).

## Actualización local

Conservar `.env`, clave de cifrado ChatGPT y base de datos. Detener la instancia de este proyecto antes de cambiar el servidor; no cerrar procesos de otros proyectos. Desde la raíz:

```sh
npm run db:backup
npm ci
npm run db:migrate
npm run build
npm start
```

El respaldo es privado. Las tres migraciones `1792494000000`, `1792494001000` y `1792494002000` añaden estructura y permisos; no reescriben decisiones ni informes previos. No requieren credenciales nuevas. Para desarrollo, usar `npm run dev` en lugar de `npm start`; no ejecutar ambos sobre la misma base.

Las comprobaciones `npm run test:isolated`, `npm run verify:install` y `npm run verify:upgrade` crean y eliminan sus propias bases sintéticas. No son instrucciones para ejecutar reversiones en UTAPED. Una base operativa no debe utilizarse para las suites optativas antiguas.

## Informes con formato institucional

En **Reportes → Formato institucional del informe**, configurar organización, proceso, subproceso, título y prefijo documental. Se utiliza `apps/web/public/brand-logo.jpg`; cambiar ese archivo requiere actualizar la aplicación, no enviar una URL externa. Campos institucionales no configurados se identifican; no se inventa aprobación de códigos oficiales.

Generar un informe nuevo o preparar otra versión del periodo indicando el motivo. Los informes nuevos incluyen once secciones basadas en la plantilla LaTeX, gráficos y tablas alternativas. Papel predeterminado: Carta, márgenes de 2 cm, cuerpo de 10 pt e interlineado 1,25. La salida sigue siendo HTML imprimible: Ctrl+P permite guardar PDF; no se instala un motor LaTeX ni se ofrece exportación Word.

Los gráficos distinguen avance declarado, estados, vencimientos y cobertura. La comparación temporal exige universos iguales y observaciones válidas al corte; si faltan datos comparables se explica la ausencia. No atribuir aceptación formal a un porcentaje, ni calidad completa a cobertura de código.

Cada resultado nuevo conserva datos, imagen, metadatos, código y versión de configuración, HTML imprimible y huellas. Las revisiones conservan el código asignado y el historial; un código aún no configurado puede asignarse al preparar una versión posterior. Cambiar la configuración no modifica resultados ya emitidos. Los reportes 1.0 mantienen su representación compatible.

Filtros de fecha/estado consultan todo el historial en el servidor. **Cargar más informes** incorpora los siguientes 60 registros, sobre los que se conserva la paginación del panel. No existe eliminación automática a 30 días. La sección de firmas indica con claridad que la generación y validación automáticas no son aceptación ni firma humana.

## Avisos a responsables

En **Configuración → Notificaciones**, seleccionar audiencia general y, opcionalmente, excepciones por tipo de aviso: gestor, responsables o ambos. Vincular un integrante de Trello con su correo explícito; también puede vincularse una fase/lista. La fuente debe estar sincronizada para seleccionar miembros y listas.

Prioridad: miembros asignados con vínculo válido; si faltan, responsable de fase. El gestor se incluye según la regla y la alternativa seleccionadas. No se adivinan correos ni se otorgan permisos por recibir avisos. Los reportes y fallos generales carecen de actividad: usar una regla que incluya al gestor si se desea recibirlos.

**Ver destinatarios efectivos sin enviar** consulta alertas activas y muestra direcciones resueltas o ausencia de destinatarios. La entrega vuelve a comprobar la última lectura guardada y la configuración vigente; no representa una consulta en vivo de Trello para cada correo. Cambiar configuración cancela pendientes de la versión anterior. Las instalaciones existentes conservan su destinatario y activación; nadie se añade automáticamente.

Los mensajes son individuales, sin CC/BCC, con deduplicación y presupuesto diario por dirección/proyecto. Permanecen resumen, silencio y recordatorios. Un resultado SMTP aceptado no acredita lectura ni llegada a la bandeja. Una prueba real exige confirmar el destinatario.

## Actividad de los agentes

En Propuestas, Código y dentro del chat puede consultarse **Actividad de los agentes**. Muestra etapas confirmadas, estado, tiempo y última evidencia. También incorpora análisis, informes, supervisión y tandas de cobertura.

Una inferencia pendiente tiene una barra indeterminada: no conocemos su porcentaje interno. El aviso configurable de 1–5 minutos sin novedades no confirma un bloqueo ni modifica el timeout del proveedor. El seguimiento del panel no prueba avance del modelo. En cobertura se distinguen archivos revisados del universo elegible y fragmentos confirmados por tanda; el presupuesto de fragmentos no se presenta como un total conocido de trabajo.

Cerrar o recargar el panel no vuelve a ejecutar un trabajo. Ante fallo/interrupción, consultar el historial y usar únicamente las opciones de continuación/reconciliación admitidas.

## Revocación y recuperación

**Retirar autorización/corrección** conserva su motivo e historia. Puede impedir un trabajo ya tomado durante las comprobaciones previas, si aún no alcanzó la marca persistida de inicio de escritura. Si la marca ya existe o hay resultado incierto, se rechaza la revocación: primero consultar/reconciliar; no se promete detener una escritura en vuelo.

En una ejecución Trello verificada, abrir **Preparar reversión o retiro**. Actualizar fuentes y supervisión; indicar motivo, modelo y consentimiento. Se prepara otra propuesta con valores anteriores exactos, incluso fechas históricas, fechas vacías o asignación anterior vacía cuando corresponda. Sus tres etapas, decisión humana y confirmación de ejecución son independientes de la autorización original. La ejecución revalida el estado remoto y recursos disponibles; un conflicto no se sobrescribe.

En **Código → Publicaciones y PRs**, abrir el mismo control:

- PR abierto y sin cambios en identidad/HEAD: preparar plan de cierre, revisarlo, aprobarlo y confirmar la ejecución por separado. Se conserva rama y commits. Una incertidumbre exige reconciliar por lectura; no se repite el cierre ciegamente. El gestor que preparó el retiro conserva su autoridad y realiza las dos confirmaciones; puede retirar ese plan antes de que comience su ejecución. Un PR abierto no necesita inferencia para preparar el cierre.
- PR fusionado: se reconstruye el inverso exacto de la corrección sobre el HEAD actual únicamente cuando los archivos afectados mantienen los blobs publicados, dentro de los límites del analizador (hasta tres archivos y rangos acotados). El Ejecutor prepara ese inverso de forma determinista y lo registra; Revisor y Aprobador usan el modelo elegido. La persona revisa y autoriza la versión nueva y solicita un PR borrador mediante el flujo normal. La integración sigue siendo humana.
- Archivo cambiado posteriormente, contexto/configuración distintos, rango no admitido o conflicto: se bloquea la preparación y se requiere una corrección manual o un análisis nuevo. No es un servicio general para revertir commits arbitrarios.

Nunca se hace reset, force-push, borrado de ramas ni merge automático. Revertir código no deshace datos, migraciones, notificaciones u otros efectos externos. Una reversión puede reintroducir un problema y requiere sus propias pruebas.

## Justificación del código

Cada candidato nuevo incluye una ficha vinculada a su huella: objetivo, evidencia, antes/después, motivo, impacto, riesgos, comprobaciones realizadas/pendientes, recuperación y alternativa de conservar el código. Está disponible en el detalle y acompaña al PR. Tiene límite de 40 000 bytes; un exceso bloquea la preparación, sin truncar evidencia silenciosamente.

Las instrucciones de preparación piden comentarios en inglés que expliquen decisiones no evidentes y respeten la sintaxis; no comentarios por línea ni comentarios dentro de JSON. La necesidad y calidad semántica se revisan en el diff. La ficha no sustituye una prueba funcional ni documenta automáticamente todo UTAPED.

## Asistente y mascota

El botón inferior derecho abre el chat; el cambio de tema está en la barra superior. En móvil ocupa la pantalla, se puede ampliar en escritorio y la mascota puede ocultarse. Escape cierra y devuelve el foco al botón. Se respetan las preferencias de movimiento reducido.

Sin modelo se ofrecen consultas estructuradas de atención, propuestas, reportes y trabajos, navegación, preparación de un informe y solicitud de supervisión. Para lenguaje natural específico, seleccionar proveedor/modelo y autorizar el envío de la solicitud, tres mensajes previos y metadatos acotados del proyecto. La conexión no demuestra calidad; no hay fallback.

Ejemplos de solicitudes con modelo:

- «Propón cambiar el vencimiento de [actividad] al 2026-11-04 a las 18:00, hora de Ecuador». Fechas ambiguas se aclaran antes de preparar. Indicar inicio solo si también debe cambiar.
- «Prepara asignar [actividad] a [integrante]» o «Prepara su prioridad [etiqueta]».
- «Revisa los archivos [rutas]» y «Prepara una corrección para los hallazgos [IDs] del análisis [ID]».
- «Muéstrame para decidir la propuesta [ID]» y, en otro paso, «Prepara ejecutar la propuesta aprobada [ID]».
- «Prepara una reversión de la ejecución [ID]» o «Prepara recuperar la publicación [ID]».
- «Configura los reportes para viernes a las 18:00» o «Cambia el resumen de correos a las 19:00».

El modelo interpreta y propone; el backend construye herramientas permitidas y las valida. Cada acción muestra su alcance y pide confirmación. Las decisiones requieren motivo; ejecutar o publicar tiene otro control y conserva las puertas de autorización existentes. El texto «sí» no concede permiso. Las tarjetas reutilizan una clave persistida para evitar duplicados por reenvío. Un recurso cambiado o una tarjeta antigua se rechaza según su estado/versión.

Las conversaciones son privadas por usuario/proyecto, paginadas y conservadas en PostgreSQL; no se purgan automáticamente. No incluir credenciales. No existe shell, SQL libre, acceso arbitrario a archivos, descarga de modelos ni fusión desde el chat. Si falla la interpretación, la pantalla equivalente sigue disponible. Los trabajos continúan al cerrar el chat.
