import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { schema } from './schema/index.js';

/** Conexões por pool quando o chamador não escolhe. */
export const DEFAULT_POOL_MAX = 10;

/**
 * Teto para abrir uma conexão. Curto de propósito: é o que faz uma `DATABASE_URL`
 * inacessível virar erro rápido (503 no `/health`) em vez de pendurar a requisição — e é
 * o que mantém o teste do banco inacessível em tempo de teste.
 */
const CONNECTION_TIMEOUT_MS = 5000;

/** Tipo do cliente Drizzle da aplicação. Já amarrado ao barril do schema. */
export type Db = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  /**
   * Tamanho máximo do pool. `undefined` explícito por causa de
   * `exactOptionalPropertyTypes`: quem repassa um valor opcional não precisa montar o
   * objeto condicionalmente.
   *
   * Parametrizável porque a suíte de testes precisa de um pool pequeno: o `isolate` do
   * Vitest recria o módulo por arquivo de teste, e vários arquivos com o default de 10
   * chegariam perto do `max_connections` (100) do Postgres.
   */
  max?: number | undefined;
}

export interface DbHandle {
  db: Db;
  pool: Pool;
}

/**
 * Cria o pool do `pg` e o cliente Drizzle sobre ele.
 *
 * **Não conecta.** O pool do `pg` abre conexão por demanda, na primeira query; forçar um
 * `connect()` aqui faria a subida do processo (e o `buildApp` dos testes) falhar antes de
 * qualquer rota responder, trocando um 503 bem formado por uma exceção no boot.
 *
 * O `pool` é devolvido junto porque alguém precisa chamá-lo de volta: quem cria é quem
 * fecha (`pool.end()`), e no servidor isso acontece no hook `onClose` do plugin de db.
 */
export function createDb(databaseUrl: string, opts: CreateDbOptions = {}): DbHandle {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: opts.max ?? DEFAULT_POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}
