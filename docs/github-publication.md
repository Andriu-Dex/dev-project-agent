# Publicación controlada de correcciones en GitHub

Implementación del 12 de octubre de 2026. El adaptador está integrado y probado con transporte sintético. El entorno de UTAPED mantiene las escrituras desactivadas; no se creó ninguna rama, commit ni PR externo durante esta implementación.

## Alcance y autorización

Cada nueva corrección conserva propósito `demonstration` o `live`. La demostración es permanente y solo permite simulación local. Para publicar se requiere una corrección real, última versión autorizada, dictámenes válidos, huella exacta y aprobación humana vigente. La confirmación de envío de código al modelo es distinta de la autorización de publicación.

El servicio exige `GITHUB_WRITES_ENABLED=true` y un `GITHUB_WRITE_TOKEN` separado, con acceso al repositorio configurado y permisos adecuados de contenidos y pull requests. Esos valores son configuración del operador; habilitarlos no aprueba ninguna corrección. Reiniciar después de cambiar el entorno. Mantener `.env` protegido y fuera de Git. Nunca pegar tokens en objetivos, decisiones, capturas ni reportes.

Solo se admite el repositorio configurado, rama base `develop`, archivos/rutas ya incluidos en la fuente y diff revisado. La rama se llama `agent/<proposal-id>-v<version>`. El commit y metadatos del PR están en inglés. El PR se crea como borrador; el merge a `develop` y posteriormente a `main` corresponde a una persona. No hay force push, eliminación, modificación de ramas existentes ni merge automático.

## Secuencia y verificación

1. Guardar intención durable y clave idempotente. Revalidar gestor solicitante y aprobación original, versión/huella, dictámenes y destino.
2. Consultar permisos de GitHub, existencia de `develop`, commit/árbol exactos y ausencia de la rama prevista.
3. Registrar inicio de escritura antes de enviar cualquier petición. Crear blobs modificados, árbol, commit con padre aprobado, referencia nueva y PR.
4. Antes de cada escritura comprobar nuevamente autoridad, configuración, contenido y referencia base. Un cambio detiene nuevas peticiones.
5. Releer referencia, padre del commit, árbol completo y PR. Comparar inventario: solo cambian los blobs aprobados; las rutas/modos/resto del árbol se conservan. Verificar repositorio, rama, SHA, destino, título y cuerpo del PR.
6. Guardar `succeeded` únicamente al verificar el resultado completo. Mostrar enlace y `pending_human` para la integración. Un HTTP correcto por sí solo no acredita este resultado.

Las peticiones tienen límites de tamaño/tiempo, destino fijo `api.github.com`, credencial en cabecera y redirecciones rechazadas. No se ejecutan scripts ni código del repositorio para publicar.

## Resultados inciertos y recuperación

Un fallo anterior al inicio de escritura queda fallido; se puede retirar o preparar otra versión con revisión nueva. Una desconexión o reinicio posterior al inicio puede haber dejado objetos, una rama o un PR; pasa a `reconciliation_required`. Bloquea otra publicación pendiente del proyecto. Nunca se repiten automáticamente los POST.

El botón **Consultar resultado sin repetir escrituras** realiza solo lecturas. Si encuentra exactamente la rama/árbol/PR aprobados, registra resultado verificado. Si falta parte o hay discrepancia, mantiene la reconciliación. La ausencia de PR no demuestra que no se crearon otros objetos.

Para una publicación parcial, el gestor debe inspeccionar GitHub y el plan/diff conservados. Si corresponde completar manualmente el cambio ya aprobado, utilizar exactamente la rama, padre, archivos y metadatos previstos, y después volver a consultar. Una discrepancia o retirada de autoridad requiere revisión del operador; esta versión no incluye un botón para borrar objetos, forzar ramas, declarar unilateralmente que no hubo efecto ni eludir la reconciliación mediante otra propuesta. No se promete rollback externo.

## API y persistencia

Rutas bajo `/api/v1/projects/:projectId/code-review`, con sesión de gestor, pertenencia, origen permitido y CSRF:

| Método | Ruta | Solicitud |
| --- | --- | --- |
| POST | `/proposals/:proposalId/versions/:version/publish` | `contentHash`, `requestKey` UUID, `confirmed: true`; devuelve trabajo persistido (202). |
| POST | `/publications/:id/reconcile` | Sin nueva escritura; consulta y verifica resultado. |
| GET | Raíz `/code-review`, sin barra final | Vista general de revisión con disponibilidad de escritura, simulaciones y trabajos de publicación. |

`github_publication_jobs` conserva solicitud, actor/autoridad, aprobación, huella, plan, estado y evidencia de resultado. `github_publication_events` y auditoría conservan eventos; el rol ordinario no puede editar ni borrar esa evidencia. Las propuestas anteriores se migran como demostrativas. La configuración actual no se activa al migrar.

La solicitud de publicación y cada consulta humana de reconciliación conservan el actor del gestor. Los eventos de escritura y verificación automática se atribuyen al servicio; el reporte mantiene esa distinción.

Pruebas PostgreSQL: publicación del diff exacto, denegación previa con cero POST, respuesta perdida después de crear PR y reconciliación sin repetir, idempotencia, rechazo de demostración/entorno desactivado y ejecución bajo el rol restringido. El recorrido de navegador también prepara, autoriza, confirma y abre el PR sintético. Estos casos no sustituyen una prueba real autorizada de conectividad/permisos.

Referencias oficiales del adaptador: [Git references](https://docs.github.com/en/rest/git/refs), [Git objects](https://docs.github.com/en/rest/git), [Pull requests](https://docs.github.com/en/rest/pulls/pulls).
