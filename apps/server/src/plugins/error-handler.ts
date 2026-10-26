import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import { AppError, ERROR_CODES, toErrorResponseBody } from '../shared/errors.js';

/**
 * Mensagem fixa de falha interna. É a única coisa que um 500 devolve: `err.message`,
 * `err.stack` e caminho de arquivo nunca saem na resposta, em nenhum ambiente — nem em
 * desenvolvimento, para que a diferença entre ambientes não esconda um vazamento. O erro
 * real vai para o log, correlacionado pelo `reqId`.
 */
const INTERNAL_ERROR_MESSAGE = 'Erro interno do servidor.';

/** `details` de um erro de validação: só caminho e motivo, nada de stack. */
function validationDetails(
  issues: readonly { instancePath: string; message?: string | undefined }[],
): { path: string; message: string }[] {
  return issues.map((issue) => ({
    path: issue.instancePath,
    message: issue.message ?? 'Valor inválido.',
  }));
}

/**
 * Status que a resposta terá, decidido antes de responder porque o nível do log depende
 * dele. A ordem dos casos espelha a dos ramos de `handleError`; mudar um sem o outro faz
 * o log mentir sobre o status.
 */
function resolveStatusCode(error: FastifyError): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    return 400;
  }
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return 413;
  }
  return error.statusCode ?? 500;
}

function handleError(
  this: FastifyInstance,
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const resolvedStatusCode = resolveStatusCode(error);

  // Sempre antes de responder: a resposta é pobre de propósito, então o log é o único
  // lugar onde o erro real existe. O erro completo (com stack) vai para o log nos dois
  // níveis — o que muda é só o nível.
  //
  // `error` só para 5xx. 4xx é comportamento esperado do cliente (validação, 404, 429) e
  // não exige ação de ninguém: logar tudo como `error` transforma uma enxurrada barrada
  // pelo rate limit em uma linha `error` por requisição, afogando os 5xx de verdade.
  if (resolvedStatusCode >= 500) {
    request.log.error({ err: error }, 'requisição falhou');
  } else {
    request.log.warn({ err: error }, 'requisição falhou');
  }

  if (error instanceof AppError) {
    // 5xx cai na mensagem genérica como qualquer outro erro de servidor: nada garante que
    // a `message` de um `AppError` 500 tenha sido escrita para o cliente ler, e `details`
    // de um 5xx pode carregar a mesma coisa. O `code` é preservado porque é identificador
    // nosso e parte do contrato público (é por ele que o cliente decide o que fazer; o
    // `/health`, por exemplo, devolve `DB_UNAVAILABLE` com 503), não segredo.
    if (resolvedStatusCode >= 500) {
      void reply
        .status(resolvedStatusCode)
        .send(toErrorResponseBody(error.code, INTERNAL_ERROR_MESSAGE));
      return;
    }

    void reply
      .status(error.statusCode)
      .send(toErrorResponseBody(error.code, error.message, error.details));
    return;
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    void reply
      .status(400)
      .send(
        toErrorResponseBody(
          ERROR_CODES.VALIDATION_ERROR,
          'Dados da requisição inválidos.',
          validationDetails(error.validation),
        ),
      );
    return;
  }

  const statusCode = resolvedStatusCode;

  if (statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    void reply
      .status(413)
      .send(
        toErrorResponseBody(ERROR_CODES.PAYLOAD_TOO_LARGE, 'Corpo da requisição é grande demais.'),
      );
    return;
  }

  if (statusCode === 429) {
    void reply
      .status(429)
      .send(
        toErrorResponseBody(
          ERROR_CODES.RATE_LIMITED,
          'Muitas requisições. Tente novamente mais tarde.',
        ),
      );
    return;
  }

  if (statusCode >= 400 && statusCode <= 499) {
    // Erro do cliente gerado pelo próprio Fastify (JSON malformado, content-type não
    // suportado, etc.). A mensagem do Fastify descreve a requisição, não o interno do
    // servidor, então pode ser repassada.
    void reply.status(statusCode).send(toErrorResponseBody(ERROR_CODES.BAD_REQUEST, error.message));
    return;
  }

  void reply
    .status(500)
    .send(toErrorResponseBody(ERROR_CODES.INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE));
}

function handleNotFound(_request: FastifyRequest, reply: FastifyReply): void {
  void reply
    .status(404)
    .send(toErrorResponseBody(ERROR_CODES.NOT_FOUND, 'Recurso não encontrado.'));
}

/**
 * Plugin do formato único de erro. Registrado com `fastify-plugin` para não criar contexto
 * encapsulado: os handlers precisam valer para a instância raiz e todas as rotas.
 *
 * O `preHandler` do handler de 404 é o rate limit, e isso não é detalhe: o
 * `@fastify/rate-limit@11` aplica o limite por rota registrada (hook `onRoute`), então uma
 * URL inexistente não passaria por limite nenhum — qualquer um poderia marretar
 * `/qualquer-coisa` sem teto. `app.rateLimit()` herda `max` e `timeWindow` da configuração
 * global do plugin, e por isso o plugin de segurança precisa estar registrado antes deste.
 */
export const errorHandlerPlugin = fastifyPlugin(
  function errorHandler(app: FastifyInstance, _opts: unknown, done: (err?: Error) => void) {
    app.setErrorHandler(handleError);
    app.setNotFoundHandler({ preHandler: app.rateLimit() }, handleNotFound);
    done();
  },
  { name: 'error-handler' },
);
