import { describe,expect,it } from 'vitest';
import { normalizeBoard } from '../../integrations/trello/normalize.js';
import { boardFixture,boardId,listId } from '../../integrations/trello/fixtures.js';
import { parsePlanning } from '../../integrations/trello/planning.js';
import { analyzeDependencies,baselineDeviations,analyzeSources } from './analyze.js';
function snapshot(first='Ninguna',second='1.1 (Fin–Inicio; desfase 0)') {
  const board=boardFixture();
  const a={...board.cards[0]!,desc:`CÓDIGO WBS: 1.1\nPREDECESORAS WBS: ${first}`,idChecklists:[]};
  const b={...a,id:'e'.repeat(24),name:'Successor',desc:`CÓDIGO WBS: 1.2\nPREDECESORAS WBS: ${second}`};
  return normalizeBoard({...board,cards:[a,b]},boardId,[listId]);
}
describe('Explicit planning and dependency analysis',()=>{
  it('applies the same declared-state policy to both baseline and current evidence',()=>{
    const baseline=snapshot(),current=structuredClone(baseline),now=new Date('2026-10-11T12:00:00Z');
    baseline.items[0]!.labelNames=['Working'];current.items[0]!.labelNames=['Working'];baseline.items[0]!.state='unknown';current.items[0]!.state='unknown';
    const configuration={version:1,dueSoonHours:72,staleAfterMinutes:60,confirmed:true,changedAt:now.toISOString(),changedBy:null,stateLabels:{Working:'in_progress' as const}};
    const result=analyzeSources({connection:null,lastAttempt:null,latest:{id:'snapshot',observedAt:now.toISOString(),source:'api',data:current,changes:[]}}, {connection:null,latest:null,lastAttempt:null},configuration,{version:1,data:baseline},now);
    expect(result.deviations).toEqual([]);expect(result.tracking?.items[0]?.declaredState).toBe('in_progress');
    current.items[0]!.labelNames.push('Urgent');
    expect(baselineDeviations(baseline,current)).toContainEqual(expect.objectContaining({field:'labelNames',before:['Working'],after:['Working','Urgent']}));
    expect(baseline.items[0]!.state).toBe('unknown');
  });
  it('parses explicit types and lags and preserves absent information',()=>{
    expect(parsePlanning('CÓDIGO WBS: 2.1\nPREDECESORAS WBS: 1.1 (Fin–Inicio; desfase 2 días), 1.2 (Inicio-Inicio; desfase -3 horas)')).toMatchObject({wbs:'2.1',dependencyDeclaration:'provided',dependencies:[{relation:'finish_start',lagHours:48},{relation:'start_start',lagHours:-3}]});
    expect(parsePlanning('Finish 1.1 before starting')).toMatchObject({wbs:null,dependencyDeclaration:'unavailable'});
    for(const invalid of ['1.1 (Fin–Inicio; desfase 2)','1.1 (Fin–Fin; desfase 0)','1.1 (Fin–Inicio; desfase 0) other instructions'])expect(parsePlanning('PREDECESORAS WBS: '+invalid).dependencyDeclaration).toBe('invalid');
  });
  it('resolves active WBS uniquely and refuses duplicates or missing references',()=>{
    const data=snapshot();expect(data.items[1]!.planning!.dependencies[0]!.itemId).toBe(data.items[0]!.id);
    const unresolved=snapshot('Ninguna','9.9 (Fin–Inicio; desfase 0)');expect(analyzeDependencies(unresolved,new Date('2026-10-11T12:00:00Z'))).toContainEqual(expect.objectContaining({code:'unresolved',predecessorWbs:'9.9'}));
    const board=boardFixture();const card={...board.cards[0]!,desc:'CÓDIGO WBS: 1.1\nPREDECESORAS WBS: 1.1 (Fin–Inicio; desfase 0)'};
    const duplicate=normalizeBoard({...board,cards:[card,{...card,id:'e'.repeat(24)}]},boardId,[listId]);
    expect(duplicate.items.every(item=>item.qualityIssues.includes('duplicate_wbs'))).toBe(true);expect(duplicate.items[0]!.planning!.dependencies[0]!.itemId).toBeNull();
  });
  it('reports cycles and planned/declared conflicts without claiming actual execution dates',()=>{
    expect(analyzeDependencies(snapshot('1.2 (Fin–Inicio; desfase 0)'),new Date('2026-10-11T12:00:00Z')).filter(finding=>finding.code==='cycle')).toHaveLength(2);
    const data=snapshot();data.items[1]!.state='in_progress';
    const findings=analyzeDependencies(data,new Date('2026-10-11T12:00:00Z'));
    expect(findings.map(finding=>finding.code)).toContain('planned_conflict');expect(findings.map(finding=>finding.code)).toContain('declared_conflict');
    expect(findings.find(finding=>finding.code==='declared_conflict')!.message).toContain('No se dispone de fechas reales');
  });
  it('keeps missing legacy data distinct from explicitly no predecessors',()=>{
    const data=snapshot();delete data.items[0]!.planning;
    expect(analyzeDependencies(data,new Date()).some(finding=>finding.itemId===data.items[0]!.id&&finding.code==='unavailable')).toBe(true);
    expect(analyzeDependencies(snapshot('Ninguna','Ninguna'),new Date())).toEqual([]);
  });
  it('records baseline changes, additions and exclusions without overwriting the reference',()=>{
    const baseline=snapshot(),current=structuredClone(baseline);
    current.items[0]!.due='2026-10-11T22:00:00.000Z';current.items[1]!.archived=true;
    current.items.push({...current.items[0]!,id:'f'.repeat(24),name:'New scope'});
    const changes=baselineDeviations(baseline,current);
    expect(changes).toContainEqual(expect.objectContaining({field:'due',hoursShift:24}));expect(changes.map(change=>change.field)).toContain('added');expect(changes.map(change=>change.field)).toContain('not_observed');
    expect(baseline.items[0]!.due).toBe('2026-10-10T22:00:00.000Z');
  });
  it('preserves checklist declarations and rejects unresolved checklist references',()=>{
    const board=boardFixture(),checklistId='f'.repeat(24);
    const card={...board.cards[0]!,desc:'CÓDIGO WBS: 1.1\nPREDECESORAS WBS: Ninguna',idChecklists:[checklistId]};
    expect(()=>normalizeBoard({...board,cards:[card]},boardId,[listId])).toThrow();
    const data=normalizeBoard({...board,cards:[card],checklists:[{id:checklistId,idCard:card.id,name:'Evidence',checkItems:[{id:'e'.repeat(24),name:'Reviewed',state:'complete'}]}]},boardId,[listId]);
    expect(data.items[0]!.planning!.checklists[0]!.items[0]!.completedDeclared).toBe(true);
  });
});
