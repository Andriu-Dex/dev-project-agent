import { useEffect, useRef, useState } from 'react';
import type { ProjectAccess, ProviderOverview, ReasoningEffort } from '@dev-project-agent/contracts';
import { readAgentProviders } from './agentProviders';
import { AgentModelSelect } from './AgentModelSelect';
import { ReasoningSelect } from './ReasoningSelect';
import { navigate, type WorkspacePage } from './Workspace';
import { WorkProgress } from './WorkProgress';
type Card = {
    title: string;
    description: string;
    section: WorkspacePage;
    path?: string;
    method?: 'POST' | 'PUT';
    body?: Record<string, unknown>;
    requiresReason?: boolean;
    requiresConsent?: boolean;
    kind?: string;
};
type Response = {
    text: string;
    cards: Card[];
    observedAt: string;
    usage?: Record<string, number> | null;
};
type Message = {
    id: string;
    input: string;
    response: Response;
    created_at: string;
};
function Mascot() { return <svg viewBox="0 0 64 64" width="42" height="42" fill="none" aria-hidden="true"><path d="M32 11V6" stroke="currentColor" strokeWidth="3"/><circle cx="32" cy="5" r="3" fill="#93c5fd"/><rect x="9" y="14" width="46" height="36" rx="15" fill="#2563eb"/><rect x="16" y="22" width="32" height="19" rx="9" fill="#0f172a"/><path d="M22 31q3-7 6 0m8 0q3-7 6 0" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round"/><path d="M26 46h12" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round"/><path d="m13 52-4 6m42-6 4 6" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>; }
export function AssistantChat({ project, csrfToken }: {
    project: ProjectAccess;
    csrfToken: string;
}) {
    const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(false), [mascot, setMascot] = useState(() => { try {
        return localStorage.getItem('assistant-mascot') !== 'hidden';
    }
    catch {
        return true;
    } });
    const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [providers, setProviders] = useState<ProviderOverview | null>(null), [model, setModel] = useState(''), [effort, setEffort] = useState<ReasoningEffort | ''>(''), [consent, setConsent] = useState(false), [selected, setSelected] = useState<{
        card: Card;
        id: string;
    } | null>(null), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [older, setOlder] = useState(false);
    const panel = useRef<HTMLDivElement>(null), launcher = useRef<HTMLButtonElement>(null), end = useRef<HTMLDivElement>(null), request = useRef<{
        key: string;
        payload: string;
    } | null>(null), actionKey = useRef<string | null>(null), root = `/api/v1/projects/${project.id}`;
    useEffect(() => { setMessages([]); setSelected(null); setText(''); setModel(''); setConsent(false); }, [root]);
    useEffect(() => { if (!open)
        return; const controller = new AbortController(); void fetch(root + '/assistant', { signal: controller.signal }).then(async (r) => { if (!r.ok)
        throw new Error(); return r.json(); }).then(data => { setMessages(data.messages); setOlder(data.messages.length === 30); }).catch(() => { if (!controller.signal.aborted)
        setNotice('No se pudo cargar la conversación.'); }); if (project.canManageProject)
        void readAgentProviders(root, controller.signal).then(setProviders).catch(() => { }); return () => controller.abort(); }, [open, root, project.canManageProject]);
    useEffect(() => { if (!open)
        return; panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') {
        setOpen(false);
        launcher.current?.focus();
    } if (event.key === 'Tab') {
        const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary') ?? [])].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [open]);
    useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [messages, busy]);
    function choose(card: Card, id: string) { if (!card.path) {
        navigate(card.section);
        setOpen(false);
        return;
    } setSelected({ card, id }); setReason(''); setConfirmed(false); actionKey.current = null; }
    async function send(value = text) {
        if (busy || !value.trim() || model && !consent)
            return;
        setBusy(true);
        setNotice('');
        setSelected(null);
        const body = { text: value, requestKey: '', ...(model ? { model, consent, ...(effort ? { reasoningEffort: effort } : {}) } : {}) };
        const payload = JSON.stringify({ ...body, requestKey: undefined });
        if (request.current?.payload !== payload)
            request.current = { key: crypto.randomUUID(), payload };
        body.requestKey = request.current.key;
        try {
            const response = await fetch(root + '/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.message);
            setMessages(old => [...old, { id: body.requestKey, input: JSON.stringify(body), response: result, created_at: new Date().toISOString() }]);
            setText('');
            request.current = null;
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : 'No se pudo confirmar la respuesta. Reintenta la misma solicitud.');
        }
        finally {
            setBusy(false);
        }
    }
    async function perform() {
        if (!selected || busy || !confirmed || selected.card.requiresReason && !reason.trim())
            return;
        setBusy(true);
        setNotice('');
        actionKey.current ??= crypto.randomUUID();
        const card = selected.card;
        try {
            const response = await fetch(card.path!, { method: card.method ?? 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ ...card.body, ...(card.method === 'PUT' ? {} : { requestKey: card.body?.requestKey ?? actionKey.current }), ...(card.requiresReason ? { reason } : {}) }) });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.message ?? 'No se pudo completar la acción.');
            setNotice('Solicitud registrada. Consulta su resultado; no equivale a un cambio verificado.');
            setSelected(null);
            actionKey.current = null;
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : 'No se pudo confirmar el resultado. Consulta el historial antes de reintentar.');
        }
        finally {
            setBusy(false);
        }
    }
    return <><button ref={launcher} className="assistant-launcher" aria-label={open ? 'Cerrar asistente del proyecto' : 'Abrir asistente del proyecto'} aria-expanded={open} aria-controls="project-assistant" onClick={() => { setOpen(value => !value); if (open)
        launcher.current?.focus(); }}>{mascot ? <Mascot /> : <span aria-hidden="true">✦</span>}</button>{open && <><div className="assistant-backdrop" onClick={() => { setOpen(false); launcher.current?.focus(); }}/><div ref={panel} id="project-assistant" className={'assistant-panel' + (expanded ? ' is-expanded' : '')} role="dialog" aria-modal="true" aria-labelledby="assistant-title"><header>{mascot && <Mascot />}<div><strong id="assistant-title">Tu asistente de proyecto</strong><small>{project.name} · Acciones bajo tu control</small></div><button className="assistant-icon-button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Reducir chat' : 'Ampliar chat'}>{expanded ? '↙' : '↗'}</button><button className="assistant-icon-button" onClick={() => { setOpen(false); launcher.current?.focus(); }} aria-label="Cerrar asistente">×</button></header><div className="assistant-scroll"><p className="assistant-welcome">Consulta el avance, prepara propuestas y sigue las ejecuciones. Aprobar y ejecutar son decisiones separadas.</p><details className="assistant-preferences"><summary>Personalizar asistente y proveedor</summary><label><input type="checkbox" checked={mascot} onChange={event => { setMascot(event.target.checked); try {
        localStorage.setItem('assistant-mascot', event.target.checked ? 'visible' : 'hidden');
    }
    catch { /* Appearance remains available without storage. */ } }}/>Mostrar mascota</label>{project.canManageProject && <><label><input type="checkbox" checked={!!model} disabled={!providers?.connection.models.length} onChange={event => { setModel(event.target.checked ? providers?.connection.models[0]?.slug ?? '' : ''); setConsent(false); }}/>Interpretar lenguaje natural con un modelo</label>{!!model && <><AgentModelSelect id="assistant-model" models={providers?.connection.models ?? []} value={model} onChange={value => { setModel(value); setEffort(''); setConsent(false); }}/><ReasoningSelect id="assistant-effort" model={providers?.connection.models.find(item => item.slug === model)} value={effort} onChange={setEffort}/><label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>Autorizar envío de solicitud, tres mensajes previos y metadatos acotados de actividades/propuestas al proveedor seleccionado. Las propuestas posteriores pedirán su propio consentimiento.</label></>}{!providers?.connection.models.length && <p>Conecta un proveedor en Configuración para interpretar acciones específicas. Las consultas básicas siguen disponibles.</p>}</>}<p className="muted">Conversación privada de tu usuario y proyecto, conservada en el servidor. No incluyas credenciales. Cerrar el chat no cancela trabajos.</p></details>{older && <button className="secondary-button" disabled={busy} onClick={async () => { try {
        const response = await fetch(root + '/assistant?before=' + encodeURIComponent(messages[0]!.created_at));
        if (!response.ok)
            throw new Error();
        const result = await response.json();
        setMessages(old => [...result.messages, ...old]);
        setOlder(result.messages.length === 30);
    }
    catch {
        setNotice('No se pudo cargar el historial anterior.');
    } }}>Cargar mensajes anteriores</button>}<div className="assistant-conversation" role="log" aria-label="Conversación">{messages.map(message => <div key={message.id}><p className="assistant-user">{JSON.parse(message.input).text}</p><article className="assistant-answer"><p>{message.response.text}</p><small>Consultado: {new Date(message.response.observedAt).toLocaleString('es-EC')}</small>{message.response.cards.map((card, index) => <button key={index} className="assistant-action" disabled={busy} onClick={() => choose(card, message.id + ':' + index)}>{card.title}<span aria-hidden="true"> →</span></button>)}</article></div>)}</div>{selected && <section className="assistant-confirmation" aria-labelledby="assistant-action-title"><h3 id="assistant-action-title">{selected.card.title}</h3><pre>{selected.card.description}</pre>{selected.card.requiresReason && <label>Motivo de tu decisión<textarea maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)}/></label>}<label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>{selected.card.kind === 'execute' ? 'Confirmo la ejecución real del cambio exacto mostrado.' : selected.card.requiresConsent ? 'Autorizo enviar la evidencia necesaria al modelo y preparar esta propuesta; no autoriza su ejecución.' : 'He revisado el contenido y confirmo esta solicitud.'}</label><div className="assistant-actions"><button disabled={busy || !confirmed || selected.card.requiresReason && !reason.trim()} onClick={() => void perform()}>{selected.card.kind === 'execute' ? 'Confirmar ejecución real' : 'Confirmar solicitud'}</button><button className="secondary-button" disabled={busy} onClick={() => setSelected(null)}>Cancelar</button></div></section>}{busy && <p role="status">Procesando solicitud… <progress aria-label="Esperando respuesta"/></p>}{notice && <p role="status" className="assistant-notice">{notice}</p>}<details><summary>Actividad reciente de agentes</summary><WorkProgress projectId={project.id}/></details><div ref={end}/></div><footer><div className="assistant-suggestions">{['¿Qué necesita atención?', 'Ver reportes', 'Ver progreso'].map(value => <button key={value} disabled={busy} onClick={() => void send(value)}>{value}</button>)}</div><form onSubmit={event => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor="assistant-input">Escribe tu solicitud</label><textarea id="assistant-input" placeholder="¿Qué necesitas hacer?" maxLength={2000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void send();
    } }}/><button disabled={busy || !text.trim() || !!model && !consent} aria-label="Enviar solicitud">↑</button></form><small>Enter para enviar · Mayús+Enter para una nueva línea</small></footer></div></>}</>;
}
