import { z } from 'zod';

/**
 * Contrato de ambiente do servidor. Uma única fonte de verdade para o que o processo
 * precisa, validada antes de qualquer outra coisa subir.
 */
/**
 * Uma entrada de `CORS_ORIGINS` é válida quando é URL absoluta com protocolo http ou
 * https. A análise é delegada ao `new URL` do runtime — regex caseira de URL erra em
 * casos que o parser acerta —, e `*` cai aqui porque `new URL('*')` lança.
 */
function isHttpOrigin(origin: string): boolean {
  try {
    const { protocol } = new URL(origin);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não pode ser vazia'),
  // Só os testes usam. Em produção não existe, e a guarda de teste é quem exige.
  DATABASE_URL_TEST: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET precisa de ao menos 32 caracteres'),
  BETTER_AUTH_URL: z.url('BETTER_AUTH_URL precisa ser uma URL absoluta'),
  // Lista separada por vírgula no ambiente, `string[]` no código. As duas validações
  // existem porque CORS mal configurado não pode virar "libera qualquer origem": uma lista
  // vazia é erro de configuração, e `*` — que o @fastify/cors trata como wildcard — é
  // recusado como origem. Uma entrada ruim invalida a lista inteira: aceitar as demais e
  // descartar a inválida esconderia o erro de digitação que abriria o buraco.
  CORS_ORIGINS: z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    )
    .refine((origins) => origins.length > 0, {
      error: 'CORS_ORIGINS precisa listar ao menos uma origem',
    })
    .superRefine((origins, ctx) => {
      for (const origin of origins) {
        if (!isHttpOrigin(origin)) {
          ctx.addIssue({
            code: 'custom',
            // Só a entrada inválida aparece na mensagem; o resto do env não é impresso.
            message:
              `CORS_ORIGINS: a entrada "${origin}" não é uma origem válida. Liste origens ` +
              'absolutas com protocolo http ou https (ex.: http://localhost:3001). O ' +
              'wildcard "*" é recusado de propósito: ele libera qualquer origem.',
          });
        }
      }
    }),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida uma fonte de variáveis de ambiente e devolve o `Env` tipado.
 *
 * Função pura: recebe a fonte por argumento e **lança** `ZodError` quando inválida.
 * Nunca encerra o processo — é `loadEnv` quem faz isso. Essa separação é o que torna a
 * validação testável sem mexer em `process.env`.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

/**
 * Valida `process.env` (ou a fonte dada) na subida do processo. Em caso de erro,
 * imprime o relatório das variáveis inválidas ou faltantes em stderr e encerra com
 * código 1: subir com ambiente inválido só adia a falha para um ponto pior.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  try {
    return parseEnv(source);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // `prettifyError` (Zod 4) lista caminho e mensagem de cada issue. Os valores não
      // são impressos, só os nomes: DATABASE_URL e BETTER_AUTH_SECRET são segredos.
      console.error('Variáveis de ambiente inválidas:\n' + z.prettifyError(error));
      process.exit(1);
    }
    throw error;
  }
}
