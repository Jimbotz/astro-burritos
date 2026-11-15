import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Next.js recommended setup (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Python audit scripts and saved responses, not app code.
    'docs/**',
    'tests/fixtures/**',
    // HyperFrames demo video, not app code.
    'video/**',
  ]),
])

export default eslintConfig
