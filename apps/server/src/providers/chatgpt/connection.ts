import {createHash} from 'node:crypto';
import type {ProviderConnection} from '@dev-project-agent/contracts';
import {newAttempt,ProviderValidationError,type SignInAttempt} from './validation.js';

export interface ConnectionBinding {projectId:string;userId:string;authVersion:number;sessionId:string}
interface ConnectionEntry {
  account:string;
  sessionHash:string;
  attempt:SignInAttempt|null;status:ProviderConnection['status'];expiresAt:number;
  token:string|null;models:ProviderConnection['models'];errorCode:string|null;controller:AbortController;
}
export class ChatGPTConnections {
  private entries=new Map<string,ConnectionEntry>();
  constructor(private readonly now=Date.now) {}
  private key(binding:ConnectionBinding) {return createHash('sha256').update(JSON.stringify(binding)).digest('hex');}
  private get(binding:ConnectionBinding) {
    const entry=this.entries.get(this.key(binding));
    if(entry&&entry.expiresAt<=this.now()&&!['expired','failed'].includes(entry.status)){
      entry.controller.abort();entry.token=null;entry.attempt=null;entry.models=[];entry.status='expired';entry.errorCode='AUTHORIZATION_EXPIRED';
    }
    return entry;
  }
  sweep() {
    for(const [key,entry] of this.entries)if(entry.expiresAt<=this.now()) {entry.controller.abort();this.entries.delete(key);}
  }
  begin(binding:ConnectionBinding,redirectUri:string,clientId:string|null,subject:string|null) {
    this.sweep();this.disconnect(binding);
    if(this.entries.size>=100)throw new ProviderValidationError('CONNECTION_CAPACITY');
    const attempt=newAttempt(redirectUri,clientId,subject);
    this.entries.set(this.key(binding),{account:binding.projectId+':'+binding.userId,sessionHash:createHash('sha256').update(binding.sessionId).digest('hex'),attempt,status:'pending',expiresAt:this.now()+5*60_000,token:null,models:[],errorCode:null,controller:new AbortController()});
    return attempt;
  }
  consume(binding:ConnectionBinding) {
    const entry=this.get(binding);if(entry?.status!=='pending'||!entry.attempt)throw new ProviderValidationError('NO_PENDING_AUTHORIZATION');
    const attempt=entry.attempt;entry.attempt=null;return {attempt,entry};
  }
  pending(binding:ConnectionBinding) {
    const entry=this.get(binding);if(entry?.status!=='pending'||!entry.attempt)throw new ProviderValidationError('NO_PENDING_AUTHORIZATION');
    return entry.attempt;
  }
  complete(binding:ConnectionBinding,previous:ConnectionEntry,token:string,expiresIn:number,models:ProviderConnection['models']) {
    const entry=this.get(binding);if(entry!==previous||entry.status!=='pending'||entry.controller.signal.aborted)throw new ProviderValidationError('AUTHORIZATION_CANCELLED');
    if(!Number.isFinite(expiresIn)||expiresIn<=0)throw new ProviderValidationError('INVALID_TOKEN_LIFETIME');
    entry.status='connected';entry.expiresAt=this.now()+expiresIn*1000;entry.token=token;entry.models=models;entry.errorCode=null;
  }
  fail(binding:ConnectionBinding,previous:ConnectionEntry,code:string) {
    const entry=this.entries.get(this.key(binding));if(entry!==previous)return;
    entry.controller.abort();entry.token=null;entry.attempt=null;entry.models=[];entry.status='failed';entry.errorCode=code;
  }
  credentials(binding:ConnectionBinding,model:string) {
    const entry=this.get(binding);if(entry?.status!=='connected'||!entry.token)throw new ProviderValidationError('CONNECTION_REQUIRED');
    if(!entry.models.some(value=>value.slug===model))throw new ProviderValidationError('MODEL_NOT_AVAILABLE');
    return {token:entry.token,signal:entry.controller.signal,entry};
  }
  view(binding:ConnectionBinding):ProviderConnection {
    const entry=this.get(binding);
    return entry?{status:entry.status,expiresAt:new Date(entry.expiresAt).toISOString(),models:entry.models,errorCode:entry.errorCode}:{status:'disconnected',expiresAt:null,models:[],errorCode:null};
  }
  restore(binding:ConnectionBinding,token:string,expiresAt:number,models:ProviderConnection['models']) {
    const key=this.key(binding),existing=this.entries.get(key);
    if(existing?.status==='pending')return;
    if(existing?.status==='connected'&&!existing.controller.signal.aborted){existing.token=token;existing.expiresAt=expiresAt;existing.models=models;return;}
    this.entries.set(key,{account:binding.projectId+':'+binding.userId,sessionHash:createHash('sha256').update(binding.sessionId).digest('hex'),attempt:null,status:'connected',expiresAt,token,models,errorCode:null,controller:new AbortController()});
  }
  disconnectAccount(binding:ConnectionBinding) {
    // Keys retain browser isolation, while account disconnect cancels every session cache.
    for(const [key,entry] of this.entries)if(entry.account===binding.projectId+':'+binding.userId){entry.controller.abort();this.entries.delete(key);}
  }
  disconnect(binding:ConnectionBinding) {const key=this.key(binding);this.entries.get(key)?.controller.abort();this.entries.delete(key);}
  disconnectSession(sessionId:string) {const hash=createHash('sha256').update(sessionId).digest('hex');for(const [key,entry] of this.entries)if(entry.sessionHash===hash){entry.controller.abort();this.entries.delete(key);}}
  close() {for(const entry of this.entries.values())entry.controller.abort();this.entries.clear();}
}
