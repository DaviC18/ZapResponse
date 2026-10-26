# ZapResponse — spec.md (execução com Claude Code)

> Documento-guia para o Claude Code executar o projeto em **poucos prompts**.
> Fonte de produto: "ZapResponse — Documentação do produto e especificação técnica v1.0" (26/10/2026).
> Este spec define **como** construir, **em que ordem**, **qual agente faz o quê** e **onde parar**.

---

## 0. Regras invioláveis (ler antes de qualquer ação)

1. **Nenhuma operação git que altere estado sem permissão explícita do usuário.**
   Proibido: `git commit`, `push`, `reset`, `rebase`, `merge`, `checkout`, `switch`, `branch -d/-D`,
   `tag`, `stash`, `clean`, `restore`, `cherry-pick`, `revert`, `worktree`, `am`, `init` (após o setup).
   Permitido (somente leitura): `git status`, `git diff`, `git log`, `git show`.
   - O usuário instalará o bloqueio em `.claude/hooks/block-git.sh` (ver Apêndice C). Mesmo antes do hook existir, **a regra vale**.
   - Em cada checkpoint, o Claude **sugere** uma mensagem de commit e **para**. Quem commita é o usuário.
2. **Overrides das skills Superpowers** (as skills foram escritas assumindo commits frequentes e worktrees):
   - Onde uma skill disser "commit", substituir por: *"registrar progresso em `docs/progress.md` e seguir"*.
   - **Não usar** `using-git-worktrees`. Trabalhar direto na árvore atual.
   - `finishing-a-development-branch`: usar apenas para **apresentar** o resumo/opções ao usuário; nunca executar merge/PR/push.
   - `brainstorming`: **não reabrir** o produto. Este spec + o PDF já são o resultado do brainstorming. Só perguntar se houver contradição real.
3. **Não inventar versões nem APIs.** Antes de instalar/usar uma lib, conferir versão atual (`npm view <pkg> version`) e a documentação oficial (Better Auth, Drizzle, fastify-type-provider-zod, Zod). Registrar versões escolhidas em `docs/decisions.md`.
4. **Escopo congelado** = seção 4 do documento do produto. Itens "fora do escopo" não entram. Dúvida → anotar em `docs/backlog.md`, não implementar.
5. **Economia de tokens:**
   - Uma sessão por **bloco de fases** (ver §6). Entre blocos o usuário roda `/clear`.
   - Toda sessão nova começa lendo apenas: `CLAUDE.md`, este `spec.md` (seção do bloco atual) e `docs/progress.md`.
   - Subagentes recebem **só** o trecho do plano da tarefa deles, não o spec inteiro.
   - Não reler arquivos já lidos na mesma tarefa; não colar logs longos — resumir.
   - Não pedir confirmação entre tarefas de um mesmo bloco. Parar **somente** nos checkpoints ou em bloqueio real.

---

## 1. Decisões técnicas (backend primeiro)

| Item | Decisão | Observação |
|---|---|---|
| Repositório | Monorepo **npm workspaces** | `apps/server`, `apps/web` (depois), `packages/contracts` |
| Runtime | Node.js LTS atual (conferir) + TypeScript strict | `tsx` em dev, `tsc` no build |
| HTTP | **Fastify** | app em `apps/server` |
| Validação | **Zod** + `fastify-type-provider-zod` | schemas reutilizáveis ficam em `packages/contracts` |
| Logs | **Pino** (logger nativo do Fastify) | `redact` de headers de auth/cookies/tokens; `pino-pretty` só em dev |
| Banco | **PostgreSQL** (Docker local; Neon em produção) | |
| ORM | **Drizzle ORM** + drizzle-kit | migrations versionadas em `apps/server/drizzle/` |
| Auth | **Better Auth** (email+senha) com adapter Drizzle | conferir docs atuais; se usar o plugin `organization`, as tabelas dele substituem `organizations/memberships` — decidir na Fase B3 e registrar em `docs/decisions.md` |
| Segurança HTTP | `@fastify/helmet`, `@fastify/cors` (origens via env), `@fastify/rate-limit` | |
| Testes | **Vitest** + `app.inject()` contra Postgres de teste real | sem mocks de banco nos testes de integração |
| Lint/format | ESLint (flat config) + Prettier | |
| Docs API | `docs/api-contract.md` (+ `@fastify/swagger` opcional) | |

