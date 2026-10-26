import { buildApp } from './app.js';
import { loadEnv } from './env.js';

/**
 * Bootstrap do processo: valida o ambiente, monta a aplicação, abre o socket e desliga
 * limpo. Nenhuma regra de negócio mora aqui — o que `buildApp` não faz, não é função do
 * servidor.
 *
 * `loadEnv` (e não `parseEnv`) porque aqui o certo é encerrar com código 1 e um relatório
 * legível: subir com ambiente inválido só adia a falha para um ponto pior.
 */
const env = loadEnv();
const app = await buildApp({ env });

/**
 * Guarda de re-entrância do desligamento. Um orquestrador pode mandar `SIGTERM` e, sem
 * resposta rápida, mandar outro; e `Ctrl+C` repetido faz o mesmo. Dois `app.close()`
 * concorrentes fechariam o pool duas vezes, e o segundo rejeita.
 */
let closing = false;

/**
 * Desligamento limpo. `app.close()` roda os hooks `onClose` — é o que fecha o pool do
 * Postgres em vez de deixar o Postgres colher as conexões por timeout.
 *
 * `SIGINT` é o Ctrl+C do desenvolvimento; `SIGTERM` é o que um orquestrador manda antes do
 * `SIGKILL`. Os dois recebem o mesmo tratamento.
 *
 * Sem `process.exit`: fechado o socket e o pool, não sobra handle e o processo sai sozinho
 * com código 0 — e o logger tem tempo de dar flush (em `development` o `pino-pretty` roda
 * em worker, e um `exit` imediato perderia as últimas linhas).
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) {
      app.log.warn({ signal }, 'sinal repetido durante o desligamento, ignorado');
      return;
    }
    closing = true;

    // IIFE assíncrona com `void`: o listener de sinal é síncrono, e devolver uma promise
    // para ele seria uma promise sem dono (`no-misused-promises`).
    void (async () => {
      app.log.info({ signal }, 'sinal recebido, desligando');
      try {
        await app.close();
      } catch (error) {
        // Sem este try/catch, um `pool.end()` que rejeita vira unhandled rejection: o
        // processo morre sem log nenhum, justamente no caso em que o log é a única pista.
        app.log.error({ err: error }, 'falha ao desligar limpo');
        process.exitCode = 1;
      }
    })();
  });
}

try {
  // `0.0.0.0` e não o default `localhost`: dentro de um container, escutar só no loopback
  // deixa o servidor inalcançável de fora dele.
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error({ err: error }, 'falha ao abrir o socket do servidor');
  // `exitCode` + `close()` em vez de `process.exit(1)`: o `close()` dá flush no logger, e
  // o processo sai com 1 quando o loop esvaziar. Com `exit` imediato, a linha acima pode
  // nunca chegar ao stdout.
  process.exitCode = 1;
  try {
    await app.close();
  } catch (closeError) {
    app.log.error({ err: closeError }, 'falha ao fechar após erro de listen');
  }
}
