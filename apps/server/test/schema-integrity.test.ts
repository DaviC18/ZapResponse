import { sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../src/db/migrate.js';
import { activities, followUpTasks, leads } from '../src/db/schema/index.js';
import {
  createActivity,
  createFollowUpTask,
  createLead,
  createMembership,
  createOrganization,
  createUser,
  proximoTelefone,
} from './factories.js';
import { ensureMigrated, getTestDatabaseUrl, getTestDb, resetDb } from './helpers/db.js';

/**
 * Testes de integridade do schema contra um Postgres real.
 *
 * Nada aqui olha o texto da migration: um `grep` no `.sql` não prova nada sobre o banco.
 * Cada teste tenta o `INSERT`/`DELETE` e confere o erro que o Postgres devolve — `code`,
 * `constraint` e mensagem. É o que faz o teste falhar de verdade se a constraint
 * desaparecer do schema.
 *
 * O primeiro teste dropa o schema `public` e aplica as migrations do zero, e é por isso
 * que ele vem primeiro no arquivo: os demais rodam sobre o schema que ele acabou de
 * construir. `fileParallelism: false` no `vitest.config.ts` garante que nenhum outro
 * arquivo esteja usando o banco enquanto isso.
 *
 * A conexão, a guarda de nome de banco e as factories vêm dos helpers (Tarefa 9): este
 * arquivo montava o próprio setup de banco e não deve mais duplicá-lo. A guarda continua
 * valendo para o `drop schema` daqui, porque `getTestDatabaseUrl()` só devolve a URL depois
 * de confirmar que o nome do banco termina em `_test`.
 */

const databaseUrl = getTestDatabaseUrl();

beforeAll(async () => {
  // `ensureMigrated` antes do `resetDb`: num banco ainda não migrado o TRUNCATE falharia
  // por tabela inexistente, e a falha esconderia a causa real.
  await ensureMigrated();
  await resetDb();
});

/**
 * Desembrulha o erro do `pg` de dentro do `DrizzleQueryError`.
 *
 * O drizzle-orm 0.45 embrulha toda falha de query: a `message` do erro que chega ao
 * chamador é `Failed query: <sql>\nparams: ...`, e a mensagem do Postgres fica em
 * `cause`. Um `expect(...).rejects.toThrow(/violates/i)` olharia só a mensagem de fora e
 * **nunca** casaria — passaria a impressão de teste frouxo ou quebrado. Por isso as
 * asserções são feitas sobre o `DatabaseError` de verdade, que ainda traz `code` e
 * `constraint` e permite apontar a constraint exata.
 */
function unwrapDatabaseError(error: unknown): DatabaseError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current instanceof DatabaseError) {
      return current;
    }
    if (!(current instanceof Error)) {
      return null;
    }
    current = current.cause;
  }
  return null;
}

/** Roda a operação esperando recusa do Postgres e devolve o erro para as asserções. */
async function expectDatabaseError(run: () => Promise<unknown>): Promise<DatabaseError> {
  try {
    await run();
  } catch (error) {
    const databaseError = unwrapDatabaseError(error);
    if (databaseError === null) {
      throw error;
    }
    return databaseError;
  }
  throw new Error(
    'A operação foi ACEITA pelo Postgres. Era esperada uma recusa: a constraint que ' +
      'deveria barrá-la não existe no banco.',
  );
}

/** `SQLSTATE 23503` — violação de chave estrangeira. */
const FOREIGN_KEY_VIOLATION = '23503';
/** `SQLSTATE 23505` — violação de unicidade. */
const UNIQUE_VIOLATION = '23505';

