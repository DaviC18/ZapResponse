export const CONTRACTS_VERSION = '0.0.0' as const;

/*
 * Valores dos enums do domínio (spec B2).
 *
 * Fonte única: o schema Drizzle constrói os tipos enum do Postgres a partir destes
 * arrays (`pgEnum('membership_role', MEMBERSHIP_ROLES)`) e o frontend valida contra os
 * mesmos valores. Duplicar a lista no banco e na UI é o que faz as duas divergirem.
 *
 * A ordem dos valores é significativa: ela é a ordem de criação do tipo no Postgres e,
 * portanto, a ordem de `ORDER BY <coluna>`. Acrescentar valor no fim é compatível;
 * reordenar ou remover exige migration explícita.
 */

export const MEMBERSHIP_ROLES = ['owner', 'admin', 'member'] as const;

export const LEAD_STATUSES = [
  'new',
  'in_progress',
  'waiting',
  'scheduled',
  'won',
  'lost',
] as const;

export const ACTIVITY_TYPES = [
  'note',
  'status_change',
  'contact_attempt',
  'follow_up_completed',
  'system',
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
