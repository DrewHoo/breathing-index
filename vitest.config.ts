import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The worker's geo module is plain TypeScript with no Workers types in it
    // (worker/src/geo.ts says why), so its tests run here beside everything
    // else rather than needing a second runner. tests/ holds the checks on
    // committed artifacts (the /coverage station layers and projections).
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
