# Guía de demostración de Dev Project Agent

Caso supervisado: UTAPED. Revisión del guion: 15 de octubre de 2026.

## Preparación

1. Iniciar PostgreSQL, API y panel con los comandos del [README](../README.md). La API utiliza el puerto 3100 y el panel de desarrollo el 5174. Comprobar el entorno efectivo antes de presentar.
2. Ingresar como gestor sin mostrar contraseñas, tokens ni el contenido de `.env`.
3. Comprobar las fuentes y sus fechas de observación. No presentar porcentajes históricos como valores actuales.
4. Preparar una tarjeta de prueba identificada, con propósito **Demostración**. Este propósito nunca permite modificar Trello ni publicarse en GitHub.
5. Revisar [el estado de implementación](archive/validation/implementation-status.md), [las evidencias reales](validation/real-acceptance-validation.md) y [la matriz académica](academic-acceptance-matrix.md). No anunciar aceptación de los 39 criterios mientras esté pendiente.

## Recorrido sugerido

### Resumen y planificación

Mostrar el avance declarado y su universo de actividades, la fecha de lectura y las limitaciones. Estado declarado en Trello, progreso real y aceptación formal son conceptos distintos. La lectura de GitHub tampoco demuestra por sí sola calidad del código.

### Alertas

Abrir un atraso o bloqueo y explicar la evidencia disponible. Diferenciar causa declarada, causa confirmada e hipótesis. No inventar duración restante, disponibilidad de integrantes o impacto causal en dependencias.

### Propuestas y control humano

Seleccionar proveedor y modelo, revisar el contexto que se enviará y consentirlo expresamente. Mostrar Ejecutor, Revisor y Aprobador como etapas secuenciales. El dictamen del Aprobador no reemplaza la decisión del gestor.

Revisar la versión exacta, sus valores esperados, riesgos, alternativas y verificación prevista. Mostrar rechazo o solicitud de ajustes con motivo si corresponde. Una simulación automatizada de aprobación en un fixture no acredita una aprobación humana real.

En uso real, aprobar y ejecutar son pasos separados. No ejecutar una modificación como parte de una presentación sin autorización específica para ese cambio. Las correcciones de código pueden preparar rama y PR; su integración sigue siendo humana.

### Código

Explicar el commit y los archivos delimitados. Diferenciar hallazgos deterministas de inferencias del modelo y pruebas realmente ejecutadas de verificaciones pendientes. No afirmar que se midió complejidad ciclomática, compiló Java o probó funcionalidad si no hay evidencia.

Los modelos Ollama evaluados no completaron satisfactoriamente el flujo de revisión de código. Presentarlo como una limitación vigente, no como una función validada de esos modelos.

### Reportes y automatización

Abrir un reporte conservado y su versión imprimible. Explicar periodo, fuentes, limitaciones e historial. Guardar como PDF mediante la función de impresión del navegador cuando corresponda; no describirlo como un documento con firma electrónica certificada.

Mostrar los días, hora e intervalo guardados. El equipo y el servicio necesitan estar activos. Una configuración visible no demuestra que todos sus próximos cortes ya fueron ejecutados.

### Notificaciones

Mostrar destinatario, tipos de aviso, resumen, recordatorios y horario de silencio. El gestor confirmó recepción de un correo de prueba; esto no valida automáticamente todos los eventos y horarios. No reenviar pruebas ni activar correo automático sin la decisión correspondiente.

### Proveedores

ChatGPT y Ollama se eligen explícitamente; no hay cambio automático de proveedor ante un fallo. Ollama es el servidor de inferencia: su calidad depende del modelo y los parámetros. No prometer privacidad absoluta, coste operativo nulo o latencia fija.

Consultar el [informe Ollama](archive/experiments/ollama-improvement-report.md), especialmente su corrección y reconciliación. Ningún modelo local evaluado está validado para sustituir al proveedor principal. Los nuevos parámetros necesitan evaluación real antes de cerrar las compuertas pendientes.

## Seguridad y recuperación

Las decisiones se vinculan a una sesión autorizada y una huella de contenido. No son firmas electrónicas certificadas. Las restricciones del rol ordinario no impiden toda intervención de un administrador de la base.

Ante una escritura incierta, el producto conserva el estado para reconciliar mediante lectura; no se debe afirmar éxito ni reintentar a ciegas. Los distintos tipos de trabajo tienen mecanismos de recuperación diferentes.

La ubicación y uso de los datos dependen de la configuración y del proveedor. El contexto consentido puede incluir código y datos de planificación. Nunca presentar toda la aplicación como exclusivamente local cuando utiliza servicios externos.

## Cierre

Enumerar qué se demostró realmente, qué quedó simulado y qué sigue pendiente. Conservar los identificadores y resultados necesarios para revisar la evidencia sin compartir credenciales ni exportaciones privadas.
