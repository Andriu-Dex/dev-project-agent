# Diagramas y Especificación de Arquitectura del Agente

Documento técnico que detalla la arquitectura de software, la orquestación secuencial de la tríada de agentes, los límites estrictos de operación y las contingencias frente a fallos del sistema **Dev Project Agent** para la supervisión de proyectos de software (caso UTAPED).

---

Los diagramas resumen el flujo de propuestas externas; los reportes internos usan reglas deterministas y no recorren una aprobación de IA. Las transiciones exactas dependen del módulo. La protección de auditoría corresponde al rol ordinario y no equivale a inmutabilidad frente a un administrador.

## 1. Diagrama de Componentes y Fronteras de Confianza

Este diagrama ilustra la arquitectura general del sistema, los límites de seguridad y la separación entre la lógica determinista del servicio y los modelos de lenguaje (IA).

```mermaid
graph TD
    subgraph UI["Capa de Presentación (Navegador)"]
        Dashboard["Panel React / Vite<br/>(Temas Claro/Oscuro, A4 PDF)"]
    end

    subgraph Boundaries["Frontera de Seguridad HTTP / Sesión"]
        SessionGuard["Fastify HTTP Guard<br/>(Cookie HttpOnly, CSRF, Origen, Rol Manager)"]
    end

    subgraph Service["Servicio Central (Node.js / TypeScript)"]
        Engine["Motor de Reglas y Supervisión<br/>(Cálculos deterministas, avance, fechas, WBS)"]
        ExecController["Control de Ejecución e Idempotencia<br/>(Precondiciones, sellado de huella, 1 acción)"]
        Scheduler["Planificador y Cola de Tareas<br/>(Cortes semanales, lecturas periódicas)"]

        subgraph AgentOrchestration["Tríada de Agentes (Secuencial)"]
            Executor["1. Agente Ejecutor<br/>(Análisis de fuentes, propuestas, borradores)"]
            Reviewer["2. Agente Revisor<br/>(Validación cruzada, consistencia, precondiciones)"]
            Approver["3. Agente Aprobador<br/>(Evaluación de política y gobernanza)"]
        end
    end

    subgraph DB["Capa de Persistencia (PostgreSQL)"]
        Postgres[("Base de Datos PostgreSQL<br/>- Snapshots Trello/GitHub<br/>- Propuestas versionadas<br/>- Auditoría protegida por permisos<br/>- Sesiones y tareas")]
    end

    subgraph ExternalAdapters["Adaptadores de Integración"]
        TrelloAdapter["Adaptador REST Trello<br/>(Lectura / Escritura delimitada 1 tarjeta)"]
        GitHubAdapter["Adaptador REST GitHub<br/>(Lectura referencias / PRs en develop)"]
        AIAdapter["Adaptador de IA / Vault Seguro<br/>(ChatGPT oficial / Ollama local)"]
    end

    subgraph ExternalEntities["Entornos Externos y Datos No Confiables"]
        TrelloCloud["Trello API Cloud<br/>(Tablero UTAPED)"]
        GitHubCloud["GitHub API Cloud<br/>(Repositorio UTAPED)"]
        LLMProvider["Proveedor de Modelo<br/>(OpenAI / Ollama GPU)"]
        HumanManager["Gestor Humano Autorizado<br/>(Steven Paredes / andrewuzumaki)"]
    end

    Dashboard -->|"HTTPS / Loopback + Cookie"| SessionGuard
    SessionGuard --> Engine
    SessionGuard --> ExecController
    SessionGuard --> Scheduler

    Engine --> AgentOrchestration
    Executor -->|"Entrega propuesta y huella"| Reviewer
    Reviewer -->|"Dictamen técnico validado"| Approver
    Approver -->|"Solicitud de autorización"| HumanManager
    HumanManager -->|"Decisión explícita (Approved/Rejected)"| ExecController

    ExecController -->|"Lectura pre/post y escritura"| TrelloAdapter
    ExecController -->|"Publicación controlada PR"| GitHubAdapter
    AgentOrchestration -->|"Inferencia estructurada"| AIAdapter

    TrelloAdapter --> TrelloCloud
    GitHubAdapter --> GitHubCloud
    AIAdapter --> LLMProvider

    Engine -.->|"Transacciones y consultas"| Postgres
    ExecController -.->|"Registro de intenciones y eventos"| Postgres
    Scheduler -.->|"Recuperación de cortes"| Postgres
```

