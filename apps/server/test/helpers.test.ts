import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createActivity,
  createFollowUpTask,
  createLead,
  createMembership,
  createOrganization,
  createUser,
} from './factories.js';
import { buildTestApp } from './helpers/app.js';
import {
  assertTestDatabaseUrl,
  ensureMigrated,
  getTestDb,
  resetDb,
  resetDbEm,
  TABELAS_TRUNCAVEIS,
} from './helpers/db.js';

/**
 * Testes dos próprios helpers de teste.
 *
 * Eles existem por dois motivos. Primeiro, as factories são consumidas por toda tarefa da
 * B3 em diante: uma factory que colide no `UNIQUE (organization_id, phone)` apareceria lá
 * como falha confusa, longe da causa. Segundo, a guarda de nome de banco — a que recusa
 * truncar um banco que não termina em `_test` — é a única coisa entre a suíte e o banco de
 * desenvolvimento, e guarda sem teste é guarda que um refator quebra em silêncio.
 */

/** URL de banco de DESENVOLVIMENTO, usada só para provar que a guarda recusa. */
const URL_DESENVOLVIMENTO = 'postgres://zap:zap@localhost:5432/zapresponse';

async function contarLeads(): Promise<number> {
  const { db } = getTestDb();
  const result = await db.execute<{ total: string }>(sql`select count(*) as total from leads`);
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('contagem não devolveu linha');
  }
  return Number(row.total);
}

beforeAll(async () => {
  await ensureMigrated();
  await resetDb();
});

describe('helpers de banco de teste', () => {
  it('resetDb limpa as tabelas sem apagar o schema', async () => {
    const org = await createOrganization();
    await createLead({ organizationId: org.id });
    expect(await contarLeads()).toBe(1);

    await resetDb();

    expect(await contarLeads()).toBe(0);
    // As tabelas continuam existindo: o TRUNCATE não derruba o schema.
    await expect(createOrganization()).resolves.toBeDefined();
  });

  it('resetDb se recusa a truncar um banco cujo nome não termina em _test', async () => {
    await expect(resetDbEm(URL_DESENVOLVIMENTO)).rejects.toThrow(/_test/);
  });

  it('a mensagem da guarda não vaza a URL de conexão', async () => {
    const erro = await resetDbEm(URL_DESENVOLVIMENTO).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);
    const mensagem = (erro as Error).message;
    expect(mensagem).toContain('zapresponse');
    // A URL inteira carrega usuário e senha; só o nome do banco pode aparecer.
    expect(mensagem).not.toContain(URL_DESENVOLVIMENTO);
    expect(mensagem).not.toContain('zap:zap');
  });

  it('getTestDb é memoizado por processo', () => {
    expect(getTestDb()).toBe(getTestDb());
  });

  // O alvo do TRUNCATE não pode depender do `search_path`: qualificado com `public.`, uma
  // conexão que resolva `leads` para outro schema continua truncando a tabela certa.
  it('as tabelas truncadas são qualificadas com o schema', () => {
    for (const tabela of TABELAS_TRUNCAVEIS) {
      expect(tabela).toMatch(/^public\.[a-z_]+$/);
    }
  });

  // Regressão do TRUNCATE qualificado: uma tabela `leads` homônima em outro schema não é
  // alcançada por resetDb(). O schema auxiliar é derrubado no final, sem resíduo.
  it('resetDb não alcança uma tabela homônima em outro schema', async () => {
    const { db } = getTestDb();
    await db.execute(sql`drop schema if exists outro_schema cascade`);
    await db.execute(sql`create schema outro_schema`);
    try {
      await db.execute(sql`create table outro_schema.leads (id int primary key)`);
      await db.execute(sql`insert into outro_schema.leads (id) values (1), (2), (3)`);

      await resetDb();

      const result = await db.execute<{ total: string }>(
        sql`select count(*) as total from outro_schema.leads`,
      );
      expect(Number(result.rows[0]?.total)).toBe(3);
    } finally {
      await db.execute(sql`drop schema if exists outro_schema cascade`);
    }
  });
});

