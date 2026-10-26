import { defineConfig } from 'drizzle-kit';

/**
 * Configuração do `drizzle-kit`, consumida pelo script `db:generate`.
 *
 * Os caminhos são relativos ao diretório deste arquivo (`apps/server`), que é o cwd do
 * `drizzle-kit` quando o script roda via `npm run db:generate -w @zapresponse/server`.
 *
 * `dbCredentials.url` sai do ambiente e **não** tem fallback para nenhuma URL de
 * desenvolvimento: `generate` compara o schema TypeScript com os snapshots em `drizzle/`
 * e não abre conexão, então aqui a URL é inerte. Quem conecta é o `src/db/migrate.ts`,
 * que exige `DATABASE_URL` explícita. Se algum dia um comando do drizzle-kit que toca o
 * banco (`push`, `studio`, `drop`) for usado, passe a URL do banco certo no ambiente
 * daquele comando — uma URL vazia faz o comando falhar, que é melhor do que acertar o
 * banco errado em silêncio.
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