**Por que o Drizzle fica dentro de `apps/server`** (e não em `packages/database`): o frontend nunca acessa o banco (princípio do documento). Só os **contratos Zod** são compartilhados, via `packages/contracts`. Menos abstração, mesma versatilidade.

### Estrutura alvo

```
zapresponse/
├── .claude/
│   ├── agents/            # definidos no Apêndice B
│   ├── hooks/block-git.sh # o usuário adiciona (Apêndice C)
│   └── settings.json
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── server.ts          # bootstrap: buildApp() + listen
│   │   │   ├── app.ts             # buildApp(): plugins, rotas, error handler
│   │   │   ├── env.ts             # validação de env com Zod (falha ao iniciar se inválido)
│   │   │   ├── logger.ts          # opções do Pino (redact, níveis)
│   │   │   ├── db/
│   │   │   │   ├── schema/        # organizations, users, memberships, leads, activities, follow_up_tasks
│   │   │   │   ├── client.ts
│   │   │   │   └── seed.ts        # dados fictícios
│   │   │   ├── plugins/           # auth, tenant-context, db, security, error-handler
│   │   │   ├── modules/
│   │   │   │   ├── health/
│   │   │   │   ├── me/
│   │   │   │   ├── leads/         # routes.ts, service.ts, repository.ts
│   │   │   │   ├── activities/
│   │   │   │   ├── follow-ups/
│   │   │   │   ├── dashboard/
│   │   │   │   └── whatsapp/      # wa.me agora; webhook depois
│   │   │   └── shared/            # erros tipados, paginação, phone utils
│   │   ├── drizzle/               # migrations geradas
│   │   ├── test/                  # helpers: buildTestApp, factories, resetDb
│   │   └── drizzle.config.ts
│   └── web/                       # Fase F (depois do backend)
├── packages/
│   └── contracts/src/             # schemas Zod de request/response + enums
├── docs/
│   ├── progress.md   # estado de cada fase/tarefa (fonte da verdade entre sessões)
│   ├── decisions.md  # versões e decisões técnicas
│   ├── backlog.md    # ideias fora do escopo
│   ├── api-contract.md
│   └── plans/        # planos gerados pela skill writing-plans
├── docker-compose.yml # postgres dev + postgres test
├── .env.example
├── CLAUDE.md
└── package.json
```

### Scripts obrigatórios (raiz)

`npm run check` (typecheck), `lint`, `test`, `build`, `db:generate`, `db:migrate`, `db:seed`, `dev:server`.
O agente `test-verifier` roda exatamente esses scripts — eles precisam existir de verdade.

---

## 2. Skills e agentes

### Skills (plugin Superpowers)

Instalação (o usuário faz uma vez, no Claude Code):
```
/plugin install superpowers@claude-plugins-official
```
(alternativa: `/plugin marketplace add obra/superpowers-marketplace` e `/plugin install superpowers@superpowers-marketplace`)

| Skill | Quando usar neste projeto |
|---|---|
| `writing-plans` | Uma vez por bloco: transforma a seção do bloco deste spec em `docs/plans/<bloco>.md` com tarefas pequenas e testáveis |
| `subagent-driven-development` | Execução de cada bloco: um subagente novo por tarefa + revisão em duas etapas (aderência ao spec, depois qualidade) |
| `test-driven-development` | Toda tarefa de código: teste falhando → código mínimo → passa → refatora |
| `systematic-debugging` | Qualquer teste falhando sem causa óbvia; proibido "chutar" correções |
| `requesting-code-review` / `receiving-code-review` | Ao fim de cada tarefa e de cada fase |
| `verification-before-completion` | Antes de marcar qualquer tarefa/fase como concluída: evidência (saída dos comandos), não afirmação |
| `dispatching-parallel-agents` | Só quando houver tarefas realmente independentes (ex.: módulos `activities` e `dashboard` depois de `leads` pronto) |
| `executing-plans` | Fallback se subagentes não estiverem disponíveis |
| ~~`using-git-worktrees`~~ | **Não usar** (regra 0.2) |
| `frontend-design` | Somente na Fase F |

