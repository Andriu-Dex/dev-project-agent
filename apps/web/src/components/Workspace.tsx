import { hasUnsavedChanges, getUnsavedSections, discardUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectAccess, SessionResponse } from '@dev-project-agent/contracts';

export const pages = {
  overview: {
    title: 'Resumen',
    description: 'Una mirada clara al avance y a lo que requiere tu atención.',
    icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  },
  planning: {
    title: 'Planificación',
    description: 'Explora las actividades, sus responsables y las evidencias del plan.',
    icon: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M7 14h3 M14 14h3',
  },
  alerts: {
    title: 'Alertas',
    description: 'Comprende los riesgos y decide dónde actuar primero.',
    icon: 'M12 3 2 21h20L12 3z M12 9v5 M12 17h.01',
  },
  proposals: {
    title: 'Propuestas',
    description: 'Revisa el cambio, su evidencia y los dictámenes antes de decidir.',
    icon: 'M9 3h6 M9 6h6 M6 4H4v17h16V4h-2 M8 11h8 M8 15h5',
  },
  code: {
    title: 'Código',
    description: 'Del hallazgo a una corrección revisada, con el alcance siempre visible.',
    icon: 'm8 7-5 5 5 5 m8-10 5 5-5 5 m-3-14-2 18',
  },
  reports: {
    title: 'Reportes',
    description: 'Consulta el historial y prepara el siguiente corte de seguimiento.',
    icon: 'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 12h7 M9 16h7',
  },
  operations: {
    title: 'Operación',
    description: 'Actualiza las fuentes y consulta el estado de los trabajos.',
    icon: 'M3 12h4l3-8 4 16 3-8h4',
  },
  settings: {
    title: 'Configuración',
    description: 'Conexiones, reglas y permisos adaptados a tu proyecto.',
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  },
} as const;

export type WorkspacePage = keyof typeof pages;

