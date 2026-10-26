import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { leadStatusEnum } from './enums.js';
import { memberships } from './memberships.js';
import { organizations } from './organizations.js';

/**
 * Lead: a pessoa que entrou no funil de uma organização.
 *
 * `assigned_to` **não** é FK para `users.id`. Ela é metade de uma FK composta
 * `(organization_id, assigned_to)` contra `memberships (organization_id, user_id)`. Uma FK
 * simples para `users.id` deixaria atribuir um lead da organização A a alguém que só é
 * membro da organização B — o banco aceitaria, e o isolamento passaria a depender de cada
 * serviço lembrar de filtrar. Com a FK composta, só passa quem é membro da mesma
 * organização do lead.
 *
 * A coluna é nullable, então o Postgres aplica `MATCH SIMPLE`: `NULL` (lead sem
 * responsável) passa sem consultar a tabela referenciada; preenchida, só passa se a
 * membership daquela organização existir.
 *
 * Nome de cada coluna escrito explicitamente em `snake_case`: não há
 * `casing: 'snake_case'` configurado, e a forma sem nome (`uuid()`) usaria a chave
 * TypeScript (`createdAt`) como nome de coluna no Postgres.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Normalizado em E.164 (foco BR) pelo helper da Tarefa 6 antes de chegar aqui. */
    phone: text('phone').notNull(),
    email: text('email'),
    /** Origem livre ("indicação", "instagram", …). Sem enum: o spec não fecha a lista. */
    source: text('source'),
    status: leadStatusEnum('status').notNull().default('new'),
    /** Metade da FK composta contra `memberships`; ver o bloco de constraints abaixo. */
    assignedTo: uuid('assigned_to'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Em drizzle-orm 0.45 o terceiro argumento de `pgTable` devolve um ARRAY de builders.
  // A forma com objeto (`() => ({ ... })`) ainda compila, mas está marcada
  // `@deprecated` em `pg-core/table.d.ts` e some na próxima major.
  (table) => [
    // Alvo das FKs compostas `(organization_id, lead_id)` de `activities` e
    // `follow_up_tasks`. `id` já é PK, mas o Postgres exige índice único sobre o conjunto
    // EXATO de colunas referenciadas, e a PK cobre só `(id)`. Sem esta constraint as duas
    // FKs compostas são recusadas na criação.
    unique('leads_org_id_unique').on(table.organizationId, table.id),

    // Dois leads com o mesmo telefone na mesma organização são a mesma pessoa e deixariam
    // o funil ambíguo. Organizações diferentes podem repetir o telefone sem conflito —
    // daí o par, não um unique só em `phone`.
    unique('leads_org_phone_unique').on(table.organizationId, table.phone),

    // Sem `onDelete`: fica em `NO ACTION` de propósito. `ON DELETE SET NULL` numa FK
    // multicoluna anularia TODAS as colunas da FK, e `organization_id` é `NOT NULL`
    // (a sintaxe `SET NULL (coluna)` do PG 15+ não é exposta pelo drizzle 0.45.4).
    // Consequência desejada: apagar uma `membership` com leads atribuídos FALHA em vez de
    // orfanar a linha ou desatribuir em silêncio. A v1 não apaga `users` nem
    // `memberships` — desligar um membro é mudar o estado da membership.
    foreignKey({
      name: 'leads_org_assigned_to_memberships_fk',
      columns: [table.organizationId, table.assignedTo],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }),

    // Listagem do funil: filtro por organização + status é a consulta padrão da B4.
    index('leads_org_status_idx').on(table.organizationId, table.status),

    // NÃO acrescente um `index('leads_org_phone_idx').on(organizationId, phone)` aqui.
    // A `leads_org_phone_unique` acima já é implementada pelo Postgres como um índice
    // B-tree único sobre exatamente `(organization_id, phone)`, e serve toda busca por
    // telefone dentro da organização (dedup no cadastro, webhook de WhatsApp). Um segundo
    // índice sobre as mesmas colunas na mesma ordem é uma estrutura idêntica: custo de
    // escrita e de espaço em cada INSERT/UPDATE, zero ganho de leitura. O requisito do
    // spec B2 ("índice em `leads (organization_id, phone)`") está satisfeito pela
    // constraint única. Removido na Tarefa 8.
  ],
);
