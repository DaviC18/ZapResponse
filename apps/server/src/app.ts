import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { parseEnv, type Env } from './env.js';
import { buildLoggerOptions, genReqId } from './logger.js';
import { healthRoutes } from './modules/health/routes.js';
import { dbPlugin } from './plugins/db.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { securityPlugin } from './plugins/security.js';

/** Limite de corpo exigido pelo spec (B1): 1 MiB. Explícito para não depender do default. */
const BODY_LIMIT_BYTES = 1_048_576;

export interface BuildAppOptions {
  env?: Env;
  /** Teto do rate limit por IP por minuto. Default: `RATE_LIMIT_MAX` (100). */
  rateLimitMax?: number;
  /** Teto de conexões do pool do Postgres. Default: `DEFAULT_POOL_MAX` (10). */
  poolMax?: number;
}

/**
 * Monta a instância Fastify da aplicação, pronta para `app.inject()`. Não chama `listen`:
 * subir o socket é responsabilidade do `server.ts`.
 *
 * O env default é `parseEnv(process.env)`, que **lança**. `loadEnv` (que faz
 * `process.exit(1)`) fica fora daqui de propósito: um `process.exit` dentro de `buildApp`
 * mataria o worker do Vitest em vez de falhar um teste.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? parseEnv(process.env);

  const app = Fastify({
    logger: buildLoggerOptions(env),
    genReqId,
    bodyLimit: BODY_LIMIT_BYTES,
    // O log por requisição fica ligado, que é o default. A opção `disableRequestLogging`
    // está deprecada no fastify@5 (passá-la, mesmo como `false`, emite FSTDEP023) e sai no
    // fastify@6, então a intenção fica registrada aqui em vez de na opção.
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // Segurança antes do error-handler, por dois motivos: o 429 do rate limit é lançado como
  // erro e precisa cair no formato único de erro; e o handler de 404 do error-handler usa
  // `app.rateLimit()` como preHandler, o que exige o decorator já registrado.
  await typedApp.register(securityPlugin, { env, rateLimitMax: opts.rateLimitMax });
  await typedApp.register(errorHandlerPlugin);

  await typedApp.register(dbPlugin, {
    databaseUrl: env.DATABASE_URL,
    poolMax: opts.poolMax,
  });
  await typedApp.register(healthRoutes);

  if (env.NODE_ENV === 'test') {
    // Rotas de apoio da suíte de testes do contrato de erro. Registradas SOMENTE quando
    // NODE_ENV === 'test' para manter a superfície de produção limpa: `/__test/boom` lança
    // de propósito e nunca deve ser alcançável fora dos testes. Não exponha em outro
    // ambiente.
    typedApp.post(
      '/__test/echo',
      { schema: { body: z.object({ nome: z.string() }) } },
      (request, reply) => reply.send(request.body),
    );

    typedApp.get('/__test/boom', () => {
      throw new Error('segredo-que-nao-pode-vazar');
    });
  }

  return app;
}
