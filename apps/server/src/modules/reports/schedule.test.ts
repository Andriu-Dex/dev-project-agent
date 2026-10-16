import {describe,it,expect} from 'vitest';
import {nextWeeklyCutoff} from './schedule.js';
import {reportText} from './service.js';
import {escapeHtml} from './render.js';
describe('Weekly report time and untrusted display data',()=>{
  it('schedules Friday 18:00 in Ecuador independently from device timezone',()=>{
    expect(nextWeeklyCutoff(new Date('2026-10-11T20:00:00Z')).toISOString()).toBe('2026-10-16T23:00:00.000Z');
    expect(nextWeeklyCutoff(new Date('2026-10-16T22:59:59Z')).toISOString()).toBe('2026-10-16T23:00:00.000Z');
    expect(nextWeeklyCutoff(new Date('2026-10-16T23:00:00Z')).toISOString()).toBe('2026-10-23T23:00:00.000Z');
    expect(nextWeeklyCutoff(new Date('2026-10-11T00:00:00Z'),6,23,30).toISOString()).toBe('2026-10-11T04:30:00.000Z');
  });
  it('rejects invalid schedules instead of silently shifting their cutoffs',()=>{
    for(const args of [[7,18,0],[5,24,0],[5,18,60],[1.5,18,0]])expect(()=>nextWeeklyCutoff(new Date(),...args as [number,number,number])).toThrow();
    expect(()=>nextWeeklyCutoff(new Date('invalid'))).toThrow();
  });
  it('redacts common credentials and private invitation links and escapes active HTML',()=>{
    expect(reportText('token=abcdefghijklmnop https://trello.com/invite/private sk-abcdefghijklmnop')).not.toMatch(/abcdefghijklmnop|invite\/private/);
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });
});
