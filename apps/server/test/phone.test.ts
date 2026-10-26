import { describe, expect, it } from 'vitest';

import { AppError, ERROR_CODES } from '../src/shared/errors.js';
import { isValidPhone, normalizePhone, toWaMeDigits } from '../src/shared/phone.js';

describe('normalizePhone', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['5511987654321', '+5511987654321'],
    ['011 11 98765 4321', '+5511987654321'],
    ['(11) 3456-7890', '+551134567890'],
  ])('normaliza %s para %s', (entrada, esperado) => {
    expect(normalizePhone(entrada)).toBe(esperado);
  });

  it.each(['', '  ', '123', '11987654321987654321', 'abcdefghijk', '+1 555 000 1111'])(
    'rejeita %s',
    (entrada) => {
      expect(() => normalizePhone(entrada)).toThrow();
      expect(isValidPhone(entrada)).toBe(false);
    },
  );

  it('é idempotente', () => {
    expect(normalizePhone(normalizePhone('(11) 98765-4321'))).toBe('+5511987654321');
  });

  it('toWaMeDigits remove o +', () => {
    expect(toWaMeDigits('+5511987654321')).toBe('5511987654321');
  });
});

describe('contrato de erro e de retorno', () => {
  it('lança AppError com code VALIDATION_ERROR e statusCode 400', () => {
    try {
      normalizePhone('123');
      expect.unreachable('normalizePhone deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(AppError);
      const appError = erro as AppError;
      expect(appError.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(appError.statusCode).toBe(400);
    }
  });

  it('isValidPhone devolve boolean e nunca lança', () => {
    expect(isValidPhone('(11) 98765-4321')).toBe(true);
    expect(isValidPhone('+1 555 000 1111')).toBe(false);
  });

  // O DDD 55 (Rio Grande do Sul) é ambíguo com o DDI 55: a desambiguação é pelo
  // comprimento total da sequência de dígitos, não pelo prefixo.
  it('trata o DDD 55 sem confundir com o DDI', () => {
    expect(normalizePhone('(55) 99876-5432')).toBe('+5555998765432');
    expect(normalizePhone('+55 55 99876-5432')).toBe('+5555998765432');
    expect(normalizePhone('5555998765432')).toBe('+5555998765432');
  });

  it('rejeita celular de 11 dígitos que não começa com 9 e DDD com zero', () => {
    expect(isValidPhone('11887654321')).toBe(false);
    expect(isValidPhone('(10) 98765-4321')).toBe(false);
  });
});
