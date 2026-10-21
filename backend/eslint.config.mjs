import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Controllers return the response; consistent-return would fight that pattern.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      // process.env may only be read in src/config/constants.ts (mern-stack-project skill).
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Import config from src/config/constants.ts instead.' },
      ],
    },
  },
  {
    // Entry/utility scripts and the config file itself may read process.env.
    files: ['src/config/constants.ts', 'tests/**/*.ts', 'vitest.config.mts', 'eslint.config.mjs'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
