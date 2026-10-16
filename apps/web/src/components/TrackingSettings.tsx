import {useUnsavedChanges} from '../hooks/useUnsavedChanges';
import { useEffect, useState, type FormEvent } from 'react';
import type { TrackingPolicyResponse } from '@dev-project-agent/contracts';

export function TrackingSettings({ projectId, canManage, csrfToken, onSaved }: {
  projectId: string; canManage: boolean; csrfToken: string; onSaved: () => void;
}) {
  const [configuration, setConfiguration] = useState<TrackingPolicyResponse | null>(null);
  const [dueHours, setDueHours] = useState('');
  const [staleMinutes, setStaleMinutes] = useState('');
  const [priority, setPriority] = useState(''), [blocked, setBlocked] = useState(''), [states, setStates] = useState('');
  const encode = (values: Record<string,string>) => Object.entries(values).map(([label,value]) => `${label} = ${value}`).join('\n');
  const decode = (value: string) => Object.fromEntries(value.split('\n').filter(line => line.trim()).map(line => {
    const separator = line.lastIndexOf('=');
    if (separator < 1) throw new Error('Cada línea debe tener el formato etiqueta = valor.');
    return [line.slice(0,separator).trim(),line.slice(separator+1).trim()];
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dirty=!!configuration&&(dueHours!==String(configuration.dueSoonHours)||staleMinutes!==String(configuration.staleAfterMinutes)||priority!==encode(configuration.priorityLabels??{})||blocked!==(configuration.blockedLabels??[]).join('\n')||states!==encode(configuration.stateLabels??{}));
  useUnsavedChanges(dirty,'Seguimiento');
  const path = `/api/v1/projects/${projectId}/tracking-policy`;
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setConfiguration(null);
    void fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to read tracking policy.');
      return response.json() as Promise<TrackingPolicyResponse>;
    }).then(value => {
      if (controller.signal.aborted) return;
      setConfiguration(value); setDueHours(String(value.dueSoonHours)); setStaleMinutes(String(value.staleAfterMinutes));
      setPriority(encode(value.priorityLabels ?? {})); setBlocked((value.blockedLabels ?? []).join('\n')); setStates(encode(value.stateLabels ?? {}));
    }).catch(() => { if (!controller.signal.aborted) setError('No se pudo cargar la configuración.'); });
    return () => controller.abort();
  }, [path, attempt]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ expectedVersion: configuration.version, dueSoonHours: Number(dueHours), staleAfterMinutes: Number(staleMinutes), priorityLabels: decode(priority), blockedLabels: blocked.split('\n').map(line => line.trim()).filter(Boolean), stateLabels: decode(states) }) });
      const value = await response.json();
      if (!response.ok) { setError(value.message ?? 'No se pudo guardar la configuración.'); return; }
      setConfiguration(value as TrackingPolicyResponse);
      setMessage('Configuración guardada. La evaluación se actualiza con los nuevos valores.');
      onSaved();
    } catch (failure) { setError(failure instanceof Error && failure.message.startsWith('Cada línea') ? failure.message : 'No se pudo confirmar el guardado. Recarga la configuración antes de volver a intentar.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="tracking-settings tracking-settings-panel">
      {error && <p role="alert" className="form-error settings-alert">{error}</p>}
      {message && <p role="status" className="settings-notice">{message}</p>}
      {!configuration && !error && <p role="status" className="muted">Cargando configuración…</p>}
      {configuration && (
        <>
          <div className="settings-meta-bar">
            <div className="meta-left">
              <span className="badge">Versión {configuration.version}</span>
              <span className="muted">
                {new Date(configuration.changedAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} · {configuration.changedBy?.displayName ?? 'Configuración inicial'}
              </span>
            </div>
            <button
              type="button"
              className="header-action-button"
              disabled={busy}
              onClick={() => { setMessage(''); setAttempt(value => value + 1); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>Recargar configuración</span>
            </button>
          </div>

          {!configuration.confirmed && (
            <div className="settings-notice-box">
              <p>Valores iniciales. El gestor puede ajustarlos y guardarlos para confirmar la configuración del proyecto.</p>
            </div>
          )}

          {canManage ? (
            <form className="tracking-settings-form" onSubmit={event => void save(event)}>
              <div className="settings-section-card">
                <h4 className="settings-card-title">Umbrales temporales</h4>
                <div className="settings-form-row">
                  <div className="form-field">
                    <label htmlFor="due-hours">Próximos vencimientos (horas)</label>
                    <input
                      id="due-hours"
                      type="number"
                      min={1}
                      max={720}
                      step={1}
                      required
                      value={dueHours}
                      disabled={busy}
                      onChange={event => setDueHours(event.target.value)}
                    />
                    <small>Ventana de anticipación (1 a 720 horas).</small>
                  </div>
                  <div className="form-field">
                    <label htmlFor="stale-minutes">Lectura desactualizada después de (minutos)</label>
                    <input
                      id="stale-minutes"
                      type="number"
                      min={1}
                      max={10080}
                      step={1}
                      required
                      value={staleMinutes}
                      disabled={busy}
                      onChange={event => setStaleMinutes(event.target.value)}
                    />
                    <small>Antigüedad máxima admisible (hasta 10 080 min).</small>
                  </div>
                </div>
              </div>

              <div className="settings-section-card">
                <h4 className="settings-card-title">Mapeo de etiquetas en Trello</h4>
                <p className="settings-card-desc">Asocia las etiquetas de tus tarjetas con los criterios de supervisión.</p>
                <div className="settings-form-grid-3">
                  <div className="form-field">
                    <label htmlFor="priority-labels">Etiquetas de prioridad</label>
                    <textarea
                      id="priority-labels"
                      rows={3}
                      value={priority}
                      disabled={busy}
                      onChange={event => setPriority(event.target.value)}
                      placeholder={'ALTA = high\nMEDIA = medium\nBAJA = low'}
                    />
                    <small>Una por línea. Valores: <code>high</code>, <code>medium</code>, <code>low</code>.</small>
                  </div>
                  <div className="form-field">
                    <label htmlFor="blocked-labels">Etiquetas de bloqueo</label>
                    <textarea
                      id="blocked-labels"
                      rows={3}
                      value={blocked}
                      disabled={busy}
                      onChange={event => setBlocked(event.target.value)}
                      placeholder="BLOQUEADA"
                    />
                    <small>Una etiqueta por línea. Vacío si no se informa.</small>
                  </div>
                  <div className="form-field">
                    <label htmlFor="state-labels">Etiquetas de estado</label>
                    <textarea
                      id="state-labels"
                      rows={3}
                      value={states}
                      disabled={busy}
                      onChange={event => setStates(event.target.value)}
                      placeholder={'PENDIENTE = pending\nEN CURSO = in_progress\nCOMPLETADA = completed'}
                    />
                    <small>Valores: <code>pending</code>, <code>in_progress</code>, <code>completed</code>.</small>
                  </div>
                </div>
              </div>

              <div className="settings-form-footer">
                <p className="muted">Ventana: de 1 a 720 horas. Antigüedad: de 1 a 10 080 minutos. Los cambios se aplican a nuevas evaluaciones; las versiones anteriores se conservan inmutables.</p>
                <button type="submit" className="save-settings-btn" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar configuración'}
                </button>
              </div>
            </form>
          ) : (
            <div className="viewer-readonly-box">
              <p>Próximos vencimientos: <strong>{configuration.dueSoonHours} horas</strong>. Antigüedad máxima: <strong>{configuration.staleAfterMinutes} minutos</strong>.</p>
              <p className="muted">Solo el gestor del proyecto puede modificar estos parámetros.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
