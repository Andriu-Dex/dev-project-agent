import { useTheme } from '../hooks/useTheme';
import { Icon } from './Workspace';

export function AppearanceSettings() {
  const { theme, chooseTheme } = useTheme();

  return (
    <div className="proposal-editor-card appearance-card">
      <header className="editor-card-header">
        <div className="editor-header-title">
          <div className="editor-icon-badge">
            <Icon path="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41" />
          </div>
          <div>
            <h3>Tema y Apariencia Visual</h3>
            <p>
              Elige entre el tema claro con contraste mejorado o el tema oscuro profundo. La preferencia se guarda en este navegador.
            </p>
          </div>
        </div>
      </header>

      <div className="editor-card-body">
        <div className="appearance-options">
          <button
            type="button"
            className={'theme-choice-card' + (theme === 'light' ? ' is-selected' : '')}
            aria-pressed={theme === 'light'}
            onClick={() => chooseTheme('light')}
          >
            <div className="theme-preview-box light-preview">
              <div className="preview-nav-mockup" />
              <div className="preview-body-mockup">
                <div className="preview-line-mockup accent" />
                <div className="preview-line-mockup text" />
                <div className="preview-line-mockup muted" />
              </div>
            </div>

            <div className="theme-info-box">
              <div className="theme-title-row">
                <Icon path="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                <strong>Modo claro</strong>
                {theme === 'light' && <span className="theme-active-tag">Activo</span>}
              </div>
              <p className="theme-desc">
                Fondo blanco suave con textos de alto contraste y acentos accesibles (cumple directrices WCAG).
              </p>
            </div>
          </button>

          <button
            type="button"
            className={'theme-choice-card' + (theme === 'dark' ? ' is-selected' : '')}
            aria-pressed={theme === 'dark'}
            onClick={() => chooseTheme('dark')}
          >
            <div className="theme-preview-box dark-preview">
              <div className="preview-nav-mockup" />
              <div className="preview-body-mockup">
                <div className="preview-line-mockup accent" />
                <div className="preview-line-mockup text" />
                <div className="preview-line-mockup muted" />
              </div>
            </div>

            <div className="theme-info-box">
              <div className="theme-title-row">
                <Icon path="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                <strong>Modo oscuro</strong>
                {theme === 'dark' && <span className="theme-active-tag">Activo</span>}
              </div>
              <p className="theme-desc">
                Paleta nocturna profunda (#0b0f19) diseñada para reducir la fatiga visual en sesiones prolongadas.
              </p>
            </div>
          </button>
        </div>

        <div className="appearance-footer-note">
          <p className="muted">
            Ambos modos garantizan proporciones de contraste legibles tanto en entornos diurnos como en condiciones de baja luminosidad.
          </p>
        </div>
      </div>
    </div>
  );
}
