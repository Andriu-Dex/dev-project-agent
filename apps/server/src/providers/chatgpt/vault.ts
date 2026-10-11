import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {ProviderConnection} from '@dev-project-agent/contracts';
import type {TrelloDatabase} from '../../integrations/trello/service.js';
import type {ConnectionBinding} from './connection.js';
import {ProviderValidationError,refreshAccess,revokeAccess} from './validation.js';
import {assertManager} from '../../modules/supervision/access.js';

export interface TokenSet {accessToken:string;refreshToken:string;clientId:string;subject:string}
interface CredentialRow {project_id:string;user_id:string;auth_version:number;ciphertext:string|null;models:ProviderConnection['models'];expires_at:Date;earliest_refresh_at:Date;retry_at:Date|null;state:string;revision:number;failures:number;error_code:string|null;refreshed_at:Date|null}
const context=(binding:Pick<ConnectionBinding,'projectId'|'userId'|'authVersion'>)=>JSON.stringify([binding.projectId,binding.userId,binding.authVersion]);
export function credentialKey(value:string):Buffer {
  if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('CHATGPT_CREDENTIAL_KEY must contain 32 hexadecimal bytes. Run npm run setup.');
  return Buffer.from(value,'hex');
}
export function sealTokens(key:Buffer,binding:Pick<ConnectionBinding,'projectId'|'userId'|'authVersion'>,tokens:TokenSet) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(context(binding)));
  const data=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function openTokens(key:Buffer,binding:Pick<ConnectionBinding,'projectId'|'userId'|'authVersion'>,value:string):TokenSet {
  try {
    const [version,iv,tag,data,...extra]=value.split('.');if(version!=='v1'||!iv||!tag||!data||extra.length)throw new Error();
    const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(context(binding)));cipher.setAuthTag(Buffer.from(tag,'base64url'));
    const tokens=JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8')) as TokenSet;
    if(!tokens||[tokens.accessToken,tokens.refreshToken,tokens.clientId,tokens.subject].some(value=>typeof value!=='string'||!value||value.length>64_000))throw new Error();return tokens;
  }catch{throw new ProviderValidationError('CREDENTIAL_STORAGE_UNAVAILABLE');}
}
export class CredentialVault {
  private tasks=new Map<string,Promise<CredentialRow|null>>();
  constructor(private readonly database:TrelloDatabase,private readonly key:Buffer,private readonly fetcher:typeof fetch=fetch) {}
  async recover() {
    // A crashed rotation may have consumed its old refresh token. Never replay it.
    await this.database.query("UPDATE chatgpt_credentials SET state='reauthorization_required',ciphertext=NULL,error_code='REFRESH_UNCERTAIN',revision=revision+1 WHERE state='refreshing'");
  }
  async save(binding:ConnectionBinding,tokens:TokenSet,expiresAt:number,models:ProviderConnection['models'],earliestRefreshAt:number) {
    await this.database.query(`INSERT INTO chatgpt_credentials(project_id,user_id,auth_version,ciphertext,models,expires_at,earliest_refresh_at,state) VALUES($1,$2,$3,$4,$5,$6,$7,'active')
      ON CONFLICT(project_id,user_id) DO UPDATE SET auth_version=EXCLUDED.auth_version,ciphertext=EXCLUDED.ciphertext,models=EXCLUDED.models,expires_at=EXCLUDED.expires_at,earliest_refresh_at=EXCLUDED.earliest_refresh_at,state='active',revision=chatgpt_credentials.revision+1,failures=0,error_code=NULL,retry_at=NULL`,
    [binding.projectId,binding.userId,binding.authVersion,sealTokens(this.key,binding,tokens),JSON.stringify(models),new Date(expiresAt),new Date(earliestRefreshAt)]);
  }
  private async row(binding:ConnectionBinding) {return (await this.database.query<CredentialRow>('SELECT * FROM chatgpt_credentials WHERE project_id=$1 AND user_id=$2 AND auth_version=$3',[binding.projectId,binding.userId,binding.authVersion])).rows[0]??null;}
  async metadata(binding:ConnectionBinding){const row=await this.row(binding);return {renewable:!!row?.ciphertext&&['active','refreshing'].includes(row.state),retryAt:row?.retry_at?.toISOString()??null,lastRefreshedAt:row?.refreshed_at?.toISOString()??null};}
  async clear(binding:ConnectionBinding,code:string|null=null,expectedRevision:number|null=null) {
    await this.database.query("UPDATE chatgpt_credentials SET ciphertext=NULL,models='[]',state=$3,error_code=$4,revision=revision+1 WHERE project_id=$1 AND user_id=$2 AND ($5::integer IS NULL OR (auth_version=$6 AND revision=$5))",[binding.projectId,binding.userId,code?'reauthorization_required':'disconnected',code,expectedRevision,binding.authVersion]);
  }
  tokens(binding:ConnectionBinding,row:CredentialRow) {if(!row.ciphertext)throw new ProviderValidationError('CONNECTION_REQUIRED');return openTokens(this.key,binding,row.ciphertext);}
  ensure(binding:ConnectionBinding):Promise<CredentialRow|null> {
    const id=context(binding),existing=this.tasks.get(id);if(existing)return existing;
    const task=this.renew(binding).finally(()=>this.tasks.delete(id));this.tasks.set(id,task);return task;
  }
  private async renew(binding:ConnectionBinding):Promise<CredentialRow|null> {
    await assertManager(this.database,binding.projectId,{id:binding.userId,auth_version:binding.authVersion});
    const row=await this.row(binding);if(!row||row.state==='disconnected')return null;
    if(row.state!=='active')throw new ProviderValidationError(row.error_code??'REFRESH_IN_PROGRESS');
    const now=Date.now();
    if(row.expires_at.getTime()>now+120_000||row.earliest_refresh_at.getTime()>now||row.retry_at&&row.retry_at.getTime()>now){
      if(row.expires_at.getTime()<=now)throw new ProviderValidationError(row.error_code??'REFRESH_UNAVAILABLE');return row;
    }
    const tokens=this.tokens(binding,row);
    const claim=await this.database.query("UPDATE chatgpt_credentials SET state='refreshing',revision=revision+1 WHERE project_id=$1 AND user_id=$2 AND auth_version=$3 AND state='active' AND revision=$4 RETURNING revision",[binding.projectId,binding.userId,binding.authVersion,row.revision]);
    if(!claim.rows.length)throw new ProviderValidationError('REFRESH_IN_PROGRESS');
    const revision=row.revision+1;
    try{
      const refreshed=await refreshAccess(tokens.clientId,tokens.refreshToken,this.fetcher);
      await assertManager(this.database,binding.projectId,{id:binding.userId,auth_version:binding.authVersion});
      const replacement={...tokens,accessToken:refreshed.accessToken,refreshToken:refreshed.refreshToken};
      const expiresAt=Date.now()+refreshed.expiresIn*1000;
      const updated=await this.database.query(`UPDATE chatgpt_credentials SET ciphertext=$4,expires_at=$5,earliest_refresh_at=$6,state='active',failures=0,error_code=NULL,retry_at=NULL,refreshed_at=clock_timestamp()
        WHERE project_id=$1 AND user_id=$2 AND revision=$3 AND state='refreshing' RETURNING *`,[binding.projectId,binding.userId,revision,sealTokens(this.key,binding,replacement),new Date(expiresAt),new Date(refreshed.earliestRefreshAt)]);
      if(!updated.rows.length){try{await revokeAccess(tokens.clientId,refreshed.refreshToken,this.fetcher);}catch{}throw new ProviderValidationError('AUTHORIZATION_CANCELLED');}
      await this.database.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,'system',NULL,'provider.refresh','provider',$2,'succeeded')",[binding.projectId,binding.userId]);
      return updated.rows[0] as CredentialRow;
    }catch(error){
      const code=error instanceof ProviderValidationError?error.code:'REFRESH_UNCERTAIN',transient=code==='REFRESH_UNAVAILABLE';
      const failed=await this.database.query(`UPDATE chatgpt_credentials SET state=$4,error_code=$5,ciphertext=CASE WHEN $6 THEN ciphertext ELSE NULL END,failures=failures+1,retry_at=$7
        WHERE project_id=$1 AND user_id=$2 AND revision=$3 AND state='refreshing' RETURNING revision`,[binding.projectId,binding.userId,revision,transient?'active':'reauthorization_required',code,transient||code==='INVALID_CLIENT',new Date(Date.now()+Math.min(15*60_000,60_000*2**Math.min(row.failures,4)))]);
      if(failed.rows.length)await this.database.query("INSERT INTO audit_events(project_id,actor_type,actor_id,action,resource_type,resource_id,outcome) VALUES($1,'system',NULL,'provider.refresh','provider',$2,'failed')",[binding.projectId,binding.userId]);
      if(transient&&row.expires_at.getTime()>Date.now())return await this.row(binding);
      throw new ProviderValidationError(code);
    }
  }
  async disconnect(binding:ConnectionBinding) {
    const row=await this.row(binding);let confirmed=true;
    // Clear first to fence an in-flight rotation; retain only a local copy for revocation.
    let tokens:TokenSet|null=null;try{if(row?.ciphertext)tokens=this.tokens(binding,row);}catch{confirmed=false;}
    await this.clear(binding);
    if(tokens)try{await revokeAccess(tokens.clientId,tokens.refreshToken,this.fetcher);}catch{confirmed=false;}
    return confirmed;
  }
  async renewAll() {
    const rows=await this.database.query<{project_id:string;user_id:string;auth_version:number;revision:number}>("SELECT project_id,user_id,auth_version,revision FROM chatgpt_credentials WHERE state='active' AND expires_at<=clock_timestamp()+interval '2 minutes' AND (retry_at IS NULL OR retry_at<=clock_timestamp()) ORDER BY expires_at LIMIT 100");
    for(const row of rows.rows){const binding={projectId:row.project_id,userId:row.user_id,authVersion:row.auth_version,sessionId:'background-renewal'};try{await this.ensure(binding);}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='FORBIDDEN')await this.clear(binding,'FORBIDDEN',row.revision);}}
  }
  async close(){await Promise.allSettled(this.tasks.values());}
}
