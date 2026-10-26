import { ACTIVITY_TYPES, LEAD_STATUSES, MEMBERSHIP_ROLES } from '@zapresponse/contracts';
import { pgEnum } from 'drizzle-orm/pg-core';

/*
 * Tipos enum do Postgres, derivados dos arrays de `@zapresponse/contracts`.
 *
 * Os valores não são redigitados aqui de propósito: o banco e o frontend precisam
 * concordar, e a única forma de garantir isso é lerem a mesma constante. `pgEnum` aceita
 * `Readonly<[U, ...U[]]>`, então os arrays `as const` entram sem cópia nem cast.
 *
 * O nome do tipo no banco é `snake_case`; o identificador TypeScript é `camelCase`.
 */

export const membershipRoleEnum = pgEnum('membership_role', MEMBERSHIP_ROLES);

/** Usado por `leads.status` (Tarefa 7b). Nasce aqui para manter os enums num só arquivo. */
export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES);

/** Usado por `activities.type` (Tarefa 7b). */
export const activityTypeEnum = pgEnum('activity_type', ACTIVITY_TYPES);
