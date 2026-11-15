/** Cached server-side reads of the bundled impact data (data/impact/, traced into /api/impact by next.config.mjs). */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = new Map<string, Promise<unknown>>()

/** `relative` is inside data/impact/ (e.g. "derived/smn-stations.json"); the fixed prefix keeps the file trace scoped. */
export function readBundled<T>(relative: string, root = process.cwd()): Promise<T> {
  const file = path.join(root, 'data', 'impact', relative)
  let pending = files.get(file)
  if (!pending) {
    pending = readFile(file, 'utf8').then((text) => JSON.parse(text))
    pending.catch(() => files.delete(file))
    files.set(file, pending)
  }
  return pending as Promise<T>
}

/** Same as readBundled, but null when the file does not exist (a source not bundled for that area). */
export async function readOptional<T>(relative: string, root = process.cwd()): Promise<T | null> {
  try { return await readBundled<T>(relative, root) } catch { return null }
}
