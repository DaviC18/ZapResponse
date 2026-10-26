import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { activityTypeEnum } from './enums.js';
import { leads } from './leads.js';
import { memberships } from './memberships.js';
import { organizations } from './organizations.js';

/**
 * Atividade: uma linha do histórico de um lead.
 *
 * **Não tem `updated_at`, e isso é deliberado.** Atividade é registro de log: depois de
 * criada ela não é editada, então uma coluna de atualização só documentaria uma operação
 * que não existe. O `spec.md:196` diz "+ `createdAt`/`updatedAt`" de forma genérica para
 * as tabelas; esta é uma divergência registrada em `docs/decisions.md`. Se um dia a edição
 * de nota passar a ser requisito, o caminho é uma migration que acrescente a coluna, não
 * um `UPDATE` sem rastro.
 *
 * `payload` guarda o `{ from, to }` do `status_change` da B4. `jsonb` e não colunas fixas
 * porque cada `type` carrega uma forma diferente, e a leitura é sempre "mostre o
 * histórico", nunca "filtre por este campo do payload".
 *
 * `created_by` é metade de uma FK composta contra `memberships`, não FK para `users.id`:
 * sem isso, alguém da organização B poderia ficar gravado como autor de uma atividade da
 * organização A e a identidade vazaria entre tenants pelo histórico.
 */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Metade da FK composta `(organization_id, lead_id)`; ver constraints abaixo. */
    leadId: uuid('lead_id').notNull(),
    type: activityTypeEnum('type').notNull(),
    body: text('body'),
    /** `{ from, to }` do `status_change`; nulo nos tipos que não têm dado estruturado. */
    payload: jsonb('payload'),
    /**
     * Nulável: atividade do tipo `system` não tem autor humano. Metade da FK composta
     * contra `memberships`; ver constraints abaixo.
     */
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // NÃO acrescente `updatedAt` aqui: ver o cabeçalho deste arquivo.
  },
  // Terceiro argumento de `pgTable` devolve ARRAY em drizzle-orm 0.45; a forma com objeto
  // está `@deprecated` em `pg-core/table.d.ts`.
  (table) => [
    // Aponta para `leads_org_id_unique`, não para a PK de `leads`: levar
    // `organization_id` na FK é o que impede uma atividade da organização A de
    // referenciar um lead da organização B. `cascade` porque o histórico não sobrevive ao
    // lead que ele descreve.
    foreignKey({
      name: 'activities_org_lead_leads_fk',
      columns: [table.organizationId, table.leadId],
      foreignColumns: [leads.organizationId, leads.id],
    }).onDelete('cascade'),

    // Sem `onDelete`: `NO ACTION` de propósito. `SET NULL` multicoluna anularia também
    // `organization_id`, que é `NOT NULL`. Apagar uma `membership` que aparece como autor
    // no histórico FALHA, e é o comportamento desejado: a v1 não apaga `memberships`.
    foreignKey({
      name: 'activities_org_created_by_memberships_fk',
      columns: [table.organizationId, table.createdBy],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),

    // Consulta mais quente da B4/B5: `GET /leads/:id` com o histórico em ordem
    // cronológica reversa. `createdAt.desc()` deixa o índice servir o `ORDER BY` sem sort.
    index('activities_org_lead_created_idx').on(
      table.organizationId,
      table.leadId,
      table.createdAt.desc(),
    ),
  ],
);
