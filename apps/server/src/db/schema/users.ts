import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Conta de pessoa, independente de organização. O vínculo com uma organização é a
 * `memberships`, nunca uma coluna aqui.
 *
 * **Esta tabela pode ser substituída ou estendida pelo Better Auth na fase B3**
 * (spec §1 e B2). É por isso que ela está mínima agora: qualquer coluna de autenticação
 * acrescentada antes da B3 (hash de senha, verificação de e-mail, sessão) teria chance
 * alta de colidir com o schema que o Better Auth gera, e a migration de conciliação sai
 * mais caro do que esperar. Campos de perfil que o produto pedir antes da B3 entram em
 * `docs/backlog.md`, não aqui.
 *
 * Sem exclusão física na v1 (Global Constraints): desligar alguém é mudar o estado da
 * `memberships`, nunca `DELETE` em `users`.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /** Nulo permitido: o nome pode não vir no cadastro inicial nem do provedor de login. */
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
