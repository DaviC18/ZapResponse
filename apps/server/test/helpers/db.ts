import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';

import { createDb, type Db } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Acesso ao banco de TESTE para a suíte: conexão memoizada, migrations idempotentes e
 * `resetDb`.
 *
 * Nada aqui lê variável de ambiente no topo do módulo. A guarda do `test/setup-env.ts` só
 * atribui `DATABASE_URL` quando o setup roda, e um `const` no momento do import pegaria
 * `undefined`.
 */

/**
 * Tamanho do pool da suíte. `2` não é chute: o `isolate` do Vitest recria este módulo por
 * arquivo de teste, então o `max` default (10) com 8–10 arquivos chega perto do
 * `max_connections` default (100) do Postgres.
 */
const TEST_POOL_MAX = 2;

/**
 * Tabelas truncadas por `resetDb`, em uma única instrução.
 *
 * Qualificadas com `public.` de propósito: sem o schema, o alvo do TRUNCATE depende do
 * `search_path` da conexão, e uma conexão com `search_path` apontado para outro schema
 * truncaria as tabelas homônimas de lá. Qualificado, o alvo é sempre o mesmo.
 */
export const TABELAS_TRUNCAVEIS = [
  'public.activities',
  'public.follow_up_tasks',
  'public.leads',
  'public.memberships',
  'public.users',
  'public.organizations',
] as const;

export interface AssertTestDatabaseUrlOptions {
  /** Nome da variável/origem citado na mensagem de erro. Default: `DATABASE_URL_TEST`. */
  variableName?: string;
}

/**
 * Extrai só o nome do banco de uma URL de conexão. Devolve `null` quando a URL não é
 * analisável ou não traz nome de banco. Nunca devolve a URL inteira: ela carrega usuário
 * e senha.
 */
export function databaseNameOf(connectionUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return null;
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return name === '' ? null : name;
}

/**
 * Nome de banco aceitável. Um identificador do Postgres sem aspas é `[A-Za-z0-9_]`, e o
 * sufixo `_test` é a regra da suíte. Nomes como `zapresponse/x_test` ou
 * `../zapresponse_test` (que a decodificação da URL produz) ficam de fora.
 */
const NOME_DE_BANCO_DE_TESTE = /^[A-Za-z0-9_]+_test$/;

/**
 * `true` quando a URL traz o parâmetro de conexão `options`.
 *
 * `options=-c search_path=...` muda o schema em que as instruções caem: validar só o nome
 * do banco deixaria um TRUNCATE acertar as tabelas de outro schema. A comparação ignora
 * caixa porque o libpq também ignora.
 */
function temParametroOptions(connectionUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return false;
  }
  for (const chave of parsed.searchParams.keys()) {
    if (chave.toLowerCase() === 'options') {
      return true;
    }
  }
  return false;
}

/**
 * Guarda de banco de teste: valida a URL e devolve o nome do banco.
 *
 * Esta é a **única** implementação da regra. Ela é chamada em dois lugares:
 * - `test/setup-env.ts`, antes de atribuir `DATABASE_URL` — cobre o caminho normal da
 *   suíte;
 * - `resetDbEm`, antes de truncar — cobre quem chame `resetDb()` de um script fora da
 *   suíte, com outro setup ou sem nenhum.
 *
 * As duas travas existem porque `resetDb` roda `TRUNCATE`: apontar isso para o banco de
 * desenvolvimento destrói dados reais. Duplicar a regra em dois arquivos deixaria uma das
 * cópias desatualizar sem ninguém notar.
 *
 * Nenhuma mensagem de erro contém a URL recebida — só o nome do banco.
 *
 * @throws {Error} quando a URL está ausente/vazia, não é analisável, não traz nome de
 * banco, ou o nome não termina em `_test`.
 */
export function assertTestDatabaseUrl(
  connectionUrl: string | undefined,
  options: AssertTestDatabaseUrlOptions = {},
): string {
  const variableName = options.variableName ?? 'DATABASE_URL_TEST';
  const raw = connectionUrl?.trim() ?? '';

  if (raw === '') {
    throw new Error(
      `${variableName} ausente ou vazia. Os testes truncam tabelas e nunca usam o ` +
        'DATABASE_URL de desenvolvimento. Copie .env.example para .env.test e aponte ' +
        `${variableName} para o Postgres de teste na porta 5433, com um banco cujo nome ` +
        'termine em "_test" (ex.: postgres://usuario:senha@localhost:5433/zapresponse_test).',
    );
  }

  if (temParametroOptions(raw)) {
    throw new Error(
      `${variableName} traz o parâmetro de conexão "options", que pode reescrever o ` +
        'search_path e levar o TRUNCATE para outro schema. Remova "options" da URL do ' +
        'banco de teste.',
    );
  }

  const databaseName = databaseNameOf(raw);

  if (databaseName === null) {
    throw new Error(
      `${variableName} não é uma URL de conexão válida com nome de banco. Use o formato ` +
        'postgres://usuario:senha@host:5433/<banco>_test (o nome do banco precisa ' +
        'terminar em "_test").',
    );
  }

  if (!NOME_DE_BANCO_DE_TESTE.test(databaseName)) {
    throw new Error(
      `${variableName} aponta para o banco "${databaseName}", que não é um nome de banco ` +
        'de teste válido. Os testes truncam tabelas; recuse-se a rodar fora de um banco ' +
        'de teste. O nome precisa ser composto só de letras, números e "_", e terminar ' +
        'em "_test" (ex.: zapresponse_test).',
    );
  }

  return databaseName;
}

