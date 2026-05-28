import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files:   ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any':                'error',
      '@typescript-eslint/no-floating-promises':            'error',
      '@typescript-eslint/no-unused-vars':                  ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports':         ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/prefer-nullish-coalescing':       'warn',
      '@typescript-eslint/prefer-optional-chain':           'error',
      'no-console':                                         ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
