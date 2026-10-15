# Proveedores de los agentes

Decisión del gestor del 14 de octubre de 2026: permitir elegir ChatGPT u Ollama para los agentes, sin sustituir automáticamente un proveedor por el otro.

## Uso

En **Propuestas** y **Código**, elige proveedor y modelo antes de consentir el envío. La elección se aplica a las etapas de esa solicitud: Ejecutor, Revisor y Aprobador. No es una asignación diferente por etapa. Cambiar el modelo borra el consentimiento y el nivel de razonamiento seleccionado.

En **Configuración → Automatización**, la revisión programada conserva su propio proveedor, modelo, consentimiento, días y hora. Guardar una elección manual no cambia la programación existente. Los reportes deterministas no necesitan un modelo.

ChatGPT requiere una conexión disponible de la cuenta autorizada. Ollama requiere el servidor accesible mediante `OLLAMA_BASE_URL` y un modelo instalado. Inicia el servicio instalado con `ollama serve` cuando sea necesario. No se descargan modelos automáticamente. Reinicia la API si cambias la dirección en `.env`.

El panel de integraciones permite evaluar seis casos sintéticos con cada proveedor. La evaluación no aprueba propuestas ni habilita escrituras. Las modificaciones en Trello y las publicaciones en GitHub conservan sus decisiones y confirmaciones separadas.

## Persistencia y controles

- Los identificadores históricos sin prefijo conservan su significado ChatGPT. Los modelos locales se guardan como `ollama:<nombre>` en trabajos, mensajes, análisis y configuraciones. Así, un reinicio o una nueva selección no redirige los trabajos anteriores.
- Una continuación explícita puede elegir otro proveedor y queda registrada como un nuevo trabajo; las etapas ya completadas no se repiten automáticamente.
- Ollama no recibe credenciales de ChatGPT. El gestor se verifica antes y después de inferir; las respuestas pasan por los validadores de alcance, evidencia y dictámenes existentes.
- Los modelos locales usan su razonamiento predeterminado. No se traducen artificialmente los niveles de ChatGPT. La API rechaza un nivel explícito no soportado.
- Se limita la evidencia local a 120 000 bytes y la respuesta a 2 000 000 bytes. El plazo de inferencia es de 300 segundos. Un fallo no provoca reintento ni cambio automático a ChatGPT.
- Cambiar el modelo instalado durante el trabajo invalida su identidad conservada. El cierre del servicio cancela las solicitudes Ollama activas.

La privacidad depende de la ubicación del servidor y del modelo. Una URL remota o un modelo conectado a servicios externos no equivale a procesamiento privado local. Ningún proveedor garantiza respuestas correctas ni una latencia fija.

Referencia del transporte: [API oficial de chat de Ollama](https://docs.ollama.com/api/chat).

## Verificación realizada

El 14 de octubre se comprobó inferencia real local con `qwen2.5-coder:7b`: el contrato sintético mínimo respondió correctamente en 5 812 ms. En la batería real de seis casos superó **3 de 6**; fallaron dos comprobaciones de aprobación humana y una clasificación ante instrucciones inyectadas. No se considera validado para uso fiable por ese resultado. La evidencia local se conserva en `work/provider-validation/ollama-result.json` y `ollama-suite.json`, excluidos de Git.

Las pruebas automatizadas con transporte simulado y PostgreSQL verifican el flujo completo de los tres agentes, análisis y corrección de código, conservación de la decisión humana pendiente, persistencia del proveedor programado y ausencia de cambio automático. Estas pruebas verifican la integración; no sustituyen la calidad del modelo real ni cierran los 39 criterios académicos.
