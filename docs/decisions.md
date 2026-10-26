# Decisões técnicas — ZapResponse

Registro de decisões e versões. Cada entrada traz data, decisão e motivo.

## 2026-10-26 — Versões verificadas no npm (Fase 0)

Verificadas com `npm view <pkg> version` em 2026-10-26.

| Pacote | Última no npm | Versão adotada | Motivo |
|---|---|---|---|
| node | 24.18.0 (local) | 24.x LTS | Runtime local já instalado |
| typescript | 7.0.2 | **6.0.3** | Ver "TypeScript 6 em vez de 7" abaixo |
| tsx | 4.23.15 | 4.23.15 | Dev runner |
| vitest | 5.0.5 | 5.0.5 | Testes |
| vite | 8.3.5 | 8.3.5 | Peer de vitest 5 (`^6.4.0 \|\| ^7 \|\| ^8`) |
| fastify | 5.12.7 | 5.12.7 | HTTP |
| zod | 4.6.7 | 4.6.7 | Validação |
| fastify-type-provider-zod | 7.0.0 | 7.0.0 | Peers: fastify `^5.5.0`, zod `>=4.1.5` — compatíveis |
| pino | 10.4.0 | 10.4.0 | Logger (nativo do Fastify) |
| pino-pretty | 13.2.0 | 13.2.0 | Só em dev |
| drizzle-orm | 0.45.4 | 0.45.4 | ORM |
| drizzle-kit | 0.31.11 | 0.31.11 | Migrations |
| pg | 8.23.1 | 8.23.1 | Driver Postgres (peer de drizzle-orm `>=8` e de better-auth `^8.0.0`) |
| @fastify/helmet | 13.2.0 | 13.2.0 | Headers de segurança |
| @fastify/cors | 11.3.1 | 11.3.1 | CORS |
| @fastify/rate-limit | 11.2.1 | 11.2.1 | Rate limit |
| eslint | 10.13.0 | 10.13.0 | Lint (flat config) |
| typescript-eslint | 8.72.0 | 8.72.0 | Peers: eslint `^8.57 \|\| ^9 \|\| ^10`, typescript `>=4.8.4 <6.1.0` |
| prettier | 3.9.10 | 3.9.10 | Format |
| eslint-config-prettier | 10.1.8 | 10.1.8 | Desliga regras de estilo conflitantes |
| globals | 17.13.0 | 17.13.0 | Globals para flat config |
| @types/node | 26.6.5 | 26.6.5 | Peer de vitest 5: `^22 \|\| >=24` |
| better-auth | 1.7.13 | a decidir na B3 | Peers relevantes: `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1`, `drizzle-kit >=0.31.4`, `pg ^8.0.0` — compatíveis com as versões acima |

### TypeScript 6 em vez de 7 (decisão principal da Fase 0)

- `typescript@7.0.2` é a `latest` no npm.
- `typescript-eslint@8.72.0` (inclusive a canary `8.72.1-alpha.15`) declara o peer
  `typescript: ">=4.8.4 <6.1.0"`. Não existe release de `typescript-eslint` que
  suporte TypeScript 7 nesta data.
- O spec (§1) exige `npm run lint` verde como critério de pronto de toda fase, e o
  valor do lint com tipos (`typescript-eslint` com `projectService`) é alto num
  projeto multi-tenant (ex.: `no-floating-promises`, `no-misused-promises`).
- **Decisão:** fixar `typescript@6.0.3` (última estável da linha 6, dentro do peer).
  Revisitar quando `typescript-eslint` publicar suporte a TS 7.
- Alternativa descartada: usar TS 7 e abandonar o lint com tipos.

### Driver Postgres: `pg` (e não `postgres`)

`better-auth` declara peer `pg: ^8.0.0`; `drizzle-orm` aceita os dois. Usar `pg`
evita um segundo driver quando o Better Auth entrar na B3.

### Drizzle dentro de `apps/server`

Conforme spec §1: o frontend nunca acessa o banco; só os contratos Zod são
compartilhados, via `packages/contracts`.

