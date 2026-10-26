import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgres://zap:zap@localhost:5433/zapresponse_test',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3001, http://localhost:3002',
  LOG_LEVEL: 'silent',
};

describe('parseEnv', () => {
  it('converte PORT para número', () => {
    expect(parseEnv(valid).PORT).toBe(3000);
  });

  it('divide CORS_ORIGINS por vírgula e remove espaços', () => {
    expect(parseEnv(valid).CORS_ORIGINS).toEqual([
      'http://localhost:3001',
      'http://localhost:3002',
    ]);
  });

  it('rejeita CORS_ORIGINS vazio em vez de liberar qualquer origem', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: '' })).toThrow();
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: ' , ' })).toThrow();
  });

  // `*` não é origem: o `@fastify/cors` o trata como wildcard, então aceitá-lo aqui
  // transformaria a configuração em "libera qualquer origem" — exatamente o que o refine
  // de lista vazia já existe para impedir.
  it('recusa CORS_ORIGINS com o wildcard "*"', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('recusa a lista inteira quando uma entrada do meio é "*"', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: 'http://localhost:3000,*' })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('recusa entrada sem protocolo', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: 'localhost:3000' })).toThrow(/CORS_ORIGINS/);
  });

  it('a mensagem de erro de CORS_ORIGINS diz qual entrada é inválida', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: 'http://localhost:3000,*' })).toThrow(/\*/);
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: 'localhost:3000' })).toThrow(/localhost:3000/);
  });

  it('aceita origens http/https absolutas e preserva a ordem', () => {
    expect(
      parseEnv({ ...valid, CORS_ORIGINS: 'http://localhost:3000,https://app.exemplo.com' })
        .CORS_ORIGINS,
    ).toEqual(['http://localhost:3000', 'https://app.exemplo.com']);
  });

  it('exige DATABASE_URL', () => {
    const { DATABASE_URL: _omitido, ...semBanco } = valid;
    expect(() => parseEnv(semBanco)).toThrow();
  });

  it('rejeita BETTER_AUTH_SECRET curto', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'curto' })).toThrow();
  });

  it('rejeita NODE_ENV desconhecido', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'staging' })).toThrow();
  });
});
