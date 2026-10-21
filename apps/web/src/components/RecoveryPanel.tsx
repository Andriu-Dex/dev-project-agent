import { useEffect, useRef, useState } from 'react';
import type { ProjectAccess, ProviderOverview, ReasoningEffort } from '@dev-project-agent/contracts';
import { readAgentProviders } from './agentProviders';
import { AgentModelSelect } from './AgentModelSelect';
import { ReasoningSelect } from './ReasoningSelect';
type Recovery = {
    id: string;
    publication_id: string;
    status: string;
    content_hash: string;
    reason: string;
    plan: {
        review: string;
        policy: string;
        repository: string;
        pullNumber: number;
        head: string;
    };
};
export function RecoveryPanel({ project, csrfToken, originalId, target, onChanged }: {
    project: ProjectAccess;
    csrfToken: string;
    originalId: string;
    target: 'trello' | 'github';
    onChanged: () => void;
}) {
    const [open, setOpen] = useState(false), [models, setModels] = useState<ProviderOverview | null>(null), [model, setModel] = useState(''), [effort, setEffort] = useState<ReasoningEffort | ''>(''), [reason, setReason] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [recoveries, setRecoveries] = useState<Recovery[]>([]), [confirmed, setConfirmed] = useState(false);
    const key = useRef<string | null>(null), root = `/api/v1/projects/${project.id}`;
    async function refresh() { if (target === 'github') {
        const response = await fetch(root + '/code-review/recoveries');
        if (response.ok)
            setRecoveries((await response.json()).recoveries.filter((row: Recovery) => row.publication_id === originalId));
    } }
    useEffect(() => { if (!open)
        return; const controller = new AbortController(); void readAgentProviders(root, controller.signal).then(setModels).catch(() => setNotice('No se pudieron consultar los modelos.')); void refresh(); return () => controller.abort(); }, [open, root]);
    if (!project.canManageProject)
        return null;
    async function post(path: string, body: Record<string, unknown>) { if (busy)
        return; setBusy(true); setNotice(''); try {
        const response = await fetch(root + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.message);
        setNotice(result.kind === 'code_proposal' || result.proposalId ? 'Reversión preparada como nueva propuesta. Abre la lista y revisa sus dictámenes antes de decidir.' : result.status === 'succeeded' ? 'Retiro verificado. La rama y los commits se conservaron.' : result.status === 'reconciliation_required' ? 'Resultado incierto; consulta para reconciliar antes de cualquier nueva acción.' : 'Plan registrado. Revisa el contenido antes de aprobarlo; la ejecución requiere otra confirmación.');
        key.current = null;
        setConfirmed(false);
        await refresh();
        onChanged();
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : 'No se pudo confirmar la solicitud. Consulta el historial.');
    }
    finally {
        setBusy(false);
    } }
    return <details className="v11-settings" onToggle={event => setOpen(event.currentTarget.open)}><summary>Preparar reversión o retiro</summary><p>Original: <code>{originalId}</code>. Se conservará su historial. {target==='github'&&'Un PR abierto no necesita modelo para preparar su retiro; si ya fue fusionado, selecciona un modelo y autoriza su revisión.'} {target === 'trello' ? 'Actualiza las fuentes y ejecuta la supervisión antes de preparar la reversión. Si el recurso cambió, se bloqueará su ejecución.' : 'PR abierto: plan de cierre con aprobación y ejecución separadas. PR fusionado: nueva corrección y PR de reversión; sin reset, force-push ni merge automático.'}</p><label>Motivo<textarea maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); key.current = null; }}/></label><AgentModelSelect id={'recovery-' + originalId} models={models?.connection.models ?? []} value={model} onChange={value => { setModel(value); setEffort(''); key.current = null; }}/><ReasoningSelect id={'recovery-effort-' + originalId} model={models?.connection.models.find(item => item.slug === model)} value={effort} onChange={setEffort}/><label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>Autorizo el envío de la evidencia necesaria al modelo para revisar la nueva propuesta. No autoriza escrituras.</label><button disabled={busy || !reason.trim() || target==='trello'&&(!model || !consent)} onClick={async () => { key.current ??= crypto.randomUUID(); if (target === 'trello') {
        try {
            const response = await fetch(root + '/supervision');
            if (!response.ok)
                throw new Error();
            const source = await response.json();
            if (!source.latestRun?.id)
                throw new Error();
            await post('/proposal-reversals', { executionId: originalId, sourceRunId: source.latestRun.id, goal: reason, ...(model?{model}:{}), ...(effort ? { reasoningEffort: effort } : {}), requestKey: key.current });
        }
        catch {
            setNotice('Actualiza Trello y ejecuta una supervisión antes de continuar.');
        }
    }
    else
        await post('/code-review/publications/' + originalId + '/recovery', { reason, ...(model?{model}:{}), ...(effort ? { reasoningEffort: effort } : {}), consent, requestKey: key.current }); }}>Preparar sin ejecutar</button>{recoveries.map(row => <section className="assistant-confirmation" key={row.id}><h4>Retiro de PR · {({prepared:'Preparado',approved:'Aprobado; sin ejecutar',running:'En curso',succeeded:'Verificado',reconciliation_required:'Reconciliación pendiente',withdrawn:'Autorización retirada'} as Record<string,string>)[row.status]??'Consultar estado'}</h4><p>{row.plan.review}</p><p>{row.plan.policy}</p><pre>{JSON.stringify({ repository: row.plan.repository, pr: row.plan.pullNumber, head: row.plan.head, reason: row.reason }, null, 2)}</pre><small>Huella: {row.content_hash}</small>{['prepared','approved'].includes(row.status)&&<button type="button" className="secondary-button" disabled={busy||!reason.trim()} onClick={()=>void post('/code-review/recoveries/'+row.id,{contentHash:row.content_hash,action:'withdraw',reason,confirmed:true})}>Retirar plan sin ejecutar</button>}{!['succeeded','withdrawn'].includes(row.status) && <><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Confirmo {row.status === 'prepared' ? 'la aprobación del plan exacto' : row.status === 'approved' ? 'la ejecución real del cierre del PR' : 'consultar el resultado sin repetir la escritura'}.</label><button disabled={busy || !confirmed || !reason.trim()} onClick={() => void post('/code-review/recoveries/' + row.id, { contentHash: row.content_hash, action: row.status === 'prepared' ? 'approve' : row.status === 'approved' ? 'execute' : 'reconcile', reason, confirmed: true })}>{row.status === 'prepared' ? 'Aprobar retiro' : row.status === 'approved' ? 'Ejecutar cierre del PR' : 'Reconciliar resultado'}</button></>}</section>)}<p role="status">{notice}</p></details>;
}
