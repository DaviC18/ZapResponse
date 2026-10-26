import { AppError, ERROR_CODES } from './errors.js';

/**
 * Normalização de telefone para E.164 com escopo Brasil.
 *
 * Esta é a única fonte da regra: rotas, seed e factories devem chamar `normalizePhone`
 * em vez de reimplementar o tratamento. A tabela `leads` tem `UNIQUE (organization_id,
 * phone)`, e essa constraint só significa alguma coisa se todo telefone entrar no banco
 * na mesma forma.
 *
 * Decisões de produto fixadas aqui (escopo congelado da v1):
 * - DDI é sempre 55. Número de outro país é rejeitado, não convertido.
 * - DDI ausente é assumido como 55.
 * - Prefixo `0` de discagem nacional e código de operadora (CSP) são descartados.
 * - São aceitos 10 dígitos (fixo) ou 11 (celular) depois do DDD.
 */

/** DDI do Brasil. Único aceito na v1. */
const DDI_BR = '55';

/** Quantidade de dígitos do número nacional (DDD + assinante) aceita. */
const NACIONAL_FIXO = 10;
const NACIONAL_CELULAR = 11;

/**
 * DDD brasileiro: dois dígitos, nenhum deles `0`. Não validamos contra a lista oficial
 * de DDDs em uso de propósito — a lista muda por ato da Anatel e um número válido
 * recusado no cadastro é pior que um DDD inexistente aceito.
 */
const DDD_VALIDO = /^[1-9][1-9]$/;

/** Celular brasileiro: nono dígito `9` seguido de 8 dígitos. */
const ASSINANTE_CELULAR = /^9\d{8}$/;

/** Fixo brasileiro: primeiro dígito de 2 a 5 seguido de 7 dígitos. */
const ASSINANTE_FIXO = /^[2-5]\d{7}$/;

function invalido(motivo: string): never {
  // `message` é texto para o cliente ler: diz o que fazer, sem ecoar o número recebido
  // (o telefone é dado pessoal e a mensagem pode ir para log de cliente).
  throw new AppError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: `Telefone inválido: ${motivo}. Use o formato brasileiro, por exemplo (11) 98765-4321.`,
    statusCode: 400,
  });
}

/**
 * Reduz a entrada ao número nacional (DDD + assinante), descartando DDI, prefixo de
 * discagem e código de operadora.
 *
 * Desambiguação DDI 55 vs. DDD 55 (Rio Grande do Sul): a decisão é pelo **comprimento
 * total** da sequência de dígitos, nunca por olhar só o prefixo. Um número nacional tem
 * 10 ou 11 dígitos; com DDI tem 12 ou 13. Então `5598765432` (10 dígitos) é o fixo
 * 55 9876-5432 e `5555998765432` (13 dígitos) é o DDI 55 mais o celular do DDD 55.
 * Só retiramos o `55` da frente quando o total é 12 ou 13.
 */
function extrairNacional(entrada: string): string {
  const temMais = entrada.trimStart().startsWith('+');
  const digitos = entrada.replace(/\D/g, '');

  if (digitos.length === 0) {
    invalido('nenhum dígito na entrada');
  }

  // Com `+` o DDI é explícito: não há o que assumir nem como descartar. Fora do 55,
  // rejeitamos — converter número estrangeiro está fora do escopo da v1.
  if (temMais) {
    if (!digitos.startsWith(DDI_BR)) {
      invalido('apenas números do Brasil (+55) são aceitos');
    }
    return digitos.slice(DDI_BR.length);
  }

  // Discagem nacional: `0` + CSP de 2 dígitos + DDD + assinante. Depois de tirar o `0`,
  // sobram 12 ou 13 dígitos quando a operadora foi informada, e aí os 2 primeiros são o
  // CSP (não o DDI — quem escreve `0` está discando dentro do país).
  if (digitos.startsWith('0')) {
    const semZero = digitos.slice(1);
    return semZero.length === NACIONAL_FIXO + 2 || semZero.length === NACIONAL_CELULAR + 2
      ? semZero.slice(2)
      : semZero;
  }

  if (
    (digitos.length === NACIONAL_FIXO + DDI_BR.length ||
      digitos.length === NACIONAL_CELULAR + DDI_BR.length) &&
    digitos.startsWith(DDI_BR)
  ) {
    return digitos.slice(DDI_BR.length);
  }

  return digitos;
}

/**
 * Devolve o telefone em E.164 (`+55` + DDD + assinante).
 *
 * É idempotente: a saída desta função é entrada válida para ela mesma.
 *
 * @throws {AppError} `VALIDATION_ERROR` / 400 quando a entrada não é um telefone
 * brasileiro reconhecível.
 */
export function normalizePhone(input: string): string {
  const nacional = extrairNacional(input);

  if (nacional.length !== NACIONAL_FIXO && nacional.length !== NACIONAL_CELULAR) {
    invalido('são esperados 10 dígitos (fixo) ou 11 (celular) depois do DDD');
  }

  const ddd = nacional.slice(0, 2);
  const assinante = nacional.slice(2);

  if (!DDD_VALIDO.test(ddd)) {
    invalido('DDD inválido');
  }

  const assinanteOk =
    nacional.length === NACIONAL_CELULAR
      ? ASSINANTE_CELULAR.test(assinante)
      : ASSINANTE_FIXO.test(assinante);

  if (!assinanteOk) {
    invalido(
      nacional.length === NACIONAL_CELULAR
        ? 'celular de 11 dígitos precisa começar com 9 depois do DDD'
        : 'fixo de 10 dígitos precisa começar com 2, 3, 4 ou 5 depois do DDD',
    );
  }

  return `+${DDI_BR}${ddd}${assinante}`;
}

/**
 * Diz se a entrada é um telefone brasileiro normalizável. Nunca lança — é a versão
 * booleana de `normalizePhone`, e por isso delega a ela: a regra mora em um só lugar.
 */
export function isValidPhone(input: string): boolean {
  try {
    normalizePhone(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * E.164 sem o `+`, formato que a wa.me e a Cloud API usam no lugar do número.
 * Espera uma string já normalizada por `normalizePhone`.
 */
export function toWaMeDigits(e164: string): string {
  return e164.startsWith('+') ? e164.slice(1) : e164;
}
