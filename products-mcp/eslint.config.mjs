import { defineConfig } from 'eslint/config';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
    },

    rules: {
      'no-const-assign': 'error',
      'no-class-assign': 'error',
      'no-constructor-return': 'error',
      'no-constant-condition': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-use-before-define': 'error',
      'block-scoped-var': 'error',
      curly: 'error',
      'default-case': 'error',
      eqeqeq: 'warn',
      'max-classes-per-file': 'error',
      'no-console': 'warn',
      'no-unused-vars': [
        'error',
        {
          args: 'none',
        },
      ],
    },
  },
]);
