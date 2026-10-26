# Progresso — ZapResponse

Fonte da verdade do estado entre sessões. Atualizado pelo orchestrator ao fim de
cada tarefa.

Legenda: ⬜ não iniciado · 🟡 em andamento · ✅ pronto e verificado · ⛔ bloqueado

## Visão geral

| Fase | Status | Nota |
|---|---|---|
| Fase 0 — Setup do Claude Code | ✅ | hook de git pendente do usuário |
| B0 — Esqueleto do monorepo | ✅ | Tarefas 1–3 |
| B1 — Núcleo do server | ✅ | Tarefas 4a, 4b, 5 — revisadas; onda de correção do Ruling 32 aplicada |
| B2 — Banco e schema | ✅ | Tarefas 6–10; revisão de segurança e onda de correção aplicadas |
| CHECKPOINT 1 | 🟡 | **parada obrigatória — aguardando o usuário** |
| B3–B5 | ⬜ | sessão 2 |
| B6–B9 | ⬜ | sessão 3 |
| Fase F | ⬜ | só depois do Checkpoint 3 |

## CHECKPOINT 1 — 2026-10-26 — aguardando o usuário

**Entregue:** Fase 0 (setup, menos o hook de git), B0 (monorepo, lint, infra
local, contrato de env), B1 (`buildApp`, logger, formato único de erro, helmet,
CORS, rate limit, cliente de banco, `GET /health`, bootstrap com sinais) e B2
(telefone E.164, 3 enums, 6 tabelas, 5 FKs compostas, índices, migration
provisória, helpers de teste, factories, seed). Mais duas ondas de correção
(Ruling 32 e Ruling 40) e uma revisão de segurança do bloco.

**Verificação:** `check` ✅ · `lint` ✅ · `test` ✅ 11 arquivos / 80 testes ·
`build` ✅. Critério da B2 provado do zero: `drop schema` no Postgres de teste,
`db:migrate` e `db:seed` com exit 0, contagens relidas no psql.

**Perguntas e pendências que são do usuário:** ver a seção
"Pendências que dependem do usuário" e os Rulings 20, 41 e o item do
`BETTER_AUTH_SECRET` na Tarefa 3.

## Sessão 1 — 2026-10-26 (Fase 0 + B0–B2)

### Fase 0 — Setup do Claude Code — 🟡

| Entrega | Status | Arquivos |
|---|---|---|
| `CLAUDE.md` (Apêndice A) | ✅ | `CLAUDE.md` |
| `.claude/agents/*` (Apêndice B) | ✅ | `architect.md`, `db-engineer.md`, `backend-implementer.md`, `security-reviewer.md`, `test-verifier.md`, `frontend-implementer.md` |
| `docs/progress.md` | ✅ | este arquivo |
| `docs/decisions.md` | ✅ | versões verificadas no npm em 2026-10-26 |
| `docs/backlog.md` | ✅ | |
| `.claude/settings.json` com hook de git | ⛔ pendente do usuário | ver abaixo |

Verificação: nenhum comando git executado.

### Pendências que dependem do usuário

1. **Hook de bloqueio de git (Apêndice C).** `.claude/hooks/block-git.sh` ainda não
   existe. Conforme spec Fase 0, `.claude/settings.json` **não** foi criado — ele só
   deve ser criado depois que o script existir, senão o hook aponta para um arquivo
   inexistente. `jq 1.8.1` já está instalado, então o script funcionará assim que for
   adicionado. A regra 0.1 vale mesmo sem o hook e está sendo seguida.
2. **O diretório não é um repositório git.** `git init` consta na lista de comandos
   proibidos da regra 0.1, então não foi executado. Consequência: o CHECKPOINT 1 não
   pode trazer saída de `git status`, e não há como commitar ainda. Rode
   `git init` você mesmo quando quiser versionar. Um `.gitignore` já foi preparado
   na B0.

## Ledger SDD — plano: `docs/plans/b0-b2.md`

Este arquivo **é** o ledger da skill `subagent-driven-development`. Override do
spec §0.2: a skill grava o ledger em `.superpowers/sdd/<plano>/progress.md` e
assume commits por tarefa; aqui o registro é este arquivo e não há commit.

Adaptações obrigatórias da skill neste projeto:

- **Sem worktree** (spec §0.2): trabalho direto na árvore atual.
- **Sem commit por tarefa**: cada tarefa termina com uma linha neste ledger.
- **Sem `review-package` por diff git**: o diretório ainda não é um repositório
  git, então não existe BASE/HEAD. Os revisores recebem a **lista de caminhos de
  arquivo** da tarefa e leem os arquivos; não existe diff para empacotar.

### Pré-voo — varredura de conflitos do plano (antes da Tarefa 1)

Uma linha por par de tarefas que compartilha arquivo ou interface, e uma linha
por tarefa sobre coerência interna.

| Par / tarefa | Produz → consome | Achado |
|---|---|---|
| T1 → T2 | scripts `lint`/`test` → `eslint.config.mjs`, `vitest.config.ts` | OK: a T1 só verifica com `npm run check`, não com `lint`/`test` |
| T1 → T2 | `dotenv` (dep de `apps/server`) → `test/setup-env.ts` (raiz) | **Conflito.** Ver Ruling 1 |
| T1 → T2 | `packages/contracts/dist` → `test/sanity.test.ts` importa `@zapresponse/contracts` | **Conflito.** Ver Ruling 2 |
| T2 → T3 | `test/setup-env.ts` lê `.env.test` → `.env.test` criado na T3 | OK: o setup trata ausência ("se existir") |
| T3 → T4 | `loadEnv` faz `process.exit(1)` → `buildApp()` nos testes | **Conflito.** Ver Ruling 3 |
| T4 → T5 | `buildApp` → T5 modifica `app.ts` para registrar db e health | OK, dependência na ordem certa |
| T4 → T5 | teste do banco inacessível usa `envDeTeste`, que o plano não define | **Lacuna.** Ver Ruling 4 |
| T2 → T7 | `CONTRACTS_VERSION` asserido no `sanity.test.ts` → T7 reescreve `contracts/src/index.ts` | **Conflito.** Ver Ruling 5 |
| T6 → T9, T10 | `normalizePhone` → factories e seed | OK |
| T7 → T8 | `schema` → `drizzle.config.ts` e migration | OK |
| T8 → T9 | `runMigrations` → `ensureMigrated()` | OK |
| T9 → T10 | `resetDb`, `getTestDb` → testes de seed | OK |
| T5 (B1) vs T7 (B2) | plugin de db e `/health` existem antes do schema | OK por desenho: `/health` só roda `select 1`, não toca tabela |
| T9 + T10 vs T4/T5 | `resetDb()` trunca tabelas enquanto outro arquivo de teste roda | OK: `fileParallelism: false` na T2 é exatamente o que fecha isso |
| Coerência T1 | `check` e `build` rodam o mesmo `tsc -b` | Intencional e documentado; os dois nomes existem porque o `test-verifier` roda os dois |
| Coerência T4 | rotas `/__test/*` só com `NODE_ENV=test` | OK: `setup-env.ts` define `NODE_ENV=test` |
| Coerência T7 | FK composta `(organizationId, assignedTo)` com `assignedTo` nullable | OK: `MATCH SIMPLE` do Postgres deixa passar nulo e exige o par quando preenchido |
| Coerência T10 | `seed` idempotente vs `UNIQUE (organization_id, phone)` | OK: a própria tarefa exige idempotência |

**Ruling 1:** `dotenv` entra também em `devDependencies` da raiz, na Tarefa 2.
Motivo: `test/setup-env.ts` vive na raiz, e depender do hoisting do npm para
resolver uma dependência não declarada é frágil. Custo se errado: nenhum — uma
devDependency a mais.

**Ruling 2:** a raiz ganha `"pretest": "tsc -b packages/contracts"`; o script
`test` continua sendo `vitest run`. Motivo: o `sanity.test.ts` importa o `dist`
de `@zapresponse/contracts`, que só existe depois de `tsc -b`; o npm roda
`pretest` automaticamente, então `npm run test` — o comando exato que o
`test-verifier` executa — continua funcionando sozinho. Custo se errado: `npm
run test` fica alguns segundos mais lento.

**Ruling 3:** `buildApp` usa `opts.env ?? parseEnv(process.env)`, que **lança**.
`loadEnv` (que imprime e chama `process.exit(1)`) fica restrito a `server.ts` e
aos scripts de banco. Motivo: um `process.exit` dentro de `buildApp` mataria o
worker do Vitest e transformaria um env inválido numa falha ilegível. Custo se
errado: nenhum — o comportamento de produção (sair com mensagem clara) continua,
só muda quem chama.

**Ruling 4:** o teste do banco inacessível (T5) monta o env com
`parseEnv({ ...process.env, DATABASE_URL: 'postgres://zap:senha-secreta@127.0.0.1:1/nada' })`
em vez do `envDeTeste` não definido no plano. Motivo: fecha a lacuna sem
introduzir um helper novo. Custo se errado: nenhum.

