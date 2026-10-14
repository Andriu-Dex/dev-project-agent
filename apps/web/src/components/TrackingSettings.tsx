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
  return <details open className="tracking-settings">
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
        <label>Etiquetas de prioridad<textarea rows={3} value={priority} disabled={busy} onChange={event=>setPriority(event.target.value)} placeholder={'ALTA = high\nMEDIA = medium\nBAJA = low'}/><small>Una por línea. Valores: high (alta), medium (media), low (baja).</small></label>
        <label>Etiquetas de bloqueo<textarea rows={3} value={blocked} disabled={busy} onChange={event=>setBlocked(event.target.value)} placeholder="BLOQUEADA"/><small>Una etiqueta exacta por línea. Vacío significa que el bloqueo no está informado.</small></label>
        <label>Etiquetas de estado<textarea rows={3} value={states} disabled={busy} onChange={event=>setStates(event.target.value)}/><small>Etiqueta = pending (pendiente), in_progress (en curso) o completed (completada).</small></label>
        <p className="muted">Ventana: de 1 a 720 horas. Antigüedad: de 1 a 10 080 minutos. Los cambios se aplican a nuevas evaluaciones; las versiones anteriores se conservan.</p>
        <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </form> : <p>Próximos vencimientos: {configuration.dueSoonHours} horas. Antigüedad máxima: {configuration.staleAfterMinutes} minutos. Solo el gestor puede modificar estos valores.</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => { setMessage(''); setAttempt(value => value + 1); }}>Recargar configuración</button>
  </details>;
}
