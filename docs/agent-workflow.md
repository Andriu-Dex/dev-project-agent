# Agentes, propuestas y decisiones

El flujo implementado utiliza Ejecutor, Revisor y Aprobador secuenciales. ChatGPT es el proveedor principal validado y Ollama es opcional, con modelo explícito y calidad dependiente de su evaluación. Pueden compartir modelo; no se presentan como tres verificaciones estadísticamente independientes.

## Alcance disponible

Las propuestas Trello admiten vencimiento, inicio/fin, prioridad, miembros asignados y estado declarado. Nacen de una supervisión guardada, una tarjeta activa y una acción tipada. El propósito `demonstration` o `live` se fija al crear la propuesta y no se convierte por editar otra versión. Las tarjetas archivadas o de referencia quedan fuera del alcance operativo.

Las correcciones de código parten de un análisis identificado y hallazgos seleccionados. El servicio construye candidatos acotados y comprueba evidencia; no ejecuta comandos del repositorio. Ver [código](code-review.md).

## Tres etapas secuenciales

1. Ejecutor prepara contenido con evidencia, valores esperados/propuestos, impacto, riesgos y verificación.
2. Revisor contrasta procedencia, alcance, precondiciones y comprobaciones; devuelve ajustes o rechazo cuando corresponde.
3. Aprobador verifica política y exige decisión humana para cambios externos. Su dictamen no sustituye al gestor.

Los textos de fuentes y respuestas previas son datos no confiables. El servidor valida estructura, referencias y huellas; un modelo no puede declarar que una persona aprobó ni ejecutar un cambio.

## Datos intercambiados y conservados

Se conservan contexto de fuente, configuración, objetivo, acción exacta, versión y huella; cada etapa registra entrada/salida validada, proveedor/modelo/esfuerzo, duración, uso disponible y resultado. Las decisiones incluyen actor, fecha, versión, motivo y contenido autorizado. Los [contratos ejecutables](../packages/contracts/src/index.ts), esquemas y validadores del módulo concretan los campos.

Los [contratos iniciales](archive/planning/data-contracts.md) y [estados previstos](archive/planning/proposal-workflow.md) son antecedentes de diseño. Sus nombres conceptuales y estados intermedios no se afirman como un contrato HTTP actual.

## Decisión y corrección

El gestor consulta la versión y huella exactas y decide aprobar, rechazar o pedir ajustes con motivo. Ajustar crea otra versión y repite las etapas; no hereda aprobación. Rechazar impide la ejecución. Las decisiones anteriores se conservan, incluida la [excepción histórica EX-01](validation/validation-closeout.md#ex-01-dato-histórico-ausente), sin inventar motivos retrospectivos.

Aprobar registra autorización, no ejecución. La ejecución real exige una petición confirmada aparte, permisos actuales, revisión válida y comparación remota. Se registra intención, intento y verificación. Las demostraciones nunca escriben. En código, una rama/PR requiere publicación separada y la integración posterior es humana.

## Vigencia, fallos y recuperación

Un cambio relevante de fuente, versión o política invalida la autorización afectada. Los errores de proveedor, formato, cuota y reinicio conservan su evidencia; no se presentan como una revisión favorable. Continuar una etapa pendiente requiere la operación y consentimiento correspondientes y conserva las etapas completas válidas.

La reconciliación consulta efectos externos inciertos antes de cualquier acción posterior. Nunca reenvía o revierte a ciegas. Las reglas concretas están en [ejecución Trello](trello-execution.md) y [publicación GitHub](github-publication.md).

Los reportes utilizan etapas deterministas para publicación interna, con [reglas y periodos propios](weekly-reports.md); no son tres inferencias nuevas. El consentimiento SMTP permanece separado. La evidencia de las primeras versiones se conserva en el [registro histórico](archive/validation/agent-workflow.md).
