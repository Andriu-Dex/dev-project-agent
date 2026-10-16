# Lectura y sincronización de Trello

## Estado implementado

Adaptador REST de solo lectura, importación de exportaciones privadas, instantáneas PostgreSQL, comparación entre lecturas, auditoría y panel de planificación. El 9 de octubre de 2026 se verificó una consulta real con las credenciales locales del usuario y se guardó una instantánea con origen `api`. Las pruebas unitarias del adaptador siguen utilizando respuestas sintéticas; la verificación en línea se realizó por separado.

La primera consulta real confirmó 25 actividades, seis hitos y 14 actividades completadas declaradas, sin incidencias de calidad en los campos actualmente comprobados ni cambios frente a la exportación anterior. El evento quedó registrado como verificación del sistema, sin atribuirlo al gestor. No se modificó el tablero.

Se importó el JSON existente sin incorporarlo a Git: 25 actividades, seis hitos y 14 actividades completadas declaradas. Referencias y archivadas se conservan fuera del conjunto operativo. La lectura no se convierte en una línea base aprobada ni acredita aceptación formal.

## Configurar la conexión en línea

1. Acceder a [administración de aplicaciones de Trello](https://trello.com/apps/admin), crear o elegir la aplicación propia y generar su API key en Trello Auth.
2. Usar el flujo oficial de [autorización](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/). Sustituir YOUR_API_KEY en esta dirección:

   `https://trello.com/1/authorize?expiration=30days&scope=read&response_type=token&name=Dev%20Project%20Agent&key=YOUR_API_KEY`

3. Revisar aplicación y permisos antes de autorizar. Solo se necesita `read`; no solicitar `write` ni `account`. El token puede leer recursos accesibles a la cuenta; el servicio restringe sus solicitudes al tablero configurado.
4. Ejecutar `npm run setup` para añadir las claves vacías que falten, preservando los valores existentes. Completar `TRELLO_API_KEY` y `TRELLO_TOKEN` directamente en el archivo privado `.env`. No pegarlos en chat ni documentación.
5. Reiniciar `npm run dev`, ingresar como gestor y pulsar «Sincronizar Trello». Comprobar fuente «Lectura de Trello» y nueva fecha. El token de 30 días necesita renovación al caducar y puede revocarse desde la cuenta de Trello.

Las credenciales se leen solo en el servidor y se envían mediante Authorization a `https://api.trello.com`. No se incluyen en URLs, PostgreSQL ni respuestas. `.env` está excluido de Git; un despliegue futuro requiere un almacén de secretos adecuado. No hay almacenamiento web de credenciales.

## API, datos y permisos

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| GET /api/v1/projects/:projectId/trello | Miembro activo | Última instantánea válida, cambios y último intento. |
| POST /api/v1/projects/:projectId/trello/sync | Gestor activo + Origin permitido + CSRF | snapshotId y changeCount. |

Sincronización manual y síncrona: plazo externo total de 25 segundos, límite local de tres solicitudes por minuto por IP y bloqueo transaccional por proyecto. No sustituye los trabajos asíncronos de supervisión previstos.

La tercera migración crea `trello_connections`, `trello_snapshots` y `trello_sync_attempts`. La configuración inicial vincula UTAPED con el tablero confirmado y las seis listas operativas por ID. Los hitos usan la etiqueta HITO; los estados proceden de PENDIENTE, EN CURSO y COMPLETADA. Ausencia o conflicto produce `unknown`. La configuración pertenece al proyecto; el adaptador no contiene nombres de UTAPED.

Se conservan nombres e IDs de tablero/listas/tarjetas, nombres y usuarios de miembros, etiquetas, fechas nativas, marca de finalización, archivo y asignaciones. Se señalan datos ausentes o contradictorios. No se importan acciones, correos, adjuntos, enlaces privados ni el JSON bruto. La identidad externa no concede permisos locales.

Se comparan nombre, lista, tipo, estado, etiquetas, fechas, finalización, archivo y asignados. Cada cambio guarda antes/después. Una tarjeta ausente queda como `not_observed`, sin afirmar eliminación. La primera lectura tiene cero cambios. El panel resume los primeros 30; la respuesta autenticada conserva todos los valores.

Una consulta válida guarda instantánea, intento y auditoría en una transacción. Un fallo conserva datos anteriores y registra un código saneado. Los intentos sin permiso se auditan. No hay métodos de escritura hacia Trello.

## Exportaciones y límites

`npm run trello:import` usa `docs/utaped-trello.json`; un archivo alternativo se indica con `npm run trello:import -- ruta/al/archivo.json`. Requiere un único proyecto configurado. Usa el rol restringido de aplicación, valida el tablero y toma la modificación del archivo como fecha de referencia; no acredita cuándo Trello generó la exportación.

Una fuente anterior a la última válida se rechaza. Las exportaciones indican «sin conexión en vivo». Nunca reemplazan una línea base aprobada.

Las solicitudes sucesivas de tablero/listas/miembros/tarjetas no constituyen una instantánea atómica de Trello. Se rechazan relaciones incompletas, respuestas mayores de cinco MB y consultas que alcancen 1000 tarjetas para evitar aceptar truncamiento. La paginación de tableros grandes y reintentos automáticos quedan pendientes.

Descripciones, WBS, dependencias, checklists y confirmación de línea base están integrados en [supervisión](supervision.md). La evaluación de retrasos y sus umbrales dinámicos se describen en [reglas](tracking-rules.md). Quedan pendientes consulta periódica, mapeos configurables de prioridad/bloqueo y paginación del historial. Los miembros asignados no se confunden con el responsable principal descrito. No se inventan prioridades ni vínculos de identidad.

## Verificación

`npm test`: normalización, comparación, errores/límites, host fijo, ausencia de secretos en URLs y solicitudes solo GET, además de las pruebas existentes.

`npm run test:trello-db`: PostgreSQL real, persistencia/comparación, conservación ante fallos, fuente antigua/tablero ajeno, bloqueo concurrente, sesiones/permisos/CSRF y credenciales ausentes. Todos los registros de prueba se revierten; las transacciones del servicio usan savepoints solo en el arnés.

Se verificó el panel mediante una cuenta temporal no confirmada en PostgreSQL y un servidor de prueba separado. El árbol de accesibilidad mostró los 31 elementos y sus fechas/asignaciones. La captura de pantalla no estuvo disponible. No se utilizó ni cambió la contraseña real del gestor.

Referencias: [Trello Boards REST](https://developer.atlassian.com/cloud/trello/rest/api-group-boards/) y [autorización oficial](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/).


## Escrituras controladas incorporadas posteriormente

La sincronización descrita aquí sigue utilizando exclusivamente GET y una credencial de lectura. La octava tanda incorpora un adaptador independiente de [ejecución controlada](trello-execution.md), desactivado en el entorno real y bloqueado para demostraciones. Sus pruebas de PUT son simuladas; no modificaron el tablero de UTAPED.