---

## 2. Diagrama de Secuencia: Orquestación de los Tres Agentes

Muestra el ciclo de vida completo desde la detección de una desviación hasta la verificación de la ejecución o rechazo, demostrando que **la IA nunca tiene permiso de ejecución directa**.

```mermaid
sequenceDiagram
    autonumber
    actor Gestor as Gestor Humano (Manager)
    participant Svc as Servicio (Fastify / Core)
    participant Ex as Agente Ejecutor
    participant Rev as Agente Revisor
    participant Appr as Agente Aprobador
    participant DB as PostgreSQL
    participant Ext as API Externa (Trello/GitHub)

    Note over Svc,Ex: Fase 1: Análisis y Generación
    Svc->>Ex: Inicia análisis con Snapshot congelado y Reglas
    Ex->>Ex: Identifica desviación y formula acción delimitada
    Ex-->>Svc: Entrega borrador (finding, action, preconditions)
    Svc->>DB: Sella versión inmutable y calcula contentHash (Estado: draft -> pending_review)

    Note over Svc,Rev: Fase 2: Revisión Técnica
    Svc->>Rev: Entrega propuesta sellada + evidencia
    Rev->>Rev: Comprueba cálculos, relaciones WBS, fechas y consistencia
    alt Hay inconsistencia o datos insuficientes
        Rev-->>Svc: Veredicto: changes_requested / rejected
        Svc->>DB: Actualiza estado a changes_requested (Terminal para versión)
    else Verificación técnica exitosa
        Rev-->>Svc: Veredicto: validated (Checks bloqueantes en pass)
        Svc->>DB: Transición a pending_policy_check
    end

    Note over Svc,Appr: Fase 3: Evaluación de Política y Alcance
    Svc->>Appr: Evalúa gobernanza sobre versión revisada
    Appr->>Appr: Verifica política del proyecto y tipo de acción
    alt Modificación externa (Trello o Código)
        Appr-->>Svc: Veredicto: human_required (Bloqueo mandatorio de política)
        Svc->>DB: Transición a pending_human_approval
        Svc->>Gestor: Notifica propuesta lista para decisión en Panel
    end

    Note over Gestor,Svc: Fase 4: Decisión Humana
    Gestor->>Svc: Decide sobre versión exacta (Aprobar / Rechazar / Ajustar)
    alt Rechazada o Pide Ajustes
        Svc->>DB: Marca rejected o changes_requested (No se ejecuta)
    else Aprobada (Solo propósito 'live')
        Svc->>DB: Registra decisión humana inmutable (Estado: authorized)
        Note over Gestor,Svc: Confirmación de Ejecución Independiente
        Gestor->>Svc: Solicita ejecución explícita (POST /execute con requestKey)
        Svc->>DB: Inicia trabajo de ejecución con clave de idempotencia (Estado: executing)

        Note over Svc,Ext: Fase 5: Ejecución Controlada y Verificación
        Svc->>Ext: 1. Lee recurso para revalidar precondiciones
        alt El recurso cambió externamente
            Svc->>DB: Transición a invalidated (Se cancela escritura)
        else Precondiciones coinciden exactamente
            Svc->>DB: Registra write_started_at y huella previa
            Svc->>Ext: 2. Envía exactamente un PUT / POST delimitado
            Svc->>Ext: 3. Re-lee el recurso externamente
            alt Estado observado coincide con lo propuesto
                Svc->>DB: Transición a executed (Resultado verificado)
            else Discrepancia o Timeout de red
                Svc->>DB: Transición a reconciliation_required (Bloqueo de seguridad)
            end
        end
    end
```

---

## 3. Diagrama de Estados: Ciclo de Vida de Propuestas

Representa las transiciones permitidas por el motor de estados. Cualquier intento de salto arbitrario de estado es rechazado por el backend.

