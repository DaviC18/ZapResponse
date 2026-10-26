import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/env.js';
import type { ErrorResponseBody } from '../src/shared/errors.js';

// `expect.any` devolve `any`; o cast mantém o matcher assimétrico dentro de `toEqual`
// sem acionar as regras `no-unsafe-*` do eslint tipado.
const anyString = expect.any(String) as unknown as string;

// As duas primeiras verificações olham headers, não corpo: uma rota inexistente serve e
// evita depender de `/health`, que só nasce na Tarefa 5.
const URL_QUALQUER = '/rota-que-nao-existe';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('segurança HTTP', () => {
  it('aplica os headers do helmet', async () => {
    const res = await app.inject({ method: 'GET', url: URL_QUALQUER });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('nega origem fora de CORS_ORIGINS e aceita a configurada', async () => {
    const permitida = await app.inject({
      method: 'GET',
      url: URL_QUALQUER,
      headers: { origin: 'http://localhost:3001' },
    });
    expect(permitida.headers['access-control-allow-origin']).toBe('http://localhost:3001');

    const negada = await app.inject({
      method: 'GET',
      url: URL_QUALQUER,
      headers: { origin: 'http://evil.example' },
    });
    expect(negada.headers['access-control-allow-origin']).toBeUndefined();
  });

  // O rate limit do `@fastify/rate-limit@11` é aplicado por rota registrada (hook
  // `onRoute`), então este teste usa uma rota de verdade. O limite em URL inexistente é
  // coberto pelo teste seguinte, que depende do `preHandler` no handler de 404.
  it('estourar o limite devolve 429 no formato padrão', async () => {
    const limitado = await buildApp({ rateLimitMax: 2 });
    await limitado.ready();
    const requisicao = { method: 'POST', url: '/__test/echo', payload: { nome: 'x' } } as const;
    await limitado.inject(requisicao);
    await limitado.inject(requisicao);
    const res = await limitado.inject(requisicao);
    expect(res.statusCode).toBe(429);
    expect(res.json<ErrorResponseBody>()).toEqual({
      error: { code: 'RATE_LIMITED', message: anyString },
    });
    await limitado.close();
  });

  // Como o limite é por rota registrada, uma URL inexistente só é limitada porque o
  // handler de 404 declara `app.rateLimit()` como preHandler. Sem isso, marretar
  // `/qualquer-coisa` não tem teto nenhum — e é tráfego que custa o mesmo para o servidor.
  it('estourar o limite em URL inexistente devolve 429, não 404', async () => {
    const limitado = await buildApp({ rateLimitMax: 2 });
    await limitado.ready();
    const requisicao = { method: 'GET', url: URL_QUALQUER } as const;
    expect((await limitado.inject(requisicao)).statusCode).toBe(404);
    expect((await limitado.inject(requisicao)).statusCode).toBe(404);
    const res = await limitado.inject(requisicao);
    expect(res.statusCode).toBe(429);
    expect(res.json<ErrorResponseBody>()).toEqual({
      error: { code: 'RATE_LIMITED', message: anyString },
    });
    await limitado.close();
  });

  // Teste-trava do invariante do spec: nenhuma configuração ACEITA de CORS_ORIGINS pode
  // produzir `access-control-allow-origin: *`. Cada candidata precisa ou ser recusada pelo
  // `parseEnv`, ou não responder com wildcard a uma origem arbitrária.
  it('nenhuma configuração aceita de CORS_ORIGINS responde com access-control-allow-origin: *', async () => {
    const candidatas = [
      '*',
      ' * ',
      'http://localhost:3001,*',
      '*,http://localhost:3001',
      'http://localhost:3001',
    ];

    for (const CORS_ORIGINS of candidatas) {
      let env: ReturnType<typeof parseEnv>;
      try {
        env = parseEnv({ ...process.env, CORS_ORIGINS });
      } catch {
        // Recusada na configuração: o app não sobe, que é o resultado desejado.
        continue;
      }

      const app = await buildApp({ env });
      await app.ready();
      try {
        const res = await app.inject({
          method: 'GET',
          url: URL_QUALQUER,
          headers: { origin: 'https://evil.example' },
        });
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      } finally {
        await app.close();
      }
    }
  });

  it('não registra as rotas de teste fora de NODE_ENV=test', async () => {
    const producao = await buildApp({
      env: parseEnv({ ...process.env, NODE_ENV: 'production' }),
    });
    await producao.ready();
    // `/__test/echo` é POST: um GET devolveria 404 mesmo em teste, e o teste não provaria
    // nada. Cada rota é chamada com o método em que ela existe sob NODE_ENV=test.
    const rotasDeTeste = [
      { method: 'POST', url: '/__test/echo', payload: { nome: 'x' } },
      { method: 'GET', url: '/__test/boom' },
    ] as const;
    for (const rota of rotasDeTeste) {
      const res = await producao.inject(rota);
      expect(res.statusCode).toBe(404);
      expect(res.json<ErrorResponseBody>()).toEqual({
        error: { code: 'NOT_FOUND', message: anyString },
      });
    }
    await producao.close();
  });
});
