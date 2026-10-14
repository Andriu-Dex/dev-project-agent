import {useState,type ReactNode} from 'react';
const tabs={integrations:'Integraciones',tracking:'Seguimiento',automation:'Automatización',notifications:'Notificaciones',appearance:'Apariencia',team:'Equipo'};
export function SettingsPage({children}:{children:Record<keyof typeof tabs,ReactNode>}){
  const [tab,setTab]=useState<keyof typeof tabs>('integrations');
  return <><nav className="settings-tabs" aria-label="Secciones de configuración">{Object.entries(tabs).map(([key,label])=><button type="button" key={key} aria-current={tab===key?'page':undefined} aria-controls={'settings-'+key} onClick={()=>setTab(key as typeof tab)}>{label}</button>)}</nav><p className="muted settings-help">Elige una sección. Los formularios conservan sus cambios al cambiar de pestaña; guarda antes de salir de Configuración.</p>{Object.keys(tabs).map(key=><div key={key} id={'settings-'+key} hidden={tab!==key}>{children[key as keyof typeof tabs]}</div>)}</>;
}
