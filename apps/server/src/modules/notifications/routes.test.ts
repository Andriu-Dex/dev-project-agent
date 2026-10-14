import Fastify from 'fastify';
import {describe,it,expect,vi} from 'vitest';
import {registerNotificationRoutes} from './routes.js';
import {AuthRepository,type AuthUser} from '../auth/repository.js';
import type {NotificationService} from './service.js';
import {defaultSettings} from './settings.js';
const projectId='11111111-1111-4111-8111-111111111111';
describe('Notification route authority',()=>{
  it.each(['anonymous','viewer','outsider'])('denies %s before disclosing a recipient or sending',async role=>{
    const app=Fastify();app.decorate('csrfProtection',async()=>{});
    const repository=new AuthRepository({query:vi.fn()} as never);
    vi.spyOn(repository,'projectForUser').mockResolvedValue(role==='outsider'?null:{id:projectId,name:'Fixture',role:'viewer',canManageProject:false,timeZone:'America/Guayaquil'});
    const overview=vi.fn(),test=vi.fn(),configure=vi.fn(),verify=vi.fn();
    registerNotificationRoutes(app,{overview,test,configure,verify} as unknown as NotificationService,async(_request,reply)=>{if(role==='anonymous'){reply.code(401).send({code:'UNAUTHENTICATED'});return null;}return {id:projectId} as AuthUser;},repository);
    try{for(const request of [{method:'GET' as const,path:'',payload:undefined},{method:'PUT' as const,path:'',payload:{expectedVersion:0,settings:defaultSettings}},{method:'POST' as const,path:'/test',payload:{requestKey:projectId,confirmed:true}},{method:'POST' as const,path:'/verify',payload:undefined}]){
      const response=await app.inject({method:request.method,url:`/projects/${projectId}/notifications${request.path}`,payload:request.payload});expect(response.statusCode).toBe(role==='anonymous'?401:role==='outsider'?404:403);expect(response.json().code).toBe(role==='anonymous'?'UNAUTHENTICATED':role==='outsider'?'NOT_FOUND':'FORBIDDEN');
    }expect(test).not.toHaveBeenCalled();expect(overview).not.toHaveBeenCalled();expect(configure).not.toHaveBeenCalled();expect(verify).not.toHaveBeenCalled();}finally{await app.close();vi.restoreAllMocks();}
  });
});