/**
 * URL do banco de teste em uso, lida **na hora da chamada**.
 *
 * `DATABASE_URL_TEST` vem primeiro; `DATABASE_URL` é o fallback porque o `setup-env.ts`
 * já a derivou da primeira depois de validá-la. Em qualquer caminho o valor passa pela
 * guarda antes de ser usado.
 */
function rawTestDatabaseUrl(): string {
  return (process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '').trim();
}

/**
 * URL do banco de teste, já validada pela guarda. Exposta porque um teste precisa aplicar
 * as migrations por conta própria (o que dropa e reconstrói o schema) e não deve
 * reimplementar nem a leitura do ambiente nem a guarda.
 */
export function getTestDatabaseUrl(): string {
  const candidata = rawTestDatabaseUrl();
  assertTestDatabaseUrl(candidata);
  return candidata;
}

function testDatabaseUrl(): string {
  return getTestDatabaseUrl();
}

export interface TestDbHandle {
  db: Db;
  pool: Pool;
}

let handle: TestDbHandle | null = null;
let migrated: Promise<void> | null = null;

/**
 * Cliente Drizzle e pool do banco de teste, memoizados por processo.
 *
 * Memoizado porque o custo é a conexão: cada chamada criando um pool novo esgotaria o
 * `max_connections` do Postgres ao longo de uma suíte grande.
 */
export function getTestDb(): TestDbHandle {
  handle ??= createDb(testDatabaseUrl(), { max: TEST_POOL_MAX });
  return handle;
}

/**
 * Fecha o pool memoizado. Chamado no `afterAll` do `test/setup-env.ts`: sem isso o pool
 * de cada arquivo fica aberto até o fim da suíte e o Vitest acusa handle pendurado.
 *
 * Zera a memoização para que um `getTestDb()` posterior no mesmo processo abra um pool
 * novo em vez de devolver um pool já encerrado.
 */
export async function closeTestDb(): Promise<void> {
  const atual = handle;
  handle = null;
  migrated = null;
  if (atual !== null) {
    await atual.pool.end();
  }
}

/**
 * Aplica as migrations uma vez por processo.
 *
 * A promessa é guardada (não um booleano) para que duas chamadas concorrentes esperem a
 * mesma execução, em vez de rodarem o migrator em paralelo sobre o mesmo banco.
 */
export async function ensureMigrated(): Promise<void> {
  migrated ??= runMigrations(testDatabaseUrl());
  await migrated;
}

/**
 * Trunca as tabelas do banco apontado por `databaseUrl`, depois de passar pela guarda.
 *
 * Exposta para que o teste da guarda não precise mexer em variável de ambiente no meio da
 * suíte. Um único `TRUNCATE a, b, c ... RESTART IDENTITY CASCADE`: uma instrução só não
 * depende da ordem das FKs, e `TRUNCATE` não derruba o schema.
 *
 * Quando a URL é a do banco de teste em uso, reaproveita o pool memoizado; para outra URL
 * abre um pool de uma conexão e o fecha no `finally` — truncar num pool que não é o da URL
 * pedida seria mentir sobre o alvo.
 */
export async function resetDbEm(databaseUrl: string | undefined): Promise<void> {
  const url = databaseUrl?.trim() ?? '';
  assertTestDatabaseUrl(url, { variableName: 'A URL passada para resetDb' });

  const comando = sql.raw(`truncate ${TABELAS_TRUNCAVEIS.join(', ')} restart identity cascade`);

  if (url === rawTestDatabaseUrl()) {
    await getTestDb().db.execute(comando);
    return;
  }

  const { db, pool } = createDb(url, { max: 1 });
  try {
    await db.execute(comando);
  } finally {
    await pool.end();
  }
}

/** Limpa todas as tabelas do banco de teste em uso, preservando o schema. */
export async function resetDb(): Promise<void> {
  await resetDbEm(testDatabaseUrl());
}
