import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/env.js';
import type { ErrorResponseBody } from '../src/shared/errors.js';

// URL de um Postgres que não existe. A porta 1 é privilegiada e não escutada, então a
// conexão falha de imediato com ECONNREFUSED em vez de esperar o
// `connectionTimeoutMillis`. A senha é o canário do teste de vazamento.
const DATABASE_URL_QUEBRADA = 'postgres://zap:senha-secreta@127.0.0.1:1/nada';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('GET /health devolve 200 e status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('com o banco inacessível devolve 503 sem vazar a string de conexão', async () => {
    const quebrado = await buildApp({
      env: parseEnv({
        ...process.env,
        DATABASE_URL: DATABASE_URL_QUEBRADA,
      }),
    });
    await quebrado.ready();
    const res = await quebrado.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ErrorResponseBody>().error.code).toBe('DB_UNAVAILABLE');
    expect(res.payload).not.toContain('senha-secreta');
    expect(res.payload).not.toContain('127.0.0.1');
    await quebrado.close();
  });
});
