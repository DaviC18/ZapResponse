import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // dist e drizzle são gerados; lintá-los só gera ruído.
    ignores: ['**/dist/**', '**/drizzle/**', 'node_modules/**', '**/*.d.ts'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          // Este arquivo de config é .mjs e não entra em nenhum projeto do build;
          // defaultProject dá a ele as mesmas compilerOptions dos arquivos de tooling.
          allowDefaultProject: ['eslint.config.mjs'],
          defaultProject: 'tsconfig.tools.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Convenção do sublinhado: `_algo` é descarte intencional. `ignoreRestSiblings`
      // cobre a omissão de chave por desestruturação (`const { x: _x, ...resto } = o`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  prettierConfig,
);
