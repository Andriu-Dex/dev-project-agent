# Arquitectura prevista

## Decisión de solución

Actualización aceptada el 7 de octubre de 2026: PostgreSQL sustituye a SQLite para facilitar el crecimiento posterior a un servicio compartido. La base y las credenciales del agente serán independientes de UTAPED. Se prevé Docker Compose para el entorno local; no se ha creado configuración ni iniciado servicios.

El alcance de entrega sigue siendo un solo proyecto UTAPED. El diseño mantiene projectId y configuración versionada por proyecto, separando mapeos de Trello, repositorio, responsables y reglas de la lógica general. El alta de múltiples proyectos, aislamiento entre organizaciones y alojamiento continuo quedan fuera de esta entrega.

El stack base queda definido: React/TypeScript para el panel, Node.js/TypeScript para el servicio, PostgreSQL para persistencia y coordinación propia de tres agentes. El [diseño técnico](technical-design.md) concreta Fastify, pg, node-pg-migrate, sesiones de servidor y pruebas Vitest/Playwright. La [API prevista](api-design.md) define rutas, permisos y concurrencia. Versiones y compatibilidad se verificarán antes de instalar; ChatGPT y Ollama siguen sujetos a validación.

Aplicación local independiente, con panel React/TypeScript, servicio Node.js/TypeScript y PostgreSQL. Versiones, librerías HTTP, acceso a PostgreSQL y distribución se elegirán en el diseño técnico posterior. No se instalarán herramientas durante esta fase.

El proyecto supervisado utiliza React/TypeScript/Vite, Java 21/Spring Boot y PostgreSQL/Flyway, según los manifiestos locales inspeccionados. El agente supervisa su código y planificación; no necesita acceso a los datos académicos ni a la base productiva de UTAPED.

## Componentes

| Componente | Responsabilidad |
| --- | --- |
| Panel | Estado del proyecto, alertas, propuestas, decisiones, reportes e historial |
| Conector Trello | Lectura de tablero, comparación de consultas y escritura autorizada |
| Conector Git/GitHub | Obtener referencias y cambios; preparar propuestas de código autorizadas |
| Motor de reglas | Cálculos reproducibles de fechas, avance, riesgo y permisos |
| Ejecutor | Analizar tareas y código; preparar propuestas y borradores de reporte |
| Revisor | Contrastar fuentes, cálculos, riesgos y consistencia; aceptar revisión o devolver para ajustes |
| Aprobador | Verificar revisión y política de autorización; solicitar decisión humana cuando corresponda |
| Control de ejecución | Verificar aprobación, versión y estado actual; ejecutar una vez y comprobar resultado |
| Programador | Iniciar consultas, revisiones periódicas y reportes semanales |
| Persistencia | Consultas, línea base, propuestas versionadas, decisiones, ejecuciones y auditoría |
| Adaptador de IA | Encapsular proveedor y modelo sin cambiar reglas ni permisos |

## Flujo y autoridad

Recopilación → Ejecutor → Revisor → Aprobador → autorización humana para modificaciones → ejecución controlada → verificación y auditoría.

Cada agente tendrá un contexto, instrucciones, herramientas y salida diferenciados. Podrán compartir el mismo modelo y se ejecutarán en secuencia. El Aprobador no suplanta la autorización del gestor. El control de ejecución aplica la política desde el programa, independientemente de lo que diga un modelo.

Si cambia la propuesta o el recurso externo después de aprobar, se detiene la ejecución y se solicita nueva revisión y autorización. Los reintentos deben consultar el resultado para no duplicar acciones.

## Datos previstos

El [modelo conceptual de PostgreSQL](data-model.md) define entidades, relaciones e integridad. Las [pantallas del gestor](manager-screens.md) y [recorridos funcionales](manager-workflows.md) vinculan datos, acciones y permisos. Son diseño para revisión: aún no hay SQL, migraciones ni interfaz implementada.

Los intercambios y campos mínimos se definen en [contratos de datos](data-contracts.md). Las autoridades, transiciones y recuperación se especifican en [flujo de propuestas](proposal-workflow.md). Son diseño documental: no hay esquemas ejecutables ni implementación todavía.

Proyecto, actividad, dependencia, consulta de fuente, línea base, hallazgo, propuesta, versión de propuesta, revisión, aprobación, ejecución, reporte y evento de auditoría. Los registros deben enlazarse mediante identificadores para reconstruir la secuencia.

## Proveedores y validación pendiente

ChatGPT será el proveedor principal previsto, mediante autenticación oficial y sin configurar facturación adicional. La elegibilidad de la cuenta, los límites, los modelos y el funcionamiento deben verificarse al comenzar el desarrollo. No se garantiza disponibilidad por el hecho de contar con Plus.

Referencia consultada durante la planificación: https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt

Ollama será una alternativa evaluada en el equipo i7-13700H, 16 GB RAM y RTX 4060 Laptop de 8 GB. Modelo, cuantización, calidad y velocidad están pendientes de medición. Se analizarán cambios acotados y archivos relevantes, sin cargar todo el repositorio en cada consulta.

Referencias: https://docs.ollama.com/gpu y https://docs.ollama.com/context-length

No se incluye OpenClaw en la solución inicial. No se requiere entrenamiento ni aprendizaje automático persistente: el historial y las reglas documentadas proporcionarán contexto.

## Seguridad y operación

- Sesión del gestor y permisos comprobados en el servicio; los demás integrantes solo consultan inicialmente.
- Credenciales protegidas mediante el almacén seguro del sistema operativo o un mecanismo equivalente validado. No guardar tokens en texto plano en PostgreSQL ni en el navegador; separar claves de los datos cifrados.
- Excluir secretos, certificados, archivos de entorno y datos personales innecesarios del contexto del modelo.
- Tarjetas, comentarios y contenido del repositorio son datos no confiables: no pueden modificar reglas de autorización ni ordenar ejecuciones.
- Los agentes de análisis no disponen de escritura directa sobre Trello ni sobre la rama principal.
- No ejecutar código descargado ni scripts del repositorio sin controles definidos. Planificar comprobaciones en un entorno aislado.
- Limitar consultas y registrar su última ejecución correcta. Si falla una fuente, indicar datos desactualizados; no simular éxito.
- Tareas locales requieren equipo activo. Recuperar ejecuciones pendientes al reiniciar, sin duplicar reportes ni acciones.

## Pendientes de diseño

Autenticación local y primer gestor, modalidad exacta de acceso a GitHub y Trello, frecuencia de consultas, herramienta de análisis por lenguaje, formatos del reporte, política de copias de seguridad y retención, rama destino y ruta concreta de autenticación ChatGPT.
