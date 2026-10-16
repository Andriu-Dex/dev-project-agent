> Archivo histórico. Describe decisiones o verificaciones de su fecha; sus pendientes y límites no representan necesariamente la versión actual. Rutas y enlaces se mantienen para consulta. Véase el [índice vigente](../../index.md).

# Estados de revisión, aprobación y ejecución

Diseño documental del 7 de octubre de 2026. Complementa [los contratos de datos](data-contracts.md). Los identificadores técnicos son propuestas para la implementación futura; las autoridades y condiciones respetan las decisiones aceptadas.

## Responsabilidad sobre el estado

El servicio conserva un único estado de flujo por versión de propuesta. Los agentes entregan recomendaciones y veredictos; el servicio valida y aplica transiciones. El gestor humano decide modificaciones externas. Una ejecución de agente fallida o sin cuota no equivale a rechazo de la propuesta.

## Estados y transiciones permitidas

| Estado | Significado | Siguiente estado y condición |
| --- | --- | --- |
| draft | Ejecutor prepara una versión | pending_review cuando contrato y datos mínimos son válidos |
| pending_review | Espera revisión técnica | in_review cuando se inicia el Revisor |
| in_review | Revisor contrasta datos y propuesta | pending_policy_check si validated; changes_requested si requiere ajuste; rejected si se descarta |
| pending_policy_check | Revisión validada pendiente de política | in_policy_check al iniciar Aprobador |
| in_policy_check | Aprobador comprueba alcance y reglas | pending_human_approval para cambios; authorized para reporte interno permitido; changes_requested o rejected si no procede |
| pending_human_approval | Gestor debe decidir sobre versión concreta | authorized si aprueba; rejected si rechaza; changes_requested si pide ajustar |
| authorized | Autorización válida para alcance concreto | executing solo tras verificar política, actor, precondiciones y exclusión de duplicados |
| executing | Control aplica y verifica acciones | executed si todas se verifican; execution_failed si se confirma que ninguna se aplicó; reconciliation_required si hay efectos parciales o inciertos |
| executed | Efecto autorizado verificado | Terminal; una modificación posterior requiere otra propuesta |
| changes_requested | Versión devuelta, con motivo | Terminal para esa versión; corrección crea versión siguiente en draft |
| rejected | Versión descartada con motivo | Terminal; no se puede ejecutar ni reactivar su aprobación |
| invalidated | Fuente, alcance o política relevante cambió | Terminal; reanalizar y crear nueva versión |
| execution_failed | Fallo con ausencia de efectos externos comprobada | authorized solo si la autorización sigue vigente y se decide reintentar; de lo contrario invalidated |
| reconciliation_required | Hay aplicación parcial o resultado incierto | executed si se comprueba el efecto completo; execution_failed si se confirma ausencia total de efectos; invalidated si los efectos reales exigen una propuesta nueva |

Además, cualquier versión no terminal anterior a executing puede pasar a invalidated si cambian sus precondiciones relevantes o se revoca autorización. Si la versión está draft, corregir contenido antes de sellarla no constituye una aprobación reutilizable. Cambios de fuente durante ejecución se evalúan por acción y, si impiden determinar el resultado, llevan a reconciliation_required.

Los fallos operativos de Ejecutor, Revisor y Aprobador se registran en un Run separado: queued, running, succeeded, failed o interrupted. Si falla revisión o evaluación de política, volver a su estado pending correspondiente y conservar el intento fallido. No crear veredicto satisfactorio ni repetir operaciones externas por reiniciar el proceso.

## Flujo habitual

draft → pending_review → in_review → pending_policy_check → in_policy_check → pending_human_approval → authorized → executing → executed.

Para reportes internos validados, in_policy_check puede pasar a authorized mediante política registrada, sin pedir autorización humana semanal. Esta excepción no permite enviar reportes por correo o mensajería ni modificar Trello o código. El reporte semanal se inicia automáticamente el viernes a las 18:00 y permanece pendiente si falta revisión; no se publica como verificado sin ella.

## Reglas de versión y ajuste

1. El Ejecutor prepara una propuesta con evidencia y acciones precisas.
2. Al enviarla se sella versión y contentHash. La revisión y aprobación se enlazan con ambos.
3. El Revisor, Aprobador o gestor pueden solicitar ajustes explicando el motivo.
4. Se conserva esa versión en changes_requested; el Ejecutor crea una nueva versión draft con referencia a la anterior.
5. La versión nueva repite revisión y aprobación completas. No hereda decisiones de la anterior.
6. Cada propuesta tiene una sola versión activa. Crear una versión nueva por cambio de fuente invalida la anterior si todavía estaba activa.

No editar una propuesta aprobada ni borrar la decisión para hacerla parecer vigente. Un rechazo es definitivo para esa versión; una alternativa sustancial es otra propuesta enlazada con el antecedente.

## Condiciones obligatorias antes de ejecutar

- Versión, huella y tipo coinciden con revisión y autorización.
- Revisor validó todas las comprobaciones bloqueantes.
- Aprobador verificó política y alcance.
- En Trello o código, existe decisión humana approved del gestor autenticado y actualmente autorizado.
- La autorización no fue revocada y la propuesta es la versión activa.
- Recurso, campos afectados y revisión base mantienen las precondiciones mostradas al gestor.
- La acción y el destino están permitidos; no hay permisos inferidos de texto o nombres.
- Ningún otro proceso ejecuta la misma acción y la clave de idempotencia no tiene un resultado ya confirmado.

