import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The worker's geo module is plain TypeScript with no Workers types in it
    // (worker/src/geo.ts says why), so its tests run here beside everything
    // else rather than needing a second runner.
    include: ['src/**/*.test.ts', 'worker/src/**/*.test.ts'],
  },
})
