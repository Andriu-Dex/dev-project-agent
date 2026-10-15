import {useEffect,useId} from 'react';
const pending=new Map<string,string>();
export function useUnsavedChanges(dirty:boolean,label:string){
  const id=useId();
  useEffect(()=>{if(dirty)pending.set(id,label);else pending.delete(id);return()=>{pending.delete(id);};},[id,dirty,label]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty)event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
}
export function hasUnsavedChanges(): boolean {
  return pending.size > 0;
}

export function getUnsavedSections(): string {
  return [...new Set(pending.values())].join(', ');
}

export function discardUnsavedChanges(): void {
  pending.clear();
}

export function confirmDiscardSettings(): boolean {
  // Return true if no pending changes, otherwise return false so caller can show UI modal
  return !pending.size;
}
