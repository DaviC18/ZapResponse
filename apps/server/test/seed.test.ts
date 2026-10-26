import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { LEAD_STATUSES } from '@zapresponse/contracts';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { seed } from '../src/db/seed.js';
import {
  databaseNameOf,
  ensureMigrated,
  getTestDatabaseUrl,
  getTestDb,
  resetDb,
} from './helpers/db.js';

const execFileAsync = promisify(execFile);

/**
 * Testes do seed (Tarefa 10).
 *
 * As contagens são feitas em SQL cru contra o banco, não a partir do `SeedResult`: o que
 * precisa ser verdade é o estado do banco depois do seed, e conferir o retorno contra o
 * retorno não provaria nada sobre as linhas gravadas.
 */

/** `count(*)` do Postgres volta como `bigint`, que o driver entrega em texto. */
function paraNumero(valor: string | undefined, consulta: string): number {
  if (valor === undefined) {
    throw new Error(`consulta não devolveu linha: ${consulta}`);
  }
  return Number(valor);
}

async function statusesDosLeads(organizationId: string): Promise<string[]> {
  const { db } = getTestDb();
  const result = await db.execute<{ status: string }>(
    sql`select distinct status from leads where organization_id = ${organizationId}`,
  );
  return result.rows.map((row) => row.status);
}

interface FiltroTarefas {
  vencidas?: true;
  futuras?: true;
  concluidas?: true;
}

/**
 * Conta tarefas por estado DERIVADO, do mesmo jeito que a B5 vai derivar: `follow_up_tasks`
 * não tem coluna `status` (ver o cabeçalho do schema), o estado sai de `completed_at` e
 * `due_at`.
 */
async function contarTarefas(filtro: FiltroTarefas): Promise<number> {
  const { db } = getTestDb();
  const condicao =
    filtro.concluidas === true
      ? sql`completed_at is not null`
      : filtro.vencidas === true
        ? sql`completed_at is null and due_at < now()`
        : sql`completed_at is null and due_at >= now()`;
  const result = await db.execute<{ total: string }>(
    sql`select count(*) as total from follow_up_tasks where ${condicao}`,
  );
  return paraNumero(result.rows[0]?.total, 'contarTarefas');
}

/**
 * Conta linhas filhas cuja organização não é a do lead que elas apontam, e atribuições a
 * quem não é membro da organização. As FKs compostas deveriam tornar isso impossível; a
 * consulta existe para que o teste pegue o dia em que uma delas for afrouxada.
 */
async function contarLeadsCruzados(): Promise<number> {
  const { db } = getTestDb();
  const result = await db.execute<{ total: string }>(sql`
    select
      (select count(*) from activities a
         join leads l on l.id = a.lead_id
        where a.organization_id <> l.organization_id)
      + (select count(*) from follow_up_tasks t
           join leads l on l.id = t.lead_id
          where t.organization_id <> l.organization_id)
      + (select count(*) from leads l
          where l.assigned_to is not null
            and not exists (
              select 1 from memberships m
               where m.organization_id = l.organization_id
                 and m.user_id = l.assigned_to))
      as total
  `);
  return paraNumero(result.rows[0]?.total, 'contarLeadsCruzados');
}

interface Contagens {
  organizations: number;
  users: number;
  memberships: number;
  leads: number;
  activities: number;
  followUpTasks: number;
}

async function contarTodasAsTabelas(): Promise<Contagens> {
  const { db } = getTestDb();
  const result = await db.execute<Record<keyof Contagens, string>>(sql`
    select
      (select count(*) from organizations) as organizations,
      (select count(*) from users) as users,
      (select count(*) from memberships) as memberships,
      (select count(*) from leads) as leads,
      (select count(*) from activities) as activities,
      (select count(*) from follow_up_tasks) as "followUpTasks"
  `);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('consulta não devolveu linha: contarTodasAsTabelas');
  }
  return {
    organizations: Number(row.organizations),
    users: Number(row.users),
    memberships: Number(row.memberships),
    leads: Number(row.leads),
    activities: Number(row.activities),
    followUpTasks: Number(row.followUpTasks),
  };
}

describe('seed', () => {
  // `ensureMigrated` antes de qualquer `resetDb`: sem as tabelas, o TRUNCATE falha por
  // tabela inexistente e esconde a causa real.
  beforeAll(async () => {
    await ensureMigrated();
  });

  it('cria 2 organizações isoladas, com leads em todos os estágios e tarefas vencidas e futuras', async () => {
    await resetDb();
    const result = await seed(getTestDb().db);

    expect(result.organizations).toHaveLength(2);

    for (const org of result.organizations) {
      const statuses = await statusesDosLeads(org.id);
      expect(new Set(statuses)).toEqual(new Set(LEAD_STATUSES));
    }

    const vencidas = await contarTarefas({ vencidas: true });
    const futuras = await contarTarefas({ futuras: true });
    const concluidas = await contarTarefas({ concluidas: true });
    expect(vencidas).toBeGreaterThan(0);
    expect(futuras).toBeGreaterThan(0);
    expect(concluidas).toBeGreaterThan(0);

    expect(await contarLeadsCruzados()).toBe(0);
  });

  it('é idempotente: rodar duas vezes deixa exatamente as mesmas contagens', async () => {
    await resetDb();
    await seed(getTestDb().db);
    const depoisDaPrimeira = await contarTodasAsTabelas();
    await seed(getTestDb().db);
    expect(await contarTodasAsTabelas()).toEqual(depoisDaPrimeira);
  });

  it('devolve os ids criados: 2 usuários por organização e leads de todas elas', async () => {
    await resetDb();
    const result = await seed(getTestDb().db);

    expect(result.users).toHaveLength(result.organizations.length * 2);
    expect(new Set(result.leads.map((lead) => lead.organizationId))).toEqual(
      new Set(result.organizations.map((org) => org.id)),
    );
    // Os ids devolvidos são os que estão no banco, não objetos soltos em memória.
    const { db } = getTestDb();
    const leadsNoBanco = await db.execute<{ total: string }>(
      sql`select count(*) as total from leads`,
    );
    expect(Number(leadsNoBanco.rows[0]?.total)).toBe(result.leads.length);
  });

  // O aviso do banco alvo pertence ao script (`main`), não a `seed()`: os testes chamam a
  // função direto e não devem virar barulho em stdout.
  it('seed() não escreve nada em stdout', async () => {
    await resetDb();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await seed(getTestDb().db);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  // O script `db:seed` TRUNCA o banco apontado por DATABASE_URL, e a guarda de `_test` só
  // vale em NODE_ENV=test: quem roda precisa ver em stdout qual banco vai ser apagado. Só
  // o nome, nunca a URL, que carrega usuário e senha.
  it('o script db:seed anuncia o banco alvo antes de truncar', async () => {
    const databaseUrl = getTestDatabaseUrl();
    const seedScript = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../src/db/seed.ts',
    );

    const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', seedScript], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    const nomeDoBanco = databaseNameOf(databaseUrl);
    expect(stdout).toContain(`seed: truncando o banco "${String(nomeDoBanco)}"`);
    expect(stdout).not.toContain(databaseUrl);
  }, 60000);

  it('grava telefones normalizados em E.164', async () => {
    await resetDb();
    const result = await seed(getTestDb().db);

    for (const lead of result.leads) {
      expect(lead.phone).toMatch(/^\+\d{8,15}$/);
    }
  });
});
