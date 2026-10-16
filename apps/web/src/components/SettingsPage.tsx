import { useState, type ReactNode } from 'react';
import { Icon } from './Workspace';

export const settingTabs = {
  integrations: {
    label: 'Integraciones IA',
    icon: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
  },
  tracking: {
    label: 'Reglas de Seguimiento',
    icon: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  },
  automation: {
    label: 'Automatización',
    icon: 'M12 8v4l3 3 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 20z',
  },
  notifications: {
    label: 'Notificaciones',
    icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  },
  appearance: {
    label: 'Apariencia',
    icon: 'M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
  },
  team: {
    label: 'Equipo con Acceso',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  },
} as const;

export function SettingsPage({
  children,
}: {
  children: Record<keyof typeof settingTabs, ReactNode>;
}) {
  const [tab, setTab] = useState<keyof typeof settingTabs>('integrations');

  return (
    <div className="proposals-dashboard settings-dashboard">
      {/* Top Hero Banner */}
      <section className="proposals-hero-banner">
        <div className="proposals-hero-main">
          <div className="proposals-live-badge">
            <span className="live-pulse-dot" />
            <span>CONFIGURACIÓN DEL SISTEMA · PROYECTO Y AGENTES</span>
          </div>
          <h2 className="proposals-hero-title">Configuración y Preferencias</h2>
          <p className="proposals-hero-subtitle">
            Gestión centralizada de modelos de IA (ChatGPT y Ollama local), políticas de seguimiento,
            automatización periódica de lecturas, avisos por correo y personalización visual del espacio.
          </p>
        </div>
      </section>

      {/* Info notice bar */}
      <div className="settings-notice-bar">
        <div className="notice-icon">
          <Icon path="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </div>
        <span>
          Los formularios conservan sus cambios mientras navegas entre pestañas. Recuerda guardar tus modificaciones en cada sección antes de salir de Configuración.
        </span>
      </div>

      {/* Modern Segmented Navigation Tabs */}
      <div className="code-tabs-container">
        <nav className="code-nav-tabs" role="tablist" aria-label="Secciones de configuración">
          {(Object.keys(settingTabs) as (keyof typeof settingTabs)[]).map(key => {
            const item = settingTabs[key];
            const isActive = tab === key;
            return (
              <button
                type="button"
                role="tab"
                key={key}
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                aria-controls={'settings-' + key}
                className={'code-nav-tab-btn' + (isActive ? ' is-active' : '')}
                onClick={() => setTab(key)}
              >
                <Icon path={item.icon} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Panes */}
      <div className="settings-content-wrapper">
        {(Object.keys(settingTabs) as (keyof typeof settingTabs)[]).map(key => (
          <div
            key={key}
            id={'settings-' + key}
            role="tabpanel"
            className="settings-tab-pane"
            hidden={tab !== key}
          >
            {children[key]}
          </div>
        ))}
      </div>
    </div>
  );
}
