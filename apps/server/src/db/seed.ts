import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ActivityType, LeadStatus, MembershipRole } from '@zapresponse/contracts';
import { sql } from 'drizzle-orm';

import { normalizePhone } from '../shared/phone.js';
import { createDb, type Db } from './client.js';
import {
  activities,
  followUpTasks,
  leads,
  memberships,
  organizations,
  users,
} from './schema/index.js';

/**
 * Seed de desenvolvimento: duas organizações completas e isoladas.
 *
 * Os dados são escritos à mão (nenhuma biblioteca de dados falsos): o objetivo não é
 * volume, é um cenário CONTROLADO — todos os seis `LEAD_STATUSES` presentes em cada
 * organização, e tarefas vencida/futura/concluída em cada uma — para que os testes do
 * dashboard (B7) possam conferir números contra uma expectativa fixa.
 *
 * **Idempotência por TRUNCATE, não por `onConflictDoNothing`.** `db:seed` é rodado à mão
 * várias vezes durante o desenvolvimento, e `UNIQUE (organization_id, phone)` faria a
 * segunda execução estourar. `onConflictDoNothing` não resolveria: `id` é
 * `defaultRandom()`, então a segunda execução gera ids novos; as organizações e os leads
 * seriam descartados pelo unique, mas as atividades e as tarefas filhas seriam INSERIDAS
 * DE NOVO apontando para os leads antigos — duplicação silenciosa, sem nenhum erro. Por
 * isso o seed apaga as seis tabelas e reinsere tudo, em uma única transação: ou o banco
 * fica com o cenário inteiro, ou fica como estava.
 */

/** Tabelas apagadas antes de inserir, em uma única instrução — mesma lista do `resetDb`. */
const TABELAS_TRUNCAVEIS = [
  'activities',
  'follow_up_tasks',
  'leads',
  'memberships',
  'users',
  'organizations',
] as const;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;

export interface SeedResult {
  organizations: OrganizationRow[];
  users: UserRow[];
  leads: LeadRow[];
}

/** Papel na organização de quem recebe o lead/tarefa; `null` = sem responsável. */
type Responsavel = 'owner' | 'member' | null;

interface LeadDef {
  name: string;
  /** Forma "humana"; passa por `normalizePhone` antes de ir ao banco. */
  phone: string;
  status: LeadStatus;
  source: string;
  email?: string;
  assignedTo: Responsavel;
  notes?: string;
  /** Atividades do histórico deste lead. */
  atividades: { type: ActivityType; body?: string; payload?: unknown; autor: Responsavel }[];
  /** Tarefas de follow-up deste lead. */
  tarefas: {
    title: string;
    /** Dias a partir de agora; negativo = vencida. */
    venceEmDias: number;
    concluida?: true;
    assignedTo: Responsavel;
  }[];
}

interface PessoaDef {
  email: string;
  name: string;
  role: MembershipRole;
}

interface OrganizacaoDef {
  name: string;
  slug: string;
  owner: PessoaDef;
  member: PessoaDef;
  leads: LeadDef[];
}

