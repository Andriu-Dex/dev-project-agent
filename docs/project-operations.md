# Operación programada y alertas

Las lecturas de fuentes y la revisión diaria de código se configuran en **Operación**. Ambas comienzan desactivadas y requieren que el servicio permanezca encendido. El horario usa `America/Guayaquil`; tras una interrupción, la lectura se recupera al estado disponible sin inventar snapshots de los periodos omitidos.

Cada configuración conserva gestor, versión de autoridad, fecha, consentimiento y límites. Las solicitudes periódicas reutilizan la cola de supervisión, sus leases y su historial. El análisis diario compara hashes de blobs con la cobertura anterior, procesa lotes de hasta cuatro archivos y enumera archivos aplazados y excluidos. Sin consentimiento de IA, realiza comprobaciones locales; con IA, valida la conexión, modelo y razonamiento autorizados. Un límite o fallo se registra; no se presenta como análisis completado. La revocación de autoridad suspende la programación.

Las alertas se conservan al guardar supervisiones con lectura reciente. La clave estable es proyecto/tarjeta/regla; nuevas observaciones no crean alertas duplicadas. Cuando un hallazgo desaparece de un corte reciente, queda resuelto y mantiene sus eventos. Lecturas históricas o desactualizadas no resuelven alertas.

El análisis muestra causas declaradas explícitamente en la descripción (`CAUSA:` o `CAUSA DE RETRASO:`), o hipótesis identificadas como tales. Recorre sucesoras explícitas y presenta alternativas con ventajas, riesgos y elegibilidad. El gestor puede registrar seguimiento y confirmar una causa. Esto no autoriza una escritura. Las alternativas conducen a la preparación de propuestas; el flujo de tres agentes y la aprobación específica siguen siendo obligatorios.

Verificación inicial: pruebas unitarias de cortes de Ecuador y dependencias; cuatro pruebas PostgreSQL de configuración, recuperación sin duplicados, alertas correlacionadas, cobertura por contenido y revocación de autoridad. Se usa transporte sintético, con rollback de datos de prueba. La activación y validación representativa real siguen pendientes.
