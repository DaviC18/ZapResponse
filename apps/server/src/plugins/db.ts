import type { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import type { Pool } from 'pg';

import { createDb, type Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Cliente Drizzle da aplicação. */
    db: Db;
    /** Pool do `pg` por baixo do Drizzle. Fechado pelo hook `onClose` deste plugin. */
    pool: Pool;
  }
}

export interface DbPluginOptions {
  databaseUrl: string;
  /** Teto de conexões do pool. `undefined` explícito por `exactOptionalPropertyTypes`. */
  poolMax?: number | undefined;
}

/**
 * Plugin de acesso ao banco: decora `app.db` e `app.pool` e garante o fechamento do pool.
 *
 * Registrado com `fastify-plugin` para não criar contexto encapsulado — os decorators
 * precisam existir na instância raiz, não só dentro do plugin.
 *
 * Não há conexão no boot (ver `createDb`): o `ready()` termina mesmo com o Postgres fora
 * do ar, e quem reporta a indisponibilidade é o `GET /health`, com 503.
 */
export const dbPlugin = fastifyPlugin(
  function db(app: FastifyInstance, opts: DbPluginOptions, done: (err?: Error) => void) {
    const { db: client, pool } = createDb(opts.databaseUrl, { max: opts.poolMax });

    // Um cliente ocioso que morre (Postgres reiniciado, conexão derrubada) emite 'error'
    // no pool. Sem listener, o Node trata como exceção não tratada e derruba o processo.
    pool.on('error', (error) => {
      app.log.error({ err: error }, 'erro em conexão ociosa do pool do Postgres');
    });

    app.decorate('db', client);
    app.decorate('pool', pool);

    // Sem isto cada `buildApp` deixa conexões abertas: em produção vaza no shutdown, e na
    // suíte o Vitest acusa handle pendurado.
    app.addHook('onClose', async () => {
      await pool.end();
    });

    done();
  },
  { name: 'db' },
);