describe('assertTestDatabaseUrl', () => {
  it('aceita um banco cujo nome termina em _test e devolve o nome', () => {
    expect(assertTestDatabaseUrl('postgres://zap:zap@localhost:5433/zapresponse_test')).toBe(
      'zapresponse_test',
    );
  });

  it('recusa URL ausente ou vazia com mensagem acionável', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL_TEST/);
    expect(() => assertTestDatabaseUrl('   ')).toThrow(/DATABASE_URL_TEST/);
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/\.env\.test/);
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/5433/);
  });

  it('recusa o que não é URL de conexão com nome de banco', () => {
    expect(() => assertTestDatabaseUrl('não-é-url')).toThrow(/_test/);
    expect(() => assertTestDatabaseUrl('postgres://zap:zap@localhost:5433/')).toThrow(/_test/);
  });

  it('recusa um banco cujo nome não termina em _test sem vazar a URL', () => {
    expect(() => assertTestDatabaseUrl(URL_DESENVOLVIMENTO)).toThrow(/_test/);
    try {
      assertTestDatabaseUrl(URL_DESENVOLVIMENTO);
      throw new Error('a guarda ACEITOU um banco de desenvolvimento');
    } catch (error) {
      const mensagem = (error as Error).message;
      expect(mensagem).toContain('zapresponse');
      expect(mensagem).not.toContain(URL_DESENVOLVIMENTO);
      expect(mensagem).not.toContain('zap:zap');
    }
  });

  // `options=-c search_path=...` reescreve o schema em que o TRUNCATE cai: validar só o
  // nome do banco deixava a query string passar intacta para o `pg`.
  it('recusa URL que traga o parâmetro options', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgres://zap:zap@localhost:5433/zapresponse_test?options=-c%20search_path%3Dfinge_prod',
      ),
    ).toThrow(/options/);
    expect(() =>
      assertTestDatabaseUrl('postgres://zap:zap@localhost:5433/zapresponse_test?OPTIONS=-c%20x'),
    ).toThrow(/options/);
  });

  it('a mensagem da recusa por options não vaza a URL', () => {
    const url = 'postgres://zap:zap@localhost:5433/zapresponse_test?options=-c%20x';
    let mensagem = 'a guarda ACEITOU uma URL com options';
    try {
      assertTestDatabaseUrl(url);
    } catch (error) {
      mensagem = (error as Error).message;
    }
    expect(mensagem).toMatch(/options/);
    expect(mensagem).not.toContain(url);
    expect(mensagem).not.toContain('zap:zap');
  });

  // Endurecimento: nomes que só existem porque o nome vinha decodificado da URL. Eles já
  // falhavam fechado (banco inexistente), mas um nome de banco só pode ser [A-Za-z0-9_].
  it('recusa nomes de banco impossíveis que terminam em _test', () => {
    const impossiveis = [
      'postgres://zap:zap@localhost:5433/zapresponse/x_test',
      'postgres://zap:zap@localhost:5433/zapresponse%20_test',
      'postgres://zap:zap@localhost:5433/..%2Fzapresponse_test',
    ];
    for (const url of impossiveis) {
      expect(() => assertTestDatabaseUrl(url)).toThrow(/_test/);
    }
  });

  it('recusa variações que não são banco de teste', () => {
    const recusadas = [
      // String de conexão libpq, não URL.
      'host=localhost port=5433 dbname=zapresponse_test',
      // URL sem nome de banco.
      'postgres://zap:zap@localhost:5433/',
      // `_test` só na query string.
      'postgres://zap:zap@localhost:5433/?dbname=zapresponse_test',
      // `_test` no meio, não no fim.
      'postgres://zap:zap@localhost:5433/prod_test_',
      // Maiúsculas: nome de banco é case-sensitive no Postgres.
      'postgres://zap:zap@localhost:5433/ZAPRESPONSE_TEST',
      // `_test` no fragmento.
      'postgres://zap:zap@localhost:5433/zapresponse#_test',
    ];
    for (const url of recusadas) {
      expect(() => assertTestDatabaseUrl(url)).toThrow(/_test/);
    }
  });

  it('usa o nome da variável informado na mensagem', () => {
    expect(() => assertTestDatabaseUrl(undefined, { variableName: 'URL_DO_RESET' })).toThrow(
      /URL_DO_RESET/,
    );
  });
});

describe('factories', () => {
  it('as factories geram telefones E.164 únicos', async () => {
    const org = await createOrganization();
    const a = await createLead({ organizationId: org.id });
    const b = await createLead({ organizationId: org.id });

    expect(a.phone).toMatch(/^\+55\d{10,11}$/);
    expect(b.phone).not.toBe(a.phone);
  });

  it('createOrganization e createUser geram slug e e-mail únicos', async () => {
    const [orgA, orgB] = await Promise.all([createOrganization(), createOrganization()]);
    expect(orgB.slug).not.toBe(orgA.slug);

    const [pessoaA, pessoaB] = await Promise.all([createUser(), createUser()]);
    expect(pessoaB.email).not.toBe(pessoaA.email);
  });

  it('os overrides vencem os valores default', async () => {
    const org = await createOrganization({ name: 'Imobiliária X', slug: 'imobiliaria-x' });
    expect(org).toMatchObject({ name: 'Imobiliária X', slug: 'imobiliaria-x' });

    const lead = await createLead({
      organizationId: org.id,
      phone: '(11) 98888-7777',
      status: 'won',
    });
    // O telefone passa por normalizePhone: a factory nunca grava forma não normalizada.
    expect(lead).toMatchObject({ phone: '+5511988887777', status: 'won' });
  });

  it('as factories das tabelas comerciais ligam lead, membership e organização', async () => {
    const org = await createOrganization();
    const pessoa = await createUser();
    const membership = await createMembership({
      organizationId: org.id,
      userId: pessoa.id,
      role: 'admin',
    });
    expect(membership.role).toBe('admin');

    const lead = await createLead({ organizationId: org.id, assignedTo: pessoa.id });
    const atividade = await createActivity({
      organizationId: org.id,
      leadId: lead.id,
      createdBy: pessoa.id,
    });
    const tarefa = await createFollowUpTask({
      organizationId: org.id,
      leadId: lead.id,
      assignedTo: pessoa.id,
    });

    expect(atividade).toMatchObject({ organizationId: org.id, leadId: lead.id });
    expect(tarefa).toMatchObject({ organizationId: org.id, leadId: lead.id });
    expect(tarefa.dueAt).toBeInstanceOf(Date);
  });
});

describe('buildTestApp', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve uma app pronta, sem log e sem estourar o rate limit', async () => {
    // Bem mais que o RATE_LIMIT_MAX default (100): se o teto alto não estivesse valendo,
    // alguma destas requisições voltaria 429.
    for (let i = 0; i < 120; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
    expect(app.log.level).toBe('silent');
  });
});
