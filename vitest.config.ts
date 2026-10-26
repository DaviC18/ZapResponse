import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    // Os testes de integração compartilham um único banco de teste e resetDb() trunca
    // tabelas; arquivos em paralelo se atropelariam.
    fileParallelism: false,
    pool: 'forks',
    // Subir as migrations na primeira execução é lento.
    hookTimeout: 30000,
  },
});
