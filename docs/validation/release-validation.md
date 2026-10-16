# Verificación de cierre local · 1.0.0

Fecha: 15 de octubre de 2026, America/Guayaquil. Identificación exacta de la fuente y del artefacto: commit, fecha y hashes incluidos en `release-manifest.json` y en el archivo de validación junto al ZIP. Esta verificación local no constituye promoción a `main` ni entrega académica.

## Comprobaciones del cierre original

| Comprobación | Resultado observado |
| --- | --- |
| Tipos | `npm run typecheck` superado en contratos, servidor e interfaz. |
| Unitarias e integración PostgreSQL | `npm run test:isolated`: 350 superadas en 39 archivos; sin casos omitidos en esa ejecución. Incluye 16 casos nuevos PostgreSQL y seis unitarios de cobertura. |
| Compilación | `npm run build` superado; sección Código separada en un chunk. JavaScript inicial alrededor de 481 kB y chunk Código alrededor de 87 kB, antes de gzip. |
| Instalación compilada aislada | Migraciones desde cero; salud, entrega del dashboard, denegación anónima, ingreso de gestor sintético, cobertura desactivada y ausencia de entregas SMTP superados. |
| Respaldo/restauración | Dump restaurado en base temporal; 58 tablas consultables, lectura con rol de aplicación y permiso de modificación de decisiones denegado. Un sobre ChatGPT recuperado se descifró correctamente con la clave conservada, sin renovar ni transmitir su token. |
| Interfaz | Brave con sesión real del gestor: inventario, inicio/pausa, filtro parcial, historial, límites/proveedor/consentimiento sin guardar cambios de método, claro/oscuro y ancho de 390 px. Sin desbordamiento horizontal del documento; tabla con desplazamiento interno. |

Los adaptadores de las suites son sintéticos. Probar un modelo Ollama simulado no reemplaza la evaluación real histórica 3/6. No se repitieron OAuth, evaluación real de proveedor ni escritura externa en esta tanda. Las evidencias de ChatGPT reales anteriores permanecen en [validación del 15 de octubre](chatgpt-validation-oct15.md).

El primer ensayo del runner general comprobó permisos usando por error el rol migrador en `APP_DATABASE_URL`: fallaron dos aserciones de permisos. Se corrigió el runner para conservar el rol de aplicación apuntando únicamente a la base temporal; la ejecución completa posterior pasó. No se relajaron los permisos de producción ni las aserciones para resolverlo.

## Comprobación real de cobertura

Se preparó el inventario GitHub de UTAPED en `ba0d7170b75b…`: 379 entradas de archivos/submódulos, 317 elegibles y 62 excluidas con motivo. La primera tanda determinista confirmó cuatro fragmentos: dos archivos revisados y dos parciales por contexto incompleto. Quedaron 313 pendientes; el porcentaje de revisión completa fue 0,6 %, sin redondearlo a 100 % cuando faltan archivos.

Se comprobó desde la interfaz el historial de `AuditQueryService.java`, con líneas 1–62, fecha, blob y commit, y se filtraron correctamente los dos parciales. La cobertura quedó **en pausa** después de la prueba. No se activó IA en ella ni se modificaron los horarios anteriores, el destinatario o el consentimiento de correo. La lectura del repositorio no modifica ramas, PRs ni Trello.

La relación de resultados no afirma un barrido completo ya ejecutado. La funcionalidad entrega inventario y continuidad; el gestor puede configurar/activar las tandas para avanzar. Las revisiones parciales, exclusiones y límites permanecen visibles.

## Artefactos y recuperación

`npm run release:package` exige árbol limpio y rama `develop` o `main`, compila y selecciona archivos versionados más compilados. Conserva commit/versión y SHA-256 por archivo, verifica las entradas comprimidas y genera una suma del ZIP. Comprueba coincidencias con secretos configurados conocidos; no equivale a una garantía sobre cualquier secreto histórico desconocido.

Quedan fuera `.env`, base, sesiones, autorizaciones, exportaciones Trello, respaldos, evidencias privadas, dependencias y materiales de defensa. Los respaldos privados contienen dump/configuración/manifiesto bajo `backups/`; no se distribuyen. La restauración se prueba en una base nueva sin conectar workers a servicios externos.

La instalación del paquete extraído se verifica con dependencias propias y una base temporal, nunca contra la operación. Los resultados locales quedan bajo `work/release-validation/`; el manifiesto del ZIP identifica su fuente exacta. Un artefacto fallido o preliminar no reemplaza al identificado por la validación final.

## Aceptación y límites conservados

La matriz mantiene **38 comprobaciones superadas y AC-7.06 cerrado con EX-01 histórica**. No se inventa un motivo para la decisión antigua, no se borra y no se considera que el profesor haya concedido una dispensa. La aceptación humana del reporte anterior conserva sus limitaciones. Las pruebas de correcciones de UTAPED siguen siendo del alcance aislado documentado, sin certificación funcional de toda la aplicación.

No se ejecutaron scripts de UTAPED, compilación Java, recorridos completos de sus pantallas, nuevos cambios Trello, publicaciones GitHub ni merge. La aplicación requiere equipo/base/servicio encendidos. ChatGPT depende de cuota y vigencia de autorización; Ollama depende de su modelo y equipo. No se añadieron Gemini/Groq ni fallback automático.

El cierre deja commits locales, paquete y guía revisables. Promoción a `main`, etiqueta, push/release remota y entrega al profesor quedan para la decisión final del gestor. La rama temporal de defensa permanece separada.

## Revalidación tras ajustes visuales y limpieza documental

15 de octubre de 2026, sobre los ajustes visuales de `704ff4b` y la limpieza previa a la fusión:

- `npm run docs:check`: destinos locales válidos en 54 documentos Markdown; no comprueba servicios remotos ni fragmentos de encabezado.
- `npm test`: 192 pruebas superadas y 158 PostgreSQL omitidas por ser optativas. La configuración permanente excluye paquetes locales, respaldos y temporales, manteniendo 39 archivos de pruebas.
- `npm run test:isolated`: 350 pruebas superadas en 39 archivos, sin omisiones, en base temporal eliminada al terminar.
- `npm run typecheck` y `npm run build`: superados. El JavaScript inicial actual es de 575,28 kB antes de gzip, con advertencia no bloqueante de Vite; sustituye las cifras de chunks del cierre original para la interfaz actual.
- Se separaron guías vigentes, evidencia y archivo histórico; los diagnósticos opcionales de Ollama conservan sus comandos y pruebas. No se ejecutaron benchmarks reales ni escrituras externas.

La reorganización no repite la validación de instalación, respaldo o paquete: sus evidencias anteriores siguen identificando sus propias fuentes y artefactos. El ZIP anterior no contiene los ajustes visuales y documentales posteriores; debe regenerarse desde el commit final aceptado antes de distribuirlo.
