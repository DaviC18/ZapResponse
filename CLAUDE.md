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
