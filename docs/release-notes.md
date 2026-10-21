# Dev Project Agent 1.1.0 · notas de versión

Implementación local del 20 de octubre de 2026. Añade informes institucionales basados en la plantilla aportada, gráficos deterministas, logo y HTML imprimible congelados; enrutamiento de correo por actividad/fase y tipo de evento; seguimiento de etapas; retirada antes de escritura y recuperación mediante propuestas; ficha de cambios y asistente con mascota discreta.

Las tres migraciones son aditivas. Se conserva configuración existente y no se añaden destinatarios automáticamente. La reversión exige valores vigentes, nueva revisión y confirmaciones; GitHub conserva la fusión humana. La preparación del inverso de código fusionado es determinista y sus etapas posteriores usan el proveedor seleccionado.

Consultar [guía 1.1](version-1.1-guide.md) y [comprobaciones, criterios pendientes y límites](validation/version-1.1-validation.md). Los tests aislados y las pruebas visuales sintéticas no acreditan la aceptación real completa. La interpretación con modelos reales, los recursos concretos de reversión y la inspección final de PDF tienen cierre propio. No hay purga automática, firma certificada ni nuevos proveedores.

---

# Dev Project Agent 1.0.0 · notas de versión

Versión local preparada el 15 de octubre de 2026. ChatGPT es el proveedor principal validado. Ollama permite modelos compatibles de la instancia configurada, con evaluación y advertencia de calidad por modelo/equipo. Conectar no acredita calidad.

Incluye supervisión Trello/GitHub, políticas/horarios dinámicos, línea base, alertas, SMTP consentido, reportes históricos imprimibles, propuestas de tres roles, decisiones humanas y ejecución/publicación con confirmación separada. Mantiene la interfaz moderna azul y gris, con modos claro/oscuro.

El cierre añade cobertura progresiva: inventario, estados/motivos, cola por fragmentos, contexto local, continuación, pausa, reintentos, invalidación por cambios y consumidores, módulos, filtros/paginación y evidencia histórica. Los reportes usan un corte de cobertura anterior a su fecha. Las correcciones conservan su flujo acotado; no se publican desde fragmentos.

Añade pruebas en base aislada, verificación de instalación compilada, respaldo privado con restauración y empaquetado desde commit limpio con manifiesto/SHA-256. La presentación de Código mantiene los ajustes visuales posteriores del gestor; el build actual puede advertir sobre el tamaño del JavaScript inicial.

La aceptación conserva 38 comprobaciones superadas y EX-01 para una aprobación antigua sin motivo. No se altera la decisión histórica ni se atribuye dispensa al profesor. Las escrituras previas verificadas no se repiten para empaquetar.

Requiere Node 24.19+ dentro de 24.x, npm 11, PostgreSQL 18 y Docker Compose para operación local. Actualizar exige respaldo, dependencias, migraciones, build y reinicio. El navegador puede cerrarse; el equipo y servicio deben permanecer activos.

No incluye alojamiento público, inicio automático del sistema, merge de PRs, certificación ISO, validación funcional completa de UTAPED ni aceptación general de calidad de Ollama. Gemini/Groq y nuevos benchmarks quedan diferidos. La defensa permanece en su rama temporal.

El paquete local no implica publicación remota, promoción a `main`, etiqueta Git ni entrega al profesor; esas acciones requieren la decisión final del gestor.
