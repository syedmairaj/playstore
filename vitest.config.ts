import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @/ imports to src/ — mirrors tsconfig.json paths
      '@': path.resolve(__dirname, './src'),
      // Prevent 'server-only' from throwing in the test environment
      'server-only': path.resolve(__dirname, './src/mocks/server-only-mock.ts'),
      // @google/generative-ai was replaced by @google/genai; stub it so tests
      // that transitively import the old package don't fail to collect.
      '@google/generative-ai': path.resolve(__dirname, './src/mocks/google-generative-ai-mock.ts'),
    },
  },
  test: {
    // Inject describe/it/expect/vi globally so test files written without
    // explicit vitest imports still work.
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/oldnode_modules/**',
      '**/.{git,svn,hg}/**',
      '**/dist/**',
      '**/.next/**',
      // Files using the Node.js built-in test runner (node:test) — not compatible
      // with vitest and must be run separately via `node --test`.
      '**/__tests__/competitor-isolation.test.ts',
      '**/keywords/__tests__/serper-package-match.test.ts',
      '**/keywords/__tests__/serper-deep-rank-supplement.test.ts',
      '**/keywords/__tests__/format-rank-display.test.ts',
      '**/validation/__tests__/keyword-serper-save-body.test.ts',
      '**/competitors/__tests__/competitor-initials.test.ts',
      // Live integration tests that require real API keys / DB connections —
      // run separately in a real environment, not in the unit-test suite.
      '**/integration/validator-snapshots.test.ts',
    ],
  },
});
