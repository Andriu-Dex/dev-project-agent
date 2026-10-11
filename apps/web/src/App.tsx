import { useEffect, useState } from 'react';
import type { HealthResponse } from '@dev-project-agent/contracts';
import { ThemeToggle } from './components/ThemeToggle';
import { SessionPanel } from './components/SessionPanel';

type ConnectionState = 'loading' | 'available' | 'database_unavailable' | 'service_unavailable';

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('loading');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setConnection('loading');
    setCheckedAt(null);
    async function check() {
      try {
        const response = await fetch('/api/v1/health', { signal: controller.signal });
        if (response.status !== 200 && response.status !== 503) throw new Error('Unexpected health response.');
        const health = await response.json() as HealthResponse;
        if (health.database !== 'available' && health.database !== 'unavailable') throw new Error('Invalid health response.');
        setConnection(health.database === 'available' ? 'available' : 'database_unavailable');
        setCheckedAt(health.checkedAt);
      } catch {
        if (!controller.signal.aborted) setConnection('service_unavailable');
      }
    }
    void check();
    return () => controller.abort();
  }, [attempt]);

  const labels: Record<ConnectionState, string> = {
    loading: 'Comprobando conexión…',
    available: 'Servicio y base de datos disponibles',
    database_unavailable: 'El servicio responde, pero la base de datos no está disponible',
    service_unavailable: 'No se pudo conectar con el servicio',
  };

  return (
    <>
      <main>
        <header>
          <p className="eyebrow">Seguimiento de proyectos de software</p>
          <h1>Dev Project Agent</h1>
          <p className="intro">Un espacio para revisar el avance, comprender los riesgos y decidir los cambios de tu proyecto.</p>
        </header>
        <SessionPanel />
        <section aria-labelledby="status-title">
          <div className="section-heading"><h2 id="status-title">Estado de conexión</h2><span className="badge">Servicio local</span></div>
          <p role="status" className={'connection ' + connection}>{labels[connection]}</p>
          {checkedAt && <p className="muted">Última comprobación: {new Date(checkedAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>}
          <button disabled={connection === 'loading'} onClick={() => setAttempt(value => value + 1)}>Volver a comprobar</button>
        </section>
        <section aria-labelledby="next-title">
          <h2 id="next-title">Fuentes del seguimiento</h2>
          <p>Inicia sesión para consultar Trello, GitHub y el historial de supervisión de tu proyecto.</p>
          <ul><li>Seguimiento: reglas de fechas, dependencias y comparación con la línea base.</li><li>ChatGPT: conexión renovable, selección de razonamiento y evaluación con casos sintéticos.</li><li>Agentes: propuestas de vencimiento, revisión, control de aprobación y decisiones del gestor.</li><li>Trello: ejecución controlada con autorización específica y verificación posterior.</li><li>Código: revisión acotada, correcciones versionadas y simulación de publicación en GitHub.</li><li>Reportes: programación semanal, historial, revisión y versión imprimible.</li></ul>
        </section>
        <footer>Los cambios de Trello y código requerirán revisión y aprobación del gestor.</footer>
      </main>
      <ThemeToggle />
    </>
  );
}