```mermaid
stateDiagram-v2
    [*] --> draft: Ejecutor prepara propuesta
    draft --> pending_review: Contrato y datos mínimos válidos

    pending_review --> in_review: Se activa el Revisor
    in_review --> changes_requested: Revisor solicita ajuste
    in_review --> rejected: Revisor descarta propuesta
    in_review --> pending_policy_check: Revisor valida (checks pass)

    pending_policy_check --> in_policy_check: Se activa el Aprobador
    in_policy_check --> pending_human_approval: Acción externa (requiere humano)
    in_policy_check --> changes_requested: Aprobador solicita ajuste
    in_policy_check --> rejected: Aprobador rechaza por política

    pending_human_approval --> authorized: Gestor aprueba versión exacta
    pending_human_approval --> rejected: Gestor rechaza
    pending_human_approval --> changes_requested: Gestor solicita ajustes

    authorized --> executing: Solicitud de ejecución confirmada
    authorized --> invalidated: Precondición cambia o se retira autorización

    executing --> executed: Efecto observado coincide con lo propuesto
    executing --> execution_failed: Fallo confirmado sin efectos externos
    executing --> reconciliation_required: Fallo de red, timeout o efecto parcial

    reconciliation_required --> executed: Reconciliación confirma efecto completo
    reconciliation_required --> execution_failed: Reconciliación confirma ausencia de efectos

    execution_failed --> executing: Solicitud manual con autorización y precondiciones vigentes
    execution_failed --> invalidated: Se desiste o cambia precondición

    changes_requested --> [*]: Versión cerrada (genera nueva versión draft)
    rejected --> [*]: Terminal definitiva
    executed --> [*]: Terminal (modificación posterior exige nueva propuesta)
    invalidated --> [*]: Terminal definitiva
```

---

## 4. Diagrama de Contingencias, Idempotencia y Reconciliación

Explica cómo reacciona el sistema ante caídas del servidor, fallos de red y concurrencia.

```mermaid
flowchart TD
    StartExecution["Inicio de Solicitud de Ejecución"] --> CheckLocks{"¿Existe trabajo en curso<br/>o reconciliación pendiente?"}

    CheckLocks -- Sí --> AbortBusy["Rechazar con HTTP 409 / Conflicto<br/>(Bloqueo transaccional por proyecto)"]
    CheckLocks -- No --> CheckPurpose{"¿Propósito de la propuesta?"}

    CheckPurpose -- "demonstration" --> ForbidWrite["Rechazar ejecución real<br/>(Inmutable: nunca escribe en nube)"]
    CheckPurpose -- "live" --> VerifyPreconditions["Verificar Gestor activo, CSRF,<br/>huella SHA-256 y Precondiciones de tarjeta"]

    VerifyPreconditions --> StateCheck{"¿Coincide la tarjeta remota<br/>con la huella congelada?"}
    StateCheck -- No --> Invalidate["Marcar propuesta como 'invalidated'<br/>Cero llamadas de escritura"]
    StateCheck -- Sí --> PersistIntent["Persistir intención en PostgreSQL<br/>- Generar idempotencyKey UUID<br/>- Marcar write_started_at"]

    PersistIntent --> DispatchHTTP["Emitir exactamente 1 PUT / POST<br/>(Timeout estricto de 25s)"]

    DispatchHTTP --> HTTPResult{"Resultado de la llamada HTTP"}

    HTTPResult -- "Error local previo o 4xx/404 explícito" --> ExecFailed["Estado: 'execution_failed'<br/>(Se confirma ausencia total de cambios)"]
    HTTPResult -- "Caída de servidor / Timeout / Error 5xx" --> FlagReconciliation["Estado: 'reconciliation_required'<br/>(Bloquea nuevas ejecuciones del proyecto)"]
    HTTPResult -- "Respuesta 200 OK" --> PostReadVerify["Re-lectura remota obligatoria<br/>(GET a Trello / GitHub)"]

    PostReadVerify --> InspectObserved{"¿Se observa exactamente<br/>el valor aprobado?"}
    InspectObserved -- Sí --> Executed["Estado: 'executed'<br/>(Efecto verificado en fuente)"]
    InspectObserved -- No o Discrepancia --> FlagReconciliation

    FlagReconciliation --> ReconcileAction["Procedimiento de Reconciliación<br/>(POST /executions/:id/reconcile)"]
    ReconcileAction --> ReadOnlyQuery["Solo consulta remota sin reescribir"]
    ReadOnlyQuery --> EvalMatch{"¿Efecto remoto coincide?"}
    EvalMatch -- Sí --> Executed
    EvalMatch -- "Permanece valor antiguo" --> KeepLock["Mantiene 'reconciliation_required'<br/>Requiere inspección manual del Gestor"]
```

---

## 5. Límites Críticos del Agente (System Boundaries)

