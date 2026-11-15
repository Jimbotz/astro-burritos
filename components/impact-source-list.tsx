import { BookOpenCheck } from 'lucide-react'
import type { ImpactSource } from '@/lib/api/impact-types'

const STATUS: Record<ImpactSource['status'], string> = { 'in-use': 'In use', method: 'Method', optional: 'Optional' }
const LENS: Record<string, string> = { core: 'core analysis', water: 'water lens', heat: 'heat lens' }

// "Sources & methods" (IMPLEMENTACION_LENTES_IMPACTO §12): which source each lens uses, with product, URL, retrieval
// date, coverage, resolution, authentication, transformations and limits, all from the manifests.
export function ImpactSourceList({ sources }: { sources: ImpactSource[] }) {
  return <details className="info-details impact-sources">
    <summary><BookOpenCheck size={16} /> Sources &amp; methods</summary>
    <div className="evidence-table-wrap">
      <table className="evidence-table">
        <thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Use</th></tr></thead>
        <tbody>{sources.map((source) => <tr key={source.sourceId}><th scope="row">{source.provider}</th><td>{STATUS[source.status]}{source.lenses.length ? ` · ${source.lenses.map((lens) => LENS[lens]).join(', ')}` : ''}</td><td>{source.use.en}</td></tr>)}</tbody>
      </table>
    </div>
    <ul className="impact-source-details">
      {sources.map((source) => <li key={source.sourceId}>
        <p><strong>{source.product}</strong></p>
        <p>{source.url ? <a className="source-link" href={source.url} target="_blank" rel="noreferrer">{source.url.replace(/^https?:\/\//, '').slice(0, 60)} <span>↗</span></a> : null}</p>
        <p>Retrieved {source.retrievedAt} · coverage {source.coverage.start} to {source.coverage.end} · {source.resolution} · {source.accessMode === 'public-api' ? 'public API' : source.accessMode === 'method' ? 'method reference' : 'bundled public snapshot'} · authentication required: no{source.checksum ? ` · SHA-256 ${source.checksum.slice(0, 12)}…` : ''}</p>
        {source.transformations.length > 0 && <p>Transformations: {source.transformations.map((item) => item.en).join(' ')}</p>}
        {source.limitations.length > 0 && <p>Limits: {source.limitations.map((item) => item.en).join(' ')}</p>}
      </li>)}
    </ul>
  </details>
}
