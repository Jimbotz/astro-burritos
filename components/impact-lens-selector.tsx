import type { ImpactLens } from '@/lib/api/impact-types'
import { ImpactLogo } from '@/components/impact-logo'
import { LENS_ICONS } from '@/lib/ui/impact-icons'
import { LENS_NAME } from '@/lib/ui/impact-presentation'

const QUESTION: Record<ImpactLens, string> = {
  water: 'Persistent signals of rising atmospheric demand and falling climatic water availability?',
  heat: 'Are extremely warm days and nights intensifying, and who is exposed?',
}

// Two selectable cards; choosing one requests its endpoint. Toggle buttons (aria-pressed) work with the keyboard.
export function ImpactLensSelector({ value, onChange, disabled }: { value: ImpactLens | null; onChange: (lens: ImpactLens) => void; disabled?: boolean }) {
  return <div className="impact-lens-grid" role="group" aria-label="Impact lenses">
    {(['water', 'heat'] as const).map((lens) => {
      const Icons = LENS_ICONS[lens]
      return <button key={lens} type="button" className={`impact-lens-card is-${lens}`} aria-pressed={value === lens} disabled={disabled} onClick={() => onChange(lens)}>
        <ImpactLogo lens={lens} size={52} />
        <span className="impact-lens-text">
          <span className="impact-lens-name">{LENS_NAME[lens].title}</span>
          <span className="impact-lens-subtitle">{LENS_NAME[lens].subtitle} · {LENS_NAME[lens].sources}</span>
          <span className="impact-lens-question">{QUESTION[lens]}</span>
          <span className="impact-lens-icons" aria-hidden="true">{Icons.map((Icon, index) => <Icon key={index} size={16} />)}</span>
        </span>
      </button>
    })}
  </div>
}
