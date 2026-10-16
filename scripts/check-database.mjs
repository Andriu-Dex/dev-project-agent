import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1, connectionTimeoutMillis: 3000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const roles = await client.query('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
  assert.deepEqual(roles.rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  const projectId = randomUUID();
  await client.query('INSERT INTO projects (id, name) VALUES ($1, $2)', [projectId, 'Foundation verification']);
  const eventId = randomUUID();
  await client.query(
    'INSERT INTO audit_events (id, project_id, actor_type, action, resource_type, resource_id, outcome) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [eventId, projectId, 'system', 'foundation.verify', 'project', projectId, 'succeeded'],
  );
  const events = await client.query('SELECT id FROM audit_events WHERE project_id = $1', [projectId]);
  assert.equal(events.rowCount, 1);

  for (const command of [
    'UPDATE audit_events SET outcome = outcome WHERE id = $1',
    'DELETE FROM audit_events WHERE id = $1',
  ]) {
    await client.query('SAVEPOINT permission_check');
    await assert.rejects(client.query(command, [eventId]), { code: '42501' });
    await client.query('ROLLBACK TO SAVEPOINT permission_check');
  }
  await client.query('SAVEPOINT schema_check');
  await assert.rejects(client.query('CREATE TABLE forbidden_runtime_table (id integer)'), { code: '42501' });
  await client.query('ROLLBACK TO SAVEPOINT schema_check');
  console.log('Database verified: parameterized writes, audit reads, restricted runtime role, and append-only audit permissions.');
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
