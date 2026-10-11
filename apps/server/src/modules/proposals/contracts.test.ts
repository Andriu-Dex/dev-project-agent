import {describe,expect,it} from 'vitest';
import {assertTargetDate,fingerprint,parseContent,parseVerdict,safeText,type ProposalContext} from './contracts.js';
import {syntheticContent,syntheticVerdict} from './fixtures.js';
const context:ProposalContext={schemaVersion:1,projectId:'project',sourceRunId:'run',trelloSnapshotId:'snapshot',policyVersion:1,baselineVersion:null,observedAt:'2026-10-11T12:00:00Z',card:{id:'card',name:'Activity',due:null,start:null,state:'pending',wbs:'1.1'},sourceFingerprint:'source',evidence:[{id:'card.due',field:'due',value:null}],limitations:[]};
const due='2026-11-01T12:00:00.000Z';
describe('Sealed proposal contracts',()=>{
  it('rejects past targets and targets before the recorded start while allowing a coherent future target',()=>{
    const now=Date.parse('2026-10-11T13:00:00Z'),start='2026-10-13T13:00:00Z';
    expect(()=>assertTargetDate('2026-10-11T14:16:00Z',start,now)).toThrowError(expect.objectContaining({code:'TARGET_BEFORE_START'}));
    expect(()=>assertTargetDate('2026-10-11T12:00:00Z',null,now)).toThrowError(expect.objectContaining({code:'INVALID_TARGET_DATE'}));
    expect(()=>assertTargetDate(start,start,now)).not.toThrow();expect(()=>assertTargetDate('2026-10-16T22:00:00Z',start,now)).not.toThrow();
  });
  it('rejects arbitrary targets, extra actions, oversized context and fabricated evidence',()=>{const content=syntheticContent({context,requestedDue:due});expect(parseContent(content,context,due)).toEqual(content);for(const changed of [{...content,actions:[{...content.actions[0],cardId:'other'}]},{...content,actions:[...content.actions,...content.actions]},{...content,evidenceIds:['card.due','invented']},{...content,executed:true},{...content,risks:Array(12).fill('x'.repeat(1800))}])expect(()=>parseContent(changed,context,due)).toThrow();});
  it('blocks unauthorized, unchecked and mismatched positive verdicts',()=>{const hash=fingerprint(context),verdict=syntheticVerdict('approver',hash);expect(parseVerdict(verdict,'approver',hash).verdict).toBe('human_required');for(const changed of [{...verdict,verdict:'authorized'},{...verdict,verdict:'policy_allowed'},{...verdict,contentHash:'other'},{...verdict,checks:verdict.checks.map(check=>({...check,status:'not_checked'}))}])expect(()=>parseVerdict(changed,'approver',hash)).toThrow();});
  it('binds hashes to content while ignoring object key order',()=>{expect(fingerprint({a:1,b:2})).toBe(fingerprint({b:2,a:1}));expect(fingerprint({a:2,b:2})).not.toBe(fingerprint({a:1,b:2}));});
  it('prevents sending common credential formats in manager text',()=>{for(const value of ['sk-'+ 'a'.repeat(24),'token = '+'b'.repeat(24),'-----BEGIN PRIVATE KEY'])expect(()=>safeText(value)).toThrow();});
});