**Ruling 5:** a Tarefa 7 **mantém** o export `CONTRACTS_VERSION` ao adicionar os
enums em `packages/contracts/src/index.ts`. Motivo: o `sanity.test.ts` da Tarefa
2 asserta esse valor; removê-lo quebraria um teste de outra tarefa. Custo se
errado: um export a mais, sem uso.

**Ruling 6:** os revisores de tarefa recebem a lista de caminhos dos arquivos da
tarefa e leem os arquivos, em vez de um pacote de diff. Motivo: não há
repositório git, logo não há BASE/HEAD nem diff (spec §0.1 proíbe `git init`).
Custo se errado: a revisão vê o arquivo inteiro em vez de só o trecho alterado —
mais contexto para o revisor, nenhuma perda de cobertura.

### Revisão `architect` do plano — 2026-10-26

O agente `architect` revisou `docs/plans/b0-b2.md` contra o spec: 3 críticos, 11
importantes, 7 sugestões. Rulings abaixo; o plano já foi corrigido.

**Ruling 7 (crítico 1 — alinhamento Better Auth antes da primeira migration).**
Aceito em parte. O `spec.md:202` condiciona o alinhamento a "se Better Auth for
adotado (B3)", e a adoção é entrega explícita da B3 (`spec.md:44` e B3). Logo
nenhuma migration da B2 pode ser definitiva. A Tarefa 8 passou a declarar a
migration como **provisória** e a exigir o registro disso em `decisions.md`.
Custo se errado: regenerar a migration na B3 — barato, o banco de teste é
recriado do zero.

**Ruling 8 (crítico 2 — `resetDb()` podia truncar o banco de desenvolvimento).**
Aceito integralmente. Era o defeito mais perigoso do plano. Duas trancas:
`test/setup-env.ts` (Tarefa 2) falha com mensagem acionável se
`DATABASE_URL_TEST` estiver ausente, em vez de cair no `DATABASE_URL` de
desenvolvimento; e `resetDb()` (Tarefa 9) aborta se o nome do banco não terminar
em `_test`. Nenhuma das mensagens imprime a URL inteira, que traz senha.
Entrou nas Global Constraints e como item 6 do Review Focus.

**Ruling 9 (crítico 3 — `tsconfig.build.json` conflitante).** Aceito: o arquivo
foi eliminado. Um config por workspace, `outDir: dist`, emissão em
`dist/src/server.js`, que é o que `main` e `start` apontam. `dist` passa a
conter `dist/test/`; inofensivo, o pacote é `private`. Custo se errado: os
testes compilados vão para o `dist` — nenhum impacto, nada é publicado.

**Ruling 10 (importante 4).** Aceito: `db:generate`, `db:migrate` e `db:seed`
passaram a compilar `contracts` antes, como o `dev:server`.

**Ruling 11 (importante 5 — `createdBy`/`completedBy` vazavam identidade entre
organizações).** Aceito integralmente. `activities.createdBy`,
`follow_up_tasks.createdBy` e `follow_up_tasks.completedBy` passam a ser FK
composta `(organizationId, coluna)` contra `memberships`, como o `assignedTo`.
Virou item 7 do Review Focus.

**Ruling 12 (importante 6 — FK composta impede apagar usuário com leads
atribuídos).** As cinco FKs compostas ficam em `NO ACTION`, e a v1 **não** apaga
`users` nem `memberships`: desligar um membro é mudar o estado da membership.
Motivo: `ON DELETE SET NULL` multicoluna anularia `organization_id`, que é
`NOT NULL`, e a sintaxe `SET NULL (coluna)` do PG 15+ não é exposta pelo drizzle
0.45.4. Entrou nas Global Constraints; "exclusão real de usuário" foi para
`backlog.md`. Custo se errado: um `DELETE` de usuário falha com erro de FK em
vez de desatribuir — falha alta, não corrupção silenciosa.

**Ruling 13 (importante 7 — drift do índice parcial).** Resolvido por
verificação direta: `.where(condition: SQL)` existe no builder de `index()` em
`node_modules/drizzle-orm/pg-core/indexes.d.ts:67` na versão 0.45.4 instalada. O
fallback de SQL cru foi removido do plano.

**Ruling 14 (importante 8 — idempotência do seed).** Aceito: o plano agora
prescreve **um** caminho — o seed trunca as seis tabelas e insere numa
transação — e o teste conta linhas antes e depois em vez de só asserir
`resolves`. `onConflictDoNothing` com `id` `defaultRandom()` duplicaria as
filhas silenciosamente.

**Ruling 15 (importante 9 — item 4 do Review Focus sem teste).** Aceito: o teste
de 429 entrou na Tarefa 4b.

**Ruling 16 (importante 10 — rate limit de 100/min causaria flakiness).**
Aceito, com uma mudança de mecanismo: o limite é parâmetro de `buildApp`
(`rateLimitMax`), **não** variável de ambiente. Motivo: o spec B0 fixa as 8
chaves de `.env.example` e uma nona seria desvio de escopo. `buildTestApp()`
sobe com `10_000`; o teste dedicado passa `2`.

**Ruling 17 (importante 11 — pools `pg` nunca fechados).** Aceito: pool de teste
com `max: 2` e `closeTestDb()` chamado em teardown.

**Ruling 18 (importante 12 — `createDb` sem o genérico).** Aceito: a Tarefa 5
cria `apps/server/src/db/schema/index.ts` com `export const schema = {} as
const;` e já tipa `createDb` como `NodePgDatabase<typeof schema>`; a 7a/7b
preenchem o objeto. Evita reescrever `client.ts` e `plugins/db.ts` na B4.

**Ruling 19 (importante 13 — tarefas grandes demais).** Aceito em parte.
Dividi as duas maiores: Tarefa 4 → **4a** (errors, logger, error-handler,
`buildApp` + 4 testes) e **4b** (helmet, CORS, rate limit + 3 testes); Tarefa 7
→ **7a** (enums + organizations/users/memberships) e **7b** (leads, activities,
follow_up_tasks + constraints + índices). **Não** dividi T2, T3, T8 e T9: os
passos são mecânicos e sequenciais, com uma verificação única no fim, e o spec
§5 exige economia de tokens — cada divisão custa um despacho e uma revisão a
mais. Também recusei a divisão de T4 proposta pelo `architect` (errors+handler
separados de logger+security): o handler de erro não é testável sem o
`buildApp`, então a primeira metade não teria entrega verificável. Total: 12
tarefas. Custo se errado: uma tarefa longa demais pode precisar de mais rodadas
de correção.

**Ruling 20 (importante 14 — campos das tabelas não verificáveis).** Não há como
corrigir: o documento do produto (PDF v1.0) não está no repositório, só o
`spec.md`. Entrou nas Global Constraints como "a única fonte de requisito
disponível é o spec.md" e **vai ao usuário como pergunta no CHECKPOINT 1**.

**Sugestões:** 15 aceita (`build` passou a ser `tsc -b --force`, senão rodando
depois do `check` ele não verificaria nada); 16 anotada no plano (editar um
contrato durante `dev:server --watch` não recompila); 17 para `backlog.md`
(`fileParallelism: false` deixa a suíte serial; alternativa é um schema
Postgres por arquivo); 18 aceita (`BAD_REQUEST` e `DB_UNAVAILABLE` entraram em
`ERROR_CODES`); 19 aceita (`activities` sem `updatedAt`, registrado em
`decisions.md`); 20 aceita (índice `activities (organization_id, lead_id,
created_at desc)`); 21 para `backlog.md` (recadastro de lead `lost`).

**Ruling 21 (Docker: contexto ativo aponta para um daemon que não existe).**
O contexto ativo do Docker nesta máquina é `desktop-linux`, cujo socket
(`~/.docker/desktop/docker.sock`) não existe — o Docker Desktop não está
rodando. O daemon do sistema está `active` em `/var/run/docker.sock` (contexto
`default`) e o usuário está no grupo `docker`. Decisão: usar
`docker --context default …` em todos os comandos do projeto e documentar isso,
em vez de rodar `docker context use default`, que mudaria a configuração do
usuário fora deste projeto. Imagem `postgres:18-alpine` já baixada. Custo se
errado: nenhum — basta remover o flag se o usuário preferir ligar o Docker
Desktop. **Vai ao CHECKPOINT 1 como observação.**

### Tarefas

**Ruling 22 (Prettier reclamando de 12 arquivos Markdown pré-existentes).**
`prettier --check` acusa `CLAUDE.md`, `spec.md`, `docs/*` e `.claude/agents/*`.
Decisão: acrescentar `*.md` ao `.prettierignore`. Motivo: `spec.md` é o
documento-fonte do usuário e reformatá-lo seria alterar material dele sem pedido;
os outros são prosa, onde a formatação automática não agrega. O portão de
qualidade do projeto é `npm run lint` (spec §1), que não passa por esses
arquivos. Custo se errado: Markdown fica sem formatação automática.