Una fecha automática de caducidad de aprobación queda pendiente de diseño. Mientras tanto, la vigencia exige releer la fuente antes de ejecutar, verificar precondiciones y mantener permisos y política. La ausencia de respuesta humana deja pending_human_approval indefinidamente; el tiempo transcurrido no aprueba nada.

Las escrituras de Trello deben considerar cambios concurrentes: si la API no ofrece comparación y escritura atómicas, la relectura no elimina completamente esa carrera. El diseño técnico deberá acotar esa limitación, serializar escrituras propias y comprobar después sin sobrescribir otros campos.

## Fallos, reintentos y recuperación

Antes del primer intento se guarda el registro de ejecución con clave de idempotencia. Cada acción mantiene estado y evidencia. Reiniciar el servicio obliga a reconciliar ejecuciones interrumpidas antes de reintentarlas.

Si cambia un campo ajeno al alcance y no afecta la recomendación ni precondiciones, no se invalida solo por cambiar la última actividad de toda la tarjeta. Si cambia un dato relevante, la versión pasa a invalidated y requiere nueva revisión y autorización.

Cuando varias operaciones sobre una tarjeta se aplican parcialmente, no se asume una transacción externa. Se registran los efectos reales y se bloquea el reintento hasta reconciliar. No revertir automáticamente: una compensación que modifique datos requiere nueva propuesta y autorización. Una verificación tardía puede cerrar executed solo cuando demuestra exactamente el efecto autorizado y no depende de otra modificación.

Para código, executed significa candidato aprobado preparado y verificado en su rama de trabajo. Registrar aparte integrationStatus: not_requested, pending_human o merged_verified; solo marcar merged_verified cuando se observe una integración humana verificable. No presentar una rama preparada como cambio incorporado a UTAPED.

## Ejemplos ilustrativos

### Cambio de fecha en Trello

Ejemplo ficticio, sin modificar una tarjeta real: una actividad abierta vence el 20 de octubre a las 17:00. El Ejecutor propone el 22 a las 17:00, con motivo e impacto. El Revisor valida, el Aprobador solicita decisión humana y el gestor aprueba la versión 1. Antes de ejecutar se comprueba que el vencimiento siga siendo el día 20. Si ya es el 21, invalidated; si coincide, se cambia únicamente el campo aprobado y se verifica el 22. Solo entonces executed.

### Solicitud de ajuste

El gestor pide otra fecha. La versión 1 queda changes_requested y no puede ejecutarse. La versión 2 nace draft y repite el flujo; la petición de ajuste no autoriza aplicar ninguna fecha.

### Reporte semanal

El Ejecutor prepara el periodo e indicadores, el Revisor valida y el Aprobador confirma la política de publicación interna. El servicio publica y verifica una sola edición autorizada del reporte. Una corrección posterior crea nueva versión, con nueva revisión y relación con la edición anterior.

### Corte de conexión

Una solicitud a Trello agota el tiempo de espera. No se sabe si se aplicó. Se registra reconciliation_required y se consulta el recurso antes de decidir. No se repite la escritura suponiendo que falló.

## Escenarios de aceptación previstos

| Escenario | Resultado esperado |
| --- | --- |
| El Ejecutor solicita authorized directamente | Transición rechazada y registrada |
| Revisor devuelve cambios | No hay acceso al Aprobador ni a ejecución en esa versión |
| Gestor rechaza o pide ajuste | No se aplica ninguna modificación |
| Usuario de consulta intenta aprobar | Servicio deniega la decisión |
| Se modifica contenido tras aprobar | Nueva versión; aprobación anterior no aplica |
| Cambia un campo relevante del recurso | Invalidación antes de escribir |
| Aprobador intenta permitir automáticamente un cambio externo | Servicio rechaza la ruta por política |
| Dos intentos de ejecución simultáneos | Solo uno obtiene control; no duplicar acciones |
| Respuesta externa incierta o aplicación parcial | Reconciliar y conservar efectos reales |
| Se agota cuota durante revisión | Registrar fallo del Run; propuesta sigue pendiente de revisión |
| Se prepara una rama | No integrar ni declarar incorporado el cambio |

Son criterios documentados, no pruebas ejecutadas. El siguiente diseño técnico deberá precisar persistencia y concurrencia para hacerlos efectivos.


## Alcance concreto de la octava tanda

La implementación de [ejecución controlada](../../trello-execution.md) exige propósito inmutable `live` y una solicitud expresa del gestor posterior a aprobar. `demonstration` nunca llega a escritura. Los reintentos sin efectos pasan de `execution_failed` a `executing` solo mediante una nueva solicitud validada; la reconciliación implementada se mantiene pendiente cuando observa el valor anterior y no habilita una nueva escritura. El cierre forzado de resultados inciertos y las acciones múltiples siguen fuera de este alcance. Retirar una autorización conserva la decisión y registra `invalidated` con auditoría, antes de iniciar o después de un fallo con ausencia de efectos confirmada.
