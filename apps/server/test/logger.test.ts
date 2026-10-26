import { pino, type LoggerOptions } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildLoggerOptions } from '../src/logger.js';

/**
 * Logger de teste com as opções **reais** de `buildLoggerOptions` (é o `redact` de
 * produção que está sob teste) e destino em memória: a saída é inspecionada pelo teste e
 * não polui o stdout da suíte.
 *
 * `NODE_ENV: 'test'` também evita o transport `pino-pretty`, que escreveria em um worker
 * em vez do destino passado aqui.
 */
function loggerEmMemoria(): { logger: pino.Logger; saida: () => string } {
  const linhas: string[] = [];
  const opcoes = buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }) as LoggerOptions;
  const logger = pino(opcoes, {
    write: (linha: string) => {
      linhas.push(linha);
    },
  });
  return { logger, saida: () => linhas.join('') };
}

describe('redact do logger', () => {
  it('censura authorization e cookie sob a chave headers', () => {
    const { logger, saida } = loggerEmMemoria();
    logger.info(
      { headers: { authorization: 'Bearer token-canario', cookie: 'sessao=canario' } },
      'requisicao',
    );
    const texto = saida();
    expect(texto).not.toContain('Bearer token-canario');
    expect(texto).not.toContain('sessao=canario');
    expect(texto).toContain('[REDACTED]');
  });

  it('censura chave sensível no topo do objeto logado', () => {
    const { logger, saida } = loggerEmMemoria();
    logger.info({ password: 'TOPO' }, 'cadastro');
    const texto = saida();
    expect(texto).not.toContain('TOPO');
    expect(texto).toContain('[REDACTED]');
  });

  it('censura chave sensível um nível abaixo', () => {
    const { logger, saida } = loggerEmMemoria();
    logger.info({ dados: { token: 'token-canario' } }, 'webhook');
    const texto = saida();
    expect(texto).not.toContain('token-canario');
    expect(texto).toContain('[REDACTED]');
  });
});
