import {describe,it,expect} from 'vitest';
import {normalizeBoard} from '../../integrations/trello/normalize.js';
import {boardFixture,boardId,listId} from '../../integrations/trello/fixtures.js';
import {buildAction,matchesAction,restoreExpected} from './actions.js';
import {fingerprint,parseContent} from './contracts.js';
import {syntheticContent} from './fixtures.js';
describe('Bounded Trello change families',()=>{
  const snapshot=()=>normalizeBoard(boardFixture(),boardId,[listId]);
  const policy={version:1,dueSoonHours:72,staleAfterMinutes:60,confirmed:true,changedAt:new Date().toISOString(),changedBy:null,priorityLabels:{ALTA:'high' as const,BAJA:'low' as const},stateLabels:{PENDIENTE:'pending' as const,COMPLETADA:'completed' as const},blockedLabels:['BLOQUEADA']};
  it('preserves unrelated labels and coherently pairs state with declared completion',()=>{
    const source=snapshot(),item=source.items[0]!;item.labelNames.push('BAJA','DELIVERY');
    const priority=buildAction(item,source,policy,{family:'priority',label:'ALTA'});expect(priority).toMatchObject({proposedLabels:['ALTA','DELIVERY','PENDIENTE'],proposedDueComplete:false});
    const state=buildAction(item,source,policy,{family:'state',label:'COMPLETADA'});expect(state).toMatchObject({proposedLabels:['BAJA','COMPLETADA','DELIVERY'],proposedDueComplete:true});
    item.labelNames.push('BLOQUEADA');expect(()=>buildAction(item,source,policy,{family:'state',label:'COMPLETADA'})).toThrow();expect(()=>buildAction(item,source,policy,{family:'priority',label:'UNMAPPED'})).toThrow();
  });
  it('requires coherent dates and eligible, nonempty members',()=>{
    const source=snapshot(),item=source.items[0]!,due=new Date(Date.now()+2*86_400_000).toISOString(),start=new Date(Date.now()+86_400_000).toISOString();
    expect(buildAction(item,source,policy,{family:'dates',start,due}).type).toBe('trello_dates_change');expect(()=>buildAction(item,source,policy,{family:'dates',start:due,due:start})).toThrow();
    expect(()=>buildAction(item,source,policy,{family:'members',memberIds:[]})).toThrow();expect(()=>buildAction(item,source,policy,{family:'members',memberIds:['f'.repeat(24)]})).toThrow();
  });
  it('seals the exact action and verifies all proposed fields while detecting collateral changes',()=>{
    const source=snapshot(),item=source.items[0]!,action=buildAction(item,source,policy,{family:'state',label:'COMPLETADA'});
    if(!('proposedLabels' in action))throw new Error('Wrong action fixture');
    const after={...item,labelNames:action.proposedLabels,dueComplete:true,state:'completed' as const};expect(matchesAction(after,action)).toBe(true);expect(fingerprint(restoreExpected(after,action,item.state))).toBe(fingerprint(item));expect(matchesAction({...after,dueComplete:false},action)).toBe(false);
    const context={schemaVersion:1 as const,projectId:'p',sourceRunId:'r',trelloSnapshotId:'s',policyVersion:1,baselineVersion:null,observedAt:new Date().toISOString(),card:{id:item.id,name:item.name,state:item.state,due:item.due,start:item.start,wbs:null},sourceFingerprint:'sealed',requestedAction:action,evidence:[{id:'card.labelNames',field:'labelNames',value:item.labelNames}],limitations:[]};
    const content=syntheticContent({context,requestedDue:''});expect(parseContent(content,context,null)).toEqual(content);expect(()=>parseContent({...content,actions:[{...action,proposedDueComplete:false}]},context,null)).toThrow();
  });
});
