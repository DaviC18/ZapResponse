import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { membershipRoleEnum } from './enums.js';
import { organizations } from './organizations.js';
import { users } from './users.js';

/**
 * Vínculo entre uma pessoa e uma organização, com o papel dela ali.
 *
 * A `unique('memberships_org_user_unique')` abaixo não é só uma regra de negócio: ela é o
 * alvo das cinco FKs compostas da Tarefa 7b (`leads.assigned_to`, `activities.created_by`,
 * `follow_up_tasks.assigned_to`/`created_by`/`completed_by`). O Postgres só aceita uma FK
 * contra um conjunto de colunas que tenha índice único, então sem esta constraint nenhuma
 * daquelas FKs pode existir — e o isolamento entre organizações deixaria de ser garantido
 * pelo banco, passando a depender de cada serviço lembrar de filtrar.
 *
 * As duas FKs daqui são `cascade` porque uma membership não faz sentido sem a organização
 * nem sem a pessoa. Isso não contradiz o "sem exclusão física na v1": `users` e
 * `organizations` não são apagados; o cascade é a rede de segurança para a exclusão real
 * de uma organização, caso ela chegue.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Em drizzle-orm 0.45 o terceiro argumento de `pgTable` devolve um ARRAY de builders.
  // A forma com objeto (`() => ({ ... })`) ainda compila, mas está marcada
  // `@deprecated` em `pg-core/table.d.ts` e some na próxima major.
  (table) => [unique('memberships_org_user_unique').on(table.organizationId, table.userId)],
);
