import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'watch', '--exclude', 'packages/contracts/dist/**', 'apps/server/src/index.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts'], { cwd: root, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