export function Icon({ path }: { path: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export function navigate(page: WorkspacePage) {
  window.location.hash = page;
}

const selected = (): WorkspacePage =>
  Object.hasOwn(pages, window.location.hash.slice(1)) ? (window.location.hash.slice(1) as WorkspacePage) : 'overview';

export function Workspace({
  session,
  logout,
  render,
}: {
  session: Extract<SessionResponse, { authenticated: true }>;
  logout: () => void;
  render: (page: WorkspacePage, project: ProjectAccess) => ReactNode;
}) {
  const [page, setPage] = useState(selected);
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [unsavedModal, setUnsavedModal] = useState<{ onConfirm: () => void; sections: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleMenu = () => {
    if (window.innerWidth <= 780) {
      setMenu(prev => !prev);
    } else {
      toggleCollapsed();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavClick = (targetPage: WorkspacePage, event: React.MouseEvent) => {
    if (page === 'settings' && targetPage !== 'settings' && hasUnsavedChanges()) {
      event.preventDefault();
      setUnsavedModal({
        sections: getUnsavedSections(),
        onConfirm: () => {
          discardUnsavedChanges();
          navigate(targetPage);
        },
      });
      return;
    }
    setMenu(false);
  };

  const handleLogoutClick = () => {
    if (page === 'settings' && hasUnsavedChanges()) {
      setUnsavedModal({
        sections: getUnsavedSections(),
        onConfirm: () => {
          discardUnsavedChanges();
          logout();
        },
      });
      return;
    }
    logout();
  };

  useEffect(() => {
    const change = () => {
      const next = selected();
      if (page === 'settings' && next !== 'settings' && hasUnsavedChanges()) {
        window.location.hash = 'settings';
        setUnsavedModal({
          sections: getUnsavedSections(),
          onConfirm: () => {
            discardUnsavedChanges();
            window.location.hash = next;
          },
        });
        return;
      }
      setPage(next);
      setMenu(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [page]);

  useEffect(() => {
    document.title = pages[page].title + ' · Dev Project Agent';
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [page]);

  if (!session.project) return null;
  const project = session.project;

  return (
    <div className={'workspace' + (collapsed ? ' is-collapsed' : '')}>
      <a className="skip-link" href="#workspace-content" onClick={event => { event.preventDefault(); document.getElementById('workspace-content')?.focus(); }}>
        Saltar al contenido
      </a>

      <aside className={'workspace-sidebar' + (collapsed ? ' is-collapsed' : '') + (menu ? ' is-open' : '')}>
        <div className="sidebar-header">
          <a
            href="#overview"
            className="workspace-brand"
            aria-label="Dev Project Agent, ir a resumen"
            onClick={e => {
              if (collapsed) {
                toggleCollapsed();
              }
              handleNavClick('overview', e);
            }}
            title={collapsed ? 'Expandir barra lateral (Ctrl+B)' : undefined}
          >
            <img src="/favicon.jpg" alt="Logo Dev Project" className="brand-mark" />
            {!collapsed && (
              <div className="brand-text">
                <span className="brand-title">Dev Project</span>
                <span className="brand-subtitle">Asistente de proyectos</span>
              </div>
            )}
          </a>
          {!collapsed && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleCollapsed}
              aria-label="Contraer barra lateral (Ctrl+B)"
              title="Contraer barra lateral (Ctrl+B)"
            >
              <Icon path="M15 19l-7-7 7-7" />
            </button>
          )}
        </div>

        <div className="sidebar-scrollable">
          <div className="project-switch" title={collapsed ? `${project.name} · Proyecto supervisado` : undefined}>
            <span className="project-avatar">{project.name.slice(0, 2).toUpperCase()}</span>
            {!collapsed && (
              <div className="project-info">
                <strong>{project.name}</strong>
                <small>Proyecto supervisado</small>
              </div>
            )}
            <span className="status-dot" aria-label="Activo" />
          </div>

          {!collapsed && <p className="nav-label">TU PROYECTO</p>}

          <nav id="workspace-navigation" aria-label="Navegación principal">
            {(Object.keys(pages) as WorkspacePage[]).map(key => (
              <a
                key={key}
                href={'#' + key}
                aria-current={page === key ? 'page' : undefined}
                onClick={e => handleNavClick(key, e)}
                title={collapsed ? pages[key].title : undefined}
                className={page === key ? 'is-active' : ''}
              >
                <Icon path={pages[key].icon} />
                {!collapsed && <span>{pages[key].title}</span>}
              </a>
            ))}
          </nav>

          {!collapsed && (
            <div className="sidebar-note">
              <span className="status-dot" />
              <div className="sidebar-note-content">
                <strong>Control humano</strong>
                <p>Las modificaciones requieren tu aprobación explícita.</p>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="workspace-profile" title={collapsed ? `${session.user.displayName} (${project.canManageProject ? 'Gestor' : 'Consulta'})` : undefined}>
            <span className="profile-avatar">
              {session.user.displayName.split(' ').slice(0, 2).map(value => value[0]).join('')}
            </span>
            {!collapsed && (
              <div className="profile-info">
                <strong>{session.user.displayName}</strong>
                <small>{project.canManageProject ? 'Gestor del proyecto' : 'Acceso de consulta'}</small>
              </div>
            )}
          </div>
          <button
            type="button"
            className="logout-button"
            onClick={handleLogoutClick}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <Icon path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
          <button
            type="button"
            className="sidebar-rail-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'}
            title={collapsed ? 'Expandir barra lateral (Ctrl+B)' : 'Contraer barra lateral (Ctrl+B)'}
          >
            <Icon path={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            {!collapsed && <span>Contraer barra</span>}
          </button>
        </div>
      </aside>

      {menu && <button aria-label="Cerrar navegación" className="menu-overlay" onClick={() => setMenu(false)} />}

      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={handleToggleMenu}
              aria-expanded={menu || !collapsed}
              aria-controls="workspace-navigation"
              aria-label={collapsed ? 'Abrir menú lateral (Ctrl+B)' : 'Contraer menú lateral (Ctrl+B)'}
              title={collapsed ? 'Abrir menú lateral (Ctrl+B)' : 'Contraer menú lateral (Ctrl+B)'}
            >
              <Icon path="M3 6h18 M3 12h18 M3 18h18" />
              <span className="topbar-menu-label">Menú</span>
            </button>
            <div className="topbar-separator" aria-hidden="true" />
            <div className="topbar-breadcrumbs">
              <span className="muted">Proyecto</span>
              <span className="breadcrumb">/</span>
              <span className="breadcrumb-current">{project.name}</span>
              <span className="breadcrumb">/</span>
              <span className="breadcrumb-page">{pages[page].title}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-status-badge" title="Panel del proyecto; consulta la fecha y el estado de las fuentes en Resumen">
              <span className="live-pulse-dot" />
              <span className="status-badge-text">Panel del proyecto</span>
            </div>

            <div
              className="topbar-user-profile"
              title={`Usuario: ${session.user.displayName} · Rol: ${project.canManageProject ? 'Gestor del proyecto' : 'Acceso de consulta'}`}
            >
              <span className="topbar-avatar">
                {session.user.displayName.split(' ').slice(0, 2).map(v => v[0]).join('')}
              </span>
              <span className="topbar-user-name">{session.user.displayName}</span>
              <span className="topbar-role-tag">
                <Icon path={project.canManageProject ? 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' : 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z'} />
                <span>{project.canManageProject ? 'Gestor' : 'Consulta'}</span>
              </span>
            </div>
          </div>
        </header>

        <main id="workspace-content" tabIndex={-1} className="workspace-content">
          {page !== 'overview' ? (
            <header className="page-heading">
              <p className="eyebrow">SEGUIMIENTO Y CONTROL</p>
              <h1 ref={heading} tabIndex={-1}>{pages[page].title}</h1>
              <p className="intro">{pages[page].description}</p>
            </header>
          ) : (
            <span
              ref={heading as any}
              tabIndex={-1}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                border: 0,
              }}
            />
          )}
          {render(page, project)}
          <footer className="workspace-footer">
            <span>{project.name} · Horarios en Ecuador</span>
            <span className="footer-dot">·</span>
            <span>Evidencias fechadas con trazabilidad inmutable</span>
          </footer>
        </main>
      </div>

      {unsavedModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="unsaved-modal-title">
          <div className="modal-box">
            <div className="modal-icon-badge warning">
              <Icon path="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" />
            </div>
            <h3 id="unsaved-modal-title">Cambios sin guardar</h3>
            <p>
              Tienes modificaciones no guardadas en <strong>{unsavedModal.sections}</strong>. Si sales ahora, se descartarán.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setUnsavedModal(null)}>
                Permanecer aquí
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  const action = unsavedModal.onConfirm;
                  setUnsavedModal(null);
                  action();
                }}
              >
                Descartar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
