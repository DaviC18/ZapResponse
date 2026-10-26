import { randomUUID } from 'node:crypto';

import type { MembershipRole } from '@zapresponse/contracts';

import {
  activities,
  followUpTasks,
  leads,
  memberships,
  organizations,
  users,
} from '../src/db/schema/index.js';
import { normalizePhone } from '../src/shared/phone.js';
import { getTestDb } from './helpers/db.js';

/**
 * Factories da suíte: cada uma insere uma linha e devolve a linha criada.
 *
 * `organizationId` é **obrigatório** nas factories de tabela comercial, espelhando a regra
 * de que todo repositório recebe `organizationId` — uma factory que o inventasse esconderia
 * exatamente o bug de vazamento entre organizações que os testes precisam pegar.
 *
 * Todo valor único (slug, e-mail, telefone) é gerado, nunca fixo: `organizations.slug`,
 * `users.email` e `UNIQUE (organization_id, phone)` em `leads` fariam o segundo `INSERT`
 * falhar, e a falha apareceria longe da causa.
 */

/** Tipos das linhas devolvidas. */
export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type FollowUpTaskRow = typeof followUpTasks.$inferSelect;

type OrganizationInsert = typeof organizations.$inferInsert;
type UserInsert = typeof users.$inferInsert;
type LeadInsert = typeof leads.$inferInsert;
type ActivityInsert = typeof activities.$inferInsert;
type FollowUpTaskInsert = typeof followUpTasks.$inferInsert;

/**
 * Sufixo único por chamada. `randomUUID` em vez de só um contador: os arquivos de teste
 * rodam em processos separados sobre o MESMO banco, e um contador por processo colidiria
 * entre eles em `organizations.slug` e `users.email`, que são únicos globalmente.
 */
function sufixo(): string {
  return randomUUID();
}

/**
 * Base aleatória por processo mais contador local. O contador garante unicidade dentro do
 * processo; a base aleatória evita colisão entre processos na mesma organização, onde vale
 * `UNIQUE (organization_id, phone)`.
 */
const baseTelefone = Math.floor(Math.random() * 100_000_000);
let contadorTelefone = 0;

/**
 * Telefone brasileiro único, em E.164. Passa por `normalizePhone` de propósito: a regra de
 * normalização mora em um só lugar, e assim a factory nunca grava uma forma que a aplicação
 * não geraria.
 */
export function proximoTelefone(): string {
  contadorTelefone += 1;
  const assinante = String((baseTelefone + contadorTelefone) % 100_000_000).padStart(8, '0');
  return normalizePhone(`+5511 9${assinante}`);
}

/** Desembrulha o `returning()` do Drizzle, que tipa o resultado como array. */
function umaLinha<T>(rows: T[], tabela: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`INSERT em ${tabela} não devolveu linha`);
  }
  return row;
}

export async function createOrganization(
  overrides: Partial<OrganizationInsert> = {},
): Promise<OrganizationRow> {
  const { db } = getTestDb();
  const id = sufixo();
  const rows = await db
    .insert(organizations)
    .values({ name: `Organização ${id}`, slug: `org-${id}`, ...overrides })
    .returning();
  return umaLinha(rows, 'organizations');
}

export async function createUser(overrides: Partial<UserInsert> = {}): Promise<UserRow> {
  const { db } = getTestDb();
  const id = sufixo();
  const rows = await db
    .insert(users)
    .values({ email: `pessoa-${id}@exemplo.test`, name: `Pessoa ${id}`, ...overrides })
    .returning();
  return umaLinha(rows, 'users');
}

export interface CreateMembershipInput {
  organizationId: string;
  userId: string;
  role?: MembershipRole;
}

export async function createMembership(input: CreateMembershipInput): Promise<MembershipRow> {
  const { db } = getTestDb();
  const rows = await db.insert(memberships).values(input).returning();
  return umaLinha(rows, 'memberships');
}

export type CreateLeadInput = { organizationId: string } & Partial<
  Omit<LeadInsert, 'organizationId'>
>;

export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const { db } = getTestDb();
  const { phone, ...resto } = input;
  const rows = await db
    .insert(leads)
    .values({
      name: `Lead ${sufixo()}`,
      // Telefone informado também é normalizado: o banco tem `UNIQUE (organization_id,
      // phone)` e a constraint só vale algo se tudo entrar na mesma forma.
      phone: phone === undefined ? proximoTelefone() : normalizePhone(phone),
      ...resto,
    })
    .returning();
  return umaLinha(rows, 'leads');
}

export type CreateActivityInput = { organizationId: string; leadId: string } & Partial<
  Omit<ActivityInsert, 'organizationId' | 'leadId'>
>;

export async function createActivity(input: CreateActivityInput): Promise<ActivityRow> {
  const { db } = getTestDb();
  const rows = await db
    .insert(activities)
    .values({ type: 'note', body: `Atividade ${sufixo()}`, ...input })
    .returning();
  return umaLinha(rows, 'activities');
}

export type CreateFollowUpTaskInput = { organizationId: string; leadId: string } & Partial<
  Omit<FollowUpTaskInsert, 'organizationId' | 'leadId'>
>;

/** Vencimento default: 1 dia à frente, para a tarefa nascer pendente e não atrasada. */
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export async function createFollowUpTask(input: CreateFollowUpTaskInput): Promise<FollowUpTaskRow> {
  const { db } = getTestDb();
  const rows = await db
    .insert(followUpTasks)
    .values({
      title: `Tarefa ${sufixo()}`,
      dueAt: new Date(Date.now() + UM_DIA_MS),
      ...input,
    })
    .returning();
  return umaLinha(rows, 'follow_up_tasks');
}