const ORGANIZACOES: OrganizacaoDef[] = [
  {
    name: 'Clínica Sorriso',
    slug: 'clinica-sorriso',
    owner: { email: 'ana@clinicasorriso.test', name: 'Ana Prado', role: 'owner' },
    member: { email: 'bruno@clinicasorriso.test', name: 'Bruno Lima', role: 'member' },
    leads: [
      {
        name: 'Carla Menezes',
        phone: '(11) 99812-3401',
        status: 'new',
        source: 'instagram',
        assignedTo: null,
        atividades: [{ type: 'system', body: 'Lead criado pelo formulário do site', autor: null }],
        tarefas: [{ title: 'Primeiro contato por WhatsApp', venceEmDias: -2, assignedTo: 'owner' }],
      },
      {
        name: 'Diego Fontes',
        phone: '11 99812-3402',
        status: 'in_progress',
        source: 'indicação',
        email: 'diego@exemplo.test',
        assignedTo: 'owner',
        notes: 'Quer clareamento; perguntou sobre parcelamento.',
        atividades: [
          { type: 'note', body: 'Ligou pedindo orçamento de clareamento.', autor: 'owner' },
          {
            type: 'status_change',
            payload: { from: 'new', to: 'in_progress' },
            autor: 'owner',
          },
        ],
        tarefas: [{ title: 'Enviar orçamento', venceEmDias: 2, assignedTo: 'owner' }],
      },
      {
        name: 'Elisa Rocha',
        phone: '+55 11 99812-3403',
        status: 'waiting',
        source: 'google',
        assignedTo: 'member',
        atividades: [
          { type: 'contact_attempt', body: 'Ligação não atendida.', autor: 'member' },
          {
            type: 'status_change',
            payload: { from: 'in_progress', to: 'waiting' },
            autor: 'member',
          },
        ],
        tarefas: [
          {
            title: 'Retomar contato após o orçamento',
            venceEmDias: -10,
            concluida: true,
            assignedTo: 'member',
          },
        ],
      },
      {
        name: 'Fábio Teles',
        phone: '11998123404',
        status: 'scheduled',
        source: 'indicação',
        assignedTo: 'member',
        atividades: [
          { type: 'note', body: 'Avaliação marcada para a próxima semana.', autor: 'member' },
        ],
        tarefas: [
          { title: 'Confirmar consulta um dia antes', venceEmDias: 5, assignedTo: 'member' },
        ],
      },
      {
        name: 'Giovana Paz',
        phone: '(11) 3321-4405',
        status: 'won',
        source: 'instagram',
        assignedTo: 'owner',
        atividades: [
          { type: 'status_change', payload: { from: 'scheduled', to: 'won' }, autor: 'owner' },
          { type: 'follow_up_completed', body: 'Tratamento fechado.', autor: 'owner' },
        ],
        tarefas: [],
      },
      {
        name: 'Hugo Barros',
        phone: '11 99812-3406',
        status: 'lost',
        source: 'google',
        assignedTo: null,
        notes: 'Achou o valor alto.',
        atividades: [
          { type: 'status_change', payload: { from: 'waiting', to: 'lost' }, autor: null },
        ],
        tarefas: [],
      },
    ],
  },
  {
    name: 'Auto Center Veloz',
    slug: 'auto-center-veloz',
    owner: { email: 'rafael@autoveloz.test', name: 'Rafael Dias', role: 'owner' },
    member: { email: 'sofia@autoveloz.test', name: 'Sofia Nunes', role: 'member' },
    leads: [
      {
        name: 'Ivo Cardoso',
        phone: '(21) 99744-1101',
        status: 'new',
        source: 'whatsapp',
        assignedTo: null,
        atividades: [{ type: 'system', body: 'Mensagem recebida no WhatsApp.', autor: null }],
        tarefas: [
          { title: 'Responder a primeira mensagem', venceEmDias: -1, assignedTo: 'member' },
        ],
      },
      {
        name: 'Joana Freitas',
        phone: '21 99744-1102',
        status: 'in_progress',
        source: 'google',
        email: 'joana@exemplo.test',
        assignedTo: 'member',
        atividades: [
          { type: 'note', body: 'Revisão de 40 mil km; pediu prazo.', autor: 'member' },
          { type: 'status_change', payload: { from: 'new', to: 'in_progress' }, autor: 'member' },
        ],
        tarefas: [{ title: 'Enviar prazo de entrega', venceEmDias: 1, assignedTo: 'member' }],
      },
      {
        name: 'Kleber Souza',
        phone: '+55 21 99744-1103',
        status: 'waiting',
        source: 'indicação',
        assignedTo: 'owner',
        atividades: [
          { type: 'contact_attempt', body: 'Sem resposta no WhatsApp.', autor: 'owner' },
        ],
        tarefas: [
          {
            title: 'Cobrar retorno sobre o orçamento',
            venceEmDias: -6,
            concluida: true,
            assignedTo: 'owner',
          },
        ],
      },
      {
        name: 'Lívia Matos',
        phone: '21997441104',
        status: 'scheduled',
        source: 'whatsapp',
        assignedTo: 'owner',
        atividades: [{ type: 'note', body: 'Agendou troca de óleo para sexta.', autor: 'owner' }],
        tarefas: [{ title: 'Separar peças antes do serviço', venceEmDias: 3, assignedTo: 'owner' }],
      },
      {
        name: 'Marcos Vilela',
        phone: '(21) 2544-1105',
        status: 'won',
        source: 'indicação',
        assignedTo: 'member',
        atividades: [
          { type: 'status_change', payload: { from: 'scheduled', to: 'won' }, autor: 'member' },
        ],
        tarefas: [],
      },
      {
        name: 'Nair Bastos',
        phone: '21 99744-1106',
        status: 'lost',
        source: 'google',
        assignedTo: null,
        notes: 'Fechou com a oficina do bairro.',
        atividades: [{ type: 'note', body: 'Preferiu a oficina mais perto de casa.', autor: null }],
        tarefas: [],
      },
    ],
  },
];

