import nodemailer from 'nodemailer';

export class MailError extends Error {
  constructor(readonly code:string) { super('Mail operation could not complete.'); }
}
export interface MailMessage {to:string;subject:string;text:string;html:string;messageId:string}
export interface MailTransport {verify():Promise<void>;send(message:MailMessage):Promise<void>}
export function mailFailure(error:unknown) {
  const value=error as {code?:string;command?:string;responseCode?:number};
  if(value instanceof MailError)return value.code;
  if(value.code==='EAUTH')return 'SMTP_AUTHENTICATION_FAILED';
  if(value.responseCode&&value.responseCode>=500)return 'SMTP_REJECTED';
  if(value.responseCode&&value.responseCode>=400)return 'SMTP_TEMPORARY_FAILURE';
  if(value.command==='DATA'||value.command==='.')return 'SMTP_RESULT_UNCERTAIN';
  if(['EDNS','ECONNREFUSED'].includes(value.code??'')||value.command==='CONN')return 'SMTP_CONNECTION_FAILED';
  return 'SMTP_RESULT_UNCERTAIN';
}
export function smtpFromEnvironment(env:NodeJS.ProcessEnv):{transport:MailTransport|null;status:string} {
  const host=env.SMTP_HOST?.trim(),user=env.SMTP_USER?.trim(),pass=env.SMTP_PASS;
  if(!host&&!user&&!pass)return {transport:null,status:'NOT_CONFIGURED'};
  const port=Number(env.SMTP_PORT??587),secure=env.SMTP_SECURE===undefined?port===465:env.SMTP_SECURE==='true';
  if(!host||!user||!pass||!Number.isInteger(port)||port<1||port>65535||!/^\S+@[^\s@]+\.[^\s@]+$/.test(user)||/[\r\n]/.test(host)||env.SMTP_SECURE!==undefined&&!['true','false'].includes(env.SMTP_SECURE)||port===465&&!secure||port===587&&secure)return {transport:null,status:'INVALID_SMTP_CONFIGURATION'};
  const client=nodemailer.createTransport({host,port,secure,requireTLS:!secure,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  return {status:'CONFIGURED',transport:{
    async verify(){try{await client.verify();}catch(error){throw new MailError(mailFailure(error));}},
    async send(message){try{const info=await client.sendMail({from:{name:'Dev Project Agent',address:user},...message});if(info.rejected.length||!info.accepted.length)throw new MailError('SMTP_REJECTED');}catch(error){throw new MailError(mailFailure(error));}},
  }};
}
