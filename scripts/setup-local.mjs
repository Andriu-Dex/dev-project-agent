import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const adminPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const connection = '127.0.0.1:15434/dev_project_agent';
const content = [
  'POSTGRES_PASSWORD=' + adminPassword,
  'APP_DATABASE_PASSWORD=' + appPassword,
  'DATABASE_URL=postgresql://dev_project_agent_migrator:' + adminPassword + '@' + connection,
  'APP_DATABASE_URL=postgresql://dev_project_agent_app:' + appPassword + '@' + connection,
  'PORT=3100',
  '',
].join('\n');

try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log('Local configuration created. Credentials were not printed.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('Local configuration already exists; no credentials were changed.');
  } else {
    throw error;
  }
}
