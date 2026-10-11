import { useEffect, useState, type FormEvent } from 'react';
import type { TrackingPolicyResponse } from '@dev-project-agent/contracts';

export function TrackingSettings({ projectId, canManage, csrfToken, onSaved }: {
  projectId: string; canManage: boolean; csrfToken: string; onSaved: () => void;
}) {
  const [configuration, setConfiguration] = useState<TrackingPolicyResponse | null>(null);
  const [dueHours, setDueHours] = useState('');
  const [staleMinutes, setStaleMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
    }).catch(() => { if (!controller.signal.aborted) setError('No se pudo cargar la configuración.'); });
    return () => controller.abort();
  }, [path, attempt]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ expectedVersion: configuration.version, dueSoonHours: Number(dueHours), staleAfterMinutes: Number(staleMinutes) }) });
      const value = await response.json();
      if (!response.ok) { setError(value.message ?? 'No se pudo guardar la configuración.'); return; }
      setConfiguration(value as TrackingPolicyResponse);
      setMessage('Configuración guardada. La evaluación se actualiza con los nuevos valores.');
      onSaved();
    } catch { setError('No se pudo confirmar el guardado. Recarga la configuración antes de volver a intentar.'); }
    finally { setBusy(false); }
  }
  return <details className="tracking-settings">
    <summary>Configuración del seguimiento</summary>
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!configuration && !error && <p role="status">Cargando configuración…</p>}
    {configuration && <>
      <p className="muted">Versión {configuration.version} · {new Date(configuration.changedAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} · {configuration.changedBy?.displayName ?? 'Configuración inicial'}.</p>
      {!configuration.confirmed && <p>Valores iniciales. El gestor puede ajustarlos y guardarlos para confirmar la configuración del proyecto.</p>}
      {canManage ? <form className="tracking-settings-form" onSubmit={event => void save(event)}>
        <label>Próximos vencimientos (horas)<input type="number" min={1} max={720} step={1} required value={dueHours} disabled={busy} onChange={event => setDueHours(event.target.value)} /></label>
        <label>Lectura desactualizada después de (minutos)<input type="number" min={1} max={10080} step={1} required value={staleMinutes} disabled={busy} onChange={event => setStaleMinutes(event.target.value)} /></label>
        <p className="muted">Ventana: de 1 a 720 horas. Antigüedad: de 1 a 10 080 minutos. Los cambios se aplican a nuevas evaluaciones; las versiones anteriores se conservan.</p>
        <button type="submit" disabled={busy || (configuration.confirmed && Number(dueHours) === configuration.dueSoonHours && Number(staleMinutes) === configuration.staleAfterMinutes)}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </form> : <p>Próximos vencimientos: {configuration.dueSoonHours} horas. Antigüedad máxima: {configuration.staleAfterMinutes} minutos. Solo el gestor puede modificar estos valores.</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => { setMessage(''); setAttempt(value => value + 1); }}>Recargar configuración</button>
  </details>;
}
