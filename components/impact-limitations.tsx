import { Ban, ShieldQuestion } from 'lucide-react'
import type { Bilingual } from '@/lib/api/impact-types'

// What the lens cannot conclude and its limits, both from the backend, closing with the §17 statement.
export function ImpactLimitations({ cannotConclude, limitations, finalStatement }: { cannotConclude: Bilingual[]; limitations: Bilingual[]; finalStatement: Bilingual }) {
  return <section className="impact-limits" aria-label="Limitations">
    <div>
      <h4><Ban size={16} aria-hidden="true" /> What this lens cannot conclude</h4>
      <ul>{cannotConclude.map((item) => <li key={item.en}>{item.en}</li>)}</ul>
    </div>
    <div>
      <h4><ShieldQuestion size={16} aria-hidden="true" /> Limitations</h4>
      <ul>{limitations.map((item) => <li key={item.en}>{item.en}</li>)}</ul>
    </div>
    <p className="impact-final">{finalStatement.en}</p>
  </section>
}
