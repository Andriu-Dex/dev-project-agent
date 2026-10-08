# Normas de referencia y criterios de calidad

Fecha: 7 de octubre de 2026. Selección para la primera entrega, pendiente de revisión del gestor. Se adapta al alcance académico y no añade certificaciones al proyecto. No autoriza desarrollo.

## Referencias seleccionadas

| Referencia | Aplicación concreta | Evidencia propia prevista |
| --- | --- | --- |
| [ISO 21502:2020](https://www.iso.org/standard/74947.html), gestión de proyectos | Seguimiento de planificación, riesgos, cambios y decisiones | Reporte semanal, línea base y registro de acciones |
| [ISO/IEC/IEEE 15289:2019](https://www.iso.org/standard/74909.html), documentación del ciclo de vida | Identificación, contenido y trazabilidad de documentos | Reportes versionados con propósito, periodo, fuentes, resultados y limitaciones |
| [ISO/IEC/IEEE 29148:2018](https://www.iso.org/standard/72089.html), ingeniería de requisitos | Requisitos identificados, verificables y trazables | Matriz requisito → criterio → prueba → evidencia |
| [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html), calidad del producto | Seleccionar criterios de adecuación funcional, fiabilidad, seguridad y mantenibilidad | Casos de aceptación, recuperación, permisos y modularidad |
| [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs), seguridad de aplicaciones | Seleccionar controles pertinentes de autenticación, sesión, autorización, validación y protección de datos | Lista de controles aplicables y comprobaciones reproducibles |

Estas referencias se complementan; ninguna sustituye los once requisitos del profesor. ASVS es un estándar de OWASP, no una norma ISO. Al implementar se registrarán los identificadores y versiones exactos de los controles ASVS realmente verificados; no se declara cumplimiento de un nivel completo por usar algunas prácticas.

Se consultaron las fichas públicas oficiales de ISO, no los textos íntegros de pago. Por ello se describe alineación con sus ámbitos públicos y criterios propios; no se atribuyen cláusulas, plantillas obligatorias ni cumplimiento normativo completo. ISO 15289 tampoco prescribe un formato de presentación o medio: HTML y PDF son decisiones del proyecto.

## Correcciones a la imagen y límites de alcance

- ISO 29148 trata sobre ingeniería de requisitos; no es el estándar de interoperabilidad de este proyecto. Se utiliza como referencia actual para requisitos en lugar de adoptar una plantilla IEEE 830 por defecto.
- [ISO/IEC/IEEE 12207:2026](https://www.iso.org/standard/90219.html) aporta un marco de procesos del ciclo de vida. Se mantiene como contexto complementario, sin implantar todos sus procesos para noviembre.
- ISO 9001 e [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) se refieren a sistemas de gestión organizacionales. No son plantillas de reportes ni certificaciones que obtenga una aplicación por usar controles técnicos.
- No se incorpora una evaluación de madurez CMMI ni ISO 25003 al alcance académico. La interoperabilidad se comprobará mediante contratos y pruebas reales de Trello/GitHub.

## Criterios propios verificables

Los siguientes criterios son decisiones del proyecto; no son umbrales impuestos por ISO.

| Área | Criterio de aceptación | Evidencia prevista |
| --- | --- | --- |
| Funcionalidad | Cada uno de los once requisitos tiene criterio y evidencia; indicar cualquier incumplimiento | Matriz de aceptación y demostración |
| Exactitud | Avance reproducible desde el snapshot; hitos fuera del denominador; conjunto vacío sin porcentaje ficticio | Casos conocidos y reporte con numerador/denominador |
| Trazabilidad | Hallazgo y recomendación vinculados a fuente, snapshot o commit; hipótesis identificadas | Inspección del detalle y del reporte |
| Autoridad | Un espectador no aprueba; rechazo o versión obsoleta impiden escritura | Pruebas de API y flujo de aprobación |
| Fiabilidad | Reinicio no duplica un reporte; resultado externo incierto exige reconciliación | Pruebas de recuperación e idempotencia |
| Seguridad | Secretos fuera de Git y salidas; sesiones revocables, CSRF y consultas parametrizadas | Comprobaciones concretas y lista ASVS aplicable |
| Calidad de código | Hallazgos con regla, evidencia, severidad y estado de revisión; comprobaciones no ejecutadas visibles | Análisis sobre commit identificado |
| Usabilidad | El gestor identifica qué cambia, evidencia, impacto y resultado antes/después de decidir | Recorrido de aceptar, rechazar y pedir ajustes |
| Mantenibilidad | Conectores y proveedor de IA separados de reglas y autorización | Revisión de límites de módulos y contratos |

No convertir la cantidad de hallazgos en una calificación ISO del repositorio. No prometer porcentajes de cobertura o rendimiento antes de definir y medir casos representativos. El Revisor verifica contenido y evidencia; el Aprobador aplica política; ninguno certifica cumplimiento ISO.

## Cómo se documentará la conformidad interna

Para cada criterio: identificador, requisito relacionado, referencia orientativa cuando corresponda, procedimiento, resultado, fecha, versión/commit y ubicación de evidencia. Estados: pendiente, verificado, fallido o no aplicable con motivo. Solo una comprobación ejecutada puede quedar verificada.

El informe final describirá «criterios del proyecto basados en referencias seleccionadas». No utilizar «certificado ISO» ni «cumple íntegramente ISO/ASVS» sin una evaluación que lo sustente.
