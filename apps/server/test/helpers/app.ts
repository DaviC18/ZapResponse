import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { parseEnv } from '../../src/env.js';

/**
 * Instância Fastify para os testes de rota, já com `ready()`.
 *
 * Duas escolhas que não são cosméticas:
 * - `LOG_LEVEL=silent`: o log por requisição está ligado na app e sujaria a saída da suíte.
 * - `rateLimitMax` alto: o `keyGenerator` default do `@fastify/rate-limit` agrupa todo
 *   `app.inject()` sob `127.0.0.1`, então uma suíte com mais de `RATE_LIMIT_MAX` (100)
 *   requisições começaria a receber 429 aleatórios. O teste dedicado de 429 passa o seu
 *   próprio limite baixo direto no `buildApp` e não é afetado por este teto.
 */
const TEST_RATE_LIMIT_MAX = 10_000;

/**
 * Pool pequeno pelo mesmo motivo de `getTestDb`: o `isolate` do Vitest recria o módulo por
 * arquivo e cada app abre o seu próprio pool, então o default de 10 somaria rápido contra
 * o `max_connections` do Postgres.
 */
const TEST_POOL_MAX = 2;

export async function buildTestApp(): Promise<FastifyInstance> {
  const env = parseEnv({ ...process.env, LOG_LEVEL: 'silent' });

  const app = await buildApp({
    env,
    rateLimitMax: TEST_RATE_LIMIT_MAX,
    poolMax: TEST_POOL_MAX,
  });
  await app.ready();

  return app;
}
