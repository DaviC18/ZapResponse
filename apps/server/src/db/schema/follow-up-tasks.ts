import { sql } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { leads } from './leads.js';
import { memberships } from './memberships.js';
import { organizations } from './organizations.js';

/**
 * Tarefa de follow-up amarrada a um lead.
 *
 * **Não tem coluna `status`, e isso é deliberado (spec B2).** O estado é derivado das duas
 * colunas de tempo: `completed_at IS NOT NULL` → concluída; senão `due_at < now()` →
 * atrasada; senão pendente. Uma coluna `status` seria um segundo lugar para a mesma
 * verdade e sairia do ar no primeiro `UPDATE` que esquecesse de mantê-la em sincronia com
 * `completed_at`. **Não acrescente a coluna depois** — derive no serviço (B5) ou numa
 * coluna gerada, nunca num campo mutável à mão.
 *
 * `assigned_to`, `created_by` e `completed_by` são as três metades de FKs compostas contra
 * `memberships`, não FKs para `users.id`: é o que garante no banco que quem é atribuído ou
 * registrado como autor/executor é membro da mesma organização da tarefa.
 */
export const followUpTasks = pgTable(
  'follow_up_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Metade da FK composta `(organization_id, lead_id)`; ver constraints abaixo. */
    leadId: uuid('lead_id').notNull(),
    title: text('title').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    /** Nulo = não concluída. Junto com `dueAt`, é a fonte do estado derivado. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Quem concluiu. Nulo enquanto `completedAt` for nulo. */
    completedBy: uuid('completed_by'),
    assignedTo: uuid('assigned_to'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // NÃO acrescente uma coluna `status` aqui: ver o cabeçalho deste arquivo.
  },
  // Terceiro argumento de `pgTable` devolve ARRAY em drizzle-orm 0.45; a forma com objeto
  // está `@deprecated` em `pg-core/table.d.ts`.
  (table) => [
    // Aponta para `leads_org_id_unique` levando `organization_id`: uma tarefa da
    // organização A não consegue referenciar um lead da organização B. `cascade` porque a
    // tarefa não sobrevive ao lead.
    foreignKey({
      name: 'follow_up_tasks_org_lead_leads_fk',
      columns: [table.organizationId, table.leadId],
      foreignColumns: [leads.organizationId, leads.id],
    }).onDelete('cascade'),

    // As três FKs compostas contra `memberships` abaixo não declaram `onDelete`: ficam em
    // `NO ACTION` de propósito. `SET NULL` multicoluna anularia também `organization_id`,
    // que é `NOT NULL`, e `SET NULL (coluna)` do PG 15+ não é exposto pelo drizzle
    // 0.45.4. Apagar uma `membership` referenciada aqui FALHA em vez de orfanar ou
    // desatribuir em silêncio — a v1 não apaga `users` nem `memberships`.
    foreignKey({
      name: 'follow_up_tasks_org_assigned_to_memberships_fk',
      columns: [table.organizationId, table.assignedTo],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      name: 'follow_up_tasks_org_created_by_memberships_fk',
      columns: [table.organizationId, table.createdBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),
    foreignKey({
      name: 'follow_up_tasks_org_completed_by_memberships_fk',
      columns: [table.organizationId, table.completedBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),

    // Índice PARCIAL: a agenda só pergunta por tarefas em aberto, então as concluídas
    // ficam fora do índice e ele não cresce com o histórico.
    //
    // `.where()` do builder de `index()` (confirmado em
    // `node_modules/drizzle-orm/pg-core/indexes.d.ts:67`) e não `CREATE INDEX ... WHERE`
    // em SQL cru: um índice fora do schema TypeScript apareceria como não-declarado em
    // todo `db:generate` futuro, e o drizzle-kit poderia propor dropá-lo.
    //
    // O predicado é SQL cru porque é isso que `.where()` recebe; `completed_at` é o nome
    // da coluna no banco, não a chave TypeScript.
    index('follow_up_tasks_org_due_idx')
      .on(table.organizationId, table.dueAt)
      .where(sql`completed_at is null`),
  ],
);
