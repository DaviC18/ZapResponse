import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Organização: a raiz do isolamento multi-tenant.
 *
 * Toda tabela comercial carrega `organization_id` apontando para cá, e é esse valor que
 * as FKs compostas usam para impedir que uma linha de uma organização referencie uma
 * linha de outra.
 *
 * O nome de cada coluna é escrito explicitamente em `snake_case`. A API sem nome do
 * Drizzle (`uuid()`) usaria a chave TypeScript (`createdAt`) como nome de coluna, a menos
 * que `casing: 'snake_case'` esteja configurado tanto no cliente quanto no drizzle-kit;
 * nome explícito não depende de configuração nenhuma estar correta nos dois lugares.
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Identificador legível na URL. Único globalmente. */
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
