import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { AppError, type ErrorResponseBody } from '../src/shared/errors.js';

const MENSAGEM_CANARIO = 'mensagem-interna-que-nao-pode-vazar';
const DETALHE_CANARIO = 'detalhe-que-nao-pode-vazar';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  // As rotas nascem aqui, e não em `app.ts`: o alvo é o error-handler da instância raiz
  // (registrado com `fastify-plugin`, logo vale para rotas declaradas depois dele), e um
  // `AppError` 5xx não precisa existir na superfície da aplicação para ser testado.
  app.get('/__test/apperror-500', () => {
    throw new AppError({
      code: 'FALHA_INTERNA_QUALQUER',
      message: MENSAGEM_CANARIO,
      statusCode: 500,
      details: { interno: DETALHE_CANARIO },
    });
  });
  app.get('/__test/apperror-409', () => {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Esse número já está cadastrado.',
      statusCode: 409,
    });
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('AppError no contrato de erro', () => {
  it('AppError 5xx não devolve a mensagem interna nem os details', async () => {
    const res = await app.inject({ method: 'GET', url: '/__test/apperror-500' });
    expect(res.statusCode).toBe(500);
    const body = res.json<ErrorResponseBody>();
    expect(res.payload).not.toContain(MENSAGEM_CANARIO);
    expect(res.payload).not.toContain(DETALHE_CANARIO);
    expect(body.error.details).toBeUndefined();
    expect(res.payload).not.toMatch(/at .*\.ts:\d+/);
    // O `code` é identificador nosso (contrato público), não segredo: continua saindo.
    expect(body.error.code).toBe('FALHA_INTERNA_QUALQUER');
  });

  it('AppError 4xx continua devolvendo a mensagem escrita para o cliente', async () => {
    const res = await app.inject({ method: 'GET', url: '/__test/apperror-409' });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorResponseBody>()).toEqual({
      error: { code: 'CONFLICT', message: 'Esse número já está cadastrado.' },
    });
  });
});
