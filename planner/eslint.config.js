// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// Lint rules derived from the "Power of 10" safety-critical coding rules
// (Holzmann, 2006; recalled from memory, not re-read this session: see docs/STANDARDS.md).
// Rules that cannot be expressed in ESLint are covered by review and by tests.
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', '**/dist/**', 'data/**', 'data-cache/**', 'coverage/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // P10 rule 1: simple control flow. Recursion is checked in review (docs/STANDARDS.md).
      // P10 rule 2: every loop has a fixed upper bound. `while` hides the bound, so it is banned.
      'no-restricted-syntax': [
        'error',
        { selector: 'WhileStatement', message: 'Use a for loop with an explicit upper bound (P10 rule 2).' },
        { selector: 'DoWhileStatement', message: 'Use a for loop with an explicit upper bound (P10 rule 2).' },
        { selector: 'LabeledStatement', message: 'No labels or goto-like jumps (P10 rule 1).' },
      ],
      // P10 rule 4: short functions.
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      complexity: ['error', 15],
      // P10 rule 6: smallest possible scope. No reassigning parameters, no shadowing.
      'no-param-reassign': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      // P10 rule 7: check return values and parameters. Promises must be handled.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // P10 rule 10: all warnings on, none ignored.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-console': 'error',
    },
  },
  {
    // React: the rules of hooks are not optional. Components are declarative JSX, so the
    // function-length rule is relaxed to 100 lines for .tsx only (tailoring noted in docs/STANDARDS.md).
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['packages/web/**/*.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }] },
  },
  {
    // Command-line tools print to the terminal by design.
    files: ['packages/pipeline/src/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Tests: long table-driven functions are fine, assertions are the point.
    files: ['packages/*/test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
