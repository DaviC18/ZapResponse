import { randomUUID } from 'node:crypto';

import type { FastifyServerOptions } from 'fastify';

import type { Env } from './env.js';

/**
 * `FastifyServerOptions['logger']` inclui `undefined` por causa de
 * `exactOptionalPropertyTypes`; `NonNullable` é o que o construtor do Fastify aceita de
 * fato (passar `undefined` joga a resolução de overload para a variante http2).
 */
type LoggerOptions = NonNullable<FastifyServerOptions['logger']>;

/**
 * Caminhos que nunca podem aparecer no log. A lista é explícita em vez de genérica porque
 * o redact do pino é um filtro de caminhos, não de conteúdo: o que não está listado vaza.
 *
 * Cada chave sensível aparece em três formas, porque o `*` do pino (fast-redact) é de
 * **exatamente um** nível de profundidade, não de profundidade arbitrária:
 *
 * - sem prefixo (`password`), para a chave no topo do objeto logado;
 * - com `*.` (`*.password`), para um nível de aninhamento (`{ dados: { password } }`);
 * - com o caminho literal quando a estrutura é conhecida (`req.headers.authorization`).
 *
 * Não existe sintaxe de profundidade arbitrária. Logar um objeto mais fundo que isso
 * (`{ a: { b: { token } } }`) **vaza**, e nenhuma lista de caminhos resolve: a convenção
 * do projeto é não logar objeto fundo — logue campos escolhidos, nunca o objeto inteiro.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  "res.headers['set-cookie']",
  // `headers.*` é o caso que o serializer `req` do Fastify não cobre: quem loga
  // `{ headers: request.headers }` à mão não passa pelo serializer.
  'headers.authorization',
  'headers.cookie',
  '*.authorization',
  '*.cookie',
  'password',
  'passwordHash',
  'token',
  'secret',
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.secret',
  '*.DATABASE_URL',
  '*.BETTER_AUTH_SECRET',
];

/**
 * Identificador de requisição usado para correlacionar todas as linhas de log de uma
 * mesma requisição (e, nos erros 500, o log técnico com a resposta genérica).
 *
 * Passado nas opções do Fastify (`genReqId`), não nas do logger: é o Fastify quem lê essa
 * opção. Fica aqui para não duplicar a função nem a decisão de formato.
 */
export function genReqId(): string {
  return randomUUID();
}

/**
 * Opções de logger derivadas do ambiente.
 *
 * `pino-pretty` só em `development`: em produção e em teste a saída é JSON de uma linha
 * (processável por agregador, e sem o custo do transport em processo separado).
 */
export function buildLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  const base = {
    level: env.LOG_LEVEL,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  };

  if (env.NODE_ENV === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return base;
}
