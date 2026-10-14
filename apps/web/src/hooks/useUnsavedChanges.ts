import {useEffect,useId} from 'react';
const pending=new Map<string,string>();
export function useUnsavedChanges(dirty:boolean,label:string){
  const id=useId();
  useEffect(()=>{if(dirty)pending.set(id,label);else pending.delete(id);return()=>{pending.delete(id);};},[id,dirty,label]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty)event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
}
export function confirmDiscardSettings(){return !pending.size||window.confirm('Hay cambios sin guardar en '+[...new Set(pending.values())].join(', ')+'. ¿Quieres salir y descartarlos?');}
