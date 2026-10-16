# Cobertura progresiva del repositorio

La revisión de cambios recientes se conserva. Código → Cobertura del repositorio añade inventario por commit/árbol, cola persistente, límites configurables, seguimiento por módulos y evidencia inmutable. No ejecuta contenido ni instrucciones del repositorio; archivos, comentarios y respuestas del modelo son datos no confiables.

## Inventario y clasificación

El inventario exige árbol completo no truncado y metadatos válidos. Límite máximo: 50 000 entradas, sujeto además al límite de respuesta del adaptador de 2 MB. Si GitHub no lo entrega, se informa el error y se conserva el inventario anterior; no se declara cobertura completa a partir de una lista truncada.

Se admiten formatos de texto habituales y se distinguen binarios, formatos no admitidos, generados, dependencias, enlaces/submódulos y rutas potencialmente sensibles. La exclusión por nombre es conservadora: puede apartar código legítimo relacionado con contraseñas. El motivo es visible y no existe anulación automática. Archivos mayores a 1 MB o sin tamaño comprobable quedan excluidos por límite de lectura. Se comprueba contenido antes de persistir evidencia o enviarlo al modelo.

## Estados y persistencia

| Estado | Interpretación |
| --- | --- |
| `pending` | Todavía sin revisión. |
| `reviewing` | Fragmento en curso. |
| `reviewed` | Comprobaciones declaradas completas para ese contenido. |
| `partial` | Faltan fragmentos, contexto conjunto o comprobación del lenguaje. |
| `outdated` | Cambió contenido, método o dependencia identificada. |
| `failed` | Error, con intentos y motivo. |
| `excluded` | Fuera de revisión por una razón explícita. |

`code_coverage_projects` conserva inventario, configuración, gestor, programación y lease. `code_coverage_files` conserva blobs, generaciones, estados, partes, intentos y dependencias. `code_coverage_batches` registra commit/método/resultado. `code_coverage_results` guarda evidencia por generación/fragmento; `code_coverage_snapshots` conserva cortes para reportes. El rol de aplicación no puede actualizar ni eliminar resultados o cortes. Los archivos eliminados salen del denominador actual y conservan su historial.

## Límites y contexto

| Ajuste | Inicial | Rango |
| --- | --- | --- |
| Fragmentos por tanda | 4 | 1–20 |
| Bytes por fragmento | 12 000 | 1 000–24 000 |
| Contexto adicional | 8 000 bytes | 0–16 000 |
| Tiempo objetivo | 120 segundos | 10–600 |
| Intervalo posterior a la tanda | 60 minutos | 1–10 080 |
| Intentos por archivo | 3 | 1–5 |
| IA | Desactivada | Modelo y consentimiento explícitos |

El tiempo se comprueba entre fragmentos y no interrumpe una inferencia activa. Los bytes limitan entrada, no garantizan coste en tokens. Con Ollama, fragmento y contexto suman hasta 12 000 bytes para reservar espacio al formato/instrucciones; el adaptador conserva sus propios límites.

Se priorizan modificados, código y componentes de autenticación, seguridad, controladores y servicios. La división respeta líneas UTF-8 y conserva numeración original. Una línea mayor al presupuesto deja el archivo parcial. No se declara sintaxis completa sobre fragmentos o lenguajes sin comprobador. Aunque se procesen todos sus fragmentos, un archivo dividido permanece parcial por faltar validación conjunta; no se fuerza el porcentaje a 100 %.

Se identifican importaciones relativas literales JS/TS y dependencias locales Java por importaciones/tipos usados del mismo paquete. Se incorpora contexto completo de hasta ocho dependencias elegibles que caben en el presupuesto y el tiempo disponible. Alias, comodines, reflexión, relaciones dinámicas y otros lenguajes no se resuelven exhaustivamente. Los grafos identificados invalidan consumidores transitivos. No se simula compilación ni revisión de todas las dependencias externas.

Cambiar modelo, método, fragmentación o presupuesto de contexto solicita revisión nueva. Cambiar solo cadencia conserva resultados. El historial anterior sigue asociado al commit/blob original. Para preparar una corrección se vuelve al análisis acotado y al flujo de tres roles; no se convierten fragmentos directamente en parches publicables.

## Continuación y recuperación

La programación exige activación; un inventario nuevo queda en pausa. El worker consulta cada diez segundos y obtiene lease de veinte minutos. La aplicación se opera en una sola instancia. Tras expirar el lease, se recuperan archivos en curso y se registra la tanda interrumpida. Confirmar cada fragmento es atómico; una restricción única evita duplicarlo por generación/índice.

Pausar impide otro fragmento y permite conservar el actual. Configurar durante una tanda se rechaza. Se revalida autoridad del gestor. Cuota, consentimiento, autorización, modelo o cambio de conexión suspenden la revisión; otros fallos tienen intentos limitados y reintento expreso. Los sensibles no se reintentan automáticamente y nunca hay fallback de proveedor.

## API

Raíz `/api/v1/projects/:projectId/code-review/coverage`:

| Método / ruta | Uso |
| --- | --- |
| GET `/` | Resumen, commit, método, estados, módulos y últimas 30 tandas. |
| GET `/files?state=&search=&page=` | Filtros y paginación de 50 archivos desde PostgreSQL. |
| GET `/results?path=` | Hasta 100 fragmentos recientes por archivo, con marca vigente/histórico. |
| POST `/inventory` | `{expectedRevision}`. |
| POST `/settings` | `{expectedRevision, settings}`. |
| POST `/control` | `{expectedRevision, action: start|pause|retry}`. |

Lecturas requieren sesión/membresía. Mutaciones requieren gestor, CSRF, origen y esquema estricto. La revisión optimista rechaza formularios obsoletos. Las comprobaciones aisladas cubren continuación, fragmentación, consumidores, exclusiones, cuota, reintentos, leases, revocación, permisos, eliminación y cortes históricos. No equivalen a pruebas funcionales de UTAPED.
