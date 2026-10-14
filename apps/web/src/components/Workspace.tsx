import {confirmDiscardSettings} from '../hooks/useUnsavedChanges';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {ProjectAccess,SessionResponse} from '@dev-project-agent/contracts';

export const pages={overview:{title:'Resumen',description:'Una mirada clara al avance y a lo que requiere tu atención.',icon:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'},planning:{title:'Planificación',description:'Explora las actividades, sus responsables y las evidencias del plan.',icon:'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 14h3 M14 14h3'},alerts:{title:'Alertas',description:'Comprende los riesgos y decide dónde actuar primero.',icon:'M12 3 2 21h20L12 3z M12 9v5 M12 17h.01'},proposals:{title:'Propuestas',description:'Revisa el cambio, su evidencia y los dictámenes antes de decidir.',icon:'M9 3h6 M9 6h6 M6 4H4v17h16V4h-2 M8 11h8 M8 15h5'},code:{title:'Código',description:'Del hallazgo a una corrección revisada, con el alcance siempre visible.',icon:'m8 7-5 5 5 5 m8-10 5 5-5 5 m-3-14-2 18'},reports:{title:'Reportes',description:'Consulta el historial y prepara el siguiente corte de seguimiento.',icon:'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 12h7 M9 16h7'},operations:{title:'Operación',description:'Actualiza las fuentes y consulta el estado de los trabajos.',icon:'M3 12h4l3-8 4 16 3-8h4'},settings:{title:'Configuración',description:'Conexiones, reglas y permisos adaptados a tu proyecto.',icon:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'}} as const;
export type WorkspacePage=keyof typeof pages;
export function Icon({path}:{path:string}) {return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;}
export function navigate(page:WorkspacePage){window.location.hash=page;}
const selected=():WorkspacePage=>Object.hasOwn(pages,window.location.hash.slice(1))?window.location.hash.slice(1) as WorkspacePage:'overview';
export function Workspace({session,logout,render}:{session:Extract<SessionResponse,{authenticated:true}>;logout:()=>void;render:(page:WorkspacePage,project:ProjectAccess)=>ReactNode}) {
  const [page,setPage]=useState(selected),[menu,setMenu]=useState(false),heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{const change=()=>{const next=selected();if(page==='settings'&&next!=='settings'&&!confirmDiscardSettings()){window.location.hash='settings';return;}setPage(next);setMenu(false);};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[page]);
  useEffect(()=>{document.title=pages[page].title+' · Dev Project Agent';heading.current?.focus();window.scrollTo({top:0});},[page]);
  if(!session.project)return null;
  const project=session.project;
  return <div className="workspace"><a className="skip-link" href="#workspace-content" onClick={event=>{event.preventDefault();document.getElementById('workspace-content')?.focus();}}>Saltar al contenido</a>
    <aside className={'workspace-sidebar'+(menu?' is-open':'')}>
      <a href="#overview" className="workspace-brand" aria-label="Dev Project Agent, resumen"><img src="/brand-logo.jpg" alt=""/><span>Dev Project<span className="brand-subtitle">Asistente de proyectos</span></span></a>
      <div className="project-switch"><span className="project-avatar">{project.name.slice(0,2).toUpperCase()}</span><div><strong>{project.name}</strong><small>Proyecto supervisado</small></div><span className="status-dot"/></div>
      <p className="nav-label">TU PROYECTO</p>
      <nav id="workspace-navigation" aria-label="Navegación principal">{(Object.keys(pages) as WorkspacePage[]).map(key=><a key={key} href={'#'+key} aria-current={page===key?'page':undefined}><Icon path={pages[key].icon}/><span>{pages[key].title}</span></a>)}</nav>
      <div className="sidebar-note"><span className="status-dot"/> Control humano<p>Las modificaciones requieren tu aprobación.</p></div>
      <div className="workspace-profile"><span className="profile-avatar">{session.user.displayName.split(' ').slice(0,2).map(value=>value[0]).join('')}</span><div><strong>{session.user.displayName}</strong><small>{project.canManageProject?'Gestor del proyecto':'Acceso de consulta'}</small></div></div>
      <button className="logout-button" onClick={()=>{if(page!=='settings'||confirmDiscardSettings())logout();}}>Cerrar sesión</button>
    </aside>
    {menu&&<button aria-label="Cerrar navegación" className="menu-overlay" onClick={()=>setMenu(false)}/>}
    <div className="workspace-body"><div className="workspace-topbar"><button className="menu-button" aria-expanded={menu} aria-controls="workspace-navigation" onClick={()=>setMenu(!menu)} aria-label="Abrir navegación"><Icon path="M3 6h18 M3 12h18 M3 18h18"/></button><p><span className="muted">Proyecto</span><span className="breadcrumb">/</span>{project.name}<span className="breadcrumb">/</span>{pages[page].title}</p><span className="badge">{project.canManageProject?'Gestor':'Consulta'}</span></div>
      <main id="workspace-content" tabIndex={-1} className="workspace-content"><header className="page-heading"><p className="eyebrow">SEGUIMIENTO Y CONTROL</p><h1 ref={heading} tabIndex={-1}>{pages[page].title}</h1><p className="intro">{pages[page].description}</p></header>{render(page,project)}<footer className="workspace-footer">{project.name} · Horarios en Ecuador · Las evidencias conservan su fecha y alcance.</footer></main>
    </div>
  </div>;
}
