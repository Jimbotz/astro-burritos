// Lets Node (≥ 22.18, which strips TypeScript types natively) run the project's .ts files as they are written:
// relative imports without an extension (`./annual-rules`) resolve to the .ts file. Type-only `@/` imports are erased
// by Node before resolution, so they never reach this hook.
// Use: node --import ./scripts/ts-resolve.mjs scripts/threshold-sensitivity.ts
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../')
    if (relative && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
      try { return nextResolve(`${specifier}.ts`, context) } catch { /* fall through to the default resolution */ }
    }
    return nextResolve(specifier, context)
  },
})