**Ruling 23 (desvios da Tarefa 2 — `tsconfig.tools.json` e `@eslint/js`).**
Ambos aceitos. O `tsconfig.tools.json`, referenciado pelo `tsconfig.json` da
raiz, coloca `test/` e os arquivos de config da raiz dentro de um projeto
TypeScript real, para que o `projectService` do `typescript-eslint` os analise —
é a solução correta, e não o atalho de desligar regra ou de adicioná-los a
`ignores`. O `@eslint/js@10.0.1` virou dependência porque o `eslint@10` não
exporta mais `configs.recommended` do pacote principal. Custo se errado: um
tsconfig e uma devDependency a mais.

**Ruling 24 (porta 5432 do host ocupada).** A porta 5432 desta máquina está
tomada por um container `mariana-postgres` de outro projeto. O implementador não
o parou — decisão certa, não é nosso. O `docker-compose.yml` passou a usar
`${POSTGRES_DEV_PORT:-5432}` para o Postgres de desenvolvimento (preservando
5432 como padrão para quem clonar o repo) e o `.env` local aponta para **5434**.
O Postgres de teste segue em **5433**, como o spec manda. Custo se errado:
nenhum — é configuração local. **Vai ao CHECKPOINT 1 como observação.**

**Ruling 25 (volume do `postgres:18-alpine`).** A imagem 18 monta os dados em
`/var/lib/postgresql`, não em `/var/lib/postgresql/data` como as anteriores. O
compose foi corrigido para o caminho novo e os dois containers sobem `healthy`.
Verificado, não suposto.

**Ruling 26 (convenção de sublinhado no `no-unused-vars`).** O código de teste do
plano usava `const { DATABASE_URL: _omitido, ...semBanco } = valid;`, que o
`@typescript-eslint/no-unused-vars` reprovava: defeito da configuração do lint,
não do teste. A regra passou a ter `argsIgnorePattern`, `varsIgnorePattern` e
`caughtErrorsIgnorePattern` em `^_`, mais `ignoreRestSiblings: true`, e segue
como `error`. Vale para todas as tarefas seguintes. Custo se errado: nenhum — é
a convenção padrão do ecossistema.

- `Tarefa 4a: complete` — `buildApp`, logger com `redact`, `AppError`/`ERROR_CODES`
  e o handler único de erro e de 404. Arquivos: `apps/server/src/logger.ts`,
  `src/shared/errors.ts`, `src/plugins/error-handler.ts`, `src/app.ts`,
  `test/app.test.ts`; `fastify-plugin@6.0.1` adicionado (fixado) para o
  error-handler não ficar encapsulado. TDD confirmado (vermelho antes:
  `Cannot find module '../src/app.js'`). Verificado: `test` ✅ 3 arquivos / 11
  testes, `check` ✅, `lint` ✅, `build` ✅.
  Decisões do implementador, aceitas: `disableRequestLogging: false` omitido
  porque emite `FSTDEP023` no fastify 5 e já é o default (intenção em
  comentário); `buildLoggerOptions` devolve
  `NonNullable<FastifyServerOptions['logger']>` porque
  `exactOptionalPropertyTypes` quebra o overload do Fastify; `genReqId` só nas
  opções do Fastify, sem duplicar; `rateLimitMax` declarado em
  `BuildAppOptions` e consumido só pela 4b.

**Ruling 27 (rotas `/__test/*` sem teste de ausência em produção).** O
implementador da 4a notou que as rotas de teste são protegidas apenas por
`if (env.NODE_ENV === 'test')`, sem nada provando que não existem em produção.
É uma superfície de ataque real se alguém mexer nessa condição depois.
Encaminhado para a **Tarefa 4b**, que é dona da superfície de segurança: um
teste sobe `buildApp` com `NODE_ENV=production` e exige 404 em `/__test/echo` e
`/__test/boom`. Custo se errado: a condição quebra em silêncio num refator e
duas rotas de depuração ficam expostas.

- `Tarefa 4b: complete` — helmet, CORS com lista literal e rate limit. Arquivos:
  `apps/server/src/plugins/security.ts`, `test/security.test.ts`, `src/app.ts`
  alterado. TDD confirmado (antes: 3 falhando / 1 passando). Verificado:
  `test -- security.test.ts` ✅ 4 testes; suíte completa ✅ 4 arquivos / 15
  testes; `check` ✅, `lint` ✅, `build` ✅.
  Decisões do implementador, aceitas: o 429 vem do handler de erro da 4a, sem
  `errorResponseBuilder` (o `@fastify/rate-limit@11.2.1` lança um `Error` com
  `statusCode: 429`, que o handler já mapeia) — um caminho só, como pedido;
  CORS com `origin: env.CORS_ORIGINS` literal e `credentials: true`; o teste do
  429 usa `POST /__test/echo` em vez de uma URL inexistente, pelo motivo do
  Ruling 28.

**Ruling 28 (rotas inexistentes escapam do rate limit).** O
`@fastify/rate-limit@11` aplica o limite por rota registrada, via hook
`onRoute`. Consequência: uma URL que não existe **não** passa pelo limite, e
alguém pode martelar `/qualquer-coisa` sem teto. É uma lacuna real de
endurecimento, não teoria. Encaminhado para a **Tarefa 5**: o
`setNotFoundHandler` passa a ter `preHandler: app.rateLimit()`, com teste
provando o 429 numa URL inexistente. Custo se errado: 404s ficam sem teto de
requisições até a B9.

**Ruling 29 (limites do rate limit em produção).** Duas observações do
implementador vão para `docs/backlog.md`, não para o código agora: o store é em
memória, então com N réplicas o teto efetivo é `100 × N`; e o `keyGenerator`
default usa `req.ip` sem `trustProxy` configurado, então atrás de um proxy todos
os clientes dividiriam um teto único. Motivo do diferimento: as duas dependem da
topologia de deploy, e o spec trata endurecimento final na **B9**. Custo se
errado: rate limit menos eficaz em produção — mitigado por estar registrado e
endereçado na fase que o spec reserva para isso.

- `Tarefa 5: complete` — cliente Postgres, plugin de banco, `GET /health` e
  `server.ts`. Arquivos criados: `apps/server/src/db/schema/index.ts` (com
  `schema = {}` para as 7a/7b preencherem), `src/db/client.ts`,
  `src/plugins/db.ts`, `src/modules/health/routes.ts`, `src/server.ts`,
  `test/health.test.ts`. Alterados: `src/app.ts` (registra `dbPlugin` e
  `healthRoutes`; `poolMax` em `BuildAppOptions`),
  `src/plugins/error-handler.ts` (Ruling 28 aplicado:
  `setNotFoundHandler({ preHandler: app.rateLimit() }, …)`),
  `test/security.test.ts` (novo teste de 429 em URL inexistente),
  `apps/server/package.json` (script `dev`).
  TDD confirmado (vermelho antes: 404 em `/health`). Verificado: `check` ✅,
  `lint` ✅, `test` ✅ 5 arquivos / 18 testes, `build` ✅.
  **Critério de pronto da B1 cumprido de verdade:** `npm run dev:server` subiu e
  `curl -s -i localhost:3000/health` devolveu `HTTP/1.1 200 OK` com
  `{"status":"ok"}`; `SIGTERM` logou o desligamento e o processo saiu, sem deixar
  porta aberta.

**Ruling 30 (script `dev` alterado fora da lista de arquivos do brief).**
Aceito. O implementador trocou o script `dev` de `apps/server` para
`tsx watch --env-file-if-exists=../../.env src/server.ts`. Era o mínimo para o
`dev:server` subir lendo o `.env` da raiz sem enfiar lógica de caminho de
dotenv dentro do `server.ts`, que o spec quer sem regra de negócio. Em produção
(`npm start`) não há `--env-file` e as variáveis vêm do ambiente, como deve ser.
Custo se errado: nenhum — é configuração de desenvolvimento.

