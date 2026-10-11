# Acceso renovable de ChatGPT

Fecha: 11 de octubre de 2026. Esta implementación sustituye el límite local de treinta minutos y la pérdida de acceso al reiniciar. Mantiene autorización oficial, PKCE, identidad verificada, cliente emitido por registro y permisos del gestor.

## Almacenamiento y renovación

El intercambio inicial conserva el token de renovación cuando el proveedor lo entrega. Acceso, renovación, cliente e identidad vinculados se cifran con AES-256-GCM en `chatgpt_credentials`; el cifrado autentica proyecto, usuario y versión de autenticación. La clave de 32 bytes está separada de PostgreSQL, en `CHATGPT_CREDENTIAL_KEY` del `.env` local ignorado. `npm run setup` genera únicamente valores faltantes y nunca imprime claves. Respaldar y proteger la clave junto con la configuración local; reemplazarla sin migrar las credenciales cifradas obliga a reconectar. El modo de archivo de Node no sustituye los permisos NTFS del equipo Windows.

Se elimina el tope artificial de treinta minutos: se respeta `expires_in`. El servicio comprueba renovaciones cada treinta segundos y renueva cerca del vencimiento, con margen de dos minutos y respetando `earliest_refresh_at`. El intercambio usa el `client_id` emitido, el último refresh token y el recurso oficial, sin ampliar scopes. La respuesta reemplaza ambos tokens y el vencimiento; la actualización está condicionada a revisión/estado para impedir que una desconexión sea deshecha por una respuesta tardía.

Un vuelo único en memoria y una transición persistida a `refreshing` impiden dos renovaciones simultáneas del mismo registro. Reiniciar durante una rotación o perder su respuesta deja incertidumbre: no se repite el token anterior que pudo ser consumido; se exige una autorización nueva. La recuperación presupone un único servicio local activo, como el resto de esta entrega; no desplegar varias instancias con recuperación de inicio simultánea.

Una respuesta temporal 5xx/429 conserva credenciales y aplica espera de uno, dos, cuatro, ocho y hasta quince minutos. Una pérdida de respuesta es incierta y requiere reconexión. Los errores terminales de renovación borran el acceso inutilizable. `invalid_client` conserva los datos protegidos para corregir la vinculación y detiene el uso, sin bucle de OAuth. Un error de clave/cifrado detiene el acceso y exige revisar la configuración local. No se repiten automáticamente inferencias ni evaluaciones que consumen cuota.

## Sesiones y autoridad

La conexión renovable corresponde al gestor y proyecto, independiente de su sesión del panel. Una nueva sesión o reinicio recupera el acceso protegido sin repetir OAuth. Cerrar sesión del panel cancela el trabajo ligado a ese navegador y conserva el acceso renovable; **Desconectar ChatGPT** detiene las conexiones del registro, elimina acceso local e intenta revocar la sesión renovable en el endpoint oficial descubierto, restringido al host de autenticación. La revocación reintenta fallos de red/5xx de forma acotada. Si no se confirma, el panel indica que puede desconectarse la aplicación en la configuración de ChatGPT. La identidad/cliente de registro permanecen para una futura autorización.

La sesión web mantiene sus límites de seguridad (treinta minutos de inactividad y ocho horas desde el ingreso). La renovación de ChatGPT no los amplía. Cambios de actividad, autenticación o membresía del gestor impiden usar el acceso guardado y detienen su renovación. Los lectores no reciben modelos ni información de acceso del gestor. Los permisos se comprueban antes y después de la inferencia. La renovación no concede aprobación de propuestas ni habilita escrituras.

Los tokens anteriores solo estaban en memoria y no pueden recuperarse retroactivamente. Tras instalar esta actualización, conectar una vez desde el panel permite guardar el acceso renovable. Si OpenAI revoca el permiso, vence la renovación o queda una rotación incierta, será necesario conectar de nuevo; no se promete acceso perpetuo.

## Evidencia y límites

`npm run test:renewal-db` verifica almacenamiento cifrado, recuperación tras reinicio/logout, exclusión mutua entre servicios, rotación, espera, errores terminales/inciertos, renovación sin navegador, desconexión y pérdida de autoridad, con datos sintéticos y rollback. El recorrido Playwright comprueba callback realista y recuperación desde otra sesión del panel. Las pruebas previas de conexión/evaluación y propuestas también pasan. No se realizó una nueva autorización ni renovación con la cuenta real en esta tanda.

Referencias oficiales consultadas: [cuentas, renovación y revocación](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [respuesta y duración de tokens](https://developers.openai.com/siwc/token-sharing-open-source/token-reference) y [errores y recuperación](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery). Se conserva el presupuesto sin APIs adicionales; los límites y permisos del plan siguen siendo del proveedor.
