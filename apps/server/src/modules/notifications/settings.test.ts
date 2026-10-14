import {describe,it,expect} from 'vitest';
import {defaultSettings,deliveryTime,renderNotification,validateSettings} from './settings.js';
import {smtpFromEnvironment,mailFailure} from './smtp.js';
import {nextDaily} from '../operations/service.js';
describe('Notification scheduling and transport boundaries',()=>{
  it('defers an overnight quiet window and respects its exact end',()=>{
    const settings={...defaultSettings,mode:'immediate' as const};
    expect(deliveryTime(settings,new Date('2026-10-15T03:00:00Z')).toISOString()).toBe('2026-10-15T13:00:00.000Z');
    expect(deliveryTime(settings,new Date('2026-10-15T13:00:00Z')).toISOString()).toBe('2026-10-15T13:00:00.000Z');
  });
  it('schedules a daily digest without inventing a past occurrence',()=>{
    expect(deliveryTime({...defaultSettings,quietEnabled:false},new Date('2026-10-14T23:00:01Z')).toISOString()).toBe('2026-10-15T23:00:00.000Z');
    expect(deliveryTime({...defaultSettings,digestTime:'22:00'},new Date('2026-10-14T20:00:00Z')).toISOString()).toBe('2026-10-15T13:00:00.000Z');
  });
  it('rejects header injection, empty event consent and invalid silence',()=>{
    for(const settings of [{...defaultSettings,enabled:true,recipient:'manager@example.com\r\nBcc:x@example.com'},{...defaultSettings,enabled:true,recipient:'manager@example.com',events:[]},{...defaultSettings,quietEnd:'21:00'},{...defaultSettings,maxPerDay:101}])expect(()=>validateSettings(settings)).toThrow();
  });
  it('escapes source HTML and excludes authority claims from the template',()=>{
    const result=renderNotification('Fixture',['<img src=x onerror=alert(1)>'],'http://127.0.0.1:5174');
    expect(result.html).not.toContain('<img');expect(result.html).toContain('&lt;img');expect(result.text).toContain('no autoriza ni ejecuta');
  });
  it('rejects a TLS/port mismatch and does not expose credential values',()=>{
    const result=smtpFromEnvironment({SMTP_HOST:'smtp.example.com',SMTP_USER:'manager@example.com',SMTP_PASS:'private-fixture',SMTP_PORT:'465',SMTP_SECURE:'false'});
    expect(result).toEqual({transport:null,status:'INVALID_SMTP_CONFIGURATION'});
    expect(mailFailure({code:'ETIMEDOUT',command:'DATA'})).toBe('SMTP_RESULT_UNCERTAIN');
    expect(mailFailure({code:'ECONNECTION',command:'DATA'})).toBe('SMTP_RESULT_UNCERTAIN');
    expect(mailFailure({code:'EAUTH',response:'private-fixture'})).toBe('SMTP_AUTHENTICATION_FAILED');
    expect(mailFailure({code:'ECONNECTION',command:'CONN'})).toBe('SMTP_CONNECTION_FAILED');
  });
  it('honors selected weekdays, minutes and Ecuador day boundaries',()=>{
    expect(nextDaily(new Date('2026-10-14T23:00:00Z'),18,15,[5]).toISOString()).toBe('2026-10-16T23:15:00.000Z');
    expect(nextDaily(new Date('2026-10-15T04:30:00Z'),0,15,[4]).toISOString()).toBe('2026-10-15T05:15:00.000Z');
    expect(nextDaily(new Date('2026-10-16T23:15:00Z'),18,15,[5]).toISOString()).toBe('2026-10-23T23:15:00.000Z');
  });
});
