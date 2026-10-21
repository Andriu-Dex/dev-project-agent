import type {
  ProjectAccess,
  ProposalOverview,
  ProposalState,
  ProposalVersionView,
  ReasoningEffort,
  SupervisionOverview,
  TrelloOverview,
} from '@dev-project-agent/contracts';
import { providerDestination } from './agentProviders';
import { ExecutionPanel } from './ExecutionPanel';
import { effortLabels } from './ReasoningSelect';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig, stages, verdicts, checkLabels, failures, date, verdict, getProposalStepIndex, ActionSummary } from './proposalShared';

export function ProposalDrawer({
  active,
  busy,
  canAdjust,
  confirm,
  connected,
  csrfToken,
  decide,
  detail,
  detailPath,
  effort,
  isLatest,
  latest,
  model,
  mutate,
  overview,
  project,
  reason,
  resumeConsent,
  setAdjustment,
  setCardId,
  setConfirm,
  setConsent,
  setDue,
  setFamily,
  setGoal,
  setLabel,
  setMemberIds,
  setNotice,
  setReason,
  setResumeConsent,
  setRevision,
  setSelection,
  setShowEditor,
  setStart,
  sources,
}: {
  active: boolean;
  busy: boolean;
  canAdjust: boolean;
  confirm: boolean;
  connected: boolean;
  csrfToken: string;
  decide: (decision: "changes_requested" | "rejected" | "approved") => void;
  detail: ProposalVersionView;
  detailPath: string;
  effort: "" | ReasoningEffort;
  isLatest: boolean;
  latest: { id: string; version: number; purpose: "demonstration" | "live"; state: ProposalState; goal: string; cardName: string; createdAt: string; } | undefined;
  model: string;
  mutate: (path: string, body: Record<string, unknown> | null, onSuccess?: ((result: { proposalId?: string | undefined; version?: number | undefined; invalidated?: boolean | undefined; }) => void) | undefined) => Promise<void>;
  overview: ProposalOverview | null;
  project: ProjectAccess;
  reason: string;
  resumeConsent: boolean;
  setAdjustment: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  setCardId: Dispatch<SetStateAction<string>>;
  setConfirm: Dispatch<SetStateAction<boolean>>;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setDue: Dispatch<SetStateAction<string>>;
  setFamily: Dispatch<SetStateAction<string>>;
  setGoal: Dispatch<SetStateAction<string>>;
  setLabel: Dispatch<SetStateAction<string>>;
  setMemberIds: Dispatch<SetStateAction<string[]>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setReason: Dispatch<SetStateAction<string>>;
  setResumeConsent: Dispatch<SetStateAction<boolean>>;
  setRevision: Dispatch<SetStateAction<number>>;
  setSelection: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  setShowEditor: Dispatch<SetStateAction<boolean>>;
  setStart: Dispatch<SetStateAction<string>>;
  sources: { trello: TrelloOverview; supervision: SupervisionOverview; } | null;
}) {
  const detailSt = getStateConfig(detail.state);
  const currentStepIndex = getProposalStepIndex(detail.state);

  return (
    <div
      className="proposals-drawer-backdrop"
      onClick={() => setSelection(null)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-drawer-title"
    >
      <aside className="proposals-detail-drawer" onClick={e => e.stopPropagation()}>
        <header className="drawer-header">
          <div className="drawer-header-meta">
            <span className={'proposal-status-badge ' + detailSt.badgeClass}>
              <Icon path={detailSt.icon} />
              <span>{detailSt.label}</span>
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
              <label htmlFor="proposal-version-select">Versión:</label>
              <select
                id="proposal-version-select"
                value={detail.version}
                onChange={event =>
                  setSelection({
                    id: detail.proposalId,
                    version: Number(event.target.value),
                  })
                }
                className="drawer-version-select"
              >
                {Array.from({ length: latest?.version ?? detail.version }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    v{index + 1}
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

        <div className="drawer-scroll-body">
          <div className="drawer-title-area">
            <h3 id="proposal-drawer-title">{detail.context.card.name}</h3>
            <p className="drawer-submessage">
              Propuesta creada el <strong>{date(detail.createdAt)}</strong> · Corte de supervisión:{' '}
              <code>{detail.sourceRunId}</code>
            </p>
          </div>

          {/* Proposal Journey / Stepper */}
          <div className="proposal-journey-container">
            <div className="proposal-stepper">
              {[
                { step: 1, label: '1. Solicitud' },
                { step: 2, label: '2. Ejecutor' },
                { step: 3, label: '3. Revisor' },
                { step: 4, label: '4. Aprobador' },
                { step: 5, label: '5. Decisión del gestor' },
                { step: 6, label: '6. Ejecución' },
              ].map(s => {
                const isDone = currentStepIndex > s.step;
                const isCurrent = currentStepIndex === s.step;
                return (
                  <div
                    key={s.step}
                    className={
                      'stepper-step' +
                      (isDone ? ' is-done' : '') +
                      (isCurrent ? ' is-current' : '')
                    }
                  >
                    <span className="stepper-dot">
                      {isDone ? '✓' : s.step}
                    </span>
                    <span className="stepper-label">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="drawer-content-flow">
          {/* Proposed Change Section */}
          {detail.content && (
            <section className="drawer-section-card">
              <div className="section-card-header accent">
                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                <h4>Objetivo y Cambio Formulado</h4>
              </div>

              <div className="proposal-objective-box">
                <strong className="objective-title">{detail.content.objective}</strong>
                <p className="objective-justification">{detail.content.justification}</p>
              </div>

              {detail.content.actions[0] && (
                <ActionSummary
                  action={detail.content.actions[0]}
                  members={sources?.trello.latest?.data.members ?? []}
                />
              )}

              <div className="proposal-impact-box">
                <span className="block-label">Impacto proyectado</span>
                <p>{detail.content.impact}</p>
              </div>

              {detail.content.alternatives.length > 0 && (
                <div className="drawer-meta-list-block">
                  <span className="block-label">Alternativas consideradas por el agente</span>
                  <ul>
                    {detail.content.alternatives.map((val, idx) => (
                      <li key={idx}>{val}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.content.risks.length > 0 && (
                <div className="drawer-meta-list-block">
                  <span className="block-label">Riesgos identificados</span>
                  <ul>
                    {detail.content.risks.map((val, idx) => (
                      <li key={idx}>{val}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="drawer-card-meta-grid">
                <div className="drawer-meta-box">
                  <span className="meta-box-label">Verificación prevista</span>
                  <p className="meta-box-value">{detail.content.verificationPlan}</p>
                </div>
                <div className="drawer-meta-box">
                  <span className="meta-box-label">Recuperación prevista</span>
                  <p className="meta-box-value">{detail.content.recoveryPlan}</p>
                </div>
              </div>

              {detail.content.unresolvedQuestions.length > 0 && (
                <div className="drawer-section-card warning">
                  <div className="section-card-header">
                    <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <h4>Preguntas pendientes sin resolver</h4>
                  </div>
                  <ul className="drawer-issues-list">
                    {detail.content.unresolvedQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <details className="evidence-accordion">
                <summary>Evidencia citada y huella criptográfica</summary>
                <div className="evidence-accordion-content">
                  <p>
                    <strong>Evidencia citada:</strong> {detail.content.evidenceIds.join(', ') || 'Ninguna'}
                  </p>
                  <p className="content-hash">
                    <strong>Hash de contenido:</strong> <code>{detail.contentHash}</code>
                  </p>
                  <p>
                    <strong>Tarjeta Trello:</strong> <code>{detail.context.card.id}</code>
                  </p>
                </div>
              </details>
            </section>
          )}

          {/* Agent Verdicts & History */}
          <section className="drawer-section-card">
            <div className="section-card-header">
              <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              <h4>Dictámenes de los 3 Agentes</h4>
            </div>

            <div className="agent-verdicts-stack">
              {detail.messages.map(message => {
                const review = verdict(message.output);
                const job = overview?.jobs.find(j => j.id === message.jobId);
                const stageLabel = stages[message.stage] ?? message.stage;
                const vInfo = review ? verdicts[review.verdict] : null;

                return (
                  <div key={message.id} className="agent-verdict-box">
                    <div className="verdict-box-header">
                      <div className="verdict-agent-title">
                        <strong>Agente {stageLabel}</strong>
                        <span
                          className={
                            'stage-status-badge ' +
                            (message.status === 'succeeded' ? 'success' : 'failed')
                          }
                        >
                          {message.status === 'succeeded' ? 'Completado' : 'No completado'}
                        </span>
                      </div>

                      <span className="verdict-meta-date">{date(message.createdAt)}</span>
                    </div>

                    <div className="verdict-meta-subline">
                      {job && (
                        <span>
                          Modelo: <strong>{job.model}</strong> · Razonamiento:{' '}
                          <strong>{job.reasoningEffort ? effortLabels[job.reasoningEffort] : 'Predeterminado'}</strong>
                        </span>
                      )}
                      {message.durationMs !== null && (
                        <span> · {(message.durationMs / 1000).toFixed(1)} s</span>
                      )}
                      {message.usage?.total_tokens !== undefined && (
                        <span> · {message.usage.total_tokens} tokens</span>
                      )}
                    </div>

                    {message.errorCode && (
                      <p className="form-error">
                        {failures[message.errorCode] ??
                          'La etapa no terminó. Revisa la conexión y consulta el estado.'}
                      </p>
                    )}

                    {review && (
                      <div className="verdict-evaluation-body">
                        <div className="verdict-summary-line">
                          <span className={'verdict-pill ' + (vInfo?.badgeClass ?? 'pass')}>
                            {vInfo?.label ?? review.verdict}
                          </span>
                          <p className="verdict-summary-text">{review.summary}</p>
                        </div>

                        <ul className="verdict-checks-list">
                          {review.checks.map(check => (
                            <li key={check.code} className={'check-item ' + check.status}>
                              <span className="check-status-icon">
                                {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : '—'}
                              </span>
                              <span>
                                <strong>{checkLabels[check.code] ?? check.code}:</strong> {check.reason}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {review.issues.length > 0 && (
                          <ul className="verdict-issues-list">
                            {review.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Human Manager Decision Zone */}
          {project.canManageProject && isLatest && !active && (
            <section className="drawer-section-card manager-decision-zone">
              <div className="section-card-header manager">
                <Icon path="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <h4>Decisión del Gestor (Control Humano)</h4>
              </div>

              {detail.state === 'pending_human_approval' && (
                <div className="decision-form-container">
                  <p className="decision-notice">
                    Los 3 agentes completaron sus revisiones. Para que esta propuesta sea válida, registra tu
                    decisión fundamentada:
                  </p>

                  <div className="form-field">
                    <label htmlFor="proposal-reason">
                      Motivo o justificación de la decisión <span>(obligatorio)</span>
                    </label>
                    <textarea
                      id="proposal-reason"
                      maxLength={1000}
                      required
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      disabled={busy}
                      placeholder="Explica las razones técnicas, de equipo o estratégicas de tu decisión…"
                      rows={3}
                    />
                  </div>

                  <label className="decision-confirm-checkbox">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={e => setConfirm(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      {detail.purpose === 'demonstration'
                        ? 'He revisado esta versión y registro una aprobación de demostración (sin cambios en Trello).'
                        : 'He revisado esta versión y autorizo el cambio propuesto. La ejecución a Trello se solicitará por separado.'}
                    </span>
                  </label>

                  <div className="decision-buttons-row">
                    <button
                      type="button"
                      className="decision-btn approve"
                      disabled={busy || !confirm || !reason.trim()}
                      onClick={() => decide('approved')}
                    >
                      <Icon path="M5 13l4 4L19 7" />
                      <span>Aprobar esta versión</span>
                    </button>

                    <button
                      type="button"
                      className="decision-btn request-changes"
                      disabled={busy || !reason.trim()}
                      onClick={() => decide('changes_requested')}
                    >
                      <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      <span>Solicitar ajustes</span>
                    </button>

                    <button
                      type="button"
                      className="decision-btn reject"
                      disabled={busy || !reason.trim()}
                      onClick={() => decide('rejected')}
                    >
                      <Icon path="M18 6L6 18 M6 6l12 12" />
                      <span>Rechazar propuesta</span>
                    </button>
                  </div>
                </div>
              )}

              {!['rejected', 'changes_requested', 'invalidated', 'executing', 'executed', 'reconciliation_required'].includes(detail.state) && (
                <div className="recheck-container">
                  <button
                    type="button"
                    className="recheck-btn"
                    disabled={busy}
                    onClick={() => void mutate(detailPath + '/recheck', null)}
                  >
                    <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    <span>Comprobar vigencia de la propuesta frente a Trello</span>
                  </button>
                </div>
              )}

              {['draft', 'pending_review', 'pending_policy_check'].includes(detail.state) && (
                <div className="resume-container">
                  <p className="resume-hint">
                    El proceso se interrumpió; puedes continuar la etapa pendiente utilizando el modelo seleccionado:
                  </p>
                  <label className="editor-consent-box">
                    <input
                      type="checkbox"
                      checked={resumeConsent}
                      onChange={event => setResumeConsent(event.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      Quiero reenviar a <strong>{providerDestination(model)}</strong> el contexto y contenido de
                      esta versión para continuar su revisión.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="resume-submit-btn"
                    disabled={busy || !connected || !model || !resumeConsent}
                    onClick={() =>
                      void mutate(
                        detailPath + '/resume',
                        { model, ...(effort ? { reasoningEffort: effort } : {}) },
                        () => {
                          setResumeConsent(false);
                          setNotice('Etapa pendiente iniciada.');
                        }
                      )
                    }
                  >
                    <Icon path="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <span>Continuar etapa pendiente</span>
                  </button>
                </div>
              )}

              {canAdjust && (
                <div className="adjust-container">
                  <button
                    type="button"
                    className="adjust-btn"
                    disabled={busy}
                    onClick={() => {
                      setAdjustment({ id: detail.proposalId, version: detail.version });
                      setCardId(detail.context.card.id);
                      setGoal(detail.goal);
                      const action = detail.content?.actions[0];
                      const local = (value: string) => {
                        const time = new Date(value);
                        time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
                        return time.toISOString().slice(0, 16);
                      };
                      if (action?.type === 'trello_dates_change') {
                        setFamily('dates');
                        setStart(local(action.proposedStart??''));
                        setDue(local(action.proposedDue??''));
                      } else if (action?.type === 'trello_members_change') {
                        setFamily('members');
                        setMemberIds(action.proposedMembers);
                      } else if (
                        action?.type === 'trello_priority_change' ||
                        action?.type === 'trello_state_change'
                      ) {
                        setFamily(action.type === 'trello_priority_change' ? 'priority' : 'state');
                        setLabel('');
                      } else {
                        setFamily('due');
                        if (detail.requestedDue) setDue(local(detail.requestedDue));
                      }
                      setConsent(false);
                      setShowEditor(true);
                    }}
                  >
                    <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    <span>Usar esta propuesta como base del ajuste (v{(detail.version ?? 1) + 1})</span>
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Execution Panel in Trello */}
          <ExecutionPanel
            key={`${detail.proposalId}:${detail.version}`}
            project={project}
            csrfToken={csrfToken}
            proposal={detail}
            isLatest={isLatest}
            onChanged={() => {
              setNotice('');
              setRevision(value => value + 1);
            }}
          />

          {/* Historical Decisions */}
          {detail.decisions.length > 0 && (
            <section className="drawer-section-card">
              <div className="section-card-header">
                <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
                <h4>Historial de Decisiones del Gestor</h4>
              </div>

              <div className="decisions-history-list">
                {detail.decisions.map(d => (
                  <div key={d.id} className={'decision-history-item ' + d.decision}>
                    <div className="decision-history-header">
                      <span className={'decision-pill ' + d.decision}>
                        {d.decision === 'approved'
                          ? 'Aprobada'
                          : d.decision === 'rejected'
                            ? 'Rechazada'
                            : 'Ajustes solicitados'}
                      </span>
                      <span className="decision-timestamp">{date(d.createdAt)}</span>
                    </div>
                    <p className="decision-reason-text">«{d.reason || 'Sin observaciones adicionales.'}»</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          </div>
        </div>
      </aside>
    </div>
  );
}
