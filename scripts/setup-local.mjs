import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const adminPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const connection = '127.0.0.1:15434/dev_project_agent';
const content = [
  'POSTGRES_PASSWORD=' + adminPassword,
  'APP_DATABASE_PASSWORD=' + appPassword,
  'DATABASE_URL=postgresql://dev_project_agent_migrator:' + adminPassword + '@' + connection,
  'APP_DATABASE_URL=postgresql://dev_project_agent_app:' + appPassword + '@' + connection,
  'PORT=3100',
  'SESSION_SECRET=' + randomBytes(48).toString('hex'),
  'APP_ORIGINS=http://127.0.0.1:5174,http://127.0.0.1:3100',
  'ALLOW_INSECURE_LOCAL_HTTP=true',
  '',
].join('\n');

try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log('Local configuration created. Credentials were not printed.');
} catch (error) {
  if (error.code === 'EEXIST') {
    const envFile = new URL('../.env', import.meta.url);
    const existing = await readFile(envFile, 'utf8');
    const additions = [];
    for (const [key, value] of [
      ['SESSION_SECRET', randomBytes(48).toString('hex')],
      ['APP_ORIGINS', 'http://127.0.0.1:5174,http://127.0.0.1:3100'],
      ['ALLOW_INSECURE_LOCAL_HTTP', 'true'],
    ]) {
      if (!new RegExp('^' + key + '=', 'm').test(existing)) additions.push(key + '=' + value);
    }
    if (additions.length) await writeFile(envFile, existing.trimEnd() + '\n' + additions.join('\n') + '\n', { mode: 0o600 });
    console.log('Local configuration checked; existing credentials were preserved.');
  } else {
    throw error;
  }
}
