# Catálogo de criterios de revisión de código

Versión implementada: `utaped-review-v1`, definida en [standards.ts](../apps/server/src/modules/code-review/standards.ts). El resultado conserva esta versión en códigos de comprobación y limitaciones junto al commit y blobs de la fuente. Cambiar una regla exige revisar el corpus y versionar el catálogo; una revisión anterior permanece congelada.

Son criterios del proyecto, orientados por las referencias documentadas en [normas y calidad](standards-and-quality.md). No constituyen certificación ISO, auditoría OWASP completa ni cumplimiento demostrado de normas.

| Regla | Categoría | Lenguaje / comprobación |
| --- | --- | --- |
| `syntax` | Errores/corrección | Transformación aislada de JS/TS/JSX/TSX; errores de sintaxis, sin comprobación de tipos entre módulos. |
| `java-delimiters` | Errores/corrección | Equilibrio de delimitadores fuera de literales/comentarios Java. No compila ni valida gramática, tipos o dependencias. |
| `condition-assignment` | Errores/corrección | Señal de asignación dentro de condición; requiere contexto para decidir si es intencional. |
| `dynamic-content` | Seguridad | Ejecución de contenido o consulta concatenada; no demuestra explotabilidad ni sustituye un análisis de flujo de datos. |
| `duplicate-block` | Duplicación | Bloques repetidos de cinco líneas no vacías y al menos cien caracteres. |
| `debug-output` | Mantenibilidad | Salidas de consola/depuración para revisar intención y exposición de datos. |
| `decision-density` | Complejidad | Diez o más tokens de decisión en una ventana de cuarenta líneas; no es complejidad ciclomática completa. |
| `nested-loop` | Optimización/rendimiento | Iteración anidada; revisar crecimiento con entradas y medir antes de afirmar una mejora de rendimiento. |

Comentarios y literales se enmascaran para las comprobaciones léxicas preservando líneas/posiciones. Este tratamiento es acotado; interpolaciones, construcciones complejas o errores fuera de los patrones pueden requerir herramientas del lenguaje y revisión humana. El modelo puede complementar las comprobaciones con consentimiento, pero sus respuestas deben citar fragmentos de la fuente congelada.

`pass` significa que la comprobación indicada pasó o que no encontró su patrón acotado. `fail` significa fallo de esa comprobación. `not_checked` distingue falta de comprobación o señal que exige evaluación de contexto; no se convierte en aprobación automática del producto.

El [corpus controlado](../apps/server/src/modules/code-review/standards.test.ts) contiene positivo y contraejemplo de las seis categorías en TS y Java, además de delimitadores. La validación representativa de UTAPED y sus comandos propios (`lint`, comprobación de tipos, Maven/Java 21 y pruebas) siguen siendo una fase separada, en un entorno apropiado y con evidencia de ejecución.
