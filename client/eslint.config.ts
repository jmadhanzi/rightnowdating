import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files:   ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks':    reactHooks,
      'react-refresh':  reactRefresh,
      'jsx-a11y':       jsxA11y,
    },
    rules: {
      // React hooks
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript
      '@typescript-eslint/no-explicit-any':                'error',
      '@typescript-eslint/no-floating-promises':            'error',
      '@typescript-eslint/no-unused-vars':                  ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports':         ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion':           'warn',
      '@typescript-eslint/prefer-nullish-coalescing':       'warn',
      '@typescript-eslint/prefer-optional-chain':           'error',

      // Accessibility (jsx-a11y key rules)
      'jsx-a11y/alt-text':                    'error',
      'jsx-a11y/anchor-has-content':          'error',
      'jsx-a11y/aria-props':                  'error',
      'jsx-a11y/aria-proptypes':              'error',
      'jsx-a11y/aria-unsupported-elements':   'error',
      'jsx-a11y/button-has-type':             'error',
      'jsx-a11y/click-events-have-key-events':'warn',
      'jsx-a11y/heading-has-content':         'error',
      'jsx-a11y/img-redundant-alt':           'warn',
      'jsx-a11y/interactive-supports-focus':  'warn',
      'jsx-a11y/label-has-associated-control':'error',
      'jsx-a11y/no-autofocus':                'warn',
      'jsx-a11y/role-has-required-aria-props':'error',
      'jsx-a11y/tabindex-no-positive':        'error',
    },
  },
);
