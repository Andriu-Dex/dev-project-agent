import type {ProviderConnection,ReasoningEffort} from '@dev-project-agent/contracts';

export const effortLabels:Record<ReasoningEffort,string>={low:'Bajo',medium:'Medio',high:'Alto',xhigh:'Muy alto',max:'Máximo'};
export function ReasoningSelect({id,model,value,onChange,disabled=false}:{id:string;model:ProviderConnection['models'][number]|undefined;value:ReasoningEffort|'';onChange:(value:ReasoningEffort|'')=>void;disabled?:boolean}) {
  const efforts=model?.reasoningEfforts??[];
  return <div className="input-group"><label htmlFor={id}>Nivel de razonamiento</label>
    <select id={id} value={efforts.includes(value as ReasoningEffort)?value:''} onChange={event=>onChange(event.target.value as ReasoningEffort|'')} disabled={disabled||!efforts.length}>
      <option value="">Predeterminado del modelo</option>{efforts.map(effort=><option key={effort} value={effort}>{effortLabels[effort]} ({effort})</option>)}
    </select><p className="muted">{efforts.length?'Más razonamiento puede aumentar el tiempo y el consumo de tu plan. No sustituye la revisión ni la aprobación del gestor.':'Todavía no tenemos niveles verificados para este modelo; se utiliza su valor predeterminado.'}</p>
  </div>;
}