async function nomesDeTabelasPublicas(): Promise<string[]> {
  const { db } = getTestDb();
  const result = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe('integridade do schema no Postgres', () => {
  it('migrations aplicam em banco limpo', async () => {
    const { db } = getTestDb();

    // O journal do drizzle vive no schema `drizzle`, não no `public`: sem dropá-lo
    // também, o migrator acharia que tudo já foi aplicado e não criaria tabela nenhuma.
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);

    expect(await nomesDeTabelasPublicas()).toEqual([]);

    await runMigrations(databaseUrl);

    expect(await nomesDeTabelasPublicas()).toEqual([
      'activities',
      'follow_up_tasks',
      'leads',
      'memberships',
      'organizations',
      'users',
    ]);
  });

  it('atividade apontando lead de outra organização é rejeitada', async () => {
    const orgA = await createOrganization();
    const orgB = await createOrganization();
    const leadA = await createLead({ organizationId: orgA.id });

    const error = await expectDatabaseError(() =>
      createActivity({ organizationId: orgB.id, leadId: leadA.id }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint).toBe('activities_org_lead_leads_fk');
    expect(error.message).toMatch(/violates foreign key constraint "activities_org_lead_leads_fk"/);
  });

  it('createdBy de usuário sem membership na organização é rejeitado', async () => {
    const orgA = await createOrganization();
    const orgB = await createOrganization();
    const pessoa = await createUser();
    // Membro só da organização B.
    await createMembership({ organizationId: orgB.id, userId: pessoa.id });
    const leadA = await createLead({ organizationId: orgA.id });

    const error = await expectDatabaseError(() =>
      createActivity({ organizationId: orgA.id, leadId: leadA.id, createdBy: pessoa.id }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint).toBe('activities_org_created_by_memberships_fk');
    expect(error.message).toMatch(
      /violates foreign key constraint "activities_org_created_by_memberships_fk"/,
    );

    // Controle positivo: com membership na MESMA organização a mesma linha passa. Sem
    // isto, o teste acima poderia estar sendo barrado por outro motivo.
    await createMembership({ organizationId: orgA.id, userId: pessoa.id });
    await expect(
      createActivity({ organizationId: orgA.id, leadId: leadA.id, createdBy: pessoa.id }),
    ).resolves.toBeDefined();
  });

  it('assignedTo de usuário sem membership na organização é rejeitado', async () => {
    const orgA = await createOrganization();
    const orgB = await createOrganization();
    const pessoa = await createUser();
    // Membro só da organização B.
    await createMembership({ organizationId: orgB.id, userId: pessoa.id });

    const error = await expectDatabaseError(() =>
      createLead({ organizationId: orgA.id, assignedTo: pessoa.id }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint).toBe('leads_org_assigned_to_memberships_fk');
    expect(error.message).toMatch(
      /violates foreign key constraint "leads_org_assigned_to_memberships_fk"/,
    );

    // Controle positivo: na organização em que a pessoa é membro, a atribuição passa.
    await expect(
      createLead({ organizationId: orgB.id, assignedTo: pessoa.id }),
    ).resolves.toBeDefined();
  });

  it('mesmo telefone duas vezes na mesma organização é rejeitado', async () => {
    const org = await createOrganization();
    const phone = proximoTelefone();
    await createLead({ organizationId: org.id, phone });

    const error = await expectDatabaseError(() => createLead({ organizationId: org.id, phone }));

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint).toBe('leads_org_phone_unique');
    expect(error.message).toMatch(
      /duplicate key value violates unique constraint "leads_org_phone_unique"/,
    );
  });

  it('o mesmo telefone em organizações diferentes é permitido', async () => {
    const orgA = await createOrganization();
    const orgB = await createOrganization();
    const phone = proximoTelefone();
    await createLead({ organizationId: orgA.id, phone });

    await expect(createLead({ organizationId: orgB.id, phone })).resolves.toBeDefined();
  });

  it('apagar o lead apaga suas atividades e tarefas (cascade)', async () => {
    const { db } = getTestDb();
    const org = await createOrganization();
    const pessoa = await createUser();
    await createMembership({ organizationId: org.id, userId: pessoa.id });
    const lead = await createLead({ organizationId: org.id });

    await createActivity({
      organizationId: org.id,
      leadId: lead.id,
      body: 'ligou',
      createdBy: pessoa.id,
    });
    await createFollowUpTask({
      organizationId: org.id,
      leadId: lead.id,
      title: 'Retornar a ligação',
      assignedTo: pessoa.id,
      createdBy: pessoa.id,
    });

    const contar = async (): Promise<{ atividades: number; tarefas: number }> => {
      const result = await db.execute<{ atividades: string; tarefas: string }>(
        sql`select
              (select count(*) from ${activities} where lead_id = ${lead.id}) as atividades,
              (select count(*) from ${followUpTasks} where lead_id = ${lead.id}) as tarefas`,
      );
      const row = result.rows[0];
      if (row === undefined) {
        throw new Error('contagem não devolveu linha');
      }
      return { atividades: Number(row.atividades), tarefas: Number(row.tarefas) };
    };

    expect(await contar()).toEqual({ atividades: 1, tarefas: 1 });

    await db.execute(sql`delete from ${leads} where id = ${lead.id}`);

    expect(await contar()).toEqual({ atividades: 0, tarefas: 0 });
  });
});
