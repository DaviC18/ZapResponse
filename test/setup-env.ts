import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { afterAll } from 'vitest';

import { assertTestDatabaseUrl, closeTestDb } from '../apps/server/test/helpers/db.js';

process.env.NODE_ENV = 'test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// `.env.test` primeiro, `.env` depois. `override: false` em ambos: variáveis já presentes
// no ambiente real ganham dos arquivos, e `.env` nunca sobrescreve `.env.test`.
for (const fileName of ['.env.test', '.env']) {
  const filePath = path.join(rootDir, fileName);
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

// Guarda de banco de teste. A suíte trunca tabelas (resetDb), então apontá-la para o banco
// de desenvolvimento destruiria dados reais. Nunca cair no DATABASE_URL de desenvolvimento.
//
// A regra vive em `assertTestDatabaseUrl` (apps/server/test/helpers/db.ts), que é a mesma
// função chamada por `resetDbEm` antes de truncar. Uma implementação só, coberta por
// `apps/server/test/helpers.test.ts`: enquanto a guarda era código de topo de módulo, nada
// a testava e um refator a quebraria em silêncio.
const databaseUrlTest = process.env.DATABASE_URL_TEST?.trim();

assertTestDatabaseUrl(databaseUrlTest);

process.env.DATABASE_URL = databaseUrlTest;

// Fecha o pool memoizado ao fim de cada arquivo de teste. Sem isto, o `isolate` do Vitest
// deixa um pool por arquivo aberto até o fim da suíte e o runner acusa handle pendurado.
afterAll(async () => {
  await closeTestDb();
});
