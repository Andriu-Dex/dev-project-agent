import type {TrelloSnapshot,TrackingFinding,TrackingPolicyResponse} from '@dev-project-agent/contracts';

export function riskAssessment(snapshot:TrelloSnapshot, finding:TrackingFinding, policy:TrackingPolicyResponse) {
  const item=snapshot.items.find(item=>item.id===finding.itemId)!;
  const description=item.planning?.description??'';
  const cause=/^\s*(?:CAUSA(?:\s+DE\s+RETRASO)?|BLOQUEO)\s*:\s*(.+)$/im.exec(description)?.[1]?.trim()??null;
  const impacted=new Set<string>(),queue=[item.id];
  while(queue.length){const current=queue.shift()!;for(const successor of snapshot.items.filter(other=>!other.archived&&other.kind!=='reference')) {
    if(successor.id!==item.id&&!impacted.has(successor.id)&&successor.planning?.dependencies.some(dependency=>dependency.itemId===current)) {
      impacted.add(successor.id);queue.push(successor.id);
    }
  }}
  const assigned=new Set(item.memberIds),available=snapshot.members.filter(member=>!assigned.has(member.id));
  const priorityLabel=Object.entries(policy.priorityLabels??{}).find(([,value])=>value==='high')?.[0]??null;
  const alternatives=[
    {family:'keep_plan',title:'Conservar el plan y aclarar el impedimento',eligible:true,goal:`Revisar ${item.name}; documentar la causa y el trabajo pendiente antes de modificar la planificación.`,benefit:'Conserva el compromiso vigente mientras se aclara la evidencia.',risk:'El riesgo temporal continúa si no se resuelve el impedimento.'},
    {family:'dates',title:'Reprogramar inicio y vencimiento',eligible:item.state!=='completed',goal:`Reprogramar ${item.name} con inicio y fin coherentes, comprobar predecesoras y revisar las ${impacted.size} actividades relacionadas.`,benefit:'Permite acordar un objetivo coherente con el trabajo pendiente.',risk:'No hay una estimación de duración restante; el gestor debe fijar las fechas.'},
    {family:'priority',title:'Revisar la prioridad de la actividad',eligible:!!priorityLabel,goal:`Evaluar la prioridad ${priorityLabel??'alta (requiere mapeo)'} de ${item.name} y el efecto sobre otras actividades.`,benefit:'Hace visible el orden de atención acordado.',risk:'Cambiar prioridad no aumenta la capacidad ni garantiza finalización.'},
    {family:'members',title:'Redistribuir la responsabilidad',eligible:available.length>0,goal:`Evaluar la redistribución de ${item.name} entre integrantes del tablero; conservar un responsable y confirmar disponibilidad.`,benefit:'Permite resolver una dependencia de recursos si se confirma la disponibilidad.',risk:'La pertenencia al tablero no acredita capacidad, experiencia ni disponibilidad.'},
  ];
  return {cause:{status:cause?'documented':'hypothesis',text:cause??(finding.code==='blocked'?'La etiqueta declara un impedimento; falta documentar su causa.':'Verificar carga de trabajo, dependencias y disponibilidad; no hay una causa confirmada.'),source:cause?'card_description':'rule_context'},
    impactedItems:[...impacted].map(id=>{const target=snapshot.items.find(item=>item.id===id)!;return {id,name:target.name,due:target.due,state:target.state};}),
    impact:impacted.size?`Un desplazamiento puede afectar ${impacted.size} actividades relacionadas. Las relaciones son declaraciones del tablero; no se puede cuantificar el desplazamiento sin duración y disponibilidad.`:'No hay actividades sucesoras explícitas en la fuente. El objetivo de esta actividad puede afectarse; el impacto global no es cuantificable con los datos disponibles.',
    alternatives,eligibleMembers:available.map(member=>({id:member.id,name:member.displayName})),limitations:['Una causa declarada requiere validación humana.','No se calculan probabilidades, capacidad ni ruta crítica.']};
}
