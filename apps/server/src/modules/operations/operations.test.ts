import {describe,it,expect} from 'vitest';
import {nextDaily,occurrenceKey} from './service.js';
import {riskAssessment} from './risks.js';
import {normalizeBoard} from '../../integrations/trello/normalize.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
describe('Scheduled cuts and evidence-based risks',()=>{
  it('computes daily Ecuador cuts across UTC midnight and at the exact boundary',()=>{
    expect(nextDaily(new Date('2026-10-12T02:00:00Z'),23).toISOString()).toBe('2026-10-12T04:00:00.000Z');
    expect(nextDaily(new Date('2026-10-12T04:00:00Z'),23).toISOString()).toBe('2026-10-13T04:00:00.000Z');
    expect(nextDaily(new Date('2026-10-12T03:00:00Z'),0).toISOString()).toBe('2026-10-12T05:00:00.000Z');
    const key=occurrenceKey('project',1,'sources',new Date(0));expect(key).toMatch(/^[a-f0-9-]{36}$/);expect(occurrenceKey('project',1,'sources',new Date(0))).toBe(key);expect(occurrenceKey('project',2,'sources',new Date(0))).not.toBe(key);
  });
  it('retains documented causes and traverses explicit dependencies without inventing availability',()=>{
    const snapshot=normalizeBoard(boardFixture(),boardId,[listId]),item=snapshot.items[0]!;
    item.planning!.description='CAUSA DE RETRASO: Falta respuesta del área solicitante.';
    snapshot.items.push({...item,id:'e'.repeat(24),name:'Successor',planning:{...item.planning!,dependencies:[{itemId:item.id,wbs:'1.1',relation:'finish_start',lagHours:0}]}});
    const finding={id:'f',itemId:item.id,itemName:item.name,kind:'activity' as const,code:'overdue' as const,attention:'immediate' as const,message:'Expired target',evidence:[],impact:'not_assessed' as const};
    const policy={version:1,dueSoonHours:72,staleAfterMinutes:60,confirmed:true,changedAt:new Date().toISOString(),changedBy:null,priorityLabels:{ALTA:'high' as const}};
    const assessment=riskAssessment(snapshot,finding,policy);expect(assessment.cause.status).toBe('documented');expect(assessment.impactedItems.map(item=>item.name)).toEqual(['Successor']);expect(assessment.alternatives).toHaveLength(4);
    item.planning!.description='Untrusted text without causal evidence.';expect(riskAssessment(snapshot,finding,policy).cause.status).toBe('hypothesis');
  });
});