/**
 * Recusa-se a truncar um banco cujo nome não termine em `_test` **quando
 * `NODE_ENV=test`**.
 *
 * É a mesma regra do `resetDb`, verificada aqui com `current_database()` em vez do nome
 * extraído da URL: `seed` recebe um `Db` já conectado e não tem acesso à URL — e perguntar
 * ao próprio banco é mais honesto que confiar na string de conexão.
 *
 * A guarda vale só em teste de propósito: `npm run db:seed` apontado para o banco de
 * desenvolvimento DEVE apagar os dados de desenvolvimento, que é o trabalho de um seed.
 *
 * A mensagem de erro traz só o nome do banco, nunca a URL: ela carrega usuário e senha.
 */
async function assertAlvoPermitido(tx: Pick<Db, 'execute'>): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  const result = await tx.execute<{ name: string }>(sql`select current_database() as name`);
  const name = result.rows[0]?.name;

  if (name === undefined) {
    throw new Error('não foi possível determinar o banco alvo do seed');
  }

  if (!name.endsWith('_test')) {
    throw new Error(
      `NODE_ENV=test e o seed aponta para o banco "${name}", cujo nome não termina em ` +
        '"_test". O seed apaga as tabelas antes de inserir; recuse-se a rodar fora de um ' +
        'banco de teste.',
    );
  }
}

/** Desembrulha o `returning()` do Drizzle procurando a linha por uma chave de negócio. */
function exigir<T>(rows: T[], predicado: (row: T) => boolean, oQue: string): T {
  const row = rows.find(predicado);
  if (row === undefined) {
    throw new Error(`INSERT não devolveu a linha esperada: ${oQue}`);
  }
  return row;
}

/**
 * Apaga as seis tabelas e insere o cenário completo, em uma única transação.
 *
 * Recebe o `Db` por argumento — não lê `process.env` — para que o teste aponte o seed ao
 * banco de teste sem depender de qual `.env` foi carregado, exatamente como `runMigrations`.
 */
