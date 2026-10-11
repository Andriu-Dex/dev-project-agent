# Supervisión de fuentes, línea base e historial

Implementado el 11 de octubre de 2026. Alcance: UTAPED, Trello configurado y GitHub `Andriu-Dex/utaped`, rama `develop`. No hay altas de otros proyectos ni modificaciones externas. Los análisis de esta etapa son deterministas; no constituyen revisión de código por IA.

## Recorrido del gestor

1. Iniciar sesión y abrir «Supervisión e historial».
2. Solicitar actualización de Trello, GitHub, análisis de lecturas guardadas o actualización y análisis completos.
3. Consultar estado y etapas. Un resultado parcial conserva y señala las lecturas anteriores de las fuentes que fallaron.
4. Revisar la planificación y, si corresponde, marcar la confirmación explícita de la lectura candidata como línea base. Este paso no se realizó automáticamente sobre UTAPED.
5. Ejecutar otro análisis para comparar con esa línea base. Consultar dependencias, desviaciones y referencias exactas de GitHub.
6. Abrir análisis anteriores. Sus fuentes, reglas y resultados permanecen congelados aunque cambie la configuración o se sincronicen nuevas lecturas.

Los lectores consultan fuentes e historial; los botones de solicitud y confirmación requieren gestor en el servidor. El panel lista hasta veinte trabajos y veinte análisis recientes; el detalle permanece disponible por identificador. No hay paginación de este historial todavía.

## Contrato HTTP

Prefijo `/api/v1`; todas las rutas exigen cuenta y membresía activas.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `GET /projects/:projectId/github` | Miembro | Configuración, última lectura y último intento sin secretos. |
| `GET /projects/:projectId/baseline` | Miembro | Línea base vigente y candidata con fecha/origen/recuentos. |
| `POST /projects/:projectId/baseline-versions` | Gestor + origen + CSRF | 201; `expectedVersion` y `snapshotId` exactos. |
| `GET /projects/:projectId/supervision` | Miembro | Trabajos recientes, análisis recientes y último resultado. |
| `POST /projects/:projectId/supervision/jobs` | Gestor + origen + CSRF | 202; `kind` y `requestKey` UUID. |
| `GET /projects/:projectId/supervision/jobs/:resourceId` | Miembro | Estado y etapas con fechas y errores saneados. |
| `GET /projects/:projectId/supervision/runs/:resourceId` | Miembro | Resultado congelado de un análisis. |

Tipos de trabajo: `trello_sync`, `github_sync`, `analysis` y `full`. El servicio admite un trabajo activo por proyecto. Repetir la misma clave, gestor y tipo devuelve el trabajo original incluso si ya terminó; reutilizarla para otro tipo o solicitar otro trabajo mientras existe uno activo produce 409. Un 202 acredita registro de la solicitud, no lectura externa exitosa. El panel consulta cada 2,5 segundos mientras existe trabajo activo.

La confirmación de línea base verifica permisos de nuevo en la transacción, versión esperada y que la lectura siga siendo la última válida del proyecto. Un cambio de fuente o versión produce 409; no confirma automáticamente una lectura distinta. Confirmación y auditoría se guardan juntas. Se preserva la lectura original completa mediante referencia a una instantánea inmutable para el rol de ejecución. Esta confirmación es la referencia interna del agente, no un acta externa de aceptación.

## Datos de planificación

El conector de Trello lee descripciones e identificadores de checklists y obtiene las checklists del tablero. Conserva texto original, WBS, responsable principal declarado, relaciones y estados de ítems. Los miembros asignados y el responsable descrito siguen siendo conceptos distintos; no se ha implementado un vínculo verificado automático entre ambos.

Formato explícito soportado en la descripción:

```text
CÓDIGO WBS: 2.1
RESPONSABLE PRINCIPAL: Nombre declarado
PREDECESORAS WBS: 1.5 (Fin–Inicio; desfase 0)
```

También se acepta `Inicio–Inicio`, varias relaciones separadas por comas y desfases numéricos con unidades `horas` o `días`. Días sin otra calificación significan días naturales de 24 horas; no se convierten días laborables. Un desfase no cero sin unidad se marca inválido. `Ninguna` es una declaración explícita; campo ausente no significa ausencia de predecesoras.

Las referencias WBS se resuelven únicamente si hay un elemento activo y operativo con ese código. Duplicados, referencias ausentes y ciclos impiden afirmar una relación fiable. No se deducen relaciones del orden de tarjetas o del nombre. Las instantáneas anteriores sin estos campos se mantienen como fuentes con información no disponible.

Hallazgos: incompatibilidad de fechas planificadas con una relación, contradicción de estados declarados, predecesora explícita pendiente/vencida y calidad de datos. Se distingue evidencia declarada de ejecución real: no hay fechas reales suficientes para acreditar incumplimientos de ejecución. No se calculan causalidad, probabilidad, impacto cuantificado ni ruta crítica. Las checklists muestran progreso declarado, sin acreditar por sí mismas aceptación formal.

