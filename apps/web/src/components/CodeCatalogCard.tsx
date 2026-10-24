import type {
  CodeAnalysisView,
  CodeCatalog,
  ProviderOverview,
  ReasoningEffort,
} from '@dev-project-agent/contracts';
import { AgentModelSelect } from './AgentModelSelect';
import { providerDestination } from './agentProviders';
import { ReasoningSelect } from './ReasoningSelect';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { read } from './codeReviewShared';

export function CodeCatalogCard({
  action,
  baseSha,
  busy,
  catalog,
  connected,
  consent,
  effort,
  filter,
  mode,
  model,
  paths,
  post,
  prefix,
  provider,
  providerFields,
  running,
  selectedModel,
  setActiveTab,
  setAnalysis,
  setAnalysisId,
  setBaseSha,
  setCatalog,
  setConsent,
  setEffort,
  setFilter,
  setMode,
  setModel,
  setNotice,
  setPaths,
  setShowCatalog,
  setWithAi,
  withAi,
}: {
  action: (operation: () => Promise<void>) => Promise<void>;
  baseSha: string;
  busy: boolean;
  catalog: CodeCatalog | null;
  connected: boolean;
  consent: boolean;
  effort: "" | ReasoningEffort;
  filter: string;
  mode: "files" | "comparison";
  model: string;
  paths: string[];
  post: <T>(path: string, body: Record<string, unknown>, idempotent?: boolean) => Promise<T>;
  prefix: string;
  provider: ProviderOverview | null;
  providerFields: { consent: boolean; reasoningEffort?: ReasoningEffort | undefined; model: string; };
  running: boolean | undefined;
  selectedModel: ProviderOverview['connection']['models'][number] | undefined;
  setActiveTab: Dispatch<SetStateAction<"proposals" | "analyses" | "coverage" | "publications">>;
  setAnalysis: Dispatch<SetStateAction<CodeAnalysisView | null>>;
  setAnalysisId: Dispatch<SetStateAction<string>>;
  setBaseSha: Dispatch<SetStateAction<string>>;
  setCatalog: Dispatch<SetStateAction<CodeCatalog | null>>;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setEffort: Dispatch<SetStateAction<"" | ReasoningEffort>>;
  setFilter: Dispatch<SetStateAction<string>>;
  setMode: Dispatch<SetStateAction<"files" | "comparison">>;
  setModel: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setPaths: Dispatch<SetStateAction<string[]>>;
  setShowCatalog: Dispatch<SetStateAction<boolean>>;
  setWithAi: Dispatch<SetStateAction<boolean>>;
  withAi: boolean;
}) {
  return (
    <div className="code-catalog-card">
      <div className="code-catalog-header">
        <div>
          <h3>Seleccionar código fuente de GitHub</h3>
          <p className="muted">
            Selecciona hasta 8 archivos de un commit exacto para inspeccionar su calidad y generar correcciones.
          </p>
        </div>
        <button
          type="button"
          className="proposals-refresh-btn"
          style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-base)', borderColor: 'var(--color-border)' }}
          disabled={busy || running}
          onClick={() =>
            void action(async () => {
              const value = await read<CodeCatalog>(prefix + '/catalog');
              setCatalog(value);
              setPaths([]);
              setConsent(false);
            })
          }
        >
          <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          <span>{catalog ? 'Refrescar catálogo' : 'Leer catálogo de GitHub'}</span>
        </button>
      </div>

      {catalog && (
        <div className="code-catalog-body">
          {/* Repository Metadata Chips */}
          <div className="code-repo-meta">
            <span className="code-meta-chip">
              <Icon path="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              <strong>Repositorio:</strong> {catalog.connection.owner}/{catalog.connection.repository}
            </span>
            <span className="code-meta-chip">
              <Icon path="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9" />
              <strong>Rama:</strong> <code>{catalog.connection.branch}</code>
            </span>
            <span className="code-meta-chip">
              <Icon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              <strong>Commit HEAD:</strong> <code className="content-hash">{catalog.head.slice(0, 10)}</code>
            </span>
            <span className="code-meta-chip muted-chip">
              Límites: máx {catalog.limits.files} archivos ({catalog.limits.totalBytes / 1000} KB tot)
            </span>
          </div>

          {/* File Search & Filter */}
          <div className="code-filter-row">
            <div className="code-search-box">
              <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              <input
                type="search"
                placeholder="Buscar archivo por ruta (ej: src/utils.ts)..."
                value={filter}
                onChange={event => setFilter(event.target.value)}
              />
              {filter && (
                <button type="button" className="code-search-clear" onClick={() => setFilter('')}>
                  <Icon path="M6 18L18 6M6 6l12 12" />
                </button>
              )}
            </div>
            <div className="code-selection-counter">
              <strong>{paths.length}</strong> de {catalog.limits.files} seleccionados
            </div>
          </div>

          {/* File Checklist */}
          <fieldset className="code-file-list" disabled={busy || running}>
            <legend className="sr-only">Archivos del repositorio</legend>
            {catalog.files
              .filter(file => file.path.toLowerCase().includes(filter.toLowerCase()))
              .map(file => {
                const isSelected = paths.includes(file.path);
                return (
                  <label className={`code-file-item ${isSelected ? 'selected' : ''}`} key={file.path}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelected && paths.length >= catalog.limits.files}
                      onChange={event => {
                        setPaths(prev =>
                          event.target.checked ? [...prev, file.path] : prev.filter(p => p !== file.path)
                        );
                        setConsent(false);
                      }}
                    />
                    <span className="code-file-name">
                      <code>{file.path}</code>
                    </span>
                    <span className="code-file-size">{Math.ceil(file.size / 1000)} KB</span>
                  </label>
                );
              })}
          </fieldset>
          {!catalog.files.length && (
            <p className="muted">No hay archivos admitidos dentro de los límites en este catálogo.</p>
          )}

          {/* Analysis Scope & Comparison */}
          <div className="code-scope-grid">
            <div className="editor-field">
              <label htmlFor="code-scope">Alcance del análisis</label>
              <select
                id="code-scope"
                className="editor-select"
                value={mode}
                onChange={event => {
                  setMode(event.target.value as typeof mode);
                  setConsent(false);
                }}
                disabled={busy || running}
              >
                <option value="files">Archivos seleccionados en el commit actual</option>
                <option value="comparison">Archivos seleccionados que cambiaron desde otro commit</option>
              </select>
            </div>

            {mode === 'comparison' && (
              <div className="editor-field">
                <label htmlFor="code-base">Commit anterior para comparar (SHA completo de 40 dígitos)</label>
                <input
                  id="code-base"
                  className="editor-input"
                  maxLength={40}
                  placeholder="40 caracteres hexadecimales..."
                  value={baseSha}
                  onChange={event => {
                    setBaseSha(event.target.value);
                    setConsent(false);
                  }}
                  disabled={busy || running}
                />
                <small className="editor-hint">
                  Los archivos deben figurar en la comparación. Commits idénticos no acreditan calidad.
                </small>
              </div>
            )}
          </div>

          {/* AI Analysis Integration Option */}
          <div className="code-ai-section">
            <label className="confirmation code-ai-toggle">
              <input
                type="checkbox"
                checked={withAi}
                onChange={event => {
                  setWithAi(event.target.checked);
                  setConsent(false);
                }}
                disabled={busy || running}
              />
              <span>
                <strong>Añadir revisión con Inteligencia Artificial</strong> a las comprobaciones locales deterministas
              </span>
            </label>

            {withAi && (
              <div className="code-ai-config">
                {!connected ? (
                  <div className="proposals-error-banner" style={{ marginTop: '10px' }}>
                    <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <span>
                      Conecta ChatGPT o inicia Ollama en Configuración para activar el análisis con IA.
                      Las comprobaciones locales estáticas están disponibles de inmediato sin conexión externa.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="editor-model-row" style={{ marginTop: '10px' }}>
                      <AgentModelSelect
                        id="code-model"
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
                        id="code-effort"
                        model={selectedModel}
                        value={effort}
                        onChange={val => {
                          setEffort(val);
                          setConsent(false);
                        }}
                        disabled={busy || running || !connected}
                      />
                    </div>

                    <label className="editor-consent-box" style={{ marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={event => setConsent(event.target.checked)}
                        disabled={busy || running || !connected}
                      />
                      <span>
                        Autorizo enviar a <strong>{providerDestination(model)}</strong> el contenido de los archivos
                        seleccionados para este análisis.
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Launch Analysis Action */}
          <div className="code-catalog-actions">
            <button
              type="button"
              className="editor-submit-btn"
              disabled={
                busy ||
                running ||
                !paths.length ||
                (mode === 'comparison' && !/^[a-f0-9]{40}$/.test(baseSha)) ||
                (withAi && (!connected || !consent || !model))
              }
              onClick={() =>
                void action(async () => {
                  const result = await post<{ id: string }>('/analyses', {
                    paths,
                    expectedHead: catalog.head,
                    mode,
                    ...(mode === 'comparison' ? { baseSha } : {}),
                    withAi,
                    ...(withAi ? providerFields : {}),
                  });
                  setAnalysisId(result.id);
                  setAnalysis(null);
                  setConsent(false);
                  setShowCatalog(false);
                  setActiveTab('analyses');
                  setNotice('Análisis guardado. Consulta el resultado y sus límites.');
                })
              }
            >
              <Icon path="m8 7-5 5 5 5 m8-10 5 5-5 5 m-3-14-2 18" />
              <span>Analizar código seleccionado ({paths.length} archivos)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
