import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Resolves the `@/` alias (tsconfig paths) so route handlers and components can be tested as they are written.
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }] },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
})
