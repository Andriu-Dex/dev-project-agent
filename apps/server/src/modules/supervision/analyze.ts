import type { BaselineDeviation, DependencyFinding, TrelloSnapshot, TrelloItem, SupervisionResult, TrelloOverview, GitHubOverview, TrackingPolicyResponse } from '@dev-project-agent/contracts';
import { mappedItem, evaluateTracking } from '../tracking/rules.js';
import { evaluationPolicy } from '../tracking/policy.js';
import { isDeepStrictEqual } from 'node:util';

const active=(data:TrelloSnapshot)=>data.items.filter(item=>!item.archived&&item.kind!=='reference');
function time(value:string|null) { return value && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null; }
export function analyzeDependencies(snapshot:TrelloSnapshot,now:Date):DependencyFinding[] {
  const items=active(snapshot),byId=new Map(items.map(item=>[item.id,item])); const findings:DependencyFinding[]=[];
  const cyclic=new Set<string>();
  function visit(id:string,path:string[],done:Set<string>) {
    const index=path.indexOf(id); if(index>=0) { for(const member of path.slice(index)) cyclic.add(member); return; }
    if(done.has(id)) return;
    for(const dependency of byId.get(id)?.planning?.dependencies??[]) if(dependency.itemId&&byId.has(dependency.itemId)) visit(dependency.itemId,[...path,id],done);
    done.add(id);
  }
  const done=new Set<string>(); for(const item of items) visit(item.id,[],done);
  for(const item of items) {
    function add(code:DependencyFinding['code'],message:string,predecessor:TrelloItem|null=null,wbs:string|null=null,evidence:string[]=[]) {
      findings.push({itemId:item.id,itemName:item.name,predecessorId:predecessor?.id??null,predecessorWbs:wbs,code,message,evidence});
    }
    const planning=item.planning;
    if(!planning||planning.dependencyDeclaration==='unavailable') { add('unavailable','No hay una declaración explícita de predecesoras. No se pueden evaluar dependencias.'); continue; }
    if(planning.dependencyDeclaration==='invalid') { add('invalid','La declaración de predecesoras no tiene un formato o desfase interpretable.'); continue; }
    if(cyclic.has(item.id)) { add('cycle','Las dependencias forman un ciclo. Se requiere revisar la planificación.'); continue; }
    for(const dependency of planning.dependencies) {
      const predecessor=dependency.itemId?byId.get(dependency.itemId):null;
      if(!predecessor) { add('unresolved','La predecesora no se resolvió de forma única entre los elementos activos.',null,dependency.wbs,[`WBS: ${dependency.wbs}`]); continue; }
      if(cyclic.has(predecessor.id)) { add('cycle','La predecesora pertenece a un ciclo; esta relación no es evaluable.',predecessor,dependency.wbs); continue; }
      const end=time(dependency.relation==='finish_start'?predecessor.due:predecessor.start),start=time(item.kind==='milestone'?item.due:item.start);
      const evidence=[`WBS: ${dependency.wbs}`,`Relación: ${dependency.relation==='finish_start'?'Fin–Inicio':'Inicio–Inicio'}`,`Desfase: ${dependency.lagHours} horas`,
        `Estado predecesora: ${predecessor.state}`,`Estado sucesora: ${item.state}`,`Fecha predecesora: ${dependency.relation==='finish_start'?predecessor.due:predecessor.start}`,`Inicio sucesora: ${item.kind==='milestone'?item.due:item.start}`];
      if(start!==null&&end!==null&&start<end+dependency.lagHours*3_600_000) add('planned_conflict','Las fechas planificadas contradicen la relación y el desfase declarados.',predecessor,dependency.wbs,evidence);
      const coherent=predecessor.state!=='unknown'&&item.state!=='unknown'&&(predecessor.state==='completed')===predecessor.dueComplete&&(item.state==='completed')===item.dueComplete;
      if(!coherent||start===null||end===null) add('invalid','Faltan fechas o hay estados contradictorios; parte de la relación no es evaluable.',predecessor,dependency.wbs,evidence);
      if(coherent&&['in_progress','completed'].includes(item.state)&&(dependency.relation==='finish_start'?predecessor.state!=='completed':predecessor.state==='pending'))
        add('declared_conflict','Los estados declarados contradicen el orden de ejecución. No se dispone de fechas reales para acreditar el incumplimiento.',predecessor,dependency.wbs,evidence);
      if(coherent&&item.state==='pending'&&predecessor.state!=='completed'&&time(predecessor.due)!==null&&time(predecessor.due)!<now.getTime())
        add('predecessor_overdue','Una predecesora explícita está pendiente y vencida. La sucesora puede requerir atención; no se calcula un retraso causal.',predecessor,dependency.wbs,evidence);
    }
  }
  return findings;
}
export function baselineDeviations(baseline:TrelloSnapshot,current:TrelloSnapshot):BaselineDeviation[] {
  const old=new Map(active(baseline).map(item=>[item.id,item])); const changes:BaselineDeviation[]=[];
  for(const item of active(current)) {
    const before=old.get(item.id);
    if(!before) changes.push({itemId:item.id,itemName:item.name,field:'added',before:null,after:{name:item.name,start:item.start,due:item.due},hoursShift:null});
    else {
      for(const field of ['name','kind','state','start','due','memberIds'] as const) if(!isDeepStrictEqual(before[field],item[field])) {
        const a=(field==='start'||field==='due')?time(before[field] as string|null):null,b=(field==='start'||field==='due')?time(item[field] as string|null):null;
        changes.push({itemId:item.id,itemName:item.name,field,before:before[field],after:item[field],hoursShift:a!==null&&b!==null?(b-a)/3_600_000:null});
      }
      for(const field of ['wbs','principal','dependencies'] as const) if(!isDeepStrictEqual(before.planning?.[field]??null,item.planning?.[field]??null))
        changes.push({itemId:item.id,itemName:item.name,field,before:before.planning?.[field]??null,after:item.planning?.[field]??null,hoursShift:null});
    }
    old.delete(item.id);
  }
  for(const item of old.values()) changes.push({itemId:item.id,itemName:item.name,field:'not_observed',before:{name:item.name,start:item.start,due:item.due},after:null,hoursShift:null});
  return changes;
}
export function analyzeSources(trello:TrelloOverview|null,github:GitHubOverview,configuration:TrackingPolicyResponse,baseline:{version:number;data:TrelloSnapshot}|null,now:Date):SupervisionResult {
  const tracking=trello?evaluateTracking(trello,now,evaluationPolicy(configuration)):null;
  const rawSource=trello?.latest;
  const source=rawSource?{...rawSource,data:{...rawSource.data,items:rawSource.data.items.map(item=>mappedItem(item,evaluationPolicy(configuration)))}}:null;
  const dependencies=source?analyzeDependencies(source.data,now):[];
  const result:SupervisionResult={analysisVersion:'supervision-v1',evaluatedAt:now.toISOString(),trelloSnapshotId:source?.id??null,githubSnapshotId:github.latest?.id??null,baselineVersion:baseline?.version??null,
    tracking,dependencies,deviations:baseline&&source?baselineDeviations(baseline.data,source.data):[],code:github.latest?.data??null,
    limitations:['Los hallazgos son deterministas; no se ha realizado una revisión de código por IA.',
      'Las dependencias describen relaciones explícitas. No se calculan ruta crítica, probabilidades ni fechas reales de ejecución.',
      'Los estados y checklists son declaraciones de Trello; no acreditan aceptación formal.']};
  if(!source) result.limitations.push('No hay lectura válida de Trello.');
  if(!github.latest) result.limitations.push('No hay lectura válida de GitHub.');
  if(github.lastAttempt?.status==='failed') result.limitations.push('Falló la última lectura de GitHub; se conserva la lectura anterior.');
  if(github.latest) result.limitations.push(`La lectura de GitHub corresponde a ${github.latest.observedAt}; no acredita cambios posteriores.`);
  if(!baseline) result.limitations.push('No hay línea base confirmada; no se calculan desviaciones frente a ella.');
  return result;
}
