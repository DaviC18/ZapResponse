/**
 * Códigos de erro da API. São parte do contrato público: o cliente decide o que fazer
 * pelo `code`, não pela mensagem (que é texto para humano e pode mudar).
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Erro de domínio que a API sabe traduzir em resposta. Qualquer coisa lançada que não seja
 * `AppError` é tratada como falha interna: vira 500 com mensagem genérica.
 *
 * `message` de um `AppError` é escrita para o cliente ler — nunca coloque nela detalhe
 * interno, caminho de arquivo ou segredo.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(args: { code: string; message: string; statusCode: number; details?: unknown }) {
    super(args.message);
    this.name = 'AppError';
    this.code = args.code;
    this.statusCode = args.statusCode;
    // Atribuição condicional por causa de `exactOptionalPropertyTypes`: `details: undefined`
    // não é o mesmo que ausência da propriedade.
    if (args.details !== undefined) {
      this.details = args.details;
    }
  }
}

/** Corpo de erro da API. Formato único, para toda rota e todo status. */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Monta o corpo de erro, omitindo `details` quando não há o que detalhar. */
export function toErrorResponseBody(
  code: string,
  message: string,
  details?: unknown,
): ErrorResponseBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