### Agentes do projeto (`.claude/agents/`, conteúdo no Apêndice B)

| Agente | Modelo | Ferramentas | Responsabilidade |
|---|---|---|---|
| `orchestrator` (sessão principal) | — | todas | Lê spec/progress, gera plano, despacha subagentes, atualiza `docs/progress.md`, para nos checkpoints |
| `architect` | opus | só leitura | Revisa plano do bloco, schema e contratos antes da implementação; aponta riscos |
| `db-engineer` | sonnet | leitura/escrita/bash | Schema Drizzle, enums, FKs compostas, índices, migrations, seed |
| `backend-implementer` | sonnet | leitura/escrita/bash | Implementa tarefas de rotas/serviços com TDD |
| `security-reviewer` | opus | só leitura + bash p/ testes | Isolamento por tenant, auth, segredos, logs, validação, CORS |
| `test-verifier` | haiku | bash + leitura | Roda `check/lint/test/build`, devolve resumo curto (passou/falhou + erros-chave) |
| `frontend-implementer` | sonnet | leitura/escrita/bash | Somente Fase F |

Revisão de código por tarefa: usar o revisor da própria skill (`requesting-code-review`); `security-reviewer` entra nos marcos indicados.

---

## 3. Fluxo padrão de cada bloco (o orchestrator segue sem perguntar)

1. Ler `CLAUDE.md`, `docs/progress.md` e a seção do bloco neste spec.
2. Se `docs/plans/<bloco>.md` não existir → skill `writing-plans` (sem passos de commit). Despachar `architect` para revisar o plano; aplicar ajustes.
3. Skill `subagent-driven-development`: para cada tarefa do plano, despachar o agente indicado com **apenas** o texto da tarefa + arquivos relevantes.
4. Cada subagente: TDD → `test-verifier` → revisão → corrigir até verde.
5. Atualizar `docs/progress.md` (tarefa, status, arquivos tocados, comandos verificados).
6. Ao fim do bloco: `security-reviewer` (quando indicado) → `verification-before-completion` → **CHECKPOINT**.

### Formato do CHECKPOINT (e então PARAR)

```
## Checkpoint <bloco> — pronto para revisão
- Entregue: …
- Verificação: check ✅ lint ✅ test ✅ (N testes) build ✅
- Pendências/riscos: …
- Arquivos alterados: (saída resumida de git status)
- Mensagem de commit sugerida: "feat(server): …"
Aguardando você commitar e mandar "continuar".
```

---

## 4. Plano do backend (fases B0–B9)

Cada fase lista **entregas**, **agente** e **critério de pronto**. Testes de aceitação referenciam a seção 12 do documento do produto.

### Fase 0 — Setup do Claude Code (orchestrator)
- Criar `CLAUDE.md` (Apêndice A), `.claude/agents/*` (Apêndice B), `docs/progress.md`, `docs/decisions.md`, `docs/backlog.md`.
- Criar `.claude/settings.json` com a configuração de hook do Apêndice C **apenas se** o usuário já tiver criado o script; caso contrário, registrar em `progress.md` que está pendente.
- **Pronto:** arquivos existem; nenhum git executado.

