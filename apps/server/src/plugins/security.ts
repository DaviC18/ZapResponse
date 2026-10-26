import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import type { Env } from '../env.js';

/**
 * Teto default de requisições por janela, por IP. É parâmetro de `buildApp`, não variável
 * de ambiente: o spec (B0) fixa as 8 chaves de `.env.example` e não cabe uma nona. Isso é
 * o que permite um teste pedir `rateLimitMax: 2` e a `buildTestApp()` subir com um teto
 * alto — o `keyGenerator` default agrupa todo `inject` sob `127.0.0.1`, então uma suíte
 * grande com o teto de produção tomaria 429 aleatórios.
 */
export const RATE_LIMIT_MAX = 100;

/** Janela do rate limit. 100 requisições por minuto por IP é o default do spec. */
const RATE_LIMIT_TIME_WINDOW = '1 minute';

export interface SecurityPluginOptions {
  env: Env;
  /** `undefined` explícito por causa de `exactOptionalPropertyTypes`: quem repassa o
   * valor de `buildApp` não precisa montar o objeto condicionalmente. */
  rateLimitMax?: number | undefined;
}

/**
 * Camada de segurança HTTP: headers do helmet, CORS pela lista literal de origens e rate
 * limit por IP.
 *
 * Registrado com `fastify-plugin` para não criar contexto encapsulado: os três precisam
 * valer para a instância raiz e todas as rotas, inclusive para requisições que caem no
 * handler de 404.
 *
 * O corpo do 429 **não** é montado aqui. O `errorResponseBuilder` default do
 * `@fastify/rate-limit@11` lança um `Error` com `statusCode: 429`, que cai no
 * error-handler da Tarefa 4a — e é ele quem traduz 429 em `RATE_LIMITED` no formato único.
 * Passar um `errorResponseBuilder` aqui duplicaria essa tradução em dois lugares.
 */
export const securityPlugin = fastifyPlugin(
  async function security(app: FastifyInstance, opts: SecurityPluginOptions): Promise<void> {
    await app.register(fastifyHelmet);

    // `origin` recebe a lista literal de `CORS_ORIGINS`. Nunca `true` nem `'*'`: com
    // `credentials: true`, refletir qualquer origem é entregar sessão autenticada para
    // qualquer site. Origem fora da lista simplesmente não recebe
    // `access-control-allow-origin`.
    await app.register(fastifyCors, {
      origin: opts.env.CORS_ORIGINS,
      credentials: true,
    });

    await app.register(fastifyRateLimit, {
      max: opts.rateLimitMax ?? RATE_LIMIT_MAX,
      timeWindow: RATE_LIMIT_TIME_WINDOW,
    });
  },
  { name: 'security' },
);
