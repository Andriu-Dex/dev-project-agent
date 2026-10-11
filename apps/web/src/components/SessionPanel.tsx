import { useEffect, useState, type FormEvent } from 'react';
import type { SessionResponse, ProjectRole } from '@dev-project-agent/contracts';
import { TrelloPanel } from './TrelloPanel';
import { SupervisionPanel } from './SupervisionPanel';
import { ProviderPanel } from './ProviderPanel';
import { ProposalPanel } from './ProposalPanel';

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

  return <><section aria-labelledby="session-title">
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
    {session?.authenticated && session.project && <>
      <ProviderPanel key={'provider:'+session.project.id} project={session.project} csrfToken={session.csrfToken}/>
      <SupervisionPanel key={session.project.id} project={session.project} csrfToken={session.csrfToken} onCompleted={()=>setSourceRevision(value=>value+1)}/>
      <ProposalPanel key={'proposals:'+session.project.id} project={session.project} csrfToken={session.csrfToken} sourceRevision={sourceRevision}/>
      <TrelloPanel key={`${session.project.id}:${sourceRevision}`} project={session.project} csrfToken={session.csrfToken} />
    </>}
  </>;
}
