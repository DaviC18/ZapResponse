/**
 * Barril do schema Drizzle.
 *
 * `createDb` tipa o cliente como `NodePgDatabase<typeof schema>`, e é esse genérico que
 * faz `db.query.<tabela>` (a API relacional do Drizzle) existir. Toda tabela precisa
 * aparecer no objeto `schema` abaixo: se uma ficar de fora, `db.select()` continua
 * funcionando e só `db.query.<tabela>` desaparece — uma falha silenciosa no lugar de um
 * erro de compilação óbvio.
 *
 * Aqui está o schema completo: os três enums, as três tabelas de identidade (Tarefa 7a) e
 * as três tabelas comerciais (Tarefa 7b). É este objeto que o `drizzle.config.ts`, o
 * `migrate`, as factories e todo repositório a partir da B4 consomem.
 */

export { activities } from './activities.js';
export { activityTypeEnum, leadStatusEnum, membershipRoleEnum } from './enums.js';
export { followUpTasks } from './follow-up-tasks.js';
export { leads } from './leads.js';
export { memberships } from './memberships.js';
export { organizations } from './organizations.js';
export { users } from './users.js';

import { activities } from './activities.js';
import { activityTypeEnum, leadStatusEnum, membershipRoleEnum } from './enums.js';
import { followUpTasks } from './follow-up-tasks.js';
import { leads } from './leads.js';
import { memberships } from './memberships.js';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const schema = {
  organizations,
  users,
  memberships,
  leads,
  activities,
  followUpTasks,
  membershipRoleEnum,
  leadStatusEnum,
  activityTypeEnum,
} as const;
