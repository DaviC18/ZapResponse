import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb } from './client.js';

/**
 * Localiza a pasta `drizzle/` subindo a partir do diretório DESTE módulo.
 *
 * O caminho não pode ser relativo ao cwd: o script roda da raiz do monorepo
 * (`npm run db:migrate`, cwd = raiz) e do workspace (`npm run db:migrate -w
 * @zapresponse/server`, cwd = `apps/server`), e um `./drizzle` acertaria um dos dois e
 * erraria o outro. Subindo a partir de `import.meta.url` o resultado é o mesmo nos dois
 * casos — e também quando o módulo compilado roda de `dist/src/db/`, que fica um nível
 * mais fundo que o fonte.
 *
 * A pasta só conta como a certa se tiver `meta/_journal.json`: é o arquivo que o
 * `migrate` lê para saber quais migrations já foram aplicadas, e uma pasta `drizzle/`
 * sem ele levaria a um "0 migrations applied" silencioso.
 */
export function resolveMigrationsFolder(): string {
  const startDir = path.dirname(fileURLToPath(import.meta.url));

  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'drizzle');
    if (existsSync(path.join(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Pasta de migrations não encontrada a partir de "${startDir}". Esperava um ` +
          'diretório `drizzle/` com `meta/_journal.json` em algum nível acima (gerado ' +
          'por `npm run db:generate`).',
      );
    }
    dir = parent;
  }
}

/**
 * Aplica todas as migrations pendentes no banco apontado por `databaseUrl`.
 *
 * Recebe a URL por argumento — não lê `process.env` — porque é isso que deixa o helper de
 * teste (Tarefa 9) apontar para o banco de teste sem depender de qual `.env` foi carregado.
 * Abre um pool próprio de uma conexão (migration é sequencial) e o fecha sempre, inclusive
 * quando a migration falha: sem o `finally` um erro aqui deixaria o processo pendurado na
 * conexão aberta.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, pool } = createDb(databaseUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  } finally {
    await pool.end();
  }
}

/**
 * Entrada do script `db:migrate`. A URL vem **só** do ambiente, sem fallback e sem
 * carregar `.env` por conta própria: o `.env` default deste repositório aponta para o
 * banco de desenvolvimento, e um fallback silencioso transformaria "esqueci de exportar a
 * variável" em "apliquei migration no banco errado". Quem chama escolhe o banco.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error(
      'DATABASE_URL ausente. Passe explicitamente o banco alvo, ex.: ' +
        'DATABASE_URL=postgres://usuario:senha@localhost:5433/zapresponse_test ' +
        'npm run db:migrate',
    );
  }

  await runMigrations(databaseUrl);
}

// Só roda quando este arquivo é o ponto de entrada do processo; importado (pelo helper de
// teste, por exemplo) não executa nada.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  try {
    await main();
    console.log('migrations aplicadas');
  } catch (error) {
    // A mensagem vai para stderr sem a URL de conexão: ela carrega usuário e senha.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
