import { useEffect, useState, type FormEvent } from 'react';
import type { SessionResponse, ProjectRole } from '@dev-project-agent/contracts';
import {Workspace, Icon} from './Workspace';
import {OverviewPage} from './OverviewPage';
import {PlanningPage} from './PlanningPage';
import {AlertsPage} from './AlertsPage';
import {SettingsPage} from './SettingsPage';
import {NotificationSettings} from './NotificationSettings';
import {AppearanceSettings} from './AppearanceSettings';
import {OperationsSettings} from './OperationsSettings';
import {TrackingSettings} from './TrackingSettings';
import { ProviderPanel } from './ProviderPanel';
import { OllamaPanel } from './OllamaPanel';
import {CodeReviewPanel} from './CodeReviewPanel';
import {ReportsPanel} from './ReportsPanel';
import { ProposalPanel } from './ProposalPanel';
import { OperationsPage } from './OperationsPage';

interface Member { id: string; displayName: string; role: ProjectRole }

async function readResponse(response: Response): Promise<SessionResponse> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'No se pudo completar la solicitud.');
  return body as SessionResponse;
}

export function SessionPanel() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [memberError, setMemberError] = useState('');
  const [sourceRevision,setSourceRevision]=useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSession(null);
    setError('');
    void fetch('/api/v1/session', { signal: controller.signal, credentials: 'same-origin' })
      .then(readResponse).then(setSession)
      .catch(() => { if (!controller.signal.aborted) setError('No se pudo comprobar tu sesión. Vuelve a intentar.'); });
    return () => controller.abort();
  }, [attempt]);

  const projectId = session?.authenticated ? session.project?.id : undefined;
  const canManage = session?.authenticated && session.project?.canManageProject;
  useEffect(() => {
    setMembers(null);
    setMemberError('');
    if (!projectId || !canManage) return;
    const controller = new AbortController();
    void fetch(`/api/v1/projects/${projectId}/members`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to read members.');
        return response.json() as Promise<{ members: Member[] }>;
      }).then(body => setMembers(body.members))
      .catch(() => { if (!controller.signal.aborted) setMemberError('No se pudo cargar el equipo.'); });
    return () => controller.abort();
  }, [projectId, canManage]);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/session/${session.authenticated ? 'logout' : 'login'}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { ...(!session.authenticated ? { 'Content-Type': 'application/json' } : {}), 'x-csrf-token': session.csrfToken },
        ...(session.authenticated ? {} : { body: JSON.stringify({ login: login.trim(), password }) }),
      });
      if (response.status === 204) { setSession(null); setAttempt(value => value + 1); }
      else if (response.status === 403) {
        setSession(await fetch('/api/v1/session', { credentials: 'same-origin' }).then(readResponse));
        setError('La sesión cambió. Vuelve a intentar.');
      } else setSession(await readResponse(response));
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : 'No se pudo completar la solicitud.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  if(session?.authenticated&&session.project)return <><Workspace session={session} logout={()=>void submit()} render={(page,project)=>{
    const props={project,csrfToken:session.csrfToken};
    if(page==='overview')return <OverviewPage project={project}/>;
    if(page==='planning')return <PlanningPage key={sourceRevision} project={project}/>;
    if(page==='alerts')return <AlertsPage {...props}/>;
    if(page==='proposals')return <ProposalPanel {...props} sourceRevision={sourceRevision}/>;
    if(page==='code')return <CodeReviewPanel {...props}/>;
    if(page==='reports')return <ReportsPanel {...props}/>;
    if(page==='operations')return <OperationsPage {...props} onCompleted={()=>setSourceRevision(value=>value+1)}/>;
    return (
      <SettingsPage>
        {{
          integrations: (
            <>
              <ProviderPanel {...props} />
              <OllamaPanel {...props} />
            </>
          ),
          tracking: (
            <div className="proposal-editor-card">
              <header className="editor-card-header">
                <div className="editor-header-title">
                  <div className="editor-icon-badge">
                    <Icon path="M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6" />
                  </div>
                  <div>
                    <h3>Políticas y Reglas del Proyecto</h3>
                    <p>
                      Configura los umbrales de vencimiento, frescura de lecturas y equivalencias de etiquetas de Trello.
                    </p>
                  </div>
                </div>
              </header>
              <div className="editor-card-body">
                <TrackingSettings
                  projectId={project.id}
                  canManage={project.canManageProject}
                  csrfToken={session.csrfToken}
                  onSaved={() => setSourceRevision(value => value + 1)}
                />
              </div>
            </div>
          ),
          automation: (
            <>
              <OperationsSettings {...props} mode="configuration" />
              <ReportsPanel {...props} configurationOnly />
            </>
          ),
          notifications: <NotificationSettings {...props} />,
          appearance: <AppearanceSettings />,
          team: (
            <div className="proposal-editor-card">
              <header className="editor-card-header">
                <div className="editor-header-title">
                  <div className="editor-icon-badge">
                    <Icon path="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
                  </div>
                  <div>
                    <h3>Equipo con Acceso al Proyecto</h3>
                    <p>Personas registradas con permisos de supervisión, consulta o gestión del proyecto.</p>
                  </div>
                </div>
              </header>
              <div className="editor-card-body">
                {memberError && <p role="alert" className="form-error">{memberError}</p>}
                {members ? (
                  <div className="member-grid">
                    {members.map(member => (
                      <div className="member-card" key={member.id}>
                        <span className="profile-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
                        <div className="member-info">
                          <strong>{member.displayName}</strong>
                          <span className={`member-role-badge ${member.role === 'manager' ? 'is-manager' : 'is-viewer'}`}>
                            {member.role === 'manager' ? 'Gestor' : 'Consulta'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    {project.canManageProject ? 'Cargando equipo…' : 'La administración del equipo corresponde al gestor.'}
                  </p>
                )}
              </div>
            </div>
          ),
        }}
      </SettingsPage>
    );
  }}/>{error&&<div className="global-notice" role="alert">{error}</div>}</>;
  return <main className="login-layout"><div className="login-story"><a className="workspace-brand" href="#overview"><img src="/favicon.jpg" alt="Dev Project Agent" className="brand-mark"/><span>Dev Project Agent</span></a><div><p className="eyebrow">CLARIDAD PARA DECIDIR</p><h1>Tu proyecto,<br/>bajo control.</h1><p>Comprende el avance, anticipa los riesgos y revisa cada propuesta con evidencia.</p><div className="login-points"><p>01 <span>Planificación conectada con Trello</span></p><p>02 <span>Revisión de código y recomendaciones</span></p><p>03 <span>Decisiones humanas, trazabilidad completa</span></p></div></div><small>Dev Project Agent · Seguimiento de proyectos de software</small></div><div className="login-content"><section aria-labelledby="session-title">
    <h2 id="session-title">{session?.authenticated ? 'Tu proyecto' : 'Iniciar sesión'}</h2>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!session && (error
      ? <button onClick={() => setAttempt(value => value + 1)}>Reintentar acceso</button>
      : <p role="status">Comprobando sesión…</p>)}
    {session && !session.authenticated && <>
      <p className="muted">Ingresa con la cuenta habilitada para tu proyecto.</p>
      <form className="login-form" onSubmit={event => void submit(event)}>
        <div className="input-group">
          <label htmlFor="login">Usuario</label>
          <input id="login" name="username" autoComplete="username" required minLength={3} maxLength={64}
            pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*" value={login} onChange={event => setLogin(event.target.value)} disabled={busy} placeholder="tu_usuario" />
        </div>
        <div className="input-group">
          <label htmlFor="password">Contraseña</label>
          <div className="password-wrapper">
            <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128}
              value={password} onChange={event => setPassword(event.target.value)} disabled={busy} placeholder="••••••••••••" />
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                  <line x1="2" y1="2" x2="22" y2="22"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
        </div>
        <button disabled={busy} type="submit">{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </>}
    {session?.authenticated && <>
      <p>Hola, <strong>{session.user.displayName}</strong>.</p>
      {session.project ? <>
        <p><strong>{session.project.name}</strong> <span className="badge">{session.project.role === 'manager' ? 'Gestor' : 'Consulta'}</span></p>
        <p className="muted">{canManage ? 'Puedes solicitar supervisiones y administrar la configuración del proyecto.' : 'Tu acceso permite consultar el proyecto.'}</p>
        {canManage && <div aria-labelledby="team-title">
          <h3 id="team-title">Equipo con acceso</h3>
          {memberError && <p role="alert" className="form-error">{memberError}</p>}
          {!members && !memberError && <p role="status">Cargando equipo…</p>}
          {members && <ul>{members.map(member => <li key={member.id}>{member.displayName} · {member.role === 'manager' ? 'Gestor' : 'Consulta'}</li>)}</ul>}
        </div>}
      </> : <p role="alert">Tu cuenta no tiene acceso activo a un proyecto. Contacta al gestor.</p>}
      <button disabled={busy} onClick={() => void submit()}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </>}
  </section>

  </div></main>;
}
