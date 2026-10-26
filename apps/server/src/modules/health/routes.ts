import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError, ERROR_CODES } from '../../shared/errors.js';

/**
 * Corpo do caso bom, e só dele. O 503 é montado pelo error-handler a partir do `AppError`,
 * no formato único de erro, então não há schema de resposta para ele aqui.
 */
const healthResponseSchema = z.object({ status: z.literal('ok') });

/**
 * `GET /health`: liveness mais a checagem de que o banco responde.
 *
 * A checagem é um `select 1` — a mais leve que ainda prova que há conexão utilizável no
 * pool. Falhando, a resposta é 503 com mensagem **fixa**: a exceção do `pg` traz a string
 * de conexão (usuário, senha, host), então nada dela é interpolado na resposta. O erro
 * real vai para o log, correlacionado pelo `reqId`.
 */
export function healthRoutes(
  app: FastifyInstance,
  _opts: unknown,
  done: (err?: Error) => void,
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    { schema: { response: { 200: healthResponseSchema } } },
    async (request) => {
      try {
        await app.db.execute(sql`select 1`);
      } catch (error) {
        request.log.error({ err: error }, 'checagem do banco no /health falhou');
        throw new AppError({
          code: ERROR_CODES.DB_UNAVAILABLE,
          message: 'Banco de dados indisponível',
          statusCode: 503,
        });
      }

      return { status: 'ok' } as const;
    },
  );

  done();
}