export async function seed(db: Db): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await assertAlvoPermitido(tx);

    // Uma instrução só: não depende da ordem das FKs, e `TRUNCATE` não derruba o schema.
    await tx.execute(sql.raw(`truncate ${TABELAS_TRUNCAVEIS.join(', ')} restart identity cascade`));

    const agora = Date.now();

    const orgRows = await tx
      .insert(organizations)
      .values(ORGANIZACOES.map((org) => ({ name: org.name, slug: org.slug })))
      .returning();

    const userRows = await tx
      .insert(users)
      .values(
        ORGANIZACOES.flatMap((org) => [org.owner, org.member]).map((pessoa) => ({
          email: pessoa.email,
          name: pessoa.name,
        })),
      )
      .returning();

    const todosOsLeads: LeadRow[] = [];

    for (const orgDef of ORGANIZACOES) {
      const org = exigir(orgRows, (row) => row.slug === orgDef.slug, `organização ${orgDef.slug}`);
      const owner = exigir(userRows, (row) => row.email === orgDef.owner.email, orgDef.owner.email);
      const member = exigir(
        userRows,
        (row) => row.email === orgDef.member.email,
        orgDef.member.email,
      );

      // Memberships antes dos leads: as FKs compostas `(organization_id, assigned_to)`
      // apontam para `memberships`, então atribuir um lead exige a membership já gravada.
      await tx.insert(memberships).values([
        { organizationId: org.id, userId: owner.id, role: orgDef.owner.role },
        { organizationId: org.id, userId: member.id, role: orgDef.member.role },
      ]);

      const userIdDe = (responsavel: Responsavel): string | null =>
        responsavel === 'owner' ? owner.id : responsavel === 'member' ? member.id : null;

      const leadRows = await tx
        .insert(leads)
        .values(
          orgDef.leads.map((leadDef) => ({
            organizationId: org.id,
            name: leadDef.name,
            // Todo telefone passa por `normalizePhone`: as formas "humanas" acima existem
            // para provar que o seed grava a mesma E.164 que a aplicação gravaria.
            phone: normalizePhone(leadDef.phone),
            email: leadDef.email ?? null,
            source: leadDef.source,
            status: leadDef.status,
            assignedTo: userIdDe(leadDef.assignedTo),
            notes: leadDef.notes ?? null,
          })),
        )
        .returning();

      todosOsLeads.push(...leadRows);

      for (const leadDef of orgDef.leads) {
        const phone = normalizePhone(leadDef.phone);
        const lead = exigir(leadRows, (row) => row.phone === phone, `lead ${leadDef.name}`);

        if (leadDef.atividades.length > 0) {
          await tx.insert(activities).values(
            leadDef.atividades.map((atividade) => ({
              organizationId: org.id,
              leadId: lead.id,
              type: atividade.type,
              body: atividade.body ?? null,
              payload: atividade.payload ?? null,
              createdBy: userIdDe(atividade.autor),
            })),
          );
        }

        if (leadDef.tarefas.length > 0) {
          await tx.insert(followUpTasks).values(
            leadDef.tarefas.map((tarefa) => {
              const responsavel = userIdDe(tarefa.assignedTo);
              return {
                organizationId: org.id,
                leadId: lead.id,
                title: tarefa.title,
                dueAt: new Date(agora + tarefa.venceEmDias * UM_DIA_MS),
                // `completedAt`/`completedBy` andam juntos: tarefa concluída sem quem
                // concluiu deixaria a B5 sem como mostrar o autor.
                completedAt: tarefa.concluida === true ? new Date(agora - UM_DIA_MS) : null,
                completedBy: tarefa.concluida === true ? responsavel : null,
                assignedTo: responsavel,
                createdBy: owner.id,
              };
            }),
          );
        }
      }
    }

    return { organizations: orgRows, users: userRows, leads: todosOsLeads };
  });
}

/**
 * Entrada do script `db:seed`. A URL vem **só** do ambiente, sem fallback e sem carregar
 * `.env` por conta própria — mesma forma do `db:migrate`: o seed APAGA tabelas, e um
 * fallback silencioso transformaria "esqueci de exportar a variável" em "zerei o banco
 * errado". Quem chama escolhe o banco.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error(
      'DATABASE_URL ausente. Passe explicitamente o banco alvo, ex.: ' +
        'DATABASE_URL=postgres://usuario:senha@localhost:5433/zapresponse_test ' +
        'npm run db:seed',
    );
  }

  const { db, pool } = createDb(databaseUrl, { max: 1 });
  try {
    // Aviso do alvo ANTES de truncar: `seed()` apaga as seis tabelas, e a guarda de `_test`
    // só vale em NODE_ENV=test — apagar o banco de desenvolvimento é o trabalho do seed.
    // Quem roda o script precisa ver qual banco é. O nome vem do próprio banco
    // (`current_database()`), e nunca a URL: ela carrega usuário e senha.
    //
    // Fica aqui, no script, e não em `seed()`: os testes chamam a função direto e não devem
    // virar barulho em stdout.
    const alvo = await db.execute<{ name: string }>(sql`select current_database() as name`);
    const nomeDoBanco = alvo.rows[0]?.name;
    if (nomeDoBanco === undefined) {
      throw new Error('não foi possível determinar o banco alvo do seed');
    }
    console.log(`seed: truncando o banco "${nomeDoBanco}"`);

    const result = await seed(db);
    console.log(
      `seed aplicado: ${String(result.organizations.length)} organizações, ` +
        `${String(result.users.length)} usuários, ${String(result.leads.length)} leads`,
    );
  } finally {
    await pool.end();
  }
}

// Só roda quando este arquivo é o ponto de entrada do processo; importado (pelo teste, por
// exemplo) não executa nada.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // A mensagem vai para stderr sem a URL de conexão: ela carrega usuário e senha.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
