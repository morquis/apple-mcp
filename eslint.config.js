import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'build/**', 'node_modules/**', 'tests/**', '**/*.test.ts'],
  },
  {
    files: ['index.ts', 'tools.ts', 'core/**/*.ts', 'utils/**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': ts },
    rules: {},
  },
];
