// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    // Deterministic runs: no retries hiding flaky behaviour, no random ordering.
    retry: 0,
    sequence: { shuffle: false },
  },
});
