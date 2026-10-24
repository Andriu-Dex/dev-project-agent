import { RecoveryPanel } from './RecoveryPanel';
import type {
  CodeOverview,
  CodePublicationView,
  ProjectAccess,
} from '@dev-project-agent/contracts';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { getStateConfig, explain, dates } from './codeReviewShared';

export function CodePublicationsTab({
  action,
  busy,
  csrfToken,
  overview,
  paginatedPubs,
  post,
  project,
  pubsList,
  refresh,
  safePubsPage,
  setPubsPage,
  totalPubsPages,
}: {
  action: (operation: () => Promise<void>) => Promise<void>;
  busy: boolean;
  csrfToken: string;
  overview: CodeOverview | null;
  paginatedPubs: CodePublicationView[];
  post: <T>(path: string, body: Record<string, unknown>, idempotent?: boolean) => Promise<T>;
  project: ProjectAccess;
  pubsList: CodePublicationView[];
  refresh: (signal?: AbortSignal | undefined) => Promise<void>;
  safePubsPage: number;
  setPubsPage: Dispatch<SetStateAction<number>>;
  totalPubsPages: number;
}) {
  return (
    <div className="code-analyses-list-card">
      <div className="code-catalog-header">
        <div>
          <h3>Historial de Publicaciones y Pull Requests en GitHub</h3>
          <p className="muted">
            Registro de ramas y PRs creados hacia develop. Toda integración en UTAPED requiere revisión humana externa.
          </p>
        </div>
      </div>

      {!overview?.publications.length ? (
        <div className="proposals-empty-state">
          <div className="empty-icon-shield">
            <Icon path="M18 15a3 3 0 1 0-2.82-2H15a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2H9.82A3 3 0 1 0 9 22a3 3 0 0 0 2.82-2H11a4 4 0 0 0 4-4v-3a4 4 0 0 1 1.17-2.83A3 3 0 0 0 18 15z M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          </div>
          <h3>Sin publicaciones ni PRs</h3>
          <p>Aún no hay publicaciones ni simulaciones registradas en este proyecto.</p>
        </div>
      ) : (
        <div className="code-publications-grid">
          {paginatedPubs.map(item => {
            const conf = getStateConfig(item.status);
            return (
              <article className="code-publication-card" key={item.id}>
                <header className="code-publication-header">
                  <div className="code-publication-title-group">
                    <span className={'proposal-status-badge ' + conf.badgeClass}>
                      <Icon path={conf.icon} />
                      <span>{item.status === 'simulated' ? 'Simulación' : 'Publicación'}</span>
                    </span>
                    <span className="proposal-version-chip">v{item.version}</span>
                  </div>
                  <span className="proposal-card-date">{dates(item.createdAt)}</span>
                </header>

                <div className="code-publication-body">{item.status==='succeeded'&&<RecoveryPanel project={project} csrfToken={csrfToken} originalId={item.id} target="github" onChanged={()=>void refresh()}/>}
                  <p className="code-pub-status-msg">
                    {item.status === 'simulated'
                      ? 'No se creó ninguna rama, commit ni PR real en GitHub.'
                      : item.status === 'succeeded'
                        ? 'Rama y PR verificados en GitHub. Integración humana pendiente.'
                        : conf.label}
                  </p>

                  <div className="code-pub-branch-box">
                    <Icon path="M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9a9 9 0 0 1-9 9" />
                    <span>Rama:</span>
                    <code>{item.branch}</code>
                  </div>

                  {item.errorCode && (
                    <div className="proposals-error-banner" style={{ margin: '8px 0', padding: '8px 12px' }}>
                      <span>{explain(item.errorCode)}</span>
                    </div>
                  )}

                  {item.pullUrl && (
                    <div className="code-pub-link-box">
                      <a
                        href={item.pullUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="editor-submit-btn"
                        style={{ textDecoration: 'none', display: 'inline-flex' }}
                      >
                        <Icon path="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        <span>Abrir PR en GitHub para revisión humana</span>
                      </a>
                    </div>
                  )}

                  {item.status === 'reconciliation_required' && project.canManageProject && (
                    <button
                      type="button"
                      className="editor-cancel-btn"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await post('/publications/' + item.id + '/reconcile', {}, false);
                        })
                      }
                    >
                      <span>Consultar resultado sin repetir escrituras</span>
                    </button>
                  )}

                  {/* Preserved Publication Plan Accordion */}
                  {item.plan && (
                    <details className="code-pub-plan-details">
                      <summary>Ver plan de publicación conservado</summary>
                      <div className="code-pub-plan-content">
                        <p>
                          <strong>Destino:</strong> {item.plan.repository} · Rama base:{' '}
                          <code>{item.plan.baseBranch}</code> · Commit base:{' '}
                          <code>{item.plan.baseSha.slice(0, 10)}</code>
                        </p>
                        <p className="content-hash">
                          Sello del contenido: {item.plan.contentHash}
                        </p>
                        <ul>
                          {item.plan.files.map(file => (
                            <li key={file.path}>
                              <code>{file.path}</code> · Blobs: {file.beforeBlob.slice(0, 8)} →{' '}
                              {file.afterBlob.slice(0, 8)}
                            </li>
                          ))}
                        </ul>
                        <pre className="code-block">{item.plan.title + '\n\n' + item.plan.body}</pre>
                      </div>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination for publications */}
      {pubsList.length > 0 && totalPubsPages > 1 && (
        <footer className="planning-pagination-bar" style={{ marginTop: '16px', borderRadius: '8px' }}>
          <div className="pagination-summary">
            <span>Pág. {safePubsPage} de {totalPubsPages}</span>
          </div>
          <nav className="pagination-pages-nav" aria-label="Páginas">
            <button
              type="button"
              className="pagination-arrow-btn"
              disabled={safePubsPage <= 1}
              onClick={() => setPubsPage(p => Math.max(1, p - 1))}
            >
              <Icon path="M15 19l-7-7 7-7" />
            </button>
            <button
              type="button"
              className="pagination-arrow-btn"
              disabled={safePubsPage >= totalPubsPages}
              onClick={() => setPubsPage(p => Math.min(totalPubsPages, p + 1))}
            >
              <Icon path="M9 5l7 7-7 7" />
            </button>
          </nav>
        </footer>
      )}
    </div>
  );
}
