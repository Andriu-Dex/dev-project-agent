# Reglas de retrasos y riesgos

Fecha: 11 de octubre de 2026. Implementación integrada en el repositorio y migración aplicada a PostgreSQL local. La evaluación utiliza lecturas guardadas; no modifica Trello.

## Alcance y contrato

`GET /api/v1/projects/:projectId/tracking` requiere usuario y membresía activos; gestor y consulta pueden leer. Proyecto ajeno: 404; identificador inválido: 400; solicitud anónima: 401. Usa la última lectura válida y la configuración vigente de PostgreSQL, sin consultar Trello ni iniciar una escritura de hallazgos. Devuelve fecha de evaluación, snapshot y origen, política versionada, resumen, alertas con evidencia, estado por elemento y limitaciones.

La evaluación es una función determinista para la misma lectura, instante y política. Una migración nueva añade `tracking_policy_versions`; no se alteran migraciones anteriores. Esta primera versión no persiste un historial de evaluaciones: un reporte futuro deberá congelar su corte y resultado. Los identificadores de alerta combinan snapshot, tarjeta y regla; reevaluar la misma lectura no crea registros duplicados.

El panel reevalúa datos guardados cada minuto y permite hacerlo manualmente. Sincronizar Trello sigue siendo otra operación, reservada al gestor. Una nueva instantánea provoca una nueva evaluación. El panel distingue una evaluación anterior conservada por fallo de actualización.

## Política inicial

La migración crea la versión de configuración 1 para los proyectos existentes: próximos vencimientos hasta 72 horas y antigüedad a partir de 60 minutos, con `confirmed=false`. Son valores iniciales propuestos, no límites fijos del motor. El gestor puede guardarlos sin cambios para confirmarlos o ajustarlos desde «Configuración del seguimiento». Son parámetros operativos, no requisitos ISO ni garantía de disponibilidad. Los mapeos de prioridad y bloqueo empiezan vacíos.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `GET /api/v1/projects/:projectId/tracking-policy` | Miembro activo | Versión vigente, umbrales, confirmación, fecha y gestor del cambio. |
| `PUT /api/v1/projects/:projectId/tracking-policy` | Gestor activo + origen permitido + CSRF | Nueva versión confirmada y evento de auditoría en una transacción. |

El cuerpo de actualización contiene `expectedVersion`, `dueSoonHours` (entero entre 1 y 720) y `staleAfterMinutes` (entero entre 1 y 10080). El actor procede de la sesión. Un bloqueo transaccional serializa cambios por proyecto; una versión esperada obsoleta devuelve 409 y exige recargar. Se vuelven a comprobar cuenta, versión de autenticación y membresía dentro de la transacción. Si falla la auditoría, tampoco se guarda la nueva versión.

El rol de ejecución tiene SELECT/INSERT sobre el historial, sin UPDATE/DELETE. Cada evaluación lee la configuración vigente; no exige reinicio ni cambios en `.env`. El panel reevalúa después de guardar. El resultado identifica algoritmo y configuración, por ejemplo `tracking-v1/config-v2`. No hay valores de respaldo silenciosos cuando falta configuración. La futura creación de otros proyectos deberá incluir una versión inicial; esta entrega sigue supervisando UTAPED.

| Regla | Condición | Resultado |
| --- | --- | --- |
| Vencimiento superado | Pendiente/en curso, marca de finalización coherente y vencimiento anterior al corte | Atención inmediata; horas transcurridas sin redondeo interno. |
| Próximo vencimiento | No completada, marca coherente, vencimiento entre el corte y corte + `dueSoonHours`, inclusive | Atención próxima; inmediata si existe bloqueo explícito. |
| Bloqueo | Coincidencia exacta con una etiqueta mapeada por política | Independiente del estado, prioridad y vencimiento. Sin mapeo: no informado. |
| Calidad de datos | Datos ausentes, contradicción de estado/finalización, fechas inválidas o inicio posterior al fin | Advertencia con campos originales; las contradicciones temporales/de finalización impiden afirmar retraso o cumplimiento. |
| Fuente desactualizada | Lectura API con antigüedad >= `staleAfterMinutes` | Se conserva evaluación, advirtiendo que no acredita el estado actual. |
| Exportación | Origen export, incluso si el archivo es reciente | Fuente histórica, sin presentarla como conexión en vivo. |
| Fecha de fuente inválida/futura | No puede situarse antes del corte | Sin evaluación temporal de elementos. |

Las fechas se comparan como instantes con zona horaria explícita. El normalizador rechaza nuevas fuentes con fechas sin hora o sin zona; no aplica automáticamente un «fin de día». Los hitos pueden carecer de inicio; su vencimiento representa el instante. El panel muestra America/Guayaquil.

Una fecha vencida exactamente al corte entra en próximo vencimiento, ya que «retraso» exige ser anterior. El límite de la ventana configurada se incluye; después se excluye. Una etiqueta de completada con marca incoherente mantiene el recuento declarado, pero genera alerta de calidad y no se considera cierre temporal fiable. No se concluye que terminó dentro del plazo sin fecha real verificable.

## Avance y recuentos

Universo: actividades no archivadas de las listas operativas configuradas. Fórmula: actividades con estado declarado `completed` / total de actividades incluidas × 100. Se muestran numerador, denominador, base declarada y porcentaje con hasta dos decimales. Universo vacío: no disponible. No se acredita aceptación formal.

Hitos se cuentan aparte; referencias y archivadas se excluyen. Estado base y condición temporal se muestran por separado. El total de elementos afectados deduplica por tarjeta aunque haya retraso, bloqueo y calidad de datos simultáneos. No sumar libremente todos los recuentos de alertas.

## Evidencia y límites

Cada alerta aporta tarjeta, tipo, regla, atención, evidencia de campos, política, snapshot y corte. Los textos describen la lectura guardada. Las causas, probabilidades e impacto cuantificado en otras tareas permanecen no evaluados y no se afirma ruta crítica. Las relaciones explícitas ahora se revisan por separado en la [supervisión guardada](supervision.md). Estas alertas deterministas alimentarán a los agentes posteriores; no sustituyen Ejecutor/Revisor/Aprobador ni autorización humana.

Prioridad solo procede de etiquetas explícitamente mapeadas. Dos prioridades contradictorias producen valor desconocido y advertencia. No se deduce prioridad de color/lista ni se confunde con urgencia. Sin mapeo de bloqueo no se declara «sin bloqueo». No se modifican tarjetas para generar evidencia de prueba.

## Verificación

Las pruebas unitarias cubren límites exactos, zonas horarias, fechas ambiguas, vacíos, contradicciones, fuentes históricas/desactualizadas, progreso, hitos, mapeos y recuentos. Las pruebas de Fastify cubren autenticación y aislamiento entre proyectos.

Nueve escenarios de integración Trello/seguimiento con PostgreSQL real y rollback comprueban sincronización, CSRF, permisos de lectura/escritura, rangos, efecto inmediato sobre la misma instantánea, historial, auditoría, conflicto de versiones, rollback ante fallo de auditoría, revocación de membresía y persistencia al reconstruir el servicio. Los datos de prueba son temporales; no cambian la configuración real de UTAPED.

Comandos de verificación: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`, `npm run test:auth-db` y `npm run test:trello-db`. La tanda posterior verificó el panel, incluyendo guardado de umbrales, con Chromium; el recorrido reproducible queda en `npm run test:ui`.
