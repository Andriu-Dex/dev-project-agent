import {describe,expect,it} from 'vitest';
import {ChatGPTConnections,type ConnectionBinding} from './connection.js';
import {evaluationCases,gradeCase} from './evaluation.js';

const binding:ConnectionBinding={projectId:'project',userId:'user',authVersion:1,sessionId:'session'};
const models=[{slug:'test-model',displayName:'Test Model'}];
describe('ChatGPT connection isolation',()=>{
  it('binds pending callbacks and credentials to project, user, session and auth version',()=>{
    const store=new ChatGPTConnections();store.begin(binding,'http://127.0.0.1/callback',null,null);
    for(const other of [{...binding,projectId:'other'},{...binding,userId:'other'},{...binding,sessionId:'other'},{...binding,authVersion:2}]){
      expect(store.view(other).status).toBe('disconnected');expect(()=>store.pending(other)).toThrow();
    }
    const consumed=store.consume(binding);expect(()=>store.consume(binding)).toThrow();
    store.complete(binding,consumed.entry,'synthetic-secret',3600,models);
    expect(store.credentials(binding,'test-model').token).toBe('synthetic-secret');expect(JSON.stringify(store.view(binding))).not.toContain('synthetic-secret');
    expect(()=>store.credentials(binding,'not-in-catalog')).toThrow();
  });
  it('uses the provider token lifetime and cancels requests on expiry',()=>{
    let now=1000;const store=new ChatGPTConnections(()=>now);store.begin(binding,'http://127.0.0.1/callback',null,null);
    const consumed=store.consume(binding);store.complete(binding,consumed.entry,'secret',3600,models);const credentials=store.credentials(binding,'test-model');
    now+=30*60_000;expect(store.view(binding).status).toBe('connected');now+=30*60_000;expect(store.view(binding).status).toBe('expired');expect(credentials.signal.aborted).toBe(true);expect(()=>store.credentials(binding,'test-model')).toThrow();
  });
  it('prevents delayed callbacks from restoring a disconnected or replaced connection',()=>{
    const store=new ChatGPTConnections();store.begin(binding,'http://127.0.0.1/callback',null,null);const consumed=store.consume(binding);
    store.disconnectSession(binding.sessionId);expect(()=>store.complete(binding,consumed.entry,'secret',3600,models)).toThrow();
    store.begin(binding,'http://127.0.0.1/callback',null,null);store.fail(binding,consumed.entry,'OLD_FAILURE');expect(store.view(binding).status).toBe('pending');
    store.close();expect(store.view(binding).status).toBe('disconnected');
  });
  it('requires reauthorization after the pending callback deadline',()=>{
    let now=0;const store=new ChatGPTConnections(()=>now);store.begin(binding,'http://127.0.0.1/callback',null,null);now=300_000;
    expect(()=>store.pending(binding)).toThrow();store.sweep();expect(store.view(binding).status).toBe('disconnected');
  });
});
describe('Synthetic provider quality grading',()=>{
  it('grades all representative expectations without relying on model wording',()=>{
    for(const test of evaluationCases){
      const raw={caseId:test.id,classification:test.classification,evidenceIds:test.evidence.map(value=>value.id),requiresHumanApproval:true,recommendation:'Revisar con el gestor.',unknowns:['Causa o aceptación no informada.']};
      expect(gradeCase(test,raw,100,null).passed).toBe(true);
      expect(gradeCase(test,{...raw,evidenceIds:['invented']},100,null).passed).toBe(false);
      expect(gradeCase(test,{...raw,requiresHumanApproval:false},100,null).passed).toBe(false);
      expect(gradeCase(test,{...raw,caseId:'different'},100,null).passed).toBe(false);
      expect(gradeCase(test,{...raw,execute:'rm anything'},100,null).output).toBeNull();
    }
  });
  it('rejects missing uncertainty, malformed output and unjustified classification',()=>{
    const test=evaluationCases[0]!;const raw={caseId:test.id,classification:'overdue',evidenceIds:['task-1'],requiresHumanApproval:true,recommendation:'Revisar.',unknowns:[]};
    expect(gradeCase(test,raw,100,null).checks).toContainEqual({code:'uncertainty',passed:false});
    expect(gradeCase(test,{...raw,classification:'completed'},100,null).passed).toBe(false);
    for(const invalid of [null,[],{...raw,recommendation:'x'.repeat(1201)},{...raw,unknowns:['x'.repeat(601)]}])expect(gradeCase(test,invalid,100,null).errorCode).toBe('INVALID_MODEL_OUTPUT');
  });
});
