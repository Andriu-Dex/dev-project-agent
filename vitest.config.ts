import {configDefaults,defineConfig} from 'vitest/config';

// Plain `npm test` skips PostgreSQL suites; make that visible so skips are not read as passes.
if(!Object.keys(process.env).some(key=>/^RUN_\w+_DB_TESTS$/.test(key)))
  console.warn('PostgreSQL integration tests are skipped. Run `npm run test:isolated` for full coverage.');

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      'work/**',
      'backups/**',
      'runtime-data/**',
      'tmp/**',
      'temp/**',
    ],
  },
});