### B0 — Esqueleto do monorepo (`backend-implementer`)
- `package.json` raiz com workspaces e scripts do §1; `tsconfig.base.json` (strict); ESLint + Prettier; Vitest configurado.
- `docker-compose.yml` com dois Postgres: `dev` (5432) e `test` (5433), volumes nomeados.
- `.env.example` com: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_URL_TEST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGINS`, `LOG_LEVEL`. `.env` no `.gitignore`.
- `packages/contracts` vazio porém compilando.
- **Pronto:** `npm install`, `npm run check`, `npm run lint` passam.

### B1 — Núcleo do server (`backend-implementer`)
- `env.ts`: Zod valida env; app não sobe se faltar variável.
- `logger.ts`: Pino com `redact` (`req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.secret`); `pino-pretty` só em dev; `genReqId` para correlação.
- `app.ts` → `buildApp(opts)` (usado pelos testes); `server.ts` só faz `listen` e trata `SIGTERM`.
- Plugins: zod type provider, helmet, cors (lista de `CORS_ORIGINS`), rate-limit, `bodyLimit` explícito.
- Error handler único: formato `{ error: { code, message, details? } }`; erros de validação → 400; nunca stack trace/segredos na resposta (logar internamente).
- `GET /health` → `{ status: "ok" }` + checagem leve do banco.
- **Testes:** /health 200; payload inválido → 400 no formato padrão; erro forçado não expõe stack (aceitação "Segredos").
- **Pronto:** testes verdes; `npm run dev:server` sobe.

### B2 — Banco e schema (`db-engineer`; revisão `architect`)
- Enums: `membership_role (owner, admin, member)`, `lead_status (new, in_progress, waiting, scheduled, won, lost)`, `activity_type (note, status_change, contact_attempt, follow_up_completed, system)`.
- Tabelas: `organizations`, `users`, `memberships`, `leads`, `activities`, `follow_up_tasks` conforme seção 8 do documento (+ `createdAt/updatedAt`; `follow_up_tasks` com `status` derivável de `completedAt` e `dueAt`).
- Integridade:
  - `UNIQUE (organization_id, id)` em `leads` e FKs compostas `(organization_id, lead_id)` em `activities` e `follow_up_tasks`.
  - `assignedTo` validado contra `memberships` da mesma org (constraint ou validação no serviço + teste).
  - Índices: `leads (organization_id, status)`, `leads (organization_id, phone)`, `follow_up_tasks (organization_id, due_at) WHERE completed_at IS NULL`.
  - Telefone armazenado normalizado (E.164, foco BR) — `UNIQUE (organization_id, phone)` decidir e registrar.
- Se Better Auth for adotado (B3), gerar/alinhar as tabelas exigidas por ele **antes** da primeira migration definitiva.
- `db:generate`, `db:migrate`, `seed.ts` com 2 organizações fictícias, usuários, leads em todos os estágios e tarefas vencidas/futuras.
- Helper de teste: `resetDb()` (truncate) e factories.
- **Testes:** migrations aplicam em banco limpo (aceitação "Produção"); FK composta rejeita atividade apontando lead de outra org.
- **Pronto:** migrations + seed rodam do zero no Postgres de teste.

> **CHECKPOINT 1** (após B0–B2)

### B3 — Autenticação e tenancy (`backend-implementer`; revisão `security-reviewer`)
- Integrar Better Auth no Fastify (rota catch-all `/api/auth/*` conforme docs atuais), sessão validada no servidor, cookie seguro em produção.
- Decidir: plugin `organization` do Better Auth **ou** `memberships` própria. Registrar em `decisions.md`.
- Plugin `requireAuth` → 401 sem sessão.
- Plugin `tenantContext` → resolve `organizationId` **a partir da sessão/membership**, nunca do body/query/header do cliente. Disponível como `request.tenant`.
- Toda função de repositório recebe `organizationId` obrigatório (assinatura força isso).
- `GET /me` → usuário + organização ativa + role.
- Criação do primeiro usuário/organização por script seguro (`npm run db:bootstrap-org`), não por rota pública aberta.
- **Testes:** rota privada sem sessão → 401 (aceitação "Autenticação"); usuário da org A não lê/altera nada da org B → 404 (aceitação "Isolamento"); `organizationId` enviado pelo cliente é ignorado.
- **Pronto:** testes verdes + parecer do `security-reviewer` sem itens críticos.

### B4 — Leads e funil (`backend-implementer`)
- Contratos em `packages/contracts`: `LeadCreate`, `LeadUpdate`, `LeadListQuery`, `LeadResponse`, `LeadDetailResponse`.
- `GET /leads`: paginação (limit máx. 100), filtros por `status`, `assignedTo`, `source`; busca por nome/telefone; ordenação estável.
- `POST /leads`, `GET /leads/:id` (com histórico de atividades e tarefas abertas), `PATCH /leads/:id`.
- Mudança de `status` cria atividade `status_change` **na mesma transação** (`{ from, to }`).
- Telefone: normalizar e validar; inválido → 400 (aceitação "Validação").
- `LeadDetailResponse.whatsappUrl` = `https://wa.me/<E164 sem +>` — só gera link, nunca afirma envio.
- **Testes:** criar e reler persiste (aceitação "Leads"); mudar estágio registra atividade (aceitação "Histórico"); status inválido → 400; isolamento por org em todas as rotas.

### B5 — Atividades (`backend-implementer`)
- `POST /leads/:id/activities` (tipos `note`, `contact_attempt`); `createdBy` = usuário da sessão.
- Tipos `status_change`, `follow_up_completed`, `system` só são criados pelo servidor.
- **Testes:** cliente não consegue criar `status_change` manual; lead de outra org → 404.

> **CHECKPOINT 2** (após B3–B5)

### B6 — Tarefas de retorno (`backend-implementer`)
- `POST /follow-ups`, `GET /follow-ups?scope=pending|overdue|today|done`, `PATCH /follow-ups/:id` (`complete` ou `reschedule` com novo `dueAt`).
- Concluir gera atividade `follow_up_completed`; reagendar gera atividade `system` com data anterior/nova.
- Datas em UTC no banco; API aceita/retorna ISO 8601. Fuso de exibição (America/Sao_Paulo) é responsabilidade do front.
- **Testes:** criar, concluir, reagendar refletem estado e vencimento (aceitação "Tarefas"); fila de pendentes/vencidas bate com o banco.

### B7 — Dashboard (`backend-implementer`; pode rodar em paralelo com B6 após B4 via `dispatching-parallel-agents`)
- `GET /dashboard/summary`: leads ativos por estágio, tarefas pendentes, vencidas, concluídas no período, ganhos/perdidos no período. Tudo calculado no banco, filtrado por org.
- **Testes:** números conferem com dados de seed controlados.

### B8 — WhatsApp manual (`backend-implementer`)
- Util `buildWaMeUrl(phone, text?)` com testes (telefone válido/ inválido, texto URL-encoded).
- `POST /leads/:id/activities` com `contact_attempt` cobre o "registro do contato".
- **Testes:** aceitação "WhatsApp manual" (link correto; nenhuma rota afirma envio).

### B9 — Endurecimento e documentação (`security-reviewer` + `backend-implementer` + `test-verifier`)
- Rodar a tabela inteira de testes de aceitação da seção 12 (exceto webhook).
- `docs/api-contract.md`: cada endpoint com request, response, códigos de erro, exemplos.
- Revisão final de segurança: logs sem dados sensíveis, CORS, rate limit, limites de entrada, segredos fora do código.
- `README` de execução local (docker, migrate, seed, dev, testes).
- **Pronto:** `check/lint/test/build` verdes; checklist do §16 do documento para a parte de backend atendido.

> **CHECKPOINT 3 — BACKEND CONCLUÍDO** (após B6–B9)

### B10 — (Opcional/paralelo) Webhook da WhatsApp Cloud API
Só iniciar com ordem explícita do usuário e com credenciais de teste da Meta disponíveis.
- Tabelas `whatsapp_connections`, `webhook_events` (com `UNIQUE` no id do evento externo).
- `GET /webhooks/whatsapp` (verificação `hub.challenge` com token de env).
- `POST /webhooks/whatsapp`: validar assinatura `X-Hub-Signature-256` (HMAC SHA-256 do **raw body** com app secret) em comparação de tempo constante; deduplicar; responder rápido.
- Conferir a documentação oficial vigente da Meta antes de implementar.
- **Testes:** assinatura inválida → 401; mesmo evento reenviado não duplica efeitos (aceitação "Webhook futuro").

---

## 5. Frontend (Fase F — só depois do Checkpoint 3)

Será detalhado em `docs/plans/frontend.md` via `writing-plans` quando o backend estiver pronto. Diretrizes já fixadas:
- `apps/web`: Next.js (App Router) + React + TypeScript; consome **apenas** a API; reusa `packages/contracts`.
- Skill `frontend-design` para direção visual; mobile primeiro (atendente usa celular).
- Telas: login → lista de leads (busca/filtros) → detalhe do lead (histórico, tarefas, botão "Abrir no WhatsApp") → fila de retornos (pendentes/vencidas/hoje) → painel resumo.
- F1 base/auth · F2 leads e funil · F3 retornos · F4 painel · F5 testes Playwright do fluxo principal (opcional) e deploy.
- Checkpoint ao fim de cada par de fases.

---

## 6. Como rodar (prompts mínimos)

Pré-requisitos do usuário: Docker, Node LTS, plugin Superpowers instalado, `jq` (para o hook).

| Sessão | Prompt único para colar no Claude Code |
|---|---|
| 1 | `Leia spec.md e execute a Fase 0 e as fases B0–B2 seguindo o §3. Pare no CHECKPOINT 1.` |
| 2 | `/clear` → `Leia CLAUDE.md, docs/progress.md e spec.md §4 (B3–B5). Execute até o CHECKPOINT 2.` |
| 3 | `/clear` → `Leia CLAUDE.md, docs/progress.md e spec.md §4 (B6–B9). Execute até o CHECKPOINT 3.` |
| 4+ | Frontend: `Leia spec.md §5, gere docs/plans/frontend.md com writing-plans e execute F1–F2.` |

Se algo bloquear (credencial ausente, decisão do usuário necessária), o orchestrator registra em `progress.md`, faz o máximo possível do resto do bloco e para com uma pergunta objetiva.

---

## Apêndice A — `CLAUDE.md`

```markdown
# ZapResponse — instruções do projeto

## Regras
- NUNCA executar git que altere estado (commit, push, reset, rebase, merge, checkout, switch, branch, tag, stash, clean, restore, cherry-pick, revert, worktree). Só leitura: status, diff, log, show. O usuário commita.
- Skills Superpowers: substituir todo "commit" por "atualizar docs/progress.md". Não usar using-git-worktrees. Não reabrir brainstorming: spec.md é o design aprovado.
- Escopo = spec.md. Fora do escopo vai para docs/backlog.md.
- Conferir versão/doc oficial antes de usar uma lib; registrar em docs/decisions.md.
- organizationId vem SEMPRE da sessão, nunca do cliente. Todo repositório recebe organizationId.
- TDD sempre. Nada é "pronto" sem saída verde de: npm run check && npm run lint && npm run test && npm run build.

## Contexto rápido
- Monorepo npm workspaces: apps/server (Fastify, Zod, Pino, Drizzle, PostgreSQL), packages/contracts (Zod compartilhado), apps/web (Next.js, depois).
- Estado atual: docs/progress.md. Plano do bloco: docs/plans/.

## Economia
- Ler só o necessário. Resumir logs. Não pedir confirmação entre tarefas do mesmo bloco; parar só em CHECKPOINT.
```

## Apêndice B — `.claude/agents/`

`architect.md`
```markdown
---
name: architect
description: Revisa planos, schema e contratos antes da implementação. Somente leitura.
tools: Read, Grep, Glob
model: opus
---
Você revisa o plano do bloco contra spec.md e o documento do produto. Aponte: lacunas de requisito, riscos de isolamento entre organizações, problemas de integridade no schema, tarefas grandes demais (quebrar em ≤ 30 min), dependências fora de ordem. Responda em lista curta: [crítico]/[importante]/[sugestão]. Não escreva código. Não execute git.
```

`db-engineer.md`
```markdown
---
name: db-engineer
description: Schema Drizzle, enums, constraints, índices, migrations e seed do ZapResponse.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---
Implemente somente a tarefa recebida. Use TDD (skill test-driven-development). Toda tabela comercial tem organization_id; use FKs compostas (organization_id, lead_id). Gere migrations com npm run db:generate e aplique no banco de teste. Nunca edite migration já aplicada: gere outra. Nunca execute git que altere estado. Ao terminar, devolva: arquivos alterados, comandos rodados e resultado.
```

`backend-implementer.md`
```markdown
---
name: backend-implementer
description: Implementa rotas, serviços e plugins Fastify do ZapResponse com TDD.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---
Implemente somente a tarefa recebida, com TDD (teste falhando primeiro). Padrão por módulo: routes.ts (Zod via packages/contracts) → service.ts (regras) → repository.ts (Drizzle, organizationId obrigatório). organizationId vem de request.tenant, nunca do cliente. Erros no formato { error: { code, message, details? } }. Use systematic-debugging se um teste falhar sem causa óbvia. Nunca execute git que altere estado. Ao terminar, devolva: arquivos alterados, testes adicionados, saída resumida dos comandos.
```

`security-reviewer.md`
```markdown
---
name: security-reviewer
description: Revisa segurança e isolamento multi-tenant. Não altera código.
tools: Read, Grep, Glob, Bash
model: opus
---
Verifique: toda rota privada exige sessão; nenhum organizationId vindo do cliente é usado para autorizar; toda query filtra por organização; assignedTo pertence à org; logs com redact; respostas de erro sem stack/segredos; CORS restrito; limites de tamanho e paginação; segredos só em env. Pode rodar testes (npm run test), nunca git que altere estado. Entregue lista [crítico]/[importante]/[sugestão] com arquivo:linha.
```

`test-verifier.md`
```markdown
---
name: test-verifier
description: Roda check, lint, test e build e devolve um resumo curto.
tools: Bash, Read
model: haiku
---
Rode, nesta ordem: npm run check, npm run lint, npm run test, npm run build. Não corrija nada. Responda em no máximo 15 linhas: status de cada comando, número de testes, e as 3 primeiras mensagens de erro relevantes com arquivo:linha. Nunca execute git que altere estado.
```

`frontend-implementer.md` (usar só na Fase F)
```markdown
---
name: frontend-implementer
description: Implementa telas Next.js do ZapResponse consumindo apenas a API.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---
Implemente somente a tarefa recebida. Consuma a API via cliente HTTP em apps/web/src/lib; reuse tipos de packages/contracts; nunca acesse o banco. Siga a skill frontend-design. Mobile primeiro. Nunca execute git que altere estado.
```

## Apêndice C — Bloqueio de git (o usuário instala)

`.claude/hooks/block-git.sh`
```bash
#!/usr/bin/env bash
# Bloqueia comandos git que alteram estado. Permite status/diff/log/show.
# Requer jq. Exit 2 = bloqueia e devolve a mensagem ao Claude.
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]|$)'; then
  if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(commit|push|reset|rebase|merge|checkout|switch|branch|tag|stash|clean|restore|cherry-pick|revert|worktree|am|init|rm|mv|pull|fetch|gc|filter-branch|update-ref)([[:space:]]|$)'; then
    echo "Bloqueado: operações git que alteram estado exigem permissão do usuário. Sugira o comando/mensagem e aguarde." >&2
    exit 2
  fi
fi
exit 0
```

`.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/block-git.sh\"" }
        ]
      }
    ]
  }
}
```
Teste rápido: peça ao Claude `git status` (deve funcionar) e `git commit -m test` (deve ser bloqueado).
O filtro é conservador de propósito: pode bloquear algum falso positivo (ex.: `git log --grep commit`); nesse caso, rode você mesmo.
