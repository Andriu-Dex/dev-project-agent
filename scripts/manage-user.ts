import { input, password, select } from '@inquirer/prompts';
import pg from 'pg';
import { hashPassword } from '../apps/server/src/modules/auth/password.js';
import { createLocalUser, resetLocalPassword } from '../apps/server/src/modules/auth/admin.js';

if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal; credentials are never accepted as command-line arguments.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const mode = process.argv[2];
if (mode !== 'create' && mode !== 'reset') throw new Error('Choose create or reset.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000 });
try {
  const login = await input({
    message: 'Nombre de usuario:',
    validate: value => /^[a-z0-9][a-z0-9._-]{2,63}$/.test(value) || 'Usa de 3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo.',
  });
  const displayName = mode === 'create' ? await input({
    message: 'Nombre visible:',
    validate: value => (value.trim().length > 0 && value.trim().length <= 120) || 'Escribe un nombre de hasta 120 caracteres.',
  }) : '';
  const managerCount = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM project_memberships WHERE role = 'manager' AND active = true");
  const role = mode === 'create' ? await select<'manager' | 'viewer'>({
    message: 'Permisos de la cuenta:',
    default: managerCount.rows[0]?.count ? 'viewer' : 'manager',
    choices: [{ name: 'Gestor', value: 'manager' }, { name: 'Solo consulta', value: 'viewer' }],
  }) : 'viewer';
  const newPassword = await password({
    message: 'Contraseña (15 a 128 caracteres):',
    mask: '*',
    validate: value => (value.length >= 15 && value.length <= 128) || 'La contraseña debe tener de 15 a 128 caracteres.',
  });
  await password({ message: 'Repite la contraseña:', mask: '*', validate: value => value === newPassword || 'Las contraseñas no coinciden.' });
  const passwordHash = await hashPassword(newPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dev-project-agent-user-administration'))");
    if (mode === 'create') await createLocalUser(client, { login, displayName: displayName.trim(), passwordHash, role });
    else await resetLocalPassword(client, login, passwordHash);
    await client.query('COMMIT');
    console.log(mode === 'create' ? 'Cuenta local creada. Ya puedes iniciar sesión.' : 'Contraseña actualizada y sesiones anteriores revocadas.');
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      console.error('El nombre de usuario ya existe. Usa el procedimiento de recuperación si necesitas cambiar su contraseña.');
    } else {
      console.error('No se pudo completar la administración de la cuenta. Revisa la conexión y las migraciones.');
    }
    process.exitCode = 1;
  } finally {
    client.release();
  }
} catch {
  console.error('La operación no se completó. No se guardaron nuevas credenciales.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
