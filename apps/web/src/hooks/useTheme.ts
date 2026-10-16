import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch {
      // Browser storage may be disabled; the theme still works for this visit.
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Persisting a preference is optional when browser storage is unavailable.
    }
  }, [theme]);

  useEffect(()=>{const sync=(event:Event)=>setTheme((event as CustomEvent<Theme>).detail);window.addEventListener('theme-changed',sync);return()=>window.removeEventListener('theme-changed',sync);},[]);
  const chooseTheme=(next:Theme)=>{setTheme(next);window.dispatchEvent(new CustomEvent('theme-changed',{detail:next}));};
  const toggleTheme = () => chooseTheme(theme==='light'?'dark':'light');

  return { theme, toggleTheme, chooseTheme };
}
