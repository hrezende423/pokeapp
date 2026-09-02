import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier/flat'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'public/data', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  /*
    THE PAINTED GENDER ICONS ARE EVOLUTION-CHART-ONLY, and this is what enforces
    it rather than a comment in the module.

    src/modules/pokedex/evoGenderIcon.ts wraps icon-male.png / icon-female.png,
    which are a distinct visual register from any general-purpose gender glyph and
    must not become one. Importing it anywhere outside the evolution chart is a
    lint error; the override below is the entire allowlist, so widening the scope
    is a deliberate edit to this file and shows up in review.

    Matched on the specifier the way callers actually write it -- relative within
    the pokedex module, path-suffixed from anywhere else.
  */
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/evoGenderIcon', '**/evoGenderIcon.ts'],
              message:
                'The painted male/female icons are scoped to the evolution chart. They are a different visual register from the app gender affordance and must not be reused as a general gender glyph. If the chart genuinely needs a new caller, add it to the allowlist in eslint.config.js.',
            },
          ],
        },
      ],
    },
  },
  {
    // The allowlist. Nothing else may reach the painted gender icons.
    files: ['src/modules/pokedex/EvolutionTree.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },
)
