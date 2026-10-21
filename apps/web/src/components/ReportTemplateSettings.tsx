import { useEffect, useState } from 'react';
import type { ProjectAccess, ReportTemplateSettings as Settings } from '@dev-project-agent/contracts';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
export function ReportTemplateSettings({ project, csrfToken }: {
    project: ProjectAccess;
    csrfToken: string;
}) {
    const [saved, setSaved] = useState<{
        version: number;
        settings: Settings;
    } | null>(null), [form, setForm] = useState<Settings | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const path = `/api/v1/projects/${project.id}/report-template`, dirty = !!saved && !!form && JSON.stringify(saved.settings) !== JSON.stringify(form);
    useUnsavedChanges(dirty, 'Formato del informe');
    useEffect(() => { const controller = new AbortController(); void fetch(path, { signal: controller.signal }).then(async (r) => { if (!r.ok)
        throw new Error(); return r.json(); }).then(value => { setSaved(value); setForm(value.settings); }).catch(() => { if (!controller.signal.aborted)
        setNotice('No se pudo consultar el formato.'); }); return () => controller.abort(); }, [path]);
    if (!project.canManageProject)
        return null;
    return <details className="v11-settings"><summary>Formato institucional del informe</summary><p>Once secciones, papel Carta y logo del proyecto. Los cambios se aplican a nuevas versiones; se conservan los informes anteriores.</p>{form && <form onSubmit={async (event) => { event.preventDefault(); if (busy)
        return; setBusy(true); try {
        const response = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ expectedVersion: saved!.version, settings: form }) });
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.message);
        setSaved(result);
        setForm(result.settings);
        setNotice('Formato guardado. Los informes anteriores conservan su presentación.');
    }
    catch {
        setNotice('No se pudo guardar. Actualiza para comprobar la versión.');
    }
    finally {
        setBusy(false);
    } }}><div className="settings-grid">{Object.entries({ organization: 'Organización', process: 'Proceso', subprocess: 'Subproceso', title: 'Título del informe', codePrefix: 'Prefijo documental (ejemplo: AP-TIC-INF)' }).map(([key, label]) => <label key={key}>{label}<input value={form[key as keyof Settings]} maxLength={key === 'codePrefix' ? 40 : 160} pattern={key === 'codePrefix' ? '[A-Z0-9-]*' : undefined} onChange={event => setForm({ ...form, [key]: event.target.value })}/></label>)}</div><p className="muted">Solo utiliza identificadores institucionales autorizados. Campos vacíos: «No configurado».</p><button disabled={busy || !dirty}>Guardar formato</button></form>}<p role="status">{notice}</p></details>;
}
