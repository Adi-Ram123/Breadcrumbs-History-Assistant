import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Local-time formatting is tested in the timezone the fixtures use.
    env: { TZ: 'America/Chicago' },
  },
});