Las desviaciones comparan nombre, tipo, estado, inicio, vencimiento, asignados, WBS, responsable principal y dependencias. Se distinguen elementos incorporados y elementos que dejan de observarse en el alcance activo. El desplazamiento de fechas se expresa en horas naturales; no equivale a cambio de duración laborable. Cambios de estado son diferencias observadas, no necesariamente cambios de planificación aprobada.

## Lectura de GitHub

Solo GET a `api.github.com`, sin redirecciones ni URLs o comandos escogidos por el usuario/modelo. Recurso y rama proceden de PostgreSQL. UTAPED es público; el token opcional `GITHUB_TOKEN` se mantiene en `.env` ignorado y no es necesario para la lectura inicial verificada. La aplicación no extrae credenciales del GitHub CLI.

Se paginan ramas, se fija el SHA observado antes de consultar commits y se muestran hasta 25 commits recientes. Primera lectura: archivos del último commit. Lecturas posteriores: comparación entre el SHA guardado y el nuevo; sin cambios de SHA se registra comparación vacía. Una historia divergente o que retrocede conserva esa condición explícita.

Se guardan rutas, tipo de cambio, recuentos de líneas y rangos de diferencias; no se guardan parches ni contenidos de archivos. No se han ejecutado comandos, hooks, pruebas o instalaciones de UTAPED. No se afirma haber revisado la calidad o seguridad del código.

Límites: cinco páginas de ramas, diez páginas de archivos de un commit, respuestas de cinco MB y un minuto por lectura. Comparaciones que alcanzan 300 archivos se rechazan porque no permiten acreditar cobertura completa del listado de GitHub. Fallos y límites no reemplazan la última instantánea válida. Referencias: [commits y comparaciones](https://docs.github.com/en/rest/commits/commits), [ramas](https://docs.github.com/en/rest/branches/branches) y [paginación](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).

## Trabajador y persistencia

El trabajador arranca con el servicio. La adquisición es atómica mediante `FOR UPDATE SKIP LOCKED`; usa concesión de 120 segundos, renovación cada veinte segundos y token nuevo por intento. Los trabajos pendientes sobreviven al reinicio. Un trabajo abandonado se recupera al vencer su concesión, hasta tres intentos; el agotamiento queda registrado como fallo. Un trabajador con token vencido no puede renovar ni publicar resultados.

Los permisos y la versión de autenticación del solicitante se revalidan antes de procesar y entre etapas. Los análisis leen fuentes, configuración y línea base dentro de una transacción corta y coherente. La consulta externa ocurre fuera de transacciones PostgreSQL; bloqueos de sesión serializan las sincronizaciones y se liberan al terminar. No hay reintentos automáticos de límites de proveedor dentro de una etapa. La recuperación puede repetir lecturas externas y crear otra instantánea; no habilita escrituras externas.

Tablas: `github_connections`, `github_snapshots`, `github_sync_attempts`, `baseline_versions`, `supervision_jobs`, `supervision_job_events` y `supervision_runs`. Relaciones compuestas evitan referencias a fuentes de otro proyecto. El rol de ejecución tiene solo SELECT/INSERT sobre los historiales; UPDATE se permite únicamente sobre el estado operativo de trabajos, sin DELETE. La auditoría y la publicación de resultado/estado final son transaccionales. Estas restricciones no impiden modificaciones realizadas por un administrador de la base.

Esta etapa usa solicitudes manuales. Los intervalos del trabajador y del panel son consulta de estado, no una frecuencia de actualización de Trello/GitHub. No se activaron supervisiones periódicas ni publicación de reportes.

## Verificación

- `npm test`: reglas, normalización, acceso, adaptadores y contrato de validación del proveedor.
- `npm run test:auth-db`, `npm run test:trello-db` y `npm run test:supervision-db`: PostgreSQL real, datos sintéticos y rollback final.
- `npm run test:ui`: compilación y navegador Chromium local con proyecto temporal en puerto 3133, datos sintéticos, credenciales efímeras y rollback. Capturas en `work/ui/`; requiere Chromium instalado para Playwright (`npx playwright install chromium` si falta).
- `npm run sources:read`: comprobación administrativa local de ambas fuentes configuradas, con auditoría de sistema y nuevas instantáneas. No crea una supervisión en nombre de un gestor ni una línea base.

El 11 de octubre se verificaron lectura y persistencia reales: 25 actividades, seis hitos, 31 códigos WBS, 33 dependencias resueltas, 21 checklists activas; GitHub, 11 ramas, 25 commits recientes y 36 archivos del último commit de `develop`. Esto es una observación puntual, no valores fijos del panel. Cero observaciones de dependencias en ese corte no acredita ausencia de todos los riesgos.

El navegador verificó guardado dinámico, confirmación de línea base, trabajo completo, consulta histórica, cierre de sesión, gestor/lector, claro/oscuro y ancho móvil sin desbordamiento. La prueba de navegador usa datos sintéticos y no acredita por sí misma conectividad real; esa comprobación se realizó por separado.

Pendientes: proveedor real de IA, tres agentes y propuestas, revisión de código, ejecución aprobada, reportes semanales, supervisión programada y paginación del historial.
