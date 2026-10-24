import type {
  CodeAnalysisView,
  CodeCatalog,
  CodeOverview,
  CodeProposalView,
  ProjectAccess,
  ProviderOverview,
  ReasoningEffort,
} from '@dev-project-agent/contracts';
import { AgentModelSelect } from './AgentModelSelect';
import { providerDestination } from './agentProviders';
import { ReasoningSelect, effortLabels } from './ReasoningSelect';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig, categories, severityLabels, checks, explain, dates, read } from './codeReviewShared';

export function CodeAnalysesTab({
  action,
  analysesList,
  analysis,
  analysisId,
  busy,
  canPrepare,
  catalog,
  connected,
  consent,
  current,
  detail,
  effort,
  findingIds,
  goal,
  model,
  overview,
  paginatedAnalyses,
  prefix,
  prepare,
  project,
  provider,
  purpose,
  running,
  safeAnalysesPage,
  selectedModel,
  setAnalysesPage,
  setAnalysis,
  setAnalysisId,
  setCatalog,
  setConsent,
  setEffort,
  setFindingIds,
  setGoal,
  setModel,
  setPaths,
  setPurpose,
  setShowCatalog,
  totalAnalysesPages,
}: {
  action: (operation: () => Promise<void>) => Promise<void>;
  analysesList: Omit<CodeAnalysisView, "source" | "result">[];
  analysis: CodeAnalysisView | null;
  analysisId: string;
  busy: boolean;
  canPrepare: boolean;
  catalog: CodeCatalog | null;
  connected: boolean;
  consent: boolean;
  current: boolean | null;
  detail: CodeProposalView | null;
  effort: "" | ReasoningEffort;
  findingIds: string[];
  goal: string;
  model: string;
  overview: CodeOverview | null;
  paginatedAnalyses: Omit<CodeAnalysisView, "source" | "result">[];
  prefix: string;
  prepare: (newVersion?: boolean) => Promise<void>;
  project: ProjectAccess;
  provider: ProviderOverview | null;
  purpose: "demonstration" | "live";
  running: boolean | undefined;
  safeAnalysesPage: number;
  selectedModel: ProviderOverview['connection']['models'][number] | undefined;
  setAnalysesPage: Dispatch<SetStateAction<number>>;
  setAnalysis: Dispatch<SetStateAction<CodeAnalysisView | null>>;
  setAnalysisId: Dispatch<SetStateAction<string>>;
  setCatalog: Dispatch<SetStateAction<CodeCatalog | null>>;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setEffort: Dispatch<SetStateAction<"" | ReasoningEffort>>;
  setFindingIds: Dispatch<SetStateAction<string[]>>;
  setGoal: Dispatch<SetStateAction<string>>;
  setModel: Dispatch<SetStateAction<string>>;
  setPaths: Dispatch<SetStateAction<string[]>>;
  setPurpose: Dispatch<SetStateAction<"demonstration" | "live">>;
  setShowCatalog: Dispatch<SetStateAction<boolean>>;
  totalAnalysesPages: number;
}) {
  return (
    <div className="code-analyses-list-card">
      <div className="code-catalog-header">
        <div>
          <h3>Historial de Análisis de Código</h3>
          <p className="muted">
            Auditorías estáticas y mediante IA sobre commits guardados. Haz clic en cualquiera para abrir sus hallazgos.
          </p>
        </div>
        {project.canManageProject && (
          <button
            type="button"
            className="proposals-new-btn"
            onClick={() => {
              setShowCatalog(true);
              if (!catalog) {
                void action(async () => {
                  const val = await read<CodeCatalog>(prefix + '/catalog');
                  setCatalog(val);
                  setPaths([]);
                });
              }
            }}
          >
            <Icon path="M12 5v14 M5 12h14" />
            <span>Nuevo análisis</span>
          </button>
        )}
      </div>

      {!overview?.analyses.length ? (
        <div className="proposals-empty-state">
          <div className="empty-icon-shield">
            <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </div>
          <h3>Sin análisis guardados</h3>
          <p>Aún no hay análisis de código registrados en este proyecto.</p>
        </div>
      ) : (
        <div className="code-analyses-table-wrap">
          <table className="code-analyses-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Modelo de análisis</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAnalyses.map(item => {
                const conf = getStateConfig(item.status);
                const isSelected = analysisId === item.id;
                return (
                  <tr key={item.id} className={isSelected ? 'selected-row' : ''}>
                    <td>{dates(item.createdAt)}</td>
                    <td>
                      <span className={'proposal-status-badge ' + conf.badgeClass}>
                        <Icon path={conf.icon} />
                        <span>{conf.label}</span>
                      </span>
                      {item.errorCode && (
                        <small className="form-error block-error">{explain(item.errorCode)}</small>
                      )}
                    </td>
                    <td>
                      <code>{item.model ?? 'Comprobaciones locales'}</code>
                      {item.reasoningEffort && (
                        <small className="muted block-sub">
                          Esfuerzo: {effortLabels[item.reasoningEffort]}
                        </small>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="proposal-detail-trigger-btn"
                        disabled={busy}
                        onClick={() => {
                          setAnalysisId(item.id);
                          setAnalysis(null);
                        }}
                      >
                        <span>{isSelected ? 'Cerrar vista' : 'Examinar hallazgos'}</span>
                        <Icon path={isSelected ? 'M6 18L18 6M6 6l12 12' : 'M9 5l7 7-7 7'} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination for analyses */}
      {analysesList.length > 0 && totalAnalysesPages > 1 && (
        <footer className="planning-pagination-bar" style={{ marginTop: '16px', borderRadius: '8px' }}>
          <div className="pagination-summary">
            <span>Pág. {safeAnalysesPage} de {totalAnalysesPages}</span>
          </div>
          <nav className="pagination-pages-nav" aria-label="Páginas">
            <button
              type="button"
              className="pagination-arrow-btn"
              disabled={safeAnalysesPage <= 1}
              onClick={() => setAnalysesPage(p => Math.max(1, p - 1))}
            >
              <Icon path="M15 19l-7-7 7-7" />
            </button>
            <button
              type="button"
              className="pagination-arrow-btn"
              disabled={safeAnalysesPage >= totalAnalysesPages}
              onClick={() => setAnalysesPage(p => Math.min(totalAnalysesPages, p + 1))}
            >
              <Icon path="M9 5l7 7-7 7" />
            </button>
          </nav>
        </footer>
      )}

      {/* Selected Analysis Detail Section */}
      {analysis && (
        <div className="code-analysis-detail-card" id="active-analysis-detail">
          <header className="code-analysis-detail-header">
            <div>
              <div className="proposal-meta-top">
                <span className={'proposal-status-badge ' + getStateConfig(analysis.status).badgeClass}>
                  <Icon path={getStateConfig(analysis.status).icon} />
                  <span>{getStateConfig(analysis.status).label}</span>
                </span>
                <span className="code-meta-chip">
                  {dates(analysis.createdAt)}
                </span>
                <span className="code-meta-chip">
                  {analysis.model ?? 'Comprobaciones locales estáticas'}
                </span>
              </div>
              <h3>Resultados de la auditoría de código</h3>
            </div>
            <button
              type="button"
              className="editor-cancel-btn"
              onClick={() => setAnalysisId('')}
            >
              <Icon path="M6 18L18 6M6 6l12 12" />
              <span>Cerrar análisis</span>
            </button>
          </header>

          {/* Source commit and files info */}
          {analysis.source && (
            <div className="code-analysis-source-box">
              <p>
                <strong>Commit analizado:</strong>{' '}
                <code className="content-hash">{analysis.source.head}</code> ·{' '}
                <strong>Rama:</strong> <code>{analysis.source.connection.branch}</code> ·{' '}
                <strong>{analysis.source.files.length}</strong>{' '}
                {analysis.source.files.length === 1 ? 'archivo' : 'archivos'}
              </p>
              <details className="code-source-files-details">
                <summary>Ver código fuente y evidencia de los archivos analizados</summary>
                <div className="code-source-files-list">
                  {analysis.source.files.map(file => (
                    <details key={file.path} className="code-source-file-block">
                      <summary>
                        <code>{file.path}</code> · SHA: <code>{file.blobSha.slice(0, 10)}</code>
                      </summary>
                      <pre className="code-block">{file.content}</pre>
                    </details>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Checks & Summary */}
          {analysis.result && (
            <div className="code-analysis-result-body">
              <div className="code-analysis-summary-banner">
                <p>{analysis.result.summary}</p>
              </div>

              {/* Automated checks */}
              <div className="code-checks-section">
                <h4>Comprobaciones deterministas ({analysis.result.checks.length})</h4>
                <div className="code-checks-grid">
                  {analysis.result.checks.map((check, index) => (
                    <div key={index} className={`code-check-card ${check.status}`}>
                      <div className="code-check-header">
                        <span className="code-check-path"><code>{check.path}</code></span>
                        <span className={`code-check-badge ${check.status}`}>
                          {checks[check.status]}
                        </span>
                      </div>
                      <p className="code-check-msg">{check.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Findings Explorer */}
              <div className="code-findings-section">
                <h4>
                  Hallazgos detectados ({analysis.result.findings.length})
                </h4>
                {!analysis.result.findings.length ? (
                  <div className="proposals-success-banner">
                    <Icon path="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    <span>
                      No se encontraron hallazgos negativos dentro de este alcance delimitado. Esto no acredita
                      la calidad del proyecto completo ni sustituye la revisión humana.
                    </span>
                  </div>
                ) : (
                  <div className="code-findings-grid">
                    {analysis.result.findings.map(item => {
                      const isSelectedFinding = findingIds.includes(item.id);
                      return (
                        <article
                          className={`code-finding-card ${isSelectedFinding ? 'selected' : ''}`}
                          key={item.id}
                        >
                          <header className="code-finding-header">
                            <div className="code-finding-tags">
                              <span
                                className={`finding-severity-badge severity-${item.severity}`}
                              >
                                Severidad {severityLabels[item.severity]}
                              </span>
                              <span className="finding-category-badge">
                                {categories[item.category] ?? item.category}
                              </span>
                              <span className="finding-confidence-badge">
                                {item.confidence === 'confirmed' ? 'Confirmado' : 'Hipótesis'}
                              </span>
                            </div>
                            <span className="finding-location">
                              <code>{item.path}:{item.startLine}–{item.endLine}</code>
                            </span>
                          </header>

                          <h5 className="code-finding-title">{item.title}</h5>
                          <p className="code-finding-explanation">{item.explanation}</p>

                          {item.evidence && (
                            <div className="code-finding-evidence">
                              <span className="evidence-label">Evidencia observada:</span>
                              <pre className="code-block">{item.evidence}</pre>
                            </div>
                          )}

                          <div className="code-finding-recommendation">
                            <strong>Recomendación:</strong> {item.recommendation}
                          </div>

                          {project.canManageProject && (
                            <label className="confirmation code-finding-select-toggle">
                              <input
                                type="checkbox"
                                checked={isSelectedFinding}
                                disabled={
                                  busy ||
                                  running ||
                                  (!isSelectedFinding && findingIds.length >= 10)
                                }
                                onChange={event => {
                                  setFindingIds(prev =>
                                    event.target.checked
                                      ? [...prev, item.id]
                                      : prev.filter(id => id !== item.id)
                                  );
                                  setConsent(false);
                                }}
                              />
                              <span>
                                {isSelectedFinding
                                  ? 'Hallazgo seleccionado para corrección'
                                  : 'Seleccionar este hallazgo para corregir con los 3 agentes'}
                              </span>
                            </label>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Limitations */}
              {analysis.result.limitations.length > 0 && (
                <div className="code-limitations-section">
                  <h4>Límites y restricciones de esta revisión</h4>
                  <ul className="code-limitations-list">
                    {analysis.result.limitations.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Correction Creator from Findings */}
              {project.canManageProject && analysis.result.findings.length > 0 && (
                <div className="code-correction-creator-card">
                  <div className="code-creator-header">
                    <h4>Preparar corrección con los 3 Agentes de IA</h4>
                    <p className="muted">
                      Los 3 agentes (Ejecutor, Revisor, Aprobador) colaborarán secuencialmente para generar un parche
                      delimitado sobre los hallazgos seleccionados ({findingIds.length} seleccionados).
                    </p>
                  </div>

                  <div className="editor-grid">
                    <div className="editor-field">
                      <label htmlFor="code-purpose">Propósito de la corrección</label>
                      <select
                        id="code-purpose"
                        className="editor-select"
                        value={purpose}
                        disabled={busy || running}
                        onChange={event => {
                          setPurpose(event.target.value as typeof purpose);
                          setConsent(false);
                        }}
                      >
                        <option value="demonstration">Demostración (sin publicar)</option>
                        <option value="live">Uso real (creará rama y PR tras tu aprobación)</option>
                      </select>
                    </div>
                  </div>

                  <div className="editor-model-row" style={{ marginTop: '14px' }}>
                    <AgentModelSelect
                      id="code-model-prepare"
                      models={provider?.connection.models ?? []}
                      value={model}
                      onChange={val => {
                        setModel(val);
                        setEffort('');
                        setConsent(false);
                      }}
                      disabled={busy || running || !connected}
                    />

                    <ReasoningSelect
                      id="code-effort-prepare"
                      model={selectedModel}
                      value={effort}
                      onChange={val => {
                        setEffort(val);
                        setConsent(false);
                      }}
                      disabled={busy || running || !connected}
                    />
                  </div>

                  <div className="editor-field full-width" style={{ marginTop: '14px' }}>
                    <label htmlFor="code-goal">Objetivo y comportamiento esperado de la corrección</label>
                    <textarea
                      id="code-goal"
                      className="editor-textarea"
                      maxLength={1000}
                      rows={3}
                      value={goal}
                      onChange={event => {
                        setGoal(event.target.value);
                        setConsent(false);
                      }}
                      disabled={busy || running}
                      placeholder="Indica qué hallazgo deseas corregir y el comportamiento esperado, sin credenciales..."
                    />
                    <div className="textarea-footer">
                      <span className="char-count">{goal.length}/1000</span>
                    </div>
                  </div>

                  <label className="editor-consent-box" style={{ marginTop: '12px' }}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={event => setConsent(event.target.checked)}
                      disabled={busy || running || !connected}
                    />
                    <span>
                      Autorizo enviar a <strong>{providerDestination(model)}</strong> el código de los hallazgos seleccionados y el objetivo de esta solicitud.
                    </span>
                  </label>

                  <div className="editor-actions-row">
                    {current && detail && ['changes_requested', 'invalidated', 'execution_failed'].includes(detail.state) && (
                      <button
                        type="button"
                        className="editor-cancel-btn"
                        disabled={!canPrepare}
                        onClick={() => void action(() => prepare(true))}
                      >
                        <Icon path="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        <span>Preparar nueva versión</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="editor-submit-btn"
                      disabled={!canPrepare}
                      onClick={() => void action(() => prepare())}
                    >
                      <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      <span>Preparar corrección con los tres agentes</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
