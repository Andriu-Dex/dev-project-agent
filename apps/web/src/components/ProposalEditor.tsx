import type {
  ProposalVersionView,
  ProviderOverview,
  ReasoningEffort,
  SupervisionOverview,
  TrackingPolicyResponse,
  TrelloItem,
  TrelloOverview,
} from '@dev-project-agent/contracts';
import { AgentModelSelect } from './AgentModelSelect';
import { providerDestination } from './agentProviders';
import { ReasoningSelect } from './ReasoningSelect';
import { Icon } from './Workspace';
import type { Dispatch, SetStateAction } from 'react';
import { date } from './proposalShared';

export function ProposalEditor({
  active,
  adjusting,
  busy,
  cardId,
  cards,
  connected,
  consent,
  dateProblem,
  detail,
  due,
  effort,
  family,
  goal,
  isDate,
  label,
  memberIds,
  model,
  policy,
  prepare,
  provider,
  purpose,
  selectedCard,
  selectedModel,
  setAdjustment,
  setCardId,
  setConsent,
  setDue,
  setEffort,
  setFamily,
  setGoal,
  setLabel,
  setMemberIds,
  setModel,
  setPurpose,
  setShowEditor,
  setStart,
  sources,
  start,
}: {
  active: boolean;
  adjusting: boolean;
  busy: boolean;
  cardId: string;
  cards: TrelloItem[];
  connected: boolean;
  consent: boolean;
  dateProblem: "" | "Selecciona una fecha futura." | "La nueva fecha no puede ser anterior al inicio registrado.";
  detail: ProposalVersionView | null;
  due: string;
  effort: "" | ReasoningEffort;
  family: string;
  goal: string;
  isDate: boolean;
  label: string;
  memberIds: string[];
  model: string;
  policy: TrackingPolicyResponse | null;
  prepare: () => Promise<void>;
  provider: ProviderOverview | null;
  purpose: "demonstration" | "live";
  selectedCard: TrelloItem | undefined;
  selectedModel: ProviderOverview['connection']['models'][number] | undefined;
  setAdjustment: Dispatch<SetStateAction<{ id: string; version: number; } | null>>;
  setCardId: Dispatch<SetStateAction<string>>;
  setConsent: Dispatch<SetStateAction<boolean>>;
  setDue: Dispatch<SetStateAction<string>>;
  setEffort: Dispatch<SetStateAction<"" | ReasoningEffort>>;
  setFamily: Dispatch<SetStateAction<string>>;
  setGoal: Dispatch<SetStateAction<string>>;
  setLabel: Dispatch<SetStateAction<string>>;
  setMemberIds: Dispatch<SetStateAction<string[]>>;
  setModel: Dispatch<SetStateAction<string>>;
  setPurpose: Dispatch<SetStateAction<"demonstration" | "live">>;
  setShowEditor: Dispatch<SetStateAction<boolean>>;
  setStart: Dispatch<SetStateAction<string>>;
  sources: { trello: TrelloOverview; supervision: SupervisionOverview; } | null;
  start: string;
}) {
  return (
    <section className="proposal-editor-card">
      <div className="editor-card-header">
        <div className="editor-header-title">
          <div className="editor-icon-badge">
            <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </div>
          <div>
            <h3>{adjusting ? `Ajustar propuesta (Nueva versión v${(detail?.version ?? 1) + 1})` : 'Preparar nueva propuesta de cambio'}</h3>
            <p>
              {adjusting
                ? 'Formula una versión corregida resolviendo las observaciones del gestor o los agentes.'
                : 'Delimita una propuesta sobre una tarjeta de Trello para que los 3 agentes la formulen y comprueben.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="editor-close-btn"
          onClick={() => {
            setShowEditor(false);
            setAdjustment(null);
            setConsent(false);
          }}
          title="Cerrar formulario"
        >
          <Icon path="M18 6L6 18 M6 6l12 12" />
        </button>
      </div>

      <div className="editor-card-body">
        {!connected && (
          <div className="editor-warning-box">
            <Icon path="M12 9v4 M12 17h.01 M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <span>Conecta ChatGPT o inicia Ollama en Configuración para iniciar la orquestación de agentes.</span>
          </div>
        )}

        {!sources?.supervision.latestRun && (
          <div className="editor-warning-box">
            <Icon path="M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z" />
            <span>Primero actualiza las fuentes y ejecuta una supervisión en la pantalla de Operación.</span>
          </div>
        )}

        <div className="editor-grid">
          {/* Purpose Selection */}
          <div className="editor-field">
            <label htmlFor="proposal-purpose">Propósito de la propuesta</label>
            <select
              id="proposal-purpose"
              value={adjusting ? detail!.purpose : purpose}
              disabled={busy || active || adjusting}
              onChange={event => {
                setPurpose(event.target.value as typeof purpose);
                setConsent(false);
              }}
              className="editor-select"
            >
              <option value="demonstration">Demostración (sin cambios en Trello)</option>
              <option value="live">Uso real (puede solicitar ejecución tras aprobación)</option>
            </select>
            <small className="editor-hint">
              El propósito se conserva en todas las versiones y no se puede convertir una demostración en real.
            </small>
          </div>

          {/* Target Card */}
          <div className="editor-field">
            <label htmlFor="proposal-card">Tarjeta de Trello a revisar</label>
            <select
              id="proposal-card"
              value={cardId}
              onChange={event => {
                setCardId(event.target.value);
                setConsent(false);
              }}
              disabled={busy || active || adjusting}
              className="editor-select"
            >
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
            <small className="editor-hint">
              Valores leídos: Inicio: <strong>{date(selectedCard?.start ?? null)}</strong> · Vencimiento:{' '}
              <strong>{date(selectedCard?.due ?? null)}</strong>
            </small>
          </div>

          {/* Adjustment Family */}
          <div className="editor-field">
            <label htmlFor="proposal-family">Tipo de ajuste solicitado</label>
            <select
              id="proposal-family"
              value={family}
              disabled={busy || active}
              onChange={event => {
                setFamily(event.target.value);
                setLabel('');
                setConsent(false);
              }}
              className="editor-select"
            >
              <option value="due">Vencimiento</option>
              <option value="dates">Inicio y vencimiento</option>
              <option value="priority">Prioridad</option>
              <option value="members">Responsables asignados</option>
              <option value="state">Estado declarado</option>
            </select>
          </div>

          {/* Family Specific Inputs */}
          {family === 'dates' && (
            <div className="editor-field">
              <label htmlFor="proposal-start">Nuevo inicio (hora local)</label>
              <input
                id="proposal-start"
                type="datetime-local"
                value={start}
                disabled={busy || active}
                onChange={event => {
                  setStart(event.target.value);
                  setConsent(false);
                }}
                className="editor-input"
              />
            </div>
          )}

          {isDate && (
            <div className="editor-field">
              <label htmlFor="proposal-due">Nueva fecha objetivo (hora local)</label>
              <input
                id="proposal-due"
                type="datetime-local"
                value={due}
                onChange={event => {
                  setDue(event.target.value);
                  setConsent(false);
                }}
                disabled={busy || active}
                className="editor-input"
              />
              {due && Number.isFinite(new Date(due).getTime()) && (
                <small className="editor-hint">
                  En Ecuador: <strong>{date(new Date(due).toISOString())}</strong>. Es una propuesta de planificación.
                </small>
              )}
              {dateProblem && <p className="editor-field-error">{dateProblem}</p>}
            </div>
          )}

          {(family === 'priority' || family === 'state') && (
            <div className="editor-field">
              <label htmlFor="proposal-label">Etiqueta configurada propuesta</label>
              <select
                id="proposal-label"
                value={label}
                disabled={busy || active}
                onChange={event => {
                  setLabel(event.target.value);
                  setConsent(false);
                }}
                className="editor-select"
              >
                <option value="">Seleccionar etiqueta configurada…</option>
                {Object.keys((family === 'priority' ? policy?.priorityLabels : policy?.stateLabels) ?? {}).map(
                  value => (
                    <option key={value}>{value}</option>
                  )
                )}
              </select>
              <small className="editor-hint">Se conservan las etiquetas ajenas a esta familia.</small>
            </div>
          )}
        </div>

        {family === 'members' && (
          <div className="editor-members-section">
            <label className="editor-section-label">Integrantes asignados propuestos</label>
            <div className="editor-members-grid">
              {sources?.trello.latest?.data.members.map(member => (
                <label key={member.id} className="editor-member-pill">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(member.id)}
                    disabled={busy || active}
                    onChange={event => {
                      setMemberIds(ids =>
                        event.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id)
                      );
                      setConsent(false);
                    }}
                  />
                  <span>{member.displayName}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Goal Textarea */}
        <div className="editor-field full-width">
          <label htmlFor="proposal-goal">Objetivo y justificación del cambio</label>
          <textarea
            id="proposal-goal"
            maxLength={1000}
            value={goal}
            onChange={event => {
              setGoal(event.target.value);
              setConsent(false);
            }}
            disabled={busy || active}
            placeholder="Explica detalladamente la propuesta, motivos técnicos o acuerdos de equipo sin incluir credenciales ni datos personales…"
            rows={3}
            className="editor-textarea"
          />
          <div className="textarea-footer">
            <span>{goal.length} / 1000 caracteres</span>
          </div>
        </div>

        {/* Provider, Model & Reasoning */}
        <div className="editor-model-row">
          <AgentModelSelect
            id="proposal-model"
            models={provider?.connection.models ?? []}
            value={model}
            onChange={value => {
              setModel(value);
              setEffort('');
              setConsent(false);
            }}
            disabled={busy || active}
          />
          <ReasoningSelect
            id="proposal-effort"
            model={selectedModel}
            value={effort}
            onChange={value => {
              setEffort(value);
              setConsent(false);
            }}
            disabled={busy || active}
          />
        </div>

        {/* Consent Checkbox */}
        <label className="editor-consent-box">
          <input
            type="checkbox"
            checked={consent}
            onChange={event => setConsent(event.target.checked)}
            disabled={busy || active}
          />
          <span>
            Quiero enviar a <strong>{providerDestination(model)}</strong> el objetivo, los identificadores, nombre,
            estado, fechas, WBS, etiquetas y asignados de esta tarjeta para la orquestación secuencial de los 3
            agentes.
          </span>
        </label>

        {/* Action Buttons */}
        <div className="editor-actions-row">
          {adjusting && (
            <button
              type="button"
              className="editor-cancel-btn"
              disabled={busy || active}
              onClick={() => {
                setAdjustment(null);
                setConsent(false);
                setShowEditor(false);
              }}
            >
              Cancelar ajuste
            </button>
          )}

          <button
            type="button"
            className="editor-submit-btn"
            disabled={
              busy ||
              active ||
              !connected ||
              !model ||
              !consent ||
              !goal.trim() ||
              (isDate && !due) ||
              (family === 'dates' && !start) ||
              (family === 'members' && !memberIds.length) ||
              (['priority', 'state'].includes(family) && !label) ||
              Boolean(dateProblem) ||
              !cardId ||
              !sources?.supervision.latestRun
            }
            onClick={() => void prepare()}
          >
            {active ? (
              <>
                <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" />
                <span>Agentes en ejecución…</span>
              </>
            ) : adjusting ? (
              <>
                <Icon path="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                <span>Preparar nueva versión</span>
              </>
            ) : (
              <>
                <Icon path="M13 10V3L4 14h7v7l9-11h-7z" />
                <span>Iniciar los 3 agentes en secuencia</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
