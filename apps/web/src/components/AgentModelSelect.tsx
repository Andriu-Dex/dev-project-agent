import type {ProviderConnection} from '@dev-project-agent/contracts';

export function AgentModelSelect({id,models,value,onChange,disabled=false}:{id:string;models:ProviderConnection['models'];value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const selected=(value||models[0]?.slug||'').startsWith('ollama:')?'ollama':'chatgpt';
  const available=models.filter(model=>model.slug.startsWith('ollama:')===(selected==='ollama'));
  return <div className="input-group">
    <label htmlFor={id+'-provider'}>Proveedor de inteligencia artificial</label>
    <select id={id+'-provider'} value={selected} disabled={disabled} onChange={event=>onChange(models.find(model=>model.slug.startsWith('ollama:')===(event.target.value==='ollama'))?.slug??'')}>
      <option value="chatgpt" disabled={!models.some(model=>!model.slug.startsWith('ollama:'))}>ChatGPT</option>
      <option value="ollama" disabled={!models.some(model=>model.slug.startsWith('ollama:'))}>Ollama</option>
    </select>
    <label htmlFor={id}>Modelo</label>
    <select id={id} required value={value} disabled={disabled||!available.length} onChange={event=>onChange(event.target.value)}>
      <option value="">Selecciona un modelo</option>{available.map(model=><option key={model.slug} value={model.slug}>{model.displayName}</option>)}
    </select>
    {selected==='ollama'&&<p className="muted">La calidad, precisión y velocidad dependen del modelo y del equipo. Estar conectado no acredita una evaluación satisfactoria. Evalúa el modelo en Configuración antes de confiar en sus resultados.</p>}
    <p className="muted">Se utilizará este proveedor para las etapas de esta solicitud. Si falla, no se cambia automáticamente al otro.</p>
  </div>;
}
