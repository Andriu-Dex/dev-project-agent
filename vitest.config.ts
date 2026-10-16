import {configDefaults,defineConfig} from 'vitest/config';

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
