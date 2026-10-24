import type {
  AgentVerdict,
  CodeAnalysisView,
  CodeOverview,
  CodeProposalView,
  ProjectAccess,
  ReasoningEffort,
} from '@dev-project-agent/contracts';
import { effortLabels } from './ReasoningSelect';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig, stages, checks, explain, dates, downloadPatch, splitGoal } from './codeReviewShared';

export function CodeProposalDrawer({
  action,
  busy,
  confirmDecision,
  confirmPublication,
  confirmSimulation,
  connected,
  consent,
  current,
  detail,
  model,
  overview,
  post,
  project,
  providerFields,
  reason,
  running,
  setActiveTab,
  setAnalysis,
  setAnalysisId,
  setConfirmDecision,
  setConfirmPublication,
  setConfirmSimulation,
  setConsent,
  setDetail,
  setDrawerHidden,
  setNotice,
  setReason,
  setSelection,
  versionPath,
}: {
  action: (operation: () => Promise<void>) => Promise<void>;
  busy: boolean;
  confirmDecision: boolean;
  confirmPublication: boolean;
  confirmSimulation: boolean;
  connected: boolean;
  consent: boolean;
  current: boolean | null;
  detail: CodeProposalView;
  model: string;
  overview: CodeOverview | null;
  post: <T>(path: string, body: Record<string, unknown>, idempotent?: boolean) => Promise<T>;
  project: ProjectAccess;
  providerFields: { consent: boolean; reasoningEffort?: ReasoningEffort | undefined; model: string; };
  reason: string;
  running: boolean | undefined;
  setActiveTab: Dispatch<SetStateAction<"proposals" | "analyses" | "coverage" | "publications">>;
  setAnalysis: Dispatch<SetStateAction<CodeAnalysisView | null>>;
  setAnalysisId: Dispatch<SetStateAction<string>>;
  setConfirmDecision: Dispatch<SetStateAction<boolean>>;
  setConfirmPublication: Dispatch<SetStateAction<boolean>>;
  setConfirmSimulation: Dispatch<SetStateAction<boolean>>;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setDetail: Dispatch<SetStateAction<CodeProposalView | null>>;
  setDrawerHidden: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setReason: Dispatch<SetStateAction<string>>;
  setSelection: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  versionPath: string;
}) {
  return (
    <div
      className="proposals-drawer-backdrop"
      onClick={() => setSelection(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-drawer-title"
    >
      <aside
        className="proposals-detail-drawer code-detail-drawer"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <header className="drawer-header">
          <div className="drawer-header-meta">
            <span className={'proposal-status-badge ' + getStateConfig(detail.state).badgeClass}>
              <Icon path={getStateConfig(detail.state).icon} />
              <span>{getStateConfig(detail.state).label}</span>
            </span>
            <span
              className={
                'proposal-purpose-chip ' +
                (detail.purpose === 'live' ? 'live' : 'demonstration')
              }
            >
              {detail.purpose === 'live' ? 'Uso real' : 'Demostración'}
            </span>

            <div className="drawer-version-picker">
              <label htmlFor="code-version-select">Versión:</label>
              <select
                id="code-version-select"
                value={detail.version}
                onChange={event => {
                  setSelection({ id: detail.id, version: Number(event.target.value) });
                  setDetail(null);
                }}
                disabled={busy}
                className="drawer-version-select"
              >
                {Array.from({ length: detail.latestVersion }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    v{index + 1} {index + 1 === detail.latestVersion ? '(actual)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setSelection(null)}
            aria-label="Cerrar detalle"
            title="Cerrar (Esc)"
          >
            <Icon path="M18 6L6 18 M6 6l12 12" />
          </button>
        </header>

        {/* Scroll Container spanning the full modal under sticky header */}
        <div className="drawer-scroll-body">
          <div className="drawer-title-area">
            <div className="drawer-title-heading-row">
              <div className="drawer-title-icon-box">
                <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </div>
              <div className="drawer-title-content">
                <span className="drawer-badge-kicker">Revisión de Código · Parche Candidato</span>
                {(() => {
                  const { title } = splitGoal(detail.goal);
                  return <h3 id="code-drawer-title">{title}</h3>;
                })()}
              </div>
            </div>

            {(() => {
              const { description } = splitGoal(detail.goal);
              if (!description) return null;
              return (
                <div className="drawer-goal-box">
                  <div className="goal-box-header">
                    <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <span>Objetivo y especificación esperada:</span>
                  </div>
                  <p className="drawer-description-text">{description}</p>
                </div>
              );
            })()}

            <div className="drawer-meta-chips-row">
              <span className="drawer-meta-chip">
                <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                <span>{dates(detail.createdAt)}</span>
              </span>
              <span className="drawer-meta-chip">
                <Icon path="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                <span>ID: <code>{detail.id.slice(0, 8)}</code></span>
              </span>
              <button
                type="button"
                className="drawer-meta-chip origin is-clickable"
                onClick={() => {
                  setAnalysisId(detail.analysisId);
                  setAnalysis(null);
                  setActiveTab('analyses');
                  setDrawerHidden(true);
                }}
                title="Ver análisis y hallazgos de origen"
              >
                <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                <span>Análisis de origen: <code>{detail.analysisId.slice(0, 8)}</code> →</span>
              </button>
            </div>
          </div>

          {/* 6-Stage Stepper for Code Corrections */}
          <div className="proposal-journey-container">
            <nav className="proposal-stepper" aria-label="Progreso de la corrección">
              {[
                { step: 1, label: '1. Análisis', status: 'is-done' },
                {
                  step: 2,
                  label: '2. Ejecutor',
                  status: detail.messages.some(m => m.stage === 'executor' && m.status === 'succeeded')
                    ? 'is-done'
                    : detail.state === 'draft'
                      ? 'is-current'
                      : '',
                },
                {
                  step: 3,
                  label: '3. Revisor',
                  status: detail.messages.some(m => m.stage === 'reviewer' && m.status === 'succeeded')
                    ? 'is-done'
                    : ['pending_review', 'in_review'].includes(detail.state)
                      ? 'is-current'
                      : '',
                },
                {
                  step: 4,
                  label: '4. Aprobador',
                  status: detail.messages.some(m => m.stage === 'approver' && m.status === 'succeeded')
                    ? 'is-done'
                    : ['pending_policy_check', 'in_policy_check'].includes(detail.state)
                      ? 'is-current'
                      : '',
                },
                {
                  step: 5,
                  label: '5. Gestor',
                  status: ['authorized', 'executing', 'executed', 'simulated'].includes(detail.state)
                    ? 'is-done'
                    : detail.state === 'pending_human_approval'
                      ? 'is-current'
                      : ['changes_requested', 'rejected'].includes(detail.state)
                        ? 'is-failed'
                        : '',
                },
                {
                  step: 6,
                  label: '6. Publicación',
                  status: ['executed', 'simulated'].includes(detail.state)
                    ? 'is-done'
                    : detail.state === 'executing'
                      ? 'is-current'
                      : '',
                },
              ].map(s => (
                <div key={s.step} className={`stepper-step ${s.status}`}>
                  <div className="stepper-dot">
                    {s.status === 'is-done' ? (
                      <Icon path="M5 13l4 4L19 7" />
                    ) : s.status === 'is-failed' ? (
                      <Icon path="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <span>{s.step}</span>
                    )}
                  </div>
                  <span className="stepper-label">{s.label}</span>
                </div>
              ))}
            </nav>
          </div>

          {/* Content Flow Container */}
          <div className="drawer-content-flow">
            {/* Candidate Correction Details */}
            {detail.candidate && (
            <div className="drawer-section-card">
              <div className="section-card-header accent">
                <div className="section-header-left">
                  <div className="section-icon-badge">
                    <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </div>
                  <div>
                    <span className="section-kicker">Etapa 2 · Agente Ejecutor</span>
                    <h4 style={{ margin: 0 }}>Propuesta Técnica Formulada</h4>
                  </div>
                </div>
              </div>

              <div className="proposal-objective-box">
                <div className="objective-badge-row">
                  <span className="objective-pill-tag">Objetivo del Parche</span>
                </div>
                <strong className="objective-title">{detail.candidate.correction.objective}</strong>
                <div className="objective-justification-wrap">
                  <span className="justification-heading">Justificación técnica del cambio:</span>
                  <p className="code-justification-p">{detail.candidate.correction.justification}</p>{detail.candidate.documentation&&<details className="change-documentation"><summary>Documentación y justificación de esta versión</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{detail.candidate.documentation}</pre></details>}
                </div>
              </div>

              <div className="code-impact-risk-grid">
                <div className="code-info-subcard impact">
                  <div className="subcard-header">
                    <div className="subcard-icon-box impact">
                      <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                    </div>
                    <span className="subcard-title">Impacto Proyectado</span>
                  </div>
                  <p>{detail.candidate.correction.impact}</p>
                </div>

                <div className="code-info-subcard verification">
                  <div className="subcard-header">
                    <div className="subcard-icon-box verification">
                      <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </div>
                    <span className="subcard-title">Plan de Verificación</span>
                  </div>
                  <p>{detail.candidate.correction.verificationPlan}</p>
                </div>

                <div className="code-info-subcard recovery">
                  <div className="subcard-header">
                    <div className="subcard-icon-box recovery">
                      <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </div>
                    <span className="subcard-title">Plan de Recuperación</span>
                  </div>
                  <p>{detail.candidate.correction.recoveryPlan}</p>
                </div>
              </div>

              {detail.candidate.correction.risks.length > 0 && (
                <div className="code-risks-subcard">
                  <span className="subcard-title">Riesgos evaluados por los agentes</span>
                  <ul>
                    {detail.candidate.correction.risks.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.candidate.correction.unresolvedQuestions.length > 0 && (
                <div className="proposals-error-banner" style={{ margin: '14px 0' }}>
                  <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <div>
                    <strong>Preguntas bloqueantes sin resolver:</strong>
                    <ul>
                      {detail.candidate.correction.unresolvedQuestions.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Git Diff Viewer */}
              <div className="code-diff-viewer-section">
                <div className="diff-header-bar">
                  <div className="diff-title-group">
                    <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    <span className="diff-title">Parche unificado (Git Diff)</span>
                  </div>
                  <button
                    type="button"
                    className="editor-cancel-btn"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => downloadPatch(detail)}
                  >
                    <Icon path="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" />
                    <span>Descargar .patch</span>
                  </button>
                </div>
                <pre className="code-block code-diff-viewer">
                  {detail.candidate.patch.split('\n').map((line, index) => (
                    <div
                      key={index}
                      className={`diff-line ${
                        line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : ''
                      }`}
                    >
                      <span className="diff-line-num">{index + 1}</span>
                      <span className="diff-line-content">{line}</span>
                    </div>
                  ))}
                </pre>
              </div>

              {/* Candidate Automated Checks */}
              {detail.candidate.checks.length > 0 && (
                <div className="code-checks-section" style={{ marginTop: '16px' }}>
                  <h5>Comprobaciones del parche</h5>
                  <div className="code-checks-grid">
                    {detail.candidate.checks.map((item, index) => (
                      <div key={index} className={`code-check-card ${item.status}`}>
                        <div className="code-check-header">
                          <code>{item.path}</code>
                          <span className={`code-check-badge ${item.status}`}>{checks[item.status]}</span>
                        </div>
                        <p className="code-check-msg">{item.message}</p>
                      </div>
                    ))}
                  </div>
                  <small className="muted block-sub" style={{ marginTop: '8px' }}>
                    Las pruebas unitarias y el build completo de UTAPED no se ejecutan automáticamente en el servidor;
                    la aprobación humana da paso a la creación del PR en develop.
                  </small>
                </div>
              )}

              <div className="drawer-meta-box" style={{ marginTop: '16px' }}>
                <span className="meta-label">Sello criptográfico de contenido:</span>
                <code className="meta-value" style={{ wordBreak: 'break-all' }}>
                  {detail.contentHash ?? 'Sin sellar'}
                </code>
              </div>
            </div>
          )}

          {/* Agent Verdicts */}
          <div className="drawer-section-card" style={{ marginTop: '16px' }}>
            <div className="section-card-header accent">
              <div className="section-header-left">
                <div className="section-icon-badge agent">
                  <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </div>
                <div>
                  <span className="section-kicker">Evaluaciones Automatizadas</span>
                  <h4 style={{ margin: 0 }}>Dictámenes de los 3 Agentes de IA</h4>
                </div>
              </div>
            </div>

            <div className="agent-verdicts-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
              {detail.messages.map(message => {
                const verdict =
                  message.stage !== 'executor' && message.output
                    ? (message.output as AgentVerdict)
                    : null;
                const stageName = stages[message.stage] ?? message.stage;
                const isSuccess = message.status === 'succeeded';
                return (
                  <article className="agent-verdict-card" key={message.id}>
                    <header className="agent-verdict-header">
                      <div className="agent-identity-group">
                        <div className={`agent-role-avatar ${message.stage}`}>
                          <Icon
                            path={
                              message.stage === 'executor'
                                ? 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
                                : message.stage === 'reviewer'
                                  ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                                  : 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
                            }
                          />
                        </div>
                        <div>
                          <strong className="agent-role-title">Agente {stageName}</strong>
                          <span className="agent-role-subtitle">
                            {message.stage === 'executor'
                              ? 'Formulación de parches y planes de corrección'
                              : message.stage === 'reviewer'
                                ? 'Revisión estática de código y no regresión'
                                : 'Comprobación de políticas y criterios de publicación'}
                          </span>
                        </div>
                      </div>

                      <span className={`proposal-status-badge ${isSuccess ? 'executed' : 'rejected'}`}>
                        <Icon
                          path={
                            isSuccess
                              ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
                              : 'M18 6L6 18 M6 6l12 12'
                          }
                        />
                        <span>{isSuccess ? 'Superado con éxito' : 'Fallido'}</span>
                      </span>
                    </header>

                    {/* Metadata Bar */}
                    <div className="agent-verdict-meta-bar">
                      <span className="verdict-meta-chip">
                        <Icon path="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        <span>Modelo: <strong>{message.model}</strong></span>
                      </span>
                      <span className="verdict-meta-chip">
                        <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                        <span>Esfuerzo: <strong>{message.reasoningEffort ? effortLabels[message.reasoningEffort] : 'Predeterminado'}</strong></span>
                      </span>
                      <span className="verdict-meta-chip">
                        <Icon path="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <span>Duración: <strong>{message.durationMs !== null ? `${(message.durationMs / 1000).toFixed(1)} s` : '–'}</strong></span>
                      </span>
                    </div>

                    {message.errorCode && (
                      <div className="proposals-error-banner" style={{ padding: '10px 14px', margin: '10px 0' }}>
                        <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <span>{explain(message.errorCode)}</span>
                      </div>
                    )}

                    {verdict && (
                      <div className="agent-verdict-content">
                        {/* Summary Callout */}
                        <div className="verdict-summary-callout">
                          <div className="summary-callout-header">
                            <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                            <strong>Dictamen resumido del {stageName}:</strong>
                          </div>
                          <p className="verdict-summary">{verdict.summary}</p>
                        </div>

                        {/* Structured Check Cards */}
                        {verdict.checks.length > 0 && (
                          <div className="verdict-checks-list">
                            <div className="checks-list-header">
                              <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              <span>Comprobaciones de validación determinista ({verdict.checks.length})</span>
                            </div>
                            <div className="checks-cards-stack">
                              {verdict.checks.map((item, idx) => {
                                const isPass = item.status === 'pass';
                                return (
                                  <div key={item.code || idx} className={`verdict-check-card ${item.status}`}>
                                    <div className="check-card-badge-col">
                                      <span className={`check-card-badge ${item.status}`}>
                                        <Icon
                                          path={
                                            isPass
                                              ? 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'
                                              : 'M18 6L6 18 M6 6l12 12'
                                          }
                                        />
                                        <span>{checks[item.status]}</span>
                                      </span>
                                    </div>
                                    <div className="check-card-body-col">
                                      {item.code && <code className="check-code-pill">{item.code}</code>}
                                      <p className="check-reason-text">{item.reason}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {verdict.issues.length > 0 && (
                          <div className="proposals-error-banner" style={{ margin: '12px 0' }}>
                            <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <div>
                              <strong>Observaciones señaladas por el {stageName}:</strong>
                              <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                                {verdict.issues.map((item, index) => (
                                  <li key={index}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {/* Manager Past Decisions */}
          {detail.decisions.length > 0 && (
            <div className="drawer-section-card" style={{ marginTop: '16px' }}>
              <h4>Historial de decisiones del Gestor</h4>
              <div className="decisions-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {detail.decisions.map(item => (
                  <div className="decision-history-item" key={item.id} style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)' }}>
                    <div className="decision-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        className={`proposal-status-badge ${
                          item.decision === 'approved'
                            ? 'authorized'
                            : item.decision === 'rejected'
                              ? 'rejected'
                              : 'changes-requested'
                        }`}
                      >
                        <span>
                          {item.decision === 'approved'
                            ? 'Aprobada'
                            : item.decision === 'rejected'
                              ? 'Rechazada'
                              : 'Ajustes solicitados'}
                        </span>
                      </span>
                      <span className="decision-date" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {dates(item.createdAt)}
                      </span>
                    </div>
                    <p className="decision-reason" style={{ margin: '8px 0 0', fontSize: '13px' }}>{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Human Manager Active Decisions Panel */}
          {project.canManageProject && current && (
            <div className="drawer-section-card" style={{ marginTop: '16px', border: '2px solid var(--color-accent)' }}>
              <header style={{ marginBottom: '14px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700 }}>Decisión Humana del Gestor</h4>
                <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                  El gestor humano tiene la autoridad exclusiva para autorizar, solicitar cambios o rechazar
                  la publicación de este parche en develop.
                </p>
              </header>

              {/* Reason Textarea */}
              {['pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(detail.state) && (
                <div className="editor-field" style={{ marginBottom: '14px' }}>
                  <label htmlFor="code-reason">
                    Motivo de la decisión {detail.state === 'pending_human_approval' ? '(obligatorio)' : ''}
                  </label>
                  <textarea
                    id="code-reason"
                    className="editor-textarea"
                    value={reason}
                    maxLength={1000}
                    rows={3}
                    onChange={event => {
                      setReason(event.target.value);
                      setConfirmDecision(false);
                    }}
                    disabled={busy || running}
                    placeholder="Explica el motivo técnico o de gestión para autorizar, pedir ajustes o rechazar..."
                  />
                  <div className="textarea-footer">
                    <span>{reason.length}/1000</span>
                  </div>
                </div>
              )}

              {/* Actions for PENDING_HUMAN_APPROVAL */}
              {detail.state === 'pending_human_approval' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <label className="editor-consent-box">
                    <input
                      type="checkbox"
                      checked={confirmDecision}
                      onChange={event => setConfirmDecision(event.target.checked)}
                      disabled={busy || running}
                    />
                    <span>
                      Revisé el diff, las limitaciones y esta versión exacta;{' '}
                      {detail.purpose === 'demonstration'
                        ? 'autorizo únicamente su simulación.'
                        : 'autorizo publicar este diff en una rama y PR hacia develop, sin integrarlo.'}
                    </span>
                  </label>

                  <div className="decision-buttons-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="editor-submit-btn"
                      disabled={busy || running || !confirmDecision || !reason.trim()}
                      onClick={() =>
                        void action(async () => {
                          await post(versionPath + '/decisions', {
                            contentHash: detail.contentHash,
                            decision: 'approved',
                            reason,
                          });
                          setConfirmDecision(false);
                          setNotice('Versión aprobada. La publicación requiere una solicitud separada.');
                        })
                      }
                    >
                      <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      <span>
                        {detail.purpose === 'demonstration'
                          ? 'Aprobar corrección para simulación'
                          : 'Aprobar corrección para publicación'}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="editor-cancel-btn"
                      disabled={busy || running || !reason.trim()}
                      onClick={() =>
                        void action(async () => {
                          await post(versionPath + '/decisions', {
                            contentHash: detail.contentHash,
                            decision: 'changes_requested',
                            reason,
                          });
                        })
                      }
                    >
                      <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      <span>Solicitar ajustes</span>
                    </button>

                    <button
                      type="button"
                      className="editor-cancel-btn"
                      style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      disabled={busy || running || !reason.trim()}
                      onClick={() =>
                        void action(async () => {
                          await post(versionPath + '/decisions', {
                            contentHash: detail.contentHash,
                            decision: 'rejected',
                            reason,
                          });
                        })
                      }
                    >
                      <Icon path="M18 6L6 18 M6 6l12 12" />
                      <span>Rechazar</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Actions for IN-PROGRESS / INTERRUPTED */}
              {['draft', 'pending_review', 'pending_policy_check'].includes(detail.state) && !running && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    className="editor-submit-btn"
                    disabled={busy || !connected || !consent || !model}
                    onClick={() =>
                      void action(async () => {
                        await post(versionPath + '/resume', providerFields);
                        setConsent(false);
                      })
                    }
                  >
                    <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    <span>Continuar etapa de código pendiente</span>
                  </button>
                </div>
              )}

              {/* Recheck & Withdraw actions */}
              {['draft', 'pending_review', 'pending_policy_check', 'pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(
                detail.state
              ) && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="editor-cancel-btn"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    disabled={busy || running}
                    onClick={() =>
                      void action(async () => {
                        setDetail(await post<CodeProposalView>(versionPath + '/recheck', {}, false));
                      })
                    }
                  >
                    <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    <span>Comprobar vigencia del código en GitHub</span>
                  </button>

                  {['pending_human_approval', 'authorized', 'executing', 'execution_failed'].includes(detail.state) && (
                    <button
                      type="button"
                      className="editor-cancel-btn"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                      disabled={busy || running || !reason.trim()}
                      onClick={() =>
                        void action(async () => {
                          await post(versionPath + '/withdraw', { reason }, false);
                          setConfirmSimulation(false);
                        })
                      }
                    >
                      <Icon path="M18 6L6 18 M6 6l12 12" />
                      <span>Retirar corrección</span>
                    </button>
                  )}
                </div>
              )}

              {/* Authorized: Demonstration Simulation */}
              {detail.state === 'authorized' && detail.purpose === 'demonstration' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                  <label className="editor-consent-box">
                    <input
                      type="checkbox"
                      checked={confirmSimulation}
                      onChange={event => setConfirmSimulation(event.target.checked)}
                      disabled={busy || running}
                    />
                    <span>
                      Quiero registrar una simulación de la rama y del PR de esta versión, sin publicarlos en GitHub.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="editor-submit-btn"
                    disabled={busy || running || !confirmSimulation}
                    onClick={() =>
                      void action(async () => {
                        await post(versionPath + '/simulate-publication', {
                          contentHash: detail.contentHash,
                        });
                        setConfirmSimulation(false);
                        setNotice('Simulación registrada. No se creó ninguna rama, commit ni PR en GitHub.');
                      })
                    }
                  >
                    <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    <span>Simular publicación en GitHub</span>
                  </button>
                </div>
              )}

              {/* Authorized: Live Publication to GitHub */}
              {detail.state === 'authorized' && detail.purpose === 'live' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
                  <label className="editor-consent-box">
                    <input
                      type="checkbox"
                      checked={confirmPublication}
                      disabled={busy || running}
                      onChange={event => setConfirmPublication(event.target.checked)}
                    />
                    <span>
                      Confirmo publicar esta versión exacta en una rama y PR hacia develop; el merge queda
                      pendiente de revisión humana externa.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="editor-submit-btn"
                    disabled={
                      busy ||
                      running ||
                      !confirmPublication ||
                      !overview?.writesEnabled ||
                      !overview.writeCredentialsConfigured
                    }
                    onClick={() =>
                      void action(async () => {
                        await post(versionPath + '/publish', {
                          contentHash: detail.contentHash,
                          confirmed: true,
                        });
                        setConfirmPublication(false);
                        setNotice('Publicación solicitada en GitHub. Consulta la verificación antes de integrar.');
                      })
                    }
                  >
                    <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <span>Publicar rama y Pull Request aprobados</span>
                  </button>
                  {!overview?.writesEnabled && (
                    <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
                      La publicación real está desactivada en este entorno.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </aside>
    </div>
  );
}
