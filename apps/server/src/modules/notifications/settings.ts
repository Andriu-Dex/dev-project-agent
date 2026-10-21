import {MailError} from './smtp.js';
export const eventKinds=['overdue','blocked','due_soon','baseline_deviation','dependency_risk','source_failure','report_ready'] as const;
export type EventKind=typeof eventKinds[number];
export interface NotificationSettings {
  audienceByEvent?:Partial<Record<EventKind,'manager'|'responsibles'|'both'>>;
  audience?:'manager'|'responsibles'|'both';contacts?:{memberId:string;email:string}[];phaseContacts?:{listId:string;email:string}[];fallbackToManager?:boolean;
  enabled:boolean;recipient:string;events:EventKind[];mode:'immediate'|'digest';digestTime:string;
  reminderHours:number;quietEnabled:boolean;quietStart:string;quietEnd:string;maxPerDay:number;
}
export const defaultSettings:NotificationSettings={enabled:false,recipient:'',events:['overdue','blocked','report_ready','source_failure'],mode:'digest',digestTime:'18:00',reminderHours:24,quietEnabled:true,quietStart:'21:00',quietEnd:'08:00',maxPerDay:20};
export const validTime=(value:unknown):value is string=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validateSettings(value:NotificationSettings) {
  const email=(text:string)=>typeof text==='string'&&text.length<=254&&/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(text);
  if(value.audienceByEvent&&(typeof value.audienceByEvent!=='object'||Array.isArray(value.audienceByEvent)||Object.entries(value.audienceByEvent).some(([key,value])=>!eventKinds.includes(key as EventKind)||!['manager','responsibles','both'].includes(value))))throw new MailError('INVALID_REQUEST');
  if(value.audience&&!['manager','responsibles','both'].includes(value.audience)||value.fallbackToManager!==undefined&&typeof value.fallbackToManager!=='boolean')throw new MailError('INVALID_REQUEST');
  for(const [rows,key] of [[value.contacts,'memberId'],[value.phaseContacts,'listId']] as const){
    if(rows!==undefined&&(!Array.isArray(rows)||rows.length>50||rows.some(row=>!email(row.email)||!('memberId' in row?/^[a-f0-9]{24}$/.test(row.memberId):/^[a-f0-9]{24}$/.test(row.listId)))||new Set(rows.map(row=>row[key as keyof typeof row])).size!==rows.length))throw new MailError('INVALID_REQUEST');
  }
  if(typeof value.enabled!=='boolean'||typeof value.recipient!=='string'||value.recipient.length>254||value.recipient!==''&&!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.recipient)||value.enabled&&!value.recipient||!Array.isArray(value.events)||value.events.some(kind=>!eventKinds.includes(kind))||new Set(value.events).size!==value.events.length||value.enabled&&!value.events.length||!['immediate','digest'].includes(value.mode)||![value.digestTime,value.quietStart,value.quietEnd].every(validTime)||typeof value.quietEnabled!=='boolean'||value.quietEnabled&&value.quietStart===value.quietEnd||!Number.isInteger(value.reminderHours)||value.reminderHours!==0&&(value.reminderHours<1||value.reminderHours>720)||!Number.isInteger(value.maxPerDay)||value.maxPerDay<1||value.maxPerDay>100)throw new MailError('INVALID_REQUEST');
}
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export function deliveryTime(settings:NotificationSettings,now:Date) {
  const local=new Date(now.getTime()-5*3600000),minute=local.getUTCHours()*60+local.getUTCMinutes();
  let target=new Date(now);
  if(settings.mode==='digest'){
    const time=minutes(settings.digestTime);target.setTime(now.getTime()+(time-minute)*60000);target.setUTCSeconds(0,0);
    if(target<now)target.setUTCDate(target.getUTCDate()+1);
  }
  if(settings.quietEnabled){
    const start=minutes(settings.quietStart),end=minutes(settings.quietEnd),current=new Date(target.getTime()-5*3600000),m=current.getUTCHours()*60+current.getUTCMinutes();
    if(start<end?m>=start&&m<end:m>=start||m<end){target.setTime(target.getTime()+((end-m+1440)%1440)*60000);target.setUTCSeconds(0,0);}
  }
  return target;
}
const escape=(text:string)=>text.replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!));
export function renderNotification(project:string,summaries:string[],baseUrl:string,test=false,section:'alerts'|'reports'|'operations'|'overview'='alerts'){
  const subject=(test?'Correo de prueba':'Seguimiento del proyecto')+' · '+project.replace(/[\r\n]/g,' ').slice(0,100);
  const lines=[test?'La configuración de correo pudo enviar este mensaje.':'Hay novedades que requieren tu atención.',...summaries,'Consulta las evidencias y decisiones en el panel: '+baseUrl+'/#'+section,'Este aviso no autoriza ni ejecuta cambios en Trello o GitHub.','Si el panel funciona en localhost, el enlace solo abre en el equipo donde está instalado.'];
  return {subject,text:lines.join('\n\n'),html:`<html lang="es"><body style="font-family:Arial,sans-serif;color:#1e293b"><h1 style="color:#1d4ed8">${escape(subject)}</h1>${lines.map(line=>'<p>'+escape(line)+'</p>').join('')}</body></html>`};
}
