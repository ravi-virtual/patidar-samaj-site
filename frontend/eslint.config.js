import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      // Auth tokens must never live in JS-accessible storage (only the non-sensitive theme cache may).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.property.name=/^(localStorage|sessionStorage)$/][callee.property.name=/^(setItem)$/][arguments.0.value=/token|session|auth|password/i]",
          message: 'Do not store tokens, sessions or credentials in browser storage.',
        },
      ],
    },
  },
  {
    // Plain browser scripts served as-is from public/ (run before React).
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }] },
  },
  {
    // Test harness components live next to the specs that use them.
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
