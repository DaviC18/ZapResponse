import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { ErrorResponseBody } from '../src/shared/errors.js';

// `expect.any` devolve `any`; o cast mantém o matcher assimétrico dentro de `toEqual`
// sem acionar as regras `no-unsafe-*` do eslint tipado.
const anyString = expect.any(String) as unknown as string;

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('contrato de erro', () => {
  it('rota inexistente devolve 404 no formato padrão', async () => {
    const res = await app.inject({ method: 'GET', url: '/rota-que-nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorResponseBody>()).toEqual({
      error: { code: 'NOT_FOUND', message: anyString },
    });
  });

  it('body inválido devolve 400 com details, sem stack', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/__test/echo',
      payload: { nome: 123 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorResponseBody>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:\d+/);
  });

  it('erro não tratado devolve 500 sem stack e sem a mensagem interna', async () => {
    const res = await app.inject({ method: 'GET', url: '/__test/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json<ErrorResponseBody>();
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: anyString },
    });
    expect(JSON.stringify(body)).not.toContain('segredo-que-nao-pode-vazar');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:\d+/);
  });

  it('body acima do limite devolve 413 no formato padrão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/__test/echo',
      payload: { nome: 'x'.repeat(2 * 1024 * 1024) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorResponseBody>().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