## 2026-10-26 — Decisões vindas da revisão `architect` do plano B0–B2

Contexto completo e motivos em `docs/progress.md` (Rulings 7 a 20).

- **`UNIQUE (organization_id, phone)` em `leads`: adotado.** O spec B2 pedia essa
  decisão explicitamente. Dois leads com o mesmo telefone na mesma organização
  são a mesma pessoa e deixariam o funil ambíguo; organizações diferentes podem
  ter o mesmo telefone sem conflito. Caso de borda (lead `lost` que volta) em
  `backlog.md`.
- **Telefone: escopo BR apenas (DDI 55).** `normalizePhone` assume o DDI quando
  ausente, descarta o `0` de operadora, aceita 10 dígitos (fixo) ou 11 (celular)
  após o DDD, e **rejeita** número de outro país. A ambiguidade entre o DDI `55`
  e o DDD `55` é resolvida pelo comprimento total de dígitos: só 12 ou 13 dígitos
  tratam o `55` inicial como DDI. O DDD é validado estruturalmente (`[1-9][1-9]`),
  sem a lista da Anatel.
  **Consequência a lembrar:** como `leads` tem `UNIQUE (organization_id, phone)`
  e o telefone é armazenado já normalizado, qualquer mudança futura nessa regra
  deixa de ser troca de código e passa a exigir **migração dos dados existentes**.
- **`createdBy`, `completedBy` e `assignedTo` usam FK composta contra
  `memberships (organization_id, user_id)`**, não FK simples para `users.id`. Sem
  isso, um usuário da organização B podia ser gravado como autor de uma atividade
  da organização A — vazamento de identidade entre tenants pelo histórico.
- **Sem exclusão física de `users` e `memberships` na v1.** As cinco FKs
  compostas ficam em `NO ACTION`: `ON DELETE SET NULL` multicoluna anularia
  `organization_id`, que é `NOT NULL`, e a sintaxe `SET NULL (coluna)` do PG 15+
  não é exposta pelo drizzle 0.45.4.
- **`activities` não tem `updatedAt`.** Atividade é registro de log, imutável
  depois de criada. É uma divergência deliberada do "+ `createdAt`/`updatedAt`"
  genérico de `spec.md:196`.
- **A primeira migration (Tarefa 8 / fase B2) é provisória.** O spec exige
  alinhar as tabelas do Better Auth antes da primeira migration *definitiva*, mas
  a adoção do Better Auth é entrega da B3. A B3 vai acrescentar `user`, `session`,
  `account`, `verification` e, se o plugin `organization` for adotado, substituir
  `organizations`/`memberships`.
- **Índice extra `activities (organization_id, lead_id, created_at desc)`**, além
  dos três que o spec B2 exige: é a consulta mais quente da B4/B5 (`GET /leads/:id`
  com o histórico).
- **Limite de requisições é parâmetro de `buildApp` (`rateLimitMax`), não variável
  de ambiente.** O spec B0 fixa as 8 chaves de `.env.example`; uma nona seria
  desvio de escopo. Default 100/minuto.
- **`noEmitOnError: true`** em `tsconfig.base.json`: sem ele, um build com erro de
  tipo ainda emitia `dist`.
- **Um único `tsconfig.json` por workspace**, sem `tsconfig.build.json`. Dois
  configs com o mesmo `outDir` teriam `rootDir` inferido diferente e os layouts
  colidiriam; e o `tsconfig.json` da raiz referencia o workspace, não o config de
  build, então `tsc -b` nunca o executaria.
- **`check` é `tsc -b`, `build` é `tsc -b --force`.** Rodando depois do `check`,
  um `tsc -b` incremental não verificaria nada e reportaria sucesso vazio.

## Pendentes (decidir na fase indicada)

- **B2** — `UNIQUE (organization_id, phone)` em `leads`: adotar ou não (spec B2).
- **B3** — plugin `organization` do Better Auth **ou** tabela `memberships` própria
  (spec §1 e B3). Se o plugin for adotado, as tabelas dele substituem
  `organizations`/`memberships`.