1. **Monoproyecto y Aislamiento**:
   - Diseñado estrictamente para supervisar un único proyecto operativo (**UTAPED**).
   - No tiene acceso ni conexión a la base de datos de producción de UTAPED ni a datos académicos reales; solo supervisa el tablero de Trello y el repositorio de Git/GitHub.

2. **Propósito Inmutable (`demonstration` vs `live`)**:
   - Toda propuesta nace como `demonstration` por defecto. Si se crea como tal, **nunca** puede cambiar a `live` ni emitir escrituras reales en servicios externos, independientemente de la configuración del entorno.
   - El propósito `live` requiere configuración expresa del operador (`TRELLO_WRITES_ENABLED=true` y credenciales separadas) y confirmación explícita del gestor.

3. **Sin Autonomía de Modificación Externa**:
   - La IA **carece de herramientas para ejecutar comandos shell o peticiones de red arbitrarias**.
   - Toda salida generada por un modelo (JSON) es tratada como datos no confiables y validada sintáctica y semánticamente por esquemas estrictos de TypeScript/Fastify.
   - La IA no puede autorizar una propuesta ni declarar que una tarea ha sido aceptada formalmente.

4. **Acción Atómica y Unitaria**:
   - Una propuesta de Trello solo puede afectar a **una única tarjeta** y a una familia de atributos específica (vencimiento, inicio/fin, asignados, prioridad o estado).
   - Está prohibida la aprobación o ejecución de lotes masivos para prevenir impactos colaterales imprevistos.

5. **No Concurrencia Distribuida (Ausencia de 2PC)**:
   - PostgreSQL y las APIs de Trello/GitHub no comparten una transacción ACID distribuida.
   - El servicio asume que puede existir una carrera externa si un usuario edita Trello simultáneamente en el navegador; por ello, siempre realiza una verificación de precondiciones inmediatamente previa al envío y una lectura de confirmación posterior.

6. **Publicación en GitHub Delimitada**:
   - Las propuestas de código solo preparan ramas de trabajo aisladas (`agent/<proposal-id>-v<version>`) con pull requests en estado borrador hacia `develop`.
   - El agente **jamás** realiza commits directos en `main` ni ejecuta merges automáticos; la integración final siempre corresponde a un humano.

---

## 6. Estrategia de Contingencias y Recuperación

| Escenario de Contingencia | Detección / Condición | Comportamiento del Sistema y Recuperación |
| :--- | :--- | :--- |
| **Corte de red o Timeout durante escritura (Trello/GitHub)** | La petición HTTP no responde en el plazo configurado o arroja `ECONNRESET`. | El trabajo pasa a `reconciliation_required`. Se prohíben reintentos automáticos a ciegas. El gestor ejecuta una consulta de reconciliación (`POST /reconcile`) que solo lee para verificar si la acción impactó o no. |
| **Reinicio del servidor con trabajos pendientes** | El proceso se apaga abruptamente y vuelve a iniciar. | Al arrancar, el servicio escanea `execution_jobs`. Si `write_started_at` ya había ocurrido, marca `reconciliation_required`. Si el fallo ocurrió antes de emitir escritura, marca `failed` de forma segura. |
| **Agotamiento de cuota o indisponibilidad de IA** | OpenAI/Ollama devuelve error 429, 503 o cuota expirada. | El `Run` del agente falla registrando el error técnico. La propuesta **permanece en su estado previo** (`pending_review` o `pending_policy_check`). Nunca se aprueba automáticamente ni se omite la revisión. |
| **Desincronización de Precondiciones (Edición concurrente)** | Un miembro del equipo cambia una fecha en Trello mientras el gestor aprobaba. | Al intentar ejecutar, el servicio lee la tarjeta y compara la huella. Al detectar discordancia, cancela la escritura, marca la propuesta como `invalidated` y exige crear una nueva versión basada en la realidad actual. |
| **Caída o desconexión de PostgreSQL** | Error de conexión con la base de datos local. | El servidor responde 503 (Servicio no disponible). Fastify rechaza transiciones. Las operaciones de red externas no se inician si no se puede persistir la intención previamente. |
| **Retirada de Autorización por el Gestor** | El gestor decide retirar su visto bueno antes de ejecutar. | Se invoca `POST /withdraw`. La versión pasa inmediatamente a `invalidated`, conservando la auditoría conservada de la decisión previa y del motivo de retirada. |