- **Fase B1 concluída** — critério do spec ("testes verdes; `npm run dev:server`
  sobe") atendido e verificado.

- `Tarefa 6: complete` — `normalizePhone`, `isValidPhone`, `toWaMeDigits` em
  `apps/server/src/shared/phone.ts`, com `test/phone.test.ts`. TDD confirmado
  (vermelho antes: `Cannot find module '../src/shared/phone.js'`). Verificado:
  18 testes no arquivo; suíte completa ✅ 6 arquivos / 36 testes; `check` ✅,
  `lint` ✅, `build` ✅. Nenhuma dependência nova (~40 linhas de regra própria);
  `isValidPhone` delega a `normalizePhone` por try/catch, regra única.
  Decisão técnica registrada: a ambiguidade entre o DDI `55` e o DDD `55` (Rio
  Grande do Sul) é resolvida pelo **comprimento total de dígitos** — só
  sequências de 12 ou 13 dígitos tratam o `55` inicial como DDI. DDD validado
  estruturalmente (`[1-9][1-9]`), sem a lista da Anatel, de propósito.

- `Tarefa 7a: complete` — 3 enums e as tabelas de identidade. Criados:
  `apps/server/src/db/schema/{enums,organizations,users,memberships}.ts`.
  Alterados: `packages/contracts/src/index.ts` (enums ao lado de
  `CONTRACTS_VERSION`, preservado) e `src/db/schema/index.ts` (marcador vazio
  trocado pelas 3 tabelas + 3 enums). `unique('memberships_org_user_unique')`
  criada — é o alvo das cinco FKs compostas da 7b. Verificado: `check` ✅,
  `lint` ✅, `test` ✅ 6 arquivos / 36 testes, `build` ✅.
  Sem teste novo, de propósito: o que falta asserir é integridade de banco, que
  é das Tarefas 8+. Uma sonda de tipos temporária confirmou que
  `db.query.organizations/users/memberships` resolvem, e foi removida.

**Ruling 31 (nome de coluna explícito em `snake_case`).** O implementador
escreveu o nome de cada coluna explicitamente (`timestamp('created_at', …)`) em
vez da forma sem nome que o plano mostrava. Correto e necessário: sem
`casing: 'snake_case'` configurado no `drizzle()` e no `drizzle.config.ts`
(que ainda não existe), `createdAt` viraria a coluna `createdAt` no Postgres,
contra a convenção do projeto. A Tarefa 7b segue a mesma forma. Custo se errado:
nenhum — é a forma explícita, que não depende de configuração global.

**API do `drizzle-orm@0.45.4` verificada nos `.d.ts`** (não suposta — vale para
as Tarefas 7b e 8):
- O terceiro argumento de `pgTable` devolve **array**:
  `(self) => PgTableExtraConfigValue[]`. As sobrecargas com objeto estão
  `@deprecated` em `pg-core/table.d.ts`. `foreignKey({...})` das FKs compostas
  entra nesse mesmo array.
- `pgEnum(nome, valores)` aceita array `as const` direto, sem cast nem spread.
- `unique(nome?).on(...cols)`; `uuid('id').primaryKey().defaultRandom()`;
  `timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`;
  `.references(() => t.id, { onDelete: 'cascade' })`.
- `index(nome).on(...)` tem `.where(condition: SQL)`
  (`pg-core/indexes.d.ts:67`), confirmado antes, no Ruling 13.

- `Tarefa 7b: complete` — tabelas comerciais, constraints e índices. Criados:
  `apps/server/src/db/schema/{leads,activities,follow-up-tasks}.ts`; alterado
  `src/db/schema/index.ts`. Verificado: `check` ✅, `lint` ✅, `test` ✅ 6
  arquivos / 36 testes, `build` ✅.
  Os nomes das constraints e dos índices foram **lidos de volta** do `dist` com
  `getTableConfig`, não apenas declarados: uniques `leads_org_id_unique`,
  `leads_org_phone_unique`; FKs compostas em cascade
  `activities_org_lead_leads_fk`, `follow_up_tasks_org_lead_leads_fk`; as cinco
  FKs compostas `NO ACTION` contra `memberships`
  (`leads_org_assigned_to_memberships_fk`,
  `activities_org_created_by_memberships_fk`,
  `follow_up_tasks_org_assigned_to_memberships_fk`,
  `follow_up_tasks_org_created_by_memberships_fk`,
  `follow_up_tasks_org_completed_by_memberships_fk`); índices
  `leads_org_status_idx`, `leads_org_phone_idx`, `follow_up_tasks_org_due_idx`
  (parcial, `where=YES`) e `activities_org_lead_created_idx` (`created_at desc`).
  Sonda de tipos temporária confirmou `db.query.leads/activities/followUpTasks`,
  **com controle negativo** (`db.query.bogusTable` falhou com TS2339, então o
  verde significa algo), e foi removida com a saída obsoleta do `dist`.
  Decisão do implementador, aceita: todas as FKs compostas foram nomeadas
  explicitamente porque os nomes automáticos do Drizzle passariam do limite de
  63 bytes do Postgres e poderiam colidir entre as três FKs de
  `follow_up_tasks`.

**Ruling 34 (índice `leads_org_phone_idx` é redundante).** O implementador
observou que `leads_org_phone_unique` já cria o índice em
`(organization_id, phone)`, tornando `leads_org_phone_idx` uma segunda
estrutura idêntica — custo de escrita e de espaço sem ganho de leitura. O spec
B2 exige "índice em `leads (organization_id, phone)`", e a constraint única
**satisfaz** esse requisito. Decisão: remover `leads_org_phone_idx` e registrar
que o índice exigido pelo spec é fornecido por `leads_org_phone_unique`.
Encaminhado para a **Tarefa 8**, que é dona da migration. Custo se errado:
nenhum — o índice continua existindo, só sob o nome da constraint.

### Revisão do núcleo B1 (Tarefas 4a, 4b, 5) — 2026-10-26

Aderência ✅ e qualidade aprovada nas três tarefas. Nenhum achado na 4b. O
revisor exercitou segurança de verdade, não por leitura — vale registrar o que
ele **provou**:

- 500 forçado em `NODE_ENV=test` **e** em `development`: corpo exatamente
  `{"error":{"code":"INTERNAL_ERROR","message":"Erro interno do servidor."}}`,
  sem stack, sem a mensagem interna canário, sem caminho de arquivo. O handler
  não ramifica por ambiente, então `production` segue o mesmo código.
- App com `DATABASE_URL=postgres://zap:SENHA-CANARIO-XYZ@127.0.0.1:1/nada` e
  `GET /health`: 503 genérico; a senha não apareceu no corpo, em header nenhum,
  nem em nenhuma linha de log.
- Formato único de erro confirmado em 404, 413, 429, validação Zod, JSON
  malformado, content-type errado, método inexistente, 500 e 503. Nenhuma rota
  escapa.
- CORS: cada origem listada recebe a si mesma; `http://evil.example` não recebe
  `access-control-allow-origin`. Nenhum `true` nem `'*'` no código.
- Rate limit do 404 (Ruling 28) confirmado fora do teste: com `rateLimitMax: 2`,
  três URLs inexistentes **diferentes** deram 404, 404, 429 — o contador é por
  IP, não por caminho.
- Rotas `/__test/*` ausentes com `NODE_ENV=production` (Ruling 27) confirmado.
- `bodyLimit` de 1 MiB explícito; payload de 2 MiB → 413 no formato padrão.
- Nenhum segredo em código; nenhum handle de conexão pendurado na suíte.

**Ruling 32 (cinco achados "menores" elevados a correção; onda única).** O
revisor classificou sete achados como menores. Cinco deles eu elevo, porque dois
tocam a invariante que o spec nomeia ("nunca stack trace/segredos na resposta") e
três são correção baratíssima de robustez. Vão numa **onda única de correção**,
despachada depois da Tarefa 7b para não colidir na suíte:

1. `src/plugins/error-handler.ts` — o ramo de `AppError` devolve `error.message`
   para **qualquer** `statusCode`, 5xx incluído. Hoje o único `AppError` 5xx é o
   503 do `/health`, mas nada impede um com mensagem interna. Correção:
   `statusCode >= 500` cai na mensagem fixa de `INTERNAL_ERROR`. **Buraco real
   na invariante de não vazamento.**
2. `src/logger.ts` — o `redact` só cobre a estrutura literal `req.headers.*`.
   Reproduzido pelo revisor: `request.log.info({ headers: request.headers })`
   imprime `Authorization` e `Cookie` em claro. Hoje a proteção efetiva vem do
   serializer `req` do Fastify, não do `redact`. Correção: acrescentar
   `headers.authorization`, `headers.cookie`, `*.authorization`, `*.cookie`.
3. `src/logger.ts` — o wildcard `*.x` do Pino é de **exatamente um nível**.
   Reproduzido: `{ password: 'TOPO' }` sai em claro. Correção: acrescentar os
   paths sem prefixo (`password`, `token`, `secret`, `DATABASE_URL`,
   `BETTER_AUTH_SECRET`). O Pino não tem sintaxe de profundidade arbitrária, então
   o resto fica como convenção de não logar objeto fundo.
4. `src/plugins/error-handler.ts` — todo erro é logado em nível `error`,
   inclusive 400 de validação e 429. Uma enxurrada bloqueada pelo rate limit
   escreve uma linha `error` por requisição: amplificação de log. Correção:
   `warn` para 4xx, `error` só para >= 500.
5. `src/server.ts` — o `await app.close()` do handler de sinal não tem try/catch
   (um `pool.end()` que rejeita vira unhandled rejection e o processo morre sem
   log), e um sinal repetido re-entra no fechamento. Além disso o
   `process.exit(1)` logo após `app.log.error` pode perder a linha de log em
   `development`, onde o `pino-pretty` roda em worker — justo no caso em que ela
   é a única pista. Correção: try/catch com flag de "já fechando", e
   `process.exitCode = 1` com flush antes de sair.

Custo se errado: cinco mudanças pequenas em código já coberto por 36 testes; a
onda termina com re-revisão.

**Ruling 33 (achado parqueado).** `src/plugins/db.ts` declara `db` e `pool` via
`declare module 'fastify'` como sempre presentes em qualquer `FastifyInstance`,
então um app montado sem `dbPlugin` compila e quebra em runtime. **Parqueado,
não corrigido:** é real, mas nada a jusante depende disso — `buildApp` é o único
caminho de construção e sempre registra o plugin. Reestruturar em helper
validado custa mais do que protege agora. Reavaliar na B9. Custo se errado: um
erro de runtime num caminho de construção que não existe.

- `Onda de correção B1: complete` — os cinco achados do Ruling 32 corrigidos numa
  rodada. Alterados: `apps/server/src/logger.ts`,
  `src/plugins/error-handler.ts`, `src/server.ts`; novos
  `test/error-handler.test.ts` e `test/logger.test.ts`. Verificado: `check` ✅,
  `lint` ✅, `test` ✅ 8 arquivos / 41 testes (baseline de 36 intacta, +5),
  `build` ✅.
  - (1) `AppError` com `statusCode >= 500` agora responde a mensagem genérica de
    `INTERNAL_ERROR` e sem `details`; o `code` é preservado, porque é contrato
    público nosso e não segredo — é também o que mantém o `DB_UNAVAILABLE` do
    503 do `/health` funcionando sem ajustar o teste existente. Coberto por
    teste com canário de `message` e de `details`, mais um teste-trava para
    `AppError` 4xx. Vermelho confirmado antes.
  - (2) e (3) `redact` ganhou `headers.authorization`, `headers.cookie`,
    `*.authorization`, `*.cookie` e os paths **sem prefixo** (`password`,
    `passwordHash`, `token`, `secret`, `DATABASE_URL`, `BETTER_AUTH_SECRET`).
    Coberto por teste que exercita o Pino com as opções reais de
    `buildLoggerOptions` e destino em memória, para
    `{ headers: { authorization, cookie } }`, `{ password: 'TOPO' }` e
    `{ dados: { token } }`. Vermelho antes mostrava `Bearer token-canario` e
    `sessao=canario` em claro.
  - (4) `resolveStatusCode()` decide o status antes de responder: `log.warn` para
    4xx, `log.error` só para >= 500; o erro completo, com stack, continua indo ao
    log nos dois casos.
  - (5) `server.ts` com flag `closing` que ignora sinal repetido, `try/catch` no
    `app.close()` e `process.exitCode = 1` em vez de `process.exit(1)` imediato.
    Verificado ao vivo: três `SIGTERM` no mesmo tick produziram 1 `INFO` e 2
    `WARN: sinal repetido`, com exit 0; `npm run dev:server` + `SIGTERM`
    desligou limpo e liberou a porta 3000.

**Ruling 35 (resíduos da onda de correção).** Três itens ficam, com motivo:
- O `redact` do Pino cobre topo e um nível; `{a:{b:{token}}}` ainda vazaria, e
  nada **força** a convenção de não logar objeto fundo. O Pino não tem sintaxe
  de profundidade arbitrária, então a saída real seria um serializer próprio.
  Para `docs/backlog.md`, com gatilho explícito: vira risco concreto quando a
  **B10** logar payload de webhook.
- O achado (4) não tem teste automatizado: exigiria um `loggerDestination`
  opcional em `BuildAppOptions`, o que é mudar a assinatura pública do
  `buildApp` para testar um nível de log. Diferido; os testes de 400/404/413/429
  continuam exercitando o `resolveStatusCode`.
- O handler de sinal não tem watchdog: um hook `onClose` travado pendura o
  processo até o `SIGKILL`. Encontrado pelo implementador e **não** mexido, a
  pedido. Para `docs/backlog.md`, decidir na **B9**.

- `Tarefa 8: complete` — primeira migration e os testes de integridade. Criados:
  `apps/server/drizzle.config.ts`, `src/db/migrate.ts`,
  `apps/server/drizzle/0000_nappy_captain_universe.sql` (+ `meta/`),
  `test/schema-integrity.test.ts`. Verificado: `check` ✅, `lint` ✅, `test` ✅ 9
  arquivos / 48 testes (baseline de 41 intacta, +7), `build` ✅.
  O SQL gerado foi **lido**, não suposto: 3 `CREATE TYPE`, as 6 tabelas, as 5
  uniques (`leads_org_id_unique`, `leads_org_phone_unique`,
  `memberships_org_user_unique`, `organizations_slug_unique`,
  `users_email_unique`), as 5 FKs compostas `NO ACTION` contra `memberships`,
  as 2 FKs compostas `ON DELETE cascade` contra `leads`, e os 3 índices —
  incluindo o parcial `follow_up_tasks_org_due_idx ... WHERE completed_at is null`
  e o `activities_org_lead_created_idx` com `created_at DESC NULLS LAST`.
  Ruling 34 aplicado: `leads_org_phone_idx` não existe na migration; o índice
  em `(organization_id, phone)` que o spec B2 exige é o da constraint
  `leads_org_phone_unique`.
  Além dos 6 testes do plano, o implementador acrescentou um sétimo
  (`createdBy` de usuário sem membership é rejeitado), que é o item 7 do Review
  Focus exercitado contra o banco de verdade e não só declarado no schema.
  Registrado em `docs/decisions.md`: a migration é **provisória** (Ruling 7) e a
  decisão sobre `UNIQUE (organization_id, phone)`.
  Decisões do implementador, aceitas:
  - `runMigrations(databaseUrl)` recebe a URL por argumento e **não** lê
    `process.env`. É o que deixa o helper da Tarefa 9 apontar para o banco de
    teste sem depender de qual `.env` foi carregado.
  - `resolveMigrationsFolder()` sobe a partir de `import.meta.url` e só aceita a
    pasta que tiver `meta/_journal.json`. Motivo: `npm run db:migrate` roda da
    raiz e do workspace, e o módulo compilado roda de `dist/src/db/` — um
    `./drizzle` relativo ao cwd acertaria um caso e erraria os outros; sem a
    checagem do journal, uma pasta errada daria "0 migrations applied" em
    silêncio.
  - O script `db:migrate` **não** tem fallback de `DATABASE_URL`: sem a variável
    ele falha com mensagem acionável. Um fallback para o `.env` do repositório
    transformaria "esqueci de exportar" em "apliquei migration no banco errado".
  - Pool de migration com `max: 1` e `pool.end()` em `finally`, para a migration
    não deixar conexão pendurada quando falha. Nenhuma mensagem de erro imprime
    a URL de conexão, que traz usuário e senha.

- `Tarefa 9: complete` — helpers de teste, factories e a guarda única de banco de
  teste. Criados: `apps/server/test/helpers/db.ts`, `test/helpers/app.ts`,
  `test/factories.ts`, `test/helpers.test.ts`. Alterados:
  `apps/server/test/schema-integrity.test.ts` (reescrito sobre os helpers, os 7
  casos preservados, sem pool nem guarda próprios), `test/setup-env.ts` (guarda
  de topo de módulo trocada pela função importada, mais `afterAll(closeTestDb)`)
  e `tsconfig.tools.json`. TDD confirmado (vermelho antes:
  `Cannot find module './factories.js'`).
  Verificado **por quem coordena, não só relatado**: `check` ✅, `lint` ✅,
  `test` ✅ 10 arquivos / 62 testes (baseline de 48 intacta, +14), `build` ✅.
  API produzida, da qual a B3 em diante depende: `getTestDb`, `closeTestDb`,
  `ensureMigrated`, `resetDb`, `resetDbEm(url)`, `assertTestDatabaseUrl`,
  `databaseNameOf`, `getTestDatabaseUrl`; `buildTestApp()`; as 6 factories mais
  `proximoTelefone()` e os tipos `*Row`/`Create*Input`.
  **Pendência do "Tarefa 2: menor (diferido)" fechada:** a guarda de banco de
  teste deixou de ser código de topo de módulo sem cobertura. Existe **uma**
  implementação, `assertTestDatabaseUrl`, chamada tanto pelo `setup-env.ts`
  quanto pelo `resetDbEm`, com 5 testes (variável vazia/ausente, string que não
  é URL, URL sem nome de banco, nome sem sufixo `_test`, nome de variável
  customizado) e 2 testes afirmando que a mensagem **não** contém a URL inteira
  nem `zap:zap`. A guarda foi exercitada em runtime também:
  `DATABASE_URL_TEST= npx vitest run apps/server/test/phone.test.ts` falha com a
  mensagem acionável.
  Decisões do implementador, aceitas:
  - `resetDbEm(url)` com URL diferente da do ambiente abre um pool `max: 1`
    próprio e o fecha no `finally`, em vez de truncar no pool memoizado —
    truncar num pool que não é o da URL pedida seria mentir sobre o alvo. A
    guarda roda antes de conectar, então a URL de desenvolvimento usada no teste
    nunca abre conexão.
  - `closeTestDb()` zera a memoização, para um `getTestDb()` posterior no mesmo
    processo não devolver pool encerrado.
  - `ensureMigrated()` memoiza a **promessa**, não um booleano: duas chamadas
    concorrentes esperam a mesma execução em vez de rodar o migrator em paralelo.
  - Unicidade por `randomUUID()` em slug/e-mail/nome, não por contador:
    `organizations.slug` e `users.email` são únicos **globalmente** e os arquivos
    de teste rodam em processos separados sobre o mesmo banco, então um contador
    por processo colidiria. O telefone usa base aleatória por processo mais
    contador local, tudo por `normalizePhone`; telefone informado por quem chama
    também é normalizado, senão o `UNIQUE (organization_id, phone)` não
    significaria nada.
  - `buildTestApp` passa `poolMax: 2` além do pedido no brief: cada app abre pool
    próprio e o default 10 somaria contra o `max_connections` nas suítes da B4.
  - O `TRUNCATE` único inclui `users` e `organizations`: "tabelas comerciais" do
    plano foi lido como "todas as de dados", senão organizações órfãs
    acumulariam entre arquivos e o `UNIQUE` de slug viraria ruído.
  - `beforeAll` dos arquivos de integração chama `ensureMigrated()` antes de
    `resetDb()`: num banco não migrado o `TRUNCATE` falharia por tabela
    inexistente e esconderia a causa.

**Ruling 36 (`tsconfig.tools.json` ganhou referência a `apps/server`).** Aceito.
Fora da lista de arquivos da tarefa, e necessário: com a guarda compartilhada, o
`test/setup-env.ts` (projeto `tools`) importa
`apps/server/test/helpers/db.ts`, e cruzar fronteira de projeto composite sem a
referência quebrava o `npm run check` com `TS6307`. A alternativa era duplicar a
guarda — exatamente o que o brief manda evitar, porque duas cópias divergem.
Custo se errado: nenhum — uma referência a mais num tsconfig de ferramentas.

**Ruling 37 (quatro arquivos de teste ainda chamam `buildApp()` direto).**
`apps/server/test/{app,security,health,error-handler}.test.ts` continuam
montando o app sem `buildTestApp()`, logo com pool default de 10 e sem
`rateLimitMax` alto. O implementador os deixou de fora por estarem fora da lista
da tarefa — decisão certa. Fica registrado como risco com gatilho: quando a
contagem de arquivos de teste crescer na B4, isso vira 429 aleatório e pressão em
`max_connections`. Vai para `docs/backlog.md`; migrar na primeira suíte da B4 que
sentir o problema. Nenhuma migração agora: o `security.test.ts` depende de
limites próprios e mexer nele arriscaria o teste de 429 da Tarefa 4b.

**Ruling 38 (`isolate: false` sugerido pelo Vitest, recusado).** O Vitest oferece
~0,7 s rodando sem isolamento. Recusado: a memoização por processo dos helpers e
o `drop schema` do `schema-integrity.test.ts` dependem do isolamento atual.
Trocar economizaria menos de um segundo e criaria acoplamento entre arquivos de
teste pelo estado de módulo. Custo se errado: a suíte continua ~0,7 s mais lenta.

- `Tarefa 10: complete` — seed com dados fictícios de 2 organizações. Criados:
  `apps/server/src/db/seed.ts`, `apps/server/test/seed.test.ts`. Nada mais
  tocado; nenhuma migration nova (o schema não mudou). TDD confirmado (vermelho
  antes: `Cannot find module '../src/db/seed.js'`).
  Verificado **por quem coordena**: `check` ✅, `lint` ✅, `test` ✅ 11 arquivos /
  66 testes (baseline de 62 intacta, +4), `build` ✅.
  `seed(db): Promise<SeedResult>`, com `SeedResult = { organizations, users,
  leads }` em linhas completas do `$inferSelect` — não só ids — para a B7 ter
  `status`, `assignedTo` e `organizationId` sem query nova. Truncate das 6
  tabelas + todos os inserts numa **única transação**.
  **Critério de pronto da B2 cumprido de verdade:** `drop schema public cascade`
  + `drop schema drizzle cascade` no banco de teste (5433), `\dt` devolvendo
  "Did not find any tables.", depois `npm run db:migrate` (exit 0, "migrations
  aplicadas") e `npm run db:seed` (exit 0). Contagens conferidas no psql pelo
  implementador **e relidas por quem coordena**: 2 organizações, 4 usuários, 4
  memberships, 12 leads, 16 atividades, 8 tarefas; 6 status distintos de lead em
  cada organização; tarefas em `concluidas=2, vencidas=2, futuras=4`. A suíte
  inteira foi rodada de novo depois do drop, no banco recriado.
  Decisões do implementador, aceitas:
  - A guarda de `_test` do seed usa `select current_database()`, não o nome
    extraído da URL: `seed` recebe um `Db` já conectado e não tem a URL, e
    importar o helper de teste de dentro de `src/` seria inversão de
    dependência. Continua valendo só com `NODE_ENV=test`, como o plano manda, e
    a mensagem cita só o nome do banco.
  - 2 testes além dos 2 do plano: coerência entre o `SeedResult` e o que está no
    banco (4 usuários = 2 por organização, leads de todas as organizações,
    contagem do resultado igual à da tabela) e telefones gravados em E.164.
  - `contarLeadsCruzados()` não é zero por construção: conta atividades e tarefas
    cuja `organization_id` difere da do lead apontado **mais** leads com
    `assigned_to` que não é membership da própria organização. As FKs compostas
    tornam isso impossível hoje; a consulta existe para falhar no dia em que uma
    delas for afrouxada. É o teste certo pelo motivo certo.
  - `completedAt` e `completedBy` são preenchidos juntos nas tarefas concluídas,
    embora o schema permita `completedBy` nulo: uma tarefa concluída sem autor
    deixaria a B5 sem o "quem".

**Ruling 39 (`follow_up_tasks` sem CHECK amarrando `completed_at` e
`completed_by`).** O implementador do seed notou que o schema aceita
`completed_at IS NOT NULL AND completed_by IS NULL` e o inverso: hoje só a
disciplina do código mantém a coerência, e o seed a mantém por convenção, não
por constraint. Não corrigido agora, de propósito: mexer no schema depois da
migration aplicada exigiria uma segunda migration no fim do bloco, e a Tarefa 8
já declarou a primeira como **provisória** (Ruling 7) — a B3 vai regerar. Para
`docs/backlog.md` com gatilho explícito: entra junto com a regeneração da
migration na **B3**, ou na **B5**, que é dona das tarefas de follow-up, se a B3
não regenerar. Custo se errado: uma tarefa pode ficar marcada como concluída sem
autor, e a tela da B5 mostraria "concluída por" vazio.

### Revisão de segurança do bloco B0–B2 — 2026-10-26

O agente `security-reviewer` fechou o bloco (spec §3.6). **Nenhum achado
crítico.** O que ele **provou**, exercitando e não lendo — 15 tentativas de
escrita cruzada entre organizações, todas barradas pelo banco, cada uma dentro de
transação com `rollback`:

- As 7 FKs compostas seguraram tudo: atividade com `lead_id` de outra
  organização, `created_by`/`assigned_to`/`completed_by` sem membership na
  organização, tarefa cruzada, e também os `UPDATE` — `activities` trocando
  `organization_id` ou `lead_id`, `leads` trocando `organization_id` com filhos
  ou com responsável, `memberships` trocando `organization_id`/`user_id` quando
  referenciada. Só um lead sem filhos e sem responsável pode trocar de
  organização, e nesse caso migra inteiro: não há órfão entre organizações.
- `select conname, convalidated, condeferrable from pg_constraint` → 12 FKs,
  nenhuma `NOT VALID`, nenhuma `DEFERRABLE`. Com `organization_id NOT NULL`, o
  bypass de `MATCH SIMPLE` também está fechado. Não existe caminho de escrita que
  escape das compostas.
- `organizationId` não entra pelo cliente: o único `request.body` do código é o
  de `app.ts:72`, com schema `z.object({ nome })` — `POST /__test/echo` com
  `organizationId` no corpo devolve só `{"nome":"a"}`, campo descartado;
  `/health?organizationId=abc` e o header `x-organization-id` são ignorados.
- Formato único de erro e ausência de stack, caminho de arquivo e segredo em
  **todos** os corpos e headers de 400 (validação), 400 (`BAD_REQUEST`, JSON
  malformado), 404, 413, 429, 500 e o 503 do `/health`. `/__test/boom` lança
  `segredo-que-nao-pode-vazar` e a string não aparece na resposta. Nenhum
  `x-powered-by`.
- Senha canário em `DATABASE_URL` com banco fora do ar e com senha errada:
  `grep -c SENHA-CANARIO = 0` em corpo, headers e **toda** a saída de log,
  inclusive na linha `Failed query: select 1` — o `pg` não anexa a senha.
- CORS: origem fora da lista não recebe `access-control-allow-origin`, nem no
  preflight (204 sem o header); `CORS_ORIGINS` vazio, `" "`, `",,,"` e `" , "`
  fazem `parseEnv` lançar e o app não sobe.
- Rotas `/__test/*` com `NODE_ENV=production` → 404 nas duas.
- Rate limit em URL inexistente com `rateLimitMax: 1` → 429 no formato padrão com
  `retry-after: 60`.
- Nenhuma das 18 variantes de bypass da guarda de banco de teste imprimiu a URL
  na mensagem de erro.

Barrados corretamente na guarda, para registro: string libpq, URL sem banco,
`?dbname=x_test`, `/prod_test_`, `/PROD_TEST`, `/ZAPRESPONSE_TEST`,
`/zapresponse#_test`.

**Ruling 40 (três achados aceitos para correção imediata; onda única).** Dos
achados do revisor, três entram numa onda só, porque dois tocam invariantes que o
próprio plano nomeia:

1. **`CORS_ORIGINS=*` virava wildcard de verdade** (`src/env.ts:20-30`). O
   `refine` só exigia lista não vazia, então `*` passava como origem literal e o
   `@fastify/cors` o tratava como wildcard: com `origin: https://evil.example` a
   resposta vinha com `access-control-allow-origin: *`. Isso é exatamente o item
   3 do Review Focus ("não pode virar 'liberar qualquer origem'") caindo por
   configuração. Com `credentials: true` o navegador recusa requisição
   credenciada, o que impede chamar de crítico — mas para requisição sem
   credencial a allowlist deixava de existir. Correção: recusar `*` e exigir URL
   absoluta `http:`/`https:` em cada entrada, validada com `new URL()`.
2. **A guarda de banco de teste era furada por `options=-c search_path=`**
   (`test/helpers/db.ts`). Ela validava só o nome do banco, e os parâmetros da
   query string iam intactos para o `pg`: o revisor criou um `schema finge_prod`
   no banco de teste e `resetDbEm(...?options=-c%20search_path%3Dfinge_prod)`
   truncou `finge_prod.leads` (3 linhas → 0). Fica limitado a um banco cujo nome
   já termina em `_test`, daí "menor" — mas é o `TRUNCATE` acertando um alvo que
   ninguém pediu. Correção dupla, defesas independentes: recusar URL com
   parâmetro `options`, e qualificar o `TRUNCATE` com `public.`, para o alvo não
   depender do `search_path`. Junto, o nome do banco passou a ser validado por
   `/^[A-Za-z0-9_]+_test$/`: hoje passavam nomes impossíveis
   (`"zapresponse/x_test"`, `"zapresponse _test"`, `"../zapresponse_test"`) que
   **falham fechado** — a conexão simplesmente não existe, não há como acertar o
   banco de desenvolvimento por ali — então isso é endurecimento, não buraco.
3. **`npm run db:seed` não dizia qual banco ia truncar.** O desenho em si fica
   como está (ver Ruling 41); só o script passa a imprimir
   `seed: truncando o banco "<nome>"`, de `select current_database()`, nunca a
   URL. O log vai no `main()`, não em `seed()`, para os testes não virarem
   barulho.

Mais um item cosmético na mesma onda: comentário no `.env.example` avisando que
a 5432 pode estar ocupada e que a porta do Postgres de desenvolvimento é
configurável por `POSTGRES_DEV_PORT`. O **valor** da chave não muda — o arquivo é
contrato do spec B0.

**Ruling 41 (guarda do seed inerte sem `NODE_ENV=test` — vai ao usuário, não
corrigido).** O revisor mostrou que `if (process.env.NODE_ENV !== 'test') return;`
desliga a checagem de `current_database()`, e provou o caminho: com
`env -u NODE_ENV`, um `db:seed` apontado para o banco de teste truncou e
recriou tudo sem reclamar. O caminho realista para zerar **desenvolvimento ou
produção** é um ambiente que já exporte `DATABASE_URL` — `set -a; source .env`,
direnv, uma URL de produção colada no shell para um comando pontual, ou CI com a
variável de deploy — e então `npm run db:seed` trunca as 6 tabelas daquele banco
sem perguntar; `TRUNCATE ... CASCADE` em `organizations` leva o resto.

**Não corrigido de propósito.** O plano prescreve esse comportamento em dois
lugares ("a guarda de `_test` não pode valer ali: aplique-a só quando
`NODE_ENV=test`"; "um seed apontado para o banco de desenvolvimento apaga os
dados de desenvolvimento — que é exatamente o que um seed deve fazer"), e a saída
sugerida pelo revisor é uma variável nova (`SEED_ALLOW_DESTRUCTIVE`), enquanto o
spec B0 fixa as 8 chaves de `.env.example`. Mudar desenho aprovado e acrescentar
chave de configuração é decisão do usuário, não minha. **Vai ao CHECKPOINT 1 como
pergunta.** Mitigação aplicada enquanto isso: o script agora imprime o nome do
banco alvo antes de truncar (item 3 do Ruling 40). Custo se errado: um `db:seed`
descuidado zera um banco que não é de teste — alto, e é por isso que está na mesa
do usuário em vez de no backlog.

**Ruling 42 (`redact` por nome de chave — avaliação ampliada, mesmo gatilho).** O
achado conhecido do `redact` do Pino **cresceu em extensão**, não em causa: além
da profundidade ≥ 2, uma string de conexão vaza **no topo** quando a chave não
está na lista. Provado com `LOG_LEVEL=trace` e canário: `DATABASE_URL` no topo e
um nível → `[REDACTED]`; `{ a: { b: { DATABASE_URL } } }` → vaza (já sabido);
`{ url: 'postgres://zap:SENHA-CANARIO-9Z9Z@h/d' }` → **vaza no topo**, porque
`url` não está na lista. Mantido o diferimento, com o gatilho da **B10**: a saída
certa é um serializer que mascare qualquer valor com `://user:pass@`, não mais um
nome na lista — acrescentar `url`, `connectionString`, `dsn`, `apiKey` só move a
fronteira. A nota do backlog foi atualizada com essa extensão. Custo se errado:
um log de objeto fundo, ou com chave fora da lista, imprime credencial.

**Ruling 43 (dois achados menores aceitos como estão).** O 503 do `/health`
perde a própria mensagem (`error-handler.ts:70-75`): o `AppError` com
`statusCode >= 500` cai na mensagem genérica, então o cliente vê
`{"code":"DB_UNAVAILABLE","message":"Erro interno do servidor."}` em vez de
"Banco de dados indisponível". É consequência deliberada do item 1 da onda
anterior (Ruling 32) e fica — o `code` é o contrato público, a mensagem não. E
`content-type: text/plain` responde 400 (`VALIDATION_ERROR`) onde 415 seria mais
correto: sem vazamento, só status impreciso numa rota de teste, e mexer em
`addContentTypeParser` agora é risco maior que o ganho. Os dois ficam para a
**B9**, com o endurecimento final.

**Suspeitas registradas, não provadas.** O serializer `err` do Pino hoje grava só
`type`/`message`/`stack` (+`code`/`statusCode` no `AppError`), e `err.validation`
**não** apareceu na linha de 400 — o valor submetido não foi logado nesta versão.
Quando a B3 adicionar corpo com `password`, reconfirmar: se alguma versão do
Pino ou do Fastify passar a serializar `err.validation`, o valor cairia em
profundidade ≥ 2 e vazaria pelo buraco do Ruling 42. O mesmo passthrough de
`options`/`search_path` vale para `src/db/client.ts`; sem rota de negócio ainda,
não há consequência medida.

**Fora de alcance nesta revisão, por não existir superfície ainda:** "toda rota
privada exige sessão" e "paginação e limites de listagem". A superfície atual é
`/health` (pública por desenho) e as duas rotas de teste. Fica para a revisão da
B3/B4.

- `Onda de correção B2 (segurança): complete` — os três itens do Ruling 40 mais o
  comentário do `.env.example`, numa rodada. Alterados:
  `apps/server/src/env.ts`, `src/db/seed.ts` (só o `main()`),
  `test/helpers/db.ts`, `test/env.test.ts`, `test/security.test.ts`,
  `test/helpers.test.ts`, `test/seed.test.ts`, `.env.example`.
  Verificado **por quem coordena**: `check` ✅, `lint` ✅, `test` ✅ 11 arquivos /
  **80 testes** (baseline de 66 intacta, +14), `build` ✅. Banco de teste sem
  resíduo: só os schemas `public` e `drizzle`.
  - **Item 1 (CORS).** `isHttpOrigin` valida cada entrada com `new URL` em
    try/catch e exige protocolo `http:`/`https:`; `*` cai porque `new URL('*')`
    lança. Um `.superRefine` sobre a lista transformada invalida a lista inteira
    se uma entrada for ruim, e a mensagem nomeia só a entrada, sem o resto do
    env. O refine de lista vazia continua intacto. Vermelho confirmado antes
    (`expected '*' not to be '*'` no teste-trava de CORS).
    **Reverificado por mim, fora do teste:** `*`, `" * "`,
    `http://localhost:3001,*` e `localhost:3001` são recusados pelo `parseEnv`;
    `http://localhost:3001` passa e é preservado. O item 3 do Review Focus deixou
    de depender de configuração.
    Os `.env`, `.env.test` e `.env.example` locais continuam passando no parse
    (todos com `CORS_ORIGINS=http://localhost:3001`); nenhum `.env` foi editado.
  - **Item 2 (guarda de banco de teste).** Três defesas independentes:
    `assertTestDatabaseUrl` recusa qualquer URL com parâmetro `options`
    (comparação em caixa baixa, como o libpq), `TABELAS_TRUNCAVEIS` passou a ser
    exportada e **qualificada com `public.`** — o alvo do `TRUNCATE` não depende
    mais do `search_path` — e o nome do banco é validado por
    `/^[A-Za-z0-9_]+_test$/` em vez de `endsWith('_test')`. Mensagens sem a URL.
    6 testes novos, incluindo os três nomes impossíveis e as seis variações que
    já falhavam, agora explícitas.
  - **Item 3 (`db:seed` anuncia o alvo).** O `main()` roda
    `select current_database()` e imprime `seed: truncando o banco "<nome>"`
    antes de truncar; nunca a URL. `seed()` e a guarda de `NODE_ENV=test` ficaram
    intactas, nenhuma chave de ambiente nova. Dois testes: um espiona
    `console.log` e exige **zero** chamadas de dentro de `seed()` (trava contra
    pôr o log no lugar errado), e outro roda o `main()` **em subprocesso**
    (`node --import tsx src/db/seed.ts`) conferindo a linha exata e a ausência da
    URL.
  - **Item 4 (`.env.example`).** Três linhas de comentário acima de
    `DATABASE_URL` avisando que a porta do Postgres de desenvolvimento é
    configurável por `POSTGRES_DEV_PORT` e que a 5432 pode estar ocupada por
    outro serviço. Valor da chave intocado, nenhuma chave nova — o arquivo é
    contrato do spec B0.

**Ruling 44 (um teste da onda é guarda de regressão, não prova — dito como é).**
O implementador relatou, sem ser perguntado, que o teste do schema auxiliar
(cria `outro_schema.leads`, roda `resetDb()`, confirma as 3 linhas intactas)
**não** ficou vermelho antes da correção: com `search_path` default em `public`,
`TRUNCATE leads` já acertava `public.leads`, então ele passa nas duas versões. A
prova determinística do `TRUNCATE` qualificado é o teste de `TABELAS_TRUNCAVEIS`,
esse sim vermelho antes (`TABELAS_TRUNCAVEIS is not iterable`). Reproduzir o
vermelho de verdade exigiria uma conexão com `search_path` reescrito, e o único
caminho para isso era justamente o `options=` que a correção 1 passou a recusar —
a alternativa, `ALTER DATABASE ... SET search_path`, é estado global do banco de
teste e ele não mexeu. Aceito como está: a cobertura é honesta e está nomeada.
Registro isto porque um teste que nunca falhou é fácil de confundir com prova
depois.

**Ruling 45 (`TABELAS_TRUNCAVEIS` do `seed.ts` segue sem qualificação).** A lista
própria do `src/db/seed.ts:37` não recebeu o prefixo `public.`, porque o item 3
da onda pedia só o aviso e o escopo foi respeitado. A exposição é menor que a do
helper de teste — o seed não é chamado de dentro da suíte com URL arbitrária —
mas é a mesma classe de problema. Para `docs/backlog.md`, junto com a decisão do
Ruling 41, que mexe no mesmo trecho.

### Achados menores diferidos (triagem na revisão final do bloco)

- `Tarefa 2: menor (diferido)` — a guarda de banco de teste em
  `test/setup-env.ts` é código de topo de módulo sem nada exportado, então
  nenhum teste a cobre e um refator futuro a quebra em silêncio. O
  comportamento foi verificado empiricamente pelo revisor nos três casos, mais
  tentativas de bypass (string libpq, URL sem nome de banco, sufixo
  `/zapresponse/x_test`, `?dbname=prod`) — nenhuma furou. **Encaminhado para a
  Tarefa 9**, que é dona da guarda gêmea do `resetDb()`: as duas serão
  extraídas para funções exportadas e cobertas por teste juntas.
- `Tarefa 1: menor` — `include` do `apps/server/tsconfig.json` listava
  `"vitest.config.ts"`, caminho que não existe nesse workspace. **Corrigido**
  junto com a Tarefa 3; hoje é `["src", "test", "drizzle.config.ts"]`.

- `Tarefa 3: complete` — infra local, contrato de env e `env.ts`. Arquivos:
  `apps/server/src/env.ts`, `apps/server/test/env.test.ts`,
  `docker-compose.yml`, `.env.example`, `.env` e `.env.test` (locais),
  `.gitignore` e `.prettierignore` alterados. TDD confirmado (vermelho antes:
  `Cannot find module '../src/env.js'`). `z.prettifyError` existe no
  `zod@4.6.7` e foi usada. `env.test.ts` ficou com o texto literal do brief
  (`const { DATABASE_URL: _omitido, ...semBanco } = valid;`), sem
  `eslint-disable`, depois da correção do Ruling 26.
  Pendência: `BETTER_AUTH_SECRET` nos `.env` locais é o placeholder do exemplo.
  Passa o `min(32)` e não afeta B0–B2 (Better Auth é B3), mas precisa virar
  segredo real antes da B3. **Vai ao CHECKPOINT 1.**
  Verificado por quem coordena, não só relatado: `npm run check` ✅,
  `npm run lint` ✅, `npm run test` ✅ (2 arquivos, 7 testes, **sem** variável na
  linha de comando), `npm run build` ✅; `postgres-dev` healthy em 5434 e
  `postgres-test` healthy em 5433.

- **Fase B0 concluída** — critério do spec ("`npm install`, `npm run check`,
  `npm run lint` passam") atendido, e `test`/`build` também.

- `Tarefa 2: complete` — ESLint flat config com `projectService`, Prettier,
  runner do Vitest e a guarda de banco de teste. Arquivos: `eslint.config.mjs`,
  `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `test/setup-env.ts`,
  `test/sanity.test.ts`, `tsconfig.tools.json`, e `tsconfig.json`/`package.json`
  alterados. Verificado: `npm run lint` → exit 0 sem achados; `npm run check` →
  exit 0; `npm run test` com `DATABASE_URL_TEST` exportado → exit 0, 1 teste;
  `npm run build` → exit 0. Sem a variável, falha com a mensagem da guarda, como
  projetado.
  Pendência: o npm recusou os scripts de instalação do `esbuild`. Funciona aqui
  pelo binário já desempacotado em `@esbuild/linux-x64`, mas uma CI limpa pode
  precisar de `npm approve-scripts`. **Vai ao CHECKPOINT 1.**

- `Tarefa 1: complete` — esqueleto do monorepo. Arquivos: `package.json`,
  `tsconfig.base.json`, `tsconfig.json`, `packages/contracts/{package.json,
  tsconfig.json,src/index.ts}`, `apps/server/{package.json,tsconfig.json}`.
  Verificado: `npm install && npm run check` → exit 0; `npm run build`
  (`tsc -b --force`) → exit 0; `packages/contracts/dist/index.d.ts` existe.
  Correções do `architect` (Rulings 9, 10 e sugestão 15) aplicadas em voo.
  Pendências registradas pelo implementador:
  - `apps/server` ainda não tem nenhum arquivo em `src`, então `tsc -b` o pula
    em silêncio: o check verde não diz nada sobre aquele workspace até a Tarefa 3.
  - `noEmitOnError` estava ausente, então um build com erro ainda emitia `dist`.
    **Corrigido**: `"noEmitOnError": true` adicionado a `tsconfig.base.json`.
  - `npm install` reportou 4 advisories moderados e 3 scripts de instalação do
    `esbuild` não aprovados. Não tocados — vão ao CHECKPOINT 1.

## Ambiente verificado — 2026-10-26

| Ferramenta | Versão |
|---|---|
| Node.js | v24.18.0 |
| npm | 11.16.0 |
| Docker | 29.9.2 |
| Docker Compose | v5.6.1 |
| jq | 1.8.1 |
| git | 2.53.0 |
