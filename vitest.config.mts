import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Unit tests run in plain Node — no jsdom, no Next runtime.
 * The `@/*` alias mirrors tsconfig.json so tests can import route handlers and
 * lib modules exactly the way the app does.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
})
